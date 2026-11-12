// Live Stream page: shows the Jetson's camera and the readings it sends.
// Every value comes from the Jetson; anything missing is shown as "Unavailable".
import { startAnalytics } from "./live-analytics.js";

const socket = window.socket;

const UNAVAILABLE = "Unavailable";
const STREAM_URL = "/api/live/stream";
const STREAM_RETRY_MS = 5000;

const CONNECTION_LABELS = { connected: "Connected", connecting: "Connecting", disconnected: "Disconnected", error: "Error" };
// "unknown": the Jetson's port 8080 server (JETSON_LIVE_SERVICE=http_server) doesn't report the camera state
const CAMERA_LABELS = { ok: "Operational", starting: "Starting", no_frames: "No frames", unavailable: null, unknown: "Not reported by the Jetson" };
const RULE_LABELS = { OPEN: "Opens gate", CLOSE: "Closes gate", NONE: "No rule" };
const MODE_HINTS = {
    AUTO: "Auto: the gate rules open for native species and close for pests. Switch to Manual to hold the gate.",
    MANUAL: "Manual: detections are still logged, but only the buttons move the gate.",
};

// Health meters turn warning / critical past these levels (temperatures in °C, shown on a 0-100 scale)
const LOAD_LEVELS = { warning: 70, critical: 90 };
const TEMP_LEVELS = { warning: 70, critical: 85 };

const byId = (id) => document.getElementById(id);
const streamImage = byId("liveStream");
const cameraMessage = byId("cameraMessage");

let connection = { state: "connecting", reason: null, last_update: null };
let status = null;
let detection = null;
let lastLiveAt = null;      // When this browser last received live data
let streamActive = false;
let retryTimer = null;

// --- Small display helpers ---
function show(id, value) {
    const element = byId(id);
    const missing = value === null || value === undefined || value === "";
    element.textContent = missing ? UNAVAILABLE : value;
    element.classList.toggle("unavailable", missing);
}

function setBadge(id, text, className) {
    const badge = byId(id);
    badge.textContent = text;
    badge.className = `badge ${className}`;
}

const percent = (value) => (typeof value === "number" ? `${value.toFixed(1)}%` : null);
const isLive = () => connection.state === "connected" && status !== null;
const titleCase = (text) => (text ? `${text.charAt(0)}${text.slice(1).toLowerCase()}` : null);

function timeAgo(date) {
    const seconds = Math.max(0, Math.round((Date.now() - date) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    return date.toLocaleString();
}

function formatUptime(seconds) {
    if (typeof seconds !== "number") return null;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

// --- Jetson connection ---
function renderConnection() {
    setBadge("connectionBadge", CONNECTION_LABELS[connection.state] ?? "Unknown", connection.state);
    show("connectionReason", connection.reason ?? (connection.state === "connected" ? "Receiving live data" : null));
    renderLastUpdate();
}

function renderLastUpdate() {
    if (connection.state === "connected" && lastLiveAt) {
        const seconds = Math.round((Date.now() - lastLiveAt) / 1000);
        show("lastUpdate", `${new Date(lastLiveAt).toLocaleTimeString()} (${seconds}s ago)`);
    } else {
        show("lastUpdate", connection.last_update ? new Date(connection.last_update).toLocaleString() : null);
    }
    renderLastDetection();
}

// --- Gate status panel ---
function renderGateState() {
    const sensors = isLive() ? status.sensors : null;
    const gate = isLive() ? status.gate : null;
    const position = sensors?.gate_position ?? null;

    const stateText = byId("gateStateText");
    stateText.textContent = position ?? UNAVAILABLE;
    stateText.classList.toggle("unavailable", !position);
    const motor = sensors?.door_opening ? "Motor running (opening)"
        : sensors?.door_closing ? "Motor running (closing)"
        : sensors ? "Motor stopped" : "";
    byId("motorText").textContent = motor;

    show("gateMode", titleCase(gate?.mode));
    show("stateMachine", gate?.state_machine);
    show("uptime", formatUptime(isLive() ? status.system?.uptime_s : null));
}

function renderLastDetection() {
    const element = byId("lastDetection");
    if (!detection?.top) {
        show("lastDetection", isLive() && status.model?.ready ? "None yet" : null);
        return;
    }
    element.textContent = `${detection.top.name} · ${timeAgo(new Date(detection.detected_at))}`;
    element.classList.remove("unavailable");
}

// One meter: the value as text (with "high" / "very high" past the limits) and a filled bar
function showMeter(id, value, unit, levels) {
    const bar = byId(`${id}Bar`);
    if (typeof value !== "number") {
        show(id, null);
        bar.style.width = "0";
        bar.className = "";
        return;
    }
    const level = value >= levels.critical ? "critical" : value >= levels.warning ? "warning" : "normal";
    const note = level === "critical" ? " · very high" : level === "warning" ? " · high" : "";
    show(id, `${value.toFixed(1)}${unit}${note}`);
    bar.style.width = `${Math.min(100, Math.max(0, value))}%`;
    bar.className = level;
}

function renderHealth() {
    const system = isLive() ? status.system : null;
    showMeter("cpuTemp", system?.temperature_c, " °C", TEMP_LEVELS);
    showMeter("gpuTemp", system?.gpu_temperature_c, " °C", TEMP_LEVELS);
    showMeter("cpuLoad", system?.cpu_percent, "%", LOAD_LEVELS);
    showMeter("gpuLoad", system?.gpu_percent, "%", LOAD_LEVELS);
    showMeter("memoryLoad", system?.memory_percent, "%", LOAD_LEVELS);
    showMeter("diskLoad", system?.disk_percent, "%", LOAD_LEVELS);
}

// --- Camera, sensors and the rest of the readings ---
function renderStatus() {
    const live = isLive();
    const camera = live ? status.camera : null;
    const sensors = live ? status.sensors : null;

    const cameraOk = camera?.status === "ok";
    const cameraUnknown = camera?.status === "unknown";
    show("cameraStatus", cameraOk ? `Operational (${camera.fps} fps)` : CAMERA_LABELS[camera?.status] ?? null);
    if (cameraOk) setBadge("cameraBadge", "Live", "ok");
    else if (cameraUnknown) setBadge("cameraBadge", "Stream", "connected");
    else if (camera) setBadge("cameraBadge", "No signal", "error");
    else setBadge("cameraBadge", UNAVAILABLE, "disconnected");

    const meta = [];
    if (typeof camera?.fps === "number") meta.push(`${camera.fps} fps`);
    if (typeof camera?.viewers === "number") meta.push(`${camera.viewers} viewer${camera.viewers === 1 ? "" : "s"}`);
    byId("cameraMeta").textContent = meta.join(" · ");

    show("pirMotion", typeof sensors?.pir_motion === "boolean"
        ? (sensors.pir_motion ? "Motion detected" : "No motion") : null);
    show("hallOpen", hallReading(sensors?.hall_open));
    show("hallClose", hallReading(sensors?.hall_close));
    show("gatePosition", sensors?.gate_position);

    // Without a reported camera state, show the stream whenever the Jetson is connected
    updateStream(cameraOk || cameraUnknown, camera);
    renderGateState();
    renderHealth();
    renderDetection();
    renderGateControl();
}

function hallReading(value) {
    return typeof value === "number" ? `${value} (${value ? "HIGH" : "LOW"})` : null;
}

// --- Animal recognition (only while the AI model is running) ---
function renderDetection() {
    const model = isLive() ? status.model : null;
    const modelReady = model?.ready === true;
    show("modelStatus", modelReady ? "Running" : null);
    show("modelName", modelReady ? model.name : null);
    renderLastDetection();

    if (!modelReady) {
        ["detectedAnimal", "detectedConfidence", "detectedRule", "detectedAt", "detectedOthers"].forEach(id => show(id, null));
        return;
    }
    if (!detection) {
        show("detectedAnimal", "None detected yet");
        ["detectedConfidence", "detectedRule", "detectedAt", "detectedOthers"].forEach(id => show(id, null));
        return;
    }

    show("detectedAnimal", detection.top?.name);
    show("detectedConfidence", typeof detection.top?.confidence === "number"
        ? `${detection.top.confidence.toFixed(1)}%` : null);
    show("detectedRule", RULE_LABELS[detection.top?.action] ?? null);
    show("detectedAt", detection.detected_at ? new Date(detection.detected_at).toLocaleString() : null);
    const others = (detection.animals ?? []).slice(1).map(a => `${a.name} (${a.confidence.toFixed(1)}%)`);
    show("detectedOthers", others.length ? others.join(", ") : "None");
}

// --- Camera stream ---
function cameraProblem(camera) {
    if (connection.state === "connecting") return "Connecting to the Jetson...";
    if (connection.state === "error") return "Live data from the Jetson has stopped. Reconnecting...";
    if (connection.state !== "connected") return "The Jetson is disconnected. Waiting for it to come back...";
    if (camera?.status === "starting") return "The camera is starting...";
    return "The camera is not sending frames. The Jetson will try to reconnect it.";
}

function updateStream(cameraOk, camera) {
    if (cameraOk && !streamActive && !retryTimer) {
        startStream();
    } else if (!cameraOk) {
        stopStream(cameraProblem(camera));
    }
}

function startStream() {
    streamActive = true;
    // A new URL each time forces a fresh connection
    streamImage.src = `${STREAM_URL}?t=${Date.now()}`;
    cameraMessage.hidden = true;
}

function stopStream(message) {
    clearTimeout(retryTimer);
    retryTimer = null;
    streamActive = false;
    streamImage.removeAttribute("src"); // Closes the stream connection
    cameraMessage.textContent = message;
    cameraMessage.hidden = false;
}

// The stream connection failed or dropped: try again shortly
streamImage.addEventListener("error", () => {
    if (!streamActive) return;
    stopStream("The camera stream was interrupted. Reconnecting...");
    retryTimer = setTimeout(() => {
        retryTimer = null;
        renderStatus();
    }, STREAM_RETRY_MS);
});

// --- Manual gate control, mode and snapshot (moves the real gate through the Jetson) ---
const gateButtons = document.querySelectorAll(".gate-btn");
const modeButtons = document.querySelectorAll(".mode-btn");
const snapshotLink = byId("snapshotLink");
let gateControl = { available: false, allowed: false, modes: false, message: "Checking gate control..." };
let gateBusy = false;

function renderGateControl() {
    const hint = !gateControl.allowed ? gateControl.message
        : !isLive() ? "Waiting for the Jetson to connect." : null;
    byId("gateHint").textContent = hint ?? "";
    gateButtons.forEach(button => { button.disabled = Boolean(hint) || gateBusy; });

    const mode = isLive() ? status.gate?.mode : null;
    modeButtons.forEach(button => {
        button.setAttribute("aria-pressed", String(mode === button.dataset.mode.toUpperCase()));
        button.disabled = Boolean(hint) || gateBusy || !mode;
    });
    byId("modeHint").textContent = MODE_HINTS[mode] ?? "";

    snapshotLink.setAttribute("aria-disabled", String(!(isLive() && status.camera?.status === "ok")));
}

async function loadGateControl() {
    try {
        const response = await fetch("/api/live/gate");
        gateControl = await response.json();
    } catch {
        gateControl = { available: false, allowed: false, modes: false, message: "Could not check gate control." };
    }
    // The mode switch, snapshots and analytics only exist on smartgate-nano
    byId("modeGroup").hidden = !gateControl.modes;
    byId("snapshotGroup").hidden = !gateControl.modes;
    if (gateControl.modes) startAnalytics();
    renderGateControl();
}

async function postCommand(url, body, sending) {
    const result = byId("gateResult");
    gateBusy = true;
    renderGateControl();
    result.textContent = sending;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        result.textContent = data.message ?? (response.ok ? "Command sent." : "The command failed.");
    } catch {
        result.textContent = "Could not reach the SmartGate web server.";
    }
    gateBusy = false;
    renderGateControl();
}

function sendGateCommand(action) {
    if (action !== "stop" && !confirm(`This will ${action} the real gate. Continue?`)) return;
    postCommand("/api/live/gate", { action }, `Sending the ${action} command...`);
}

function sendMode(mode) {
    if (status?.gate?.mode === mode.toUpperCase()) return;
    const question = mode === "manual"
        ? "Switch to Manual? The gate rules will stop moving the gate; only the buttons will."
        : "Switch to Auto? The gate rules will move the gate again.";
    if (!confirm(question)) return;
    postCommand("/api/live/mode", { mode }, `Switching to ${titleCase(mode)} mode...`);
}

gateButtons.forEach(button => button.addEventListener("click", () => sendGateCommand(button.dataset.action)));
modeButtons.forEach(button => button.addEventListener("click", () => sendMode(button.dataset.mode)));
snapshotLink.addEventListener("click", (event) => {
    if (snapshotLink.getAttribute("aria-disabled") === "true") event.preventDefault();
});
loadGateControl();

// --- Live events from the web server ---
socket.on("live_connection", (data) => {
    connection = data;
    if (connection.state === "connected") lastLiveAt = Date.now();
    renderConnection();
    renderStatus();
});

socket.on("live_status", (data) => {
    status = data;
    if (data) lastLiveAt = Date.now();
    renderStatus();
});

socket.on("live_detection", (data) => {
    detection = data;
    renderDetection();
});

// The SmartGate web server itself is unreachable
socket.on("disconnect", () => {
    connection = { ...connection, state: "disconnected", reason: "Lost connection to the SmartGate web server" };
    status = null;
    renderConnection();
    renderStatus();
});

// Join the live updates on connect (and again after any reconnect)
const subscribe = () => socket.emit("live_subscribe");
socket.on("connect", subscribe);
if (socket.connected) subscribe();

renderConnection();
renderStatus();
setInterval(renderLastUpdate, 1000);
