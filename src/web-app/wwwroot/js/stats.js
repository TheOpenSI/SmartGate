// Stats page: summary tiles, charts and the detection log, built from GET /api/stats, plus the
// Jetson's gate: its live readings (the same feed as the Live Stream page) and its saved opens / closes.
// "Safe" = animals the gate lets through; "threat" = animals it is kept closed for.
// Everything follows the time range except the gate and the last detection.

const RANGES = {
    '24h': { unit: 'hour', count: 24 },
    '7d': { unit: 'day', count: 7 },
    '30d': { unit: 'day', count: 30 },
    all: { unit: 'day', count: null },
};
const DEFAULT_RANGE = 'all';
const WEEKLY_AFTER_DAYS = 120; // "All time" groups by week once the history is longer than this
const PAGE_SIZE = 10;
const REFRESH_MS = 30000;
const LIVE_RELOAD_DELAY_MS = 1000; // a burst of updates causes one reload, not one each
const SEARCH_DELAY_MS = 250;
const MAX_SPECIES_ROWS = 8; // past this, the least detected species fold into "Other"
const SVG_NS = 'http://www.w3.org/2000/svg';
const SERIES = [['safe', 'Safe'], ['threat', 'Threat']];
const SORTS = { id: 'id', time: 'time', name: 'name', type: 'type', status: 'threat' };
const UNAVAILABLE = 'Unavailable';
const CONNECTION_LABELS = { connected: 'Connected', connecting: 'Connecting', disconnected: 'Disconnected', error: 'Error' };

// Column chart geometry, in pixels. Its height comes from its card (see .column-chart in stats.css)
const CHART = { top: 12, axisBand: 26, left: 36, right: 8, gap: 2, radius: 4 };

const countFormat = new Intl.NumberFormat();
const dateFormats = {
    hour: new Intl.DateTimeFormat(undefined, { hour: 'numeric' }),
    day: new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }),
    hourLong: new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric' }),
    dayLong: new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    dateTime: new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    clock: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }),
};

const state = {
    range: readRangeFromAddress(),
    detections: [],
    gate: null, // the Jetson's gate from the database: { gate_no, gate_no_opens, gate_no_closes, ... }
    live: { connection: { state: 'connecting', reason: null }, status: null, detection: null },
    search: '',
    sort: 'time',
    dir: 'desc',
    page: 1,
    request: 0,
};

// -------------------
// Helper Functions
// -------------------
function readRangeFromAddress() {
    const range = new URLSearchParams(window.location.search).get('range');
    return range in RANGES ? range : DEFAULT_RANGE;
}

function writeRangeToAddress() {
    history.replaceState(null, '', state.range === DEFAULT_RANGE ? window.location.pathname : `?range=${state.range}`);
}

// Builds an element; text always goes in as text, never as HTML
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function svgEl(tag, attributes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
}

const formatCount = (value) => countFormat.format(value);
const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const plural = (count, word) => `${formatCount(count)} ${word}${count === 1 ? '' : 's'}`;

function timeAgo(date) {
    const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    const days = Math.floor(seconds / 86400);
    return days === 1 ? 'Yesterday' : `${days} days ago`;
}

// The start of the hour, day or week (from Monday) that a time falls in, in the viewer's time zone
function bucketStart(date, unit) {
    const start = new Date(date);
    if (unit === 'hour') {
        start.setMinutes(0, 0, 0);
        return start;
    }
    start.setHours(0, 0, 0, 0);
    if (unit === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
}

function addUnits(date, unit, count) {
    const next = new Date(date);
    if (unit === 'hour') next.setHours(next.getHours() + count);
    else next.setDate(next.getDate() + count * (unit === 'week' ? 7 : 1));
    return next;
}

// Round the axis up to a clean whole-number step (1, 2, 5, 10, 20...)
function niceScale(maxValue) {
    if (maxValue <= 0) return { max: 4, step: 1 };
    const rough = maxValue / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough));
    return { max: Math.ceil(maxValue / step) * step, step };
}

const totalOf = (values) => values.safe + values.threat;

// headers: [{ text, numeric, sort, className }]; rows: arrays of strings, numbers or elements.
// A header's className goes on every cell in its column.
function buildTable(headers, rows, { sortable = false } = {}) {
    const table = el('table', 'data-table');
    const headRow = el('tr');
    for (const header of headers) {
        const th = el('th', header.className ?? (header.numeric ? 'num' : ''));
        th.scope = 'col';
        if (sortable && header.sort) {
            const button = el('button', 'sort-btn', header.text);
            button.type = 'button';
            button.dataset.sort = header.sort;
            th.append(button);
            th.setAttribute('aria-sort', state.sort === header.sort ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
        } else {
            th.textContent = header.text;
        }
        headRow.append(th);
    }
    const body = el('tbody');
    for (const row of rows) {
        const tr = el('tr');
        row.forEach((cell, i) => {
            const td = el('td', headers[i].className ?? (headers[i].numeric ? 'num' : ''));
            if (cell instanceof Node) td.append(cell);
            else td.textContent = typeof cell === 'number' ? formatCount(cell) : cell;
            tr.append(td);
        });
        body.append(tr);
    }
    const head = el('thead');
    head.append(headRow);
    table.append(head, body);
    return table;
}

function wrapScroll(table) {
    const wrapper = el('div', 'table-scroll');
    wrapper.append(table);
    return wrapper;
}

function fillTooltip(tooltip, title, values) {
    const rows = SERIES.map(([key, label]) => {
        const line = el('div', 'tip-row');
        line.append(el('span', `key key-${key}`), el('strong', '', formatCount(values[key])), el('span', '', label));
        return line;
    });
    tooltip.replaceChildren(el('div', 'tip-title', title), ...rows, el('div', 'tip-total', plural(totalOf(values), 'detection')));
}

// -------------------
// Working out the numbers
// -------------------
// The selected range: where it starts, and whether it is counted by hour, day or week
function currentPeriod(now = new Date()) {
    const preset = RANGES[state.range];
    if (preset.count !== null) {
        return { unit: preset.unit, start: addUnits(bucketStart(now, preset.unit), preset.unit, -(preset.count - 1)) };
    }
    if (state.detections.length === 0) return { unit: 'day', start: bucketStart(now, 'day') };
    const first = state.detections.reduce((earliest, d) => (d.time < earliest ? d.time : earliest), state.detections[0].time);
    const unit = (now - first) / 86400000 > WEEKLY_AFTER_DAYS ? 'week' : 'day';
    return { unit, start: bucketStart(first, unit) };
}

function detectionsInRange(period) {
    return state.detections.filter((d) => d.time >= period.start);
}

function countByTime(detections, period, now = new Date()) {
    const buckets = new Map();
    for (let start = period.start; start <= now; start = addUnits(start, period.unit, 1)) {
        buckets.set(start.getTime(), { start, safe: 0, threat: 0 });
    }
    for (const d of detections) {
        const bucket = buckets.get(bucketStart(d.time, period.unit).getTime());
        if (bucket) bucket[d.threat ? 'threat' : 'safe'] += 1;
    }
    return [...buckets.values()];
}

function countByHourOfDay(detections) {
    const hours = Array.from({ length: 24 }, (_, hour) => {
        const start = new Date(2000, 0, 1, hour);
        return { hour, start, safe: 0, threat: 0 };
    });
    for (const d of detections) hours[d.time.getHours()][d.threat ? 'threat' : 'safe'] += 1;
    return hours;
}

function countBySpecies(detections) {
    const species = new Map();
    for (const d of detections) {
        const row = species.get(d.name) ?? { name: d.name, safe: 0, threat: 0, endangered: false };
        row[d.threat ? 'threat' : 'safe'] += 1;
        row.endangered ||= d.endangered;
        species.set(d.name, row);
    }
    return [...species.values()].sort((a, b) => totalOf(b) - totalOf(a) || a.name.localeCompare(b.name));
}

// -------------------
// Rendering
// -------------------
function renderKpis(detections, species) {
    const total = detections.length;
    const threats = detections.filter((d) => d.threat).length;
    const endangered = detections.filter((d) => d.endangered).length;
    const both = detections.filter((d) => d.threat && d.endangered).length;
    // Newest first; detections saved at the same moment go by the order they were saved
    const latest = state.detections.reduce((last, d) => (!last || d.time - last.time > 0 || (d.time - last.time === 0 && d.id > last.id) ? d : last), null);

    const tiles = [
        ['Detections', formatCount(total), total ? `${formatCount(species.length)} species` : 'None in this time range'],
        ['Threats', formatCount(threats), total ? `${percentOf(threats, total)}% of detections` : ''],
        ['Endangered', formatCount(endangered), total ? `${percentOf(endangered, total)}% of detections${both ? ` · ${formatCount(both)} also threats` : ''}` : ''],
        ['Species', formatCount(species.length), species.length ? `Most seen: ${species[0].name} (${formatCount(totalOf(species[0]))})` : ''],
        ['Last', latest ? latest.name : 'None yet', latest ? `${timeAgo(latest.time)} · ${dateFormats.dateTime.format(latest.time)}` : 'No detections recorded'],
    ];
    for (const [name, value, note] of tiles) {
        document.getElementById(`kpi${name}`).textContent = value;
        document.getElementById(`kpi${name}Note`).textContent = note;
    }
}

// A column segment; the top segment of a column gets rounded top corners
function columnPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height);
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

// Stacked Safe / Threat columns with hover and keyboard tooltips.
// buckets: [{ safe, threat, label, title }]; labelFrom: which end the axis labels are counted from;
// labelSteps: the allowed gaps between labels (e.g. every 3 or 6 hours), the smallest that fits is used
function renderColumns(containerId, buckets, { ariaLabel, labelFrom = 'end', labelSteps = null, emptyText }) {
    const container = document.getElementById(containerId);
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0) return; // hidden; drawn when it becomes visible
    if (buckets.every((b) => totalOf(b) === 0)) {
        container.replaceChildren(el('p', 'empty', emptyText));
        return;
    }

    const { top, axisBand, left, right, gap, radius } = CHART;
    const plotWidth = width - left - right;
    const plotHeight = height - top - axisBand;
    const n = buckets.length;
    const slot = plotWidth / n;
    const barWidth = Math.max(2, Math.min(28, slot * 0.7));
    const x = (i) => left + i * slot + (slot - barWidth) / 2;
    const { max, step } = niceScale(Math.max(...buckets.map(totalOf)));
    const y = (value) => top + plotHeight - (value / max) * plotHeight;

    const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, tabindex: '0', role: 'img', 'aria-label': ariaLabel });

    // Gridlines and the y axis
    for (let value = 0; value <= max; value += step) {
        const lineY = Math.round(y(value)) + 0.5;
        svg.append(svgEl('line', { x1: left, x2: left + plotWidth, y1: lineY, y2: lineY, class: value === 0 ? 'axis-baseline' : 'gridline' }));
        const tick = svgEl('text', { x: left - 8, y: lineY, class: 'tick-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
        tick.textContent = formatCount(value);
        svg.append(tick);
    }

    // X axis labels, thinned out so they never overlap
    const fewest = Math.ceil(n / Math.max(2, Math.floor(plotWidth / 60)));
    const every = labelSteps?.find((s) => s >= fewest) ?? fewest;
    buckets.forEach((bucket, i) => {
        const fromEdge = labelFrom === 'end' ? n - 1 - i : i;
        if (fromEdge % every !== 0) return;
        const label = svgEl('text', { x: x(i) + barWidth / 2, y: top + plotHeight + 18, class: 'tick-label', 'text-anchor': 'middle' });
        label.textContent = bucket.label;
        svg.append(label);
    });

    const band = svgEl('rect', { class: 'column-band', y: top, width: slot, height: plotHeight, visibility: 'hidden' });
    svg.append(band);

    // Safe at the bottom, threat on top, with a small gap between them
    const baseline = top + plotHeight;
    buckets.forEach((bucket, i) => {
        let floor = baseline;
        const parts = SERIES.filter(([key]) => bucket[key] > 0);
        parts.forEach(([key], partIndex) => {
            const segmentTop = y(SERIES.slice(0, SERIES.findIndex(([k]) => k === key) + 1).reduce((sum, [k]) => sum + bucket[k], 0));
            const isTop = partIndex === parts.length - 1;
            const bottom = floor - (partIndex > 0 ? gap : 0);
            const segmentHeight = Math.max(1, bottom - segmentTop);
            svg.append(svgEl('path', { class: `bar-${key}`, d: columnPath(x(i), bottom - segmentHeight, barWidth, segmentHeight, isTop ? radius : 0) }));
            floor = bottom - segmentHeight;
        });
    });

    const tooltip = el('div', 'chart-tooltip');
    tooltip.hidden = true;
    let active = null;

    function showTip(i) {
        active = i;
        band.setAttribute('x', left + i * slot);
        band.setAttribute('visibility', 'visible');
        fillTooltip(tooltip, buckets[i].title, buckets[i]);
        tooltip.hidden = false;
        // Beside the column (right if there's room, otherwise left) so it doesn't cover it
        const columnRight = left + (i + 1) * slot;
        const tipWidth = tooltip.offsetWidth;
        tooltip.style.left = `${columnRight + 8 + tipWidth <= width ? columnRight + 8 : Math.max(0, left + i * slot - 8 - tipWidth)}px`;
        tooltip.style.top = `${top}px`;
    }

    function hideTip() {
        tooltip.hidden = true;
        band.setAttribute('visibility', 'hidden');
    }

    // One hit area over the whole plot; the nearest column under the pointer is shown
    const hit = svgEl('rect', { class: 'hit', x: left, y: top, width: plotWidth, height: plotHeight + axisBand });
    hit.addEventListener('pointermove', (event) => {
        const pointerX = event.clientX - svg.getBoundingClientRect().left;
        showTip(Math.min(n - 1, Math.max(0, Math.floor((pointerX - left) / slot))));
    });
    svg.append(hit);
    svg.addEventListener('pointerleave', hideTip);
    svg.addEventListener('focus', () => showTip(active ?? (labelFrom === 'end' ? n - 1 : 0)));
    svg.addEventListener('blur', hideTip);
    svg.addEventListener('keydown', (event) => {
        const current = active ?? n - 1;
        const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: n - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        showTip(Math.min(n - 1, Math.max(0, next)));
    });

    container.replaceChildren(svg, tooltip);
}

function seriesTable(firstColumn, rows) {
    return wrapScroll(buildTable(
        [{ text: firstColumn }, ...SERIES.map(([, label]) => ({ text: label, numeric: true })), { text: 'Total', numeric: true }],
        rows.map((row) => [row.title, row.safe, row.threat, totalOf(row)]),
    ));
}

function renderTimeline(detections, period) {
    const unitName = { hour: 'hour', day: 'day', week: 'week' }[period.unit];
    const buckets = countByTime(detections, period).map((bucket) => ({
        ...bucket,
        label: period.unit === 'hour' ? dateFormats.hour.format(bucket.start) : dateFormats.day.format(bucket.start),
        title: period.unit === 'hour' ? dateFormats.hourLong.format(bucket.start)
            : period.unit === 'week' ? `Week of ${dateFormats.dayLong.format(bucket.start)}` : dateFormats.dayLong.format(bucket.start),
    }));
    document.getElementById('timelineNote').textContent = `Detections per ${unitName}`;
    renderColumns('timelineChart', buckets, {
        ariaLabel: `Column chart of safe and threat detections per ${unitName}. Use the left and right arrow keys to read each ${unitName}, or choose Table view.`,
        emptyText: 'No detections in this time range.',
    });
    // The table view lists the newest first
    document.getElementById('timelineTable').replaceChildren(seriesTable(unitName[0].toUpperCase() + unitName.slice(1), [...buckets].reverse()));
}

function renderHours(detections) {
    const hours = countByHourOfDay(detections).map((bucket) => {
        const label = dateFormats.hour.format(bucket.start);
        return { ...bucket, label, title: `${label} – ${dateFormats.hour.format(new Date(2000, 0, 1, bucket.hour + 1))}` };
    });
    renderColumns('hoursChart', hours, {
        ariaLabel: 'Column chart of safe and threat detections by hour of the day. Use the left and right arrow keys to read each hour, or choose Table view.',
        labelFrom: 'start',
        labelSteps: [1, 2, 3, 6, 12],
        emptyText: 'No detections in this time range.',
    });
    document.getElementById('hoursTable').replaceChildren(seriesTable('Hour', hours));
}

function renderSpecies(species) {
    let rows = species;
    if (species.length > MAX_SPECIES_ROWS) {
        const rest = species.slice(MAX_SPECIES_ROWS - 1);
        rows = [...species.slice(0, MAX_SPECIES_ROWS - 1), {
            name: `Other (${rest.length} species)`,
            safe: rest.reduce((sum, s) => sum + s.safe, 0),
            threat: rest.reduce((sum, s) => sum + s.threat, 0),
            endangered: false,
        }];
    }

    document.getElementById('speciesTable').replaceChildren(wrapScroll(buildTable(
        [{ text: 'Species' }, { text: 'Safe', numeric: true }, { text: 'Threat', numeric: true }, { text: 'Total', numeric: true }, { text: 'Endangered' }],
        species.map((s) => [s.name, s.safe, s.threat, totalOf(s), s.endangered ? 'Yes' : 'No']),
    )));

    const chart = document.getElementById('speciesChart');
    if (rows.length === 0) {
        chart.replaceChildren(el('p', 'empty', 'No detections in this time range.'));
        return;
    }

    const largest = Math.max(...rows.map(totalOf));
    const list = el('ol', 'species-list');
    const tooltip = el('div', 'chart-tooltip');
    tooltip.hidden = true;

    const showTip = (item, row) => {
        fillTooltip(tooltip, row.name, row);
        tooltip.hidden = false;
        tooltip.style.left = '0px';
        tooltip.style.top = `${item.offsetTop + item.offsetHeight + 4}px`;
    };

    for (const row of rows) {
        const total = totalOf(row);
        const item = el('li', 'species-row');
        item.tabIndex = 0;
        item.setAttribute('aria-label', `${row.name}${row.endangered ? ', endangered' : ''}: ${row.safe} safe, ${row.threat} threat`);

        const head = el('div', 'species-head');
        const name = el('span', 'species-name', row.name);
        name.title = row.name;
        head.append(name);
        if (row.endangered) head.append(el('span', 'tag', 'Endangered'));

        const fill = el('div', 'bar-fill');
        fill.style.setProperty('--ratio', String(total / largest));
        for (const [key] of SERIES) {
            if (row[key] === 0) continue;
            const segment = el('span', `seg seg-${key}`);
            segment.style.flex = `${row[key]} 1 0`;
            fill.append(segment);
        }
        const bar = el('div', 'species-bar');
        bar.setAttribute('aria-hidden', 'true');
        bar.append(fill, el('span', 'bar-value', formatCount(total)));

        item.append(head, bar);
        item.addEventListener('pointerenter', () => showTip(item, row));
        item.addEventListener('focus', () => showTip(item, row));
        item.addEventListener('pointerleave', () => { tooltip.hidden = true; });
        item.addEventListener('blur', () => { tooltip.hidden = true; });
        list.append(item);
    }

    chart.replaceChildren(list, tooltip);
}

// --- The Jetson's gate ---
// Shows a value, or "Unavailable" (dimmed) when the Jetson isn't sending it
function showFact(id, value) {
    const element = document.getElementById(id);
    const missing = value === null || value === undefined || value === '';
    element.textContent = missing ? UNAVAILABLE : value;
    element.classList.toggle('unavailable', missing);
}

const percentText = (value) => (typeof value === 'number' ? `${value.toFixed(1)}%` : null);
const titleCase = (text) => (text ? `${text.charAt(0)}${text.slice(1).toLowerCase()}` : null);

// Opens and closes saved in the database for the Jetson's gate (JETSON_GATE_NO)
function renderGateCounts() {
    document.getElementById('gateTitle').textContent = state.gate ? `Gate ${state.gate.gate_no}` : 'Gate';
    showFact('gateOpens', state.gate ? formatCount(state.gate.gate_no_opens) : null);
    showFact('gateCloses', state.gate ? formatCount(state.gate.gate_no_closes) : null);
}

// Live readings, exactly as the Live Stream page gets them; nothing is shown once they stop
function renderLiveGate() {
    const { connection, status, detection } = state.live;
    const isLive = connection.state === 'connected' && status !== null;
    const sensors = isLive ? status.sensors : null;
    const system = isLive ? status.system : null;

    const pill = document.getElementById('gateConnection');
    pill.textContent = CONNECTION_LABELS[connection.state] ?? 'Unknown';
    pill.className = `connection-pill ${connection.state}`;
    document.getElementById('gateNote').textContent = connection.state === 'connected'
        ? 'Live from the Jetson'
        : `Not receiving live readings${connection.reason ? `: ${connection.reason}` : ''}`;

    const position = sensors?.gate_position ?? null;
    const positionElement = document.getElementById('gatePosition');
    positionElement.textContent = position ?? UNAVAILABLE;
    positionElement.className = `position ${!position ? 'is-unknown unavailable' : position === 'Open' ? 'is-open' : position === 'Closed' ? 'is-closed' : 'is-moving'}`;
    document.getElementById('gateMotor').textContent = sensors?.door_opening ? 'Motor running (opening)'
        : sensors?.door_closing ? 'Motor running (closing)'
        : sensors ? 'Motor stopped' : '';

    showFact('gateMode', titleCase(isLive ? status.gate?.mode : null));
    const motion = sensors?.pir_motion;
    showFact('gateMotion', motion === true ? 'Motion detected' : motion === false ? 'No motion' : null);

    const top = detection?.top;
    if (top) {
        showFact('gateDetection', top.name);
        const confidence = typeof top.confidence === 'number' ? `${top.confidence.toFixed(1)}% · ` : '';
        document.getElementById('gateDetectionSub').textContent = `${confidence}${timeAgo(new Date(detection.detected_at))}`;
    } else {
        showFact('gateDetection', isLive && status.model?.ready ? 'None yet' : null);
        document.getElementById('gateDetectionSub').textContent = '';
    }

    showFact('jetsonCpu', percentText(system?.cpu_percent));
    showFact('jetsonMemory', percentText(system?.memory_percent));
    showFact('jetsonTemp', typeof system?.temperature_c === 'number' ? `${system.temperature_c.toFixed(1)} °C` : null);
}

// The log: detections in the range that match the search, in the chosen order
function logRows(detections) {
    const search = state.search.toLowerCase();
    const matches = search
        ? detections.filter((d) => d.name.toLowerCase().includes(search) || d.type.toLowerCase().includes(search))
        : detections;
    const key = SORTS[state.sort];
    const direction = state.dir === 'asc' ? 1 : -1;
    return [...matches].sort((a, b) => {
        const order = typeof a[key] === 'string' ? a[key].localeCompare(b[key]) : a[key] - b[key];
        return order * direction || (b.time - a.time) || (b.id - a.id);
    });
}

function renderLog(detections) {
    const rows = logRows(detections);
    const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, lastPage);
    const pageRows = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

    document.getElementById('logNote').textContent = state.search
        ? `${plural(rows.length, 'detection')} matching “${state.search}”`
        : `${plural(rows.length, 'detection')} in this time range`;

    const container = document.getElementById('logTable');
    if (pageRows.length === 0) {
        container.replaceChildren(el('p', 'empty', state.search ? `No detections match “${state.search}”.` : 'No detections in this time range.'));
    } else {
        const tableRows = pageRows.map((d) => {
            const when = el('div');
            when.append(el('span', '', timeAgo(d.time)), el('span', 'cell-sub', dateFormats.dateTime.format(d.time)));

            const animal = el('span', 'cell-main');
            animal.append(el('span', '', d.name));
            if (d.endangered) animal.append(el('span', 'tag', 'Endangered'));

            const status = el('span', 'status');
            const dot = el('span', `dot dot-${d.threat ? 'threat' : 'safe'}`);
            dot.setAttribute('aria-hidden', 'true');
            status.append(dot, d.threat ? 'Threat' : 'Safe');

            return [`#${d.id}`, when, animal, d.type, status];
        });
        container.replaceChildren(buildTable([
            { text: 'ID', sort: 'id', className: 'id col-id' },
            { text: 'When', sort: 'time' },
            { text: 'Animal', sort: 'name' },
            { text: 'Type', sort: 'type', className: 'col-type' },
            { text: 'Status', sort: 'status' },
        ], tableRows, { sortable: true }));
    }

    const first = rows.length === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
    document.getElementById('logRange').textContent = `Showing ${first}–${Math.min(state.page * PAGE_SIZE, rows.length)} of ${formatCount(rows.length)}`;
    document.getElementById('logPrev').disabled = state.page <= 1;
    document.getElementById('logNext').disabled = state.page >= lastPage;
}

// Charts and tiles follow the range; the log also follows the search
function renderAll() {
    const period = currentPeriod();
    const detections = detectionsInRange(period);
    const species = countBySpecies(detections);
    renderKpis(detections, species);
    renderTimeline(detections, period);
    renderSpecies(species);
    renderHours(detections);
    renderGateCounts();
    renderLog(detections);
}

// -------------------
// CSV export
// -------------------
// Quote a CSV cell when needed, and stop spreadsheet apps treating text as a formula
function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const pad = (number) => String(number).padStart(2, '0');
const localStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

let exportUrl = null;

// Everything in the log (all pages), as a spreadsheet-friendly file
function prepareExport(link) {
    const rows = logRows(detectionsInRange(currentPeriod()));
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const lines = [['ID', `Time (${timeZone})`, 'Animal', 'Type', 'Status', 'Endangered'],
        ...rows.map((d) => [d.id, localStamp(d.time), d.name, d.type, d.threat ? 'Threat' : 'Safe', d.endangered ? 'Yes' : 'No'])]
        .map((cells) => cells.map(csvCell).join(','));
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
    link.href = exportUrl;
    link.download = `smartgate-detections-${state.range}.csv`;
}

// -------------------
// Loading
// -------------------
function setUpdated(ok) {
    document.getElementById('statsUpdated').classList.toggle('is-stale', !ok);
    document.getElementById('statsUpdatedText').textContent = ok
        ? `Live · updated ${dateFormats.clock.format(new Date())}`
        : 'Couldn’t refresh, trying again shortly';
}

async function loadStats() {
    const requestId = ++state.request;
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { gates, animals, jetson_gate_no: jetsonGateNo } = await response.json();
        if (requestId !== state.request) return; // a newer request replaced this one
        state.gate = gates.find((gate) => gate.gate_no === jetsonGateNo) ?? null;
        state.detections = animals.map((animal) => ({
            id: animal.animal_id,
            name: animal.animal_name,
            type: animal.animal_type,
            endangered: animal.is_endangered,
            threat: animal.is_threat,
            time: new Date(animal.time_stamp),
        }));
        renderAll();
        setUpdated(true);
    } catch (error) {
        if (requestId !== state.request) return;
        console.error('Could not load stats:', error);
        setUpdated(false);
    }
}

function reloadStats() {
    if (!document.hidden) loadStats(); // reloaded when the tab is shown again
}

// -------------------
// Controls
// -------------------
function showRangeInControls() {
    for (const button of document.querySelectorAll('.range-btn')) {
        button.setAttribute('aria-pressed', String(button.dataset.range === state.range));
    }
}

function setupControls() {
    for (const button of document.querySelectorAll('.range-btn')) {
        button.addEventListener('click', () => {
            if (button.dataset.range === state.range) return;
            state.range = button.dataset.range;
            state.page = 1;
            showRangeInControls();
            writeRangeToAddress();
            renderAll();
        });
    }

    let searchTimer;
    document.getElementById('logSearch').addEventListener('input', (event) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.search = event.target.value.trim();
            state.page = 1;
            renderLog(detectionsInRange(currentPeriod()));
        }, SEARCH_DELAY_MS);
    });

    // Clicking a column header sorts by it; clicking it again flips the order.
    // ID and time start newest first, the text columns A to Z.
    document.getElementById('logTable').addEventListener('click', (event) => {
        const button = event.target.closest('.sort-btn');
        if (!button) return;
        const sort = button.dataset.sort;
        const firstDir = ['id', 'time'].includes(sort) ? 'desc' : 'asc';
        state.dir = sort === state.sort ? (state.dir === 'asc' ? 'desc' : 'asc') : firstDir;
        state.sort = sort;
        state.page = 1;
        renderLog(detectionsInRange(currentPeriod()));
    });

    for (const [id, step] of [['logPrev', -1], ['logNext', 1]]) {
        document.getElementById(id).addEventListener('click', () => {
            state.page = Math.max(1, state.page + step);
            renderLog(detectionsInRange(currentPeriod()));
        });
    }

    const exportLink = document.getElementById('exportCsv');
    exportLink.addEventListener('click', () => prepareExport(exportLink));

    for (const card of document.querySelectorAll('.chart-card')) {
        const button = card.querySelector('.view-toggle');
        button.addEventListener('click', () => {
            const showTable = button.getAttribute('aria-pressed') !== 'true';
            button.setAttribute('aria-pressed', String(showTable));
            card.classList.toggle('show-table', showTable);
        });
    }
}

// Redraw the column charts whenever their size changes (window resize, or leaving table view)
function watchChartSizes() {
    for (const id of ['timelineChart', 'hoursChart']) {
        const container = document.getElementById(id);
        let lastSize = '';
        new ResizeObserver(() => {
            const size = `${container.clientWidth}x${container.clientHeight}`;
            if (size !== lastSize && state.request > 0) {
                lastSize = size;
                const period = currentPeriod();
                const detections = detectionsInRange(period);
                if (id === 'timelineChart') renderTimeline(detections, period);
                else renderHours(detections);
            }
        }).observe(container);
    }
}

// The site's navigation bar stays fixed at the top and is much taller on phones (its links stack),
// so the page starts below whatever height it has (see .stats-container in stats.css)
function keepClearOfHeader() {
    const header = document.querySelector('body > header');
    if (!header) return;
    const container = document.getElementById('stats');
    new ResizeObserver(() => {
        container.style.setProperty('--site-header-height', `${header.offsetHeight}px`);
    }).observe(header);
}

// Gate movements and threat alerts arrive over the live connection; several in a row cause one reload.
// The page also joins the Live Stream page's feed for the gate's live readings.
function watchLiveUpdates() {
    const socket = window.socket;
    if (!socket) return;
    let reloadTimer;
    const reloadSoon = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(reloadStats, LIVE_RELOAD_DELAY_MS);
    };
    socket.on('gate_update', reloadSoon);
    socket.on('alert_data', reloadSoon);

    socket.on('live_connection', (connection) => {
        state.live.connection = connection;
        renderLiveGate();
    });
    socket.on('live_status', (status) => {
        state.live.status = status;
        renderLiveGate();
    });
    socket.on('live_detection', (detection) => {
        state.live.detection = detection;
        renderLiveGate();
    });
    // The SmartGate web server itself is unreachable
    socket.on('disconnect', () => {
        state.live.connection = { state: 'disconnected', reason: 'Lost connection to the SmartGate web server' };
        state.live.status = null;
        renderLiveGate();
    });
    // Join the live feed on connect, and again after any reconnect
    const subscribe = () => socket.emit('live_subscribe');
    socket.on('connect', subscribe);
    if (socket.connected) subscribe();
}

keepClearOfHeader();
showRangeInControls();
setupControls();
watchChartSizes();
renderLiveGate();
watchLiveUpdates();
loadStats();

// Other detections (safe animals) don't send a live update, so check every 30 seconds too
setInterval(reloadStats, REFRESH_MS);
document.addEventListener('visibilitychange', reloadStats);
