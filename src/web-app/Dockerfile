# Official Node.js LTS image. It is multi-architecture, so the same Dockerfile
# builds on a PC (amd64) and on the Jetson Orin Nano (arm64).
FROM node:24.18.0-bookworm-slim

# Set the working directory inside the container
WORKDIR /SmartGate

# Install only the packages listed in package-lock.json (no dev tools)
COPY package.json package-lock.json /SmartGate/
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the application code to the container
COPY . /SmartGate/

# Run as the image's built-in non-root user
USER node

EXPOSE 8000

CMD ["node", "app.js"]
