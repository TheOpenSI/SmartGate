// Connect to the server using Socket.IO
const socket = io();

// Log when the client successfully connects
socket.on('connect', () => {
    console.log('Connected to the server via Socket.IO');
});

// Listen for messages from the server
socket.on('message', (data) => {
    console.log('Received message from server:', data);
});

// Emit a test message to the server
socket.emit('message', 'Hello from the client!');
