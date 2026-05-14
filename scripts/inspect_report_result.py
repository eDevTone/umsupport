"""Logs in, opens Reporte Empleado Tarjeta, submits a real card number and
captures the resulting view so we can identify selectors for 'Cuenta Empleado'
and 'Estatus'.
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
        await page.click("#frm-GetInfoEmployees2 input[type=submit]")
        # The result loads via AJAX with an overlay (`#loader`). Wait for the
        # spinner to hide before reading the DOM.
        await page.wait_for_selector("#loader", state="hidden", timeout=30_000)
        await page.wait_for_load_state("networkidle", timeout=30_000)

        slug = "report_result"
        await page.screenshot(path=str(ARTIFACTS / f"{slug}.png"), full_page=True)
        (ARTIFACTS / f"{slug}.html").write_text(await page.content(), encoding="utf-8")
        (ARTIFACTS / f"{slug}.url").write_text(page.url, encoding="utf-8")

        summary = await page.evaluate(
            """
            () => {
                const visibleText = el => el.offsetParent !== null;

                const tables = Array.from(document.querySelectorAll('table'))
                    .filter(visibleText)
                    .map(t => ({
                        id: t.id || null,
                        classes: t.className || null,
                        headers: Array.from(t.querySelectorAll('thead th, thead td'))
                            .map(th => (th.textContent || '').trim()),
                        firstRow: Array.from(t.querySelectorAll('tbody tr')).slice(0, 1).flatMap(tr =>
                            Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim())
                        ),
                        rowCount: t.querySelectorAll('tbody tr').length,
                    }));

                const allLabels = Array.from(document.querySelectorAll('label, .form-label, dt'))
                    .filter(visibleText)
                    .map(el => (el.textContent || '').trim())
                    .filter(Boolean);

                const main = document.body.innerText || '';

                return {
                    title: document.title,
                    url: location.href,
                    tables,
                    labels: allLabels.slice(0, 60),
                    body_text_preview: main.replace(/\\s+/g, ' ').slice(0, 2000),
                };
            }
            """
        )

        (ARTIFACTS / f"{slug}_summary.json").write_text(
            json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        print(f"OK — {page.url}")
        print(f"  title: {summary.get('title')}")
        print(f"  tables: {len(summary.get('tables', []))}")
        print(f"  artifacts: {ARTIFACTS}/{slug}_*")


if __name__ == "__main__":
    asyncio.run(main())
