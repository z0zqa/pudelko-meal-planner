# Pudełko 🥡

**Plan posiłków na budżet: lista zakupów, kalorie i gotowanie w jednym miejscu.**

Wpisujesz, ile chcesz wydać i na ile dni. Pudełko układa śniadania, obiady i kolacje, liczy zakupy w całych opakowaniach i rozpisuje, co ugotować kiedy. Działa w przeglądarce, bez konta i bez serwera, także offline.

<p align="center">
  <img src="docs/demo.gif" width="320" alt="Pudełko w akcji: układanie planu, ponowne losowanie, lista zakupów, lodówka i szybkie przepisy">
</p>

## Co potrafi

- **Plan w budżecie.** Śniadanie, obiad i kolacja każdego dnia, razem ok. 1500 kcal. Porcje dopasowują się do kalorii, a każde danie można wylosować od nowa albo zamienić i od razu widać nowy koszt zakupów.
- **Lista zakupów w całych opakowaniach.** Z cenami, po działach sklepu, z informacją, ile czego zostanie. Odhaczone produkty trafiają do lodówki, a listę można wysłać lub skopiować.
- **Lodówka.** Wpisujesz, co masz, a nowy plan to wykorzysta. Ugotowane dania zdejmują produkty z lodówki.
- **Gotowanie.** Rozpisany meal prep: co gotujesz pierwszego dnia, co w trakcie tygodnia (gdy danie nie wytrzyma w lodówce), co mrozisz.
- **Preferencje.** Składniki do unikania (z odmianą i synonimami, np. „papryka” wyklucza też chili i ajwar), produkty bez laktozy, tryb „jak najmniej przy garach”, air fryer zamiast piekarnika, cena dania (tanie, średnie, drogie), śniadania i kolacje na słodko lub na słono, dieta wege, wegańska lub bez glutenu.
- **Rotacja.** Dania z ostatnich dwóch tygodni nie wracają, a kolejne losowania tego samego dnia dają inne dania.
- **Uczy się gustu.** 👍 i 👎 przy daniach. Pudełko zapamiętuje lubiane składniki i połączenia smakowe i częściej je proponuje. Odrzucone dania już się nie pojawiają.
- **Szybkie i zdrowe.** Osobna zakładka z daniami do 25 minut i śniadaniami do 15 minut, z niewielką liczbą produktów, także bez gotowania.
- **PWA.** Można ją zainstalować na telefonie. Wszystkie dane zostają w przeglądarce (localStorage).

## Uruchomienie

Bez instalacji zależności i bez kroku budowania. Wystarczy dowolny serwer plików statycznych:

```sh
python3 -m http.server 8000
# otwórz http://localhost:8000
```

Całą aplikację można też złożyć w jeden plik HTML, np. żeby otworzyć ją na telefonie bez serwera:

```sh
node tools/build-single.mjs pudelko.html
```

## Jak to działa

| Plik | Co robi |
| --- | --- |
| `js/data.js` | Cennik produktów (wielkość opakowania, cena, kalorie, białko) i wbudowane przepisy. |
| `js/planner.js` | Algorytm planu, lista zakupów, wartości odżywcze, filtry i nauka gustu. |
| `js/app.js` | Interfejs: czysty JavaScript, bez frameworka. |
| `sw.js` | Cache offline. |
| `tools/build-single.mjs` | Składa całość w jeden plik HTML. |

**Plan.** Planer losuje kilka tysięcy kombinacji dań pasujących do filtrów. Dla każdej liczy koszt zakupów w całych opakowaniach, odejmując to, co jest w lodówce, więc dania dzielące składniki wychodzą taniej. Do kosztu dolicza karę za dodatkowe gotowanie w tygodniu i za odchylenie od 1500 kcal, a premię za dania w Twoim guście. Ostateczny plan jest losowany spośród najlepszych planów mieszczących się w budżecie, żeby kolejne losowania się różniły.

**Gust.** Każde danie jest opisane cechami: produkty, rdzenie słów ze składników i nazwy, rodzaj dania. Z polubionych i odrzuconych dań powstaje profil ważony rzadkością cech (IDF), uwzględniający też pary cech, czyli połączenia smakowe. Profil przesuwa prawdopodobieństwo wylosowania dania, ale nie zamyka na nowe.

**Ceny** są orientacyjne. Żeby je zaktualizować, zmień pole `price` w `js/data.js`.

## Dodatkowe przepisy

Poza wbudowanymi przepisami Pudełko wczyta opcjonalne paczki `js/recipes-<źródło>.js`, jeśli istnieją. Bez nich aplikacja działa na samych wbudowanych przepisach. Paczka eksportuje tablicę przepisów w tym samym formacie co `RECIPES` w `js/data.js`. Może też podać `source` (link do oryginału, wtedy w aplikacji zamiast kroków pojawia się przycisk do niego), `site`, `totalTime` i `nutr` (kcal i białko na porcję):

```js
export const MY_RECIPES = [{
  id: 'moje-orzo', name: 'Orzo z kurczakiem', type: 'obiad', emoji: '🍗', serves: 3, keeps: 3, freezes: false, tags: [],
  ing: { piers: 400, makaron: 200, szpinak: 100 }, // id produktów z INGREDIENTS → gramy lub sztuki
  source: 'https://…', site: 'moje', totalTime: 30,
}];
```

## Źródła przepisów

Oprócz wbudowanych przepisów Pudełko korzysta z ok. 5200 dań z czterech serwisów: [Ania Gotuje](https://aniagotuje.pl) (710), [Kuchnia Lidla](https://kuchnialidla.pl) (2559), [Kwestia Smaku](https://www.kwestiasmaku.com) (891) i [Centrum Respo](https://centrumrespo.pl) (1062). Aplikacja przechowuje tylko nazwy, składniki z ilościami (do listy zakupów), wartości odżywcze i linki. Po przepis zawsze klikasz do oryginału.

- `tools/fetch_*.py` pobiera dane do `data/*-raw.json`, z przerwami zgodnymi z robots.txt, i wznawia przerwane pobieranie.
- `node tools/build-recipes.mjs [ania|lidl|ks|respo]` przelicza składniki z tekstu („2 ząbki czosnku”, „pół szklanki mleka”) na produkty z cennika i buduje `js/recipes-*.js`.

Projekt jest prywatny, na własny użytek.

