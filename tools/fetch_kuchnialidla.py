"""Pobiera z kuchnialidla.pl dane potrzebne planerowi: nazwę, kategorię, porcje, składniki,
wartości odżywcze i link. Treści przepisów (kroki, opisy, zdjęcia) zostają na stronie Lidla.

Uruchom: python3 tools/fetch_kuchnialidla.py  (wznawia przerwane pobieranie)
Wynik: data/kuchnialidla-raw.json w tym samym formacie co data/aniagotuje-raw.json.
"""
import concurrent.futures as cf
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'data' / 'kuchnialidla-raw.json'
UA = 'Mozilla/5.0 (prywatny planer posilkow)'
WORKERS = 4
DELAY = 0.3

# Kategorie z okruszków („Gdzie jesteś?”), które planer może wykorzystać.
KEEP = ('dania-glowne', 'zupy', 'sniadania', 'salatki', 'fast-food', 'grill', 'dania-wegetarianskie', 'dania-weganskie')


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
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def num(s):
    m = re.search(r'(\d+(?:[.,]\d+)?)', s or '')
    return float(m.group(1).replace(',', '.')) if m else None


def parse(url, h):
    box = re.search(r'<div class="skladniki">\s*<h2>Składniki</h2>(.*?)</div>', h, re.S)
    if not box:
        return None
    items = []
    for li in re.findall(r'<li>(.*?)</li>', box.group(1), re.S):
        t = text(li)
        name, _, qty = t.rpartition(' - ') if ' - ' in t else (t, '', '')
        items.append({'name': name.strip(), 'qty': qty.strip()})
    bc = re.search(r'breadcrumbs">(.*?)</ul>', h, re.S)
    crumbs = re.findall(r'<a href="/przepisy/([^"]+)">', bc.group(1)) if bc else []
    nutr = {}
    tab = re.search(r'<div class="skladniki wartosci">(.*?)</table>', h, re.S)
    if tab:
        for k, v in re.findall(r'<td>(.*?)</td>\s*<td>(.*?)</td>', tab.group(1), re.S):
            nutr[text(k)] = num(text(v))
    name = re.search(r'<h1>(.*?)</h1>', h, re.S)
    size = re.search(r'class="meta_size">.*?<strong>(.*?)</strong>', h, re.S)
    tm = re.search(r'class="meta_time">.*?<strong>(\d+):(\d+)</strong>', h, re.S)
    return {
        'url': url,
        'name': text(name.group(1)) if name else url.rsplit('/', 1)[-1],
        'yield': text(size.group(1)) if size else None,
        'crumbs': crumbs,
        'totalTime': int(tm.group(1)) * 60 + int(tm.group(2)) if tm else None,
        'nutritionPortion': {
            'kcal': nutr.get('Wartość energetyczna na 1 porcję'),
            'protein': nutr.get('Białko'),
            'fat': nutr.get('Tłuszcz'),
            'carbs': nutr.get('Węglowodany'),
            'kcalTotal': nutr.get('Wartość energetyczna na całe danie'),
        },
        'ingredients': [{'name': 'Składniki', 'items': items}],
    }


def main():
    sm = get('https://kuchnialidla.pl/products_sitemap.xml')
    urls = re.findall(r'<loc>([^<]+)</loc>', sm)
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
            if r and any(c.split('/')[0] in KEEP for c in r['crumbs']):
                data['recipes'][u] = r
            else:
                data['skipped'].append(u)
            n += 1
            if n % 100 == 0:
                OUT.write_text(json.dumps(data, ensure_ascii=False))
                print(f'{n}/{len(todo)} · zapisane przepisy: {len(data["recipes"])}', flush=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False))
    print(f'Gotowe. Przepisy: {len(data["recipes"])}, pominięte: {len(data["skipped"])}')


if __name__ == '__main__':
    main()
