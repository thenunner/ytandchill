# Stage 1: Build Frontend
FROM node:20 AS frontend-builder

WORKDIR /frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Stage 2: Production Runtime
FROM python:3.12-slim

# Install system dependencies (ffmpeg for video processing, curl/unzip for Deno, aria2 for download acceleration)
RUN apt-get update && \
    apt-get install -y ffmpeg aria2 curl unzip && \
    rm -rf /var/lib/apt/lists/*

# Install Deno from GitHub releases (required for yt-dlp YouTube support as of v2025.11.12)
# Installing 'deno' binary (NOT 'denort' which is runtime-only)
RUN DENO_VERSION=$(curl -fsSL https://api.github.com/repos/denoland/deno/releases/latest | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/') && \
    curl -fsSLO "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip" && \
    unzip deno-x86_64-unknown-linux-gnu.zip && \
    mv deno /usr/local/bin/ && \
    chmod +x /usr/local/bin/deno && \
    rm deno-x86_64-unknown-linux-gnu.zip && \
    deno --version

# Create app directory
WORKDIR /app

# Copy Python requirements and install
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend Python files
COPY backend/*.py ./
COPY backend/routes/ ./routes/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /frontend/dist ./dist

# Create required directories (data, downloads, and logs will be mounted as volumes)
RUN mkdir -p data downloads logs

# Set ownership of /app to nobody:users (99:100) so app can write lock files
RUN chown -R 99:100 /app

# Environment variables with defaults
ENV PORT=4099
ENV PYTHONUNBUFFERED=1
ENV HOME=/app

# Expose port
EXPOSE ${PORT}

# Run as nobody user (99:100) for Unraid compatibility
USER 99:100

# Start application
CMD ["python", "app.py"]
