window.availableRoles = []

// Check if there's already an existing WebSocket connection
if (!window.socket) {
    // Create a WebSocket connection to the server's live-data route
    /** @type {WebSocket} */    
    window.socket = new WebSocket('ws://' + window.location.host + '/ws/live-data');
} else {
    console.log("WebSocket connection already exists.");
}

const socket = window.socket;
const page = document.body.dataset.page;

if (socket) {
    setupWebSocketHandlers(socket);
}

function setupWebSocketHandlers(socket) {
    socket.onopen = function () {
        fetch("/get-session-username")
            .then(res => res.json())
            .then(data => {
                if (data.username) {
                    // Send init event with username
                    socket.send(JSON.stringify({
                        event: "init",
                        data: { username: data.username }
                    }));

                    if (page === "user_overview") {
                        socket.send(JSON.stringify({ event: "user_overview" }));
                    }
    
                    if (page === "alerts") {
                        socket.send(JSON.stringify({ event: "alert_data" }));
                    }
                }
            })
            .catch(() => {
                // In case fetch fails, handle redirection
                console.warn("Could not fetch session username. Skipping init.");
            });
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);

        if (data.event === "user_overview") {
            const {user_data, roles} = data.data;
            window.availableRoles = roles;
            updateUserOverviewTable(user_data);
            updateRoleSelectDropdown(roles)
        }

        if (data.event === "redirect") {
            // Compare the removed user's username from the server with the session username
            fetch("/get-session-username")
                .then(res => res.json())
                .then(sessionData => {
                    // Check if the session username matches the removed user's username
                    if (sessionData.username === data.username) {
                        console.log('Redirecting to:', data.url);
                        window.location.href = data.url;  // Redirect the specific window for the removed user
                    }
                })
                .catch(() => {
                    console.error('Failed to check session username for redirection.');
                });
        }

        if (data.event === "alert_data" && page === "alerts") {
            updateAlertsTable(data.data.alert_data)
        }
    };

    socket.onclose = function () {
        console.log('WebSocket connection closed');
    };

    socket.onerror = function (error) {
        console.error('WebSocket error:', error);
    };
}
