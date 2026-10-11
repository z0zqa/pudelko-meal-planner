import { INGREDIENTS, RECIPES, LACTOSE_FREE } from './data.js';
import { ANIA_RECIPES } from './recipes-ania.js';
import { LIDL_RECIPES } from './recipes-lidl.js';

export const ALL_RECIPES = [...RECIPES, ...ANIA_RECIPES, ...LIDL_RECIPES];
// Źródło przepisu: 'own' (wbudowane), 'ania', 'lidl'.
export const siteOf = (r) => r.site || (r.source ? 'ania' : 'own');
export const SITES = { ania: { label: 'Ania Gotuje', link: 'Przepis u Ani' }, lidl: { label: 'Kuchnia Lidla', link: 'Przepis w Kuchni Lidla' } };
export const recipeById = Object.fromEntries(ALL_RECIPES.map((r) => [r.id, r]));

export function round2(x) {
  return Math.round(x * 100) / 100;
}

export const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');

// Hasła, które pociągają za sobą inne nazwy tego samego produktu.
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
    // Liczba mnoga i odmiana: „grzyb”, „grzybów”, „pieczarki” trafiają w tę samą grupę.
    const key = Object.keys(AVOID_ALIASES).find((k) => k === n || stem(k) === stem(n));
    return key ? AVOID_ALIASES[key] : [stem(n)];
  }).filter(Boolean);
}
export function containsAvoided(recipe, stems) {
  if (!stems.length) return false;
  const words = `${recipe.words || ''} ${Object.keys(recipe.ing).map((id) => norm(INGREDIENTS[id].name)).join(' ')}`.split(/[^a-z]+/);
  return stems.some((st) => words.some((w) => (st.length <= 3 ? w === st : w.startsWith(st))));
}

// Czas w kuchni: limit minut dla obiadu i śniadania.
export const EFFORT = {
  min: { label: 'Minimum', obiad: 40, sniadanie: 15 },
  normal: { label: 'Normalnie', obiad: 75, sniadanie: 30 },
  any: { label: 'Lubię gotować', obiad: Infinity, sniadanie: Infinity },
  ultra: { label: 'Ultra szybko i zdrowo', obiad: 25, sniadanie: 15 },
};

// ── Szybkie i zdrowe ──
// Ultra proste: obiad do 25 min, śniadanie do 15, najwyżej 7 produktów do kupienia, mało kroków, bez smażenia w głębokim tłuszczu.
// Zdrowe: rozsądne kalorie, sporo białka, warzywa (w śniadaniu też owoce), bez przetworzonego mięsa i słodzenia.
const PROCESSED = ['boczek', 'kielbasa', 'parowki', 'majonez', 'ciastoFrancuskie', 'ketchup', 'smietanka'];
const VEG = (id) => ['warzywa', 'mrozonki'].includes(INGREDIENTS[id].cat) && !['ziemniaki', 'batat', 'owoce', 'banany', 'jablka', 'pomarancza', 'rodzynki'].includes(id);
const FRUIT = ['owoce', 'banany', 'jablka', 'pomarancza'];
// Konkretne źródło białka w obiedzie (sam ser się nie liczy).
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
  // Ranking: udział białka w kaloriach, warzywa, krótszy czas.
  const score = (n.protein * 4 / Math.max(1, n.kcal)) * 100 + veg * 4 - recipeTime(r) / 3 - ingCount(r);
  return { ok, score, veg, ...n };
}

export const isQuickHealthy = (r) => isQuick(r) && healthInfo(r).ok;

// Sprzęt: bez piekarnika zostają dania z piekarnika, które da się zrobić w air fryerze.
export function fitsEquipment(r, s) {
  if (r.oven && s.oven === false) return !!(s.airfryer && r.af);
  if (r.af && !r.oven && s.airfryer === false) return false;
  return true;
}
export const recipeTime = (r) => r.totalTime || (r.steps || []).reduce((a, x) => a + x[1], 0) || 60;

// Dania, przy których stoi się przy patelni (smażenie partiami, lepienie) albo czeka na ciasto
// drożdżowe. Czas ze strony często tego nie obejmuje, więc w trybie „Minimum” je pomijamy.
const LABOR = /plac(ek|ki|uszk)|naleśnik|nalesnik|racuch|krokiet|pierog|pierożk|kotlet|kopytk|klusk|knedl|gofr|pancake|frytk|gołąb|golab|uszk|pyz|kluch|tortellin|ravioli|pasztecik|drożdż|drozdz|proziak|podpłomyk|wieniec|bułk|chleb|ciasto|gnocchi|własnej roboty|domow\w* makaron|lazani|lasagn|roladk|rolad/;

const stemCache = new Map();
export function fitsDiet(recipe, s) {
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
  if (s.excluded?.includes(recipe.id)) return false;
  if (s.source && s.source !== 'all' && siteOf(recipe) !== s.source) return false;
  return true;
}

export function candidates(type, s) {
  return ALL_RECIPES.filter((r) => r.type === type && fitsDiet(r, s));
}

// Ile różnych dań na dany okres: obiady co ~2-3 dni, śniadania co ~4 dni.
export function dishCount(type, days, effort) {
  // Przy „Minimum” mniej różnych dań: jedno danie na 3–4 dni, czyli rzadsze gotowanie.
  if (effort === 'min' || effort === 'ultra') return type === 'obiad' ? Math.min(4, Math.max(1, Math.ceil(days / 3.5))) : Math.min(3, Math.max(1, Math.ceil(days / 5)));
  if (type === 'obiad') return Math.min(6, Math.max(1, Math.ceil(days / 2.5)));
  return Math.min(4, Math.max(1, Math.ceil(days / 4)));
}

function splitDays(days, k) {
  const base = Math.floor(days / k);
  const extra = days % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// Rozkłada dania na kolejne dni: najpierw te, które najkrócej wytrzymują w lodówce.
// Każde danie dzieli się na partie (batches): gotujesz wszystko pierwszego dnia, a jeśli danie
// nie dotrwa do końca, a nie da się go mrozić, kolejną partię gotujesz świeżo w trakcie tygodnia.
// Jaką część dziennych kalorii pokrywa posiłek.
export const MEAL_SHARE = { obiad: 0.4, sniadanie: 0.25 };

// Mnożnik porcji, żeby posiłek dał docelowe kalorie (np. 1,5 = półtorej porcji z przepisu).
export function portionFactor(r, type, kcalTarget) {
  if (!kcalTarget) return 1;
  const k = nutrition(r).kcal || 1;
  return Math.min(2.5, Math.max(0.5, Math.round(((kcalTarget * MEAL_SHARE[type]) / k) * 4) / 4));
}

export function schedule(recipeIds, type, days, people, kcalTarget) {
  const counts = splitDays(days, recipeIds.length);
  const sorted = [...recipeIds].sort((a, b) => recipeById[a].keeps - recipeById[b].keeps);
  let day = 0;
  return sorted.map((id, i) => {
    const r = recipeById[id];
    const ds = Array.from({ length: counts[i] }, (_, j) => day + j);
    day += counts[i];
    const factor = portionFactor(r, type, kcalTarget);
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

// Id produktu, który faktycznie kupujesz (np. mleko bez laktozy zamiast zwykłego).
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
    // Tolerancja 3%: nie kupuj drugiego opakowania przez kilka gramów.
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

export function planCost(meals, fridge, s) {
  return shoppingList(meals, fridge, s).total;
}

// Szacowany koszt porcji: cena proporcjonalna do zużytej ilości (bez zaokrąglania do opakowań).
export function costPerPortion(recipe, s) {
  let c = 0;
  for (const [id, q] of Object.entries(recipe.ing)) {
    const ing = INGREDIENTS[buyId(id, s)];
    if (!ing.pantry) c += (q / ing.pack) * ing.price;
  }
  return c / recipe.serves;
}

function sample(arr, k, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// Rodzaj dania do pilnowania urozmaicenia: słowo kluczowe z nazwy, a gdy brak — pierwsze słowo.
const KINDS = ['owsiank', 'omlet', 'jajeczn', 'jajk', 'nalesn', 'plack', 'placusz', 'makaron', 'spaghetti', 'penne', 'zup', 'krem', 'salatk', 'kanapk', 'tost', 'pasta', 'losos', 'kurczak', 'ryz', 'kasz', 'tortill', 'wrap', 'burrito', 'gulasz', 'curry', 'twaroz', 'serek', 'jogurt', 'szaszl', 'pierogi', 'risotto', 'kaszotto'];
export function dishKind(r) {
  const n = norm(r.name);
  return KINDS.find((k) => n.includes(k)) || n.split(' ')[0];
}

export function buildMeals(dinnerIds, breakfastIds, s) {
  const meals = schedule(dinnerIds, 'obiad', s.days, s.people, s.kcal);
  if (breakfastIds.length) meals.push(...schedule(breakfastIds, 'sniadanie', s.days, s.people, s.kcal));
  return meals;
}

// Losuje wiele kombinacji dań i wybiera taką, która mieści się w budżecie.
// Składniki liczone w całych opakowaniach, więc dania dzielące produkty wychodzą taniej.
export function generatePlan(s, fridge = {}, rng = Math.random, tries = 2500) {
  const dinners = candidates('obiad', s);
  const breakfasts = s.breakfasts ? candidates('sniadanie', s) : [];
  if (!dinners.length) return { error: 'Żaden obiad nie pasuje do tych ustawień. Poluzuj filtry: czas w kuchni, źródło przepisów, dietę albo listę „Czego nie jesz”.' };

  const kd = Math.min(dishCount('obiad', s.days, s.effort), dinners.length);
  const kb = s.breakfasts ? Math.min(dishCount('sniadanie', s.days, s.effort), breakfasts.length) : 0;

  const seen = new Set();
  const results = [];
  for (let t = 0; t < tries; t++) {
    const d = sample(dinners, kd, rng).map((r) => r.id).sort();
    const b = sample(breakfasts, kb, rng).map((r) => r.id).sort();
    const key = d.join(',') + '|' + b.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    // Urozmaicenie: dwa obiady tego samego rodzaju (np. dwa razy naleśniki) odpadają.
    // Rodzaj dania: ikona, a dla ogólnej ikony pierwsze słowo nazwy („Pasta z awokado…”).
    const dup = (k) => new Set(k).size < k.length;
    const same = (ids) => {
      const rs = ids.map((id) => recipeById[id]);
      return dup(rs.map((r) => r.emoji).filter((e) => e !== '🍽️')) || dup(rs.map(dishKind));
    };
    if (same(d) || same(b) || dup([...d, ...b].map((id) => dishKind(recipeById[id])))) continue;
    const meals = buildMeals(d, b, s);
    const cost = planCost(meals, fridge, s);
    // Kary w rankingu: każde dodatkowe gotowanie w tygodniu i niedobór kalorii względem celu.
    let score = cost + (s.effort === 'min' || s.effort === 'ultra' ? 12 : 5) * (cookDays(meals).length - 1);
    if (s.kcal) {
      const goal = s.kcal * (MEAL_SHARE.obiad + (b.length ? MEAL_SHARE.sniadanie : 0));
      const avg = Array.from({ length: s.days }, (_, i) => dayNutrition(meals, i).kcal).reduce((a, x) => a + x, 0) / s.days;
      // Kara za odchylenie w obie strony: za mało jedzenia i przekroczenie limitu.
      score += Math.abs(goal - avg) / goal * s.budget;
    }
    results.push({ meals, cost, score });
  }

  results.sort((a, b) => a.score - b.score);
  const within = results.filter((r) => r.cost <= s.budget);
  let pick;
  if (within.length) {
    // Losowo spośród mieszczących się w budżecie, z lekką preferencją tańszych.
    const pool = within.slice(0, Math.max(1, Math.ceil(within.length * 0.6)));
    pick = pool[Math.floor(rng() * pool.length)];
  } else {
    pick = results.reduce((a, b) => (b.cost < a.cost ? b : a));
  }
  return { meals: pick.meals, cost: pick.cost, overBudget: pick.cost > s.budget };
}

// Propozycje zamiany jednego dania, posortowane od najtańszego planu.
export function swapOptions(plan, index, fridge = {}) {
  const s = plan.settings;
  const current = plan.meals[index];
  const used = new Set(plan.meals.filter((m) => m.type === current.type).map((m) => m.recipeId));
  return candidates(current.type, s)
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
  return buildMeals(ofType('obiad'), ofType('sniadanie'), plan.settings);
}

export function grams(id, q) {
  const I = INGREDIENTS[id];
  if (I.unit === 'g' || I.unit === 'ml') return q;
  if (I.unit === 'szczypta') return 0;
  return q * (I.gPerSzt || 100);
}

// Kalorie i białko na porcję. Przepisy Ani mają wartości z jej strony, pozostałe liczymy ze składników.
const nutrCache = new Map();
export function nutrition(r) {
  if (r.nutr) return r.nutr;
  if (!nutrCache.has(r.id)) {
    let kcal = 0, protein = 0;
    for (const [id, q] of Object.entries(r.ing)) {
      const g = grams(id, q);
      kcal += (g * INGREDIENTS[id].kcal) / 100;
      protein += (g * INGREDIENTS[id].protein) / 100;
    }
    nutrCache.set(r.id, { kcal: Math.round(kcal / r.serves), protein: Math.round(protein / r.serves) });
  }
  return nutrCache.get(r.id);
}

// Suma na osobę w danym dniu planu.
export function dayNutrition(meals, day) {
  // Zaokrąglamy na końcu (mnożnik porcji daje ułamki).
  const out = { kcal: 0, protein: 0 };
  for (const m of meals) {
    if (!m.days.includes(day)) continue;
    const n = nutrition(recipeById[m.recipeId]);
    out.kcal += n.kcal * (m.factor || 1);
    out.protein += n.protein * (m.factor || 1);
  }
  return { kcal: Math.round(out.kcal), protein: Math.round(out.protein) };
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
