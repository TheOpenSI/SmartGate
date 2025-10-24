#!/bin/bash

### Generate the systemd service ###
#This will produce a service file for the SmartGate to run on boot
#Service must be set up with the Jetson Nano accordingly with the Requirements satisfied

#Set service configurations
SERVICE_NAME="smartgate"
PROJECT_DIR=$(realpath "$(dirname "$(readlink -f "$0")")/../")
MAIN_DIR="$PROJECT_DIR/src/main"
MAIN_SCRIPT="$MAIN_DIR/live_detection.py"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

if [ "$EUID" -ne 0 ]; then 
  echo "[-] Please run as root"
  exit
fi

#Setup the service file
cat > $SERVICE_FILE << EOF
[Unit]
Description=SmartGate Marsupial Detection Service
After=network.target

[Service]
#Set environment accordingly since the PyCUDA installation was set locally to user
Environment="PATH=/usr/local/cuda-10.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="LD_LIBRARY_PATH=/usr/local/cuda-10.2/lib64"
Environment="PYTHONPATH=$HOME/.local/lib/python3.6/site-packages"

ExecStart=/usr/bin/python3 $MAIN_SCRIPT
WorkingDirectory=$MAIN_DIR
Restart=always
RestartSec=5

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