#!/bin/bash
set -e

echo "Starting Mock Server..."
python backend/api/tests/mock_server.py > mock_server.log 2>&1 &
SERVER_PID=$!

echo "Waiting for server to start..."
sleep 5

echo "Running Benchmark..."
python backend/api/tests/benchmark_sockets.py

echo "Killing Mock Server..."
kill $SERVER_PID
echo "Done."
