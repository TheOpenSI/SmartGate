# Use the official Python Docker image (OS: Debian)
FROM python:3.9.22-bookworm

WORKDIR /gate-handler

# Copy the contents required for running the gate-handler
COPY . /gate-handler/

# Update, upgrade and install system dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y sudo libdbus-1-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install the required Python packages from the requirements.txt file
RUN pip install --no-cache-dir -r /gate-handler/requirements.txt

# Customize Bash
RUN cat <<EOF > ~/.bashrc
# If not running interactively, don't do anything
[ "$-" != "${-#*i}" ] && return
# Customize the commands
alias ls='ls --color=auto'
alias grep='grep --color=auto'
# Change prompt to show the current directory and the name of the container
PS1='[\W]\$ '
EOF

# Expose Uvicorn
EXPOSE 3000

# Run the gate-handler script and allow bash access
CMD ["/bin/bash", "-c", "python gate-handler.py"]
