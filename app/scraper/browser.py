from contextlib import asynccontextmanager
from typing import AsyncIterator

from playwright.async_api import Page, async_playwright

from app.config import get_settings


@asynccontextmanager
async def get_browser_page() -> AsyncIterator[Page]:
    settings = get_settings()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=settings.HEADLESS)
        context = await browser.new_context()
        page = await context.new_page()
        try:
            yield page
        finally:
            await context.close()
            await browser.close()
