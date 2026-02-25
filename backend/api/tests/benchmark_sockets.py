import asyncio
import time
import websockets
import statistics
import sys
import logging

# Configuration
NUM_CLIENTS = 100
DURATION = 5  # seconds
URI = "ws://localhost:8000/api/tracks/live"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger("Benchmark")

async def client_task(client_id, results):
    start_connect = time.time()
    try:
        async with websockets.connect(URI) as websocket:
            connect_time = time.time() - start_connect

            # Wait for messages
            msg_count = 0
            start_listening = time.time()

            while time.time() - start_listening < DURATION:
                try:
                    await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    msg_count += 1
                except asyncio.TimeoutError:
                    continue
                except websockets.exceptions.ConnectionClosed:
                    break

            results.append({
                "id": client_id,
                "connect_time": connect_time,
                "messages": msg_count,
                "success": True
            })
    except Exception as e:
        results.append({
            "id": client_id,
            "error": str(e),
            "success": False
        })

async def main():
    logger.info(f"Starting benchmark with {NUM_CLIENTS} clients for {DURATION} seconds...")
    results = []

    start_time = time.time()

    # Batch connection creation to avoid overwhelming local ephemeral ports or event loop immediately if N is huge
    tasks = [client_task(i, results) for i in range(NUM_CLIENTS)]
    await asyncio.gather(*tasks)

    total_time = time.time() - start_time

    # Analysis
    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    logger.info(f"Benchmark completed in {total_time:.2f}s")
    logger.info(f"Successful connections: {len(successful)}")
    logger.info(f"Failed connections: {len(failed)}")

    if failed:
        logger.error(f"Sample Error: {failed[0]['error']}")

    if successful:
        connect_times = [r["connect_time"] for r in successful]
        message_counts = [r["messages"] for r in successful]

        logger.info(f"Avg Connect Time: {statistics.mean(connect_times)*1000:.2f}ms")
        logger.info(f"Max Connect Time: {max(connect_times)*1000:.2f}ms")
        logger.info(f"Avg Messages Received: {statistics.mean(message_counts):.2f}")
        logger.info(f"Total Messages Processed by Clients: {sum(message_counts)}")

if __name__ == "__main__":
    asyncio.run(main())
