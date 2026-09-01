from fastapi import FastAPI, APIRouter, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# Include the router in the main app
app.include_router(api_router)

# Kingswell Institute is a vanilla PHP/MySQL application (see /app/php-backend);
# this FastAPI scaffold is otherwise unused. The platform's ingress hardcodes
# /api -> this service (port 8001), so every /api/* request that isn't one of
# the two stub routes above is transparently proxied to the real PHP backend
# (Apache on 127.0.0.1:8090) so the app works through the public preview URL.
PHP_BACKEND_URL = "http://127.0.0.1:8090"
_proxy_client = httpx.AsyncClient(base_url=PHP_BACKEND_URL, timeout=30.0)

_EXCLUDED_RESPONSE_HEADERS = {"content-encoding", "transfer-encoding", "connection", "content-length"}

@app.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_to_php_backend(full_path: str, request: Request):
    url = f"/api/{full_path}"
    if request.url.query:
        url += f"?{request.url.query}"

    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    body = await request.body()

    php_response = await _proxy_client.request(
        request.method, url, headers=headers, content=body,
    )

    response_headers = [
        (k, v) for k, v in php_response.headers.items()
        if k.lower() not in _EXCLUDED_RESPONSE_HEADERS and k.lower() != "set-cookie"
    ]
    proxied = Response(
        content=php_response.content,
        status_code=php_response.status_code,
        headers=dict(response_headers),
        media_type=php_response.headers.get("content-type"),
    )
    for cookie_value in php_response.headers.get_list("set-cookie"):
        proxied.raw_headers.append((b"set-cookie", cookie_value.encode("latin-1")))
    return proxied

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()