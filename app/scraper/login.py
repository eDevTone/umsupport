import logging
from urllib.parse import urlparse

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

logger = logging.getLogger(__name__)


class LoginFailedError(Exception):
    pass


async def login(page: Page, site_url: str, user: str, password: str) -> None:
    """Authenticate against the OneCard Integrador portal.

    The login page (`/Account/Login`) shows a simple form with `#Email` and
    `#Password`. On success the server redirects away from `/Account/Login`;
    if credentials are wrong it stays on the same URL and renders a
    `.validation-summary-errors` block.

    Args:
        page: A Playwright page in a fresh context.
        site_url: Base URL of the site (e.g. `https://.../Integrador`).
        user: Account email.
        password: Account password.

    Raises:
        LoginFailedError: If the form rejects the credentials or the page
            does not navigate away from the login route in time.
    """
    logger.info("Navigating to login page")
    await page.goto(site_url, wait_until="domcontentloaded", timeout=30_000)

    try:
        await page.wait_for_selector("#Email", state="visible", timeout=15_000)
    except PlaywrightTimeoutError as exc:
        raise LoginFailedError("Login form not rendered (selector #Email not visible).") from exc

    await page.fill("#Email", user)
    await page.fill("#Password", password)

    async with page.expect_navigation(wait_until="domcontentloaded", timeout=30_000):
        await page.click("#frm-login input[type=submit]")

    if "/Account/Login" in urlparse(page.url).path:
        message = await _extract_error_message(page)
        raise LoginFailedError(message or "Credenciales rechazadas por el sitio.")

    logger.info("Login successful, landed at %s", page.url)


async def _extract_error_message(page: Page) -> str | None:
    """Read the server-rendered validation error, if present."""
    locator = page.locator(".validation-summary-errors")
    if await locator.count() == 0:
        return None
    text = (await locator.inner_text()).strip()
    return text or None
