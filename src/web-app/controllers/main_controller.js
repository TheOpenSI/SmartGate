import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import fastifyOAuth2 from '@fastify/oauth2';
import config from './config.js';
import {
    addAlert,
    addGate,
    checkDbConnection,
    checkPermission,
    deleteAlerts,
    getStats,
    insertUser,
    markUserLoggedIn,
    markUserLoggedOut,
    removeUser,
    updateGateStatus,
    userExists,
} from './db_controller.js';
import {
    broadcastAlertData,
    broadcastGateUpdate,
    broadcastUserOverview,
    kickUser,
} from './websocket_events.js';
import {
    canControlGate,
    fetchFromJetson,
    getLiveSnapshot,
    hasNanoFeatures,
    openLiveStream,
    sendGateCommand,
    setGateMode,
} from './jetson_live.js';

const FRONTEND_DIR = path.join(import.meta.dirname, '..', 'frontend');
const DUMMY_AVATAR_URL = 'https://cdn-icons-png.flaticon.com/512/1674/1674295.png';

// Each page is frontend/layout.html with the page's HTML placed inside it
const PAGES = [
    { url: '/', file: 'Index.html', title: 'Home', page: 'dashboard' },
    { url: '/gates', file: 'gates.html', title: 'Live Stream', page: 'live' },
    { url: '/alerts', file: 'alerts.html', title: 'Alerts', page: 'alerts' },
    { url: '/users', file: 'users.html', title: 'Users', page: 'users' },
    { url: '/stats', file: 'stats.html', title: 'Dashboard', page: 'stats' },
    { url: '/about', file: 'about.html', title: 'About Us', page: 'about' },
];

// -------------------
// Helper Functions
// -------------------
function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Pages are re-read on every request in development so HTML edits show up on refresh
const templateCache = new Map();

async function readTemplate(file) {
    if (!config.isDevelopment && templateCache.has(file)) {
        return templateCache.get(file);
    }
    const html = await fs.readFile(path.join(FRONTEND_DIR, file), 'utf8');
    templateCache.set(file, html);
    return html;
}

// Replaces {{name}} placeholders in a template
function fillTemplate(template, values) {
    return template.replace(/{{(\w+)}}/g, (match, key) => values[key] ?? '');
}

function renderUserSection(user) {
    if (user) {
        return `<div class="user-info">
            <div class="profile-avatar">
                <img src="${escapeHtml(user.avatar_url)}" alt="User Avatar" class="profile-pic">
            </div>
            <div class="user-menu" id="userMenu">
                <p class="username">Username: ${escapeHtml(user.username)}</p>
                <a href="/logout" class="logout-btn">Logout</a>
            </div>
        </div>`;
    }

    // The dummy login is only for testing, so it is hidden in production
    const dummyLogin = config.isDevelopment
        ? '<a href="/dummy-login" class="dummy-login-btn">DUMMY LOGIN</a>'
        : '';
    return `<div class="login-btns">
            ${dummyLogin}
            <a href="/login" class="login-btn">LOGIN</a>
            <style>
                nav {
                    margin-left: 125px;
                }
            </style>
        </div>`;
}

// Returns the logged-in user, or null. Users removed from the database are logged out.
async function getCurrentUser(request) {
    const user = request.session?.get('user');
    if (!user) {
        return null;
    }
    if (await userExists(user.username)) {
        return user;
    }
    await request.session.destroy();
    return null;
}

// Opening and closing the real gate need their own permission; stopping it or switching
// its mode ("stop", "mode") needs either one
async function hasGatePermission(username, action) {
    const permNames = action === 'open' || action === 'close' ? [`${action}_gate`] : ['open_gate', 'close_gate'];
    for (const permName of permNames) {
        if (await checkPermission(username, permName)) return true;
    }
    return false;
}

const NANO_ONLY_MESSAGE = 'This needs JETSON_LIVE_SERVICE=smartgate_nano in the settings.';

// Answers with the Jetson's JSON reply to `path` (smartgate_nano only)
async function sendJetsonJson(request, reply, path) {
    if (!hasNanoFeatures()) {
        return reply.code(404).send({ message: NANO_ONLY_MESSAGE });
    }
    let response;
    try {
        response = await fetchFromJetson(path);
    } catch (err) {
        return reply.code(502).send({ message: err.message });
    }
    if (!response.ok) {
        request.log.warn(`The Jetson answered ${path} with HTTP ${response.status}`);
        return reply.code(502).send({ message: `The Jetson answered with HTTP ${response.status}.` });
    }
    return reply.send(await response.json());
}

async function logIn(request, { id, login, avatarUrl }) {
    await insertUser({ id, login, isAdmin: config.adminUsers.includes(login.toLowerCase()) });
    await markUserLoggedIn(login);
    // A fresh session on login stops anyone reusing a session id from before login
    await request.session.regenerate();
    request.session.set('user', { username: login, avatar_url: avatarUrl });
}

// -------------------
// Request Schemas
// -------------------
const gateNoSchema = { type: 'integer', minimum: 1 };
const gateStatusSchema = { type: 'string', enum: ['Open', 'Closed'] };

// -------------
// Routes
// -------------
export async function rootRoutes(app) {
    const io = app.io;

    // --- Web pages ---
    for (const page of PAGES) {
        app.get(page.url, async (request, reply) => {
            const user = await getCurrentUser(request);
            const [layout, content] = await Promise.all([readTemplate('layout.html'), readTemplate(page.file)]);
            reply.type('text/html; charset=utf-8');
            return fillTemplate(layout, {
                title: page.title,
                page: page.page,
                user_section: renderUserSection(user),
                content,
            });
        });
    }

    // --- Login with GitHub ---
    if (config.github.clientId && config.github.clientSecret) {
        await app.register(fastifyOAuth2, {
            name: 'githubOAuth2',
            scope: ['user:email'],
            credentials: {
                client: { id: config.github.clientId, secret: config.github.clientSecret },
                auth: fastifyOAuth2.GITHUB_CONFIGURATION,
            },
            startRedirectPath: '/login',
            callbackUri: (request) => `${request.protocol}://${request.host}/auth`,
        });

        app.get('/auth', async (request, reply) => {
            // The user pressed "Cancel" on GitHub
            if (request.query.error) {
                return reply.redirect('/');
            }

            const { token } = await app.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'SmartGate',
                },
            });
            if (!response.ok) {
                throw new Error(`GitHub user lookup failed with HTTP ${response.status}`);
            }
            const githubUser = await response.json();

            await logIn(request, { id: githubUser.id, login: githubUser.login, avatarUrl: githubUser.avatar_url });
            await broadcastUserOverview(io);
            return reply.redirect('/gates');
        });
    } else {
        app.get('/login', async (request, reply) => {
            reply.code(503).type('text/html; charset=utf-8');
            return '<h1>GitHub login is not set up</h1>'
                + '<p>Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (see .env.example) and restart SmartGate.</p>'
                + '<p><a href="/">Back to SmartGate</a></p>';
        });
    }

    if (config.isDevelopment) {
        app.get('/dummy-login', async (request, reply) => {
            await logIn(request, { id: 9999, login: 'Dummy', avatarUrl: DUMMY_AVATAR_URL });
            await broadcastUserOverview(io);
            return reply.redirect('/gates');
        });
    }

    app.get('/logout', async (request, reply) => {
        const user = request.session?.get('user');
        if (user) {
            await markUserLoggedOut(user.username);
            await request.session.destroy();
            await broadcastUserOverview(io);
        }
        return reply.redirect('/');
    });

    app.get('/removed', async (request, reply) => {
        await request.session?.destroy();
        return reply.redirect('/');
    });

    // --- Status and session information ---
    app.get('/health', { logLevel: 'warn' }, async (request, reply) => {
        try {
            if (!(await checkDbConnection())) {
                return reply.code(500).send({ status: 'unhealthy', reason: 'Database unavailable' });
            }
            return { 'web-status': 'ok', 'db-status': 'ok' };
        } catch (err) {
            return reply.code(500).send({ status: 'unhealthy', reason: err.message });
        }
    });

    app.get('/get-username', async (request) => {
        const user = await getCurrentUser(request);
        return user ? { username: user.username } : { error: 'Not logged in' };
    });

    app.get('/get-session-username', async (request, reply) => {
        const user = await getCurrentUser(request);
        if (!user) {
            return reply.code(401).send({ detail: 'Not logged in' });
        }
        return { username: user.username };
    });

    // Only answers for the logged-in user, so nobody can look up other users' permissions
    app.get('/check-permission', {
        schema: {
            querystring: {
                type: 'object',
                required: ['perm_name'],
                properties: { username: { type: 'string' }, perm_name: { type: 'string' } },
            },
        },
    }, async (request) => {
        const user = await getCurrentUser(request);
        const { username, perm_name: permName } = request.query;
        if (!user || (username && username !== user.username)) {
            return { allowed: false };
        }
        return { allowed: await checkPermission(user.username, permName) };
    });

    // --- Users ---
    app.post('/remove-user', {
        schema: {
            body: {
                type: 'object',
                required: ['username'],
                properties: { username: { type: 'string', minLength: 1 } },
            },
        },
    }, async (request, reply) => {
        const user = await getCurrentUser(request);
        if (!user) {
            return reply.code(401).send({ alert: 'You need to log in to remove users.' });
        }

        const { username } = request.body;
        if (username === user.username) {
            return reply.code(400).send({ alert: 'You cannot remove yourself.' });
        }
        if (!(await checkPermission(user.username, 'data_control'))) {
            return reply.code(403).send({ alert: "You don't have permission to remove users." });
        }

        await removeUser(username);
        kickUser(io, username);
        await broadcastUserOverview(io);
        return { message: `User ${username} removed and kicked out!` };
    });

    // --- Alerts ---
    app.post('/api/alerts/delete', {
        schema: {
            body: {
                type: 'object',
                required: ['alert_nos'],
                properties: { alert_nos: { type: 'array', minItems: 1, items: { type: 'integer' } } },
            },
        },
    }, async (request, reply) => {
        const user = await getCurrentUser(request);
        if (!user) {
            return reply.code(401).send({ message: 'You need to log in to remove alerts.' });
        }
        if (!(await checkPermission(user.username, 'data_control'))) {
            return reply.code(403).send({ message: "You don't have permission to remove alerts." });
        }

        const removed = await deleteAlerts(request.body.alert_nos);
        await broadcastAlertData(io);
        return { message: `${removed} alert(s) removed` };
    });

    // --- Gates ---
    // Registers a gate if it is not in the database yet
    app.post('/add_gate_data', {
        schema: {
            body: {
                type: 'object',
                required: ['gate_no', 'gate_status'],
                properties: { gate_no: gateNoSchema, gate_status: gateStatusSchema },
            },
        },
    }, async (request) => {
        const { gate_no: gateNo, gate_status: gateStatus } = request.body;
        await addGate(gateNo, gateStatus);
        return { message: `Gate ${gateNo} status ${gateStatus} added successfully` };
    });

    // Records a gate as opened or closed. This only updates the database; it never moves a physical gate.
    app.post('/update_gate_data', {
        schema: {
            body: {
                type: 'object',
                required: ['gate_no', 'new_status'],
                properties: { gate_no: gateNoSchema, new_status: gateStatusSchema },
            },
        },
    }, async (request, reply) => {
        const { gate_no: gateNo, new_status: newStatus } = request.body;
        const action = newStatus === 'Open' ? 'open' : 'close';

        const user = await getCurrentUser(request);
        if (!user) {
            return reply.code(401).send({ message: `You need to log in to ${action} the gate.` });
        }
        if (!(await checkPermission(user.username, `${action}_gate`))) {
            return reply.code(403).send({ message: `You don't have permission to ${action} the gate.` });
        }

        const { gate, changed } = await updateGateStatus(gateNo, newStatus);
        if (changed) {
            await addAlert(`Gate #${gateNo} ${newStatus === 'Open' ? 'Opened' : 'Closed'} by ${user.username}`, 'info');
            broadcastGateUpdate(io, gate);
            await broadcastAlertData(io);
        }
        return { message: `Gate ${gateNo} status ${newStatus} updated successfully`, gate };
    });

    // --- Live monitoring (Jetson) ---
    // Latest connection state, readings and detection, as sent to the Live Stream page
    app.get('/api/live/status', async () => getLiveSnapshot());

    // Passes the Jetson's live MJPEG camera stream through to the browser
    app.get('/api/live/stream', async (request, reply) => {
        const browserGone = new AbortController();
        reply.raw.on('close', () => browserGone.abort());

        let response;
        try {
            response = await openLiveStream(browserGone.signal);
        } catch (err) {
            request.log.warn(`Live stream unavailable: ${err.message}`);
            return reply.code(502).send({ error: 'The Jetson camera stream could not be reached.' });
        }

        const stream = Readable.fromWeb(response.body);
        // Stopping the stream when the browser leaves is expected, not an error
        stream.on('error', () => {});
        reply.header('Content-Type', response.headers.get('content-type'));
        reply.header('Cache-Control', 'no-store');
        return reply.send(stream);
    });

    // Whether the Live Stream page's gate buttons work for this user, and why not.
    // `modes`: the Jetson has the Auto / Manual switch (smartgate_nano).
    app.get('/api/live/gate', async (request) => {
        const modes = hasNanoFeatures();
        if (!canControlGate()) {
            return { available: false, allowed: false, modes, message: 'Gate control needs JETSON_LIVE_SERVICE=http_server or smartgate_nano in the settings.' };
        }
        const user = await getCurrentUser(request);
        if (!user) {
            return { available: true, allowed: false, modes, message: 'Log in as an admin to control the gate.' };
        }
        if (!(await hasGatePermission(user.username, 'stop'))) {
            return { available: true, allowed: false, modes, message: "Your account doesn't have permission to control the gate." };
        }
        return { available: true, allowed: true, modes, message: null };
    });

    // Moves the REAL gate: sends "open", "close" or "stop" to the Jetson.
    // The gate's new position is saved when the Jetson reports it (controllers/jetson_records.js).
    app.post('/api/live/gate', {
        schema: {
            body: {
                type: 'object',
                required: ['action'],
                properties: { action: { type: 'string', enum: ['open', 'close', 'stop'] } },
            },
        },
    }, async (request, reply) => {
        const { action } = request.body;
        if (!canControlGate()) {
            return reply.code(503).send({ message: 'Gate control needs JETSON_LIVE_SERVICE=http_server in the settings.' });
        }

        const user = await getCurrentUser(request);
        if (!user) {
            return reply.code(401).send({ message: `You need to log in to ${action} the gate.` });
        }
        if (!(await hasGatePermission(user.username, action))) {
            return reply.code(403).send({ message: `You don't have permission to ${action} the gate.` });
        }

        try {
            await sendGateCommand(action);
        } catch (err) {
            request.log.warn(`Gate command "${action}" failed: ${err.message}`);
            return reply.code(502).send({ message: err.message });
        }
        await addAlert(`Gate #${config.jetsonGateNo} ${action} command sent by ${user.username}`, 'info');
        await broadcastAlertData(io);
        return { message: `The ${action} command was sent to the Jetson.` };
    });

    // smartgate_nano: "auto" lets the gate rules move the gate, "manual" holds it for the buttons
    app.post('/api/live/mode', {
        schema: {
            body: {
                type: 'object',
                required: ['mode'],
                properties: { mode: { type: 'string', enum: ['auto', 'manual'] } },
            },
        },
    }, async (request, reply) => {
        const { mode } = request.body;
        const modeName = mode === 'auto' ? 'Auto' : 'Manual';
        if (!hasNanoFeatures()) {
            return reply.code(503).send({ message: 'Switching modes needs JETSON_LIVE_SERVICE=smartgate_nano in the settings.' });
        }

        const user = await getCurrentUser(request);
        if (!user) {
            return reply.code(401).send({ message: 'You need to log in to change the gate mode.' });
        }
        if (!(await hasGatePermission(user.username, 'mode'))) {
            return reply.code(403).send({ message: "You don't have permission to change the gate mode." });
        }

        try {
            await setGateMode(mode);
        } catch (err) {
            request.log.warn(`Switching the gate to ${modeName} failed: ${err.message}`);
            return reply.code(502).send({ message: err.message });
        }
        await addAlert(`Gate #${config.jetsonGateNo} switched to ${modeName} mode by ${user.username}`, 'info');
        await broadcastAlertData(io);
        return { message: `Switched the gate to ${modeName} mode.` };
    });

    // smartgate_nano: the Jetson's own analytics and event log, for the Live Stream page
    app.get('/api/live/analytics', {
        schema: {
            querystring: {
                type: 'object',
                properties: { days: { type: 'integer', minimum: 1, maximum: 90, default: 7 } },
            },
        },
    }, async (request, reply) => sendJetsonJson(request, reply, `/api/analytics?days=${request.query.days}`));

    app.get('/api/live/events', {
        schema: {
            querystring: {
                type: 'object',
                properties: { limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 } },
            },
        },
    }, async (request, reply) => sendJetsonJson(request, reply, `/api/events?limit=${request.query.limit}`));

    // smartgate_nano: a still photo from the Jetson's camera
    app.get('/api/live/snapshot', async (request, reply) => {
        if (!hasNanoFeatures()) {
            return reply.code(404).send({ message: NANO_ONLY_MESSAGE });
        }
        let response;
        try {
            response = await fetchFromJetson('/snapshot.jpg');
        } catch (err) {
            return reply.code(502).send({ message: err.message });
        }
        if (!response.ok) {
            return reply.code(503).send({ message: 'The camera has no picture yet.' });
        }
        reply.header('Content-Type', 'image/jpeg');
        reply.header('Cache-Control', 'no-store');
        reply.header('Content-Disposition', response.headers.get('content-disposition') ?? 'inline; filename="smartgate.jpg"');
        return reply.send(Buffer.from(await response.arrayBuffer()));
    });

    // --- Stats ---
    // jetson_gate_no: which gate the Jetson's gate is recorded as (JETSON_GATE_NO), for the Stats page
    app.get('/api/stats', async () => ({ ...(await getStats()), jetson_gate_no: config.jetsonGateNo }));
}
