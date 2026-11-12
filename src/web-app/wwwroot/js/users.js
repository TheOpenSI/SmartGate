const socket = window.socket;
const userTable = document.getElementById("userTable");
const tbody = userTable.tBodies[0];
const roleModal = document.getElementById("roleModal");
const modalUsername = document.getElementById("modalUsername");
const roleSelect = document.getElementById("roleSelect");

let availableRoles = [];
let selectedUsername = null;

function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function updateUserOverviewTable(users) {
    const rows = users.map(user => {
        const row = document.createElement("tr");
        row.dataset.username = user.username;
        row.dataset.role = user.role_name;

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
        removeButton.dataset.action = "remove";
        const actionCell = document.createElement("td");
        actionCell.appendChild(removeButton);

        row.append(
            cell(user.username),
            cell(user.role_name),
            cell(user.status, "status " + (user.status === "Logged in" ? "logged-in" : "logged-out")),
            actionCell
        );
        return row;
    });

    if (rows.length === 0) {
        const row = document.createElement("tr");
        const empty = cell("No users have logged in yet.");
        empty.colSpan = 4;
        row.appendChild(empty);
        rows.push(row);
    }
    tbody.replaceChildren(...rows);
}

function updateRoleSelectDropdown(roles, selectedRole = null) {
    roleSelect.replaceChildren(...roles.map(role => {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role;
        option.selected = role === selectedRole;
        return option;
    }));
}

function openRoleModal(username, currentRole) {
    selectedUsername = username;
    modalUsername.textContent = `Username: ${username}`;
    updateRoleSelectDropdown(availableRoles, currentRole);
    roleModal.style.display = "block";
}

function closeRoleModal() {
    roleModal.style.display = "none";
}

async function removeUser(username) {
    if (!confirm(`Are you sure you want to remove the user: ${username}?`)) return;

    try {
        const response = await fetch("/remove-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username })
        });
        const data = await response.json();
        if (data.alert) {
            alert(data.alert);
        }
        // On success the server sends everyone the updated list
    } catch (error) {
        console.error("Error removing user:", error);
        alert("Could not reach SmartGate. Please check your connection.");
    }
}

// Clicking a row changes its role; clicking "Remove" removes the user
tbody.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row?.dataset.username) return;

    if (e.target.dataset.action === "remove") {
        removeUser(row.dataset.username);
    } else {
        openRoleModal(row.dataset.username, row.dataset.role);
    }
});

document.getElementById("closeModal").addEventListener("click", closeRoleModal);
roleModal.addEventListener("click", (e) => {
    if (e.target === roleModal) closeRoleModal();
});

document.getElementById("saveRole").addEventListener("click", () => {
    const newRole = roleSelect.value;
    if (!selectedUsername || !newRole) return;

    // The server checks permission and replies with "action_error" if not allowed
    socket.emit("change_role", { username: selectedUsername, role: newRole });
    closeRoleModal();
});

socket.on("user_overview", ({ user_data, roles }) => {
    availableRoles = roles;
    updateUserOverviewTable(user_data);
});

// Ask for the users list on connect (and again after any reconnect)
const requestUsers = () => socket.emit("user_overview");
socket.on("connect", requestUsers);
if (socket.connected) requestUsers();
