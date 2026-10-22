// Converts fetched recipes (data/*-raw.json) into js/recipes-*.js files in the app's format.
// Ingredients written as text („2 ząbki czosnku”, „pół szklanki mleka”) are mapped to products from
// the price list in js/data.js. Recipes with an unrecognised ingredient are skipped so plan costs stay accurate.
//
// Run: node tools/build-recipes.mjs [ania|lidl] [--report] [--debug="Nazwa"]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { INGREDIENTS } from '../js/data.js';

const ROOT = new URL('..', import.meta.url).pathname;

// In the patterns below \w and \b also match Polish letters (handled by pl()).
const pl = (re) => new RegExp(re.source
  .replaceAll('\\w', '\\p{L}')
  .replaceAll('\\b', '(?:(?<=\\p{L}|\\d)(?![\\p{L}\\d])|(?<![\\p{L}\\d])(?=\\p{L}|\\d))'), 'u');

// ── Dictionary: pattern (on the lowercased ingredient name) → product id. Order matters. ──
const PANTRY = pl(/\b(sól|soli|solą|pieprz\w*|przypraw\w*|majeran\w*|oregano|tymian\w*|bazyli\w* suszon\w*|suszon\w* bazyli\w*|kmin\w*|kumin\w*|curry|kurkum\w*|cynamon\w*|gałk\w* muszkat\w*|liś\w* laurow\w*|liści\w* laurow\w*|ziel\w* angielsk\w*|ziół|zioła prowansalsk\w*|chili|płatki chili|papryk\w* (słodk|wędzon|ostr|mielon|chili)\w*|(słodk|wędzon|ostr|mielon)\w* papryk\w*|czosn\w* (granulowan|suszon)\w*|imbir\w* mielon\w*|kolendr\w* mielon\w*|lubczyk\w*|rozmaryn\w*|estragon\w*|cząber\w*|jałow\w*|goździk\w*|kardamon\w*|wanili\w*|woda|wody|wodą|wrzątk\w*|lód|kostk\w* lodu|ocet\w*|octu|olej\w*|oliw(a|y|ą|ę)\b|oliwy z oliwek|bulion\w*|wywar\w*|rosoł\w*|kostk\w* rosoł\w*|mąk\w* ziemniaczan\w*|skrobi\w*|proszk\w* do pieczenia|sod\w* oczyszczon\w*|cukr\w* (puder|wanili|trzcin)\w*|cukier|cukru|ksylitol\w*|erytrytol\w*|sos\w* worcester\w*|tabasco|sriracha|natka? ?do dekoracji|żelatyn\w*|sezam\w* do posypania|maggi|vegeta|sos\w* rybn\w*|pasta curry|harissa|erytr\w*|eryt\w*|odżywk\w*|odzywk\w*|zioł\w*|ziół|anyż\w*|papryczk\w*|chill?i\w*|listk\w* laurow\w*|liste\w* laurow\w*|prosz[e]?k\w* do pieczenia|sod\w*|aromat\w*|smalc\w* do smażenia|łoj\w*|łój|tłuszcz\w*|szałwi\w*|tymiank\w*|estragon\w*|lubczyk\w*)\b/);

const MAP_SRC = [
  [/mleczk\w* kokos|mleka kokos|mleko kokos/, 'mleczko'],
  [/masł\w* orzechow/, 'masloOrz'],
  [/masł\w*|margaryn\w*|smalc\w*|smalec|ghee/, 'maslo'],
  [/śmietank\w*|kremówk\w*|30 ?%|36 ?%/, 'smietanka'],
  [/śmietan\w*|crème fraîche|creme fraiche/, 'smietana'],
  [/jogurt\w*|skyr/, 'jogurt'],
  [/kefir\w*|maślank\w*/, 'kefir'],
  [/mleko\b|mleka\b|mlekiem\b|mleku\b/, 'mleko'],
  [/karczoch\w*|suszon\w* pomidor\w*/, 'oliwki'],
  [/mozzarell\w*|burrat\w*/, 'mozzarella'],
  [/parmezan\w*|grana padano|pecorino/, 'parmezan'],
  [/fet(a|y|ą|ę)\b|ser\w* sałatkow\w*|bałkańsk\w*|halloumi|ser\w* kozi\w*/, 'feta'],
  [/mascarpone|serek wiejsk\w*|serka wiejsk\w*|ricott\w*|serek śmietankow\w*|serka śmietankow\w*|twarożek\w* kanapk/, 'serekWiejski'],
  [/twaróg\w*|twarog\w*|twarożk\w*|twarożek/, 'twarog'],
  [/pleśniow\w*|camembert|brie|gorgonzol\w*|lazur/, 'serPlesniowy'],
  [/\bser(?!c)\w*\b|gouda|edam\w*|cheddar\w*|ementaler\w*|gouda/, 'ser'],
  [/jaj(ko|ka|ek|kiem|kami|a)?\b|jajecz\w*|żółt\w*|białk\w* jaj|białka\b/, 'jajka'],
  [/tofu|tufu|\w* roślinn\w* (klops|filet|kotlet|burger|nugget)\w*|klopsik\w* roślinn\w*|filecik\w* roślinn\w*|kotlet\w* sojow\w*|granulat\w* sojow\w*|tempeh/, 'tofu'],

  [/piersi?\w* z kurczak\w*|filet\w* z kurczak\w*|filet\w* z piersi|pierś\w*|piersi\b|polędwiczk\w* z kurczak/, 'piers'],
  [/udk\w*|udek|udziec\w* z kurczak|uda\b|ud z kurczak|podudzi\w*/, 'udka'],
  [/wątrób\w*/, 'watrobka'],
  [/kacz\w*|gęś\w*|gęsi\w*|indyczk\w*|jagnię\w*|jagnięc\w*|dziczyzn\w*|sarnin\w*|cielęc\w*|królik\w*/, 'kaczka'],
  [/skrzyd\w*|ćwiart\w*|kurczak\w*|kurczę\w*|tusz\w*|drob\w*|drób/, 'kurczakCaly'],
  [/indyk\w*|indycz\w*/, 'indyk'],
  [/mięs\w* mielon\w*|mielon\w* mięs\w*|mielon\w* (wołow|wieprzow|indyk|drobiow)\w*|\bmielonego\b(?!.*papryk)/, 'mielone'],
  [/wołow\w*|antrykot\w*|rostbef\w*|szponder\w*|pręg\w* wołow/, 'wolowina'],
  [/boczk\w*|boczek|bekon\w*|słonin\w*|pancett\w*/, 'boczek'],
  [/kiełbas\w*|chorizo|kabanos\w*|salami|kaszank\w*/, 'kielbasa'],
  [/parów\w*|frankfurter\w*/, 'parowki'],
  [/szynk\w*|polędwic\w* sopock|prosciutto|mortadel\w*/, 'szynka'],
  [/wieprz\w*|karków\w*|schab\w*|łopatk\w*|żeberk\w*|golonk\w*|polędwiczk\w*|kark\w*|mięs\w*/, 'wieprzowina'],
  [/łoso\w*/, 'losos'],
  [/tuńczyk\w*/, 'tunczyk'],
  [/śledź|śledzi\w*|matias\w*|anchois|sardyn\w*|szprot\w*/, 'sledz'],
  [/krewet\w*|owoc\w* morza|kalmar\w*|małż\w*/, 'krewetki'],
  [/dorsz\w*|mintaj\w*|mirun\w*|pstrąg\w*|karp\w*|halibut\w*|morszczuk\w*|tilapi\w*|ryb\w*|makrel\w*|sandacz\w*|dorad\w*|okoń|okoni\w*|filet\w* rybn\w*|paluszk\w* krab\w*|surimi|tasz\w*|pali\w*|ośmiornic\w*|kalmar\w*|mątw\w*/, 'rybaBiala'],

  [/kopyt\w*|klus\w* (lenin|leniw|śląsk|gotow)\w*|klusek|gnocch\w*|gnochi|pierożk\w*|pierog\w* gotow\w*|tortellin\w*|uszek|uszka/, 'kluskiGotowe'],
  [/ziemniak\w*|ziemniacz\w*|kartofl\w*/, 'ziemniaki'],
  [/batat\w*/, 'batat'],
  [/dymk\w*|szczypior\w*/, 'szczypiorek'],
  [/cebul\w*|szalotk\w*/, 'cebula'],
  [/czosn\w*/, 'czosnek'],
  [/marchew\w*|marchw\w*/, 'marchew'],
  [/natk\w*|pietruszk\w* (zielon|natka)|zielon\w* pietruszk/, 'natka'],
  [/pietruszk\w*/, 'pietruszka'],
  [/\bpor(a|u|y|em|ów)?\b|porów/, 'por'],
  [/seler\w*|kalarep\w*|fenku\w*|koper\w* włosk\w*/, 'seler'],
  [/chrzan\w*/, 'chrzan'],
  [/kapust\w* kiszon\w*|kiszon\w* kapust\w*|kimchi/, 'kapustaKiszona'],
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
  [/pieczar\w*|grzyb\w* (świeże|leśn)\w*|boczniak\w*|kurk\w*|kurek|podgrzyb\w*|borowik\w*|shiitake/, 'pieczarki'],
  [/grzyb\w* suszon\w*|suszon\w* grzyb\w*/, 'grzybySuszone'],
  [/fasol\w* szparag\w*|fasolk\w*/, 'fasolkaSzparag'],
  [/szparag\w*/, 'szparagi'],
  [/fasol\w* biał\w*|biał\w* fasol\w*|fasol\w* jaś|cannellini/, 'fasolaBiala'],
  [/fasol\w*/, 'fasola'],
  [/ciecierzyc\w*|hummus/, 'ciecierzyca'],
  [/soczewic\w*/, 'soczewica'],
  [/groszek|groszku|groch\w*|edamame|bób\w*|bobu/, 'groszek'],
  [/kukurydz\w*/, 'kukurydza'],
  [/\bwarzyw(a|ami|om)?\b|mieszank\w* warzyw|włoszczyzn\w*|bukiet\w* jarzyn|jarzyn\w*|mieszank\w* meksyk\w*|mieszank\w* chińsk\w*/, 'warzywaMroz'],
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
  [/truskaw\w*|malin\w*|borów\w*|jagód\w*|jagod\w*|wiśni\w*|czereśn\w*|śliw\w*|gruszk\w*|brzoskw\w*|morel\w*|owoc\w*|ananas\w*|mango|kiwi|winogron\w*|żurawin\w*|porzecz\w*|rabarbar\w*|figi|fig\b|nektaryn\w*|konfitur\w*|dżem\w*|powidł\w*|grejpfrut\w*|arbuz\w*|melon\w*|granat\w*|mandaryn\w*|klementyn\w*|papaj\w*|marakuj\w*/, 'owoce'],
  [/rodzyn\w*|orzech\w*|migdał\w*|daktyl\w*|bakali\w*|suszon\w* (morel|śliw|żurawin)\w*|nerkowc\w*|pistacj\w*|orzesz\w*|piniow\w*|wiórk\w*/, 'rodzynki'],
  [/słonecznik\w*|pestk\w*|sezam\w*|siemi\w*|chia|nasion\w*|\bmak(u|iem)?\b|gorczyc\w*|tahin\w*/, 'pestki'],
  [/oliwk\w*|oliwek|kapar\w*/, 'oliwki'],

  [/ryż\w*|ryżu/, 'ryz'],
  [/spaghetti/, 'spaghetti'],
  [/makaron\w*|lasagn\w*|tagliatell\w*|penne|świderk\w*|kokard\w*|nitk\w*|łazank\w*|fusill\w*|farfall\w*|rurk\w*|muszl\w*|kluse\w* ryżow|noodle|gnocchi|orzo|kritharak\w*/, 'makaron'],
  [/kasz\w* gryczan\w*|gryczan\w*/, 'kasza'],
  [/kasz\w* jaglan\w*|jagl\w*/, 'kaszaJaglana'],
  [/pęczak\w*|kasz\w* jęczmien\w*|kasz\w* pęczak|kasz\w* perłow|kasz\w* mazursk|orkisz\w*/, 'peczak'],
  [/kuskus\w*|kasz\w* manna|kaszy mann|semolin\w*/, 'kuskus'],
  [/bulgur\w*|quinoa|komos\w*/, 'bulgur'],
  [/płatk\w* (owsian|jaglan|gryczan|orkisz|żytn)\w*|owsian\w*|musli|granol\w*/, 'platki'],
  [/bułk\w* tart\w*|panko|otręb\w*|panierk\w* do/, 'bulkaTarta'],
  [/tortill\w*|wrap\w*|plack\w* pit|pit(a|y)\b|pins\w*|piadin\w*|spod\w* do pi\w*|nachos\w*|naan/, 'tortilla'],
  [/ciast\w* francusk\w*|ciast\w* filo/, 'ciastoFrancuskie'],
  [/drożdż\w*/, 'drozdze'],
  [/bułk\w*|bagietk\w*|kajzer\w*|ciabatt\w*|grzank\w*|bułecz\w*|rogal\w*/, 'bulki'],
  [/chleb\w*|kromk\w*|pieczyw\w*|tost\w*|focacci\w*/, 'chleb'],
  [/mąk\w*|\bmak[ai] pszenn\w*/, 'maka'],
  [/sos\w* sojow\w*|tamari/, 'sojowy'],
  [/majonez\w*|sos\w* tatarsk\w*/, 'majonez'],
  [/musztard\w*/, 'musztarda'],
  [/ketchup\w*/, 'ketchup'],
  [/miód|miodu|miodem|syrop\w* (klonow|z agawy|daktylow)/, 'miod'],
  [/kakao|czekolad\w*/, 'kakao'],
  [/win(o|a)\b|wina\b|piw\w*|rum\b|brandy|sherry|whisk\w*|wódk\w*|tequil\w*|koniak\w*|likier\w*|porto|vermouth|martini/, 'wino'],
  [/sos\w* (słodko|peri|piri|teriyaki|barbecue|bbq|chili|tzatziki|czosnkow|curry|hoisin|ostrygow)\w*|pesto|ajwar\w*|ajvar|salsa|sos\w* do\b/, 'sosGotowy'],
];
const MAP = MAP_SRC.map(([re, id]) => [pl(re), id]);

// Pieces/measures → grams (ml ≈ g). A cup uses the product's gPerCup if it has one.
const MEASURES_SRC = [
  [/\bcm\b/, 5], [/\bliś\w*|\blist\w*/, 10],
  [/łyżecz\w*/, 5], [/łyż\w*/, 15], [/szklan\w*/, 'cup'], [/garś\w*|garst\w*/, 30], [/ząb\w*/, 5],
  [/słoi\w*|słoicz\w*/, 300], [/puszk\w*|puszek|opak\w*|opakowa\w*|paczk\w*|kostk\w*|pudełk\w*|kubecz\w*|kubek|kubk\w*/, 'pack'],
  [/łodyg\w*/, 40], [/pęcz\w*/, 'pack'], [/plaster\w*|plastr\w*|plaster/, 20], [/torebk\w*|torebek/, 100], [/kromk\w*/, 35],
  [/szczypt\w*|odrobin\w*|trochę|kilka kropli/, 0], [/(główk|główek)\w*/, 'szt'], [/kawał\w*/, 'half'],
  [/gałąz\w*|gałązk\w*|łodyżk\w*/, 5], [/\bszt\b|sztuk\w*/, 'szt'],
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

// Returns the quantity in the product's unit, or null.
function quantity(line, id) {
  const ing = INGREDIENTS[id];
  const toUnit = (g) => (ing.unit === 'g' || ing.unit === 'ml' ? g : g / (ing.gPerSzt || ing.pack));
  // Grams/millilitres are the most reliable, wherever they appear („4 ząbki - około 20 g”).
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
    // The number right before the measure („2 łyżki”, „pół szklanki”), not the first one in the line.
    const before = line.slice(Math.max(0, mm.index - 25), mm.index).split(/ - |, /).pop();
    const near = lastNumber(before);
    // The number must sit next to the measure: „2 płaskie łyżki” yes, „6 połówek brzoskwiń z puszki” no.
    const gap = near ? before.slice(near.index + near.len).trim().split(/\s+/).filter(Boolean).length : 0;
    const n = near && gap <= 2 ? near.n : 1;
    if (val === 0) return 0;
    if (val === 'pack') return ing.unit === 'g' || ing.unit === 'ml' ? n * ing.pack : n;
    if (val === 'szt') return ing.unit === 'g' || ing.unit === 'ml' ? n * (ing.gPerSzt || 100) : n;
    if (val === 'half') return ing.unit === 'szt' || ing.unit === 'główka' ? n * 0.5 : n * (ing.gPerSzt || 100) * 0.5;
    if (id === 'czosnek' && /ząb/.test(line)) return n * 0.1;
    if (id === 'cytryna' || id === 'limonka') return n * (val === 'cup' ? 250 : val) / 45; // ~45 ml of juice per fruit
    const g = val === 'cup' ? n * (ing.gPerCup || 250) : n * val;
    return toUnit(g);
  }
  if (num) {
    // „200 dojrzałych pomidorów” — a large number without a unit means grams.
    if (num.n >= 20) return toUnit(num.n);
    return ing.unit === 'g' || ing.unit === 'ml' ? num.n * (ing.gPerSzt || 100) : num.n;
  }
  // No quantity: one piece or a quarter of a pack.
  return ing.unit === 'g' || ing.unit === 'ml' ? Math.min(ing.pack * 0.25, ing.gPerSzt || 1e9) : 1;
}

const OPTIONAL = pl(/można pominąć|opcjonaln\w*|do dekoracji|do podania|do posypania|do skropienia|dla dekoracji|ewentualnie|jeśli lubisz|według uznania|do smaku/);

// Pantry staples don't go on the shopping list, but they count towards dish weight and calories (oil!).
function pantryItem(text, line) {
  const kcal100 = /olej|oliw|masł|smalc|łoj|łój|tłuszcz/.test(text) ? 880 : /cukier|cukr|miód|miod|syrop|ksylitol/.test(text) ? 400 : /skrobi|mąk/.test(text) ? 350 : 0;
  let grams = genericGrams(line);
  // Frying oil (often „1 litr”) mostly stays in the pan.
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

function classify(item, groupName, qtyFirst = false) {
  const name = item.name.toLowerCase();
  // Lidl writes „ząbek czosnku - 9 szt.”: the number must come before the measure, so the quantity goes first.
  const line = qtyFirst ? `${item.qty.toLowerCase()} ${name}` : `${name} ${item.qty.toLowerCase()}`;
  if (OPTIONAL.test(line) || /dekorac|do podania|opcjonal/i.test(groupName)) return { optional: true };
  // Section headings entered as ingredients („0 g dressing:”, „sos:”).
  if (/:\s*$/.test(name)) return { optional: true };
  const full = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  // Try the first variant first („cebula lub szalotka” → cebula); if nothing matches, the whole name.
  const main = full.split(/ - | lub | albo |, np\.| np\./)[0];
  for (const text of [main, full.split(/ - /)[0], full]) {
    for (const [re, id] of MAP) {
      const m = re.exec(text);
      if (!m) continue;
      // „papryka słodka mielona”, „sok z cytryny” etc.: the spice wins if it comes first.
      const p = PANTRY.exec(text);
      if (p && !/(cytryn|limon)/.test(text) && p.index <= m.index) return pantryItem(text, line);
      return { id, qty: quantity(line, id) };
    }
    if (PANTRY.test(text)) return pantryItem(text, line);
  }
  return { unknown: main.trim() };
}

// ── Dish type, servings, shelf life ──
function dishType(r) {
  const kw = (r.keywords || '').toLowerCase();
  const c = r.crumbs[0] || '';
  // Slaws are side dishes, and snacks (except egg ones) are not meals.
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

// Is this a full meal rather than a side (slaw, fries, stock)? We require a „main” ingredient.
const SIDE = /^(frytki|ziemniaki|młode ziemniaki|puree|purée|buraczki|marchew|marchewka|pieczona marchew|mizeria|bulion|wywar|zakwas|sos\b|kapusta zasmażana|fasolka szparagowa|kluski śląskie|ćwikła|kopytka|pieczone ziemniaki|grzanki|dip|pesto|hummus|marynat|panierk|dressing|farsz|ciasto na|baza do)|do obiadu|purée|puree|(^|\s)(chleb|chlebek|chlebki|bułka|bułki|bułeczki|brioszki|brioszka|rogaliki|drożdżówki)(\s|$)|obwarzan|^surówk|koncentrat|^bulion|^rosół domowy$|tapenad|colesław|coleslaw|^sałatka colesław|^granola|^musli|^masło |^twarożek do|^serek do|z lodami|kruszonk|na słodko|^deser|pesto|smalec|smalczyk|^jak (zrobić|ugotować|upiec|uprażyć|przygotować|usmażyć)|^sos |sos do |pasta do |masło ziołowe|^ketchup|^majonez|^domowy ketchup|^dip |^hummus|^pasztet|^konfitur|^dżem|dulce de leche|krem karmel|^deser|^mus |^lody|^budyń|^kisiel|^galaretk|^tiramisu|^panna cotta|^sorbet|^mizeri|chałk|^ciasto|^babka|^sernik|^tart(a|y) na słodko|bagietk|^precl|^precel|^rogal|focacci|ciabatt|bajgl|^podpłomyk|^grzank|^tost\w* z masłem|na ciepło do|dodatek|do smarowania|do karkówki|do grilla|marynat/i;
const MAIN = {
  obiad: { any: ['jajka', 'ser', 'twarog', 'feta', 'mozzarella', 'parmezan', 'tofu', 'fasola', 'fasolaBiala', 'ciecierzyca', 'soczewica', 'makaron', 'spaghetti', 'ryz', 'kasza', 'kaszaJaglana', 'peczak', 'kuskus', 'bulgur', 'tortilla', 'ciastoFrancuskie', 'bulki', 'chleb', 'serekWiejski'], min: { maka: 150, ziemniaki: 500, groszek: 300 } },
  sniadanie: { any: ['jajka', 'ser', 'twarog', 'feta', 'mozzarella', 'tofu', 'platki', 'chleb', 'bulki', 'tortilla', 'jogurt', 'serekWiejski', 'kasza', 'kaszaJaglana', 'ryz', 'maka', 'kefir', 'ciecierzyca', 'fasola'], min: { mleko: 300 } },
};
function isMeal(name, ing, type) {
  if (SIDE.test(name)) return false;
  const m = MAIN[type];
  return Object.keys(ing).some((k) => INGREDIENTS[k].cat === 'mieso' || m.any.includes(k) || (m.min[k] && ing[k] >= m.min[k]));
}

// Calories per serving: Ania's per-100 g values × dish weight / servings. When the stated weight is doubtful
// (result differs by more than 2× from the ingredient-based estimate), we use the ingredient-based estimate.
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

// Text from the site ends up in the app's HTML — strip tags.
const clean = (t) => String(t ?? '').replace(/[<>]/g, '').replace(/&/g, '&amp;').replace(/\s+/g, ' ').trim();

// Words from all ingredients (spices too), without Polish diacritics — for the „Nie jem” filter
// (e.g. „papryka słodka” among spices) and for search. Uninformative words are skipped.
const STOP = new Set('sol soli pieprz pieprzu woda wody olej oleju oliwa oliwy swieza swiezy swieze swiezej suszona suszony suszone mielona mielony mielone duza duzy duze mala maly male sredni srednia srednie sredniej wielkosci lub oraz albo dowolny dowolna ulubiony ulubiona ulubionej opcjonalnie posiekana posiekany startej starty tarty tarta drobno gruba dojrzale dojrzaly czerwona czerwony biala bialy zielona zielony szczypta lyzka lyzki lyzeczka lyzeczki szklanka szklanki sztuka sztuki okolo bardzo przyprawy przypraw smaku dekoracji podania'.split(' '));
const normWord = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
function ingredientWords(r) {
  const words = new Set();
  for (const g of r.ingredients) for (const it of g.items) {
    for (const w of normWord(it.name).split(/[^a-z]+/)) if (w.length >= 4 && !STOP.has(w)) words.add(w);
  }
  return [...words].join(' ');
}

// ── Conversion ──
// Each source has its own data on category, servings and nutrition.
const lidlType = (r) => {
  const c = r.crumbs.join(' ');
  if (/^(zupy|dania-glowne|fast-food|grill|dania-wegetarianskie|dania-weganskie)/.test(r.crumbs[0] || '')) return 'obiad';
  if (/sniadania|salatki/.test(c)) return 'sniadanie';
  return null;
};
const lidlNutrition = (r, calc) => {
  const n = r.nutritionPortion || {};
  if (n.kcal > 0) {
    const ratio = n.kcal / Math.max(1, calc.kcal);
    if (ratio > 0.5 && ratio < 2) return { kcal: Math.round(n.kcal), protein: Math.round(n.protein || calc.protein) };
  }
  return { kcal: Math.round(calc.kcal), protein: Math.round(calc.protein) };
};
// Lidl doesn't label diets, so we derive them from ingredients (except gluten-free — that can't
// be determined reliably from the list alone).
function dietFromIngredients(ing, lines) {
  const ids = Object.keys(ing);
  const meat = ids.some((k) => INGREDIENTS[k].cat === 'mieso') || /bulion (drobiow|wołow|mięs)|rosół|smalec|boczek|żelatyn/.test(lines);
  const animal = meat || ids.some((k) => ['jajka', 'maslo', 'miod', 'majonez'].includes(k) || (INGREDIENTS[k].cat === 'nabial' && k !== 'tofu')) || /masł|mleko|śmietan|jaj|miód/.test(lines);
  return meat ? [] : animal ? ['wege'] : ['wege', 'wegan'];
}

const SOURCES = {
  ania: {
    raw: 'data/aniagotuje-raw.json', out: 'js/recipes-ania.js', name: 'ANIA_RECIPES', prefix: 'ag-', site: 'ania',
    note: 'aniagotuje.pl', qtyFirst: false,
    type: dishType, servings,
    nutrition: (r, ing, mass, pm, pk, serves) => portionNutrition(r, ing, mass, pm, pk, serves),
    tags: (r, ing) => {
      const kw = `${r.keywords || ''} ${r.diets.join(' ')}`.toLowerCase();
      const t = [];
      if (/wegetaria|wegańsk|vegetarian|vegan/.test(kw) && !Object.keys(ing).some((k) => INGREDIENTS[k].cat === 'mieso')) t.push('wege');
      if (/wegańsk|vegan/.test(kw)) t.push('wegan');
      if (/bezglutenow|glutenfree/.test(kw)) t.push('bezgl');
      return t;
    },
  },
  ks: {
    raw: 'data/kwestiasmaku-raw.json', out: 'js/recipes-ks.js', name: 'KS_RECIPES', prefix: 'ks-', site: 'ks',
    note: 'kwestiasmaku.com', qtyFirst: false,
    // The meal type comes from the category the recipe was fetched from.
    type: (r) => r.tags[0],
    servings,
    // The site doesn't give nutrition, so we calculate it from ingredients.
    nutrition: (r, ing, mass, pm, pk, serves) => { const c = calcNutrition(ing, pk, serves); return { kcal: Math.round(c.kcal), protein: Math.round(c.protein) }; },
    tags: (r, ing) => dietFromIngredients(ing, r.ingredients.flatMap((g) => g.items.map((i) => i.name.toLowerCase())).join(' | ')),
  },
  respo: {
    raw: 'data/respo-raw.json', out: 'js/recipes-respo.js', name: 'RESPO_RECIPES', prefix: 'rs-', site: 'respo',
    note: 'centrumrespo.pl', qtyFirst: false,
    type: (r) => r.tags[0],
    // Respo gives the exact number of servings and per-serving values, so servings aren't recalculated.
    exactServes: true,
    servings: (r) => Math.max(1, Math.min(12, parseInt(r.yield) || 1)),
    nutrition: (r, ing, mass, pm, pk, serves) => lidlNutrition(r, calcNutrition(ing, pk, serves)),
    tags: (r, ing) => {
      const kw = `${r.keywords} ${r.diets.join(' ')}`.toLowerCase();
      const t = dietFromIngredients(ing, r.ingredients.flatMap((g) => g.items.map((i) => i.name.toLowerCase())).join(' | '));
      if (/bez glutenu|glutenfree/.test(kw) && !t.includes('bezgl')) t.push('bezgl');
      return t;
    },
  },
  ds: {
    raw: 'data/doradcasmaku-raw.json', out: 'js/recipes-ds.js', name: 'DS_RECIPES', prefix: 'ds-', site: 'ds',
    note: 'doradcasmaku.pl', qtyFirst: true,
    // The meal type comes from the site's category; desserts and snacks have none and are skipped.
    type: (r) => r.tags[0],
    servings,
    // No nutrition on the site, so it's calculated from ingredients.
    nutrition: (r, ing, mass, pm, pk, serves) => { const c = calcNutrition(ing, pk, serves); return { kcal: Math.round(c.kcal), protein: Math.round(c.protein) }; },
    tags: (r, ing) => dietFromIngredients(ing, r.ingredients.flatMap((g) => g.items.map((i) => i.name.toLowerCase())).join(' | ')),
  },
  lidl: {
    raw: 'data/kuchnialidla-raw.json', out: 'js/recipes-lidl.js', name: 'LIDL_RECIPES', prefix: 'kl-', site: 'lidl',
    note: 'kuchnialidla.pl', qtyFirst: true,
    type: lidlType,
    servings: (r) => Math.max(1, Math.min(12, parseInt(r.yield) || 4)),
    nutrition: (r, ing, mass, pm, pk, serves) => lidlNutrition(r, calcNutrition(ing, pk, serves)),
    tags: (r, ing) => dietFromIngredients(ing, r.ingredients.flatMap((g) => g.items.map((i) => i.name.toLowerCase())).join(' | ')),
  },
};

function calcNutrition(ing, pantryKcal, serves) {
  let kcal = pantryKcal, protein = 0;
  for (const [k, q] of Object.entries(ing)) {
    const I = INGREDIENTS[k];
    const g = I.unit === 'g' || I.unit === 'ml' ? q : q * (I.gPerSzt || 100);
    kcal += (g * I.kcal) / 100;
    protein += (g * I.protein) / 100;
  }
  return { kcal: kcal / serves, protein: protein / serves };
}

// Cooking-method flags from tools/fetch_flags.py (without recipe text).
const FLAGS = existsSync(`${ROOT}data/flags.json`) ? JSON.parse(readFileSync(`${ROOT}data/flags.json`, 'utf8')) : {};
// Dishes baked in pieces carry over from oven to air fryer; casseroles, tarts and cakes don't.
const NOT_AF = /zapiekank|zapiekan|tart(a|y|ę)\b|quiche|lasagn|lazani|cannelloni|musak|gratin|ciast|keks|babk|sernik|chleb|bułk|pizz|strudel|clafoutis|suflet|pasztet|rolad|wieniec|calzone|kulebiak|pieróg|pierog|biszkopt|placek|frittat|moussaka|pieczeń|indyk w całości|kaczka w całości|gęś|kurczak w całości|cały kurczak/;
function methodFlags(r) {
  const f = FLAGS[r.url] || r.flags;
  if (!f) return {};
  const out = {};
  if (f.oven) out.oven = 1;
  if (f.oven && (f.airfryer || (!f.dish && !NOT_AF.test(r.name.toLowerCase())))) out.af = 1;
  if (f.airfryer) out.af = 1;
  if (f.nocook) out.nocook = 1;
  if (f.fry) out.fry = 1;
  if (f.steps) out.nsteps = f.steps;
  return out;
}

const which = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DEBUG = process.argv.find((x) => x.startsWith('--debug='))?.slice(8);

for (const key of which.length ? which : Object.keys(SOURCES)) {
  const S = SOURCES[key];
  if (!existsSync(ROOT + S.raw)) { console.log(`${key}: ${S.raw} missing, skipping`); continue; }
  const raw = JSON.parse(readFileSync(ROOT + S.raw, 'utf8'));

  if (DEBUG) {
    const r = Object.values(raw.recipes).find((x) => x.name === DEBUG);
    if (!r) continue;
    for (const g of r.ingredients) for (const it of g.items) console.log(JSON.stringify(it), '→', JSON.stringify(classify(it, g.name, S.qtyFirst)));
    continue;
  }

  const out = [];
  const unknown = new Map();
  const reasons = { type: 0, unknown: 0, empty: 0, side: 0 };
  for (const r of Object.values(raw.recipes)) {
    const type = S.type(r);
    if (!type) { reasons.type++; continue; }
    const ing = {};
    const missing = [];
    let pantryMass = 0, pantryKcal = 0;
    for (const g of r.ingredients) {
      for (const item of g.items) {
        const c = classify(item, g.name, S.qtyFirst);
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

    // Stated servings can be inflated („24 placki”, „pizza 26 cm”) — keep them within a sensible
    // range based on the total ingredient weight.
    const mass = Object.entries(ing).reduce((a, [k, q]) => {
      const I = INGREDIENTS[k];
      return a + (I.unit === 'g' || I.unit === 'ml' ? q : q * (I.gPerSzt || 100));
    }, 0);
    const [lo, hi] = type === 'obiad' ? [250, 550] : [120, 350];
    const serves = S.exactServes ? S.servings(r) : Math.max(type === 'obiad' ? 2 : 1, Math.min(12, Math.round(Math.min(Math.max(S.servings(r, type), mass / hi), mass / lo))));
    const [keeps, freezes] = shelfLife(r, type);
    const nutr = S.nutrition(r, ing, mass, pantryMass, pantryKcal, serves);
    // Over 1800 kcal per serving is almost always a data error (e.g. a litre of fat for confit).
    if (nutr.kcal > 1800) { reasons.empty++; continue; }
    const lower = r.name.toLowerCase();
    out.push({
      id: `${S.prefix}${r.url.replace(/\/+$/, '').split('/').pop()}`,
      name: clean(r.name),
      type,
      emoji: (EMOJI.find(([re]) => re.test(lower)) || [, '🍽️'])[1],
      serves,
      keeps,
      freezes,
      tags: S.tags(r, ing),
      ing,
      source: r.url,
      site: S.site,
      totalTime: r.totalTime,
      nutr,
      words: ingredientWords(r),
      ...methodFlags(r),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  // Every recipe needs a unique id, otherwise the app mixes recipes up.
  const ids = new Set();
  for (const r of out) {
    if (ids.has(r.id) || r.id === S.prefix) throw new Error(`${key}: duplicate or empty recipe id: ${r.id} (${r.source})`);
    ids.add(r.id);
  }
  writeFileSync(ROOT + S.out,
    `// Generated by tools/build-recipes.mjs from ${S.note}: name, ingredients, nutrition and link.\n` +
    `// For personal use only — do not publish.\nexport const ${S.name} = ${JSON.stringify(out)};\n`);

  const total = Object.keys(raw.recipes).length;
  console.log(`${key}: fetched ${total} · imported ${out.length} (dinners ${out.filter((r) => r.type === 'obiad').length}, breakfasts ${out.filter((r) => r.type === 'sniadanie').length})`);
  console.log(`  skipped: not dinner/breakfast ${reasons.type}, unrecognised ingredient ${reasons.unknown}, too little data ${reasons.empty}, side dishes ${reasons.side}`);
  if (process.argv.includes('--report')) {
    console.log('  most common unrecognised ingredients:');
    for (const [k, v] of [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 80)) console.log(String(v).padStart(6), k);
  }
}
