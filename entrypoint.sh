#!/bin/sh

PUID=${PUID:-99}
PGID=${PGID:-100}

echo "Starting with UID:GID = $PUID:$PGID"

# Fix ownership of mounted volumes
chown -R $PUID:$PGID /app/data /app/downloads /app/logs 2>/dev/null || true

# Run as specified user
exec su-exec $PUID:$PGID python app.py
