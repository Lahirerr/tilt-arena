"""Render SVG/PNG files side by side on the dark game background into one PNG for review.
Usage: python3 preview_sheet.py out.png file1.svg file2.svg ...   (needs: pip install playwright && playwright install chromium)"""
import sys, os, asyncio
from playwright.async_api import async_playwright
out, files = sys.argv[1], sys.argv[2:]
imgs = "".join(f'<figure style="margin:0;text-align:center;color:#cfc8b8;font:14px sans-serif"><img src="file://{os.path.abspath(f)}" style="max-height:520px"><figcaption>{os.path.basename(f)}</figcaption></figure>' for f in files)
html = f'<html><body style="margin:0;background:#262c28;display:flex;flex-wrap:wrap;gap:40px;align-items:flex-end;padding:40px">{imgs}</body></html>'
tmp = os.path.abspath(out) + ".html"; open(tmp, "w").write(html)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1400, "height": 700})
        await pg.goto("file://" + tmp); await pg.wait_for_timeout(500)
        await pg.screenshot(path=out, full_page=True); await b.close()
asyncio.run(main()); os.remove(tmp)
