import json
from typing import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.requests import ScrapeRequest
from app.models.responses import ScrapeResponse
from app.services.scraper_service import run_scrape, run_scrape_stream

router = APIRouter()


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape(request: ScrapeRequest) -> ScrapeResponse:
    return await run_scrape(request)


@router.post("/scrape/stream")
async def scrape_stream(request: ScrapeRequest) -> StreamingResponse:
    async def event_generator() -> AsyncIterator[str]:
        async for result in run_scrape_stream(request):
            payload = json.dumps(result.model_dump())
            yield f"data: {payload}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
