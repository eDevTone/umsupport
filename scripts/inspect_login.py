"""One-off helper to inspect the login page of the external site.

Runs Playwright against `SITE_URL`, takes a screenshot of the landing page,
and dumps the HTML of any visible form so we can pick reliable selectors for
`app/scraper/login.py`. Outputs go to `scripts/_artifacts/`.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Make `app` importable when running this file directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.async_api import async_playwright

from app.config import get_settings


ARTIFACTS = Path(__file__).parent / "_artifacts"


async def main() -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    settings = get_settings()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto(settings.SITE_URL, wait_until="networkidle", timeout=30_000)

        await page.screenshot(path=str(ARTIFACTS / "login.png"), full_page=True)
        (ARTIFACTS / "page.html").write_text(await page.content(), encoding="utf-8")
        (ARTIFACTS / "page.url").write_text(page.url, encoding="utf-8")

        # Capture every form on the page with its inputs and buttons
        forms = await page.evaluate(
            """
            () => Array.from(document.querySelectorAll('form')).map(form => ({
                action: form.getAttribute('action'),
                method: form.getAttribute('method'),
                id: form.id,
                name: form.getAttribute('name'),
                inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    type: el.getAttribute('type'),
                    name: el.getAttribute('name'),
                    id: el.id,
                    placeholder: el.getAttribute('placeholder'),
                    autocomplete: el.getAttribute('autocomplete'),
                })),
                buttons: Array.from(form.querySelectorAll('button, input[type=submit], input[type=button]')).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    type: el.getAttribute('type'),
                    name: el.getAttribute('name'),
                    id: el.id,
                    text: (el.textContent || el.value || '').trim(),
                })),
            }))
            """
        )

        import json

        (ARTIFACTS / "forms.json").write_text(
            json.dumps(forms, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        print(f"Landed at: {page.url}")
        print(f"Found {len(forms)} form(s).")
        print(f"Artifacts written to {ARTIFACTS}")

        await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
