#!/bin/bash
# ---------------------------------------------------------------------------
# REAP launcher for macOS.
#
# Double-click this file in Finder. It installs what is missing, starts the
# app, and opens it in the browser. Written for someone who has never used a
# terminal, so every failure explains itself in plain language rather than
# printing a stack trace.
# ---------------------------------------------------------------------------
set -u

cd "$(dirname "$0")/.." || exit 1
PROJECT_DIR="$(pwd)"

say()  { printf '\n\033[1;34m%s\033[0m\n' "$1"; }
ok()   { printf '\033[0;32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[0;33m  ! %s\033[0m\n' "$1"; }
die()  { printf '\n\033[0;31m%s\033[0m\n\n' "$1"; printf 'Press return to close this window.'; read -r _; exit 1; }

clear
cat <<'BANNER'
  ____  _____    _    ____
 |  _ \| ____|  / \  |  _ \    Real Estate Agent Platform
 | |_) |  _|   / _ \ | |_) |   Human-in-the-loop. Nothing sends
 |  _ <| |___ / ___ \|  __/    without your approval.
 |_| \_\_____/_/   \_\_|

BANNER

# --- Node -------------------------------------------------------------------
say "Checking prerequisites"

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is not installed on this Mac.

REAP needs it to run. It is free and takes about two minutes:

  1. Go to  https://nodejs.org
  2. Download the button on the LEFT (the 'LTS' version)
  3. Open the downloaded file and click through the installer
  4. Double-click this REAP file again

Nothing else needs installing."
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js is installed, but it is version $NODE_MAJOR and REAP needs 20 or newer.

Download the current LTS version from https://nodejs.org, install it,
then double-click this file again."
fi
ok "Node.js $(node --version)"

# --- Dependencies -----------------------------------------------------------
if [ ! -d node_modules ]; then
  say "First-time setup (a few minutes, only happens once)"
  npm install --no-fund --no-audit || die "Setup could not finish.

This is usually a network issue. Check your internet connection and
double-click this file again."
  ok "Installed"
else
  ok "Already set up"
fi

say "Preparing the app"
npm run build --workspace=@reap/shared --silent >/dev/null 2>&1 \
  || die "The app could not be prepared. Send Justin this message and he can fix it."
ok "Ready"

# --- Free the ports ---------------------------------------------------------
for PORT in 3001 5173; do
  PID="$(lsof -ti tcp:$PORT 2>/dev/null || true)"
  if [ -n "$PID" ]; then
    warn "Something was already using port $PORT, stopping it"
    kill "$PID" 2>/dev/null || true
    sleep 1
  fi
done

# --- Run --------------------------------------------------------------------
say "Starting REAP"

npm run dev >"$PROJECT_DIR/reap.log" 2>&1 &
APP_PID=$!

CLEANED=0
cleanup() {
  # Guard: the trap fires on both the signal and the subsequent EXIT, and
  # printing the shutdown notice twice reads like something went wrong.
  [ "$CLEANED" -eq 1 ] && return
  CLEANED=1
  printf '\n\nShutting down REAP...\n'
  kill "$APP_PID" 2>/dev/null || true
  pkill -f 'tsx watch' 2>/dev/null || true
  pkill -f 'vite' 2>/dev/null || true
  sleep 1
  printf 'Closed. You can close this window.\n'
}
trap cleanup EXIT INT TERM

# Wait for the API to answer rather than guessing with a fixed sleep.
printf '  '
for _ in $(seq 1 45); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
    break
  fi
  printf '.'
  sleep 1
done
printf '\n'

if ! curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
  die "REAP did not start.

Details were written to:
  $PROJECT_DIR/reap.log

Send that file to Justin."
fi
ok "Running"

sleep 2
open http://localhost:5173

cat <<'RUNNING'

  ─────────────────────────────────────────────────────────────
   REAP is open in your browser at  http://localhost:5173

   Everything you see is SAMPLE DATA. No real client information
   is used, and no email is ever sent to anyone.

   Try this:
     • Open the Review queue on the left
     • Pick a message and read "Why this was proposed"
     • Edit the draft reply, then Approve or Dismiss it
     • Open Ledger to see the record of what you just did

   LEAVE THIS WINDOW OPEN while you use REAP.
   To stop: come back here and press  Control + C
  ─────────────────────────────────────────────────────────────

RUNNING

wait "$APP_PID"
