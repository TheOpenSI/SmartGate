import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import config from './controllers/config.js';
import { clearAllUsers, closeDb } from './controllers/db_controller.js';
import { startJetsonLive, stopJetsonLive } from './controllers/jetson_live.js';
import { saveGatePosition, saveSighting } from './controllers/jetson_records.js';
import { rootRoutes } from './controllers/main_controller.js';
import { registerSocketEvents } from './controllers/websocket_events.js';

const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const app = Fastify({ logger: true });

// Images, CSS and browser JavaScript are served from wwwroot/ under /static/
await app.register(fastifyStatic, {
    root: path.join(import.meta.dirname, 'wwwroot'),
    prefix: '/static/',
});

// Login sessions (kept in memory, so restarting the server logs everyone out)
await app.register(fastifyCookie);
await app.register(fastifySession, {
    secret: config.sessionSecret,
    saveUninitialized: false,
    cookie: { secure: 'auto', sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS },
});

// Real-time updates for the Alerts, Users and Gates pages
const io = new Server(app.server);
app.decorate('io', io);
registerSocketEvents(app, io);

// Bad requests get a short message; unexpected errors are logged without exposing details
app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
        return reply.code(400).send({ error: 'Invalid request', message: err.message });
    }
    if (err.statusCode >= 400 && err.statusCode < 500) {
        return reply.code(err.statusCode).send({ error: err.message });
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on the server.' });
});

await app.register(rootRoutes);

app.addHook('preClose', async () => {
    stopJetsonLive();
    io.disconnectSockets(true);
});
app.addHook('onClose', async () => {
    await closeDb();
});

// Shut down cleanly on Ctrl+C or `docker stop`
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
        await app.close();
        process.exit(0);
    });
}

// Sessions don't survive a restart, so start with an empty users list
try {
    await clearAllUsers();
    app.log.info('All users cleared successfully!');
} catch (err) {
    app.log.error(`Error clearing users: ${err.message}`);
}

await app.listen({ host: '0.0.0.0', port: config.port });

// Connect to the Jetson's live monitoring service (camera, detections, sensors)
startJetsonLive(io, app.log, {
    onSighting: (sighting) => saveSighting(io, sighting),
    onGatePosition: (position, details) => saveGatePosition(io, position, details),
});
