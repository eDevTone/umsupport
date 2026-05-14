"""Manual smoke test for `app.scraper.login.login`.

Opens a Playwright session, attempts to log in using the credentials in `.env`
and prints the landing URL plus a post-login screenshot. Useful while iterating
on selectors; not part of the runtime API.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.scraper.browser import get_browser_page
from app.scraper.login import LoginFailedError, login


ARTIFACTS = Path(__file__).parent / "_artifacts"


async def main() -> int:
    ARTIFACTS.mkdir(exist_ok=True)
    settings = get_settings()

    async with get_browser_page() as page:
        try:
            await login(page, settings.SITE_URL, settings.SITE_USER, settings.SITE_PASS)
        except LoginFailedError as exc:
            await page.screenshot(path=str(ARTIFACTS / "login_failed.png"), full_page=True)
            print(f"LOGIN FAILED: {exc}")
            return 1

        await page.screenshot(path=str(ARTIFACTS / "post_login.png"), full_page=True)
        (ARTIFACTS / "post_login.html").write_text(await page.content(), encoding="utf-8")
        (ARTIFACTS / "post_login.url").write_text(page.url, encoding="utf-8")
        print(f"LOGIN OK — landed at: {page.url}")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
