const fastify = require('fastify')({ logger: true });
const path = require('path');
const socketio = require('socket.io');
const fastifyStatic = require('@fastify/static');
const fs = require('fs');
const port = 8000;

// Register Fastify Static plugin to serve static files
fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),  // Serve static files from the 'public' folder
    prefix: '/public/',  // Access static files using '/public/' prefix in the URL
});

// Use Socket.IO with Fastify's internal server
const io = socketio(fastify.server);  // Attach Socket.IO to Fastify's internal server

// Import and set up Socket.IO event handler
const socketHandler = require('./sockets/main_socket');
socketHandler(io);  // Pass the Socket.IO instance to the handler

// Import the all route handler from the controller
const { all } = require('./controllers/main');

// Serve the catch-all route to handle all SPA routes
fastify.get('*', all);  // Serve 'layout.html' for all routes, SPA-style

// Start the Fastify server
fastify.listen({ port: port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    console.log(`Fastify app listening at ${address}`);
});
