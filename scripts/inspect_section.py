"""Logs in and inspects a single section of the site.

Usage:
    python scripts/inspect_section.py <relative-path> [--name <slug>]

Writes screenshot, HTML, and a JSON summary of forms + interactive controls
into `scripts/_artifacts/<slug>_*`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.scraper.browser import get_browser_page
from app.scraper.login import login


ARTIFACTS = Path(__file__).parent / "_artifacts"


def _slug(path: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", path).strip("_").lower() or "section"


async def main(path: str, name: str | None) -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    settings = get_settings()
    slug = name or _slug(path)

    async with get_browser_page() as page:
        await login(page, settings.SITE_URL, settings.SITE_USER, settings.SITE_PASS)

        target = f"{settings.SITE_URL.rstrip('/')}{path}" if path.startswith("/") else f"{settings.SITE_URL.rstrip('/')}/{path}"
        await page.goto(target, wait_until="networkidle", timeout=30_000)

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
                        options: el.tagName.toLowerCase() === 'select'
                            ? Array.from(el.querySelectorAll('option')).map(o => ({ value: o.value, label: (o.textContent || '').trim() }))
                            : null,
                    })),
                    buttons: Array.from(form.querySelectorAll('button, input[type=submit], input[type=button]')).map(el => ({
                        tag: el.tagName.toLowerCase(),
                        type: el.getAttribute('type'),
                        id: el.id,
                        text: (el.textContent || el.value || '').trim(),
                    })),
                })),
                headings: Array.from(document.querySelectorAll('h1, h2, h3, legend')).map(el => (el.textContent || '').trim()).filter(Boolean),
                tables: Array.from(document.querySelectorAll('table')).map(t => ({
                    id: t.id,
                    classes: t.className,
                    headers: Array.from(t.querySelectorAll('thead th')).map(th => (th.textContent || '').trim()),
                    rowCount: t.querySelectorAll('tbody tr').length,
                })),
                buttons_outside_forms: Array.from(document.querySelectorAll('button, [role=button]'))
                    .filter(el => !el.closest('form'))
                    .map(el => ({
                        text: (el.textContent || '').trim().slice(0, 80),
                        id: el.id,
                        classes: el.className,
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
        print(f"  forms: {len(summary.get('forms', []))}, tables: {len(summary.get('tables', []))}")
        print(f"  artifacts: {ARTIFACTS}/{slug}_*")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("path", help="Path relative to SITE_URL, e.g. /Home/Reportes?iType=1")
    parser.add_argument("--name", help="Override slug for output files")
    args = parser.parse_args()
    asyncio.run(main(args.path, args.name))
