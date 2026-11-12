// One shared Socket.IO connection per page, used by the page scripts as window.socket.
// The server knows who is connected from the login cookie, so nothing needs to be sent here.
window.socket ??= io();
const socket = window.socket;

// Sent to a user who was removed by an admin
socket.on("redirect", ({ url }) => {
    window.location.href = url;
});

// Sent when the server refuses an action (e.g. changing a role without permission)
socket.on("action_error", ({ message }) => {
    alert(message);
});

socket.on("connect_error", (error) => {
    console.error("Live connection failed:", error.message);
});
