"""Pobiera z aniagotuje.pl dane potrzebne planerowi: nazwę, porcje, składniki, wartości odżywcze
i link. Treści przepisów (kroki, opisy, zdjęcia) zostają u Ani — w aplikacji jest link do oryginału.

Uruchom: python3 tools/fetch_aniagotuje.py
Wznawia pobieranie: przepisy już zapisane w pliku są pomijane.
"""
import concurrent.futures as cf
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'data' / 'aniagotuje-raw.json'
UA = 'Mozilla/5.0 (prywatny planer posilkow)'
WORKERS = 3
DELAY = 0.4  # sekundy przerwy po każdym zapytaniu (na wątek)

# Kategorie, których planer nie potrzebuje.
SKIP = ('ciasta-i-torty', 'ciasteczka', 'serniki', 'desery', 'napoje-i-koktajle', 'drinki-i-nalewki',
        'przetwory', 'paczki-i-oponki', 'babeczki-i-muffiny', 'lody-domowe', 'chleby-i-bulki', 'porady')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def text(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def meta(h, prop):
    m = re.search(rf'<meta itemprop="{prop}" content="([^"]*)"', h)
    return html.unescape(m.group(1)) if m else None


def minutes(iso):
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', iso or '')
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0) if m else None


def parse(url, h):
    if 'itemprop="recipeIngredient"' not in h:
        return None
    name = re.search(r'<h1 itemprop="name">(.*?)</h1>', h, re.S)
    crumbs = re.findall(r'<a href="/przepisy/([^"]+)" itemprop="item"', h)
    groups = []
    for sec in re.findall(r'<section class="post-ingredients-group">(.*?)</section>', h, re.S):
        head = re.search(r'<strong>(.*?)</strong>', sec, re.S)
        items = []
        for li in re.findall(r'<li>(.*?)</li>', sec, re.S):
            nm = re.search(r'class="ingredient ingredient-name">(.*?)</span>', li, re.S)
            qty = re.search(r'class="qty ingredient-qty">(.*?)</span>', li, re.S)
            if nm:
                items.append({'name': text(nm.group(1)), 'qty': text(qty.group(1)) if qty else ''})
        groups.append({'name': text(head.group(1)) if head else '', 'items': items})
    nutr = {k: meta(h, k) or (re.search(rf'itemprop="{k}">([^<]*)<', h) or [None, None])[1]
            for k in ('calories', 'proteinContent', 'fatContent', 'carbohydrateContent')}
    return {
        'url': url,
        'name': text(name.group(1)) if name else meta(h, 'name'),
        'yield': meta(h, 'recipeYield'),
        'category': meta(h, 'recipeCategory'),
        'crumbs': crumbs,
        'keywords': meta(h, 'keywords'),
        'diets': re.findall(r'itemprop="suitableForDiet" href="https://schema.org/(\w+)"', h),
        'prepTime': minutes(meta(h, 'prepTime')),
        'cookTime': minutes(meta(h, 'cookTime')),
        'totalTime': minutes(meta(h, 'totalTime')),
        'nutrition100g': nutr,
        'ingredients': groups,
    }


def main():
    sitemap = get('https://aniagotuje.pl/sitemap.xml')
    urls = [u for u in re.findall(r'<loc>([^<]+/przepis/[^<]+)</loc>', sitemap)]
    data = json.loads(OUT.read_text()) if OUT.exists() else {'recipes': {}, 'skipped': []}
    done = set(data['recipes']) | set(data['skipped'])
    todo = [u for u in urls if u not in done]
    print(f'{len(urls)} przepisów w mapie strony, do pobrania: {len(todo)}', flush=True)

    def work(u):
        h = get(u)
        time.sleep(DELAY)
        return u, h

    n = 0
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for fut in cf.as_completed([ex.submit(work, u) for u in todo]):
            try:
                u, h = fut.result()
            except Exception as e:
                print('błąd:', e, file=sys.stderr)
                continue
            r = parse(u, h)
            if r and not any(c.split('/')[0] in SKIP for c in r['crumbs']):
                data['recipes'][u] = r
            else:
                data['skipped'].append(u)
            n += 1
            if n % 50 == 0:
                OUT.write_text(json.dumps(data, ensure_ascii=False))
                print(f'{n}/{len(todo)} · zapisane przepisy: {len(data["recipes"])}', flush=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False))
    print(f'Gotowe. Przepisy: {len(data["recipes"])}, pominięte: {len(data["skipped"])}')


if __name__ == '__main__':
    main()
