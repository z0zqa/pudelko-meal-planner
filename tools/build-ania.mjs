// Zamienia data/aniagotuje-raw.json na js/recipes-ania.js w formacie aplikacji.
// Składniki z tekstu („2 ząbki czosnku”, „pół szklanki mleka”) są mapowane na produkty z cennika
// w js/data.js. Przepisy z nierozpoznanym składnikiem są pomijane, żeby koszt planu był rzetelny.
//
// Uruchom: node tools/build-ania.mjs [--report]
import { readFileSync, writeFileSync } from 'node:fs';
import { INGREDIENTS } from '../js/data.js';

const ROOT = new URL('..', import.meta.url).pathname;
const raw = JSON.parse(readFileSync(`${ROOT}data/aniagotuje-raw.json`, 'utf8'));
const REPORT = process.argv.includes('--report');

// W wzorcach poniżej \w i \b działają też dla polskich liter (patrzy funkcja pl()).
const pl = (re) => new RegExp(re.source
  .replaceAll('\\w', '\\p{L}')
  .replaceAll('\\b', '(?:(?<=\\p{L}|\\d)(?![\\p{L}\\d])|(?<![\\p{L}\\d])(?=\\p{L}|\\d))'), 'u');

// ── Słownik: wzorzec (na nazwie składnika, małe litery) → id produktu. Kolejność ma znaczenie. ──
const PANTRY = pl(/\b(sól|soli|solą|pieprz\w*|przypraw\w*|majeran\w*|oregano|tymian\w*|bazyli\w* suszon\w*|suszon\w* bazyli\w*|kmin\w*|kumin\w*|curry|kurkum\w*|cynamon\w*|gałk\w* muszkat\w*|liś\w* laurow\w*|liści\w* laurow\w*|ziel\w* angielsk\w*|ziół|zioła prowansalsk\w*|chili|płatki chili|papryk\w* (słodk|wędzon|ostr|mielon|chili)\w*|(słodk|wędzon|ostr|mielon)\w* papryk\w*|czosn\w* (granulowan|suszon)\w*|imbir\w* mielon\w*|kolendr\w* mielon\w*|lubczyk\w*|rozmaryn\w*|estragon\w*|cząber\w*|jałow\w*|goździk\w*|kardamon\w*|wanili\w*|woda|wody|wodą|wrzątk\w*|lód|kostk\w* lodu|ocet\w*|octu|olej\w*|oliw(a|y|ą|ę)\b|oliwy z oliwek|bulion\w*|wywar\w*|rosoł\w*|kostk\w* rosoł\w*|mąk\w* ziemniaczan\w*|skrobi\w*|proszk\w* do pieczenia|sod\w* oczyszczon\w*|cukr\w* (puder|wanili|trzcin)\w*|cukier|cukru|ksylitol\w*|erytrytol\w*|sos\w* worcester\w*|tabasco|sriracha|natka? ?do dekoracji|żelatyn\w*|sezam\w* do posypania|maggi|vegeta|sos\w* rybn\w*|pasta curry|harissa|erytr\w*|zioł\w*|ziół|anyż\w*|papryczk\w*|chill?i\w*|listk\w* laurow\w*|liste\w* laurow\w*|prosz[e]?k\w* do pieczenia|sod\w*|aromat\w*|smalc\w* do smażenia|łoj\w*|łój|tłuszcz\w*)\b/);

const MAP_SRC = [
  [/mleczk\w* kokos|mleka kokos|mleko kokos/, 'mleczko'],
  [/masł\w* orzechow/, 'masloOrz'],
  [/masł\w*|margaryn\w*|smalc\w*|smalec|ghee/, 'maslo'],
  [/śmietank\w*|kremówk\w*|30 ?%|36 ?%/, 'smietanka'],
  [/śmietan\w*|crème fraîche|creme fraiche/, 'smietana'],
  [/jogurt\w*|skyr/, 'jogurt'],
  [/kefir\w*|maślank\w*/, 'kefir'],
  [/mleko\b|mleka\b|mlekiem\b|mleku\b/, 'mleko'],
  [/mozzarell\w*|burrat\w*/, 'mozzarella'],
  [/parmezan\w*|grana padano|pecorino/, 'parmezan'],
  [/fet(a|y|ą|ę)\b|ser\w* sałatkow\w*|bałkańsk\w*|halloumi|ser\w* kozi\w*/, 'feta'],
  [/mascarpone|serek wiejsk\w*|serka wiejsk\w*|ricott\w*|serek śmietankow\w*|serka śmietankow\w*|twarożek\w* kanapk/, 'serekWiejski'],
  [/twaróg\w*|twarog\w*|twarożk\w*|twarożek/, 'twarog'],
  [/pleśniow\w*|camembert|brie|gorgonzol\w*|lazur/, 'serPlesniowy'],
  [/\bser\w*\b|gouda|edam\w*|cheddar\w*|ementaler\w*|gouda/, 'ser'],
  [/jaj(ko|ka|ek|kiem|kami|ka)?\b|jajecz\w*|żółt\w*|białk\w* jaj|białka\b/, 'jajka'],
  [/tofu|tufu|kotlet\w* sojow\w*|granulat\w* sojow\w*|tempeh/, 'tofu'],

  [/piersi?\w* z kurczak\w*|filet\w* z kurczak\w*|filet\w* z piersi|pierś\w*|piersi\b|polędwiczk\w* z kurczak/, 'piers'],
  [/udk\w*|udek|udziec\w* z kurczak|uda\b|ud z kurczak|podudzi\w*/, 'udka'],
  [/wątrób\w*/, 'watrobka'],
  [/skrzyd\w*|ćwiart\w*|kurczak\w*|kurczę\w*|tusz\w*|drob\w*|drób/, 'kurczakCaly'],
  [/indyk\w*|indycz\w*/, 'indyk'],
  [/mięs\w* mielon\w*|mielon\w* mięs\w*|mielonego|mielonej/, 'mielone'],
  [/wołow\w*|antrykot\w*|rostbef\w*|szponder\w*|pręg\w* wołow/, 'wolowina'],
  [/boczk\w*|boczek|bekon\w*|słonin\w*|pancett\w*/, 'boczek'],
  [/kiełbas\w*|chorizo|kabanos\w*|salami|kaszank\w*/, 'kielbasa'],
  [/parów\w*/, 'parowki'],
  [/szynk\w*|polędwic\w* sopock|prosciutto/, 'szynka'],
  [/wieprz\w*|karków\w*|schab\w*|łopatk\w*|żeberk\w*|golonk\w*|polędwiczk\w*|kark\w*|mięs\w*/, 'wieprzowina'],
  [/łoso\w*/, 'losos'],
  [/tuńczyk\w*/, 'tunczyk'],
  [/śledź|śledzi\w*|matias\w*/, 'sledz'],
  [/krewet\w*|owoc\w* morza|kalmar\w*|małż\w*/, 'krewetki'],
  [/dorsz\w*|mintaj\w*|mirun\w*|pstrąg\w*|karp\w*|halibut\w*|morszczuk\w*|tilapi\w*|ryb\w*|makrel\w*|sandacz\w*|dorad\w*|okoń|okoni\w*|filet\w* rybn\w*/, 'rybaBiala'],

  [/ziemniak\w*|kartofl\w*/, 'ziemniaki'],
  [/batat\w*/, 'batat'],
  [/dymk\w*|szczypior\w*/, 'szczypiorek'],
  [/cebul\w*|szalotk\w*/, 'cebula'],
  [/czosn\w*/, 'czosnek'],
  [/marchew\w*|marchw\w*/, 'marchew'],
  [/natk\w*|pietruszk\w* (zielon|natka)|zielon\w* pietruszk/, 'natka'],
  [/pietruszk\w*/, 'pietruszka'],
  [/\bpor(a|u|y|em|ów)?\b|porów/, 'por'],
  [/seler\w*|kalarep\w*/, 'seler'],
  [/szparag\w*/, 'szparagi'],
  [/chrzan\w*/, 'chrzan'],
  [/kapust\w* kiszon\w*|kiszon\w* kapust\w*/, 'kapustaKiszona'],
  [/kapust\w* pekiń\w*|pekin\w*/, 'kapustaPekin'],
  [/kapust\w*/, 'kapusta'],
  [/ogór\w* kiszon\w*|kiszon\w* ogór\w*|ogór\w* konserw\w*|korniszon\w*|pikl\w*/, 'ogorekKiszony'],
  [/ogór\w*/, 'ogorek'],
  [/koncentrat\w*/, 'koncentrat'],
  [/passat\w*|przecier\w*|sos\w* pomidorow/, 'passata'],
  [/pomidor\w* (z puszki|krojon|pelati|w puszce|w kawałkach)\w*|pelati|puszk\w* pomidor/, 'pomidory'],
  [/pomidor\w*|pomidork\w*/, 'pomidor'],
  [/papryk\w*|pepperoni/, 'papryka'],
  [/cukini\w*|kabaczk\w*|patison\w*/, 'cukinia'],
  [/bakłażan\w*/, 'baklazan'],
  [/dyni\w*|dynia|dynię/, 'dynia'],
  [/brokuł\w*/, 'brokul'],
  [/kalafior\w*|kalfior\w*|brukselk\w*|romanesco/, 'kalafior'],
  [/szpinak\w*|jarmuż\w*|rukol\w*|roszpon\w*/, 'szpinak'],
  [/pieczar\w*|grzyb\w* (świeże|leśn)\w*|boczniak\w*|kurk\w*|podgrzyb\w*|borowik\w*|shiitake/, 'pieczarki'],
  [/grzyb\w* suszon\w*|suszon\w* grzyb\w*/, 'grzybySuszone'],
  [/fasol\w* szparag\w*|fasolk\w*/, 'fasolkaSzparag'],
  [/fasol\w* biał\w*|biał\w* fasol\w*|fasol\w* jaś|cannellini/, 'fasolaBiala'],
  [/fasol\w*/, 'fasola'],
  [/ciecierzyc\w*|hummus/, 'ciecierzyca'],
  [/soczewic\w*/, 'soczewica'],
  [/groszek|groszku|groch\w*|edamame|bób\w*|bobu/, 'groszek'],
  [/kukurydz\w*/, 'kukurydza'],
  [/\bwarzyw(a|ami|om)?\b|mieszank\w* warzyw|włoszczyzn\w*/, 'warzywaMroz'],
  [/burak\w*|buracz\w*|botwin\w*/, 'buraki'],
  [/sałat\w*|salat\w*|lodow\w*|rzymsk\w*|cykori\w*|kiełk\w*|mix sałat/, 'salata'],
  [/rzodkiew\w*/, 'rzodkiewka'],
  [/koper\w*/, 'koperek'],
  [/bazyli\w*|kolendr\w*|mięt\w*|melis\w*/, 'natka'],
  [/imbir\w*/, 'imbir'],
  [/limon\w*/, 'limonka'],
  [/cytryn\w*/, 'cytryna'],
  [/pomarańcz\w*/, 'pomarancza'],
  [/awokado/, 'awokado'],
  [/jabłk\w*|jabłek/, 'jablka'],
  [/banan\w*/, 'banany'],
  [/truskaw\w*|malin\w*|borów\w*|jagód\w*|jagod\w*|wiśni\w*|czereśn\w*|śliw\w*|gruszk\w*|brzoskw\w*|morel\w*|owoc\w*|ananas\w*|mango|kiwi|winogron\w*|żurawin\w*|porzecz\w*|rabarbar\w*|figi|fig\b|nektaryn\w*|konfitur\w*|dżem\w*|powidł\w*/, 'owoce'],
  [/rodzyn\w*|orzech\w*|migdał\w*|daktyl\w*|bakali\w*|suszon\w* (morel|śliw|żurawin)\w*|nerkowc\w*|pistacj\w*|orzesz\w*|piniow\w*/, 'rodzynki'],
  [/słonecznik\w*|pestk\w*|sezam\w*|siemi\w*|chia|nasion\w*/, 'pestki'],
  [/oliwk\w*|oliwek|kapar\w*/, 'oliwki'],

  [/ryż\w*|ryżu/, 'ryz'],
  [/spaghetti/, 'spaghetti'],
  [/makaron\w*|lasagn\w*|tagliatell\w*|penne|świderk\w*|kokard\w*|nitk\w*|łazank\w*|fusill\w*|farfall\w*|rurk\w*|muszl\w*|kluse\w* ryżow|noodle|gnocchi/, 'makaron'],
  [/kasz\w* gryczan\w*|gryczan\w*/, 'kasza'],
  [/kasz\w* jaglan\w*|jagl\w*/, 'kaszaJaglana'],
  [/pęczak\w*|kasz\w* jęczmien\w*|kasz\w* pęczak|kasz\w* perłow|kasz\w* mazursk|orkisz\w*/, 'peczak'],
  [/kuskus\w*|kasz\w* manna|kaszy mann|semolin\w*/, 'kuskus'],
  [/bulgur\w*|quinoa|komos\w*/, 'bulgur'],
  [/płatk\w* (owsian|jaglan|gryczan|orkisz|żytn)\w*|owsian\w*|musli|granol\w*/, 'platki'],
  [/bułk\w* tart\w*|panko|otręb\w*/, 'bulkaTarta'],
  [/tortill\w*|wrap\w*|plack\w* pit|pit(a|y)\b/, 'tortilla'],
  [/ciast\w* francusk\w*|ciast\w* filo/, 'ciastoFrancuskie'],
  [/drożdż\w*/, 'drozdze'],
  [/bułk\w*|bagietk\w*|kajzer\w*|ciabatt\w*|grzank\w*|bułecz\w*|rogal\w*/, 'bulki'],
  [/chleb\w*|kromk\w*|pieczyw\w*|tost\w*/, 'chleb'],
  [/mąk\w*/, 'maka'],
  [/sos\w* sojow\w*|tamari/, 'sojowy'],
  [/majonez\w*/, 'majonez'],
  [/musztard\w*/, 'musztarda'],
  [/ketchup\w*/, 'ketchup'],
  [/miód|miodu|miodem|syrop\w* (klonow|z agawy|daktylow)/, 'miod'],
  [/kakao/, 'kakao'],
  [/win(o|a)\b|wina\b/, 'wino'],
];
const MAP = MAP_SRC.map(([re, id]) => [pl(re), id]);

// Sztuki/miary → gramy (ml ≈ g). Szklanka bierze gPerCup produktu, jeśli jest.
const MEASURES_SRC = [
  [/\bcm\b/, 5], [/\bliś\w*|\blist\w*/, 10],
  [/łyżecz\w*/, 5], [/łyż\w*/, 15], [/szklan\w*/, 'cup'], [/garś\w*|garst\w*/, 30], [/ząb\w*/, 5],
  [/słoi\w*|słoicz\w*/, 300], [/puszk\w*|puszek|opakowa\w*|paczk\w*|kostk\w*|pudełk\w*|kubecz\w*|kubek|kubk\w*/, 'pack'],
  [/łodyg\w*/, 40], [/pęcz\w*/, 'szt'], [/plaster\w*|plastr\w*|plaster/, 20], [/torebk\w*|torebek/, 100], [/kromk\w*/, 35],
  [/szczypt\w*|odrobin\w*|trochę|kilka kropli/, 0], [/(główk|główek)\w*/, 'szt'], [/kawał\w*/, 'half'],
];
const MEASURES = MEASURES_SRC.map(([re, v]) => [pl(re), v]);

const NUMWORDS = { 'pół': 0.5, 'półtora': 1.5, 'półtorej': 1.5, 'ćwierć': 0.25, 'jeden': 1, 'jedna': 1, 'jedno': 1, 'jedną': 1, 'dwa': 2, 'dwie': 2, 'trzy': 3, 'cztery': 4, 'pięć': 5, 'sześć': 6, 'kilka': 3, 'parę': 2 };

function lastNumber(s) {
  let last = null;
  for (let i = 0; i < s.length; i++) {
    const n = firstNumber(s.slice(i));
    if (!n) break;
    last = n;
    i += n.index + n.len - 1;
  }
  return last;
}

function firstNumber(s) {
  const m = s.match(/(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?(?:\s*-\s*(\d+(?:[.,]\d+)?))?/);
  const w = s.match(new RegExp(`(^|\\s)(${Object.keys(NUMWORDS).join('|')})(\\s|$)`));
  if (m && (!w || m.index <= w.index)) {
    let n = parseFloat(m[1].replace(',', '.'));
    if (m[2]) n = n / parseFloat(m[2]);
    else if (m[3]) n = (n + parseFloat(m[3].replace(',', '.'))) / 2;
    return { n, index: m.index, len: m[0].length };
  }
  if (w) return { n: NUMWORDS[w[2]], index: w.index, len: w[0].length };
  return null;
}

// Zwraca ilość w jednostce produktu albo null.
function quantity(line, id) {
  const ing = INGREDIENTS[id];
  const toUnit = (g) => (ing.unit === 'g' || ing.unit === 'ml' ? g : g / (ing.gPerSzt || ing.pack));
  // Najpewniejsze są gramy/mililitry, gdziekolwiek w opisie („4 ząbki - około 20 g”).
  const gm = line.match(/(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(kg|dag|g|gram\p{L}*|ml|l|litr\p{L}*|mililitr\p{L}*)(?!\p{L})/u);
  if (gm) {
    let n = parseFloat(gm[1].replace(',', '.'));
    if (gm[2]) n = (n + parseFloat(gm[2].replace(',', '.'))) / 2;
    const u = gm[3];
    const g = u === 'kg' ? n * 1000 : u === 'dag' ? n * 10 : u === 'l' || u.startsWith('litr') ? n * 1000 : n;
    return toUnit(g);
  }
  const num = firstNumber(line);
  for (const [re, val] of MEASURES) {
    const mm = re.exec(line);
    if (!mm) continue;
    // Liczba tuż przed miarą („2 łyżki”, „pół szklanki”), a nie pierwsza w linii.
    const before = line.slice(Math.max(0, mm.index - 25), mm.index).split(/ - |,/).pop();
    const near = lastNumber(before);
    // Liczba musi stać przy mierze: „2 płaskie łyżki” tak, „6 połówek brzoskwiń z puszki” nie.
    const gap = near ? before.slice(near.index + near.len).trim().split(/\s+/).filter(Boolean).length : 0;
    const n = near && gap <= 2 ? near.n : 1;
    if (val === 0) return 0;
    if (val === 'pack') return ing.unit === 'g' || ing.unit === 'ml' ? n * ing.pack : n;
    if (val === 'szt') return ing.unit === 'g' || ing.unit === 'ml' ? n * (ing.gPerSzt || 100) : n;
    if (val === 'half') return ing.unit === 'szt' || ing.unit === 'główka' ? n * 0.5 : n * (ing.gPerSzt || 100) * 0.5;
    if (id === 'czosnek' && /ząb/.test(line)) return n * 0.1;
    if (id === 'cytryna' || id === 'limonka') return n * (val === 'cup' ? 250 : val) / 45; // ~45 ml soku z owocu
    const g = val === 'cup' ? n * (ing.gPerCup || 250) : n * val;
    return toUnit(g);
  }
  if (num) {
    // „200 dojrzałych pomidorów” — duża liczba bez jednostki to gramy.
    if (num.n >= 20) return toUnit(num.n);
    return ing.unit === 'g' || ing.unit === 'ml' ? num.n * (ing.gPerSzt || 100) : num.n;
  }
  // Bez ilości: sztuka albo ćwierć opakowania.
  return ing.unit === 'g' || ing.unit === 'ml' ? Math.min(ing.pack * 0.25, ing.gPerSzt || 1e9) : 1;
}

const OPTIONAL = pl(/można pominąć|opcjonaln\w*|do dekoracji|do podania|do posypania|do skropienia|dla dekoracji|ewentualnie|jeśli lubisz|według uznania|do smaku/);

// Produkty „z domu” nie trafiają na listę zakupów, ale liczą się do wagi dania i kalorii (olej!).
function pantryItem(text, line) {
  const kcal100 = /olej|oliw|masł|smalc|łoj|łój|tłuszcz/.test(text) ? 880 : /cukier|cukr|miód|miod|syrop|ksylitol/.test(text) ? 400 : /skrobi|mąk/.test(text) ? 350 : 0;
  let grams = genericGrams(line);
  // Olej do smażenia (często „1 litr”) w większości zostaje na patelni.
  if (kcal100 === 880 && /smaż|głębok|frytur/.test(line)) grams = Math.min(grams, 40);
  return { pantry: true, grams, kcal100 };
}

function genericGrams(line) {
  const gm = line.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gram\p{L}*|ml|l|litr\p{L}*)(?!\p{L})/u);
  if (gm) {
    const n = parseFloat(gm[1].replace(',', '.'));
    return gm[2] === 'kg' || gm[2] === 'l' || gm[2].startsWith('litr') ? n * 1000 : n;
  }
  for (const [re, g] of [[/łyżecz/, 5], [/łyż/, 15], [/szklan/, 250]]) {
    const m = re.exec(line);
    if (m) {
      const n = lastNumber(line.slice(0, m.index));
      return (n ? n.n : 1) * g;
    }
  }
  return 0;
}

function classify(item, groupName) {
  const name = item.name.toLowerCase();
  const line = `${name} ${item.qty.toLowerCase()}`;
  if (OPTIONAL.test(line) || /dekorac|do podania|opcjonal/i.test(groupName)) return { optional: true };
  const full = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  // Najpierw pierwszy wariant („cebula lub szalotka” → cebula), a jeśli nic nie pasuje — cała nazwa.
  const main = full.split(/ - | lub | albo |, np\.| np\./)[0];
  for (const text of [main, full.split(/ - /)[0], full]) {
    for (const [re, id] of MAP) {
      const m = re.exec(text);
      if (!m) continue;
      // „papryka słodka mielona”, „sok z cytryny” itd.: przyprawa wygrywa, jeśli stoi wcześniej.
      const p = PANTRY.exec(text);
      if (p && !/(cytryn|limon)/.test(text) && p.index <= m.index) return pantryItem(text, line);
      return { id, qty: quantity(line, id) };
    }
    if (PANTRY.test(text)) return pantryItem(text, line);
  }
  return { unknown: main.trim() };
}

// ── Typ dania, porcje, trwałość ──
function dishType(r) {
  const kw = (r.keywords || '').toLowerCase();
  const c = r.crumbs[0] || '';
  // Surówki to dodatki, a przekąski (poza jajecznymi) nie są posiłkiem.
  if (r.crumbs.some((x) => /surowki$|przekaski\/(?!z-jajkami)/.test(x)) || /^surówk/i.test(r.name)) return null;
  if (c.startsWith('salatki')) return /śniadani|kolacj/.test(kw) ? 'sniadanie' : null;
  if (/^(dania-miesne|dania-rybne|zupy)/.test(c)) return 'obiad';
  if (/\bobiad/.test(kw) && !/^(sosy|przekaski)/.test(c)) return 'obiad';
  if (/śniadani/.test(kw)) return 'sniadanie';
  if (c.startsWith('dania-bez-miesa')) return 'obiad';
  if (/kolacj/.test(kw) && /^(przekaski|salatki|nalesniki|dania-na-slodko|sosy-i-pasty)/.test(c)) return 'sniadanie';
  return null;
}

function servings(r, type) {
  const y = (r.yield || '').toLowerCase();
  let m;
  if ((m = y.match(/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/))) return clampServes(m[2] ? (+m[1] + +m[2]) / 2 : +m[1]);
  if ((m = y.match(/(\d+)(?:\s*-\s*(\d+))?\s*(porcj|osób|osoby)/))) return clampServes(m[2] ? (+m[1] + +m[2]) / 2 : +m[1]);
  if ((m = y.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|litr\w*)\b/))) {
    const n = parseFloat(m[1].replace(',', '.'));
    const g = m[2] === 'kg' || /^l/.test(m[2]) ? n * 1000 : n;
    const portion = r.crumbs[0]?.startsWith('zupy') ? 400 : type === 'sniadanie' ? 250 : 380;
    return clampServes(g / portion);
  }
  if ((m = y.match(/(\d+)\s*(?:\S+\s+)?(plack\S*|placuszk\S*|racuch\S*|naleś\S*|pancake\S*|tost\S*|kanap\S*|gofr\S*|kotlet\S*|pulpet\S*|klops\S*|gołąb\S*|krokiet\S*|pierog\S*|uszek|uszk\S*|klusk\S*|sztuk\S*|szt|bułe\S*|tortill\S*|burrit\S*|zapiekan\S*|muffin\S*|jaj\S*|rolad\S*|szasz\S*|filet\S*|udk\S*|porcj\S*)/))) {
    const per = /pierog|uszek|uszk|klusk/.test(m[2]) ? 10 : /plack|placuszk|racuch|naleś|pancake|tost|kanap|gofr/.test(m[2]) ? 3 : 2;
    return clampServes(+m[1] / per);
  }
  return 4;
}
const clampServes = (n) => Math.max(2, Math.min(12, Math.round(n)));

function shelfLife(r, type) {
  const n = `${r.name} ${r.crumbs.join(' ')}`.toLowerCase();
  if (/zup|krem z|rosół|barszcz|żurek|krupnik|kapuśniak|grochówk|ogórkow|chłodnik/.test(n)) return /chłodnik/.test(n) ? [2, false] : [4, true];
  if (/gulasz|leczo|bigos|gołąb|pulpet|klops|curry|chili|potrawk|duszon|strogonow|sos |ragu|bolognese/.test(n)) return [4, true];
  if (/dania-rybne|ryb|łoso|dorsz|krewet|śled/.test(n)) return [2, false];
  if (/sałat|surówk|salatki/.test(n)) return [2, false];
  if (/pierog|klusk|kopytk|uszk|krokiet|naleś/.test(n)) return [3, true];
  if (/kotlet|mielon/.test(n)) return [3, true];
  if (/plack|placuszk|racuch|omlet|jajecz|tost|kanap/.test(n)) return [2, false];
  if (/owsiank|kasz|pasta|pudding/.test(n)) return [3, false];
  return type === 'obiad' ? [3, false] : [2, false];
}

const EMOJI = [
  [/zup|krem z|rosół|barszcz|żurek|krupnik|kapuśniak|grochówk|chłodnik/, '🥣'], [/pierog|uszk/, '🥟'], [/naleś|pancake|placuszk|racuch|gofr/, '🥞'],
  [/plack|ziemniak|kopytk|pyz/, '🥔'], [/makaron|spaghetti|lasagn|penne|tagliatell|łazank/, '🍝'], [/sałat|surówk/, '🥗'],
  [/ryb|łoso|dorsz|śled|tuńczyk|krewet|pstrąg|karp|mintaj/, '🐟'], [/kurczak|drob|indyk|udk|skrzyd/, '🍗'], [/jaj|omlet|szakszuk/, '🍳'],
  [/owsiank|jagl|kasz/, '🥣'], [/ryż|risotto|curry/, '🍛'], [/kapust|bigos|gołąb/, '🥬'], [/grzyb|pieczark/, '🍄'], [/tortill|burrito|wrap|tacos/, '🌯'],
  [/kanap|tost|bułk|chleb/, '🥪'], [/pizz/, '🍕'], [/wieprz|schab|karkówk|wołow|gulasz|mięs|kotlet|żeber|boczk/, '🥩'], [/dyni|warzyw|leczo|cukini|bakłaż/, '🥘'],
];

function minutesIn(step) {
  const m = step.match(/(\d+)(?:\s*-\s*(\d+))?\s*minut/);
  if (m) return Math.min(120, +(m[2] || m[1]));
  const h = step.match(/(\d+(?:[.,]\d+)?)\s*godzin/);
  return h ? Math.min(240, Math.round(parseFloat(h[1].replace(',', '.')) * 60)) : null;
}

// Czy to pełny posiłek, a nie dodatek (surówka, frytki, bulion)? Wymagamy składnika „głównego”.
const SIDE = /^(frytki|ziemniaki|młode ziemniaki|puree|purée|buraczki|marchew|marchewka|pieczona marchew|mizeria|bulion|wywar|zakwas|sos\b|kapusta zasmażana|fasolka szparagowa|kluski śląskie|ćwikła|kopytka|pieczone ziemniaki|grzanki|dip|pesto|hummus)|do obiadu|na ciepło do|dodatek/i;
const MAIN = {
  obiad: { any: ['jajka', 'ser', 'twarog', 'feta', 'mozzarella', 'parmezan', 'tofu', 'fasola', 'fasolaBiala', 'ciecierzyca', 'soczewica', 'makaron', 'spaghetti', 'ryz', 'kasza', 'kaszaJaglana', 'peczak', 'kuskus', 'bulgur', 'tortilla', 'ciastoFrancuskie', 'bulki', 'chleb', 'serekWiejski'], min: { maka: 150, ziemniaki: 500, groszek: 300 } },
  sniadanie: { any: ['jajka', 'ser', 'twarog', 'feta', 'mozzarella', 'tofu', 'platki', 'chleb', 'bulki', 'tortilla', 'jogurt', 'serekWiejski', 'kasza', 'kaszaJaglana', 'ryz', 'maka', 'kefir', 'ciecierzyca', 'fasola'], min: { mleko: 300 } },
};
function isMeal(name, ing, type) {
  if (SIDE.test(name)) return false;
  const m = MAIN[type];
  return Object.keys(ing).some((k) => INGREDIENTS[k].cat === 'mieso' || m.any.includes(k) || (m.min[k] && ing[k] >= m.min[k]));
}

// Kalorie na porcję: wartości Ani na 100 g × waga dania / porcje. Gdy waga z opisu jest niepewna
// (wynik ponad 2× różny od wyliczenia ze składników), bierzemy wyliczenie ze składników.
function portionNutrition(r, ing, mass, pantryMass, pantryKcal, serves) {
  let kcal = pantryKcal, protein = 0;
  for (const [k, q] of Object.entries(ing)) {
    const I = INGREDIENTS[k];
    const g = I.unit === 'g' || I.unit === 'ml' ? q : q * (I.gPerSzt || 100);
    kcal += (g * I.kcal) / 100;
    protein += (g * I.protein) / 100;
  }
  const calc = { kcal: kcal / serves, protein: protein / serves };
  const k100 = parseFloat(r.nutrition100g?.calories);
  const p100 = parseFloat(r.nutrition100g?.proteinContent);
  const y = (r.yield || '').toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gram\p{L}*|ml|l|litr\p{L}*)(?!\p{L})/u);
  const total = y ? parseFloat(y[1].replace(',', '.')) * (/^(kg|l|litr)/.test(y[2]) ? 1000 : 1) : mass + pantryMass;
  let out = calc;
  if (k100 > 0 && total > 0) {
    const ania = { kcal: (k100 * total) / 100 / serves, protein: ((p100 || 0) * total) / 100 / serves };
    const ratio = ania.kcal / Math.max(1, calc.kcal);
    if (ratio > 0.5 && ratio < 2) out = ania;
  }
  return { kcal: Math.round(out.kcal), protein: Math.round(out.protein) };
}

// Tekst ze strony trafia do HTML aplikacji — bez znaczników.
const clean = (t) => String(t ?? '').replace(/[<>]/g, '').replace(/&/g, '&amp;').replace(/\s+/g, ' ').trim();

// ── Konwersja ──
const DEBUG = process.argv.find((x) => x.startsWith('--debug='))?.slice(8);
if (DEBUG) {
  const r = Object.values(raw.recipes).find((x) => x.name === DEBUG);
  for (const g of r.ingredients) for (const it of g.items) console.log(JSON.stringify(it), '→', JSON.stringify(classify(it, g.name)));
  process.exit(0);
}

const out = [];
const unknown = new Map();
const reasons = { type: 0, unknown: 0, empty: 0, side: 0 };
for (const r of Object.values(raw.recipes)) {
  const type = dishType(r);
  if (!type) { reasons.type++; continue; }
  const ing = {};
  const missing = [];
  let pantryMass = 0, pantryKcal = 0;
  for (const g of r.ingredients) {
    for (const item of g.items) {
      const c = classify(item, g.name);
      if (c.unknown) missing.push(c.unknown);
      else if (c.id && c.qty > 0) ing[c.id] = (ing[c.id] || 0) + c.qty;
      else if (c.pantry) { pantryMass += c.grams; pantryKcal += (c.grams * c.kcal100) / 100; }
    }
  }
  if (missing.length) {
    reasons.unknown++;
    for (const m of missing) unknown.set(m, (unknown.get(m) || 0) + 1);
    continue;
  }
  if (Object.keys(ing).length < 2) { reasons.empty++; continue; }
  if (!isMeal(r.name.trim(), ing, type)) { reasons.side++; continue; }
  for (const k of Object.keys(ing)) ing[k] = Math.round(ing[k] * 100) / 100;

  // Porcje z opisu bywają zawyżone („24 placki”, „pizza 26 cm”) — trzymamy je w rozsądnym
  // przedziale według łącznej wagi składników.
  const mass = Object.entries(ing).reduce((a, [k, q]) => {
    const I = INGREDIENTS[k];
    return a + (I.unit === 'g' || I.unit === 'ml' ? q : q * (I.gPerSzt || 100));
  }, 0);
  const [lo, hi] = type === 'obiad' ? [250, 550] : [120, 350];
  const serves = Math.max(type === 'obiad' ? 2 : 1, Math.min(12, Math.round(Math.min(Math.max(servings(r, type), mass / hi), mass / lo))));
  const [keeps, freezes] = shelfLife(r, type);
  const nutr = portionNutrition(r, ing, mass, pantryMass, pantryKcal, serves);
  const kw = `${r.keywords || ''} ${r.diets.join(' ')}`.toLowerCase();
  const tags = [];
  if (/wegetaria|wegańsk|vegetarian|vegan/.test(kw) && !Object.keys(ing).some((k) => INGREDIENTS[k].cat === 'mieso')) tags.push('wege');
  if (/wegańsk|vegan/.test(kw)) tags.push('wegan');
  if (/bezglutenow|glutenfree/.test(kw)) tags.push('bezgl');
  const lower = r.name.toLowerCase();
  out.push({
    id: `ag-${r.url.split('/').pop()}`,
    name: clean(r.name),
    type,
    emoji: (EMOJI.find(([re]) => re.test(lower)) || [, '🍽️'])[1],
    serves,
    keeps,
    freezes,
    tags,
    ing,
    source: r.url,
    totalTime: r.totalTime,
    nutr,
  });
}
out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));

writeFileSync(`${ROOT}js/recipes-ania.js`,
  `// Wygenerowane przez tools/build-ania.mjs z przepisów aniagotuje.pl. Tylko na własny użytek — nie publikuj.\n` +
  `export const ANIA_RECIPES = ${JSON.stringify(out)};\n`);

const total = Object.keys(raw.recipes).length;
console.log(`Przepisy pobrane: ${total} · zaimportowane: ${out.length} (obiady ${out.filter((r) => r.type === 'obiad').length}, śniadania ${out.filter((r) => r.type === 'sniadanie').length})`);
console.log(`Pominięte: nie obiad/śniadanie ${reasons.type}, nierozpoznany składnik ${reasons.unknown}, za mało danych ${reasons.empty}, dodatki ${reasons.side}`);
if (REPORT) {
  console.log('\nNajczęstsze nierozpoznane składniki:');
  for (const [k, v] of [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 80)) console.log(String(v).padStart(4), k);
}
