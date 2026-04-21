from fastapi import FastAPI
from pydantic import BaseModel
import asyncio
import hashlib
import time

app = FastAPI(title="K6 Learning SUT", version="0.1.0")

class EchoPayload(BaseModel):
    message: str
    user_id: int | None = None

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/fast")
async def fast():
    # Ruta "rápida": sin I/O ni cómputo. Sirve como línea base.
    return {"endpoint": "fast", "ts": time.time()}

@app.get("/slow")
async def slow(ms: int = 300):
    # Latencia artificial. Simula una dependencia lenta (DB/tercero).
    await asyncio.sleep(ms / 1000)
    return {"endpoint": "slow", "delay_ms": ms}

@app.get("/cpu")
def cpu(rounds: int = 5000):
    # CPU-bound: bloquea el event loop porque NO es async.
    # Bajo carga veremos saturación de CPU del contenedor.
    payload = b"k6-learning-payload"
    for _ in range(rounds):
        payload = hashlib.sha256(payload).digest()
    return {"endpoint": "cpu", "rounds": rounds, "hash": payload.hex()[:16]}

@app.post("/echo")
async def echo(body: EchoPayload):
    return {"endpoint": "echo", "received": body.model_dump(), "ts": time.time()}
