# SmartGate Web App

The SmartGate dashboard. The backend is **Node.js** ([Fastify](https://fastify.dev/)) with
[Socket.IO](https://socket.io/) for live updates and PostgreSQL for data. The frontend is plain
HTML, CSS and JavaScript. Everything runs in Docker Compose, on a PC or on the Jetson Orin Nano (ARM64).

This guide walks you through building the Docker images required to run the SmartGate web app using Docker Compose.

## Prerequisites

- Docker installed on your machine. Follow the [Official Docker Installation Guide](https://docs.docker.com/get-docker/) if you haven't already.
-  Docker Compose installed (usually included with Docker Desktop or available separately). Follow the [Docker Compose Install Guide](https://docs.docker.com/compose/install/) if you can't access docker-compose.
- Access to a terminal (Linux/macOS) or a terminal emulator like Git Bash (Windows).
-  Git installed. You can download it from [Git Install Guides](https://github.com/git-guides/install-git)
-  Internet Access is required to download the images from Docker Hub (written in `docker-compose.yml` file).

## Steps

### 1. Clone the Repository

First, clone the SmartGate repository to your local machine.

```sh
git clone https://github.com/ChristopherLaff/SmartGate.git
cd SmartGate
```

### 2. Navigate to `src/web-app` directory
Once you're in the `SmartGate` directory, navigate to the `src/web-app` directory.

```sh
cd src/web-app
```

### 3. Create your settings file
Copy `.env.example` to `.env` and fill it in. Each setting is explained in the file.
`.env` holds secrets, so it is ignored by git and must never be committed.

```sh
cp .env.example .env
```

At minimum, set `SESSION_SECRET`. Set `ADMIN_USERS` to your GitHub username so you can control gates.
The app also runs with an empty `.env`; it then logs everyone out on each restart and has no admins.

### 4. Build the docker images
Now, to run the SmartGate Web App, you need to build the images using the docker-compose file in the current directory.

```sh
docker-compose up --build -d
```

Then open `http://localhost:8000` (or `http://<device-ip>:8000`).

### 5. Shutdown the docker images
Once you're done testing the web application, you can stop the containers:

```sh
docker-compose down
```

Add `--volumes` to also delete the database. It is recreated with the sample data on the next start.

## Settings (`.env`)

| Setting | What it does |
|---|---|
| `ENV` | `development` shows the **DUMMY LOGIN** button and reloads HTML on every request. Use `production` on the Jetson. |
| `SESSION_SECRET` | Signs the login cookie. At least 32 random characters. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub login. Create an OAuth app at <https://github.com/settings/developers> with the callback URL `http://<host>:8000/auth`. |
| `ADMIN_USERS` | Comma-separated GitHub usernames that become admins when they log in. Add `Dummy` to make the dummy login an admin while testing. |
| `JETSON_LIVE_URL` | Address of the Jetson's live monitoring service for the **LIVE STREAM** page, e.g. `http://<jetson-ip>:8081`. |
| `JETSON_LIVE_SERVICE` | `live_api` (default) for the live service on port 8081, `http_server` for the Jetson's original web page on port 8080, or `smartgate_nano` for a Jetson running the smartgate-nano project (port 8080). See below. |
| `JETSON_GATE_NO` | The gate number the Jetson's gate is recorded as on the dashboard and stats pages (default 1). |
| `JETSON_TOKEN` | `smartgate_nano` only: the access token from the Jetson's `config.json` (`server.token`), if it has one. |

## Roles and permissions

Everyone can view the pages. Actions are checked by the server:

| Action | Needs |
|---|---|
| Record a gate as opened / closed (`POST /update_gate_data`, database only) | `open_gate` / `close_gate` (admin) |
| **Move the real gate** from the LIVE STREAM page (`POST /api/live/gate`: open / close / stop) | `open_gate` / `close_gate` (admin); stop needs either |
| Switch the gate between Auto and Manual (`POST /api/live/mode`, smartgate-nano only) | `open_gate` or `close_gate` (admin) |
| Change a user's role, remove a user, remove alerts | `data_control` (admin) |
| Hide alerts | Nothing (only hides them in your own browser) |

New users get the `user` role. Admins change roles by clicking a user on the **Users** page.
The Jetson moves the gate from its detection rules. With `JETSON_LIVE_SERVICE=http_server` or
`smartgate_nano`, admins can also open, close or stop the real gate from the LIVE STREAM page; the rules
can still move it again on the next detection, unless a smartgate-nano Jetson is in Manual mode.

## Live Stream page (Jetson)

The **LIVE STREAM** page (`/gates`) shows the Jetson's live camera, its connection state, the latest
animal detection, CPU / memory / temperature, and the PIR, Hall-sensor and gate-position readings,
updating in real time. Set `JETSON_LIVE_URL` to the Jetson's live service (`live_port` in
`config/config.json`, 8081 by default). Values the Jetson does not provide show as **Unavailable**.

If the web app runs in Docker on the same Jetson, use `JETSON_LIVE_URL=http://host.docker.internal:8081`.
Setup, message formats, connection states and reconnection behaviour: [docs/LIVE_MONITORING.md](../../docs/LIVE_MONITORING.md).

**Jetson without the live service (port 8080 only).** If the Jetson's image was built without
`live_api.py`, point the page at the Jetson's original web page instead:

```
JETSON_LIVE_URL=http://<jetson-ip>:8080
JETSON_LIVE_SERVICE=http_server
```

The page then shows the camera, CPU / memory / temperature and the gate position, read from the
Jetson's `/stream` and `/status`, and has **Open / Stop / Close** buttons for admins.

For animal detections, PIR / Hall readings and the Stop button, update the running Jetson once with
`setup/update_running_container.sh` (no rebuild; it backs up and can undo). The website then also saves
each animal sighting (one per visit) and each gate movement for the dashboard, stats and alerts pages.
Without that update, detections and the PIR / Hall values show as **Unavailable**. The camera state is
never reported by that server.

**Jetson running smartgate-nano.** The smartgate-nano project has its own dashboard on port 8080 with
an API the website can read. If `http://<jetson-ip>:8080/api/status` answers with JSON, use:

```
JETSON_LIVE_URL=http://<jetson-ip>:8080
JETSON_LIVE_SERVICE=smartgate_nano
JETSON_TOKEN=            # only if the Jetson's config.json sets server.token
```

Nothing on the Jetson needs to change (don't run `setup/update_running_container.sh` on it). The page
then shows the camera with its frame rate and viewers, the gate state (Opening / Closing / Partly open
too), Auto / Manual mode, the state machine, the latest detection and its gate rule, uptime and Jetson
health (CPU / GPU temperature and load, memory, disk), and has Open / Close / Stop, an Auto / Manual
switch and a Snapshot button. A **Gate Analytics** section shows the Jetson's own counts (today, 7 or
30 days): totals, detections by hour and by species, and its recent activity. Sightings and gate
movements are also saved for the dashboard, stats and alerts pages. PIR / Hall values aren't reported
by smartgate-nano, so they show as **Unavailable**.

## SmartGate Web App Commands

Run the web app without Docker (needs Node.js 20.11 or newer and a running database):
```bash
npm install
DATABASE_URL=postgresql://admin:smartgate@localhost:5432/smartgatedb npm start
```

Restart after changing `app.js` or `controllers/` (HTML, CSS and browser JS changes only need a page refresh):
```bash
docker-compose restart sgwebimage
```

Access SmartGate Database
```bash
docker-compose exec postgres psql -U admin -d smartgatedb
```

Access SmartGate Database Outside Docker Container
```bash
psql -h localhost -U admin -d smartgatedb
```

Database Password: smartgate (see `docker-compose.yml`)

## Project structure

| Path | Contents |
|---|---|
| `app.js` | Starts the server: static files, sessions, Socket.IO, routes |
| `controllers/main_controller.js` | Pages, login, and the HTTP API |
| `controllers/websocket_events.js` | Socket.IO live updates (alerts, users, live stream) |
| `controllers/db_controller.js` | All database queries |
| `controllers/jetson_live.js` | Connection to the Jetson's live monitoring service |
| `controllers/config.js` | Reads the `.env` settings |
| `frontend/` | HTML pages. `layout.html` is the shared header and footer. |
| `wwwroot/` | CSS, browser JavaScript, images and video, served under `/static/` |
| `models/` | Database schema, loaded by PostgreSQL on first start |

## Important Notes for Developers

- Before running the `docker-compose.yml` file, make sure to **remove any existing containers and volumes** to avoid conflicts. You can do this using the command line or Docker Desktop:

    **Using the command line:**
    ```bash
    # List and remove all containers
    docker ps -a
    docker rm <container_id>

    # List and remove all volumes
    docker volume ls
    docker volume rm <volume_name>
    ```

- If you make changes to `package.json`, the `Dockerfile`, or `docker-compose.yml`, stop the docker composition and rebuild the images using __Step 4__.
- Signed-in sessions are kept in memory, so restarting the web app logs everyone out and clears the users list.
