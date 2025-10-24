# Use the official Python Docker image (OS: Debian)
FROM python:3.9.22-bookworm

# Custom command to enter the postgresql database
# Note: This command is not executed in the container, but it is a suggestion for the user to run in their terminal.
# RUN echo "alias connsgdb='psql -h postgres -U admin -d smartgatedb'" >> ~/.bashrc

# Set the working directory inside the container
WORKDIR /SmartGate

COPY requirements.txt /SmartGate/
# Copy the rest of the application code to the container
COPY . /SmartGate/

# Update, upgrade and install system dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y sudo nano libdbus-1-dev neofetch postgresql openssh-client openssh-server neovim && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install the required Python packages from the requirements.txt file
RUN pip install --no-cache-dir -r /SmartGate/requirements.txt

# Expose both Uvicorn (8000) & PostgreSQL (5432)
EXPOSE 8000 5432

# start the shell
ENTRYPOINT ["python", "app.py"]
