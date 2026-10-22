// Updates the price list from Biedronka data (data/biedronka-raw.json, from tools/fetch_biedronka.py).
// For each product in INGREDIENTS it finds matching Biedronka products by name and picks the cheapest
// per kg/l among packages of a similar size, then writes js/prices.js.
// Run: node tools/update-prices.mjs [--report]
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const { date, products } = JSON.parse(readFileSync(ROOT + 'data/biedronka-raw.json', 'utf8'));
// The price list without previous overrides, so every run starts from the same baseline.
writeFileSync(ROOT + 'js/prices.js', 'export const PRICES_DATE = null;\nexport const PRICES = {};\n');
const { INGREDIENTS } = await import(ROOT + 'js/data.js');
const report = process.argv.includes('--report');

// ingredient id → [store category, name must match, name must not match, options]. Case-insensitive.
// Products the online store doesn't sell (e.g. tofu, twaróg) keep their estimated prices.
// options: count — sold in packs of N pieces (eggs); each — the store price is per piece (rolls).
const MAP = {
  ryz: ['Ryż', 'biały|basmati|jaśminow', 'sushi|risotto|brązow'],
  makaron: ['Makaron', 'świderki|penne|kokardki|cavatappi|fusilli', 'pełnoziarn|bezgluten|groszk'],
  spaghetti: ['Makaron', 'spaghetti', 'pełnoziarn|bezgluten|konjac'],
  kasza: ['Kasza', 'gryczana', 'mix|biała'],
  bulgur: ['Kasza', 'bulgur', 'mix'],
  maka: ['Mąka', 'pszenna T ?(450|500|550|650)', 'pełnoziarn'],
  chleb: ['Chleb', 'chleb'],
  soczewica: ['Kasza', 'soczewica', 'mix'],
  ziemniaki: ['Warzywa', 'ziemniaki (do gotowania|sałatkowe)|ziemniak jadalny'],
  cebula: ['Warzywa', 'cebula żółta'],
  czosnek: ['Warzywa', 'czosnek'],
  marchew: ['Warzywa', '^marchew', 'kostce|mini'],
  papryka: ['Warzywa', 'papryka (czerwona|polska)'],
  brokul: ['Warzywa', 'brokuł'],
  kapusta: ['Warzywa', 'kapusta biała'],
  cukinia: ['Warzywa', 'cukinia'],
  ogorek: ['Warzywa', 'ogórek (gruntowy|szklarniowy)'],
  pieczarki: ['Grzyby', 'pieczark'],
  banany: ['Owoce', 'banan'],
  jablka: ['Owoce', 'jabłko'],
  cytryna: ['Owoce', 'cytryna'],
  piers: ['Kurczak', 'filet z piersi', 'farmerski'],
  udka: ['Kurczak', 'podudzie|udo', 'select'],
  mielone: ['Wieprzowina', 'mielone'],
  tunczyk: ['Konserwy rybne', 'tuńczyk.*sosie własnym'],
  jajka: ['Jaja', 'jaja', 'goBIO', { count: true }],
  mleko: ['Mleko', '\\b(2|2,0|1,5|3,2) ?%', 'bez laktozy|zagęszcz|goBIO'],
  jogurt: ['Jogurty naturalne', 'jogurt'],
  ser: ['Sery żółte', 'ser', 'plastr|wędzon|light|cheddar'],
  feta: ['Inne sery', 'sałatkowy typu greckiego', 'ziołow'],
  pomidory: ['Warzywa i owoce konserwowe|Przeciery', 'pomidory krojone|polpa|pulpa|pomidory bez skóry', 'cebul|suszon'],
  passata: ['Przeciery', 'passata'],
  koncentrat: ['Przeciery', 'koncentrat pomidorowy'],
  ciecierzyca: ['konserwowe', 'ciecierzyca'],
  fasola: ['konserwowe', 'fasola czerwona'],
  kukurydza: ['konserwowe', 'kukurydza'],
  mleczko: ['konserwowe', 'mleczko kokosowe'],
  masloOrz: ['Masło orzechowe', 'masło orzechowe'],
  warzywaMroz: ['Mrożone warzywa', 'warzywa na patelnię|mieszanka'],
  pomidor: ['Warzywa', 'pomidory? (malinow|polski)', 'cherry|koktajl|mini|w drogę|żółty'],
  seler: ['Warzywa', 'seler korzeń'],
  pietruszka: ['Warzywa', 'pietruszka biała'],
  kalafior: ['Warzywa', '^kalafior$'],
  baklazan: ['Warzywa', 'bakłażan'],
  szparagi: ['Warzywa', 'szparagi'],
  chrzan: ['Chrzan', 'chrzan'],
  dynia: ['Warzywa', 'dynia'],
  buraki: ['Warzywa', 'burak czerwony'],
  kapustaKiszona: ['konserwowe', 'kapusta kiszona'],
  kapustaPekin: ['Warzywa', 'kapusta pekińska'],
  ogorekKiszony: ['konserwowe', 'ogórki kiszone'],
  szczypiorek: ['Zioła|Warzywa', 'szczypiorek|dymka'],
  salata: ['Warzywa', 'sałata'],
  rzodkiewka: ['Warzywa', 'rzodkiewka'],
  imbir: ['Owoce|Warzywa', '^imbir'],
  limonka: ['Owoce', 'limonka'],
  awokado: ['Owoce', 'awokado'],
  batat: ['Warzywa', 'batat'],
  pomarancza: ['Owoce', 'pomarańcza'],
  rodzynki: ['Bakalie', 'mieszanka bakaliowa'],
  sosGotowy: ['Sosy gotowe', 'sos (do spaghetti|spaghetti|boloński|pomidorowy)', 'chili|arrabbiata'],
  lososWedzony: ['Ryby wędzone', 'łosoś.*plastr'],
  wieprzowina: ['Wieprzowina', 'schab|łopatk|karków', 'mielone'],
  wolowina: ['Steki|Wołowina', 'stek'],
  indyk: ['Indyk', 'z fileta z piersi indyka|filet z indyka', 'sznycel'],
  kurczakCaly: ['Kurczak', 'skrzydła|ćwiartk'],
  kielbasa: ['Kiełbasy', 'kiełbasa', 'chorizo|kaszanka|myśliwska'],
  szynka: ['Wędliny|Szynki', 'szynka', 'prosciutto'],
  parowki: ['Parówki', 'parówki', 'kurczak|drobiow'],
  losos: ['Ryby świeże', 'łosoś'],
  rybaBiala: ['Ryby świeże|Mrożone ryby', 'mintaj|dorsz|morszczuk'],
  smietanka: ['Śmietana', '30'],
  kefir: ['Kefiry', 'kefir', 'protein'],
  mozzarella: ['Sery białe', 'mozzarella', 'mini'],
  parmezan: ['Inne sery', 'grana padano|parmezan'],
  serPlesniowy: ['Sery pleśniowe', 'camembert', 'lekki'],
  serekWiejski: ['Sery białe', 'serek wiejski naturalny'],
  majonez: ['Majonez', 'majonez', 'lekki|wegańsk'],
  musztarda: ['Musztarda', 'musztarda'],
  ketchup: ['Ketchup', 'ketchup', 'pikantn'],
  kaszaJaglana: ['Kasza', 'jaglana'],
  peczak: ['Kasza', 'pęczak|jęczmienna'],
  kuskus: ['Kasza', 'kuskus'],
  fasolaBiala: ['konserwowe', 'fasola biała'],
  kluskiGotowe: ['Pierogi i kluski|Dania', 'kopytka|kluski|gnocchi', 'z serem|z mięs|w sosie|ruskie|pierogi'],
  bulki: ['Bułki', 'bułka (poznańska|poranna|grahamka)', '', { each: true }],
  ciastoFrancuskie: ['Ciasto', 'ciasto francuskie'],
  miod: ['Miód', 'wielokwiatowy'],
  oliwki: ['konserwowe', 'oliwki (czarne|zielone) drylowane'],
  pestki: ['Orzeszki|Kasza', 'słonecznik|siemię'],
  olej: ['Olej', 'olej rzepakowy'],
  oliwa: ['Oliwa', 'oliwa'],
  maslo: ['Masło', 'masło polskie'],
  cukier: ['Cukier', 'cukier biały'],
  skrobia: ['Mąka', 'skrobia'],
  ocet: ['Ocet', 'ocet spirytusowy'],
  // Lactose-free versions
  mlekoBL: ['Mleko|Napoje', 'bez laktozy|napój owsiany', 'barista|smaku|protein'],
  serekWiejskiBL: ['Serki|Sery białe', 'serek wiejski bez laktozy'],
};

// Package size in g or ml (null for products sold by weight or count).
function packSize(p) {
  if (/^ok\./.test(p.pack) || /~/.test(p.pack)) return null;
  const m = p.pack.match(/^([\d.]+)\s*(kg|l|g|ml)$/);
  if (!m) return null;
  return parseFloat(m[1]) * (m[2] === 'kg' || m[2] === 'l' ? 1000 : 1);
}
const pieces = (p) => (p.name.match(/(\d+)\s*(szt|sztuk)/i) || [])[1];
// Price per g/ml, or per piece for products listed in pieces.
function perUnit(p) {
  if (p.unitPer === 'kg' || p.unitPer === 'l') return { per: 'g', v: p.unitPrice / 1000 };
  if (p.unitPer === 'szt') return { per: 'szt', v: p.unitPrice };
  const s = packSize(p);
  return s ? { per: 'g', v: p.price / s } : null;
}

const out = {};
const missing = [];
for (const [id, [cat, inc, exc, opt = {}]] of Object.entries(MAP)) {
  const ing = INGREDIENTS[id];
  if (!ing) { console.log(`${id}: not in INGREDIENTS`); continue; }
  const re = new RegExp(inc, 'i');
  const no = exc ? new RegExp(exc, 'i') : null;
  const inCat = new RegExp(cat, 'i');
  let cands = products.filter((p) => inCat.test(`${p.top} / ${p.cat}`) && re.test(p.name) && !(no && no.test(p.name)) && perUnit(p));
  if (!cands.length) { missing.push(id); continue; }
  // Count-based ingredients (eggs, tortillas) want a price per piece; others a price per gram.
  const byCount = opt.count || opt.each;
  cands = cands.map((p) => {
    const u = perUnit(p);
    const n = pieces(p);
    let perPiece = opt.each ? p.price : u.per === 'szt' ? u.v : n ? p.price / n : null;
    let perGram = u.per === 'g' ? u.v : null;
    return { p, perGram, perPiece, size: packSize(p), n: n ? +n : null };
  }).filter((c) => (byCount ? c.perPiece != null : c.perGram != null || (ing.gPerSzt && c.perPiece != null)));
  if (!cands.length) { missing.push(id); continue; }
  // Similar package size to the current one, so one-person shopping stays realistic.
  const target = ing.unit === 'g' || ing.unit === 'ml' ? ing.pack : null;
  const similar = target ? cands.filter((c) => !c.size || (c.size >= target * 0.4 && c.size <= target * 2.5)) : cands;
  const pool = similar.length ? similar : cands;
  const cost = (c) => (byCount ? c.perPiece : c.perGram ?? c.perPiece / (ing.gPerSzt || 1));
  pool.sort((a, b) => cost(a) - cost(b));
  const c = pool[0];
  let entry;
  if (byCount) {
    // e.g. eggs 10 pcs: the package is the product's piece count.
    entry = opt.count && c.n ? { price: c.p.price, pack: c.n } : { price: +c.perPiece.toFixed(2), pack: 1 };
  } else if (ing.unit === 'g' || ing.unit === 'ml') {
    entry = c.size ? { price: c.p.price, pack: c.size } : { price: +(c.perGram * ing.pack).toFixed(2), pack: ing.pack };
  } else {
    // Sold per piece in the app (onion, pepper): price of one piece from the per-kg price.
    entry = { price: +(c.perPiece ?? c.perGram * ing.gPerSzt).toFixed(2), pack: 1 };
  }
  out[id] = { ...entry, product: c.p.name };
  if (report) {
    const was = `${ing.price} zł/${ing.pack}${ing.unit}`;
    console.log(`${id.padEnd(16)} ${was.padEnd(18)} → ${entry.price} zł/${entry.pack}${ing.unit}  ${c.p.name} [${c.p.pack}]  (z ${cands.length})`);
  }
}

writeFileSync(ROOT + 'js/prices.js', `// Generated by tools/update-prices.mjs from zakupy.biedronka.pl (${date}). Overrides price and pack in INGREDIENTS.
export const PRICES_DATE = '${date}';
export const PRICES = ${JSON.stringify(out, null, 0).replace(/\},"/g, '},\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, ',\n}')};
`);
console.log(`Prices: ${Object.keys(out).length} of ${Object.keys(MAP).length} products from Biedronka (${date}).`);
if (missing.length) console.log(`No match (keeping estimated prices): ${missing.join(', ')}`);
