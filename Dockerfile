# Stage 1: Build Frontend
FROM node:18 AS frontend-builder

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
FROM python:3.11-slim

# Install system dependencies (ffmpeg for video processing)
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy Python requirements and install
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend Python files
COPY backend/*.py ./

# Copy built frontend from Stage 1
COPY --from=frontend-builder /frontend/dist ./dist

# Create required directories (data, downloads, and logs will be mounted as volumes)
RUN mkdir -p data downloads logs

# Set ownership of /app to nobody:users (99:100) so app can write lock files
RUN chown -R 99:100 /app

# Environment variables with defaults
ENV PORT=4099
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE ${PORT}

# Run as nobody user (99:100) for Unraid compatibility
USER 99:100

# Start application
CMD ["python", "app.py"]
