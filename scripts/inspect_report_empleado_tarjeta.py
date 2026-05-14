"""Logs in, navigates to Reportes, clicks the 'Reporte Empleado Tarjeta' tile
and captures the resulting view (screenshot + HTML + form/control summary).
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

        await page.goto(
            f"{settings.SITE_URL.rstrip('/')}/Home/Reportes?iType=1",
            wait_until="networkidle",
            timeout=30_000,
        )

        await page.wait_for_selector("#REPORTEEMPLEADOTARJETA", state="visible", timeout=15_000)
        await page.click("#REPORTEEMPLEADOTARJETA")

        # Wait either for a new section to render or for a navigation to happen
        await page.wait_for_load_state("networkidle", timeout=30_000)

        slug = "rep_emp_tarjeta"
        await page.screenshot(path=str(ARTIFACTS / f"{slug}.png"), full_page=True)
        (ARTIFACTS / f"{slug}.html").write_text(await page.content(), encoding="utf-8")
        (ARTIFACTS / f"{slug}.url").write_text(page.url, encoding="utf-8")

        summary = await page.evaluate(
            """
            () => ({
                title: document.title,
                forms: Array.from(document.querySelectorAll('form')).map(form => ({
                    action: form.getAttribute('action'),
                    method: form.getAttribute('method'),
                    id: form.id,
                    inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(el => ({
                        tag: el.tagName.toLowerCase(),
                        type: el.getAttribute('type'),
                        name: el.getAttribute('name'),
                        id: el.id,
                        placeholder: el.getAttribute('placeholder'),
                        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
                        options: el.tagName.toLowerCase() === 'select'
                            ? Array.from(el.querySelectorAll('option')).map(o => ({ value: o.value, label: (o.textContent || '').trim() })).slice(0, 15)
                            : null,
                    })),
                    buttons: Array.from(form.querySelectorAll('button, input[type=submit], input[type=button]')).map(el => ({
                        tag: el.tagName.toLowerCase(),
                        type: el.getAttribute('type'),
                        id: el.id,
                        text: (el.textContent || el.value || '').trim(),
                    })),
                })),
                visible_inputs: Array.from(document.querySelectorAll('input, select, textarea'))
                    .filter(el => el.offsetParent !== null)
                    .map(el => ({
                        tag: el.tagName.toLowerCase(),
                        type: el.getAttribute('type'),
                        name: el.getAttribute('name'),
                        id: el.id,
                        placeholder: el.getAttribute('placeholder'),
                    })),
                headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, legend, label'))
                    .filter(el => el.offsetParent !== null)
                    .map(el => (el.textContent || '').trim())
                    .filter(Boolean)
                    .slice(0, 30),
                visible_buttons: Array.from(document.querySelectorAll('button, input[type=submit], input[type=button], a.btn'))
                    .filter(el => el.offsetParent !== null)
                    .map(el => ({
                        id: el.id || null,
                        text: (el.textContent || el.value || '').trim().slice(0, 80),
                    }))
                    .filter(it => it.text),
            })
            """
        )

        (ARTIFACTS / f"{slug}_summary.json").write_text(
            json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        print(f"OK — {page.url}")
        print(f"  title: {summary.get('title')}")
        print(f"  visible inputs: {len(summary.get('visible_inputs', []))}")
        print(f"  forms: {len(summary.get('forms', []))}")
        print(f"  artifacts: {ARTIFACTS}/{slug}_*")


if __name__ == "__main__":
    asyncio.run(main())
