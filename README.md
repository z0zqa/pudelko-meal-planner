# Pudełko 🥡

Prywatny planer posiłków na budżet, podobny do [prepka.pl](https://prepka.pl). Wpisujesz budżet i liczbę dni, a aplikacja układa jadłospis, listę zakupów i plan gotowania.

- **Plan**: każdego dnia śniadanie, obiad i kolacja, razem ok. **1500 kcal**. Porcje są dopasowywane do kalorii. Każde danie można wylosować od nowa albo zamienić, a koszt zakupów przelicza się od razu.
- **Preferencje**: lista składników do unikania (domyślnie papryka), mleko bez laktozy lub roślinne, tryb „jak najmniej przy garach” (krótki czas, bez kotletów i panierowania), air fryer zamiast piekarnika, cena dania (tanie / średnie / drogie), śniadania i kolacje na słodko lub na słono, wybór źródła przepisów.
- **Rotacja**: dania z ostatnich 2 tygodni nie wracają, a kolejne losowania tego samego dnia dają naprawdę inne dania.
- **Ulubione**: 👍 i 👎 przy daniach. Aplikacja uczy się, jakie składniki i połączenia smakowe lubisz, i częściej je proponuje. Odrzucone dania już się nie pojawiają.
- **Zakupy**: lista w **całych opakowaniach**, z cenami, po działach sklepu. Odhaczone produkty trafiają do lodówki.
- **Gotowanie**: rozpisany meal prep: co gotujesz pierwszego dnia, co w trakcie tygodnia, co mrozisz.
- **Szybkie**: ultra proste i zdrowe przepisy, także śniadania bez gotowania.
- **Lodówka**: wpisujesz, co masz. Nowy plan to wykorzysta, a ugotowane dania zdejmują produkty z lodówki.
- **Przepisy**: kilka tysięcy dań z czterech serwisów, z filtrami (źródło, cena, słodkie/słone, ulubione).

Bez konta, dane zostają w przeglądarce (localStorage). Działa offline i można ją zainstalować na telefonie (PWA).

## Uruchomienie

Wystarczy dowolny serwer plików statycznych:

```sh
python3 -m http.server 8000
# otwórz http://localhost:8000
```

Albo `node tools/build-single.mjs pudelko.html`, żeby złożyć całość w jeden plik.

**Nie publikuj tej wersji** (np. przez GitHub Pages): zawiera dane z cudzych serwisów i jest wyłącznie na własny użytek.

## Jak to działa

- `js/data.js`: produkty (wielkość opakowania i orientacyjna cena) oraz własne przepisy (w tym dania z air fryera i śniadania bez gotowania).
- `js/planner.js`: algorytm. Losuje kilka tysięcy kombinacji dań, dla każdej liczy koszt zakupów w całych opakowaniach (minus to, co masz w lodówce) i wybiera losowo spośród tańszych planów mieszczących się w budżecie. Dania, które dzielą składniki, wychodzą więc taniej. Plany wymagające dodatkowego gotowania w tygodniu albo odbiegające od 1500 kcal dostają karę w rankingu, a dania pasujące do Twojego gustu premię.
- `js/app.js`: interfejs (czysty JavaScript, bez frameworka i bez kroku budowania).

Ceny są orientacyjne. Żeby je zaktualizować, zmień pole `price` w `js/data.js`.

## Przepisy z aniagotuje.pl (prywatnie)

Aplikacja ma też ok. 720 przepisów z [aniagotuje.pl](https://aniagotuje.pl), **wyłącznie na własny użytek**. Repozytorium jest prywatne i tak powinno zostać: nie publikuj tej wersji (np. przez GitHub Pages), bo przepisy są własnością autorki.

- `tools/fetch_aniagotuje.py`: pobiera przepisy do `data/aniagotuje-raw.json` (wznawia przerwane pobieranie).
- `tools/build-recipes.mjs ania`: zamienia je na `js/recipes-ania.js`. Składniki z tekstu („2 ząbki czosnku”, „pół szklanki mleka”) są przeliczane na produkty z cennika. Przepisy z nierozpoznanym składnikiem i same dodatki (surówki, frytki) są pomijane. `--report` pokazuje nierozpoznane składniki, `--debug="Nazwa"` rozbiór jednego przepisu.

Ilości są przybliżone. Przy gotowaniu korzystaj z oryginału, do którego link jest przy każdym przepisie.

## Przepisy z kuchnialidla.pl (prywatnie)

Ok. 2500 dań z [kuchnialidla.pl](https://kuchnialidla.pl), na tych samych zasadach co przepisy Ani: w aplikacji są tylko nazwa, składniki z ilościami (do listy zakupów), wartości odżywcze i link do oryginału.

- `tools/fetch_kuchnialidla.py`: pobiera dane do `data/kuchnialidla-raw.json`.
- `node tools/build-recipes.mjs [ania|lidl]`: buduje `js/recipes-ania.js` i `js/recipes-lidl.js`.
- `node tools/build-single.mjs plik.html`: składa całą aplikację w jeden plik do otwarcia na telefonie.

Lidl nie oznacza diet, więc „wege” i „wegańskie” wyliczamy ze składników, a „bez glutenu” nie oznaczamy wcale.

## Kwestia Smaku i Centrum Respo (prywatnie)

- `tools/fetch_kwestiasmaku.py`: wybrane kategorie (szybki obiad, lunche, śniadania bez chleba…), z 10 s przerwy między zapytaniami zgodnie z robots.txt. Kalorie liczone ze składników, czas szacowany z kroków.
- `tools/fetch_respo.py`: dania główne z centrumrespo.pl, z kaloriami i białkiem na porcję ze strony.
- Oba zapisują tylko nazwę, składniki, porcje, wartości odżywcze, znaczniki sposobu przygotowania i link. `node tools/build-recipes.mjs ks respo` buduje `js/recipes-ks.js` i `js/recipes-respo.js`.
