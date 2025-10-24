# SmartGate Web App

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
### 3. Build the docker images
Now, to run the SmartGate Web App, you need to build the images using the docker-compose file in the current directory.

```sh
docker-compose up --build -d
```

### 4. Shutdown the docker images
Once your done testing the web application, you can remove the containers running on your machine by doing the following command:

```sh
docker-compose down --volumes
```

## SmartGate Web App Commands

Run Python Web App
```bash
python app.py
```

Access SmartGate Database Inside Docker Container
```bash
psql -h postgres -U admin -d smartgatedb
```

Access SmartGate Database Outside Docker Container
```bash
psql -h localhost -U admin -d smartgatedb
```

Database Password: smartgate (see `docker-compose.yml`)

This will start the containers allowing you to run Docker commands and access necessary services.

This `README.md` will guide users through the steps needed to clone the repository, build the images in docker compose file, and run it locally, enabling the container to communicate with the containers on the host machine.

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

- If you make changes to the `requirements.txt`, `Dockerfile`, or `docker-compose.yml`, make sure stop the docker composition from running and rebuild the images using __Step 3__

- If you make **changes to the sql files** or **stop the docker-compose from running** be sure to remove the docker volumes and containers related to the web-app by doing:

  Linux and MacOS:
  ```bash
  ./cleanup.sh
  ```

  Windows:
  ```powershell
  .\cleanup.ps1
  ```

  This will give you a fresh build of the images to be run as containers after you do __Step 3__

  
