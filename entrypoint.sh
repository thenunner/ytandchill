#!/bin/bash

# Default to Unraid's nobody:users (99:100) if not specified
PUID=${PUID:-99}
PGID=${PGID:-100}

# External port (what users connect to) - default 4099
export PORT=${PORT:-4099}

echo "Starting with UID:GID = $PUID:$PGID"
echo "nginx listening on port $PORT, serving media directly"

# Update ownership of app directories
chown -R $PUID:$PGID /app/data /app/downloads /app/logs 2>/dev/null || true

# Create nginx temp directories
mkdir -p /tmp/nginx_client_body /tmp/nginx_proxy /tmp/nginx_fastcgi /tmp/nginx_uwsgi /tmp/nginx_scgi
chown -R $PUID:$PGID /tmp/nginx_client_body /tmp/nginx_proxy /tmp/nginx_fastcgi /tmp/nginx_uwsgi /tmp/nginx_scgi

# Generate nginx.conf from template (substitute PORT env var)
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start nginx in background
nginx

# Run Python app as specified user on internal port 5000 (nginx proxies to this)
exec gosu $PUID:$PGID env PORT=5000 python app.py
