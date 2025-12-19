# WebM to MP4 Conversion Guide

## Overview

iOS Safari does not support WebM video format. This guide helps you convert existing WebM files to MP4 for iOS compatibility.

## What Was Changed

### 1. Downloader Format Preference (✅ DONE)

**File**: `/appdata/backend/downloader.py` (line 416)

The download format string has been updated to prefer MP4 sources:

```python
'format': 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
```

**Result**: All NEW downloads will prefer MP4 format automatically.

### 2. Conversion Script Created

**File**: `/workspace/convert_webm_to_mp4.sh`

A bash script that converts existing WebM files to MP4 with iOS compatibility.

## How to Use the Conversion Script

### Prerequisites

- Script must be run from the **HOST** (outside the container)
- Docker container must be running
- ffmpeg is installed in the container (should already be there)

### Basic Usage

```bash
# From the /workspace directory on your HOST machine
./convert_webm_to_mp4.sh
```

### What It Does

1. ✅ Checks if container is running
2. ✅ Scans for all `.webm` files in `/data/ytandchill`
3. ✅ Shows count and asks for confirmation
4. ✅ Converts each file to MP4:
   - Tries fast codec copy first (if compatible)
   - Falls back to re-encoding if needed (H.264 + AAC)
   - Adds `-movflags +faststart` for iOS streaming
5. ✅ Updates database to point to new `.mp4` files
6. ✅ Keeps original WebM files as backup (configurable)
7. ✅ Shows progress and summary
8. ✅ Creates log file in `/workspace/webm_convert_YYYYMMDD_HHMMSS.log`

### Configuration Options

Edit the script to change these settings:

```bash
CONTAINER_NAME="ytandchill"    # Docker container name
TARGET_DIR="/data/ytandchill"  # Where to find videos
BACKUP_WEBM=true              # Keep WebM files (set to false to delete)
```

### Example Output

```
========================================
WebM to MP4 Converter (Docker)
Container: ytandchill
Target: /data/ytandchill
Backup WebM files: true
Started: 2025-12-19 20:30:00
========================================

Scanning for WebM files...
Found 110 WebM files

Configuration:
  - Files to convert: 110
  - Delete originals: No (keep backups)

Continue with conversion? This may take a while. (y/N): y

[1/110] Converting: Singles/video1.webm
  Attempting fast conversion (codec copy)...
  ✓ Converted (copy, 5242880 → 5245920 bytes, +0%)
  ✓ Database updated

[2/110] Converting: Singles/video2.webm
  Attempting fast conversion (codec copy)...
  Codec copy failed, re-encoding video...
  ✓ Converted (re-encode, 8388608 → 7340032 bytes, -12%)
  ✓ Database updated

...

========================================
CONVERSION SUMMARY
========================================
  Total files processed: 110
  Successfully converted: 108
  Database records updated: 108
  Already existed (skipped): 0
  Failed: 2

NOTE: Original WebM files have been kept as backups.
      You can safely delete them after verifying the MP4 files work.

Completed: 2025-12-19 21:15:00
Log saved to: /workspace/webm_convert_20251219_203000.log
========================================
```

## Conversion Details

### Fast Conversion (Codec Copy)

If the WebM video codec is compatible with MP4:
- **Method**: Codec copy (no re-encoding)
- **Speed**: Very fast (1-2 seconds per file)
- **Quality**: Lossless (identical quality)
- **Audio**: Converted to AAC

### Re-encoding

If codec copy fails (VP9 video not compatible):
- **Method**: Re-encode to H.264
- **Speed**: Slower (depends on file size)
- **Quality**: High (CRF 23, visually lossless for most content)
- **Audio**: AAC 128kbps
- **Settings**: Medium preset (balance of speed/quality)

### iOS Compatibility

All converted MP4 files include:
- ✅ H.264 video codec (supported on all iOS versions)
- ✅ AAC audio codec (supported on all iOS versions)
- ✅ `+faststart` flag (MOOV atom at beginning for streaming)

## Troubleshooting

### Container Not Running

```
✗ Error: Container 'ytandchill' is not running
```

**Solution**: Start the container first:
```bash
docker start ytandchill
```

### ffmpeg Not Found

```
✗ Error: ffmpeg not found in container
```

**Solution**: Rebuild the container (ffmpeg should be in the Dockerfile)

### Conversion Failed

Check the log file for detailed error messages:
```bash
cat /workspace/webm_convert_*.log
```

### Database Not Updated

If conversions succeed but database doesn't update:
- Check database file permissions
- Check if Python 3 is available in container
- Check database path: `/app/data/youtube_downloader.db` (inside container)
- Host path: `/mnt/user/appdata/ytandchill/data/youtube_downloader.db`

## After Conversion

### Verify MP4 Files Work

1. Test playback on iOS device
2. Check a few random videos to ensure quality
3. Verify database points to correct files

### Delete WebM Backups (Optional)

If everything works, you can delete the original WebM files:

```bash
# From HOST - BE CAREFUL!
docker exec ytandchill find /data/ytandchill -type f -name "*.webm" -delete

# Or, re-run the script with BACKUP_WEBM=false
```

### Re-run Script to Delete Originals

Edit the script and change:
```bash
BACKUP_WEBM=false
```

Then re-run. It will skip conversion (MP4s already exist) but will delete WebM files.

## Related Files

- `/workspace/fix_moov_atoms.sh` - Fixes MOOV atoms on existing MP4 files
- `/appdata/backend/downloader.py` - Download configuration (format preference)
- `/appdata/convert_webm_to_mp4.py` - Python version (for in-container execution)

## Support

If you encounter issues:
1. Check the log file for detailed errors
2. Verify container is running: `docker ps`
3. Check available disk space
4. Test a single file manually to isolate the issue
