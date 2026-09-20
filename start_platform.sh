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
#   - 1x Transactional Outbox Dispatcher
#   - 1x Pipeline Reconciler
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
    local process_name="$2"
    local cmd="$3"
    local quoted_cmd
    printf -v quoted_cmd '%q' "$cmd"
    local managed_cmd="exec '$ROOT_DIR/platform_process.sh' '$process_name' $quoted_cmd"

    echo "  -> Spawning window: [$title]"

    if command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal --window --title="$title" -- bash -c "$managed_cmd"
    elif command -v xterm >/dev/null 2>&1; then
        xterm -T "$title" -e bash -c "$managed_cmd" &
    elif command -v xfce4-terminal >/dev/null 2>&1; then
        xfce4-terminal --window --title="$title" -e "bash -c \"$managed_cmd\"" &
    elif command -v konsole >/dev/null 2>&1; then
        konsole --new-tab=false --title "$title" -e bash -c "$managed_cmd" &
    elif command -v kitty >/dev/null 2>&1; then
        kitty --title "$title" bash -c "$managed_cmd" &
    elif command -v alacritty >/dev/null 2>&1; then
        alacritty --title "$title" -e bash -c "$managed_cmd" &
    elif command -v x-terminal-emulator >/dev/null 2>&1; then
        x-terminal-emulator -T "$title" -e bash -c "$managed_cmd" &
    else
        echo "Error: No supported terminal emulator found."
        exit 1
    fi

    # Small delay between spawning windows to preserve execution order
    sleep 0.4
}

# 1. Frontend Next.js Dev Server (1 instance)
spawn_terminal "Frontend (Next.js - Port 3000)" \
    "frontend" \
    "cd '$ROOT_DIR/frontend' && npm run dev"

# 2. Backend FastAPI Server (1 instance)
spawn_terminal "Backend API (FastAPI - Port 7500)" \
    "backend" \
    "cd '$ROOT_DIR/backend' && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 7500 --reload"

# 3. Transactional Outbox Dispatcher (1 instance)
spawn_terminal "Transactional Outbox Dispatcher" \
    "outbox" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m outbox.main"

# 4. Pipeline Reconciler (1 instance)
spawn_terminal "Pipeline Reconciler" \
    "reconciler" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m reconciler.main"

# 5. Planner Consumers (2 instances)
spawn_terminal "Planner Consumer #1" \
    "planner-1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m planner.main"

spawn_terminal "Planner Consumer #2" \
    "planner-2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m planner.main"

# 6. Transcoder Workers (3 instances)
spawn_terminal "Worker Transcoder #1" \
    "worker-1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m worker.main"

spawn_terminal "Worker Transcoder #2" \
    "worker-2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m worker.main"

spawn_terminal "Worker Transcoder #3" \
    "worker-3" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m worker.main"

# 7. Rendition Finalizers (2 instances)
spawn_terminal "Rendition Finalizer #1" \
    "finalizer-1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m finalizer.main"

spawn_terminal "Rendition Finalizer #2" \
    "finalizer-2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m finalizer.main"

# 8. Video Asset Finalizers (2 instances)
spawn_terminal "Video Asset Finalizer #1" \
    "video-finalizer-1" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m video_finalizer.main"

spawn_terminal "Video Asset Finalizer #2" \
    "video-finalizer-2" \
    "cd '$ROOT_DIR/backend' && .venv/bin/python -m video_finalizer.main"

echo "=========================================================================="
echo " Successfully spawned 13 separate terminal windows:"
echo "   - 1x Frontend (Next.js)"
echo "   - 1x Backend (FastAPI)"
echo "   - 1x Transactional Outbox Dispatcher"
echo "   - 1x Pipeline Reconciler"
echo "   - 2x Planners"
echo "   - 3x Workers"
echo "   - 2x Rendition Finalizers"
echo "   - 2x Video Finalizers"
echo "=========================================================================="
