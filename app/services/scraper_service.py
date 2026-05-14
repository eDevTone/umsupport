import logging
import time
from typing import AsyncIterator

from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.config import get_settings
from app.models.requests import ScrapeItem, ScrapeRequest
from app.models.responses import ScrapeItemResult, ScrapeResponse
from app.scraper.browser import get_browser_page
from app.scraper.login import LoginFailedError, login
from app.scraper.steps import NotFoundError, fetch_card_report

logger = logging.getLogger(__name__)


async def _scrape_single(index: int, item: ScrapeItem) -> ScrapeItemResult:
    start = time.monotonic()
    settings = get_settings()

    def _error(code: str, message: str) -> ScrapeItemResult:
        return ScrapeItemResult(
            index=index,
            card=item.card,
            status="error",
            error_code=code,
            message=message,
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    try:
        async with get_browser_page() as page:
            await login(page, settings.SITE_URL, settings.SITE_USER, settings.SITE_PASS)
            data = await fetch_card_report(page, settings.SITE_URL, item.card)
    except LoginFailedError as exc:
        logger.warning("Login failed while scraping card %s: %s", item.card, exc)
        return _error("LOGIN_FAILED", str(exc))
    except NotFoundError as exc:
        return _error("NOT_FOUND", str(exc))
    except PlaywrightTimeoutError as exc:
        logger.warning("Timeout while scraping card %s: %s", item.card, exc)
        return _error("TIMEOUT", "El sitio tardó demasiado en responder.")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error while scraping card %s", item.card)
        return _error("UNKNOWN", str(exc) or exc.__class__.__name__)

    return ScrapeItemResult(
        index=index,
        card=item.card,
        status="success",
        data=data,
        duration_ms=int((time.monotonic() - start) * 1000),
    )


async def run_scrape(request: ScrapeRequest) -> ScrapeResponse:
    start = time.monotonic()
    results: list[ScrapeItemResult] = []
    for index, item in enumerate(request.items):
        result = await _scrape_single(index, item)
        results.append(result)
    return ScrapeResponse(
        results=results,
        total_duration_ms=int((time.monotonic() - start) * 1000),
    )


async def run_scrape_stream(request: ScrapeRequest) -> AsyncIterator[ScrapeItemResult]:
    for index, item in enumerate(request.items):
        result = await _scrape_single(index, item)
        yield result
