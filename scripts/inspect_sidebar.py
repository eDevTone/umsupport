"""Lists clickable menu items in the sidebar after login.

Runs the login flow and then dumps every link/button with a tooltip or text,
so we can identify the section to navigate to next.
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


async def main() -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    settings = get_settings()

    async with get_browser_page() as page:
        await login(page, settings.SITE_URL, settings.SITE_USER, settings.SITE_PASS)

        items = await page.evaluate(
            """
            () => Array.from(document.querySelectorAll('a, button, [role=button], [onclick]'))
                .map(el => ({
                    tag: el.tagName.toLowerCase(),
                    text: (el.innerText || el.textContent || '').trim().slice(0, 80),
                    href: el.getAttribute('href'),
                    title: el.getAttribute('title'),
                    aria_label: el.getAttribute('aria-label'),
                    data_target: el.getAttribute('data-target') || el.getAttribute('data-toggle'),
                    classes: el.className || null,
                    id: el.id || null,
                }))
                .filter(it => it.text || it.title || it.aria_label || it.href)
            """
        )

        (ARTIFACTS / "sidebar.json").write_text(
            json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"Captured {len(items)} interactive elements -> {ARTIFACTS / 'sidebar.json'}")


if __name__ == "__main__":
    asyncio.run(main())
