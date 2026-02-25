import uvicorn
import asyncio
import json
import uuid
import sys
import os
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi import APIRouter

# Add backend/api to sys.path so we can import main
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mock Kafka Message
class MockMessage:
    def __init__(self, value):
        self.value = value

# Mock Consumer
class MockAIOKafkaConsumer:
    def __init__(self, *args, **kwargs):
        pass

    async def start(self):
        pass

    async def stop(self):
        pass

    def __aiter__(self):
        return self

    async def __anext__(self):
        await asyncio.sleep(0.01) # Simulate 100 messages/sec

        # Valid JSON payload for transform_to_proto
        data = {
            "uid": str(uuid.uuid4()),
            "type": "a-f-A",
            "point": {
                "lat": 34.0,
                "lon": -118.0,
                "hae": 100.0,
                "ce": 10.0,
                "le": 10.0
            },
            "detail": {
                "contact": {"callsign": "MOCK-01"},
                "track": {"course": 180.0, "speed": 250.0}
            },
            "time": "2023-01-01T00:00:00Z"
        }
        return MockMessage(value=json.dumps(data).encode('utf-8'))

if __name__ == "__main__":
    # Mock Environment Variables needed for config.py
    os.environ["KAFKA_BROKERS"] = "mock:9092"
    os.environ["REDIS_HOST"] = "mock"
    os.environ["POSTGRES_USER"] = "mock"
    os.environ["POSTGRES_PASSWORD"] = "mock"
    os.environ["POSTGRES_DB"] = "mock"
    os.environ["POSTGRES_HOST"] = "mock"

    # Mock routers.analysis to avoid loading litellm which fails on pkg_resources
    # We must do this before importing main
    mock_analysis = MagicMock()
    mock_analysis.router = APIRouter()
    sys.modules["routers.analysis"] = mock_analysis

    # We patch the class itself so that importing it yields our Mock class
    with patch("aiokafka.AIOKafkaConsumer", new=MockAIOKafkaConsumer), \
         patch("core.database.db.connect", new_callable=AsyncMock), \
         patch("core.database.db.disconnect", new_callable=AsyncMock), \
         patch("services.historian.historian_task", new=AsyncMock()), \
         patch("redis.from_url", new=MagicMock()):

        from main import app

        print("Starting Mock Server on 8000...")
        # log_config=None to prevent overwriting our logging config if we had one
        uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
