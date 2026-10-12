"""Pobiera z centrumrespo.pl dania główne: nazwę, porcje, składniki (w gramach), wartości odżywcze
na porcję, czas, oznaczenia diet, link oraz znaczniki sposobu przygotowania (bez tekstu przepisu).

Uruchom: python3 tools/fetch_respo.py  (wznawia przerwane pobieranie)
"""
import concurrent.futures as cf
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'respo-raw.json'
BASE = 'https://centrumrespo.pl/przepisy/kategoria/'
CATEGORIES = [('obiad', 'dania-glowne')]
UA = 'Mozilla/5.0 (prywatny planer posilkow)'
DELAY = 0.7


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 ** attempt)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def minutes(iso):
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', iso or '')
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0) if m and (m.group(1) or m.group(2)) else None


def num(s):
    m = re.search(r'(\d+(?:[.,]\d+)?)', str(s or ''))
    return float(m.group(1).replace(',', '.')) if m else None


def flags(t, steps):
    return {
        'oven': bool(re.search(r'piekarnik|°c|stopni|termoobieg', t)),
        'airfryer': bool(re.search(r'air ?fryer|frytkownic\w* beztłuszczow', t)),
        'dish': bool(re.search(r'naczyni\w* żaroodporn|tortownic|keksówk|form(a|ie|ę|y) do (pieczenia|tarty|zapiekan)|kokilk|forem', t)),
        'pan': bool(re.search(r'patelni', t)),
        'pot': bool(re.search(r'garn|rondel|gotuj|zagotuj', t)),
        'fry': bool(re.search(r'głębokim tłuszcz|frytur', t)),
        'nocook': not re.search(r'piekarnik|patelni|garn|gotuj|smaż|piecz|duś|dus[ić]|podgrzej|grill|mikrofal|blansz|rondel|air ?fryer|toster|wrząt', t),
        'steps': steps,
    }


def parse(url, h, kind, cat):
    recipe = None
    for m in re.findall(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(m)
        except Exception:
            continue
        for x in (d.get('@graph', [d]) if isinstance(d, dict) else d):
            t = x.get('@type')
            if t == 'Recipe' or (isinstance(t, list) and 'Recipe' in t):
                recipe = x
    if not recipe or not recipe.get('recipeIngredient'):
        return None
    ins = recipe.get('recipeInstructions') or ''
    if isinstance(ins, list):
        steps = len(ins)
        ins = ' '.join(i.get('text', '') if isinstance(i, dict) else str(i) for i in ins)
    else:
        steps = max(1, len(re.findall(r'<li|<p', ins)))
    t = html.unescape(re.sub(r'<[^>]+>', ' ', ins)).lower()
    n = recipe.get('nutrition') or {}
    return {
        'url': url,
        'name': html.unescape(recipe.get('name', '')),
        'yield': str(recipe.get('recipeYield') or ''),
        'tags': [kind],
        'crumbs': [cat],
        'keywords': recipe.get('keywords') or '',
        'diets': [d.rsplit('/', 1)[-1] for d in recipe.get('suitableForDiet') or []],
        'totalTime': minutes(recipe.get('totalTime')) or minutes(recipe.get('prepTime')),
        'nutritionPortion': {'kcal': num(n.get('calories')), 'protein': num(n.get('proteinContent'))},
        'flags': flags(t, steps),
        'ingredients': [{'name': 'Składniki', 'items': [{'name': html.unescape(i), 'qty': ''} for i in recipe['recipeIngredient']]}],
    }


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {'urls': {}, 'catsDone': [], 'recipes': {}, 'skipped': []}
    save = lambda: OUT.write_text(json.dumps(data, ensure_ascii=False))
    for kind, cat in CATEGORIES:
        if cat in data['catsDone']:
            continue
        page = 1
        while True:
            h = get(BASE + cat + '/' + (f'page/{page}/' if page > 1 else ''))
            if not h:
                break
            links = set(re.findall(r'href="(https://centrumrespo\.pl/przepisy/(?!kategoria/)[^"#?]+/)"', h))
            new = [l for l in links if l not in data['urls']]
            for l in links:
                data['urls'].setdefault(l, {'kind': kind, 'cat': cat})
            if not new and page > 1:
                break
            page += 1
            time.sleep(DELAY)
        data['catsDone'].append(cat)
        save()
        print(f'{cat}: adresów {len(data["urls"])}', flush=True)

    todo = [u for u in data['urls'] if u not in data['recipes'] and u not in data['skipped']]
    print(f'Do pobrania: {len(todo)}', flush=True)

    def work(u):
        h = get(u)
        time.sleep(DELAY)
        return u, h

    n = 0
    with cf.ThreadPoolExecutor(2) as ex:
        for fut in cf.as_completed([ex.submit(work, u) for u in todo]):
            try:
                u, h = fut.result()
            except Exception as e:
                print('błąd:', e, file=sys.stderr)
                continue
            info = data['urls'][u]
            r = parse(u, h, info['kind'], info['cat']) if h else None
            if r:
                data['recipes'][u] = r
            else:
                data['skipped'].append(u)
            n += 1
            if n % 50 == 0:
                save()
                print(f'{n}/{len(todo)}', flush=True)
    save()
    print(f'Gotowe. Przepisy: {len(data["recipes"])}')


if __name__ == '__main__':
    main()
