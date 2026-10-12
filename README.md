# Pudełko 🥡

Planer posiłków na budżet, podobny do [prepka.pl](https://prepka.pl). Wpisujesz, ile chcesz wydać i na ile dni, a aplikacja:

- **Plan**: dobiera obiady (i opcjonalnie śniadania) tak, żeby zakupy zmieściły się w budżecie. Każde danie można zamienić i od razu widać, jak zmieni się koszt zakupów.
- **Zakupy**: liczy listę zakupów w **całych opakowaniach**, z cenami, z podziałem na działy sklepu. Pokazuje, ile czego zostanie. Listę możesz odhaczać i skopiować.
- **Gotowanie**: rozpisuje meal prep: co gotujesz pierwszego dnia, co w trakcie tygodnia (gdy danie nie wytrzyma w lodówce), co mrozisz. Kroki można odhaczać.
- **Lodówka**: produkty, które już masz. Nowy plan je wykorzysta, a resztki z poprzedniego planu trafiają tu jednym kliknięciem.
- **Przepisy**: 26 przepisów (obiady i śniadania), filtry wege, wegańskie i bez glutenu.

Bez konta, bez reklam, dane zostają w przeglądarce (localStorage). Działa offline i można ją zainstalować na telefonie (PWA).

## Uruchomienie

Wystarczy dowolny serwer plików statycznych:

```sh
python3 -m http.server 8000
# otwórz http://localhost:8000
```

Można też opublikować przez GitHub Pages (Settings → Pages → branch `main`, folder `/`).

## Jak to działa

- `js/data.js`: produkty (wielkość opakowania i orientacyjna cena) oraz przepisy (składniki na N porcji, kroki, ile dni wytrzymuje w lodówce, czy się mrozi).
- `js/planner.js`: algorytm. Losuje kilka tysięcy kombinacji dań, dla każdej liczy koszt zakupów w całych opakowaniach (minus to, co masz w lodówce) i wybiera losowo spośród tańszych planów mieszczących się w budżecie. Dania, które dzielą składniki, wychodzą więc taniej. Plany wymagające dodatkowego gotowania w tygodniu dostają karę w rankingu.
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
