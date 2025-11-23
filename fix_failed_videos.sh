#!/bin/bash

# Fix MOOV atoms for previously failed videos
# These 15 files failed because the container stopped during processing

# Don't exit on errors - we want to handle them gracefully
set -o pipefail

# Configuration
CONTAINER_NAME="ytandchill"
DB_PATH="/app/data/youtube_downloader.db"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Failed files to process
FAILED_FILES=(
    "/app/downloads/Red_Bull_Bike/yx1z2Ouao8s.mp4"
    "/app/downloads/Red_Bull_Bike/zGKI4ZjwxSg.mp4"
    "/app/downloads/Red_Bull_Motorsports/3tTMJqvlPrw.mp4"
    "/app/downloads/Red_Bull_Motorsports/4NyYCuX8MeA.mp4"
    "/app/downloads/Red_Bull_Motorsports/4UBeEphrpDM.mp4"
    "/app/downloads/Red_Bull_Motorsports/5486SeHw160.mp4"
    "/app/downloads/Red_Bull_Motorsports/8Q8vk51DjYQ.mp4"
    "/app/downloads/Red_Bull_Motorsports/K6HO-SJyF5o.mp4"
    "/app/downloads/Red_Bull_Motorsports/LnQhi_wdk48.mp4"
    "/app/downloads/Red_Bull_Motorsports/Nje3RwvMduw.mp4"
    "/app/downloads/Red_Bull_Motorsports/TJjbnhDcJrg.mp4"
    "/app/downloads/Red_Bull_Motorsports/TlCiDcDufTo.mp4"
    "/app/downloads/Red_Bull_Motorsports/UfJUe_a7iB8.mp4"
    "/app/downloads/Red_Bull_Motorsports/_JnzHbW-fQU.mp4"
    "/app/downloads/Red_Bull_Motorsports/dxCl8HNz-qM.mp4"
)

# Function to update database with new file size
update_database() {
    local video_file="$1"
    local new_size="$2"

    # Extract yt_id from filename (remove extension)
    local filename=$(basename "$video_file")
    local yt_id="${filename%.*}"

    # Update database using Python (sqlite3 module is built-in)
    docker exec "$CONTAINER_NAME" python3 -c "
import sqlite3
conn = sqlite3.connect('$DB_PATH')
cursor = conn.cursor()
cursor.execute('UPDATE videos SET file_size_bytes = ? WHERE yt_id = ?', ($new_size, '$yt_id'))
conn.commit()
conn.close()
" 2>> "$LOG_FILE"

    if [ $? -eq 0 ]; then
        echo "  ${GREEN}✓ Database updated${NC}"
        ((DB_UPDATED++))
        return 0
    else
        echo "  ${YELLOW}⚠ Failed to update database${NC}"
        return 1
    fi
}

# Check if container is running
echo "Checking if container '$CONTAINER_NAME' is running..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Container '$CONTAINER_NAME' is not running${NC}"
    echo "Please start the container first"
    exit 1
fi
echo -e "${GREEN}Container is running${NC}\n"

# Check if ffmpeg is available in container
echo "Verifying ffmpeg is available in container..."
if ! docker exec "$CONTAINER_NAME" which ffmpeg > /dev/null 2>&1; then
    echo -e "${RED}Error: ffmpeg not found in container${NC}"
    exit 1
fi
echo -e "${GREEN}ffmpeg is available${NC}"

# Check if python3 is available in container
echo "Verifying python3 is available in container..."
if ! docker exec "$CONTAINER_NAME" which python3 > /dev/null 2>&1; then
    echo -e "${RED}Error: python3 not found in container${NC}"
    exit 1
fi
echo -e "${GREEN}python3 is available${NC}\n"

TOTAL_FILES=${#FAILED_FILES[@]}
echo -e "${BLUE}Processing $TOTAL_FILES previously failed files${NC}\n"

# Counters
SUCCESSFUL=0
FAILED=0
SKIPPED=0
DB_UPDATED=0
CURRENT=0

# Log file - use script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/fix_failed_videos.log"
echo "Starting moov atom fix for failed files at $(date)" > "$LOG_FILE"
echo "Processing $TOTAL_FILES files" >> "$LOG_FILE"
echo ""

# Process each file
for VIDEO_FILE in "${FAILED_FILES[@]}"; do
    ((CURRENT++))

    echo -e "${BLUE}[$CURRENT/$TOTAL_FILES]${NC} Processing: $VIDEO_FILE"

    # Create temp file path - keep the extension so ffmpeg recognizes it
    FILE_EXT="${VIDEO_FILE##*.}"
    FILE_BASE="${VIDEO_FILE%.*}"
    TEMP_FILE="${FILE_BASE}.tmp.${FILE_EXT}"

    # Apply faststart fix
    echo "  Applying faststart fix..."
    if docker exec "$CONTAINER_NAME" ffmpeg -v error -i "$VIDEO_FILE" \
        -movflags +faststart -c copy "$TEMP_FILE" 2>> "$LOG_FILE"; then

        # Get file sizes for comparison
        ORIGINAL_SIZE=$(docker exec "$CONTAINER_NAME" stat -f%z "$VIDEO_FILE" 2>/dev/null || \
                       docker exec "$CONTAINER_NAME" stat -c%s "$VIDEO_FILE" 2>/dev/null)
        TEMP_SIZE=$(docker exec "$CONTAINER_NAME" stat -f%z "$TEMP_FILE" 2>/dev/null || \
                   docker exec "$CONTAINER_NAME" stat -c%s "$TEMP_FILE" 2>/dev/null)

        # Verify temp file is reasonable (within 1% of original size)
        SIZE_DIFF=$((TEMP_SIZE * 100 / ORIGINAL_SIZE))
        if [ "$SIZE_DIFF" -ge 99 ] && [ "$SIZE_DIFF" -le 101 ]; then
            # Replace original with fixed version
            if docker exec "$CONTAINER_NAME" mv "$TEMP_FILE" "$VIDEO_FILE"; then
                echo -e "  ${GREEN}✓ File updated${NC}"

                # Get new file size after replacement
                NEW_SIZE=$(docker exec "$CONTAINER_NAME" stat -f%z "$VIDEO_FILE" 2>/dev/null || \
                          docker exec "$CONTAINER_NAME" stat -c%s "$VIDEO_FILE" 2>/dev/null)

                # Update database with new file size
                update_database "$VIDEO_FILE" "$NEW_SIZE"

                ((SUCCESSFUL++))
                echo "SUCCESS: $VIDEO_FILE (old: $ORIGINAL_SIZE bytes, new: $NEW_SIZE bytes)" >> "$LOG_FILE"
            else
                echo -e "  ${RED}✗ Failed to replace original file${NC}"
                docker exec "$CONTAINER_NAME" rm -f "$TEMP_FILE" 2>/dev/null || true
                ((FAILED++))
                echo "FAILED (replace): $VIDEO_FILE" >> "$LOG_FILE"
            fi
        else
            echo -e "  ${YELLOW}⚠ Skipped - size mismatch (original: $ORIGINAL_SIZE, new: $TEMP_SIZE)${NC}"
            docker exec "$CONTAINER_NAME" rm -f "$TEMP_FILE" 2>/dev/null || true
            ((SKIPPED++))
            echo "SKIPPED (size): $VIDEO_FILE (original: $ORIGINAL_SIZE, new: $TEMP_SIZE)" >> "$LOG_FILE"
        fi
    else
        echo -e "  ${RED}✗ ffmpeg failed${NC}"
        docker exec "$CONTAINER_NAME" rm -f "$TEMP_FILE" 2>/dev/null || true
        ((FAILED++))
        echo "FAILED (ffmpeg): $VIDEO_FILE" >> "$LOG_FILE"
    fi

    echo ""
done

# Summary
echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}                  SUMMARY                      ${NC}"
echo -e "${BLUE}===============================================${NC}"
echo -e "Total files:      $TOTAL_FILES"
echo -e "${GREEN}Successful:       $SUCCESSFUL${NC}"
echo -e "${GREEN}DB updated:       $DB_UPDATED${NC}"
echo -e "${YELLOW}Skipped:          $SKIPPED${NC}"
echo -e "${RED}Failed:           $FAILED${NC}"
echo -e "${BLUE}===============================================${NC}"
echo ""
echo "Log saved to: $LOG_FILE"
echo "Completed at $(date)" >> "$LOG_FILE"
