"""Fetches recipes from olgalewandowskadietetyk.pl: name, servings, time, kcal and protein per serving (from the
page), ingredients, categories, link and cooking-method flags (derived from the method, whose text isn't saved).
The site has no schema.org Recipe, so the data comes from the page layout. robots.txt allows everything;
we still wait a few seconds between requests.
Run: python3 tools/fetch_olga.py   (resumes an interrupted run)
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'olga-raw.json'
SITEMAP = 'https://www.olgalewandowskadietetyk.pl/recipe-sitemap.xml'
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


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


# Meal type from the site's categories. Suppers share the breakfast pool in the app.
def meal_type(cats):
    if 'obiad' in cats or 'zupy' in cats:
        return 'obiad'
    if 'sniadanie' in cats or 'kolacje' in cats:
        return 'sniadanie'
    if 'salatki' in cats:
        return 'obiad'
    return None  # desserts, cakes, bakes and snacks


def flags(method):
    t = method.lower()
    return {
        'oven': bool(re.search(r'piekarnik|°c|stopni|termoobieg', t)) and 'air fryer' not in t,
        'airfryer': bool(re.search(r'air ?fryer|frytkownic\w* beztłuszczow', t)),
        'dish': bool(re.search(r'naczyni\w* żaroodporn|forem\w*|blach\w*', t)),
        'pan': 'patelni' in t,
        'pot': bool(re.search(r'garnk|gotuj', t)),
        'fry': bool(re.search(r'głębok\w* tłuszcz', t)),
        'nocook': not re.search(r'piecz|gotuj|smaż|dus|podgrz|grill|patelni|piekarnik|air ?fryer|mikrofal|blanszu|zapiek', t),
        'steps': max(1, len(re.findall(r'<li\b', method)) or len(re.findall(r'<p\b', method))),
    }


def parse(url, page):
    body = re.search(r'<body[^>]*class="([^"]*)"', page)
    pid = re.search(r'postid-(\d+)', body.group(1)) if body else None
    own = re.search(r'class="([^"]*\bpost-' + pid.group(1) + r'\b[^"]*)"', page) if pid else None
    cats = re.findall(r'recipes_category-([a-z0-9-]+)', own.group(1)) if own else []
    clean = re.sub(r'<script.*?</script>|<style.*?</style>|<svg.*?</svg>', '', page, flags=re.S)
    heads = [(m.start(), m.end(), text(m.group(1))) for m in re.finditer(r'<h[1-4][^>]*>(.*?)</h[1-4]>', clean, re.S)]
    ing_h = next((h for h in heads if h[2].lower().startswith('składniki')), None)
    if not ing_h:
        return None
    before = [h for h in heads if h[0] < ing_h[0] and h[2] and '/' not in h[2] and 'APLIKACJI' not in h[2].upper()]
    name = before[-1][2] if before else ''
    after = [h for h in heads if h[0] > ing_h[0]]
    ing_html = clean[ing_h[1]:after[0][0] if after else len(clean)]
    lines = [text(li) for li in re.findall(r'<li[^>]*>(.*?)</li>', ing_html, re.S)]
    # "100g piersi" → "100 g piersi", so the converter reads the unit.
    lines = [re.sub(r'(\d)(g|ml|kg|l)\b', r'\1 \2', x) for x in lines if x]
    meth_h = next((h for h in after if h[2].lower().startswith(('wykonanie', 'przygotowanie', 'sposób'))), None)
    nxt = [h for h in heads if meth_h and h[0] > meth_h[0]]
    method = clean[meth_h[1]:nxt[0][0]] if meth_h else ''
    # Time, servings, kcal and protein: the icon list just above the ingredients.
    info = [text(x) for x in re.findall(r'class="elementor-icon-list-text">(.*?)</span>', clean[:ing_h[0]], re.S)]
    kcal = next((float(m.group(1)) for x in info if (m := re.match(r'KCAL\s*-\s*([\d.,]+)', x, re.I))), None)
    prot = next((float(m.group(1).replace(',', '.')) for x in info if (m := re.match(r'BIAŁK\w*\s*-\s*([\d.,]+)', x, re.I))), None)
    nums = [x for x in info if re.fullmatch(r'\d+', x)]
    return {
        'url': url,
        'name': html.unescape(name).strip(),
        'yield': nums[1] if len(nums) > 1 else '1',
        'tags': [meal_type(cats)],
        'crumbs': cats,
        'keywords': ' '.join(cats),
        'diets': [c for c in cats if c in ('wegetarianskie', 'weganskie', 'bez-glutenu', 'bez-nabialu')],
        'totalTime': int(nums[0]) if nums else None,
        'nutritionPortion': {'kcal': kcal, 'protein': prot} if kcal else {},
        'flags': flags(method),
        'ingredients': [{'name': 'Składniki', 'items': [{'name': x, 'qty': ''} for x in lines]}],
    }


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {'urls': [], 'recipes': {}, 'skipped': []}
    if not data['urls']:
        data['urls'] = re.findall(r'<loc>(https://[^<]+/recipe/[^<]+)</loc>', get(SITEMAP))
        print(f"{len(data['urls'])} recipes in the sitemap", flush=True)
    for i, url in enumerate(data['urls']):
        if url in data['recipes'] or url in data['skipped']:
            continue
        r = parse(url, get(url))
        if r and r['name'] and r['ingredients'][0]['items']:
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
