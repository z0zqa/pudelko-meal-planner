"""Fetches recipes from the gerlach.pl blog: name, servings, ingredients, categories, tags, link and cooking-method
flags (derived from the method, whose text isn't saved). The blog has no schema.org Recipe, so the data comes from
the post layout: an "h2 … potrzebne / Składniki" heading followed by lists, then a "Jak przygotować" heading.
robots.txt allows the blog; we still wait a few seconds between requests.
Run: python3 tools/fetch_gerlach.py   (resumes an interrupted run)
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'gerlach-raw.json'
BASE = 'https://gerlach.pl/blog/category/'
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


# Meal type from the blog's subcategory and the post's own tags. Suppers share the breakfast pool in the app.
def meal_type(cats, tags):
    c = ' '.join(cats).lower()
    t = set(tags)
    if re.search(r'deser|ciast|wypiek|napoj|drink|przetwor|przekąs|sos', c) and not re.search(r'główn|zup|śniadan', c):
        return None
    if 'śniadan' in c or 'śniadanie' in t:
        return 'sniadanie'
    if re.search(r'główn|zup|obiad', c) or 'obiad' in t or 'lunch' in t or 'dania mięsne' in t:
        return 'obiad'
    if 'kolacja' in t:
        return 'sniadanie'
    return None


def flags(method):
    t = text(method).lower()
    return {
        'oven': bool(re.search(r'piekarnik|°c|stopni|termoobieg', t)) and 'air fryer' not in t,
        'airfryer': bool(re.search(r'air ?fryer|frytkownic\w* beztłuszczow', t)),
        'dish': bool(re.search(r'naczyni\w* żaroodporn|forem\w*|blach\w*', t)),
        'pan': 'patelni' in t,
        'pot': bool(re.search(r'garnk|gotuj', t)),
        'fry': bool(re.search(r'głębok\w* tłuszcz|frytownic', t)),
        'nocook': not re.search(r'piecz|gotuj|smaż|dus|podgrz|grill|patelni|piekarnik|air ?fryer|mikrofal|blanszu|zapiek', t),
        'steps': max(1, len(re.findall(r'<li\b', method)) or len(re.findall(r'<p\b[^>]*>\s*[^<\s]', method))),
    }


def minutes(t):
    # The longest stated time in the method („piecz 25 minut”, „gotuj ok. 1 godzinę”), as a rough total.
    mins = [int(m) for m in re.findall(r'(\d+)\s*min', t)]
    mins += [int(float(h.replace(',', '.')) * 60) for h in re.findall(r'(\d+(?:[.,]\d+)?)\s*godzin', t)]
    return min(240, sum(sorted(mins)[-3:])) if mins else None


def parse(url, page):
    clean = re.sub(r'<script.*?</script>|<style.*?</style>|<svg.*?</svg>', '', page, flags=re.S)
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', clean, re.S)
    if not h1:
        return None
    # The post's own categories sit just above the title; the sidebar lists every category.
    cats = [text(c) for c in re.findall(r'post-miniature__categories-link[^>]*>(.*?)</a>', clean[max(0, h1.start() - 4000):h1.start()], re.S)]
    tl = re.search(r'Tematy związane z artykułem.*?</ul>', clean, re.S)
    tags = [html.unescape(text(t)).lower() for t in re.findall(r'blog-tags__link[^>]*>(.*?)</a>', tl.group(0), re.S)] if tl else []
    heads = [(m.start(), m.end(), text(m.group(1))) for m in re.finditer(r'<h[2-4][^>]*>(.*?)</h[2-4]>', clean, re.S) if m.start() > h1.end()]
    ing_h = next((h for h in heads if re.search(r'potrzebn|składnik', h[2], re.I)), None)
    if not ing_h:
        return None
    after = [h for h in heads if h[0] > ing_h[0]]
    ing_html = clean[ing_h[1]:after[0][0] if after else len(clean)]
    lines = [text(li) for li in re.findall(r'<li[^>]*>(.*?)</li>', ing_html, re.S)]
    lines = [re.sub(r'(\d)(g|ml|kg|l)\b', r'\1 \2', x) for x in lines if x]
    meth_h = next((h for h in after if re.search(r'przygotow|wykonani|jak (zrobić|upiec|ugotować|usmażyć)', h[2], re.I)), None)
    nxt = [h for h in heads if meth_h and h[0] > meth_h[0]]
    method = clean[meth_h[1]:nxt[0][0]] if meth_h else ''
    intro = text(clean[h1.end():ing_h[0]]) + ' ' + ing_h[2]
    serves = re.search(r'(\d+)\s*(?:porcj|osób|osoby)', intro + ' ' + text(ing_html), re.I)
    return {
        'url': url,
        'name': text(h1.group(1)),
        'yield': serves.group(1) if serves else '',
        'tags': [meal_type(cats, tags)],
        'crumbs': cats,
        'keywords': ' '.join(tags),
        'diets': [t for t in tags if t in ('wegańskie przepisy', 'wegetariańskie przepisy', 'bez glutenu')],
        'totalTime': minutes(text(method)),
        'flags': flags(method),
        'ingredients': [{'name': 'Składniki', 'items': [{'name': x, 'qty': ''} for x in lines]}],
    }


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {'urls': [], 'recipes': {}, 'skipped': []}
    if not data['urls']:
        # Category pages: przepisy.html, then 2/przepisy.html, 3/… until a page brings no new posts.
        n = 1
        while True:
            page = get(BASE + ('przepisy.html' if n == 1 else f'{n}/przepisy.html'))
            new = [u for u in dict.fromkeys(re.findall(r'href="(https://gerlach\.pl/blog/post/[^"]+\.html)"', page)) if u not in data['urls']]
            if not new:
                break
            data['urls'] += new
            n += 1
        print(f"{len(data['urls'])} posts in the recipe category", flush=True)
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
