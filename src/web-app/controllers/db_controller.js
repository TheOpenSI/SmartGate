import pg from 'pg';
import config from './config.js';

// One shared connection pool for the whole app
const pool = new pg.Pool({ connectionString: config.databaseUrl });

pool.on('error', (err) => {
    console.error(`[ERROR] Unexpected database error: ${err.message}`);
});

// Timestamps are stored without a time zone in the database's zone (UTC).
// Converting them to timestamptz lets browsers show them in their local time.
const localTime = (column) => `(${column} AT TIME ZONE current_setting('TimeZone'))`;

// Function to check database connection
export async function checkDbConnection() {
    const { rows } = await pool.query('SELECT 1 AS ok;');
    return rows[0]?.ok === 1;
}

export async function closeDb() {
    await pool.end();
}

// -------------
// Users
// -------------

// Add a user on login. Users listed in ADMIN_USERS always get the admin role.
export async function insertUser({ id, login, isAdmin }) {
    const roleName = isAdmin ? 'admin' : 'user';
    const { rows } = await pool.query(
        'SELECT username FROM users WHERE user_id = $1 OR username = $2;',
        [id, login]
    );

    if (rows.length === 0) {
        await pool.query(
            `INSERT INTO users (user_id, username, role_id)
             VALUES ($1, $2, (SELECT role_id FROM roles WHERE role_name = $3));`,
            [id, login, roleName]
        );
    } else if (isAdmin) {
        await changeRole(login, 'admin');
    }
}

export async function userExists(username) {
    const { rowCount } = await pool.query('SELECT 1 FROM users WHERE username = $1;', [username]);
    return rowCount > 0;
}

export async function checkPermission(username, permName) {
    const { rowCount } = await pool.query(
        `SELECT 1
         FROM user_perms
         WHERE username = $1
         AND permissions @> $2::jsonb
         LIMIT 1;`,
        [username, JSON.stringify([permName])]
    );
    return rowCount > 0;
}

// Returns false if the role or the user does not exist
export async function changeRole(username, roleName) {
    const { rowCount } = await pool.query(
        `UPDATE users
         SET role_id = roles.role_id
         FROM roles
         WHERE roles.role_name = $2 AND users.username = $1;`,
        [username, roleName]
    );
    return rowCount > 0;
}

export async function removeUser(username) {
    await pool.query('DELETE FROM users WHERE username = $1;', [username]);
}

export async function markUserLoggedIn(username) {
    await pool.query("UPDATE user_overview SET user_status = 'Logged in' WHERE username = $1;", [username]);
}

export async function markUserLoggedOut(username) {
    await pool.query("UPDATE user_overview SET user_status = 'Logged out' WHERE username = $1;", [username]);
}

export async function getUserOverview() {
    const { rows } = await pool.query(
        'SELECT username, role_name, user_status AS status FROM user_overview ORDER BY username;'
    );
    return rows;
}

// Sessions only live in memory, so every user is cleared when the server starts
export async function clearAllUsers() {
    await pool.query('DELETE FROM users;');
}

export async function getAllRoles() {
    const { rows } = await pool.query('SELECT role_name FROM roles ORDER BY role_id;');
    return rows.map(row => row.role_name);
}

// -------------
// Alerts
// -------------
export async function getAllAlerts() {
    const { rows } = await pool.query(
        `SELECT alert_no, alert_desc, alert_level, ${localTime('date_and_time')} AS date_and_time
         FROM alerts
         ORDER BY alert_no;`
    );
    return rows;
}

export async function addAlert(alertDesc, alertLevel) {
    await pool.query('INSERT INTO alerts (alert_desc, alert_level) VALUES ($1, $2);', [alertDesc, alertLevel]);
}

export async function deleteAlerts(alertNos) {
    const { rowCount } = await pool.query('DELETE FROM alerts WHERE alert_no = ANY($1::int[]);', [alertNos]);
    return rowCount;
}

// -------------
// Gates
// -------------

// The open/close counters are BIGINT, which would arrive as strings, so read them as integers
const GATE_COLUMNS = 'gate_no, gate_status, gate_no_opens::integer, gate_no_closes::integer';

export async function getGates() {
    const { rows } = await pool.query(`SELECT ${GATE_COLUMNS} FROM gates ORDER BY gate_no;`);
    return rows;
}

// Registers a gate if it is not in the database yet
export async function addGate(gateNo, gateStatus) {
    await pool.query(
        'INSERT INTO gates (gate_no, gate_status) VALUES ($1, $2) ON CONFLICT (gate_no) DO NOTHING;',
        [gateNo, gateStatus]
    );
}

// Sets a gate's status and counts the open/close. Returns the gate and whether it changed.
export async function updateGateStatus(gateNo, newStatus) {
    await addGate(gateNo, 'Closed');
    const updated = await pool.query(
        `UPDATE gates
         SET gate_status = $2::gate_status_enum,
             gate_no_opens = gate_no_opens + CASE WHEN $2::gate_status_enum = 'Open' THEN 1 ELSE 0 END,
             gate_no_closes = gate_no_closes + CASE WHEN $2::gate_status_enum = 'Closed' THEN 1 ELSE 0 END
         WHERE gate_no = $1 AND gate_status IS DISTINCT FROM $2::gate_status_enum
         RETURNING ${GATE_COLUMNS};`,
        [gateNo, newStatus]
    );
    if (updated.rowCount > 0) {
        return { gate: updated.rows[0], changed: true };
    }
    const { rows } = await pool.query(`SELECT ${GATE_COLUMNS} FROM gates WHERE gate_no = $1;`, [gateNo]);
    return { gate: rows[0], changed: false };
}

// -------------
// Detected animals
// -------------

// The database's triggers update the animal counts and the stats percentages
export async function addDetectedAnimal({ animalType, animalName, isEndangered, isThreat }) {
    await pool.query(
        'INSERT INTO detected_animals (animal_type, animal_name, is_endangered, is_threat) VALUES ($1, $2, $3, $4);',
        [animalType, animalName, isEndangered, isThreat]
    );
}

// -------------
// Stats
// -------------
export async function getStats() {
    const [gates, animals, stats, animalCounts] = await Promise.all([
        getGates(),
        pool.query(
            `SELECT animal_id, animal_type, animal_name, is_endangered, is_threat, ${localTime('time_stamp')} AS time_stamp
             FROM detected_animals
             ORDER BY animal_id;`
        ),
        pool.query('SELECT key, value FROM var_stats;'),
        pool.query('SELECT animal_name, animal_count FROM animal_name_vs_count ORDER BY animal_count DESC, animal_name;'),
    ]);

    return {
        gates,
        animals: animals.rows,
        // BIGINT values arrive as strings, so convert them back to numbers
        stats: Object.fromEntries(stats.rows.map(row => [row.key, Number(row.value)])),
        animal_counts: animalCounts.rows.map(row => ({ ...row, animal_count: Number(row.animal_count) })),
    };
}
