# Use the official Python Docker image (OS: Debian)
FROM python:3.9.22-bookworm

WORKDIR /gate-handler

COPY requirements.txt /gate-handler/

# Update, upgrade and install system dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y sudo libdbus-1-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install the required Python packages from the requirements.txt file
RUN pip install --no-cache-dir -r /gate-handler/requirements.txt

# Copy the contents required for running the gate-handler
COPY . /gate-handler/

# Expose Uvicorn
EXPOSE 3000

# Run the gate-handler script and allow bash access
CMD ["/bin/bash", "-c", "python gate-handler.py"]
