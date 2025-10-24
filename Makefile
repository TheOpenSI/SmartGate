#This is to build the Docker image, more info and alternative scripts will be provided (dockercompose)

#run:
#	sudo docker run --privileged --runtime nvidia --device /dev/gpiochip0 --device=/dev/video0:/dev/video0 -it smartgate:latest /bin/bash

#Run shell environment of Docker container
#Note that this is running under privileged mode (root). For better security try to use non-root user within container
run:
	sudo docker run --privileged --runtime nvidia \
	--network host \
	-it --rm \
	--device /dev/video0 \
	--device /dev/nvhost-ctrl \
	--device /dev/nvhost-ctrl-gpu \
	--device /dev/nvhost-prof-gpu \
	--device /dev/nvmap \
	--device /dev/nvhost-gpu \
	--device /dev/nvhost-as-gpu \
	-v /tmp/argus_socket:/tmp/argus_socket \
	-v /etc/enctune.conf:/etc/enctune.conf \
	-v /home/nvidia/tegra_multimedia_api:/home/nvidia/tegra_multimedia_api \
	smartgate:latest /bin/bash

#Build docker environment
build:
	sudo docker build -t smartgate:latest .
