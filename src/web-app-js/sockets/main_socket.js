// Inside sockets/main_socket.js
module.exports = function(io) {
    io.on('connection', (socket) => {
        console.log('A user connected');
        
        // Send a message to all clients
        io.emit('message', 'A new user has joined!');

        // Handle custom message from a client
        socket.on('message', (msg) => {
            console.log('Message from client: ', msg);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('A user disconnected');
        });
    });
};
