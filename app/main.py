import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import scraper

settings = get_settings()
logging.basicConfig(level=settings.LOG_LEVEL)

app = FastAPI(
    title="UMSupport Scraper API",
    version="0.1.0",
    description="REST API exposing a Playwright scraper to be consumed by an Astro frontend.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=settings.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scraper.router, prefix="/api", tags=["scraper"])


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
