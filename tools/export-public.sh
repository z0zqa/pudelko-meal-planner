#!/bin/sh
# Składa publiczną wersję repozytorium w osobnym katalogu: bez danych z innych serwisów,
# bez skryptów, które je pobierają, i bez historii gita (w historii te dane są).
# Uruchom: sh tools/export-public.sh ../pudelko-public
set -eu

OUT=${1:?Podaj katalog docelowy, np. ../pudelko-public}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then
  echo "Katalog $OUT nie jest pusty." >&2
  exit 1
fi
mkdir -p "$OUT"

# Tylko pliki śledzone przez gita, bez prywatnych.
cd "$ROOT"
git ls-files | grep -Ev '^(data/|js/recipes-[a-z]+\.js$|tools/fetch_|tools/build-recipes\.mjs$|tools/export-public\.sh$)' |
  while IFS= read -r f; do
    mkdir -p "$OUT/$(dirname "$f")"
    cp "$f" "$OUT/$f"
  done

# Z README znika sekcja o prywatnych źródłach (między znacznikami).
sed '/<!-- prywatne -->/,/<!-- \/prywatne -->/d' README.md > "$OUT/README.md"

cd "$OUT"
git init -q -b main
git add -A
echo "Gotowe: $OUT ($(git ls-files | wc -l | tr -d ' ') plików). Sprawdź, zrób commit i dodaj zdalne repozytorium."
