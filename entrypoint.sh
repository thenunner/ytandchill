#!/bin/bash

# Default to Unraid's nobody:users (99:100) if not specified
PUID=${PUID:-99}
PGID=${PGID:-100}

echo "Starting with UID:GID = $PUID:$PGID"

# Update ownership of app directories
chown -R $PUID:$PGID /app/data /app/downloads /app/logs 2>/dev/null || true

# Run the application as the specified user
exec gosu $PUID:$PGID python app.py
