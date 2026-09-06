#!/bin/bash
### Setup as per requirements ###
#This script is for setting up the SmartGate locally within the Jetson Nano.
#This step is required if you're deploying under a fresh system
#Ensure that the script runs as super user
if [ "$EUID" -ne 0 ]; then 
  echo "[-] Please run as root"
  exit
fi

echo "[+] Updating system packages..."
sudo apt-get update
sudo apt-get install -y liblapack-dev libblas-dev gfortran libfreetype6-dev libopenblas-base libopenmpi-dev libjpeg-dev zlib1g-dev
sudo apt-get install -y python3-pip

#Update Pip
python3 -m pip install --upgrade pip

#Install all the Python packages located from requirements.txt
pip3 install -r requirements.txt

#Install additional required Python packages
pip3 install imutils psutil Pillow

#Set up CUDA environment paths
echo "[+] Setting up CUDA environment paths..."
CUDA_EXPORTS='
# CUDA PATH
export PATH=/usr/local/cuda/bin:${PATH}
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH}
'
# Add to both root and smartgate user bashrc
echo "$CUDA_EXPORTS" >> /home/smartgate/.bashrc
export PATH=/usr/local/cuda/bin:${PATH}
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH}

#Installing PyCUDA
echo "[+] Installing PyCUDA..."
python3 -m pip install pycuda --user

#Seaborn installation for data-visualization
sudo apt install -y python3-seaborn

#Install torch and torchvision
echo "[+] Installing PyTorch and TorchVision..."
wget https://nvidia.box.com/shared/static/fjtbno0vpo676a25cgvuqc1wty0fkkg6.whl -O torch-1.10.0-cp36-cp36m-linux_aarch64.whl
pip3 install torch-1.10.0-cp36-cp36m-linux_aarch64.whl
git clone --branch v0.11.1 https://github.com/pytorch/vision torchvision
cd torchvision
sudo python3 setup.py install 
cd ..

#Create libnvinfer.so.8 symlink for TRT7 compatibility
echo "[+] Creating libnvinfer symlink for TRT7 compatibility..."
if [ -f /usr/lib/aarch64-linux-gnu/libnvinfer.so.7 ] && [ ! -f /usr/lib/aarch64-linux-gnu/libnvinfer.so.8 ]; then
    sudo ln -s /usr/lib/aarch64-linux-gnu/libnvinfer.so.7 /usr/lib/aarch64-linux-gnu/libnvinfer.so.8
    echo "[+] Symlink created: libnvinfer.so.8 -> libnvinfer.so.7"
else
    echo "[*] Symlink already exists or libnvinfer.so.7 not found"
fi

echo "[+] Setup complete!"
echo "[+] Requirements now satisfied"
echo "[+] Please run 'source ~/.bashrc' or re-login for CUDA paths to take effect"
echo "[+] If using the marsupial .pt model, run setup/convert_models.sh to generate the .engine file"