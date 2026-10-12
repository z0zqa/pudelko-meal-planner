"""Pobiera z kwestiasmaku.com dane potrzebne planerowi: nazwę, porcje, składniki, link oraz
znaczniki sposobu przygotowania i szacowany czas (wyliczone z kroków; samego tekstu nie zapisuje).

Strona prosi w robots.txt o 10 s przerwy między zapytaniami, więc pobieramy po jednym, powoli.
Bierzemy tylko kategorie przydatne w planerze (obiady, śniadania, lekkie kolacje).
Uruchom: python3 tools/fetch_kwestiasmaku.py  (wznawia przerwane pobieranie)
"""
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'kwestiasmaku-raw.json'
BASE = 'https://www.kwestiasmaku.com'
UA = 'Mozilla/5.0 (prywatny planer posilkow)'
DELAY = 10  # Crawl-delay z robots.txt

# Kolejność = priorytet: najpierw kategorie najbardziej przydatne przy szybkim, zdrowym gotowaniu.
TAGS = [
    ('obiad', 'szybki-obiad'), ('sniadanie', 'sniadania-bez-chleba'), ('obiad', 'lunche-do-pracy'),
    ('obiad', 'z-jednej-patelni'), ('sniadanie', 'owsianka'), ('obiad', 'jednogarnkowe'), ('obiad', 'na-zdrowie'),
    ('sniadanie', 'omlety'), ('obiad', 'stir-fry'), ('sniadanie', 'lekkie-kolacje'), ('obiad', 'curry'),
    ('obiad', 'wrapy'), ('obiad', 'salatki-z-kurczakiem'), ('obiad', 'kolacje-na-cieplo'), ('sniadanie', 'szakszuka'),
    ('obiad', 'filety-z-kurczaka'), ('obiad', 'w-papilotach'), ('obiad', 'na-parze'), ('obiad', 'dal'),
    ('obiad', 'kaszotto'), ('obiad', 'kasze'), ('obiad', 'zupy-krem'), ('sniadanie', 'frittata'),
    ('sniadanie', 'jaglanka'), ('sniadanie', 'pasty-kanapkowe'), ('sniadanie', 'pasta-jajeczna'), ('obiad', 'lunche'),
]
MAX_PAGES = 10

last = [0.0]


def get(url):
    wait = DELAY - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                last[0] = time.time()
                return r.read().decode('utf-8', 'replace')
        except Exception:
            last[0] = time.time()
            if attempt == 2:
                raise
            time.sleep(DELAY * (attempt + 2))


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def flags(t, steps):
    return {
        'oven': bool(re.search(r'piekarnik|°c|stopni|termoobieg', t)),
        'airfryer': bool(re.search(r'air ?fryer|frytkownic\w* beztłuszczow', t)),
        'dish': bool(re.search(r'naczyni\w* żaroodporn|tortownic|keksówk|form(a|ie|ę|y) do (pieczenia|tarty|zapiekan)|kokilk|forem', t)),
        'pan': bool(re.search(r'patelni', t)),
        'pot': bool(re.search(r'garn|rondel|gotować|zagotować', t)),
        'fry': bool(re.search(r'głębokim tłuszcz|frytur|smażyć partiami', t)),
        'nocook': not re.search(r'piekarnik|patelni|garn|gotowa|smaży|piec|dusi|podgrza|grill|mikrofal|blansz|rondel|air ?fryer|toster|wrząt', t),
        'steps': steps,
    }


def est_minutes(t):
    # Suma czasów z kroków („gotować 15 minut”, „piec 20–25 min”) plus kilka minut na krojenie.
    mins = [int(b or a) for a, b in re.findall(r'(\d+)\s*(?:[-–]\s*(\d+))?\s*min', t)]
    hours = [float(h.replace(',', '.')) for h in re.findall(r'(\d+(?:[.,]\d+)?)\s*godz', t)]
    total = sum(m for m in mins if m <= 120) + sum(h * 60 for h in hours if h <= 4)
    return int(round(total + 10)) if total else None


def parse(url, h, tags):
    box = re.search(r'field-name-field-skladniki[^>]*>(.*?)</div>', h, re.S)
    if not box:
        return None
    items = [{'name': text(li), 'qty': ''} for li in re.findall(r'<li[^>]*>(.*?)</li>', box.group(1), re.S) if text(li)]
    prep = re.search(r'field-name-field-przygotowanie[^>]*>(.*?)</div>\s*</div>', h, re.S)
    t = text(prep.group(1)).lower() if prep else ''
    steps = len(re.findall(r'<li', prep.group(1))) or len(re.findall(r'<p', prep.group(1))) if prep else 0
    name = re.search(r'<meta property="og:title" content="([^"]*)"', h)
    size = re.search(r'field-name-field-ilosc-porcji[^>]*>(.*?)</div>', h, re.S)
    return {
        'url': url,
        'name': html.unescape(name.group(1)) if name else url.rsplit('/', 1)[-1],
        'yield': text(size.group(1)) if size else None,
        'tags': tags,
        'crumbs': [],
        'totalTime': est_minutes(t),
        'flags': flags(t, steps),
        'ingredients': [{'name': 'Składniki', 'items': items}],
    }


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {'urls': {}, 'tagsDone': [], 'recipes': {}, 'skipped': []}
    save = lambda: OUT.write_text(json.dumps(data, ensure_ascii=False))

    def fetch_recipes(urls):
        for u in urls:
            if BASE + u in data['recipes'] or BASE + u in data['skipped']:
                continue
            try:
                h = get(BASE + u)
            except Exception as e:
                print('błąd:', u, e, file=sys.stderr)
                continue
            info = data['urls'][u]
            r = parse(BASE + u, h, [info['kind']] + info['tags'])
            if r:
                data['recipes'][BASE + u] = r
            else:
                data['skipped'].append(BASE + u)
            save()

    # Kategoria po kategorii: adresy z kolejnych stron listy, a zaraz potem same przepisy.
    for kind, tag in TAGS:
        if tag in data['tagsDone']:
            continue
        page_urls = []
        for page in range(MAX_PAGES):
            h = get(f'{BASE}/przepisy/{tag}' + (f'?page={page}' if page else ''))
            links = [l for l in dict.fromkeys(re.findall(r'href="(/przepis/[^"#?]+)"', h))]
            new = [l for l in links if l not in page_urls]
            if not new:
                break
            for l in links:
                data['urls'].setdefault(l, {'kind': kind, 'tags': []})
                if tag not in data['urls'][l]['tags']:
                    data['urls'][l]['tags'].append(tag)
            page_urls += new
            save()
            if f'page={page + 1}' not in h:
                break
        print(f'{tag}: {len(page_urls)} przepisów na liście, pobieram…', flush=True)
        fetch_recipes(page_urls)
        data['tagsDone'].append(tag)
        save()
        print(f'{tag}: gotowe · razem przepisów {len(data["recipes"])}', flush=True)
    print(f'Gotowe. Przepisy: {len(data["recipes"])}')


if __name__ == '__main__':
    main()
