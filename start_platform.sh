#!/usr/bin/env bash

# ==============================================================================
# Distributed Video Transcoding Platform - Multi-Terminal Launcher
# Launches:
#   - 1x Frontend (Next.js)
#   - 1x Backend API (FastAPI port 7500)
#   - 2x Planner Consumers
#   - 3x Transcoder Worker Consumers
#   - 2x Rendition Finalizer Consumers
#   - 2x Video Asset Finalizer Consumers
# Each process runs in a SEPARATE terminal window (not split/tabs).
# ==============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================================================="
echo " Launching Distributed Video Transcoding Platform Cluster"
echo " Root Directory: $ROOT_DIR"
echo "=========================================================================="

# Function to spawn a command in a separate terminal window
spawn_terminal() {
    local title="$1"
    local cmd="$2"

    echo "  -> Spawning window: [$title]"

    if command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal --window --title="$title" -- bash -c "$cmd; exec bash"
    elif command -v xterm >/dev/null 2>&1; then
        xterm -T "$title" -e bash -c "$cmd; exec bash" &
    elif command -v xfce4-terminal >/dev/null 2>&1; then
        xfce4-terminal --window --title="$title" -e "bash -c '$cmd; exec bash'" &
    elif command -v konsole >/dev/null 2>&1; then
        konsole --new-tab=false --title "$title" -e bash -c "$cmd; exec bash" &
    elif command -v kitty >/dev/null 2>&1; then
        kitty --title "$title" bash -c "$cmd; exec bash" &
    elif command -v alacritty >/dev/null 2>&1; then
        alacritty --title "$title" -e bash -c "$cmd; exec bash" &
    elif command -v x-terminal-emulator >/dev/null 2>&1; then
        x-terminal-emulator -T "$title" -e bash -c "$cmd; exec bash" &
    else
        echo "Error: No supported terminal emulator found."
        exit 1
    fi

    # Small delay between spawning windows to preserve execution order
    sleep 0.4
}

# 1. Frontend Next.js Dev Server (1 instance)
spawn_terminal "Frontend (Next.js - Port 3000)" \
    "cd '$ROOT_DIR/frontend' && npm run dev"

# 2. Backend FastAPI Server (1 instance)
spawn_terminal "Backend API (FastAPI - Port 7500)" \
    "cd '$ROOT_DIR/backend' && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 7500 --reload"

# 3. Planner Consumers (2 instances)
spawn_terminal "Planner Consumer #1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m planner.main"

spawn_terminal "Planner Consumer #2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m planner.main"

# 4. Transcoder Workers (3 instances)
spawn_terminal "Worker Transcoder #1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m worker.main"

spawn_terminal "Worker Transcoder #2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m worker.main"

spawn_terminal "Worker Transcoder #3" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m worker.main"

# 5. Rendition Finalizers (2 instances)
spawn_terminal "Rendition Finalizer #1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m finalizer.main"

spawn_terminal "Rendition Finalizer #2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m finalizer.main"

# 6. Video Asset Finalizers (2 instances)
spawn_terminal "Video Asset Finalizer #1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m video_finalizer.main"

spawn_terminal "Video Asset Finalizer #2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m video_finalizer.main"

echo "=========================================================================="
echo " Successfully spawned 11 separate terminal windows:"
echo "   - 1x Frontend (Next.js)"
echo "   - 1x Backend (FastAPI)"
echo "   - 2x Planners"
echo "   - 3x Workers"
echo "   - 2x Rendition Finalizers"
echo "   - 2x Video Finalizers"
echo "=========================================================================="
