#Start with a base image that includes CUDA and Python
FROM nvcr.io/nvidia/l4t-pytorch:r32.7.1-pth1.10-py3

#Add Kitware's APT repository for up to date CMake versions
#Necessary for building OpenCV
RUN wget -O - https://apt.kitware.com/keys/kitware-archive-latest.asc 2>/dev/null | gpg --dearmor - | tee /usr/share/keyrings/kitware-archive-keyring.gpg >/dev/null
RUN echo 'deb [signed-by=/usr/share/keyrings/kitware-archive-keyring.gpg] https://apt.kitware.com/ubuntu/ bionic main' | tee /etc/apt/sources.list.d/kitware.list >/dev/null
RUN apt-get update && apt-get install -y wget

#Install required system libraries
RUN apt-get update && apt-get install -y \
    liblapack-dev \
    libblas-dev \
    gfortran \
    libfreetype6-dev \
    libopenblas-base \
    libopenmpi-dev \
    libjpeg-dev \
    zlib1g-dev \
    python3-seaborn \
    wget \
    git \
    build-essential \
    cmake \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    libglib2.0-dev \
    libgstrtspserver-1.0-dev \
    && rm -rf /var/lib/apt/lists/*

#Upgrade pip
RUN python3 -m pip install --upgrade pip

#Install Python packages
RUN pip3 install --no-cache-dir \
    numpy==1.19.0 \
    pandas==0.22.0 \
    Pillow==8.4.0 \
    PyYAML==3.12 \
    scipy==1.5.4 \
    psutil \
    tqdm==4.64.1 \
    imutils \
    pycuda \
    opencv-python==4.3.0.38 \
    Jetson.GPIO==2.0.17 \
    jetson-stats==3.1.4

#Clone and build OpenCV with GStreamer support. This is needed for camera access.
RUN git clone https://github.com/opencv/opencv.git && \
    cd opencv && \
    git checkout 4.3.0 && \
    mkdir build && \
    cd build && \
    cmake -D CMAKE_BUILD_TYPE=RELEASE \
          -D CMAKE_INSTALL_PREFIX=/usr/local \
          -D WITH_GSTREAMER=ON \
          -D WITH_LIBV4L=ON \
          -D BUILD_opencv_python3=ON \
          -D PYTHON3_EXECUTABLE=$(which python3) \
          -D PYTHON3_INCLUDE_DIR=$(python3 -c "from distutils.sysconfig import get_python_inc; print(get_python_inc())") \
          -D PYTHON3_PACKAGES_PATH=$(python3 -c "from distutils.sysconfig import get_python_lib; print(get_python_lib())") \
          .. && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    cd ../.. && \
    rm -rf opencv

#Set the working directory under /app
WORKDIR /app

#Copy application code
COPY . /app