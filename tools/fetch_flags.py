"""Dla zaimportowanych przepisów (js/recipes-*.js) sprawdza w oryginale sposób przygotowania
i zapisuje same znaczniki: piekarnik, air fryer, patelnia, garnek, bez gotowania, liczba kroków.
Tekstu przepisów nie zapisuje. Wynik: data/flags.json (wznawia przerwane pobieranie).

Uruchom: python3 tools/fetch_flags.py
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
OUT = ROOT / 'data' / 'flags.json'
UA = 'Mozilla/5.0 (prywatny planer posilkow)'


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


def instructions(url, h):
    """Zwraca tekst kroków (tylko do analizy w pamięci) i ich liczbę."""
    if 'aniagotuje.pl' in url:
        i = h.find('itemprop="recipeInstructions"')
        j = h.find('Najczęściej zadawane pytania', i)
        body = h[i:j if j > 0 else i + 80000]
        paras = [p for p in re.findall(r'<p[^>]*>(.*?)</p>', body, re.S)]
        text = ' '.join(re.sub(r'<[^>]+>', ' ', p) for p in paras)
        steps = sum(1 for p in paras if not re.sub(r'<[^>]+>', '', p).strip().startswith(('Porada', 'Czas')))
    else:
        m = re.search(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', h, re.S)
        d = json.loads(m.group(1)) if m else {}
        text = d.get('recipeInstructions') or ''
        steps = len(re.findall(r'KROK \d+', text)) or max(1, text.count('. ') // 2)
    return html.unescape(re.sub(r'\s+', ' ', text)).lower(), steps


def flags(text, steps):
    return {
        'oven': bool(re.search(r'piekarnik|°c|stopni|termoobieg', text)),
        'airfryer': bool(re.search(r'air ?fryer|frytkownic\w* beztłuszczow|frytkownic\w* na gorące powietrze', text)),
        'dish': bool(re.search(r'naczyni\w* żaroodporn|tortownic|keksówk|form(a|ie|ę|y) do (pieczenia|tarty|zapiekan)|kokilk|forem', text)),
        'pan': bool(re.search(r'patelni', text)),
        'pot': bool(re.search(r'garn|rondel|gotuj|zagotuj', text)),
        'fry': bool(re.search(r'głębokim tłuszcz|frytur|smaż\w* partiami|smaż\w* na rozgrzanym oleju z obu stron', text)),
        'nocook': not re.search(r'piekarnik|patelni|garn|gotuj|smaż|piecz|duś|dus[ić]|podgrzej|grill|mikrofal|blansz|zagotuj|rondel|air ?fryer|toster', text),
        'steps': steps,
    }


def main():
    urls = []
    # Kwestia Smaku ma znaczniki od razu w pliku z przepisami (tools/fetch_kwestiasmaku.py).
    for f in ('js/recipes-ania.js', 'js/recipes-lidl.js'):
        p = ROOT / f
        if p.exists():
            urls += re.findall(r'"source":"([^"]+)"', p.read_text())
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [u for u in dict.fromkeys(urls) if u not in data]
    print(f'{len(urls)} przepisów, do sprawdzenia: {len(todo)}', flush=True)

    def work(u):
        h = get(u)
        time.sleep(0.3)
        return u, h

    n = 0
    with cf.ThreadPoolExecutor(4) as ex:
        for fut in cf.as_completed([ex.submit(work, u) for u in todo]):
            try:
                u, h = fut.result()
                data[u] = flags(*instructions(u, h))
            except Exception as e:
                print('błąd:', e, file=sys.stderr)
                continue
            n += 1
            if n % 200 == 0:
                OUT.write_text(json.dumps(data))
                print(f'{n}/{len(todo)}', flush=True)
    OUT.write_text(json.dumps(data))
    print(f'Gotowe: {len(data)} przepisów ze znacznikami')


if __name__ == '__main__':
    main()
