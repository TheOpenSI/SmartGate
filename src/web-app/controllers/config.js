import crypto from 'node:crypto';

// ---------------------------------------------------------
// Settings read from environment variables (see .env.example)
// ---------------------------------------------------------
const env = process.env;

const isDevelopment = (env.ENV ?? 'development') !== 'production';

function getSessionSecret() {
    if (env.SESSION_SECRET) {
        if (env.SESSION_SECRET.length < 32) {
            throw new Error('SESSION_SECRET must be at least 32 characters long.');
        }
        return env.SESSION_SECRET;
    }
    // Without a fixed secret, everyone is logged out whenever the server restarts.
    console.warn('[WARN] SESSION_SECRET is not set. Using a random one for this run.');
    return crypto.randomBytes(32).toString('hex');
}

// Comma-separated GitHub usernames that are given the admin role when they log in
function getAdminUsers() {
    return (env.ADMIN_USERS ?? '')
        .split(',')
        .map(name => name.trim().toLowerCase())
        .filter(Boolean);
}

// Address of the Jetson service that JETSON_LIVE_SERVICE names,
// e.g. JETSON_LIVE_URL=http://192.168.1.50:8081
function getJetsonLiveUrl() {
    const value = (env.JETSON_LIVE_URL ?? '').trim();
    if (!value) {
        return null;
    }
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`JETSON_LIVE_URL must start with http:// or https:// (got "${value}").`);
    }
    return url.origin + url.pathname.replace(/\/+$/, '');
}

// Which Jetson service JETSON_LIVE_URL points to:
// "live_api" (src/main/live_api.py, port 8081), "http_server" (src/main/http_server.py, port 8080)
// or "smartgate_nano" (the smartgate-nano project's dashboard server, port 8080)
const JETSON_LIVE_SERVICES = ['live_api', 'http_server', 'smartgate_nano'];

function getJetsonLiveService() {
    const value = (env.JETSON_LIVE_SERVICE ?? '').trim() || 'live_api';
    if (!JETSON_LIVE_SERVICES.includes(value)) {
        throw new Error(`JETSON_LIVE_SERVICE must be one of ${JETSON_LIVE_SERVICES.join(', ')} (got "${value}").`);
    }
    return value;
}

// The gate number the Jetson's gate is recorded as on the dashboard and stats pages
function getJetsonGateNo() {
    const value = Number((env.JETSON_GATE_NO ?? '').trim() || 1);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`JETSON_GATE_NO must be a whole number of 1 or more (got "${env.JETSON_GATE_NO}").`);
    }
    return value;
}

const config = {
    port: Number(env.PORT ?? 8000),
    databaseUrl: env.DATABASE_URL,
    isDevelopment,
    sessionSecret: getSessionSecret(),
    github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
    },
    adminUsers: getAdminUsers(),
    jetsonLiveUrl: getJetsonLiveUrl(),
    jetsonLiveService: getJetsonLiveService(),
    jetsonGateNo: getJetsonGateNo(),
    // smartgate_nano: the access token for gate commands, if the Jetson's config.json sets server.token
    jetsonToken: (env.JETSON_TOKEN ?? '').trim() || null,
};

export default config;
