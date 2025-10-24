#!/bin/bash

### Setup as per requirements ###
#This script is for setting up the SmartGate locally within the Jetson Nano.
#This step is required if you're deploying under a fresh system
#Ensure that the script runs as super user

if [ "$EUID" -ne 0 ]; then 
  echo "[-] Please run as root"
  exit
fi

sudo apt-get update
sudo apt-get install -y liblapack-dev libblas-dev gfortran libfreetype6-dev libopenblas-base libopenmpi-dev libjpeg-dev zlib1g-dev
sudo apt-get install -y python3-pip

#Update Pip
python3 -m pip install --upgrade pip

#Install all the Python packages located from requirements.txt
pip3 install -r requirements.txt

#Installing PyCUDA locally to user
export PATH=/usr/local/cuda-10.2/bin${PATH:+:${PATH}}
export LD_LIBRARY_PATH=/usr/local/cuda-10.2/lib64:$LD_LIBRARY_PATH
python3 -m pip install pycuda --user

#Seaborn installation for data-visualization
sudo apt install -y python3-seaborn

#Install torch and torchvision
wget https://nvidia.box.com/shared/static/fjtbno0vpo676a25cgvuqc1wty0fkkg6.whl -O torch-1.10.0-cp36-cp36m-linux_aarch64.whl
pip3 install torch-1.10.0-cp36-cp36m-linux_aarch64.whl
git clone --branch v0.11.1 https://github.com/pytorch/vision torchvision
cd torchvision
sudo python3 setup.py install 
cd ..

echo "[+] Setup complete!"
echo "[+] Requirements now satisfied"
