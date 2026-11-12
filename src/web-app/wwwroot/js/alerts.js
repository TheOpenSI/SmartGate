const socket = window.socket;
const tbody = document.querySelector(".alerts-table tbody");

// Hidden alerts are remembered in this browser only
const HIDDEN_ALERTS_KEY = "smartgate.hiddenAlerts";
let alerts = [];
let hiddenAlerts = new Set(loadHiddenAlerts());

function loadHiddenAlerts() {
    try {
        return JSON.parse(localStorage.getItem(HIDDEN_ALERTS_KEY)) ?? [];
    } catch {
        return [];
    }
}

function saveHiddenAlerts() {
    try {
        localStorage.setItem(HIDDEN_ALERTS_KEY, JSON.stringify([...hiddenAlerts]));
    } catch {
        // Storage can be unavailable (e.g. private browsing); hiding still works until reload
    }
}

function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function updateAlertsTable() {
    const rows = alerts
        .filter(alert => !hiddenAlerts.has(alert.alert_no))
        .map(alert => {
            const row = document.createElement("tr");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "alert-checkbox";
            checkbox.name = "selected_alerts";
            checkbox.value = alert.alert_no;
            const selectCell = document.createElement("td");
            selectCell.appendChild(checkbox);

            row.append(
                selectCell,
                cell(alert.alert_no),
                cell(alert.alert_desc),
                cell(alert.alert_level, `alert-level ${alert.alert_level.toLowerCase()}`),
                cell(new Date(alert.date_and_time).toLocaleString())
            );
            return row;
        });

    if (rows.length === 0) {
        const row = document.createElement("tr");
        const empty = cell("No alerts to show.");
        empty.colSpan = 5;
        row.appendChild(empty);
        rows.push(row);
    }
    tbody.replaceChildren(...rows);
}

function selectedAlertNos() {
    return [...tbody.querySelectorAll(".alert-checkbox:checked")].map(box => Number(box.value));
}

function hideSelectedAlerts() {
    const selected = selectedAlertNos();
    if (selected.length === 0) {
        alert("Select the alerts you want to hide first.");
        return;
    }
    selected.forEach(alertNo => hiddenAlerts.add(alertNo));
    saveHiddenAlerts();
    updateAlertsTable();
}

function showHiddenAlerts() {
    hiddenAlerts.clear();
    saveHiddenAlerts();
    updateAlertsTable();
}

async function removeSelectedAlerts() {
    const selected = selectedAlertNos();
    if (selected.length === 0) {
        alert("Select the alerts you want to remove first.");
        return;
    }
    if (!confirm(`Permanently remove ${selected.length} alert(s)?`)) return;

    try {
        const response = await fetch("/api/alerts/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alert_nos: selected })
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.message ?? data.error ?? "The alerts could not be removed.");
        }
        // On success the server sends everyone the updated list
    } catch (error) {
        console.error("Error removing alerts:", error);
        alert("Could not reach SmartGate. Please check your connection.");
    }
}

document.getElementById("hideAlerts").addEventListener("click", hideSelectedAlerts);
document.getElementById("removeAlerts").addEventListener("click", removeSelectedAlerts);
document.getElementById("showHiddenAlerts").addEventListener("click", showHiddenAlerts);

socket.on("alert_data", data => {
    alerts = data.alert_data;
    updateAlertsTable();
});

// Ask for the alerts on connect (and again after any reconnect)
const requestAlerts = () => socket.emit("alert_data");
socket.on("connect", requestAlerts);
if (socket.connected) requestAlerts();
