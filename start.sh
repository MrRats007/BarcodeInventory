#!/bin/bash
# Start both backend and frontend in parallel

echo "Starting Inventory Manager..."
echo ""

# Start backend
cd "$(dirname "$0")/backend" && node server.js &
BACKEND_PID=$!

# Start frontend
cd "$(dirname "$0")/frontend" && npm run dev &
FRONTEND_PID=$!

echo "Backend running on  http://localhost:3001"
echo "Frontend running on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
