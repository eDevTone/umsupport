"""Site-specific navigation steps for the OneCard Integrador portal."""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

logger = logging.getLogger(__name__)


REPORTS_PATH = "/Home/Reportes?iType=1"
REPORT_BUTTON_SELECTOR = "#REPORTEEMPLEADOTARJETA"
CARD_INPUT_SELECTOR = "#biCard"
SUBMIT_SELECTOR = "#frm-GetInfoEmployees2 input[type=submit]"
XHR_PATH = "/Reports/ReportEmployees/_GetInfoEmployees2"


class NotFoundError(Exception):
    pass


async def fetch_card_report(page: Page, site_url: str, card: str) -> dict[str, Any]:
    """Run the 'Reporte Empleado Tarjeta' lookup for a single card.

    Assumes the page has already authenticated via `app.scraper.login.login`.
    Navigates to the reports menu, opens the card-employee report, submits the
    card number and returns the first record from the bootstrap-table XHR
    response (`/Reports/ReportEmployees/_GetInfoEmployees2`).

    Args:
        page: A Playwright page bound to an authenticated context.
        site_url: Base URL of the site (e.g. `https://.../Integrador`).
        card: Card number to look up.

    Returns:
        The raw JSON object for the card (all fields the site exposes).

    Raises:
        NotFoundError: If the report returns no records for the given card.
    """
    base = site_url.rstrip("/")

    logger.info("Opening reports menu")
    await page.goto(f"{base}{REPORTS_PATH}", wait_until="domcontentloaded", timeout=30_000)

    await page.wait_for_selector(REPORT_BUTTON_SELECTOR, state="visible", timeout=15_000)
    await page.click(REPORT_BUTTON_SELECTOR)
    await page.wait_for_load_state("domcontentloaded", timeout=30_000)

    await page.wait_for_selector(CARD_INPUT_SELECTOR, state="visible", timeout=15_000)
    await page.fill(CARD_INPUT_SELECTOR, card)

    logger.info("Submitting card %s", card)
    try:
        async with page.expect_response(
            lambda r: XHR_PATH in r.url, timeout=30_000
        ) as info:
            await page.click(SUBMIT_SELECTOR)
        response = await info.value
    except PlaywrightTimeoutError as exc:
        raise NotFoundError(f"El servidor no respondió al consultar la tarjeta {card}.") from exc

    if response.status != 200:
        raise NotFoundError(
            f"El servidor devolvió código {response.status} al consultar la tarjeta {card}."
        )

    payload = await response.json()
    if not isinstance(payload, list) or not payload:
        raise NotFoundError(f"No se encontraron registros para la tarjeta {card}.")

    return payload[0]
