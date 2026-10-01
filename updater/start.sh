#!/bin/bash
set -e
mkdir -p /state
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp &
xvfb_pid=$!
for attempt in $(seq 1 50); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
fluxbox >/state/window-manager.log 2>&1 &
x11vnc -display :99 -localhost -nopw -forever -shared -rfbport 5900 >/state/vnc.log 2>&1 &
websockify --web=/usr/share/novnc 6080 localhost:5900 >/state/web-viewer.log 2>&1 &
node /app/worker.js &
worker_pid=$!
trap 'kill -TERM "$worker_pid"; wait "$worker_pid"; exit 0' TERM INT
# Any essential process exiting causes a container restart.
wait -n
exit 1
