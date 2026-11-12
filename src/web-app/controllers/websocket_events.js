import {
    changeRole,
    checkPermission,
    getAllAlerts,
    getAllRoles,
    getUserOverview,
    userExists,
} from './db_controller.js';
import { LIVE_ROOM, getLiveSnapshot } from './jetson_live.js';

// ---------------------------------
// Data sent to the browsers
// ---------------------------------
export async function fetchUserData() {
    const [userData, roles] = await Promise.all([getUserOverview(), getAllRoles()]);
    return { user_data: userData, roles };
}

export async function fetchAlertsData() {
    return { alert_data: await getAllAlerts() };
}

export async function broadcastUserOverview(io) {
    io.emit('user_overview', await fetchUserData());
}

export async function broadcastAlertData(io) {
    io.emit('alert_data', await fetchAlertsData());
}

export function broadcastGateUpdate(io, gate) {
    io.emit('gate_update', gate);
}

// Sends a removed user's open pages to /removed, which logs them out
export function kickUser(io, username) {
    io.to(userRoom(username)).emit('redirect', { url: '/removed' });
}

const userRoom = (username) => `user:${username}`;

// ---------------------------------
// Socket.IO connection and events
// ---------------------------------
export function registerSocketEvents(app, io) {
    // Look up who is connected from their login session cookie
    io.use((socket, next) => {
        const { sessionId } = app.parseCookie(socket.handshake.headers.cookie ?? '');
        if (!sessionId) {
            return next();
        }
        const sessionHolder = {};
        app.decryptSession(sessionId, sessionHolder, () => {
            socket.data.user = sessionHolder.session?.get('user') ?? null;
            next();
        });
    });

    io.on('connection', (socket) => {
        const user = socket.data.user;
        if (user) {
            socket.join(userRoom(user.username));
        }

        // Each handler catches its own errors so one failure can't crash the server
        const handle = (event, handler) => {
            socket.on(event, async (data = {}) => {
                try {
                    await handler(data);
                } catch (err) {
                    app.log.error(err, `Socket event "${event}" failed`);
                    socket.emit('action_error', { message: 'Something went wrong. Please try again.' });
                }
            });
        };

        handle('user_overview', async () => {
            socket.emit('user_overview', await fetchUserData());
        });

        handle('alert_data', async () => {
            socket.emit('alert_data', await fetchAlertsData());
        });

        // The Live Stream page joins the "live" room and gets the current Jetson state straight away
        handle('live_subscribe', async () => {
            socket.join(LIVE_ROOM);
            const { connection, status, detection } = getLiveSnapshot();
            socket.emit('live_connection', connection);
            socket.emit('live_status', status);
            if (detection) {
                socket.emit('live_detection', detection);
            }
        });

        handle('change_role', async ({ username, role }) => {
            if (!user || !(await userExists(user.username))) {
                return socket.emit('action_error', { message: 'You need to log in to change roles.' });
            }
            if (!(await checkPermission(user.username, 'data_control'))) {
                return socket.emit('action_error', { message: "You don't have permission to change roles." });
            }
            if (typeof username !== 'string' || typeof role !== 'string' || !(await changeRole(username, role))) {
                return socket.emit('action_error', { message: 'Could not change that role.' });
            }
            await broadcastUserOverview(io);
        });
    });
}
