#!/bin/bash
set -e

echo "=========================================="
echo "YT and Chill - Push to GitHub"
echo "=========================================="
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "ERROR: git is not installed on this system"
    echo "Please install git first or run this script from your Unraid terminal"
    exit 1
fi

# Use the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Working directory: $SCRIPT_DIR"
echo ""

# Initialize repository first
echo "Initializing git repository..."
if [ ! -d .git ]; then
    git init
fi

# Configure git (you may want to customize these)
echo "Configuring git..."
git config user.name "thenunner"
read -p "Enter your GitHub email: " email
git config user.email "$email"

# Add all files
echo "Staging files..."
git add .

# Create commit
echo "Creating initial commit..."
git commit -m "Initial commit: YT and Chill - YouTube downloader and library manager" || echo "Files already committed"

# Add remote
echo "Adding GitHub remote..."
git remote add origin https://github.com/thenunner/ytandchill.git 2>/dev/null || git remote set-url origin https://github.com/thenunner/ytandchill.git

# Set branch to main
echo "Setting main branch..."
git branch -M main

# Push to GitHub
echo ""
echo "Ready to push to GitHub!"
echo "You will need to authenticate with:"
echo "  - Personal Access Token (recommended)"
echo "  - Or SSH key"
echo ""
read -p "Press Enter to push to GitHub..."

git push -u origin main

echo ""
echo "=========================================="
echo "Success! Repository pushed to GitHub"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Set up GitHub Actions for auto-builds"
echo "2. Update Unraid template to use GHCR"
echo "=========================================="
