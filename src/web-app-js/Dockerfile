# Use the official Node.js image based on Debian
FROM node

# Set the working directory inside the container
WORKDIR /web-app-js

# Run the apt commands involving update, upgrade and then install new packages
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y sudo postgresql man-db neofetch neovim && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Update npm to the latest version
RUN npm install -g npm@latest

# Copy package.json and package-lock.json into the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Update all npm packages to their latest compatible versions
RUN npm update

# Expose a port for web server
EXPOSE 8000

# Start the bash shell
CMD ["bash"]
