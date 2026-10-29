#!/usr/bin/env bash
set -e

PORT=${1:-8001}
HOST="0.0.0.0"

echo "========================================="
echo "   Starting OpenTalk Spoken English App  "
echo "========================================="
echo "Server running on http://localhost:${PORT}"
echo "Local network access: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT}"
echo "Press Ctrl+C to stop."

python3 -m uvicorn main:app --host ${HOST} --port ${PORT} --reload
