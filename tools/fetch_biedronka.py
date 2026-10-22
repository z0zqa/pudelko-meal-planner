"""Fetches current food prices from Biedronka's online grocery store (zakupy.biedronka.pl).

Reads only category listings (allowed by robots.txt; search pages are not) and keeps name, price,
package size, price per kg/l and category for each product. Saves to data/biedronka-raw.json.
Run: python3 tools/fetch_biedronka.py   (then: node tools/update-prices.mjs)
"""
import html
import json
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'biedronka-raw.json'
BASE = 'https://zakupy.biedronka.pl'
UA = 'Mozilla/5.0 (prywatny planer posilkow)'
DELAY = 3  # no Crawl-delay in robots.txt; stay polite anyway
PAGE = 32  # products per page; the store paginates with ?page=N

CATEGORIES = ['warzywa', 'owoce', 'mieso', 'nabial', 'piekarnia', 'mrozone', 'artykuly-spozywcze', 'dania-gotowe']

last = [0.0]


def get(url):
    wait = DELAY - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                last[0] = time.time()
                return r.read().decode('utf-8', 'replace')
        except Exception:
            last[0] = time.time()
            if attempt == 2:
                raise
            time.sleep(DELAY * (attempt + 2))


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def parse(page):
    out = []
    for tile in page.split('class="product-tile js-product-tile')[1:]:
        gtm = re.search(r'data-product-gtm="([^"]+)"', tile)
        if not gtm:
            continue
        d = json.loads(html.unescape(gtm.group(1)))
        pack = re.search(r'class="packaging-details">(.*?)</div>', tile, re.S)
        href = re.search(r'href="(https://zakupy\.biedronka\.pl/[^"]+\.html)"', tile)
        pack_txt = text(pack.group(1)) if pack else ''
        unit = re.search(r'([\d,]+) zł / (kg|l|szt)', pack_txt)
        out.append({
            'id': d['item_id'],
            'name': d['item_name'].strip(),
            'brand': d.get('item_brand', ''),
            'price': float(d['price']),
            'pack': pack_txt.split(' - ')[0].strip(),
            'unitPrice': float(unit.group(1).replace(',', '.')) if unit else None,
            'unitPer': unit.group(2) if unit else None,
            'cat': ' / '.join(x for x in (d.get('item_category2'), d.get('item_category3')) if x),
            'url': href.group(1) if href else '',
        })
    return out


def main():
    products = {}
    for cat in CATEGORIES:
        n, total = 1, None
        while total is None or (n - 1) * PAGE < total:
            page = get(f'{BASE}/{cat}/?page={n}')
            if total is None:
                m = re.search(r'(\d+) produkt', page)
                total = int(m.group(1)) if m else 0
            items = parse(page)
            if not items:
                break
            for p in items:
                products.setdefault(p['id'], {**p, 'top': cat})
            n += 1
        print(f'{cat}: {total} on the site · {len(products)} collected so far', flush=True)
    OUT.write_text(json.dumps({'date': date.today().isoformat(), 'products': list(products.values())}, ensure_ascii=False, indent=0))
    print(f'Done. Products: {len(products)} → {OUT}')


if __name__ == '__main__':
    main()
