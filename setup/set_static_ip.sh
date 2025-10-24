#!/bin/bash

### Set Static IP ###
#Would need to set default or static IPs to be accessible on boot. This script needs to be run with root privileges (sudo).
#This still needs to be tested for different subnets

# Define the service file path
SERVICE_NAME="static-ip-addresses"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root"
  exit
fi

# Create the service file content
cat << EOF > "$SERVICE_FILE"
[Unit]
Description=Add IP addresses to wlan0
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'sleep 15; /sbin/ip addr add 192.168.0.21/24 dev wlan0; /sbin/ip addr add 192.168.0.26/24 dev wlan0; /sbin/ip addr add 192.168.0.27/24 dev wlan0'
RemainAfterExit=yes

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