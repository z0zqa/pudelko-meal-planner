"""Fetches air fryer recipes from doradcasmaku.pl: name, servings, ingredients, time, category, link and
cooking-method flags (derived from the steps, whose text isn't saved). Data comes from the schema.org
Recipe on each page. No Crawl-delay in robots.txt; we still wait a few seconds between requests.
Run: python3 tools/fetch_doradcasmaku.py   (resumes an interrupted run)
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'doradcasmaku-raw.json'
BASE = 'https://www.doradcasmaku.pl'
LISTS = ['/przepisy-air-fryer-kuchnia']
UA = 'Mozilla/5.0 (prywatny planer posilkow)'
DELAY = 3

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


def minutes(iso):
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', iso or '')
    return (int(m.group(1) or 0) * 60 + int(m.group(2) or 0)) if m else None


# "pierś z kurczaka 500 gramów" → name "pierś z kurczaka", quantity "500 gramów"; "sól do smaku" → no quantity.
QTY = re.compile(r'^(.*?)\s+((?:\d+(?:[.,]\d+)?(?:\s*[-–/]\s*\d+(?:[.,]\d+)?)?|pół|ćwierć|półtora)\s*[^\d]*)$', re.I)


def split_ingredient(line):
    line = re.sub(r'\s+', ' ', html.unescape(line)).strip()
    m = QTY.match(line)
    if m and m.group(1):
        return {'name': m.group(1).strip(), 'qty': m.group(2).strip()}
    return {'name': re.sub(r'\s+do smaku$', '', line), 'qty': ''}


def meal_type(category):
    c = (category or '').lower()
    # Breakfast first: "śniadanie" contains "danie".
    if 'śniadani' in c or c == 'jajka':
        return 'sniadanie'
    if re.search(r'obiad|kolacj|kurczak|podudzi|ryb|wieprzow|krewetk|tofu|zapiekank|panierk', c):
        return 'obiad'
    return None  # desserts, cakes, snacks, chips and fries


def flags(steps_text):
    t = steps_text.lower()
    return {
        'oven': False,  # every recipe here has an air fryer version
        'airfryer': True,
        'dish': False,
        'fry': bool(re.search(r'głębok\w* tłuszcz|smaż\w* na głębok', t)),
        'nocook': False,
        'steps': max(1, len(re.findall(r'(?:^|\s)\d+\.\s', t))),
    }


def parse(url, page):
    for block in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            d = json.loads(block)
        except ValueError:
            continue
        for it in d if isinstance(d, list) else d.get('@graph', [d]):
            if it.get('@type') != 'Recipe':
                continue
            # The steps are in the description or in recipeInstructions (often the same text twice).
            ins = it.get('recipeInstructions')
            if isinstance(ins, list):
                ins = ' '.join(s.get('text', '') if isinstance(s, dict) else str(s) for s in ins)
            steps = max(it.get('description') or '', ins or '', key=len)
            category = it.get('recipeCategory') or ''
            return {
                'url': url,
                'name': html.unescape(html.unescape(it.get('name', ''))).strip(),  # the site encodes some names twice
                'yield': str(it.get('recipeYield') or ''),
                'tags': [meal_type(category)],
                'crumbs': [category],
                'keywords': it.get('keywords') or '',
                'diets': [],
                'totalTime': minutes(it.get('totalTime')),
                'flags': flags(steps),
                'ingredients': [{'name': 'Składniki', 'items': [split_ingredient(x) for x in it.get('recipeIngredient', [])]}],
            }
    return None


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {'urls': [], 'recipes': {}, 'skipped': []}
    if not data['urls']:
        for path in LISTS:
            page = get(BASE + path)
            data['urls'] += sorted({BASE + u for u in re.findall(r'href="(/przepis-[^"]+)"', page)} - set(data['urls']))
        print(f"{len(data['urls'])} recipes on the list", flush=True)
    for i, url in enumerate(data['urls']):
        if url in data['recipes'] or url in data['skipped']:
            continue
        r = parse(url, get(url))
        if r and r['ingredients'][0]['items']:
            data['recipes'][url] = r
        else:
            data['skipped'].append(url)
        if i % 10 == 0:
            OUT.write_text(json.dumps(data, ensure_ascii=False))
            print(f"{i + 1}/{len(data['urls'])}", flush=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False))
    print(f"Done. Recipes: {len(data['recipes'])}, skipped: {len(data['skipped'])}")


if __name__ == '__main__':
    main()
