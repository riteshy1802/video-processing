#!/usr/bin/env bash

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
STOP_INFRA=false

if [[ "${1:-}" == "--infra" ]]; then
    STOP_INFRA=true
fi

echo "Stopping video-processing platform processes..."

tracked_pids=()
if [[ -d "$RUN_DIR" ]]; then
    shopt -s nullglob
    for pid_file in "$RUN_DIR"/*.pid; do
        wrapper_pid="$(sed -n '1p' "$pid_file" 2>/dev/null || true)"
        if [[ "$wrapper_pid" =~ ^[0-9]+$ ]] && kill -0 "$wrapper_pid" 2>/dev/null; then
            tracked_pids+=("$wrapper_pid")
            kill -TERM "$wrapper_pid" 2>/dev/null || true
        else
            rm -f "$pid_file"
        fi
    done
    shopt -u nullglob
fi

# Compatibility fallback for processes launched before PID tracking existed or
# started through individual Make targets. A process is touched only when its
# current working directory belongs to this repository and its command matches
# one of this platform's entry points.
fallback_pids=()
for proc_dir in /proc/[0-9]*; do
    pid="${proc_dir##*/}"
    [[ "$pid" == "$$" || "$pid" == "$PPID" ]] && continue
    cwd="$(readlink "$proc_dir/cwd" 2>/dev/null || true)"
    case "$cwd" in
        "$ROOT_DIR"|"$ROOT_DIR"/*) ;;
        *) continue ;;
    esac

    command_line="$(tr '\0' ' ' < "$proc_dir/cmdline" 2>/dev/null || true)"
    case "$command_line" in
        *"uvicorn app.main:app"*|*"python -m planner.main"*|*"python -m worker.main"*|*"python -m finalizer.main"*|*"python -m video_finalizer.main"*|*"python -m outbox.main"*|*"python -m reconciler.main"*|*"npm run dev"*|*"next dev"*)
            fallback_pids+=("$pid")
            kill -TERM "$pid" 2>/dev/null || true
            ;;
    esac
done

all_pids=("${tracked_pids[@]}" "${fallback_pids[@]}")
for _ in {1..50}; do
    still_running=false
    for pid in "${all_pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            still_running=true
            break
        fi
    done
    [[ "$still_running" == false ]] && break
    sleep 0.2
done

for pid in "${all_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
    fi
done

if [[ -d "$RUN_DIR" ]]; then
    find "$RUN_DIR" -maxdepth 1 -type f -name '*.pid' -delete
fi

# Close legacy launcher windows by their explicit project titles when wmctrl is
# available. Managed windows close by themselves when their wrapper exits.
if command -v wmctrl >/dev/null 2>&1; then
    while read -r window_id _; do
        title="$(wmctrl -l | awk -v id="$window_id" '$1 == id {$1=$2=$3=""; sub(/^ +/, ""); print}')"
        case "$title" in
            "Frontend (Next.js - Port 3000)"|"Backend API (FastAPI - Port 7500)"|"Transactional Outbox Dispatcher"|"Pipeline Reconciler"|"Planner Consumer #"*|"Worker Transcoder #"*|"Rendition Finalizer #"*|"Video Asset Finalizer #"*)
                wmctrl -ic "$window_id" 2>/dev/null || true
                ;;
        esac
    done < <(wmctrl -l | awk '{print $1, $2}')
elif command -v xdotool >/dev/null 2>&1; then
    terminal_title_patterns=(
        '^Frontend \(Next.js - Port 3000\)$'
        '^Backend API \(FastAPI - Port 7500\)$'
        '^Transactional Outbox Dispatcher$'
        '^Pipeline Reconciler$'
        '^Planner Consumer #[0-9]+$'
        '^Worker Transcoder #[0-9]+$'
        '^Rendition Finalizer #[0-9]+$'
        '^Video Asset Finalizer #[0-9]+$'
    )
    for title_pattern in "${terminal_title_patterns[@]}"; do
        while read -r window_id; do
            [[ -n "$window_id" ]] && xdotool windowclose "$window_id" 2>/dev/null || true
        done < <(xdotool search --name "$title_pattern" 2>/dev/null || true)
    done
fi

if [[ "$STOP_INFRA" == true ]]; then
    echo "Stopping Kafka infrastructure..."
    (cd "$ROOT_DIR/backend/infrastructure/kafka" && docker compose down)
fi

echo "Platform shutdown complete."
