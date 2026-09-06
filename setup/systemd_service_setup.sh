#!/bin/bash

### Generate the systemd service (Docker-based) ###
#This will produce a service file to run the SmartGate Docker container on boot.
#The `smartgate:latest` image must already be built (see SETUP_ORIN_NANO.md) before starting
#this service - the service only runs the container, it does not build it.
#
#NOTE: this script generates a fully generic unit - it assumes standard/OEM Jetson hardware.
#If you're running on a non-OEM carrier board that needs the pinmux/carrier-board-ID workaround,
#that fix stays OUTSIDE this repo entirely (see the "Third-party carrier board notes" section of
#SETUP_ORIN_NANO.md) and layers on top of this service as a systemd drop-in - it does not belong
#in this script.

#Set service configurations
SERVICE_NAME="smartgate"
IMAGE_NAME="smartgate:latest"
PROJECT_DIR=$(realpath "$(dirname "$(readlink -f "$0")")/../")
MODELS_DIR="$PROJECT_DIR/models"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root"
  exit
fi

#Setup the service file
cat > $SERVICE_FILE << EOF
[Unit]
Description=SmartGate Docker Container
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
#Belt-and-braces: clear out any stale container left over from a previous boot/crash before starting.
ExecStartPre=-/usr/bin/docker rm -f $SERVICE_NAME
ExecStart=/usr/bin/docker run --rm --name $SERVICE_NAME \\
    --privileged --runtime nvidia --network host \\
    --device /dev/video0 \\
    --device /dev/gpiochip0 \\
    --device /dev/gpiochip1 \\
    --device /dev/nvhost-ctrl \\
    --device /dev/nvhost-ctrl-gpu \\
    --device /dev/nvhost-prof-gpu \\
    --device /dev/nvmap \\
    --device /dev/nvhost-gpu \\
    --device /dev/nvhost-as-gpu \\
    -v /tmp/argus_socket:/tmp/argus_socket \\
    -v /etc/enctune.conf:/etc/enctune.conf \\
    -v /home/nvidia/tegra_multimedia_api:/home/nvidia/tegra_multimedia_api \\
    -v $MODELS_DIR:/app/models \\
    -e JETSON_MODEL_NAME=JETSON_ORIN_NANO \\
    $IMAGE_NAME \\
    python3 src/main/live_detection.py
#docker stop sends SIGTERM to the container's PID 1 - live_detection.py catches this and runs
#cleanup()/all_pins_off() before exiting.
ExecStop=/usr/bin/docker stop -t 10 $SERVICE_NAME
Restart=on-failure
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF

#Set appropriate permissions if need be
#chmod 644 $SERVICE_FILE

#Reload systemd to recognize new service
echo "[+] Reloading systemd daemon..."
systemctl daemon-reload

#Enable the service to start on boot
echo "[+] Enabling $SERVICE_NAME.service"
systemctl enable $SERVICE_NAME.service

#Start the service
echo "[+] Starting $SERVICE_NAME.service"
systemctl start $SERVICE_NAME.service

echo "[+] Service $SERVICE_NAME has been created, enabled, and started."
echo "[+] You can check its status with: systemctl status $SERVICE_NAME.service"