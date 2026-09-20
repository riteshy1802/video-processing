#!/usr/bin/env bash

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PROCESS_NAME="${1:?process name is required}"
COMMAND="${2:?command is required}"
PID_FILE="$RUN_DIR/$PROCESS_NAME.pid"
CHILD_PID=""

mkdir -p "$RUN_DIR"

if [[ -f "$PID_FILE" ]]; then
    existing_pid="$(sed -n '1p' "$PID_FILE" 2>/dev/null || true)"
    if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
        echo "$PROCESS_NAME is already running (wrapper PID $existing_pid)."
        exit 1
    fi
    rm -f "$PID_FILE"
fi

cleanup() {
    rm -f "$PID_FILE"
}

stop_child() {
    if [[ -z "$CHILD_PID" ]] || ! kill -0 "$CHILD_PID" 2>/dev/null; then
        return
    fi

    # The command runs in its own session, so the negative PID targets only
    # this managed service and any children it created.
    kill -TERM -- "-$CHILD_PID" 2>/dev/null || true
    for _ in {1..50}; do
        if ! kill -0 "$CHILD_PID" 2>/dev/null; then
            return
        fi
        sleep 0.2
    done
    kill -KILL -- "-$CHILD_PID" 2>/dev/null || true
}

handle_shutdown() {
    stop_child
    exit 0
}

trap cleanup EXIT
trap handle_shutdown TERM INT

setsid bash -lc "$COMMAND" &
CHILD_PID=$!
printf '%s\n%s\n' "$$" "$CHILD_PID" > "$PID_FILE"

wait "$CHILD_PID"
exit $?
