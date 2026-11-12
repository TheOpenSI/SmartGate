// Gate analytics on the Live Stream page: the Jetson's own counts and event log
// (JETSON_LIVE_SERVICE=smartgate_nano). Every value is also shown as text or in a
// table; the hover tooltips only add detail.
const REFRESH_MS = 10000;
const RULE_LABELS = { OPEN: "Opens gate", CLOSE: "Closes gate", NONE: "No rule" };
const RULE_CLASSES = { OPEN: "rule-open", CLOSE: "rule-close", NONE: "rule-none" };
const GATE_VERBS = { OPEN: "opening", CLOSE: "closing", STOP: "stopped" };

const byId = (id) => document.getElementById(id);
const tooltip = byId("chartTooltip");
let days = 7;
let refreshTimer = null;

const plural = (count, word) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
const ruleOf = (action) => (action in RULE_LABELS ? action : "NONE");
const hourRange = (hour) => `${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(2, "0")}:00`;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// --- Tooltip: value first, then what it is. Works on hover and keyboard focus. ---
function showTip(target) {
    tooltip.replaceChildren(element("strong", null, target.dataset.value), element("span", null, target.dataset.label));
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top}px`;
    tooltip.hidden = false;
    target.classList.add("hovered");
}

function hideTip(target) {
    tooltip.hidden = true;
    target.classList.remove("hovered");
}

function withTip(target, value, label) {
    target.tabIndex = 0;
    target.dataset.value = value;
    target.dataset.label = label;
    target.setAttribute("role", "img");
    target.setAttribute("aria-label", `${value}, ${label}`);
    target.addEventListener("pointerenter", () => showTip(target));
    target.addEventListener("pointerleave", () => hideTip(target));
    target.addEventListener("focus", () => showTip(target));
    target.addEventListener("blur", () => hideTip(target));
    return target;
}

function tableRow(...cells) {
    const row = element("tr");
    row.append(...cells.map(cell => element("td", null, String(cell))));
    return row;
}

// --- Totals ---
function renderTotals(totals) {
    const set = (id, value) => { byId(id).textContent = (value ?? 0).toLocaleString(); };
    set("kpiDetections", totals.detections);
    set("kpiOpens", totals.opens);
    set("kpiCloses", totals.closes);
    set("kpiBlocked", totals.blocked);
    set("kpiManual", totals.manual_commands);
}

// --- Detections by hour (local time on the Jetson) ---
function renderHours(hourly) {
    const max = Math.max(0, ...hourly);
    const peak = hourly.indexOf(max);
    byId("hourChart").replaceChildren(...hourly.map((count, hour) => {
        const slot = withTip(element("div", "hour-slot"), plural(count, "detection"), hourRange(hour));
        const bar = element("span", "hour-bar");
        bar.style.height = max ? `${(count / max) * 100}%` : "0";
        if (count > 0 && hour === peak) {
            bar.append(element("span", "hour-peak", count.toLocaleString()));
        }
        slot.append(bar);
        return slot;
    }));
    byId("hourTable").replaceChildren(...hourly.map((count, hour) => tableRow(hourRange(hour), count)));
}

// --- Detections by species, coloured by what the gate rules do for it ---
function renderSpecies(species) {
    const chart = byId("speciesChart");
    if (species.length === 0) {
        chart.replaceChildren(element("p", "chart-empty", "No animals detected in this period."));
        byId("speciesTable").replaceChildren();
        return;
    }
    const max = Math.max(...species.map(s => s.count));
    chart.replaceChildren(...species.map(s => {
        const rule = ruleOf(s.action);
        const row = withTip(element("div", "species-row"), plural(s.count, "detection"), `${s.label} · ${RULE_LABELS[rule]}`);
        const track = element("div", "species-track");
        const bar = element("span", `species-bar ${RULE_CLASSES[rule]}`);
        bar.style.width = `${(s.count / max) * 85}%`;   // leaves room for the count at the tip
        track.append(bar, element("span", "species-value", s.count.toLocaleString()));
        row.append(element("span", "species-name", s.label), track);
        return row;
    }));
    byId("speciesTable").replaceChildren(...species.map(s => tableRow(s.label, s.count, RULE_LABELS[ruleOf(s.action)])));
}

// --- Recent activity ---
function describeEvent(event) {
    if (event.kind === "detection") {
        return `${event.label} detected (${Math.round(event.confidence * 100)}%) - ${RULE_LABELS[ruleOf(event.action)]}`;
    }
    if (event.kind === "gate") {
        // Manual presses are logged when received; automatic moves when the motor starts
        return event.source === "manual"
            ? `${event.label.charAt(0)}${event.label.slice(1).toLowerCase()} pressed${event.detail ? ` from ${event.detail}` : ""}`
            : `Gate ${GATE_VERBS[event.label] ?? event.label} (gate rules)`;
    }
    if (event.kind === "mode") {
        return `Switched to ${event.label === "MANUAL" ? "Manual" : "Auto"} mode`;
    }
    return event.detail ?? event.kind;
}

function renderEvents(events) {
    const list = byId("eventList");
    if (events.length === 0) {
        list.replaceChildren(element("li", "chart-empty", "Nothing has happened yet."));
        return;
    }
    list.replaceChildren(...events.map(event => {
        const when = new Date(event.ts * 1000);
        const time = element("time", null, when.toLocaleString());
        time.dateTime = when.toISOString();
        const item = element("li");
        item.append(time, element("span", null, describeEvent(event)));
        return item;
    }));
}

async function getJson(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message ?? `HTTP ${response.status}`);
    return data;
}

export async function refreshAnalytics() {
    clearTimeout(refreshTimer);
    const content = byId("analyticsContent");
    content.classList.add("refreshing");
    try {
        const [analytics, events] = await Promise.all([
            getJson(`/api/live/analytics?days=${days}`),
            getJson("/api/live/events?limit=15"),
        ]);
        renderTotals(analytics.totals ?? {});
        renderHours(analytics.hourly ?? []);
        renderSpecies(analytics.species ?? []);
        renderEvents(events);
        byId("analyticsNote").textContent = "";
    } catch (err) {
        byId("analyticsNote").textContent = `Analytics are unavailable right now: ${err.message}`;
    }
    content.classList.remove("refreshing");
    refreshTimer = setTimeout(refreshAnalytics, REFRESH_MS);
}

export function startAnalytics() {
    byId("analyticsSection").hidden = false;
    const rangeButtons = document.querySelectorAll(".range-btn");
    rangeButtons.forEach(button => button.addEventListener("click", () => {
        days = Number(button.dataset.days);
        rangeButtons.forEach(other => other.setAttribute("aria-pressed", String(other === button)));
        refreshAnalytics();
    }));
    refreshAnalytics();
}
