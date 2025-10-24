### Run only if using the ArduCam IMX477 in order to set up drivers ###
# If already have this installed and need to uninstall for whatever reason, run the command and reboot: sudo dpkg -r arducam-nvidia-l4t-kernel
read -p "[*] Install ArduCam IMX477 drivers (install this if you're using the ArduCam IMX477) [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "[+] Proceeding..."
    mkdir -p build
    #ArduCam docs (Jetson Nano): https://docs.arducam.com/Nvidia-Jetson-Camera/Jetvariety-Camera/Quick-Start-Guide/
    wget https://github.com/ArduCAM/MIPI_Camera/releases/download/v0.0.3/install_full.sh -O build/install_full.sh
    chmod +x build/install_full.sh
    build/install_full.sh -m imx477
else
    echo "[-] Operation cancelled."
fi