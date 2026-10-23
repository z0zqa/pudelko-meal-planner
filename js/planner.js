import { INGREDIENTS, RECIPES, LACTOSE_FREE, PRODUCE, FISH, OILY_FISH } from './data.js';
// Recipe packs from other sites are optional: tools/build-recipes.mjs builds them locally,
// and when the file is missing the app runs on the built-in recipes alone.
// <packs>
const packs = await Promise.all(['ania', 'lidl', 'ks', 'respo', 'ds', 'ol'].map((s) => import(`./recipes-${s}.js`).then((m) => Object.values(m).flat(), () => [])));
// </packs>

export const ALL_RECIPES = [...RECIPES, ...packs.flat()];
// Recipe source: 'own' (built-in), 'ania', 'lidl', 'ks', 'respo', 'ds', 'ol'.
export const siteOf = (r) => r.site || (r.source ? 'ania' : 'own');
export const SITES = { ania: { label: 'Ania Gotuje', link: 'Przepis u Ani' }, lidl: { label: 'Kuchnia Lidla', link: 'Przepis w Kuchni Lidla' }, ks: { label: 'Kwestia Smaku', link: 'Przepis w Kwestii Smaku' }, respo: { label: 'Centrum Respo', link: 'Przepis w Respo' }, ds: { label: 'Doradca Smaku', link: 'Przepis w Doradcy Smaku' }, ol: { label: 'Olga Lewandowska', link: 'Przepis u Olgi Lewandowskiej' } };
// Sites the loaded recipes come from (for filters).
export const LOADED_SITES = Object.keys(SITES).filter((k) => ALL_RECIPES.some((r) => siteOf(r) === k));
export const recipeById = Object.fromEntries(ALL_RECIPES.map((r) => [r.id, r]));

export function round2(x) {
  return Math.round(x * 100) / 100;
}

export const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');

// Keywords that pull in other names of the same product.
const AVOID_ALIASES = {
  papryka: ['papryk', 'chili', 'chilli', 'jalapeno', 'pepperoni', 'harissa', 'ajwar', 'ajvar', 'sriracha', 'tabasco', 'piri', 'peri'],
  laktoza: ['mleko', 'mleka', 'smietan', 'jogurt', 'kefir', 'maslank', 'twarog'],
  orzechy: ['orzech', 'orzesz', 'migdal', 'nerkow', 'pistacj', 'laskow', 'piniow'],
  grzyby: ['grzyb', 'pieczar', 'borowik', 'podgrzyb', 'kurk', 'boczniak', 'shiitake', 'kani', 'prawdziw', 'maslak', 'opienk', 'trufl'],
  cebula: ['cebul', 'szalot', 'dymk', 'szczypior', 'por', 'pora', 'porem'],
  czosnek: ['czosn'],
  jajka: ['jaj', 'jajk', 'jajecz', 'zoltk', 'bialk'],
  gluten: ['maka', 'maki', 'makaron', 'chleb', 'bulk', 'pszen', 'zytni', 'orkisz', 'jeczmien', 'kuskus', 'bulgur', 'tortill', 'ciasto', 'panier', 'owsian'],
  owoce_morza: ['krewet', 'malz', 'kalmar', 'osmiornic', 'mul', 'homar', 'krab', 'surimi'],
  wieprzowina: ['wieprz', 'schab', 'karkow', 'boczk', 'boczek', 'szynk', 'kielbas', 'salami', 'chorizo', 'baleron', 'smalec', 'slonin', 'golonk', 'zeberk', 'lopatk'],
  ryby: ['ryb', 'losos', 'dorsz', 'tunczyk', 'sledz', 'makrel', 'pstrag', 'krewet', 'mintaj', 'anchois', 'sardyn'],
};
const stem = (w) => w.slice(0, Math.max(4, w.length - 2));
export function avoidStems(terms = []) {
  return terms.flatMap((t) => {
    const n = norm(t.trim());
    // Plurals and inflection: "grzyb", "grzybów", "pieczarki" hit the same group.
    const key = Object.keys(AVOID_ALIASES).find((k) => k === n || stem(k) === stem(n));
    return key ? AVOID_ALIASES[key] : [stem(n)];
  }).filter(Boolean);
}
export function containsAvoided(recipe, stems) {
  if (!stems.length) return false;
  const words = `${recipe.words || ''} ${Object.keys(recipe.ing).map((id) => norm(INGREDIENTS[id].name)).join(' ')}`.split(/[^a-z]+/);
  return stems.some((st) => words.some((w) => (st.length <= 3 ? w === st : w.startsWith(st))));
}

// Kitchen time: minute limit for lunch and breakfast.
export const EFFORT = {
  min: { label: 'Minimum', obiad: 40, sniadanie: 15 },
  normal: { label: 'Normalnie', obiad: 75, sniadanie: 30 },
  any: { label: 'Lubię gotować', obiad: Infinity, sniadanie: Infinity },
  ultra: { label: 'Ultra szybko i zdrowo', obiad: 25, sniadanie: 15 },
};

// ── Quick & healthy ──
// Ultra simple: lunch up to 25 min, breakfast up to 15, at most 7 products to buy, few steps, no deep frying.
// Healthy: sensible calories, plenty of protein, vegetables (fruit too at breakfast), no processed meat or added sugar.
const PROCESSED = ['boczek', 'kielbasa', 'parowki', 'majonez', 'ciastoFrancuskie', 'ketchup', 'smietanka'];
const VEG = (id) => ['warzywa', 'mrozonki'].includes(INGREDIENTS[id].cat) && !['ziemniaki', 'batat', 'owoce', 'banany', 'jablka', 'pomarancza', 'rodzynki'].includes(id);
const FRUIT = ['owoce', 'banany', 'jablka', 'pomarancza'];
// A real protein source in lunch (cheese alone doesn't count).
const PROTEIN = ['jajka', 'tofu', 'fasola', 'fasolaBiala', 'ciecierzyca', 'soczewica', 'twarog', 'serekWiejski', 'tunczyk', 'losos', 'rybaBiala', 'sledz', 'krewetki'];
export const ingCount = (r) => Object.keys(r.ing).filter((id) => !INGREDIENTS[id].pantry).length;
export const stepCount = (r) => r.nsteps || (r.steps || []).length || 0;

export function isQuick(r) {
  if (recipeTime(r) > (r.type === 'obiad' ? 25 : 15) || r.fry) return false;
  if (LABOR.test(r.name.toLowerCase()) || /panier/.test(r.name.toLowerCase())) return false;
  if (ingCount(r) > 7) return false;
  const st = stepCount(r);
  return !st || st <= 6;
}

export function healthInfo(r) {
  const n = nutrition(r);
  const ids = Object.keys(r.ing);
  const veg = ids.filter(VEG).length + (r.type === 'sniadanie' ? ids.filter((id) => FRUIT.includes(id)).length : 0);
  const [lo, hi, minP] = r.type === 'obiad' ? [300, 750, 20] : [150, 550, 10];
  const sugar = (r.ing.cukier || 0) + (r.ing.miod || 0) > 40;
  const proteinSource = ids.some((id) => INGREDIENTS[id].cat === 'mieso' || PROTEIN.includes(id));
  const ok = n.kcal >= lo && n.kcal <= hi && n.protein >= minP && veg >= 1 && !sugar && !ids.some((id) => PROCESSED.includes(id))
    && (r.type !== 'obiad' || proteinSource);
  // Ranking: protein share of calories, vegetables, shorter time.
  const score = (n.protein * 4 / Math.max(1, n.kcal)) * 100 + veg * 4 - recipeTime(r) / 3 - ingCount(r);
  return { ok, score, veg, ...n };
}

export const isQuickHealthy = (r) => isQuick(r) && healthInfo(r).ok;

// Equipment: without an oven, keep oven dishes that can be made in an air fryer.
export function fitsEquipment(r, s) {
  if (r.oven && s.oven === false) return !!(s.airfryer && r.af);
  if (r.af && !r.oven && s.airfryer === false) return false;
  return true;
}
export const recipeTime = (r) => r.totalTime || (r.steps || []).reduce((a, x) => a + x[1], 0) || 60;

// Dishes that keep you at the pan (frying in batches, shaping dumplings) or waiting for yeast
// dough. The site's time often leaves this out, so "Minimum" mode skips them.
const LABOR = /plac(ek|ki|uszk)|naleśnik|nalesnik|racuch|krokiet|pierog|pierożk|kotlet|kotlecik|devolay|schabow|panierowan|kopytk|klusk|knedl|gofr|pancake|frytk|gołąb|golab|uszk|pyz|kluch|tortellin|ravioli|pasztecik|drożdż|drozdz|proziak|podpłomyk|wieniec|bułk|chleb|ciasto|gnocchi|własnej roboty|domow\w* makaron|lazani|lasagn|roladk|rolad/;

// Price tier per serving: lunches cheap up to 5 zł, medium up to 9 zł; breakfasts and suppers up to 3 and 6 zł.
export const PRICE_LIMITS = { obiad: [5, 9], sniadanie: [3, 6] };
export const PRICE_LABELS = { tanie: 'tanie', srednie: 'średnie', drogie: 'drogie' };
export function priceTier(r, s) {
  const [a, b] = PRICE_LIMITS[r.type];
  const c = costPerPortion(r, s);
  return c <= a ? 'tanie' : c <= b ? 'srednie' : 'drogie';
}

const stemCache = new Map();
const recentCache = new Map();
export function fitsDiet(recipe, s) {
  if (s.price && s.price !== 'any' && priceTier(recipe, s) !== s.price) return false;
  const lim = EFFORT[s.effort || 'any'];
  if (recipeTime(recipe) > lim[recipe.type]) return false;
  if (!fitsEquipment(recipe, s)) return false;
  if (s.effort === 'ultra' && !isQuickHealthy(recipe)) return false;
  if ((s.effort === 'min' || s.effort === 'ultra') && (LABOR.test(recipe.name.toLowerCase()) || /drozdz/.test(recipe.words || '') || 'drozdze' in recipe.ing)) return false;
  if (s.avoid?.length) {
    const key = s.avoid.join('|');
    if (!stemCache.has(key)) stemCache.set(key, avoidStems(s.avoid));
    if (containsAvoided(recipe, stemCache.get(key))) return false;
  }
  if (s.diet === 'wege' && !recipe.tags.includes('wege')) return false;
  if (s.diet === 'wegan' && !recipe.tags.includes('wegan')) return false;
  if (s.glutenFree && !recipe.tags.includes('bezgl')) return false;
  // "Nie dla mnie" (Not for me) always applies, even when the planner relaxes other filters.
  if (s.disliked?.length && s.disliked.includes(recipe.id)) return false;
  // Dishes from previous weeks and today's draws (by id and by name, since the same dish can appear in several sources).
  if (s.excluded?.length) {
    const key = s.excluded.join('|');
    if (!recentCache.has(key)) recentCache.set(key, new Set(s.excluded));
    const set = recentCache.get(key);
    if (set.has(recipe.id) || set.has(recipe._n ??= norm(recipe.name))) return false;
  }
  if (s.source && s.source !== 'all' && siteOf(recipe) !== s.source) return false;
  return true;
}

// ── Sweet / savory (breakfasts and suppers) ──
const SWEET_NAME = /biszkopt|cesarski|kaiserschmarrn|brzoskw|morel|karmel|syrop|wanili|budyniow|kokos|nutell|powidł|konfitur|bakali|rodzyn|daktyl|figi|mango|ananas|owsiank|naleśnik|nalesnik|placusz|pancake|gofr|racuch|jaglank|pudding|smoothie|koktajl|granol|musli|słodk|slodk|czekolad|kakao|budyń|budyn|na mleku|kasza manna|kaszka|chia|owoc|banan|jabł|jabl|gruszk|truskaw|malin|borówk|jagod|śliwk|dyni.*cynamon|cynamon|dżem|miód|miod|tosty francusk|french toast|brioch|drożdżówk|bułeczk.*słod|rogal|twarożek na słodko|serniczk|ryż na mleku|shake/;
const SAVORY_NAME = /jajeczn|jajk|jaja|omlet|szakszuk|frittat|kanapk|tost(?!y francusk)|pasta (z|jajeczn)|hummus|twarożek(?! na słodko)|serek wiejski z|szynk|łoso|losos|tuńczyk|tunczyk|śledź|sledz|makrel|awokado|pomidor|ogór|ogor|sałatk|salatk|wrap|tortill|burrito|quesadill|zapiekank|grzank|bruschett|caprese|ser |serem|pieczark|szpinak|warzyw|kiełbas|parów|bekon|boczek|zup/;
const SWEET_ING = ['owoce', 'banany', 'jablka', 'miod', 'kakao', 'masloOrz', 'rodzynki', 'pomarancza'];
const SAVORY_ING = ['jajka', 'szynka', 'kielbasa', 'parowki', 'boczek', 'losos', 'lososWedzony', 'tunczyk', 'sledz', 'rybaBiala', 'pomidor', 'ogorek', 'ogorekKiszony', 'cebula', 'czosnek', 'szczypiorek', 'rzodkiewka', 'salata', 'awokado', 'pieczarki', 'papryka', 'szpinak', 'feta', 'mozzarella', 'ser', 'ciecierzyca', 'fasola', 'majonez', 'musztarda'];
export function taste(r) {
  if (r._taste) return r._taste;
  const n = r.name.toLowerCase();
  // Names that are clearly sweet, even when eggs dominate the ingredients.
  if (/cesarski|kaiserschmarrn|biszkopt|na słodko|na slodko|french toast|tosty francusk/.test(n)) return (r._taste = 'slodkie');
  const ids = Object.keys(r.ing);
  let sweet = ids.filter((id) => SWEET_ING.includes(id)).length + ((r.ing.cukier || 0) > 10 ? 1 : 0);
  let savory = ids.filter((id) => SAVORY_ING.includes(id)).length;
  // The name weighs most: "Owsianka…" is sweet even with nuts; "Omlet…" is savory.
  if (SWEET_NAME.test(n)) sweet += 4;
  if (SAVORY_NAME.test(n)) savory += 3;
  r._taste = sweet > savory ? 'slodkie' : 'slone';
  return r._taste;
}
export const TASTE_LABELS = { slodkie: 'na słodko', slone: 'na słono' };

export function candidates(type, s) {
  // Taste: breakfasts by s.breakfastTaste, suppers by s.supperTaste.
  const want = type === 'sniadanie' ? s.breakfastTaste : type === 'kolacja' ? s.supperTaste : null;
  return ALL_RECIPES.filter((r) => r.type === poolType(type) && fitsDiet(r, s) && (!want || want === 'any' || taste(r) === want));
}

// How many different dishes per period: lunches every ~2-3 days, breakfasts every ~4 days.
export function dishCount(type, days, effort) {
  // With "Minimum" fewer different dishes: one dish per 3–4 days, i.e. cooking less often.
  if (effort === 'min' || effort === 'ultra') return type === 'obiad' ? Math.min(4, Math.max(1, Math.ceil(days / 3.5))) : Math.min(3, Math.max(1, Math.ceil(days / 5)));
  if (type === 'obiad') return Math.min(6, Math.max(1, Math.ceil(days / 2.5)));
  return Math.min(4, Math.max(1, Math.ceil(days / 4)));
}

function splitDays(days, k) {
  const base = Math.floor(days / k);
  const extra = days % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// Spreads dishes over consecutive days: those that keep shortest in the fridge go first.
// Each dish is split into batches: you cook everything on day one, and if the dish
// won't last until the end and can't be frozen, you cook the next batch fresh during the week.
// Split of daily calories between meals. Only meals included in the plan count,
// so together they always hit the full target (e.g. without supper: breakfast ~43%, lunch ~57%).
const MEAL_BASE = { sniadanie: 0.3, obiad: 0.4, kolacja: 0.3 };
export function mealShares(s) {
  const on = ['obiad', s.breakfasts && 'sniadanie', s.suppers && 'kolacja'].filter(Boolean);
  const sum = on.reduce((a, t) => a + MEAL_BASE[t], 0);
  return Object.fromEntries(on.map((t) => [t, MEAL_BASE[t] / sum]));
}

// Suppers come from the same pool of light dishes as breakfasts.
export const poolType = (t) => (t === 'kolacja' ? 'sniadanie' : t);

// Serving multiplier so the meal hits its target calories (e.g. 1.5 = one and a half recipe servings).
export function portionFactor(r, type, s) {
  if (!s?.kcal) return 1;
  const k = nutrition(r).kcal || 1;
  const target = s.kcal * (mealShares(s)[type] || 0);
  // Usually at most a double serving; higher targets allow more (up to 3x), as does a lunch-only plan.
  const cap = Math.max(Object.keys(mealShares(s)).length === 1 ? 3 : 2, Math.min(3, Math.floor(s.kcal / 200) / 4));
  return Math.min(cap, Math.max(0.5, Math.round((target / k) * 4) / 4));
}

export function schedule(recipeIds, type, days, people, s) {
  const counts = splitDays(days, recipeIds.length);
  const sorted = [...recipeIds].sort((a, b) => recipeById[a].keeps - recipeById[b].keeps);
  let day = 0;
  return sorted.map((id, i) => {
    const r = recipeById[id];
    const ds = Array.from({ length: counts[i] }, (_, j) => day + j);
    day += counts[i];
    const factor = portionFactor(r, type, s);
    return { recipeId: id, type, days: ds, portions: counts[i] * people, factor, batches: batches(r, ds, people) };
  });
}

function batches(r, ds, people) {
  const last = ds[ds.length - 1] + 1;
  if (last <= r.keeps || r.freezes) {
    return [{ days: ds, cookDay: 0, portions: ds.length * people, freeze: last > r.keeps }];
  }
  const out = [];
  let i = 0;
  for (const size of splitDays(ds.length, Math.ceil(ds.length / r.keeps))) {
    const chunk = ds.slice(i, (i += size));
    const cookDay = chunk[chunk.length - 1] + 1 <= r.keeps ? 0 : chunk[0];
    out.push({ days: chunk, cookDay, portions: chunk.length * people, freeze: false });
  }
  return out;
}

export function cookDays(meals) {
  return [...new Set(meals.flatMap((m) => m.batches.map((b) => b.cookDay)))].sort((a, b) => a - b);
}

export function scaled(id, q, factor) {
  return INGREDIENTS[id].whole ? Math.ceil(q * factor - 0.01) : q * factor;
}

// Id of the product you actually buy (e.g. lactose-free milk instead of regular).
export const buyId = (id, s) => (s?.lactoseFree && LACTOSE_FREE[id]) || id;

export function needs(meals, s) {
  const out = {};
  for (const m of meals) {
    const r = recipeById[m.recipeId];
    const factor = (m.portions * (m.factor || 1)) / r.serves;
    for (const [id, q] of Object.entries(r.ing)) { const b = buyId(id, s); out[b] = (out[b] || 0) + scaled(id, q, factor); }
  }
  return out;
}

export function shoppingList(meals, fridge = {}, s) {
  const need = needs(meals, s);
  const items = [];
  const pantry = [];
  let total = 0;
  for (const [id, qty] of Object.entries(need)) {
    const ing = INGREDIENTS[id];
    if (ing.pantry) {
      pantry.push({ id, ...ing, need: qty });
      continue;
    }
    const have = fridge[id] || 0;
    const missing = Math.max(0, qty - have);
    // 3% tolerance: don't buy a second package over a few grams.
    const packs = missing > 0 ? Math.ceil(missing / ing.pack - 0.03) || 1 : 0;
    const cost = packs * ing.price;
    total += cost;
    items.push({
      id, ...ing, need: qty, have, packs, cost,
      leftover: Math.max(0, have + packs * ing.pack - qty),
    });
  }
  return { items, pantry, total: round2(total) };
}

// Value (zł) of perishable products the plan takes from the fridge.
const PERISHABLE = new Set(['warzywa', 'mieso', 'nabial']);
function fridgeUse(items) {
  return items.reduce((a, it) => (it.have && PERISHABLE.has(it.cat) ? a + (Math.min(it.need, it.have) / it.pack) * it.price : a), 0);
}

// Products from the fridge a plan uses, with amounts (for "Z lodówki" on the plan).
export function fromFridge(meals, fridge, s) {
  return shoppingList(meals, fridge, s).items.filter((it) => it.have > 0).map((it) => ({ id: it.id, name: it.name, unit: it.unit, qty: Math.min(it.need, it.have) }));
}

export function planCost(meals, fridge, s) {
  return shoppingList(meals, fridge, s).total;
}

// Estimated cost per serving: price proportional to the amount used (no rounding up to packages).
export function costPerPortion(recipe, s) {
  let c = 0;
  for (const [id, q] of Object.entries(recipe.ing)) {
    const ing = INGREDIENTS[buyId(id, s)];
    if (!ing.pantry) c += (q / ing.pack) * ing.price;
  }
  return c / recipe.serves;
}

// ── Taste learning ──
// Dish features: ingredients, words from ingredients and spices (stems, e.g. "cytry", "curry") and dish type.
const BORING = new Set(['i:przyprawy', 'i:olej', 'i:cebula', 'i:czosnek', 'w:cebul', 'w:czosn', 'w:olej', 'w:oliwa', 'w:maslo', 'w:masla', 'w:wody', 'w:woda']);
const NAME_STOP = new Set(['przepis', 'domowy', 'domowa', 'domowe', 'szybki', 'szybka', 'szybkie', 'prosty', 'prosta', 'proste', 'najlepszy', 'klasyczny', 'klasyczna', 'pyszny', 'pyszna', 'zdrowy', 'zdrowa', 'lekki', 'lekka', 'wersji', 'stylu', 'sposob', 'sposoby'] );
export function features(r) {
  if (r._f) return r._f;
  const f = new Set();
  for (const id of Object.keys(r.ing)) if (!INGREDIENTS[id].pantry || id === 'maslo') f.add('i:' + id);
  for (const w of (r.words || '').split(' ')) if (w.length >= 4) f.add('w:' + w.slice(0, 5));
  // Words from the name ("Imbirowy kurczak", "…z cytryną") also say something about taste.
  for (const w of norm(r.name).split(/[^a-z]+/)) if (w.length >= 5 && !NAME_STOP.has(w)) f.add('w:' + w.slice(0, 5));
  f.add('k:' + dishKind(r));
  r._f = [...f].filter((x) => !BORING.has(x));
  return r._f;
}

// Rare features say more about taste than common ones (IDF).
let IDF = null;
function idf(f) {
  if (!IDF) {
    const df = new Map();
    for (const r of ALL_RECIPES) for (const x of features(r)) df.set(x, (df.get(x) || 0) + 1);
    IDF = new Map([...df].map(([x, n]) => [x, Math.log(ALL_RECIPES.length / (1 + n))]));
  }
  return IDF.get(f) || 0;
}

// Taste profile from favorites (+) and "not for me" (−): weights of features and feature pairs (flavor pairings).
export function buildProfile(likedIds = [], dislikedIds = []) {
  const w = new Map();
  const pairs = new Map();
  const pos = new Set();
  const add = (ids, sign) => {
    for (const id of ids) {
      const r = recipeById[id];
      if (!r) continue;
      const fs = features(r);
      for (const x of fs) {
        w.set(x, (w.get(x) || 0) + sign * idf(x));
        if (sign > 0) pos.add(x);
      }
      // Pairings: pairs of the dish's most distinctive features.
      const top = [...fs].sort((a, b) => idf(b) - idf(a)).slice(0, 6);
      for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
        const key = [top[i], top[j]].sort().join('|');
        pairs.set(key, (pairs.get(key) || 0) + sign * (idf(top[i]) + idf(top[j])) / 2);
      }
    }
  };
  add(likedIds, 1);
  add(dislikedIds, -1);
  const pairList = [...pairs].filter(([, v]) => Math.abs(v) > 0.5).map(([k, v]) => [...k.split('|'), v]);
  return { w, pairs, pairList, pos, likedSet: new Set(likedIds), liked: likedIds.length, disliked: new Set(dislikedIds), cache: new Map() };
}

// How well a dish matches the taste (0 = neutral, higher = more your style).
export function affinity(r, p) {
  if (!p || (!p.w.size && !p.pairs.size)) return 0;
  if (p.cache?.has(r.id)) return p.cache.get(r.id);
  const fs = features(r);
  let a = 0;
  for (const x of fs) a += p.w.get(x) || 0;
  const set = new Set(fs);
  for (const [x, y, v] of p.pairList) if (set.has(x) && set.has(y)) a += v;
  a /= Math.sqrt(fs.length || 1);
  p.cache?.set(r.id, a);
  return a;
}

// What the profile says about taste, in plain words: strongest features and pairings.
export function describeProfile(p) {
  const label = (x) => {
    const [t, v] = [x[0], x.slice(2)];
    if (t === 'i') return INGREDIENTS[v]?.name.split(/[ (/]/)[0].toLowerCase();
    return null;
  };
  const likes = [...p.w].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([x]) => label(x)).filter(Boolean);
  const combos = [...p.pairs].filter(([k, v]) => v > 0 && !k.includes('k:')).sort((a, b) => b[1] - a[1])
    .map(([k]) => k.split('|').map(label)).filter(([a, b]) => a && b && a !== b).map(([a, b]) => `${a} + ${b}`);
  // "Rzadziej" (Less often) only for features absent from every favorite dish (neither as a product nor as a word).
  const inLiked = (x) => p.pos.has(x) || (x.startsWith('i:') && p.pos.has('w:' + norm(INGREDIENTS[x.slice(2)]?.name || '').slice(0, 5)));
  const avoid = [...p.w].filter(([x, v]) => v < 0 && !inLiked(x)).sort((a, b) => a[1] - b[1]).map(([x]) => label(x)).filter(Boolean);
  const uniq = (a) => [...new Set(a)].slice(0, 5);
  return { likes: uniq(likes), combos: uniq(combos).slice(0, 3), avoid: uniq(avoid).slice(0, 3) };
}

// Weighted sampling without replacement: dishes similar to favorites come up more often.
// Cumulative weights are computed once per pool; each draw is then a binary search.
function weightedSampler(arr, weight) {
  const cum = [];
  let t = 0;
  for (const x of arr) cum.push((t += weight(x)));
  return (k, rng) => {
    const out = new Set();
    for (let guard = 0; out.size < Math.min(k, arr.length) && guard < k * 50; guard++) {
      const r = rng() * t;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
      out.add(arr[lo]);
    }
    return [...out];
  };
}

function sample(arr, k, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// Dish type for keeping variety: a keyword from the name, or the first word if none.
const KINDS = ['owsiank', 'omlet', 'jajeczn', 'jajk', 'nalesn', 'plack', 'placusz', 'makaron', 'spaghetti', 'penne', 'zup', 'krem', 'salatk', 'kanapk', 'tost', 'pasta', 'losos', 'kurczak', 'ryz', 'kasz', 'tortill', 'wrap', 'burrito', 'gulasz', 'curry', 'twaroz', 'serek', 'jogurt', 'szaszl', 'pierogi', 'risotto', 'kaszotto'];
export function dishKind(r) {
  const n = norm(r.name);
  return KINDS.find((k) => n.includes(k)) || n.split(' ')[0];
}

export function buildMeals(dinnerIds, breakfastIds, s, supperIds = []) {
  const meals = schedule(dinnerIds, 'obiad', s.days, s.people, s);
  if (breakfastIds.length) meals.push(...schedule(breakfastIds, 'sniadanie', s.days, s.people, s));
  if (supperIds.length) meals.push(...schedule(supperIds, 'kolacja', s.days, s.people, s));
  return meals;
}

// Draws many dish combinations and picks one that fits the budget.
// Ingredients are counted in whole packages, so dishes that share products come out cheaper.
// Candidates with filters relaxed when nothing is left: first other sources, then longer time,
// finally without "Bez glutenu" (Gluten-free). "Czego nie jesz", diet and equipment always stay.
export function candidatesRelaxed(type, s) {
  const steps = [s, { ...s, source: 'all' }, { ...s, source: 'all', effort: s.effort === 'ultra' ? 'min' : 'normal' }, { ...s, source: 'all', effort: 'any' }, { ...s, source: 'all', effort: 'any', price: 'any' }, { ...s, source: 'all', effort: 'any', price: 'any', glutenFree: false }, { ...s, source: 'all', effort: 'any', price: 'any', glutenFree: false, excluded: [] }, { ...s, source: 'all', effort: 'any', price: 'any', glutenFree: false, excluded: [], breakfastTaste: 'any', supperTaste: 'any' }];
  for (const x of steps) {
    const c = candidates(type, x);
    if (c.length >= (type === 'obiad' ? 1 : 2)) return c;
  }
  return candidates(type, steps[steps.length - 1]);
}

// Draws many dish combinations and picks one that fits the budget. The search is a generator that pauses
// every 64 combinations, so the app can run it in slices and keep the screen responsive (generatePlanAsync).
export function generatePlan(s, fridge = {}, rng = Math.random, tries = 2500) {
  const it = planSearch(s, fridge, rng, tries);
  let r;
  while (!(r = it.next()).done);
  return r.value;
}

// The same search, giving the browser a frame every ~10 ms of work.
export async function generatePlanAsync(s, fridge = {}, rng = Math.random, tries = 2500) {
  const it = planSearch(s, fridge, rng, tries);
  let r;
  let t0 = performance.now();
  while (!(r = it.next()).done) {
    if (performance.now() - t0 > 10) {
      await new Promise((res) => setTimeout(res, 0));
      t0 = performance.now();
    }
  }
  return r.value;
}

function* planSearch(s, fridge, rng, tries) {
  const dinners = candidatesRelaxed('obiad', s);
  const breakfasts = s.breakfasts ? candidatesRelaxed('sniadanie', s) : [];
  const suppers = s.suppers ? candidatesRelaxed('kolacja', s) : [];
  if (!dinners.length) return { error: 'Żaden obiad nie pasuje do tych ustawień. Poluzuj filtry: czas w kuchni, źródło przepisów, dietę albo listę „Czego nie jesz”.' };

  const kd = Math.min(dishCount('obiad', s.days, s.effort), dinners.length);
  const kb = s.breakfasts ? Math.min(dishCount('sniadanie', s.days, s.effort), breakfasts.length) : 0;
  const kk = s.suppers ? Math.min(dishCount('sniadanie', s.days, s.effort), suppers.length) : 0;

  // Taste: draw weights from the match to favorites, normalized within each pool.
  const prefs = s.prefs;
  // Scale: 95th percentile of the match in the pool, so a few "top" dishes don't flatten the rest.
  const scaleOf = (pool) => {
    const v = pool.map((r) => Math.abs(affinity(r, prefs))).sort((a, b) => a - b);
    return Math.max(1e-6, v[Math.floor(v.length * 0.95)] || 0);
  };
  const scales = {};
  const norm1 = (r, sc) => Math.max(-1, Math.min(1, affinity(r, prefs) / sc));
  // What's in the fridge: dishes that use it are drawn more often, up to 7× for three or more products.
  const inFridge = (r) => Object.keys(r.ing).filter((id) => !INGREDIENTS[id].pantry && fridge[buyId(id, s)] > 0).length;
  const hasFridge = Object.values(fridge).some((q) => q > 0);
  // Health: dishes dense in protein, fiber and vegetables (per 100 kcal) are drawn more often, and fish dishes too.
  // Protein weighs most: 24% of energy (6 g per 100 kcal) is above what most recipes give.
  const health = (r) => {
    const n = nutrition(r);
    const per100 = 100 / Math.max(100, n.kcal);
    return (0.2 + Math.min(2, (n.protein * per100) / 4) ** 2) * (0.5 + Math.min(1, (n.fiber * per100) / 1.7))
      * (0.8 + Math.min(0.6, n.produce / 250)) * (n.fish >= 60 ? 3 : 1);
  };
  const weighter = (pool, key) => {
    if (!pool.length) return null;
    const sc = prefs?.liked ? (scales[key] = scaleOf(pool)) : 0;
    // Favorite dishes themselves get an extra chance (the 2-week rotation still applies).
    const taste = prefs?.liked ? (r) => Math.exp(3 * norm1(r, sc)) * (prefs.likedSet.has(r.id) ? 6 : 1) : () => 1;
    return (r) => taste(r) * health(r) * (1 + 2 * Math.min(3, inFridge(r)));
  };
  const wd = weighter(dinners, 'obiad'), wb = weighter(breakfasts, 'sniadanie'), wk = weighter(suppers, 'kolacja');
  const samplers = new Map();
  const pick = (pool, k, w) => {
    if (!w) return sample(pool, k, rng);
    if (!samplers.has(pool)) samplers.set(pool, weightedSampler(pool, w));
    return samplers.get(pool)(k, rng);
  };

  const goals = healthGoals(s);
  const fishWanted = Math.round((goals.fishPerWeek * s.days) / 7);
  // Variety: two lunches of the same type (e.g. pancakes twice) are rejected.
  // Dish type: the icon, or for a generic icon the first word of the name ("Pasta z awokado…").
  const dup = (k) => new Set(k).size < k.length;
  const same = (ids) => {
    const rs = ids.map((id) => recipeById[id]);
    return dup(rs.map((r) => r.emoji).filter((e) => e !== '🍽️')) || dup(rs.map(dishKind));
  };
  const varied = (d, b, k) => !(same(d) || same([...b, ...k]) || dup([...d, ...b, ...k].map((id) => dishKind(recipeById[id]))));

  // Scores one combination of dishes.
  const evaluate = (d, b, k) => {
    const meals = buildMeals(d, b, s, k);
    const list = shoppingList(meals, fridge, s);
    const cost = list.total;
    const dayStats = Array.from({ length: s.days }, (_, i) => dayNutrition(meals, i));
    // Ranking penalties: each extra cooking session in the week and calorie shortfall versus the target.
    let score = cost + (s.effort === 'min' || s.effort === 'ultra' ? 12 : 5) * (cookDays(meals).length - 1);
    if (s.kcal) {
      const goal = s.kcal;
      // Penalty for each day's deviation in either direction (too little food or going over the limit).
      // Weighted heavily, since the fixed calorie target matters more than a few zł difference.
      // The worst day counts extra, so a single very light day doesn't hide behind a good average.
      const devs = dayStats.map((n) => Math.abs(goal - n.kcal));
      const dev = devs.reduce((a, x) => a + x, 0) / s.days + Math.max(...devs) / 2;
      score += (dev / goal) * s.budget * 6;
    }
    // Using up what would spoil (vegetables, meat, dairy) counts on top of the money it saves:
    // half its value again, so a plan that empties the fridge wins over one that's a few zł cheaper.
    if (hasFridge) score -= 0.5 * fridgeUse(list.items);
    // Health goals from the research: shortfalls in protein, fiber and vegetables per day, a meal under 25 g of
    // protein, and fewer fish servings than twice a week (pro rata for the plan's length). In zł relative to the budget.
    const fishN = fishServings(meals);
    let short = 0;
    for (const n of dayStats) {
      short += 2 * Math.max(0, 1 - n.protein / goals.protein) + 2 * Math.max(0, 1 - n.fiber / goals.fiberIdeal)
        + 0.8 * Math.max(0, 1 - n.produce / goals.produceIdeal) + 0.6 * Math.max(0, 1 - n.minMealProtein / goals.proteinMeal);
    }
    score += s.budget * (short / s.days + 0.25 * Math.max(0, fishWanted - fishN.all) + (fishWanted && !fishN.oily ? 0.08 : 0));
    if (prefs?.liked) {
      // Bonus for matching taste, in zł relative to the budget.
      const parts = [[d, scales.obiad], [b, scales.sniadanie], [k, scales.kolacja]].filter(([ids, sc]) => ids.length && sc);
      const fit = parts.reduce((a, [ids, sc]) => a + ids.reduce((x, id) => x + norm1(recipeById[id], sc), 0) / ids.length, 0) / (parts.length || 1);
      score -= fit * s.budget * 0.4;
    }
    const kOff = s.kcal ? dayStats.map((n) => Math.abs(n.kcal - s.kcal) / s.kcal) : [0];
    const avgOf = (key) => dayStats.reduce((a, n) => a + n[key], 0) / dayStats.length;
    const r = {
      d, b, k, meals, cost, score,
      kdev: kOff.reduce((a, x) => a + x, 0) / kOff.length, kworst: Math.max(...kOff),
      protein: avgOf('protein'), fiber: avgOf('fiber'), produce: avgOf('produce'),
      minProtein: Math.min(...dayStats.map((n) => n.protein)), minFiber: Math.min(...dayStats.map((n) => n.fiber)),
      fish: fishN.all, oily: fishN.oily,
    };
    r.calOk = r.kdev <= 0.04 && r.kworst <= 0.12;
    // The rules: protein at least 95% of the goal on average and 85% on the weakest day, fiber at least the minimum
    // on average and 80% on the weakest day, at least 400 g of vegetables and fruit, and the fish servings.
    r.healthy = r.protein >= goals.protein * 0.95 && r.minProtein >= goals.protein * 0.85 && r.fiber >= goals.fiber
      && r.minFiber >= goals.fiber * 0.8 && r.produce >= goals.produce && r.fish >= fishWanted;
    // "Close": within about 10% on averages, at most one fish serving short.
    r.close = r.protein >= goals.protein * 0.9 && r.fiber >= goals.fiber * 0.9 && r.produce >= goals.produce * 0.9 && r.fish >= fishWanted - 1;
    // What the improvement step minimises: the score plus heavy costs for missing calories, the rules and the budget.
    const gap = 1.5 * Math.max(0, 1 - r.protein / (goals.protein * 0.95)) + 1.5 * Math.max(0, 1 - r.fiber / goals.fiber)
      + Math.max(0, 1 - r.produce / goals.produce) + 0.5 * Math.max(0, 1 - r.minFiber / (goals.fiber * 0.8))
      + 0.5 * Math.max(0, 1 - r.minProtein / (goals.protein * 0.85)) + 0.3 * Math.max(0, fishWanted - r.fish);
    r.obj = score + s.budget * (4 * Math.max(0, r.kdev - 0.04) + 4 * Math.max(0, r.kworst - 0.12) + 2 * gap) + 2 * Math.max(0, cost - s.budget);
    return r;
  };

  const seen = new Set();
  const results = [];
  const add = (d, b, k, strict) => {
    const key = d.join(',') + '|' + b.join(',') + '|' + k.join(',');
    if (seen.has(key)) return null;
    seen.add(key);
    if (strict && !varied(d, b, k)) return null;
    const r = evaluate(d, b, k);
    results.push(r);
    return r;
  };
  // 1. Random combinations, drawn with the weights above.
  // A second round without the variety rule when strict filters left too few distinct dishes.
  let strict = true;
  for (let t = 0; t < tries * 2; t++) {
    if ((t & 63) === 0) yield;
    if (t === tries) {
      if (results.length) break;
      strict = false;
      seen.clear();
    }
    const d = pick(dinners, kd, wd).map((r) => r.id).sort();
    const b = pick(breakfasts, kb, wb).map((r) => r.id).sort();
    // Suppers differ from breakfasts; with a very small pool they may repeat.
    const other = suppers.filter((r) => !b.includes(r.id));
    const k = pick(other.length >= kk ? other : suppers, kk, wk).map((r) => r.id).sort();
    add(d, b, k, strict);
  }
  if (!results.length) return { error: 'Za mało przepisów przy tych ustawieniach. Poluzuj filtry: czas w kuchni, źródło przepisów, „Bez glutenu” albo listę „Czego nie jesz”.' };

  // 2. Improvement: from the best plans, swap one dish at a time and keep the change when the plan gets better
  // (closer to the calories and the rules, cheaper). Random draws rarely land on plans that are healthy and cheap
  // at once; small steps from good ones do.
  const slots = [['d', dinners, wd], ['b', breakfasts, wb], ['k', suppers, wk]].filter(([, pool]) => pool.length);
  const seeds = [...results].sort((a, b) => a.obj - b.obj).slice(0, 12);
  let step = 0;
  for (const seed of seeds) {
    let cur = seed;
    for (let i = 0; i < 90; i++) {
      if ((++step & 31) === 0) yield;
      const [slot, pool, w] = slots[Math.floor(rng() * slots.length)];
      if (!cur[slot].length) continue;
      const nextIds = [...cur[slot]];
      const cand = pick(pool, 1, w)[0]?.id;
      if (!cand || [...cur.d, ...cur.b, ...cur.k].includes(cand)) continue;
      nextIds[Math.floor(rng() * nextIds.length)] = cand;
      nextIds.sort();
      const nb = { d: cur.d, b: cur.b, k: cur.k, [slot]: nextIds };
      const r = add(nb.d, nb.b, nb.k, strict);
      if (r && r.obj < cur.obj) cur = r;
    }
  }

  // 3. The choice, in order: calories, the health rules, the budget. A plan that hits the calories and the rules
  // may go up to 10% over budget before a less healthy one is taken. Random among the best few for variety.
  results.sort((a, b) => a.obj - b.obj);
  const inBudget = (r) => r.cost <= s.budget;
  const tiers = [
    (r) => r.calOk && r.healthy && inBudget(r),
    (r) => r.calOk && r.close && inBudget(r),
    (r) => r.calOk && r.healthy && r.cost <= s.budget * 1.1,
    (r) => r.calOk && r.close && r.cost <= s.budget * 1.1,
    (r) => r.calOk && inBudget(r),
    (r) => r.calOk,
    () => true,
  ];
  let chosen;
  for (const tier of tiers) {
    const pool = results.filter(tier);
    if (!pool.length) continue;
    const top = pool.slice(0, Math.max(1, Math.min(12, Math.ceil(pool.length * 0.3))));
    chosen = top[Math.floor(rng() * top.length)];
    break;
  }
  return { meals: chosen.meals, cost: chosen.cost, overBudget: chosen.cost > s.budget };
}

// Suggestions for swapping one dish, sorted from the cheapest plan.
export function swapOptions(plan, index, fridge = {}) {
  const s = plan.settings;
  const current = plan.meals[index];
  const used = new Set(plan.meals.filter((m) => poolType(m.type) === poolType(current.type)).map((m) => m.recipeId));
  return candidatesRelaxed(current.type, s)
    .filter((r) => !used.has(r.id))
    .map((r) => {
      const meals = replaceMeal(plan, index, r.id);
      return { recipe: r, meals, cost: planCost(meals, fridge, s) };
    })
    .sort((a, b) => a.cost - b.cost);
}

export function replaceMeal(plan, index, newId) {
  const ids = plan.meals.map((m, i) => (i === index ? newId : m.recipeId));
  const ofType = (t) => ids.filter((_, i) => plan.meals[i].type === t);
  return buildMeals(ofType('obiad'), ofType('sniadanie'), plan.settings, ofType('kolacja'));
}

export function grams(id, q) {
  const I = INGREDIENTS[id];
  if (I.unit === 'g' || I.unit === 'ml') return q;
  if (I.unit === 'szczypta') return 0;
  return q * (I.gPerSzt || 100);
}

// Per serving: calories, protein, fiber (g), vegetables and fruit (g) and fish (g, oily or not).
// Pack recipes may carry their own calories and protein (nutr); everything else comes from the ingredients.
const nutrCache = new Map();
export function nutrition(r) {
  if (!nutrCache.has(r.id)) {
    let kcal = 0, protein = 0, fiber = 0, produce = 0, fish = 0, oily = false;
    for (const [id, q] of Object.entries(r.ing)) {
      const I = INGREDIENTS[id];
      const g = grams(id, q);
      kcal += (g * I.kcal) / 100;
      protein += (g * I.protein) / 100;
      fiber += (g * (I.fiber || 0)) / 100;
      if (PRODUCE.has(id)) produce += g;
      if (FISH.has(id)) { fish += g; oily ||= OILY_FISH.has(id); }
    }
    const per = (x) => Math.round(x / r.serves);
    nutrCache.set(r.id, {
      kcal: r.nutr ? r.nutr.kcal : per(kcal), protein: r.nutr ? r.nutr.protein : per(protein),
      fiber: Math.round((fiber / r.serves) * 10) / 10, produce: per(produce), fish: per(fish), oily,
    });
  }
  return nutrCache.get(r.id);
}

// Daily goals from the nutrition research (reports/Zdrowe odżywianie na 1500 kcal.md), scaled with the calorie target:
// protein ~24% of energy within 70–130 g (1.2–1.6 g/kg), at least 25 g in each meal; fiber at least 25 g (EFSA, WHO,
// NIZP-PZH), 30 g ideal; vegetables and fruit at least 400 g (WHO), 500 g ideal; fish twice a week, once oily (EPA+DHA).
export function healthGoals(s) {
  const kcal = s.kcal || 1500;
  const fiber = Math.max(25, Math.round((kcal / 1000) * 14));
  return {
    protein: Math.min(130, Math.max(70, Math.round(kcal * 0.06))), proteinMeal: 25,
    fiber, fiberIdeal: fiber + 5, produce: 400, produceIdeal: 500,
    fishPerWeek: 2, fishMin: 80,
  };
}
// How many fish servings (≥ 80 g) and oily ones a plan gives in its days, per person.
export function fishServings(meals) {
  let all = 0, oily = 0;
  for (const m of meals) {
    const n = nutrition(recipeById[m.recipeId]);
    if (n.fish * (m.factor || 1) < 80) continue;
    all += m.days.length;
    if (n.oily) oily += m.days.length;
  }
  return { all, oily };
}

// Per-person total for a given plan day.
export function dayNutrition(meals, day) {
  // Round at the end (the serving multiplier produces fractions).
  const out = { kcal: 0, protein: 0, fiber: 0, produce: 0, minMealProtein: Infinity };
  for (const m of meals) {
    if (!m.days.includes(day)) continue;
    const n = nutrition(recipeById[m.recipeId]);
    const f = m.factor || 1;
    out.kcal += n.kcal * f;
    out.protein += n.protein * f;
    out.fiber += n.fiber * f;
    out.produce += n.produce * f;
    out.minMealProtein = Math.min(out.minMealProtein, n.protein * f);
  }
  return { kcal: Math.round(out.kcal), protein: Math.round(out.protein), fiber: Math.round(out.fiber), produce: Math.round(out.produce), minMealProtein: Math.round(out.minMealProtein) };
}

export function fmtQty(q, unit) {
  if (unit === 'g' || unit === 'ml') {
    if (q >= 1000) return `${round2(q / 1000).toString().replace('.', ',')} ${unit === 'g' ? 'kg' : 'l'}`;
    return `${Math.round(q)} ${unit}`;
  }
  if (unit === 'szczypta') return '';
  const r = Math.round(q * 4) / 4;
  const txt = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[r] ?? r.toString().replace('.', ',');
  return `${txt} ${unit}`;
}

export function fmtZl(x) {
  return `${x.toFixed(2).replace('.', ',')} zł`;
}
