import { INGREDIENTS, CATEGORIES, TAG_LABELS } from './data.js';
import { PRICES_DATE } from './prices.js';
import {
  ALL_RECIPES, siteOf, SITES, LOADED_SITES, buildProfile, describeProfile, affinity, taste, TASTE_LABELS, priceTier, PRICE_LABELS, PRICE_LIMITS, EFFORT, norm, buyId, isQuickHealthy, healthInfo, ingCount, fitsEquipment, avoidStems, containsAvoided, recipeTime, recipeById, scaled, nutrition, dayNutrition, generatePlan, mealShares, shoppingList, swapOptions, costPerPortion, cookDays,
  fmtQty, fmtZl, round2,
} from './planner.js';

// ── State (persisted in localStorage) ──
const KEY = 'pudelko-v1';
// Fixed daily calorie target (the user's setting), regardless of previously saved settings.
// Daily calorie targets to choose from.
const KCAL_OPTIONS = [1200, 1500, 1750, 2000, 2200, 3000];
const DEFAULT_SETTINGS = { budget: 150, days: 5, people: 1, breakfasts: true, suppers: true, diet: 'all', glutenFree: false, source: 'all', kcal: 1500, avoid: ['papryka'], lactoseFree: true, effort: 'min', oven: false, airfryer: true, price: 'any', breakfastTaste: 'any', supperTaste: 'any' };
const state = load();

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function load(saved = readLocal()) {
  return {
    // When this state was last saved, to pick the newer of the browser and account copies.
    savedAt: saved.savedAt || 0,
    // Always three meals (breakfast, lunch, supper); a calorie target outside the options falls back to 1500.
    // A source whose pack is missing (e.g. in the build without private recipes) falls back to "Wszystkie" (All).
    settings: { ...DEFAULT_SETTINGS, ...saved.settings, kcal: KCAL_OPTIONS.includes(saved.settings?.kcal) ? saved.settings.kcal : 1500, breakfasts: true, suppers: true, ...(saved.settings?.source in SITES && !LOADED_SITES.includes(saved.settings.source) ? { source: 'all' } : {}) },
    plan: saved.plan || null,
    fridge: saved.fridge || {},
    checked: saved.checked || {},
    done: saved.done || {},
    // How much each checked-off purchase added to the fridge and how much marking a dish as cooked took out,
    // so unchecking can undo it.
    // Plans from previous weeks: { start, ids, names } — so a new plan doesn't repeat dishes.
    history: saved.history || [],
    seenToday: saved.seenToday || null,
    // Dish ratings: ♥ (like) and 👎 (not for me), with a date. The taste profile is built from them.
    likes: saved.likes || {},
    dislikes: saved.dislikes || {},
    bought: saved.bought || {},
    consumed: saved.consumed || {},
    recipeFilter: 'obiad',
    recipeSource: 'all',
    recipeQuery: '',
    recipeLimit: 40,
  };
}
// Everything worth keeping: the state without view-only fields (filters, search, open form).
function persisted() {
  const { recipeFilter, recipeSource, recipeQuery, recipeLimit, recipePrice, recipeTaste, editing, quickType, quickMode, quickLimit, quickPrice, quickTaste, ...rest } = state;
  return rest;
}
function save() {
  state.savedAt = Date.now();
  const data = persisted();
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  pushRemote(data);
}

// ── Account sync ──
// Browser storage can be wiped between visits (and is separate on each device), so on claude.ai the
// state is also kept in the viewer's private document in the artifact's database. On load the newer
// of the two copies wins; every save goes to both, the account copy batched to one write per second.
let remote = null;
let pushTimer = null;
function pushRemote(data) {
  if (!remote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => remote.set(JSON.parse(JSON.stringify(data))).catch((err) => {
    // No write access (e.g. a view-only share) or a permanent refusal: keep using browser storage only.
    if (err?.code !== 'unavailable' && err?.code !== 'resource_exhausted') remote = null;
  }), 1000);
}
async function connectRemote() {
  if (!window.claude?.use) return;
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  const id = db && user ? await user.id() : null;
  if (!id) return;
  const ref = db.doc(`data/users/${id}/state`);
  let snap;
  try { snap = await ref.get(); } catch { return; }
  remote = ref;
  const saved = snap.exists ? snap.data() : null;
  if (saved && (saved.savedAt || 0) > state.savedAt) {
    const ui = { recipeFilter: state.recipeFilter, recipeSource: state.recipeSource, recipeQuery: state.recipeQuery, recipeLimit: state.recipeLimit };
    Object.assign(state, load(saved), ui);
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
    dropStalePlan();
    if (!sheet.open) route();
  } else if (state.savedAt) {
    pushRemote(persisted());
  }
}

// ── Dates ──
const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const WD_SHORT = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
function dayDate(i) {
  const d = new Date(state.plan.start);
  d.setDate(d.getDate() + i);
  return d;
}
const dayShort = (i) => WD_SHORT[dayDate(i).getDay()];
const dayLong = (i) => WEEKDAYS[dayDate(i).getDay()];
const dayLabel = (i) => { const d = dayDate(i); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
function daysRange(days) {
  if (days.length === 1) return dayShort(days[0]);
  return `${dayShort(days[0])}–${dayShort(days[days.length - 1])}`;
}
function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}
const portionsTxt = (n) => `${n} ${plural(n, 'porcja', 'porcje', 'porcji')}`;
const daysTxt = (n) => `${n} ${plural(n, 'dzień', 'dni', 'dni')}`;
const minTxt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

// ── Render ──
const view = document.getElementById('view');
const sheet = document.getElementById('sheet');

// A plan saved before a database update may point to recipes that no longer exist.
function dropStalePlan() {
  if (state.plan && state.plan.meals.some((m) => !recipeById[m.recipeId])) {
    state.plan = null;
    state.checked = {};
    state.done = {};
    state.bought = {};
    state.consumed = {};
    save();
    setTimeout(() => toast('Baza przepisów się zmieniła, ułóż nowy plan.'), 300);
  }
}
dropStalePlan();

function route() {
  const tab = (location.hash || '#plan').slice(1);
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  const render = { plan: renderPlan, zakupy: renderShopping, gotowanie: renderCooking, lodowka: renderFridge, przepisy: renderRecipes, szybkie: renderQuick }[tab] || renderPlan;
  view.innerHTML = render();
  renderTopInfo();
}

function renderTopInfo() {
  const p = state.plan;
  document.getElementById('top-info').textContent = p
    ? `${fmtZl(shopping().total).replace(',00', '')} · ${daysTxt(p.settings.days)} · ${p.settings.people} os.`
    : '';
}

function shopping() {
  return shoppingList(state.plan.meals, state.plan.fridge, state.plan.settings);
}

// Plan

function renderPlan() {
  if (!state.plan || state.editing) return renderForm();
  const p = state.plan;
  const s = p.settings;
  const list = shopping();
  const left = round2(s.budget - list.total);
  const pct = Math.min(100, (list.total / s.budget) * 100);
  const dinners = p.meals.map((m, i) => [m, i]).filter(([m]) => m.type === 'obiad');
  const breakfasts = p.meals.map((m, i) => [m, i]).filter(([m]) => m.type === 'sniadanie');
  const suppers = p.meals.map((m, i) => [m, i]).filter(([m]) => m.type === 'kolacja');
  const sessions = cookDays(p.meals);

  return `
    <section class="card summary">
      <div class="row spread">
        <div>
          <div class="eyebrow">Zakupy na ${daysTxt(s.days)} · ${s.people} ${plural(s.people, 'osoba', 'osoby', 'osób')}</div>
          <div class="budget-big">${fmtZl(list.total)}</div>
        </div>
        <span class="pill ${left >= 0 ? 'ok' : 'warn'}">${left >= 0 ? `zostaje ${fmtZl(left)}` : `brakuje ${fmtZl(-left)}`}</span>
      </div>
      <div class="bar ${left < 0 ? 'over' : ''}"><i style="width:${pct}%"></i></div>
      <div class="muted small">Budżet ${fmtZl(s.budget)} · ok. ${fmtZl(list.total / (s.days * s.people))} na osobę dziennie</div>
      ${prefsLine(s)}
      ${nutritionSummary(p)}
      ${left < 0 ? `<p class="notice" style="margin:12px 0 0">Przy ${s.kcal.toLocaleString('pl-PL')} kcal dziennie ten plan kosztuje ok. ${fmtZl(list.total / (s.days * s.people))} na osobę dziennie, więc nie mieści się w budżecie. Podnieś budżet do ok. ${Math.ceil(list.total / 10) * 10} zł albo skróć okres.</p>` : ''}
      <div class="row" style="margin-top:14px">
        <a class="btn primary" href="#zakupy">Lista zakupów</a>
        <a class="btn" href="#gotowanie">Gotowanie</a>
      </div>
    </section>

    ${mealHead('obiad', 'Obiady')}
    ${dinners.map(([m, i]) => dishCard(m, i)).join('')}
    ${breakfasts.length ? `${mealHead('sniadanie', 'Śniadania')}${breakfasts.map(([m, i]) => dishCard(m, i)).join('')}` : ''}
    ${suppers.length ? `${mealHead('kolacja', 'Kolacje')}${suppers.map(([m, i]) => dishCard(m, i)).join('')}` : ''}

    <h2>Dzień po dniu</h2>
    <p class="muted small">${sessions.length === 1 ? 'Gotujesz raz, na początku. Potem tylko odgrzewasz.' : `Gotujesz ${sessions.length} razy: ${sessions.map((d) => dayLong(d)).join(', ')}.`}</p>
    <div class="days">${Array.from({ length: s.days }, (_, d) => dayRow(d)).join('')}</div>

    <div class="row" style="margin:20px 0 8px">
      <button class="btn" data-action="reroll">Wylosuj inne dania</button>
      <button class="btn" data-action="edit">Zmień ustawienia</button>
      <button class="btn ghost" data-action="new-plan">Nowy plan</button>
    </div>`;
}

// Section heading with a lid in the meal's colour, matching the containers below it.
const mealHead = (type, label) => `<div class="meal-head" style="--lid:var(--lid-${type})"><h2>${label}</h2></div>`;
// A tear-off calendar page: weekday on top, day of the month below.
const calPage = (d) => `<div class="cal"><b>${dayShort(d)}</b><span>${dayDate(d).getDate()}</span></div>`;

function prefsLine(s) {
  const bits = [];
  if (s.avoid?.length) bits.push(`bez: ${s.avoid.join(', ')}`);
  if (s.lactoseFree) bits.push('bez laktozy');
  if (s.breakfastTaste && s.breakfastTaste !== 'any') bits.push(`śniadania ${TASTE_LABELS[s.breakfastTaste]}`);
  if (s.supperTaste && s.supperTaste !== 'any') bits.push(`kolacje ${TASTE_LABELS[s.supperTaste]}`);
  if (s.price && s.price !== 'any') bits.push(`${PRICE_LABELS[s.price]} dania`);
  if (s.effort && s.effort !== 'any') bits.push(s.effort === 'min' ? 'szybkie dania, mało gotowania' : 'dania do 75 min');
  return bits.length ? `<div class="row" style="margin-top:8px">${bits.map((b) => `<span class="pill">${b}</span>`).join('')}</div>` : '';
}

function nutritionSummary(p) {
  const days = Array.from({ length: p.settings.days }, (_, d) => dayNutrition(p.meals, d));
  const avg = (k) => Math.round(days.reduce((a, n) => a + n[k], 0) / days.length);
  const shares = mealShares(p.settings);
  const names = { sniadanie: 'śniadanie', obiad: 'obiad', kolacja: 'kolacja' };
  const split = ['sniadanie', 'obiad', 'kolacja'].filter((t) => shares[t]).map((t) => `${names[t]} ok. ${Math.round(p.settings.kcal * shares[t])}`).join(', ');
  return `
    <div class="nutri">
      <div><strong>${avg('kcal').toLocaleString('pl-PL')}</strong><span>kcal dziennie</span></div>
      <div><strong>${avg('protein')} g</strong><span>białka dziennie</span></div>
      <div><strong>${(avg('kcal') * p.settings.days).toLocaleString('pl-PL')}</strong><span>kcal w planie</span></div>
    </div>
    <div class="muted small">Na osobę. Cel ${p.settings.kcal.toLocaleString('pl-PL')} kcal dziennie: ${split} kcal. Przekąski dolicz osobno.</div>`;
}

const mealNutrition = (m) => { const n = nutrition(recipeById[m.recipeId]); const f = m.factor || 1; return { kcal: Math.round(n.kcal * f), protein: Math.round(n.protein * f) }; };
const fmtFactor = (f) => String(f).replace('.', ',');
const portionSize = (m) => (m.factor && m.factor !== 1 ? ` po ×${fmtFactor(m.factor)}` : '');

const tastePill = (r) => (r.type === 'sniadanie' ? `<span class="pill taste-${taste(r)}">${TASTE_LABELS[taste(r)]}</span>` : '');
const tasteChips = (action, cur) => [['any', 'Słodkie i słone'], ['slodkie', 'Na słodko'], ['slone', 'Na słono']].map(([v, l]) => `<button class="chip" data-action="${action}" data-v="${v}" aria-pressed="${(cur || 'any') === v}">${l}</button>`).join('');
const pricePill = (r, s) => { const t = priceTier(r, s); return `<span class="pill price-${t}">${PRICE_LABELS[t]}</span>`; };
const priceChips = (action, cur) => ['any', 'tanie', 'srednie', 'drogie'].map((v) => `<button class="chip" data-action="${action}" data-v="${v}" aria-pressed="${(cur || 'any') === v}">${v === 'any' ? 'Każda cena' : PRICE_LABELS[v][0].toUpperCase() + PRICE_LABELS[v].slice(1)}</button>`).join('');

// Equipment label. An oven dish made in an air fryer gets a hint on how to convert it.
function equipmentPill(r, s) {
  if (r.oven && r.af && s.oven === false) return '<span class="pill accent" title="Temperatura o ok. 20°C niższa, czas o ok. 20% krótszy niż w przepisie, w mniejszych porcjach">air fryer zamiast piekarnika</span>';
  if (r.af && !r.oven) return '<span class="pill accent">air fryer</span>';
  if (r.nocook) return '<span class="pill">bez gotowania</span>';
  return '';
}

function dishCard(m, i) {
  const r = recipeById[m.recipeId];
  const p = state.plan;
  const tags = [];
  const b = m.batches;
  if (b.some((x) => x.freeze)) tags.push('<span class="pill accent">część do zamrażarki</span>');
  if (b.length > 1 || b[0].cookDay > 0) tags.push(`<span class="pill">gotujesz: ${b.map((x) => dayShort(x.cookDay)).join(', ')}</span>`);
  const eq = equipmentPill(r, state.plan.settings);
  if (eq) tags.push(eq);
  return `
    <article class="card dish box lid-${m.type}">
      <div class="emoji">${r.emoji}</div>
      <div style="min-width:0">
        <h3>${r.name}</h3>
        <div class="meta">${portionsTxt(m.portions)}${portionSize(m)} · ${daysRange(m.days)} · ${kcalTxt(mealNutrition(m))} · ok. ${fmtZl(costPerPortion(r, state.plan.settings) * (m.factor || 1))}/porcja ${pricePill(r, state.plan.settings)} ${tastePill(r)}</div>
        ${tags.length ? `<div class="row" style="margin-top:6px">${tags.join('')}</div>` : ''}
        <div class="row">
          <button class="btn small" data-action="swap" data-i="${i}">Zamień</button>
          ${rateButtons(r)}
          ${r.source ? sourceBtn(r, 'btn small ghost') : `<button class="btn small ghost" data-action="recipe" data-id="${r.id}">Przepis</button>`}
          ${r.source ? `<button class="btn small ghost" data-action="recipe" data-id="${r.id}">Składniki</button>` : ''}
        </div>
      </div>
    </article>`;
}

function dayRow(d) {
  const items = [];
  for (const type of ['sniadanie', 'obiad', 'kolacja']) {
    for (const m of state.plan.meals) {
      if (m.type !== type || !m.days.includes(d)) continue;
      const r = recipeById[m.recipeId];
      const batch = m.batches.find((b) => b.days.includes(d));
      let note = '';
      if (batch.cookDay === d) note = d === 0 ? '' : ' <span class="pill accent">ugotuj dziś</span>';
      if (batch.freeze && d + 1 > r.keeps) note = ' <span class="pill">z zamrażarki</span>';
      items.push(`<li><span class="meal-tag ${type}">${{ sniadanie: 'Śn', obiad: 'Ob', kolacja: 'Kol' }[type]}</span><span>${r.name}${note}</span></li>`);
    }
  }
  const n = dayNutrition(state.plan.meals, d);
  return `<div class="day"><div>${calPage(d)}<div class="kcal" style="text-align:center">${n.kcal} kcal</div></div><ul>${items.join('')}</ul></div>`;
}

function renderForm() {
  const s = state.settings;
  const effortChip = (v, label) => `<button type="button" class="chip" data-action="effort" data-v="${v}" aria-pressed="${(s.effort || 'any') === v}">${label}</button>`;
  const tasteChip = (k, v, label) => `<button type="button" class="chip" data-action="taste" data-k="${k}" data-v="${v}" aria-pressed="${(s[k] || 'any') === v}">${label}</button>`;
  const priceChip = (v, label) => `<button type="button" class="chip" data-action="price" data-v="${v}" aria-pressed="${(s.price || 'any') === v}">${label}</button>`;
  const srcChip = (v, label) => `<button class="chip" data-action="source" data-v="${v}" aria-pressed="${s.source === v}">${label}</button>`;
  const dietChip = (v, label) => `<button class="chip" data-action="diet" data-v="${v}" aria-pressed="${s.diet === v}">${label}</button>`;
  return `
    <section>
      <h1>Ile chcesz wydać i na ile dni?</h1>
      <p class="muted">Dobierzemy dania, policzymy zakupy w całych opakowaniach i rozpiszemy gotowanie.</p>
    </section>
    <form id="plan-form" class="card">
      <div class="field">
        <label for="budget">Budżet na zakupy</label>
        <div class="money"><input id="budget" name="budget" type="number" inputmode="decimal" min="10" step="1" value="${s.budget}" required></div>
        <div class="chips presets">${[100, 150, 200, 300, 400, 500].map((v) => `<button type="button" class="chip" data-action="preset" data-v="${v}">${v} zł</button>`).join('')}</div>
      </div>
      <div class="row spread field">
        <div class="label">Na ile dni</div>
        <div class="stepper"><button type="button" data-action="step" data-k="days" data-d="-1" aria-label="Mniej dni">−</button><output>${daysTxt(s.days)}</output><button type="button" data-action="step" data-k="days" data-d="1" aria-label="Więcej dni">+</button></div>
      </div>
      <div class="row spread field">
        <div class="label">Ile osób</div>
        <div class="stepper"><button type="button" data-action="step" data-k="people" data-d="-1" aria-label="Mniej osób">−</button><output>${s.people}</output><button type="button" data-action="step" data-k="people" data-d="1" aria-label="Więcej osób">+</button></div>
      </div>
      <div class="field">
        <div class="label">Co jesz?</div>
        <div class="chips">${dietChip('all', 'Wszystko')}${dietChip('wege', 'Wege')}${dietChip('wegan', 'Wegańskie')}</div>
      </div>
      <div class="field">
        <label class="label" for="avoid-q" style="display:block;font-weight:600;margin-bottom:6px">Czego nie jesz?</label>
        <div class="chips" id="avoid-list" style="margin-bottom:8px">${(s.avoid || []).map((t) => `<button type="button" class="chip" aria-pressed="true" data-action="avoid-del" data-v="${t}" aria-label="Usuń: ${t}">${t} ✕</button>`).join('')}</div>
        <div class="row" style="flex-wrap:nowrap">
          <input class="input" id="avoid-q" type="text" autocomplete="off" enterkeyhint="done" placeholder="np. grzyby, cebula, orzechy" style="flex:1">
          <button type="button" class="btn" data-action="avoid-add">Dodaj</button>
        </div>
        <p class="muted small" style="margin:6px 0 0">Pomijamy dania z tym składnikiem, także w przyprawach. „Papryka” wyklucza też chili i ostre sosy paprykowe.</p>
      </div>
      <div class="field">
        <label class="switch"><span>Bez laktozy<br><span class="muted small">mleko bez laktozy lub roślinne, jogurt, śmietana i twaróg bez laktozy</span></span><input type="checkbox" name="lactoseFree" ${s.lactoseFree ? 'checked' : ''}></label>
      </div>
      <div class="field">
        <div class="label">Ile czasu na gotowanie?</div>
        <div class="chips">${effortChip('ultra', 'Ultra szybko i zdrowo')}${effortChip('min', 'Minimum')}${effortChip('normal', 'Normalnie')}${effortChip('any', 'Lubię gotować')}</div>
        <p class="muted small" style="margin:6px 0 0">${{ ultra: 'Tylko dania z zakładki Szybkie: obiad do 25 min, śniadanie do 15, najwyżej 7 produktów, dużo białka i warzywa.', min: 'Obiady do 40 min, bez smażenia partiami i ciasta drożdżowego, śniadania do 15 min. Mniej różnych dań, więc gotujesz rzadziej.', normal: 'Obiady do 75 min, śniadania do 30 min.', any: 'Bez limitu czasu.' }[s.effort || 'any']}</p>
      </div>
      <div class="field">
        <div class="label">Czym gotujesz?</div>
        <label class="switch"><span>Piekarnik</span><input type="checkbox" name="oven" ${s.oven !== false ? 'checked' : ''}></label>
        <label class="switch"><span>Air fryer<br><span class="muted small">bez piekarnika bierzemy z jego przepisów tylko to, co da się zrobić w air fryerze</span></span><input type="checkbox" name="airfryer" ${s.airfryer ? 'checked' : ''}></label>
      </div>
      <div class="field">
        <div class="label">Kalorie dziennie</div>
        <div class="chips">${KCAL_OPTIONS.map((v) => `<button type="button" class="chip" data-action="kcal" data-v="${v}" aria-pressed="${s.kcal === v}">${v.toLocaleString('pl-PL')}</button>`).join('')}</div>
        <p class="muted small" style="margin:6px 0 0">Porcje dobieramy tak, żeby posiłki z planu dały razem ${s.kcal.toLocaleString('pl-PL')} kcal: śniadanie ok. ${Math.round(s.kcal * 0.3)}, obiad ok. ${Math.round(s.kcal * 0.4)}, kolacja ok. ${Math.round(s.kcal * 0.3)}. Gdy przy Twoich filtrach brakuje śniadań lub kolacji, bierzemy je z innych źródeł.</p>
      </div>
      <div class="field">
        <div class="label">Śniadania</div>
        <div class="chips">${tasteChip('breakfastTaste', 'any', 'Obojętnie')}${tasteChip('breakfastTaste', 'slodkie', 'Na słodko')}${tasteChip('breakfastTaste', 'slone', 'Na słono')}</div>
        <div class="label" style="margin-top:12px">Kolacje</div>
        <div class="chips">${tasteChip('supperTaste', 'any', 'Obojętnie')}${tasteChip('supperTaste', 'slodkie', 'Na słodko')}${tasteChip('supperTaste', 'slone', 'Na słono')}</div>
      </div>
      <div class="field">
        <div class="label">Ceny dań</div>
        <div class="chips">${priceChip('any', 'Wszystkie')}${priceChip('tanie', 'Tanie')}${priceChip('srednie', 'Średnie')}${priceChip('drogie', 'Drogie')}</div>
        <p class="muted small" style="margin:6px 0 0">Cena porcji: obiad tani do ${PRICE_LIMITS.obiad[0]} zł, średni do ${PRICE_LIMITS.obiad[1]} zł; śniadanie i kolacja tanie do ${PRICE_LIMITS.sniadanie[0]} zł, średnie do ${PRICE_LIMITS.sniadanie[1]} zł.</p>
      </div>
      ${LOADED_SITES.length ? `<div class="field">
        <div class="label">Skąd przepisy?</div>
        <div class="chips">${srcChip('all', 'Wszystkie')}${LOADED_SITES.map((k) => srcChip(k, SITES[k].label)).join('')}${srcChip('own', 'Wbudowane')}</div>
      </div>` : ''}
      <div class="field">
        <label class="switch"><span>Bez glutenu</span><input type="checkbox" name="glutenFree" ${s.glutenFree ? 'checked' : ''}></label>
        <p class="muted small" style="margin:4px 0 0">Plan zawsze ma śniadanie, obiad i kolację.</p>
      </div>
      ${tasteNote()}
      ${historyNote()}
      <button class="btn primary block" type="submit">Ułóż plan</button>
      ${state.plan ? '<button class="btn ghost block" type="button" data-action="cancel-edit" style="margin-top:8px">Anuluj</button>' : ''}
    </form>
    ${Object.keys(state.fridge).length ? `<p class="muted small">🧊 Uwzględnimy to, co masz w <a href="#lodowka">lodówce</a> (${Object.keys(state.fridge).length} ${plural(Object.keys(state.fridge).length, 'produkt', 'produkty', 'produktów')}).</p>` : ''}
    <p class="muted small">Bez konta, bez reklam, działa offline. Ceny są orientacyjne (tani dyskont).</p>`;
}

function addAvoid(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return;
  const list = state.settings.avoid || [];
  if (!list.includes(t)) state.settings.avoid = [...list, t];
}

function tasteNote() {
  const nl = Object.keys(state.likes).length, nd = Object.keys(state.dislikes).length;
  if (!nl && !nd) return '<p class="muted small">Oznaczaj dania jako ♡ Lubię albo 👎. Kolejne plany nauczą się, co Ci smakuje.</p>';
  const d = describeProfile(tasteProfile());
  const parts = [];
  if (d.likes.length) parts.push(`lubisz: ${d.likes.join(', ')}`);
  if (d.combos.length) parts.push(`połączenia: ${d.combos.join(', ')}`);
  if (d.avoid.length) parts.push(`rzadziej: ${d.avoid.join(', ')}`);
  return `<div class="card soft small" style="margin:0 0 12px"><strong>Twój gust</strong> (${nl} ♥, ${nd} 👎)<br>${parts.join(' · ') || 'za mało ocen, żeby coś wywnioskować'}
    <div style="margin-top:6px"><a href="#przepisy" data-action="show-favs">Zobacz ulubione</a> · <button type="button" class="btn small ghost" data-action="clear-taste">Zapomnij oceny</button></div></div>`;
}

function historyNote() {
  // A plan from an earlier day goes to history when a new one is built, so count it already now.
  const pending = state.plan && state.plan.start < todayStart() ? state.plan.meals.map((m) => m.recipeId) : [];
  const n = new Set([...state.history.filter((h) => h.start >= todayStart() - HISTORY_DAYS * DAY).flatMap((h) => h.ids), ...pending]).size;
  if (!n) return '<p class="muted small">Kolejne plany nie powtórzą dań z ostatnich 2 tygodni.</p>';
  return `<p class="muted small">Pomijamy ${n} ${plural(n, 'danie', 'dania', 'dań')} z ostatnich 2 tygodni, żeby się nie powtarzały. <button type="button" class="btn small ghost" data-action="clear-history">Wyczyść historię</button></p>`;
}

function readForm() {
  const f = document.getElementById('plan-form');
  if (!f) return;
  const budget = parseFloat(f.budget.value.replace(',', '.'));
  if (budget > 0) state.settings.budget = budget;
  state.settings.glutenFree = f.glutenFree.checked;
  state.settings.breakfasts = true;
  state.settings.suppers = true;
  state.settings.lactoseFree = f.lactoseFree.checked;
  state.settings.oven = f.oven.checked;
  state.settings.airfryer = f.airfryer.checked;
  addAvoid(f.querySelector('#avoid-q')?.value);
}

// Taste profile from ratings (recomputed for every plan, since ratings change).
function tasteProfile() {
  const liked = Object.keys(state.likes).filter((id) => recipeById[id]);
  const disliked = Object.keys(state.dislikes).filter((id) => recipeById[id]);
  return liked.length || disliked.length ? buildProfile(liked, disliked) : null;
}

function rateButtons(r, small = true) {
  const liked = !!state.likes[r.id], disliked = !!state.dislikes[r.id];
  const cls = small ? 'btn small ghost rate' : 'btn rate';
  return `<button class="${cls} ${liked ? 'on' : ''}" data-action="like" data-id="${r.id}" aria-pressed="${liked}" aria-label="Lubię: ${r.name}">${liked ? '♥' : '♡'} Lubię</button>
    <button class="${cls} ${disliked ? 'on-no' : ''}" data-action="dislike" data-id="${r.id}" aria-pressed="${disliked}" aria-label="Nie dla mnie: ${r.name}">👎${small ? '' : ' Nie dla mnie'}</button>`;
}

// How many days back we remember eaten dishes.
const HISTORY_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Saves the current plan to history (if it was in use) and prunes old entries.
function archivePlan() {
  const p = state.plan;
  const ids = p ? [...new Set(p.meals.map((m) => m.recipeId))] : [];
  if (p && !state.history.some((h) => h.start === p.start && h.ids.join() === ids.join())) {
    state.history.push({ start: p.start, ids, names: [...new Set(p.meals.map((m) => norm(recipeById[m.recipeId]?.name || '')))] });
  }
  state.history = state.history.filter((h) => h.start >= todayStart() - HISTORY_DAYS * DAY);
}

// Dishes shown in today's draws (at most ~120 most recent).
function rememberSeen(plan) {
  if (state.seenToday?.day !== todayStart()) state.seenToday = { day: todayStart(), ids: [] };
  const ids = plan.meals.flatMap((m) => [m.recipeId, norm(recipeById[m.recipeId]?.name || '')]);
  state.seenToday.ids = [...new Set([...state.seenToday.ids, ...ids])].slice(-120);
}

function recentDishes() {
  const fresh = state.history.filter((h) => h.start >= todayStart() - HISTORY_DAYS * DAY);
  return [...new Set(fresh.flatMap((h) => [...h.ids, ...h.names]))];
}

function makePlan() {
  // A plan from an earlier day was already in use, so it goes to history.
  // "Wylosuj inne dania" (Draw other dishes) on the same day just replaces it, and its dishes are set aside
  // so the next draw gives something new.
  if (state.plan && state.plan.start < todayStart()) archivePlan();
  else if (state.plan) rememberSeen(state.plan);
  if (state.seenToday?.day !== todayStart()) state.seenToday = { day: todayStart(), ids: [] };
  const s = { ...state.settings, excluded: [...recentDishes(), ...state.seenToday.ids], disliked: Object.keys(state.dislikes) };
  const prefs = tasteProfile();
  const res = generatePlan({ ...s, prefs }, state.fridge);
  if (res.error) return toast(res.error);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  state.plan = { settings: s, meals: res.meals, start: today.getTime(), fridge: { ...state.fridge } };
  state.checked = {};
  state.done = {};
  state.bought = {};
  state.consumed = {};
  state.editing = false;
  save();
}

// Shopping

function renderShopping() {
  if (!state.plan) return emptyState('basket', 'Najpierw ułóż plan, a lista zakupów zrobi się sama.');
  const list = shopping();
  const groups = {};
  for (const it of list.items) (groups[it.cat] ||= []).push(it);
  const toBuy = list.items.filter((it) => it.packs > 0);
  const remaining = toBuy.filter((it) => !state.checked[it.id]).reduce((a, it) => a + it.cost, 0);
  const fromFridge = list.items.filter((it) => it.packs === 0);

  const left = toBuy.filter((it) => !state.checked[it.id]).length;
  return `
    <h1>Lista zakupów</h1>
    <div class="card to-buy">
      <div><div class="eyebrow">Zostało do kupienia</div><strong>${fmtZl(remaining)}</strong> <span class="muted small">${left} z ${toBuy.length} ${plural(toBuy.length, 'pozycji', 'pozycji', 'pozycji')}</span></div>
      <button class="btn small" data-action="copy-list">Wyślij / skopiuj</button>
    </div>
    <p class="muted small">Odhaczone produkty trafiają do <a href="#lodowka">lodówki</a>.</p>
    <div class="receipt">
      <div class="rc-head"><strong>Pudełko</strong>Lista zakupów · ${new Date(state.plan.start).toLocaleDateString('pl-PL')}<br>${daysTxt(state.plan.settings.days)} · ${state.plan.settings.people} os.</div>
      ${Object.keys(CATEGORIES).filter((c) => groups[c]?.some((it) => it.packs > 0)).map((c) => `
        <section class="rc-group">
          <h2>${CATEGORIES[c]}</h2>
          ${groups[c].filter((it) => it.packs > 0).map(shopItem).join('')}
        </section>`).join('')}
      <div class="rc-total"><span>Suma PLN</span><span>${fmtZl(list.total).replace(' zł', '')}</span></div>
      ${PRICES_DATE ? `<div class="rc-foot">Ceny: <a href="https://zakupy.biedronka.pl" target="_blank" rel="noopener">Biedronka online</a>, ${new Date(PRICES_DATE).toLocaleDateString('pl-PL')}<br>Produkty spoza oferty online: ceny szacunkowe</div>` : ''}
    </div>
    ${fromFridge.length ? `<section class="shop-group"><h2>Masz już w lodówce</h2><div class="card soft small">${fromFridge.map((it) => `${it.name} (${fmtQty(it.need, it.unit)})`).join(', ')}</div></section>` : ''}
    ${list.pantry.length ? `<section class="shop-group"><h2>Zakładamy, że masz w domu</h2><div class="card soft small">${list.pantry.map((it) => it.unit === 'szczypta' ? it.name : `${it.name} (${fmtQty(it.need, it.unit)})`).join(', ')}</div></section>` : ''}`;
}

function shopItem(it) {
  const done = !!state.checked[it.id];
  const packTxt = packText(it);
  const sub = [`potrzebujesz ${fmtQty(it.need, it.unit)}`];
  if (it.have) sub.push(`masz ${fmtQty(it.have, it.unit)}`);
  if (it.leftover >= (it.unit === 'g' || it.unit === 'ml' ? 1 : 0.25)) sub.push(`zostanie ${fmtQty(it.leftover, it.unit)}`);
  return `
    <label class="item ${done ? 'done' : ''}">
      <input type="checkbox" data-action="check" data-id="${it.id}" ${done ? 'checked' : ''}>
      <div><div class="name">${it.name}</div><div class="sub">${packTxt} · ${sub.join(' · ')}</div>${it.product ? `<div class="sub">w Biedronce: ${it.product}</div>` : ''}</div>
      <div class="price">${fmtZl(it.cost)}</div>
    </label>`;
}

function packText(it) {
  return it.pack === 1 ? fmtQty(it.packs, it.unit) : `${it.packs} × ${fmtQty(it.pack, it.unit)}`;
}

function listAsText() {
  const list = shopping();
  const lines = list.items.filter((it) => it.packs > 0).map((it) => {
    const packTxt = packText(it);
    return `☐ ${it.name}: ${packTxt} (${fmtZl(it.cost)})`;
  });
  return `Lista zakupów (${fmtZl(list.total)})\n${lines.join('\n')}`;
}

// Cooking

function renderCooking() {
  if (!state.plan) return emptyState('pot', 'Najpierw ułóż plan, a tu pojawi się rozpiska gotowania.');
  const p = state.plan;
  return `
    <h1>Gotowanie</h1>
    <p class="muted">Zacznij od dań, które gotują się najdłużej. Ryż i kasze możesz ugotować w jednym garnku dla kilku dań.</p>
    ${cookDays(p.meals).map((day) => {
      const tasks = [];
      p.meals.forEach((m) => m.batches.forEach((b, bi) => { if (b.cookDay === day) tasks.push({ m, b, bi }); }));
      const times = tasks.map(({ m }) => recipeTime(recipeById[m.recipeId])).sort((a, b) => b - a);
      // Some steps run in parallel, so count the longest dish + half of the others.
      const est = Math.round((times[0] + times.slice(1).reduce((a, t) => a + t, 0) * 0.5) / 5) * 5;
      tasks.sort((a, b) => totalTime(b.m) - totalTime(a.m));
      return `
        <div class="cook-day">${calPage(day)}<div><h2>${day === 0 ? 'Gotowanie na start' : 'Kolejne gotowanie'}</h2>
          <div class="muted small">${dayLong(day)}, ${dayLabel(day)} · ${tasks.length} ${plural(tasks.length, 'danie', 'dania', 'dań')} · ok. ${minTxt(est)}</div></div></div>
        ${tasks.map(cookCard).join('')}`;
    }).join('')}`;
}

const totalTime = (m) => recipeTime(recipeById[m.recipeId]);
const kcalTxt = (n) => `${n.kcal.toLocaleString('pl-PL')} kcal`;
const sourceBtn = (r, cls = 'btn small') => `<a class="${cls}" href="${r.source}" target="_blank" rel="noopener">${SITES[siteOf(r)].link} ↗</a>`;
const siteTag = (r) => (r.source ? ` · ${SITES[siteOf(r)].label}` : '');

function cookCard({ m, b, bi }) {
  const r = recipeById[m.recipeId];
  const f = (b.portions * (m.factor || 1)) / r.serves;
  const key = `${m.recipeId}#${bi}`;
  const steps = r.steps || [];
  const doneCount = steps.filter((_, i) => state.done[`${key}:${i}`]).length;
  const cooked = state.done[`${key}:all`];
  return `
    <article class="card box lid-${m.type}">
      <div class="dish">
        <div class="emoji">${r.emoji}</div>
        <div style="min-width:0">
          <h3>${r.name}</h3>
          <div class="meta">${portionsTxt(b.portions)}${portionSize(m)} · na ${daysRange(b.days)} · ${steps.length ? `${doneCount}/${steps.length} kroków` : `ok. ${minTxt(recipeTime(r))}`}</div>
          ${b.freeze ? `<div class="meta">❄️ ${portionsTxt(b.days.filter((d) => d + 1 > r.keeps).length * state.plan.settings.people)} od razu do zamrażarki</div>` : ''}
        </div>
      </div>
      <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) => `<li>${INGREDIENTS[buyId(id, state.plan.settings)].name}${INGREDIENTS[id].unit === 'szczypta' ? '' : ` — ${fmtQty(scaled(id, q, f), INGREDIENTS[id].unit)}`}</li>`).join('')}</ul>
      <div class="row" style="margin-top:10px">${r.source ? sourceBtn(r) : ''}
        <label class="row small" style="gap:6px"><input type="checkbox" data-action="cooked" data-k="${key}" data-m="${state.plan.meals.indexOf(m)}" data-b="${bi}" ${cooked ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--ok)"> Ugotowane (zdejmij składniki z lodówki)</label></div>
      <ol class="steps">${steps.map(([txt, min], i) => {
        const done = state.done[`${key}:${i}`];
        return `<li class="${done ? 'done' : ''}"><input type="checkbox" data-action="step-done" data-k="${key}:${i}" ${done ? 'checked' : ''} aria-label="Krok ${i + 1}"><span>${txt}</span><span class="min">${min} min</span></li>`;
      }).join('')}</ol>
    </article>`;
}

// Fridge

function renderFridge() {
  const entries = Object.entries(state.fridge);
  const row = ([id, q]) => `
    <div class="fridge-row">
      <span>${INGREDIENTS[id].name}</span>
      <span class="qty"><input type="number" inputmode="decimal" min="0" step="any" value="${round2(q)}" data-action="fridge-qty" data-id="${id}" aria-label="Ilość: ${INGREDIENTS[id].name}"><span>${INGREDIENTS[id].unit}</span></span>
      <button class="icon-btn" data-action="fridge-del" data-id="${id}" aria-label="Usuń ${INGREDIENTS[id].name}">✕</button>
    </div>`;
  const frozen = entries.filter(([id]) => INGREDIENTS[id].cat === 'mrozonki');
  const shelves = Object.keys(CATEGORIES).filter((c) => c !== 'mrozonki')
    .map((c) => [c, entries.filter(([id]) => INGREDIENTS[id].cat === c)]).filter(([, list]) => list.length);
  return `
    <h1>Lodówka</h1>
    <p class="muted">Wpisz, co już masz. Nowy plan wykorzysta te produkty i nie każe ich kupować drugi raz.</p>
    <form id="fridge-form" class="card magnet">
      <label for="fridge-q" class="label">Dodaj produkt</label>
      <input class="input" id="fridge-q" name="q" type="text" autocomplete="off" autocapitalize="none" enterkeyhint="done"
        placeholder="np. jajka 6, mleko 1 l, ryż 500 g" aria-describedby="fridge-hint">
      <div id="fridge-suggest" class="suggest">${fridgeSuggestions('')}</div>
      <p id="fridge-hint" class="muted small" style="margin:8px 0 0">Ilość możesz pominąć: dodamy jedno opakowanie i poprawisz ją niżej. Odhaczone zakupy trafiają tu same, a ugotowane dania zabierają swoje składniki.</p>
    </form>
    <div class="fridge" aria-label="Zawartość lodówki">
      <section class="compartment freezer">
        <div class="label-strip"><span>Zamrażarka</span><span class="handle" aria-hidden="true"></span></div>
        ${frozen.length ? `<div class="shelf">${frozen.map(row).join('')}</div>` : '<div class="fridge-empty">Pusto</div>'}
      </section>
      <section class="compartment">
        <div class="label-strip"><span>Chłodziarka · ${entries.length - frozen.length} ${plural(entries.length - frozen.length, 'produkt', 'produkty', 'produktów')}</span><span class="handle" aria-hidden="true"></span></div>
        ${shelves.length ? shelves.map(([c, list]) => `<div class="shelf"><h3>${CATEGORIES[c]}</h3>${list.map(row).join('')}</div>`).join('')
          : '<div class="fridge-empty">Lodówka jest pusta. Dodaj pierwszy produkt powyżej albo odhacz zakupy na liście.</div>'}
      </section>
    </div>
    ${entries.length ? '<button class="btn ghost" data-action="fridge-clear">Wyczyść lodówkę</button>' : ''}`;
}

// "jajka 6", "mleko 1,5 l", "2 kg ziemniaków" → name + quantity in the product's unit.
function parseFridgeText(text) {
  const t = text.toLowerCase().replace(',', '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|dag|g|ml|l|szt\.?|sztuk\w*|op\.?|opak\w*|paczk\w*|puszk\w*)?/);
  const words = norm(t.replace(m ? m[0] : '', ' ')).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  return { words, n: m ? parseFloat(m[1]) : null, unit: m?.[2]?.replace('.', '') || '' };
}

function toProductQty(ing, n, unit) {
  const mass = ing.unit === 'g' || ing.unit === 'ml';
  if (n == null) return ing.pack;
  if (unit === 'kg' || unit === 'l') return mass ? n * 1000 : n * 1000 / (ing.gPerSzt || 1000);
  if (unit === 'dag') return mass ? n * 10 : n * 10 / (ing.gPerSzt || 100);
  if (unit === 'g' || unit === 'ml') return mass ? n : n / (ing.gPerSzt || 100);
  if (/^(op|opak|paczk|puszk)/.test(unit)) return n * ing.pack;
  if (/^szt/.test(unit)) return mass ? n * (ing.gPerSzt || ing.pack) : n;
  // No unit: pieces for per-piece products, small numbers are packages, large ones are grams.
  if (!mass) return n;
  return n <= 10 ? n * ing.pack : n;
}

function fridgeMatches(text) {
  const { words, n, unit } = parseFridgeText(text);
  if (!words.length) return [];
  // Inflection: "jajek" → jaj…, "ziemniaków" → ziemnia…, so we compare word prefixes.
  const stems = words.map((w) => w.slice(0, Math.max(3, w.length - 2)));
  return Object.entries(INGREDIENTS)
    .filter(([id]) => id !== 'przyprawy' && id !== 'bulion')
    .map(([id, ing]) => {
      const nameWords = norm(ing.name).split(/[^a-z0-9]+/).filter(Boolean);
      // Exact word 3 pts, word prefix 2 pts, same stem 1 pt; the first word of the name weighs more.
      let score = 0;
      words.forEach((w, i) => {
        const best = Math.max(0, ...nameWords.map((nw, j) => {
          const pts = nw === w ? 3 : nw.startsWith(w) ? 2 : nw.startsWith(stems[i]) ? 1 : 0;
          return pts && j === 0 ? pts + 0.5 : pts;
        }));
        score += best;
      });
      return { id, ing, score, hits: score > 0, qty: toProductQty(ing, n, unit) };
    })
    .filter((x) => x.hits)
    .sort((a, b) => b.score - a.score || a.ing.name.length - b.ing.name.length)
    .slice(0, 6);
}

function fridgeSuggestions(text) {
  const list = fridgeMatches(text);
  if (!text.trim()) return '';
  if (!list.length) return '<p class="muted small" style="margin:8px 0 0">Nie znamy takiego produktu. Spróbuj innej nazwy, np. „ser”, „kurczak”, „pomidory”.</p>';
  return list.map((x) => `<button type="button" class="suggest-item" data-action="fridge-add" data-id="${x.id}" data-q="${round2(x.qty)}">
    <span>${x.ing.name}</span><span class="muted">+ ${fmtQty(x.qty, x.ing.unit)}</span></button>`).join('');
}

function addToFridge(id, q) {
  state.fridge[id] = round2((state.fridge[id] || 0) + q);
  save();
  route();
  toast(`Dodano: ${INGREDIENTS[id].name}, ${fmtQty(q, INGREDIENTS[id].unit)}`);
  const input = document.getElementById('fridge-q');
  if (input) input.focus();
}

// Recipes

function renderRecipes() {
  const chip = (action, cur, v, label) => `<button class="chip" data-action="${action}" data-v="${v}" aria-pressed="${cur === v}">${label}</button>`;
  const f = state.recipeFilter;
  const src = state.recipeSource;
  return `
    <h1>Przepisy</h1>
    <input class="input" type="search" id="recipe-search" placeholder="Szukaj: gulasz, kurczak, naleśniki…" value="${state.recipeQuery.replace(/"/g, '&quot;')}" aria-label="Szukaj przepisu" style="margin-bottom:10px">
    ${LOADED_SITES.length ? `<div class="chips" style="margin-bottom:8px">${chip('rsource', src, 'all', 'Wszystkie')}${LOADED_SITES.map((k) => chip('rsource', src, k, SITES[k].label)).join('')}${chip('rsource', src, 'own', 'Wbudowane')}</div>` : ''}
    <div class="chips" style="margin-bottom:8px">${priceChips('rprice', state.recipePrice)}</div>
    ${f === 'sniadanie' ? `<div class="chips" style="margin-bottom:8px">${tasteChips('rtaste', state.recipeTaste)}</div>` : ''}
    <div class="chips" style="margin-bottom:14px">${chip('rfilter', f, 'obiad', 'Obiady')}${chip('rfilter', f, 'sniadanie', 'Śniadania')}${chip('rfilter', f, 'wege', 'Wege')}${chip('rfilter', f, 'wegan', 'Wegańskie')}${chip('rfilter', f, 'bezgl', 'Bez glutenu')}${chip('rfilter', f, 'fav', '♥ Ulubione')}</div>
    <div id="recipe-list">${recipeList()}</div>`;
}


function recipeList() {
  const f = state.recipeFilter;
  const src = state.recipeSource;
  const q = norm(state.recipeQuery.trim());
  const stems = avoidStems(state.settings.avoid);
  const pr = state.recipePrice || 'any';
  const all = ALL_RECIPES.filter((r) => (f === 'fav' ? state.likes[r.id] : r.type === f || r.tags.includes(f)) && (src === 'all' || siteOf(r) === src) && (pr === 'any' || priceTier(r, state.settings) === pr) && (f !== 'sniadanie' || !state.recipeTaste || state.recipeTaste === 'any' || taste(r) === state.recipeTaste));
  const base = all.filter((r) => !containsAvoided(r, stems) && fitsEquipment(r, state.settings));
  const hidden = all.length - base.length;
  // Matches in the dish name first, then dishes with that ingredient.
  const list = !q ? base : [
    ...base.filter((r) => norm(r.name).includes(q)),
    ...base.filter((r) => !norm(r.name).includes(q) && Object.keys(r.ing).some((id) => norm(INGREDIENTS[id].name).includes(q))),
  ];
  const shown = list.slice(0, state.recipeLimit);
  return `
    <p class="muted small">${list.length} ${plural(list.length, 'przepis', 'przepisy', 'przepisów')}${hidden ? ` · ukryto ${hidden} (produkty, których nie jesz${state.settings.oven === false ? ', albo potrzebny piekarnik' : ''})` : ''}</p>
    ${shown.map((r) => `
      <button class="option" data-action="recipe" data-id="${r.id}">
        <span class="emoji">${r.emoji}</span>
        <span><strong>${state.likes[r.id] ? '♥ ' : ''}${r.name}</strong><br><span class="muted small">ok. ${fmtZl(costPerPortion(r, state.settings))}/porcja ${pricePill(r, state.settings)} ${tastePill(r)} · ${kcalTxt(nutrition(r))} · ${minTxt(recipeTime(r))}${siteTag(r)}</span></span>
        <span></span>
      </button>`).join('')}
    ${list.length > shown.length ? `<button class="btn block" data-action="more">Pokaż więcej (${list.length - shown.length})</button>` : ''}`;
}

// Quick & healthy

function renderQuick() {
  const s = state.settings;
  const f = state.quickType || 'obiad';
  const mode = state.quickMode || 'all';
  const stems = avoidStems(s.avoid);
  const list = ALL_RECIPES
    .filter((r) => r.type === f && isQuickHealthy(r) && fitsEquipment(r, s) && !containsAvoided(r, stems))
    .filter((r) => mode === 'all' || (mode === 'af' ? r.af : r.nocook))
    .filter((r) => !state.quickPrice || state.quickPrice === 'any' || priceTier(r, s) === state.quickPrice)
    .filter((r) => f !== 'sniadanie' || !state.quickTaste || state.quickTaste === 'any' || taste(r) === state.quickTaste)
    .map((r) => ({ r, h: healthInfo(r) }))
    .sort((a, b) => b.h.score - a.h.score);
  const shown = list.slice(0, state.quickLimit || 30);
  const chip = (action, cur, v, label) => `<button class="chip" data-action="${action}" data-v="${v}" aria-pressed="${cur === v}">${label}</button>`;
  return `
    <h1>Szybkie i zdrowe</h1>
    <p class="muted">Obiady do 25 minut, śniadania do 15. Najwyżej 7 produktów do kupienia, sporo białka, warzywa, bez smażenia w głębokim tłuszczu.</p>
    <div class="chips" style="margin-bottom:8px">${chip('qtype', f, 'obiad', 'Obiady')}${chip('qtype', f, 'sniadanie', 'Śniadania')}</div>
    <div class="chips" style="margin-bottom:8px">${chip('qmode', mode, 'all', 'Wszystkie')}${chip('qmode', mode, 'af', 'Air fryer')}${chip('qmode', mode, 'nocook', 'Bez gotowania')}</div>
    <div class="chips" style="margin-bottom:${f === 'sniadanie' ? 8 : 12}px">${priceChips('qprice', state.quickPrice)}</div>
    ${f === 'sniadanie' ? `<div class="chips" style="margin-bottom:12px">${tasteChips('qtaste', state.quickTaste)}</div>` : ''}
    <p class="muted small">${list.length} ${plural(list.length, 'przepis', 'przepisy', 'przepisów')}${s.avoid?.length ? ` · bez: ${s.avoid.join(', ')}` : ''}${s.oven === false ? ' · bez piekarnika' : ''}</p>
    ${shown.map(({ r, h }) => `
      <article class="card dish">
        <div class="emoji">${r.emoji}</div>
        <div style="min-width:0">
          <h3>${r.name}</h3>
          <div class="meta">${minTxt(recipeTime(r))} · ${ingCount(r)} ${plural(ingCount(r), 'produkt', 'produkty', 'produktów')} · ${h.protein} g białka · ${h.kcal} kcal · ok. ${fmtZl(costPerPortion(r, s))} ${pricePill(r, s)} ${tastePill(r)}${siteTag(r)}</div>
          ${equipmentPill(r, s) ? `<div class="row" style="margin-top:6px">${equipmentPill(r, s)}</div>` : ''}
          <div class="row">
            ${r.source ? sourceBtn(r, 'btn small') : `<button class="btn small" data-action="recipe" data-id="${r.id}">Przepis</button>`}
            ${r.source ? `<button class="btn small ghost" data-action="recipe" data-id="${r.id}">Składniki</button>` : ''}
            ${rateButtons(r)}
          </div>
        </div>
      </article>`).join('')}
    ${list.length > shown.length ? `<button class="btn block" data-action="qmore">Pokaż więcej (${list.length - shown.length})</button>` : ''}
    ${!list.length ? '<div class="card soft muted">Nic nie pasuje do tych filtrów. Zmień „Wszystkie / Air fryer / Bez gotowania” albo listę „Czego nie jesz” w ustawieniach planu.</div>' : ''}
    <p class="muted small" style="margin-top:12px">Chcesz cały plan z takich dań? W ustawieniach planu wybierz „Ultra szybko i zdrowo”.</p>`;
}

function recipeBody(r) {
  const n = nutrition(r);
  return `
    <div class="row" style="margin-bottom:10px">${rateButtons(r, false)}</div>
    ${r.source ? `<p>${sourceBtn(r, 'btn primary')}</p>` : ''}
    ${r.desc ? `<p>${r.desc}</p>` : ''}
    <div class="row" style="margin-bottom:10px">
      <span class="pill accent">${kcalTxt(n)} · ${n.protein} g białka / porcja</span>
      <span class="pill">ok. ${fmtZl(costPerPortion(r, state.settings))}/porcja</span>
      ${pricePill(r, state.settings)}
      ${tastePill(r)}
      <span class="pill">${daysTxt(r.keeps)} w lodówce${r.freezes ? ', mrozi się' : ''}</span>
      ${equipmentPill(r, state.settings)}
      ${r.tags.map((t) => `<span class="pill">${TAG_LABELS[t]}</span>`).join('')}
    </div>
    <strong class="small">${r.source ? 'Zakupy' : 'Składniki'} na ${portionsTxt(r.serves)}</strong>
    <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) => `<li>${INGREDIENTS[buyId(id, state.settings)].name}${INGREDIENTS[id].unit === 'szczypta' ? '' : ` — ${fmtQty(q, INGREDIENTS[id].unit)}`}</li>`).join('')}</ul>
    ${r.source ? '<p class="muted small" style="margin-top:8px">Ilości przeliczone na produkty ze sklepu, do listy zakupów. Przyprawy, olej i sposób przygotowania znajdziesz w oryginale.</p>' : ''}
    ${r.steps ? `<ol style="padding-left:20px;margin:10px 0 0">${r.steps.map(([t, m]) => `<li style="margin-bottom:6px">${t} <span class="muted small">(${m} min)</span></li>`).join('')}</ol>` : ''}`;
}

const ICONS = {
  basket: '<path d="M4 9h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z"/><path d="M8.5 9 12 4l3.5 5"/>',
  pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 7c0-1 1-1.5 1-2.5M14 7c0-1 1-1.5 1-2.5"/>',
};
function emptyState(icon, text) {
  return `<div class="empty"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg><p class="muted">${text}</p><a class="btn primary" href="#plan">Ułóż plan</a></div>`;
}

// ── Sheets ──

function openSheet(html) {
  sheet.innerHTML = `<div class="inner">${html}</div>`;
  sheet.showModal();
}

function openSwap(i) {
  const p = state.plan;
  const current = recipeById[p.meals[i].recipeId];
  const base = shopping().total;
  const opts = swapOptions(p, i, p.fridge);
  openSheet(`
    <div class="row spread"><h2 style="margin:0">Zamień: ${current.name}</h2><button class="icon-btn" data-action="close" aria-label="Zamknij">✕</button></div>
    <p class="muted small">Cena pokazuje, jak zmieni się koszt całych zakupów.</p>
    ${opts.length ? opts.slice(0, 40).map((o) => {
      const d = round2(o.cost - base);
      return `<button class="option" data-action="do-swap" data-i="${i}" data-id="${o.recipe.id}">
        <span class="emoji">${o.recipe.emoji}</span>
        <span><strong>${o.recipe.name}</strong><br><span class="muted small">${o.recipe.source ? `${SITES[siteOf(o.recipe)].label} · ` : ''}${kcalTxt(nutrition(o.recipe))} · ${minTxt(recipeTime(o.recipe))} · ok. ${fmtZl(costPerPortion(o.recipe, p.settings))}/porcja</span></span>
        <span class="diff ${d < 0 ? 'cheaper' : d > 0 ? 'pricier' : ''}">${d === 0 ? '±0 zł' : `${d > 0 ? '+' : '−'}${fmtZl(Math.abs(d))}`}</span>
      </button>`;
    }).join('') : '<p>Brak innych przepisów pasujących do Twojej diety.</p>'}`);
}

function openRecipe(id) {
  const r = recipeById[id];
  openSheet(`
    <div class="row spread"><h2 style="margin:0">${r.emoji} ${r.name}</h2><button class="icon-btn" data-action="close" aria-label="Zamknij">✕</button></div>
    ${recipeBody(r)}`);
}

// Dish batches from the plan that aren't marked as cooked yet.
function uncookedBatches() {
  const out = [];
  state.plan.meals.forEach((m, mi) => m.batches.forEach((b, bi) => {
    if (!state.done[`${m.recipeId}#${bi}:all`]) out.push({ m, mi, b, bi });
  }));
  return out;
}

function openNewPlan() {
  const left = uncookedBatches();
  if (!left.length || !Object.keys(state.bought).length) return startNewPlan(false);
  openSheet(`
    <h2 style="margin-top:0">Czy obecny plan jest już ugotowany?</h2>
    <p class="muted">Nieoznaczone dania: ${[...new Set(left.map((x) => recipeById[x.m.recipeId].name))].join(', ')}.</p>
    <p class="muted small">Jeśli tak, zdejmiemy ich składniki z lodówki, żeby nowy plan nie liczył na produkty, których już nie masz.</p>
    <div class="stack">
      <button class="btn primary block" data-action="new-plan-go" data-keep="1">Tak, zdejmij ich składniki z lodówki</button>
      <button class="btn block" data-action="new-plan-go" data-keep="0">Nie, zostaw lodówkę bez zmian</button>
    </div>`);
}

function startNewPlan(consumeRest) {
  archivePlan();
  if (consumeRest) for (const x of uncookedBatches()) consumeBatch(x.m, x.b, `${x.m.recipeId}#${x.bi}`);
  state.plan = null;
  state.checked = {};
  state.done = {};
  state.bought = {};
  state.consumed = {};
  save();
  if (sheet.open) sheet.close();
  location.hash = '#plan';
  route();
}

// Checking off a purchase: the bought amount (whole packages) goes into the fridge.
function markBought(id, on) {
  const it = shopping().items.find((x) => x.id === id);
  if (!it) return;
  if (on) {
    const amt = round2(it.packs * it.pack);
    state.bought[id] = amt;
    state.fridge[id] = round2((state.fridge[id] || 0) + amt);
    toast(`Do lodówki: ${it.name}, ${fmtQty(amt, it.unit)}`);
  } else {
    const left = round2((state.fridge[id] || 0) - (state.bought[id] || 0));
    if (left > 0) state.fridge[id] = left; else delete state.fridge[id];
    delete state.bought[id];
  }
}

// A cooked dish takes its ingredients out of the fridge (as much as is there).
function consumeBatch(m, b, key) {
  const r = recipeById[m.recipeId];
  const f = (b.portions * (m.factor || 1)) / r.serves;
  const taken = {};
  for (const [id, q] of Object.entries(r.ing)) {
    if (INGREDIENTS[id].pantry) continue;
    const bid = buyId(id, state.plan.settings);
    const take = Math.min(state.fridge[bid] || 0, scaled(id, q, f));
    if (take <= 0) continue;
    taken[bid] = round2(take);
    const left = round2(state.fridge[bid] - take);
    if (left > 0.001) state.fridge[bid] = left; else delete state.fridge[bid];
  }
  state.consumed[key] = taken;
  state.done[`${key}:all`] = true;
}

function unconsumeBatch(key) {
  for (const [id, q] of Object.entries(state.consumed[key] || {})) state.fridge[id] = round2((state.fridge[id] || 0) + q);
  delete state.consumed[key];
  delete state.done[`${key}:all`];
}

// ── Events ──

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (['check', 'step-done', 'fridge-qty', 'cooked'].includes(a)) return; // handled by "change"
  const s = state.settings;
  switch (a) {
    case 'preset': readForm(); s.budget = +el.dataset.v; break;
    case 'step': {
      readForm();
      const k = el.dataset.k;
      const lim = k === 'days' ? [1, 14] : [1, 8];
      s[k] = Math.min(lim[1], Math.max(lim[0], s[k] + +el.dataset.d));
      break;
    }
    case 'diet': readForm(); s.diet = el.dataset.v; break;
    case 'source': readForm(); s.source = el.dataset.v; break;
    case 'effort': readForm(); s.effort = el.dataset.v; break;
    case 'price': readForm(); s.price = el.dataset.v; break;
    case 'kcal': readForm(); s.kcal = Number(el.dataset.v); break;
    case 'taste': readForm(); s[el.dataset.k] = el.dataset.v; break;
    case 'qtaste': state.quickTaste = el.dataset.v; state.quickLimit = 30; break;
    case 'rtaste': state.recipeTaste = el.dataset.v; state.recipeLimit = 40; break;
    case 'like': case 'dislike': {
      const id = el.dataset.id;
      const [mine, other] = a === 'like' ? [state.likes, state.dislikes] : [state.dislikes, state.likes];
      if (mine[id]) delete mine[id];
      else {
        mine[id] = Date.now();
        delete other[id];
        toast(a === 'like' ? 'Dodano do ulubionych. Kolejne plany częściej podpowiedzą podobne dania.' : 'To danie nie wróci w planach, a podobne będą rzadsze.');
      }
      save();
      if (sheet.open) openRecipe(id);
      break;
    }
    case 'show-favs': state.recipeFilter = 'fav'; state.recipeLimit = 40; location.hash = '#przepisy'; return;
    case 'clear-taste': readForm(); state.likes = {}; state.dislikes = {}; toast('Oceny zapomniane'); break;
    case 'clear-history': readForm(); state.history = []; toast('Historia wyczyszczona'); break;
    case 'rprice': state.recipePrice = el.dataset.v; state.recipeLimit = 40; break;
    case 'qprice': state.quickPrice = el.dataset.v; state.quickLimit = 30; break;
    case 'avoid-add': readForm(); break;
    case 'avoid-del': readForm(); s.avoid = (s.avoid || []).filter((t) => t !== el.dataset.v); break;
    case 'rsource': state.recipeSource = el.dataset.v; state.recipeLimit = 40; break;
    case 'more': state.recipeLimit += 40; break;
    case 'reroll': makePlan(); toast('Wylosowano nowe dania'); break;
    case 'edit': state.settings = { ...state.plan.settings }; state.editing = true; break;
    case 'cancel-edit': state.editing = false; break;
    case 'new-plan': return openNewPlan();
    case 'new-plan-go': return startNewPlan(el.dataset.keep === '1');
    case 'swap': return openSwap(+el.dataset.i);
    case 'do-swap': {
      const o = swapOptions(state.plan, +el.dataset.i, state.plan.fridge).find((x) => x.recipe.id === el.dataset.id);
      state.plan.meals = o.meals;
      state.done = {};
      state.consumed = {};
      save();
      sheet.close();
      toast(`Zamieniono na: ${o.recipe.name}`);
      break;
    }
    case 'recipe': return openRecipe(el.dataset.id);
    case 'close': return sheet.close();
    case 'copy-list':
      // On a phone this opens the share menu (e.g. to notes or a messenger).
      if (navigator.share) {
        try { await navigator.share({ title: 'Lista zakupów', text: listAsText() }); return; } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }
      try { await navigator.clipboard.writeText(listAsText()); toast('Skopiowano listę'); }
      catch { toast('Nie udało się skopiować'); }
      return;
    case 'fridge-add': return addToFridge(el.dataset.id, parseFloat(el.dataset.q));
    case 'fridge-del': delete state.fridge[el.dataset.id]; save(); break;
    case 'fridge-clear': state.fridge = {}; save(); break;
    case 'qtype': state.quickType = el.dataset.v; state.quickLimit = 30; break;
    case 'qmode': state.quickMode = el.dataset.v; state.quickLimit = 30; break;
    case 'qmore': state.quickLimit = (state.quickLimit || 30) + 30; break;
    case 'rfilter': state.recipeFilter = el.dataset.v; state.recipeLimit = 40; break;
    default: return;
  }
  save();
  route();
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'check') {
    if (el.checked) state.checked[el.dataset.id] = true; else delete state.checked[el.dataset.id];
    markBought(el.dataset.id, el.checked);
  } else if (a === 'cooked') {
    const m = state.plan.meals[+el.dataset.m];
    if (el.checked) {
      consumeBatch(m, m.batches[+el.dataset.b], el.dataset.k);
      toast(`Zdjęto z lodówki składniki: ${recipeById[m.recipeId].name}`);
    } else unconsumeBatch(el.dataset.k);
  } else if (a === 'step-done') {
    if (el.checked) state.done[el.dataset.k] = true; else delete state.done[el.dataset.k];
  } else if (a === 'fridge-qty') {
    const q = parseFloat(el.value);
    if (q > 0) state.fridge[el.dataset.id] = q; else delete state.fridge[el.dataset.id];
  } else return;
  save();
  route();
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'plan-form') {
    readForm();
    makePlan();
    window.scrollTo(0, 0);
  } else if (e.target.id === 'fridge-form') {
    const first = fridgeMatches(e.target.q.value)[0];
    if (first) return addToFridge(first.id, first.qty);
    return;
  }
  route();
});

// Enter in the "Czego nie jesz?" (What don't you eat?) field adds a product instead of building the plan right away.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.id !== 'avoid-q') return;
  e.preventDefault();
  readForm();
  save();
  route();
  document.getElementById('avoid-q')?.focus();
});

let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'fridge-q') {
    document.getElementById('fridge-suggest').innerHTML = fridgeSuggestions(e.target.value);
    return;
  }
  if (e.target.id !== 'recipe-search') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.recipeQuery = e.target.value;
    state.recipeLimit = 40;
    document.getElementById('recipe-list').innerHTML = recipeList();
  }, 150);
});

sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
route();
connectRemote();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
