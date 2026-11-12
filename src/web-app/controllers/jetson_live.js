import config from './config.js';

// ------------------------------------------------------------------
// Live link to the Jetson, forwarded to browsers on the Live Stream page
// through Socket.IO (room "live"). JETSON_LIVE_SERVICE picks the Jetson side:
//  - live_api:    the monitoring service (src/main/live_api.py, port 8081).
//                 Node connects to its WebSocket as a client and forwards the events.
//  - http_server: the Jetson's original web server (src/main/http_server.py, port 8080).
//                 Node reads its /status and /detections every few seconds, reports new
//                 animal sightings and gate movements to be saved, and sends it gate commands.
//                 It doesn't report the camera state. A Jetson without the update in
//                 setup/update_running_container.sh has no /detections, PIR/Hall values or stop.
//  - smartgate_nano: the smartgate-nano project's dashboard server (port 8080). Node reads its
//                 /api/status every second and /api/events every few seconds, reports new
//                 sightings and gate movements to be saved, and sends it gate and mode commands.
//                 Its analytics, event log and snapshots are passed through for the page.
// Event contract and connection states: docs/LIVE_MONITORING.md
// ------------------------------------------------------------------
export const LIVE_ROOM = 'live';

const CONNECT_TIMEOUT_MS = 5000;
const STALE_AFTER_MS = 5000; // The Jetson sends "status" every second
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];
const STREAM_CONNECT_TIMEOUT_MS = 3000;
const EVENT_TYPES = new Set(['snapshot', 'status', 'detection']);
const STATUS_POLL_MS = 2000;    // http_server: how often /status and /detections are read
const STATUS_TIMEOUT_MS = 3000;
const GATE_COMMANDS = { open: 'OPEN_DOOR', close: 'CLOSE_DOOR', stop: 'STOP_DOOR' };
const NANO_POLL_MS = 1000;      // smartgate_nano: how often /api/status is read
const NANO_EVENTS_EVERY = 5;    // ...and /api/events, in status polls
const NANO_EVENTS_LIMIT = 50;

// What browsers are told. state: connecting | connected | disconnected | error
const live = {
    connection: { state: 'disconnected', reason: null, last_update: null },
    status: null,
    detection: null,
};

let io = null;
let log = null;
let jetsonSocket = null;
let lastMessageAt = 0;
let reconnectAttempt = 0;
let reconnectTimer = null;
let staleTimer = null;
let pollTimer = null;
let stopped = false;

// http_server: what has already been reported, and who it is reported to
let eventHandlers = {};
let jetsonStartedAt = null;     // Changes when the Jetson restarts (its sighting ids start again)
let lastSightingId = 0;
let lastGatePosition = null;

// smartgate_nano: the newest event already reported (null until the first reply)
let lastEventTs = null;
let nanoPollCount = 0;

export function getLiveSnapshot() {
    return { ...live };
}

const emitToLivePage = (event, data) => io?.to(LIVE_ROOM).emit(event, data);

function setConnection(state, reason = null) {
    if (live.connection.state === state && live.connection.reason === reason) return;
    live.connection = { ...live.connection, state, reason };
    // Readings are only shown while they are live, never stale
    if (state !== 'connected' && live.status !== null) {
        live.status = null;
        emitToLivePage('live_status', null);
    }
    emitToLivePage('live_connection', live.connection);
    log.info(`Jetson live connection: ${state}${reason ? ` (${reason})` : ''}`);
}

// Live data arrived from the Jetson
function markConnected() {
    lastMessageAt = Date.now();
    reconnectAttempt = 0;
    if (live.connection.state !== 'connected') {
        log.info('Jetson live connection: connected');
    }
    live.connection = { state: 'connected', reason: null, last_update: new Date(lastMessageAt).toISOString() };
}

function handleMessage(raw) {
    let message;
    try {
        message = JSON.parse(raw);
    } catch {
        log.warn('Ignored a message from the Jetson that is not JSON');
        return;
    }
    if (!EVENT_TYPES.has(message?.type) || typeof message.data !== 'object') {
        log.warn(`Ignored an unknown message from the Jetson: ${String(raw).slice(0, 120)}`);
        return;
    }

    markConnected();

    if (message.type === 'snapshot') {
        live.status = message.data?.status ?? null;
        live.detection = message.data?.detection ?? live.detection;
        emitToLivePage('live_status', live.status);
        if (live.detection) emitToLivePage('live_detection', live.detection);
    } else if (message.type === 'status') {
        live.status = message.data;
        emitToLivePage('live_status', live.status);
    } else if (message.type === 'detection') {
        live.detection = message.data;
        emitToLivePage('live_detection', live.detection);
    }
    emitToLivePage('live_connection', live.connection);
}

function scheduleReconnect(retry) {
    if (stopped) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt++;
    reconnectTimer = setTimeout(retry, delay);
}

function connect() {
    const wsUrl = `${config.jetsonLiveUrl.replace(/^http/, 'ws')}/ws/events`;
    setConnection('connecting', reconnectAttempt > 0 ? `Reconnect attempt ${reconnectAttempt}` : null);

    const ws = new WebSocket(wsUrl);
    jetsonSocket = ws;
    let closeReason = null;

    const connectTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
            closeReason = 'Connection timed out';
            ws.close();
        }
    }, CONNECT_TIMEOUT_MS);

    ws.addEventListener('message', (event) => handleMessage(event.data));
    ws.addEventListener('error', (event) => {
        closeReason ??= event.message || 'Could not connect';
    });
    ws.addEventListener('close', (event) => {
        clearTimeout(connectTimer);
        if (jetsonSocket !== ws) return;
        jetsonSocket = null;
        if (stopped) return;
        // Keep an "error" state (e.g. stalled data) visible until the next attempt starts
        if (live.connection.state !== 'error') {
            setConnection('disconnected', closeReason ?? (event.reason || `Connection closed (code ${event.code})`));
        }
        scheduleReconnect(connect);
    });
}

// A connection that stays open but stops sending data counts as an error.
// A frozen Jetson may never finish closing it, so retry straight away instead of waiting.
function checkStale() {
    if (live.connection.state === 'connected' && Date.now() - lastMessageAt > STALE_AFTER_MS) {
        setConnection('error', `No data from the Jetson for ${STALE_AFTER_MS / 1000} seconds`);
        const staleSocket = jetsonSocket;
        jetsonSocket = null; // Its close event is now ignored
        staleSocket?.close();
        scheduleReconnect(connect);
    }
}

// --- http_server (port 8080) ---
// Its readings are text, e.g. { "cpu_usage": "12.0%", "cpu_temperature": "41.5°C", "door_state": "Closed" }
function readingNumber(value) {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : null;
}

const readingBoolean = (value) => (typeof value === 'boolean' ? value : null);
const readingInteger = (value) => (Number.isInteger(value) ? value : null);

function gatePosition(reading) {
    if (reading.door_state === 'Open' || reading.door_state === 'Closed') return reading.door_state;
    if (reading.is_door_opening || reading.is_door_closing) return 'Moving';
    return 'Unknown';
}

// Converts a /status reply to the "status" format of live_api.py (docs/LIVE_MONITORING.md).
// `reading` is null when /status replied without usable readings. The model is loaded before
// the Jetson's web server starts, so a Jetson that sends detections has its model running.
function statusFromHttpServer(reading, sendsDetections) {
    return {
        camera: { status: 'unknown', fps: null, last_frame_at: null },
        model: { ready: sendsDetections ? true : null, name: null, confidence_threshold: null },
        system: {
            cpu_percent: readingNumber(reading?.cpu_usage),
            memory_percent: readingNumber(reading?.memory_usage),
            temperature_c: readingNumber(reading?.cpu_temperature),
            temperature_sensor: null,
        },
        sensors: {
            pir_motion: readingBoolean(reading?.pir_motion),
            hall_open: readingInteger(reading?.hall_open),
            hall_close: readingInteger(reading?.hall_close),
            gate_position: reading ? gatePosition(reading) : null,
            door_opening: readingBoolean(reading?.is_door_opening),
            door_closing: readingBoolean(reading?.is_door_closing),
        },
    };
}

// Any reply means the Jetson is reachable. /status can fail by itself (e.g. if it reads a
// temperature sensor this Jetson doesn't have), so the reply may have no usable readings.
async function readHttpServerStatus() {
    const response = await fetch(`${config.jetsonLiveUrl}/status`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    if (!response.ok) return null;
    try {
        return await response.json();
    } catch {
        return null;
    }
}

// The latest detection and recent sightings, or null if this Jetson doesn't send them.
// Never throws: the connection state comes from /status alone.
async function readHttpServerDetections() {
    try {
        const response = await fetch(`${config.jetsonLiveUrl}/detections`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

// Shows the latest detection and returns the sightings not reported yet
function takeNewSightings(data) {
    if (data.latest && data.latest.detected_at !== live.detection?.detected_at) {
        live.detection = data.latest;
        emitToLivePage('live_detection', live.detection);
    }

    const sightings = Array.isArray(data.sightings) ? data.sightings : [];
    if (data.started_at !== jetsonStartedAt) {
        // The website just started: what the Jetson saw before may already be saved, so skip it.
        // The Jetson restarted: all of its sightings are new.
        const websiteJustStarted = jetsonStartedAt === null;
        jetsonStartedAt = data.started_at;
        lastSightingId = websiteJustStarted ? Math.max(0, ...sightings.map(s => s.id)) : 0;
    }
    const newSightings = sightings.filter(s => s.id > lastSightingId);
    if (newSightings.length > 0) {
        lastSightingId = newSightings.at(-1).id;
    }
    return newSightings;
}

// Reports each new sighting, and the gate when it reaches Open or Closed.
// The first position after the website starts is reported with firstReading, to sync without an alert.
async function reportJetsonEvents(newSightings, position) {
    try {
        for (const sighting of newSightings) {
            await eventHandlers.onSighting?.(sighting);
        }
        if ((position === 'Open' || position === 'Closed') && position !== lastGatePosition) {
            const firstReading = lastGatePosition === null;
            lastGatePosition = position;
            await eventHandlers.onGatePosition?.(position, { firstReading });
        }
    } catch (err) {
        log.error(err, 'Saving what the Jetson reported failed');
    }
}

async function pollHttpServer() {
    if (live.connection.state !== 'connected') {
        setConnection('connecting', reconnectAttempt > 0 ? `Reconnect attempt ${reconnectAttempt}` : null);
    }

    let reading, detections;
    try {
        [reading, detections] = await Promise.all([readHttpServerStatus(), readHttpServerDetections()]);
    } catch (err) {
        if (stopped) return;
        setConnection('disconnected', err.name === 'TimeoutError' ? 'Connection timed out' : 'Could not connect');
        scheduleReconnect(pollHttpServer);
        return;
    }
    if (stopped) return;

    markConnected();
    live.status = statusFromHttpServer(reading, detections !== null);
    emitToLivePage('live_status', live.status);
    emitToLivePage('live_connection', live.connection);
    const newSightings = detections ? takeNewSightings(detections) : [];
    await reportJetsonEvents(newSightings, live.status.sensors.gate_position);
    pollTimer = setTimeout(pollHttpServer, STATUS_POLL_MS);
}

// --- smartgate_nano (port 8080) ---
const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// GETs JSON from the Jetson; throws with a short reason if it can't be reached or answers wrongly
async function readJetsonJson(path) {
    let response;
    try {
        response = await fetch(`${config.jetsonLiveUrl}${path}`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    } catch (err) {
        throw new Error(err.name === 'TimeoutError' ? 'Connection timed out' : 'Could not connect');
    }
    const route = path.split('?')[0];
    if (!response.ok) {
        throw new Error(`The Jetson answered ${route} with HTTP ${response.status} (check JETSON_LIVE_SERVICE)`);
    }
    try {
        return await response.json();
    } catch {
        throw new Error(`The Jetson's answer to ${route} is not JSON`);
    }
}

// Converts /api/status to the "status" format of live_api.py (docs/LIVE_MONITORING.md), plus the
// readings only smartgate-nano has: GPU, disk, uptime, stream viewers, gate mode and state machine.
// Its door state is shown as is: Open, Closed, Opening, Closing, Partly open or Unknown.
function statusFromNano(nano) {
    const camera = nano.camera ?? {};
    const system = nano.system ?? {};
    const door = nano.door ?? {};
    return {
        camera: {
            status: camera.online ? 'ok' : 'no_frames',
            fps: numberOrNull(camera.fps),
            last_frame_at: null,
            viewers: numberOrNull(camera.viewers),
        },
        // The model is loaded before the Jetson's web server starts, so it is running
        model: { ready: true, name: null, confidence_threshold: null },
        system: {
            cpu_percent: numberOrNull(system.cpu_usage),
            memory_percent: numberOrNull(system.memory_usage),
            temperature_c: numberOrNull(system.cpu_temp),
            temperature_sensor: null,
            gpu_temperature_c: numberOrNull(system.gpu_temp),
            gpu_percent: numberOrNull(system.gpu_usage),
            disk_percent: numberOrNull(system.disk_usage),
            uptime_s: numberOrNull(system.uptime_s),
        },
        sensors: {
            pir_motion: null,
            hall_open: null,
            hall_close: null,
            gate_position: typeof door.state === 'string' ? door.state : null,
            door_opening: readingBoolean(door.opening),
            door_closing: readingBoolean(door.closing),
        },
        gate: {
            mode: typeof nano.mode === 'string' ? nano.mode : null,
            state_machine: typeof nano.state === 'string' ? nano.state : null,
        },
    };
}

// The newest detection, in the "detection" format. Confidence is 0-1 on the Jetson, a percentage here.
// Empty detections don't change last_detection_ts, so null means "no new detection".
function detectionFromNano(nano) {
    if (!nano.last_detection_ts || !Array.isArray(nano.last_detections) || nano.last_detections.length === 0) {
        return null;
    }
    const animals = nano.last_detections
        .map(d => ({ name: String(d.label), confidence: Math.round(Number(d.conf) * 1000) / 10, action: d.action }))
        .sort((a, b) => b.confidence - a.confidence);
    return { animals, top: animals[0], detected_at: new Date(nano.last_detection_ts * 1000).toISOString(), inference_ms: null };
}

// Events newer than the last ones reported, oldest first. The first reply only sets the starting
// point, so restarting the website doesn't save the same detections twice.
function takeNewNanoEvents(events) {
    const newest = Math.max(0, ...events.map(e => Number(e.ts) || 0));
    if (lastEventTs === null) {
        lastEventTs = newest;
        return [];
    }
    const fresh = events.filter(e => e.ts > lastEventTs).reverse();
    lastEventTs = Math.max(lastEventTs, newest);
    return fresh;
}

// Detections from the event log, which already counts each animal once per visit
async function readNewNanoSightings() {
    const events = await readJetsonJson(`/api/events?limit=${NANO_EVENTS_LIMIT}`).catch(() => null);
    if (!Array.isArray(events)) return [];
    return takeNewNanoEvents(events)
        .filter(e => e.kind === 'detection')
        .map(e => ({
            name: String(e.label),
            confidence: Math.round(Number(e.confidence) * 1000) / 10,
            action: e.action === 'OPEN' || e.action === 'CLOSE' ? e.action : null,
        }));
}

async function pollNano() {
    if (live.connection.state !== 'connected') {
        setConnection('connecting', reconnectAttempt > 0 ? `Reconnect attempt ${reconnectAttempt}` : null);
    }

    let nano;
    try {
        nano = await readJetsonJson('/api/status');
    } catch (err) {
        if (stopped) return;
        setConnection('disconnected', err.message);
        scheduleReconnect(pollNano);
        return;
    }
    if (stopped) return;

    markConnected();
    live.status = statusFromNano(nano);
    emitToLivePage('live_status', live.status);
    emitToLivePage('live_connection', live.connection);

    const detection = detectionFromNano(nano);
    if (detection && detection.detected_at !== live.detection?.detected_at) {
        live.detection = detection;
        emitToLivePage('live_detection', live.detection);
    }

    const newSightings = nanoPollCount++ % NANO_EVENTS_EVERY === 0 ? await readNewNanoSightings() : [];
    await reportJetsonEvents(newSightings, live.status.sensors.gate_position);
    pollTimer = setTimeout(pollNano, NANO_POLL_MS);
}

// --- Gate control (the Jetson's port 8080 server takes the commands) ---
const usesNano = () => config.jetsonLiveService === 'smartgate_nano';
export const canControlGate = () => Boolean(config.jetsonLiveUrl) && ['http_server', 'smartgate_nano'].includes(config.jetsonLiveService);

// Only smartgate-nano has the Auto / Manual mode, analytics, event log and snapshots
export const hasNanoFeatures = () => Boolean(config.jetsonLiveUrl) && usesNano();

async function postToJetson(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (config.jetsonToken) {
        headers['X-SmartGate-Token'] = config.jetsonToken;
    }
    let response;
    try {
        response = await fetch(`${config.jetsonLiveUrl}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
        });
    } catch (err) {
        throw new Error(err.name === 'TimeoutError' ? 'The Jetson did not answer in time.' : 'The Jetson could not be reached.');
    }
    if (response.status === 401) {
        throw new Error("The Jetson wants an access token: set JETSON_TOKEN to server.token from its config.json.");
    }
    if (!response.ok) {
        throw new Error(`The Jetson refused the command (HTTP ${response.status}).`);
    }
}

// Sends "open", "close" or "stop" to the Jetson, which moves the real gate.
// Its main loop opens/closes until the Hall sensors say the gate is there; stop halts the motor at once.
export async function sendGateCommand(action) {
    await postToJetson(usesNano() ? '/api/command' : '/', { command: GATE_COMMANDS[action] });
}

// smartgate_nano: "auto" lets the gate rules move the gate; "manual" leaves it to the buttons
export async function setGateMode(mode) {
    await postToJetson('/api/command', { command: 'SET_MODE', mode: mode.toUpperCase() });
}

// smartgate_nano: GETs `path` from the Jetson (analytics, events, snapshot) for the page.
// Throws with a short reason if the Jetson can't be reached; the caller checks the status.
export async function fetchFromJetson(path) {
    try {
        return await fetch(`${config.jetsonLiveUrl}${path}`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    } catch (err) {
        throw new Error(err.name === 'TimeoutError' ? 'The Jetson did not answer in time.' : 'The Jetson could not be reached.');
    }
}

// `handlers` (http_server and smartgate_nano): onSighting(sighting) and onGatePosition(position, { firstReading })
export function startJetsonLive(ioServer, logger, handlers = {}) {
    io = ioServer;
    log = logger;
    eventHandlers = handlers;
    if (!config.jetsonLiveUrl) {
        live.connection = { state: 'disconnected', reason: 'JETSON_LIVE_URL is not set', last_update: null };
        log.warn('JETSON_LIVE_URL is not set, so the Live Stream page will show the Jetson as disconnected.');
        return;
    }
    log.info(`Jetson live service: ${config.jetsonLiveService} at ${config.jetsonLiveUrl}`);
    if (config.jetsonLiveService === 'http_server') {
        pollHttpServer();
        return;
    }
    if (config.jetsonLiveService === 'smartgate_nano') {
        pollNano();
        return;
    }
    connect();
    staleTimer = setInterval(checkStale, 1000);
}

export function stopJetsonLive() {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearTimeout(pollTimer);
    clearInterval(staleTimer);
    jetsonSocket?.close();
}

// Opens the Jetson's MJPEG stream (both Jetson services serve it at /stream).
// The caller aborts `signal` when the browser leaves.
// Only connecting is time-limited; the stream itself runs until aborted.
export async function openLiveStream(signal) {
    if (!config.jetsonLiveUrl) {
        throw new Error('JETSON_LIVE_URL is not set');
    }
    const controller = new AbortController();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
    const connectTimer = setTimeout(() => controller.abort(), STREAM_CONNECT_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(`${config.jetsonLiveUrl}/stream`, { signal: controller.signal });
    } finally {
        clearTimeout(connectTimer);
    }
    if (!response.ok || !response.body) {
        throw new Error(`Jetson replied with HTTP ${response.status}`);
    }
    return response;
}
