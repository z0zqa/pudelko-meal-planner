import { INGREDIENTS, RECIPES } from './data.js';
import { ANIA_RECIPES } from './recipes-ania.js';

export const ALL_RECIPES = [...RECIPES, ...ANIA_RECIPES];
export const recipeById = Object.fromEntries(ALL_RECIPES.map((r) => [r.id, r]));

export function round2(x) {
  return Math.round(x * 100) / 100;
}

export function fitsDiet(recipe, s) {
  if (s.diet === 'wege' && !recipe.tags.includes('wege')) return false;
  if (s.diet === 'wegan' && !recipe.tags.includes('wegan')) return false;
  if (s.glutenFree && !recipe.tags.includes('bezgl')) return false;
  if (s.excluded?.includes(recipe.id)) return false;
  if (s.source === 'own' && recipe.source) return false;
  if (s.source === 'ania' && !recipe.source) return false;
  return true;
}

export function candidates(type, s) {
  return ALL_RECIPES.filter((r) => r.type === type && fitsDiet(r, s));
}

// Ile różnych dań na dany okres: obiady co ~2-3 dni, śniadania co ~4 dni.
export function dishCount(type, days) {
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
  return Math.min(2.5, Math.max(0.75, Math.round(((kcalTarget * MEAL_SHARE[type]) / k) * 4) / 4));
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

export function needs(meals) {
  const out = {};
  for (const m of meals) {
    const r = recipeById[m.recipeId];
    const factor = (m.portions * (m.factor || 1)) / r.serves;
    for (const [id, q] of Object.entries(r.ing)) out[id] = (out[id] || 0) + scaled(id, q, factor);
  }
  return out;
}

export function shoppingList(meals, fridge = {}) {
  const need = needs(meals);
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

export function planCost(meals, fridge) {
  return shoppingList(meals, fridge).total;
}

// Szacowany koszt porcji: cena proporcjonalna do zużytej ilości (bez zaokrąglania do opakowań).
export function costPerPortion(recipe) {
  let c = 0;
  for (const [id, q] of Object.entries(recipe.ing)) {
    const ing = INGREDIENTS[id];
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
  if (!dinners.length) return { error: 'Brak przepisów pasujących do wybranej diety.' };

  const kd = Math.min(dishCount('obiad', s.days), dinners.length);
  const kb = s.breakfasts ? Math.min(dishCount('sniadanie', s.days), breakfasts.length) : 0;

  const seen = new Set();
  const results = [];
  for (let t = 0; t < tries; t++) {
    const d = sample(dinners, kd, rng).map((r) => r.id).sort();
    const b = sample(breakfasts, kb, rng).map((r) => r.id).sort();
    const key = d.join(',') + '|' + b.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const meals = buildMeals(d, b, s);
    const cost = planCost(meals, fridge);
    // Kary w rankingu: każde dodatkowe gotowanie w tygodniu i niedobór kalorii względem celu.
    let score = cost + 5 * (cookDays(meals).length - 1);
    if (s.kcal) {
      const goal = s.kcal * (MEAL_SHARE.obiad + (b.length ? MEAL_SHARE.sniadanie : 0));
      const avg = Array.from({ length: s.days }, (_, i) => dayNutrition(meals, i).kcal).reduce((a, x) => a + x, 0) / s.days;
      score += Math.max(0, goal - avg) / goal * s.budget;
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
      return { recipe: r, meals, cost: planCost(meals, fridge) };
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
