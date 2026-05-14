"""Submits the card form and captures the raw JSON returned by the bootstrap-table
XHR (`/_GetInfoEmployees2`). This is what the scraper will rely on at runtime —
no DOM scraping needed.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.scraper.browser import get_browser_page
from app.scraper.login import login


ARTIFACTS = Path(__file__).parent / "_artifacts"
TEST_CARD = "5062990506414370"
XHR_PATH = "/Reports/ReportEmployees/_GetInfoEmployees2"


async def main() -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    settings = get_settings()

    async with get_browser_page() as page:
        await login(page, settings.SITE_URL, settings.SITE_USER, settings.SITE_PASS)

        await page.goto(
            f"{settings.SITE_URL.rstrip('/')}/Home/Reportes?iType=1",
            wait_until="networkidle",
            timeout=30_000,
        )
        await page.wait_for_selector("#REPORTEEMPLEADOTARJETA", state="visible", timeout=15_000)
        await page.click("#REPORTEEMPLEADOTARJETA")
        await page.wait_for_load_state("networkidle", timeout=30_000)

        await page.wait_for_selector("#biCard", state="visible", timeout=15_000)
        await page.fill("#biCard", TEST_CARD)

        async with page.expect_response(lambda r: XHR_PATH in r.url) as info:
            await page.click("#frm-GetInfoEmployees2 input[type=submit]")
        response = await info.value

        body = await response.text()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None

        (ARTIFACTS / "xhr_response.txt").write_text(body, encoding="utf-8")
        if payload is not None:
            (ARTIFACTS / "xhr_response.json").write_text(
                json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
            )

        print(f"XHR URL    : {response.url}")
        print(f"Status     : {response.status}")
        print(f"Body bytes : {len(body)}")
        if isinstance(payload, dict):
            print(f"Top keys   : {list(payload.keys())}")
        elif isinstance(payload, list):
            print(f"Top type   : list of {len(payload)}")
            if payload:
                print(f"First item : {list(payload[0].keys()) if isinstance(payload[0], dict) else payload[0]}")


if __name__ == "__main__":
    asyncio.run(main())
