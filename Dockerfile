# JetPack 7.2 (L4T r39.2) — no official l4t-jetpack/l4t-pytorch image exists for r39 yet,
# so building from NVIDIA's generic CUDA devel image instead. Tegra-specific libs
# (Argus camera, NVENC/NVDEC, etc.) get mounted in at runtime via the NVIDIA Container
# Runtime (--runtime nvidia), not baked into this image.
#
# VERIFY: confirm this tag matches your host's actual CUDA version before building —
# run `nvcc --version` or `dpkg -l | grep cuda-toolkit` on the Nano first.
FROM nvcr.io/nvidia/cuda:13.2.1-cudnn-devel-ubuntu24.04

# NVIDIA's Jetson L4T apt repo, copied from the host — needed to install
# TensorRT matching the exact host version, since engine files are
# version-locked to the library that built/runs them.
COPY docker/apt/jetson-ota-public.asc /etc/apt/trusted.gpg.d/jetson-ota-public.asc
COPY docker/apt/nvidia-l4t-apt-source.list /etc/apt/sources.list.d/nvidia-l4t-apt-source.list
COPY docker/apt/nvidia-repo-pin /etc/apt/preferences.d/nvidia-repo-pin

# Remove the generic CUDA SBSA repo baked into the base image — it's for
# datacenter ARM (Grace/Thor), not Tegra/Jetson, and its TensorRT packages
# conflict with the Jetson-specific ones we actually need.
RUN rm -f /etc/apt/sources.list.d/cuda-ubuntu2404-sbsa.list

# Ubuntu 24.04 ships a modern cmake/gcc by default — the old Kitware repo + apt bootstrap
# the original Dockerfile needed for Ubuntu 18.04 shouldn't be necessary anymore.
RUN apt-get update && apt-get install -y \
    liblapack-dev \
    libblas-dev \
    gfortran \
    libfreetype6-dev \
    libopenblas0 \
    libopenmpi-dev \
    libjpeg-dev \
    zlib1g-dev \
    python3-seaborn \
    python3-pip \
    python3-dev \
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
    kmod \
    tensorrt=10.16.2.10-1+cuda13.2 \
    python3-libnvinfer=10.16.2.10-1+cuda13.2 \
    && rm -rf /var/lib/apt/lists/*



# PyTorch: JetPack 7.2's CUDA 13.2 only has prerelease wheels right now — the --pre
# flag is required or pip won't see them at all.
RUN pip3 install --pre torch --extra-index-url https://download.pytorch.org/whl/cu132 --break-system-packages

RUN pip3 install --no-cache-dir --break-system-packages \
    numpy \
    pandas \
    Pillow \
    PyYAML \
    scipy \
    psutil \
    tqdm \
    imutils \
    pycuda \
    jetson-stats \
    Jetson.GPIO

# Remove CUDA forward-compatibility libs — not needed since container CUDA matches
# the host driver exactly, and their presence triggers a known panic in
# nvidia-container-toolkit 1.19.1's ELF-parsing hook on this JetPack 7.2 setup.
RUN rm -rf /usr/local/cuda-13.2/compat /usr/local/cuda-13.2/compat_orin

# VERIFY: confirm TensorRT python bindings are actually available/importable once built —
# these may need to come from the host via the container runtime's CSV mount rather than
# pip/apt inside the image. Check `python3 -c "import tensorrt"` after first build.

# Build OpenCV from source with GStreamer support (still needed for the nvarguscamerasrc
# pipeline — pip's opencv-python wheels don't include GStreamer support).
RUN git clone https://github.com/opencv/opencv.git && \
    cd opencv && \
    git checkout 4.9.0 && \
    mkdir build && \
    cd build && \
    cmake -D CMAKE_BUILD_TYPE=RELEASE \
          -D CMAKE_INSTALL_PREFIX=/usr/local \
          -D WITH_GSTREAMER=ON \
          -D WITH_LIBV4L=ON \
          -D BUILD_opencv_python3=ON \
          -D PYTHON3_EXECUTABLE=$(which python3) \
          -D PYTHON3_INCLUDE_DIR=$(python3 -c "from sysconfig import get_paths; print(get_paths()['include'])") \
          -D PYTHON3_PACKAGES_PATH=$(python3 -c "from sysconfig import get_paths; print(get_paths()['purelib'])") \
          .. && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    cd ../.. && \
    rm -rf opencv

WORKDIR /app
COPY . /app