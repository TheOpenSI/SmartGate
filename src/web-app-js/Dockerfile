# Use the official Node.js image based on Debian
FROM node

# Set the working directory inside the container
WORKDIR /web-app-js

# Copy the current directory contents into the container at /web-app-js
COPY . /web-app-js/

# Run the apt commands involving update, upgrade and then install new packages
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y postgresql && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Update npm to the latest version
RUN npm install -g npm@latest

# Customize Bash
RUN cat <<EOF > ~/.bashrc
# If not running interactively, don't do anything
[ "$-" != "${-#*i}" ] && return
# Customize the commands
alias ls='ls --color=auto'
alias grep='grep --color=auto'
alias enterdb='psql -h db -U admin -d smartgatedb'
# Change prompt to show the current directory and the name of the container
PS1='[sgwebjs \W]\$ '
EOF

# Expose a port for web server
EXPOSE 8000

# Install the required Node.js packages, update the existing ones and run the app
CMD ["/bin/bash", "-c", "npm install && npm update && node app.js"]
