import { INGREDIENTS, CATEGORIES, TAG_LABELS } from './data.js';
import {
  ALL_RECIPES, siteOf, SITES, EFFORT, norm, buyId, isQuickHealthy, healthInfo, ingCount, fitsEquipment, avoidStems, containsAvoided, recipeTime, recipeById, scaled, nutrition, dayNutrition, generatePlan, MEAL_SHARE, shoppingList, swapOptions, costPerPortion, cookDays,
  fmtQty, fmtZl, round2,
} from './planner.js';

// ── Stan (zapisywany w localStorage) ──
const KEY = 'pudelko-v1';
// Stały dzienny cel kalorii (ustawienie użytkowniczki), niezależnie od wcześniej zapisanych ustawień.
const KCAL = 1500;
const DEFAULT_SETTINGS = { budget: 50, days: 5, people: 1, breakfasts: false, diet: 'all', glutenFree: false, source: 'all', kcal: 1500, avoid: ['papryka'], lactoseFree: true, effort: 'min', oven: false, airfryer: true };
const state = load();

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  return {
    settings: { ...DEFAULT_SETTINGS, ...saved.settings, kcal: KCAL },
    plan: saved.plan || null,
    fridge: saved.fridge || {},
    checked: saved.checked || {},
    done: saved.done || {},
    // Ile czego dodało do lodówki odhaczenie zakupu i ile zabrało oznaczenie dania jako ugotowane,
    // żeby odznaczenie mogło to cofnąć.
    bought: saved.bought || {},
    consumed: saved.consumed || {},
    recipeFilter: 'obiad',
    recipeSource: 'all',
    recipeQuery: '',
    recipeLimit: 40,
  };
}
function save() {
  const { recipeFilter, recipeSource, recipeQuery, recipeLimit, editing, quickType, quickMode, quickLimit, ...rest } = state;
  try { localStorage.setItem(KEY, JSON.stringify(rest)); } catch {}
}

// ── Daty ──
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
  const sessions = cookDays(p.meals);

  return `
    <section class="card">
      <div class="row spread">
        <div>
          <div class="muted small">Zakupy na ${daysTxt(s.days)} dla ${s.people} ${plural(s.people, 'osoby', 'osób', 'osób')}</div>
          <div class="budget-big">${fmtZl(list.total)}</div>
        </div>
        <span class="pill ${left >= 0 ? 'ok' : 'warn'}">${left >= 0 ? `zostaje ${fmtZl(left)}` : `brakuje ${fmtZl(-left)}`}</span>
      </div>
      <div class="bar ${left < 0 ? 'over' : ''}"><i style="width:${pct}%"></i></div>
      <div class="muted small">Budżet ${fmtZl(s.budget)} · ok. ${fmtZl(list.total / (s.days * s.people))} na osobę dziennie</div>
      ${prefsLine(s)}
      ${nutritionSummary(p)}
      ${left < 0 ? `<p class="notice" style="margin:12px 0 0">Nie udało się zmieścić w budżecie. To najtańszy plan, jaki da się ułożyć z tych przepisów. Spróbuj krótszego okresu albo wyłącz śniadania.</p>` : ''}
      <div class="row" style="margin-top:14px">
        <a class="btn primary" href="#zakupy">Lista zakupów</a>
        <a class="btn" href="#gotowanie">Gotowanie</a>
      </div>
    </section>

    <h2>Obiady</h2>
    ${dinners.map(([m, i]) => dishCard(m, i)).join('')}
    ${breakfasts.length ? `<h2>Śniadania</h2>${breakfasts.map(([m, i]) => dishCard(m, i)).join('')}` : ''}

    <h2>Dzień po dniu</h2>
    <p class="muted small">${sessions.length === 1 ? 'Gotujesz raz, na początku. Potem tylko odgrzewasz.' : `Gotujesz ${sessions.length} razy: ${sessions.map((d) => dayLong(d)).join(', ')}.`}</p>
    <div class="days">${Array.from({ length: s.days }, (_, d) => dayRow(d)).join('')}</div>

    <div class="row" style="margin:20px 0 8px">
      <button class="btn" data-action="reroll">Wylosuj inne dania</button>
      <button class="btn" data-action="edit">Zmień ustawienia</button>
      <button class="btn ghost" data-action="new-plan">Nowy plan</button>
    </div>`;
}

function prefsLine(s) {
  const bits = [];
  if (s.avoid?.length) bits.push(`bez: ${s.avoid.join(', ')}`);
  if (s.lactoseFree) bits.push('bez laktozy');
  if (s.effort && s.effort !== 'any') bits.push(s.effort === 'min' ? 'szybkie dania, mało gotowania' : 'dania do 75 min');
  return bits.length ? `<div class="row" style="margin-top:8px">${bits.map((b) => `<span class="pill">${b}</span>`).join('')}</div>` : '';
}

function nutritionSummary(p) {
  const days = Array.from({ length: p.settings.days }, (_, d) => dayNutrition(p.meals, d));
  const avg = (k) => Math.round(days.reduce((a, n) => a + n[k], 0) / days.length);
  const what = p.meals.some((m) => m.type === 'sniadanie') ? 'śniadanie + obiad' : 'sam obiad';
  const share = MEAL_SHARE.obiad + (p.meals.some((m) => m.type === 'sniadanie') ? MEAL_SHARE.sniadanie : 0);
  return `
    <div class="nutri">
      <div><strong>${avg('kcal').toLocaleString('pl-PL')}</strong><span>kcal dziennie</span></div>
      <div><strong>${avg('protein')} g</strong><span>białka dziennie</span></div>
      <div><strong>${(avg('kcal') * p.settings.days).toLocaleString('pl-PL')}</strong><span>kcal w planie</span></div>
    </div>
    <div class="muted small">Na osobę, ${what}.${p.settings.kcal ? ` Cel na te posiłki: ok. ${Math.round(p.settings.kcal * share).toLocaleString('pl-PL')} kcal (z ${p.settings.kcal.toLocaleString('pl-PL')} na cały dzień).` : ''} Kolacje i przekąski dolicz osobno.</div>`;
}

const mealNutrition = (m) => { const n = nutrition(recipeById[m.recipeId]); const f = m.factor || 1; return { kcal: Math.round(n.kcal * f), protein: Math.round(n.protein * f) }; };
const fmtFactor = (f) => String(f).replace('.', ',');
const portionSize = (m) => (m.factor && m.factor !== 1 ? ` po ×${fmtFactor(m.factor)}` : '');

// Oznaczenie sprzętu. Danie z piekarnika robione w air fryerze dostaje wskazówkę, jak przeliczyć.
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
    <article class="card dish">
      <div class="emoji">${r.emoji}</div>
      <div>
        <h3>${r.name}</h3>
        <div class="meta">${portionsTxt(m.portions)}${portionSize(m)} · ${daysRange(m.days)} · ${kcalTxt(mealNutrition(m))} · ok. ${fmtZl(costPerPortion(r, state.plan.settings) * (m.factor || 1))}/porcja</div>
        ${tags.length ? `<div class="row" style="margin-top:6px">${tags.join('')}</div>` : ''}
        <div class="row">
          <button class="btn small" data-action="swap" data-i="${i}">Zamień</button>
          ${r.source ? aniaBtn(r, 'btn small ghost') : `<button class="btn small ghost" data-action="recipe" data-id="${r.id}">Przepis</button>`}
          ${r.source ? `<button class="btn small ghost" data-action="recipe" data-id="${r.id}">Składniki</button>` : ''}
        </div>
      </div>
    </article>`;
}

function dayRow(d) {
  const items = [];
  for (const type of ['sniadanie', 'obiad']) {
    for (const m of state.plan.meals) {
      if (m.type !== type || !m.days.includes(d)) continue;
      const r = recipeById[m.recipeId];
      const batch = m.batches.find((b) => b.days.includes(d));
      let note = '';
      if (batch.cookDay === d) note = d === 0 ? '' : ' <span class="pill accent">ugotuj dziś</span>';
      if (batch.freeze && d + 1 > r.keeps) note = ' <span class="pill">z zamrażarki</span>';
      items.push(`<li>${type === 'sniadanie' ? '☀️' : '🍽️'} ${r.name}${note}</li>`);
    }
  }
  const n = dayNutrition(state.plan.meals, d);
  return `<div class="day"><div class="d">${dayShort(d)}<small>${dayLabel(d)}</small><small class="kcal">${n.kcal} kcal</small></div><ul>${items.join('')}</ul></div>`;
}

function renderForm() {
  const s = state.settings;
  const effortChip = (v, label) => `<button type="button" class="chip" data-action="effort" data-v="${v}" aria-pressed="${(s.effort || 'any') === v}">${label}</button>`;
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
        <div class="chips presets">${[30, 50, 80, 120, 200].map((v) => `<button type="button" class="chip" data-action="preset" data-v="${v}">${v} zł</button>`).join('')}</div>
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
        <div class="label">Kalorie: ${KCAL.toLocaleString('pl-PL')} kcal dziennie</div>
        <p class="muted small" style="margin:6px 0 0">Porcje dobieramy tak, żeby obiad miał ok. ${Math.round(KCAL * 0.4)} kcal, a śniadanie ok. ${Math.round(KCAL * 0.25)}. Zostaje ok. ${Math.round(KCAL * 0.35)} kcal na kolację i przekąski.</p>
      </div>
      <div class="field">
        <div class="label">Skąd przepisy?</div>
        <div class="chips">${srcChip('all', 'Wszystkie')}${srcChip('ania', 'Ania Gotuje')}${srcChip('lidl', 'Kuchnia Lidla')}${srcChip('ks', 'Kwestia Smaku')}${srcChip('own', 'Wbudowane')}</div>
      </div>
      <div class="field">
        <label class="switch"><span>Bez glutenu</span><input type="checkbox" name="glutenFree" ${s.glutenFree ? 'checked' : ''}></label>
        <label class="switch"><span>Planuj też śniadania</span><input type="checkbox" name="breakfasts" ${s.breakfasts ? 'checked' : ''}></label>
      </div>
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

function readForm() {
  const f = document.getElementById('plan-form');
  if (!f) return;
  const budget = parseFloat(f.budget.value.replace(',', '.'));
  if (budget > 0) state.settings.budget = budget;
  state.settings.glutenFree = f.glutenFree.checked;
  state.settings.breakfasts = f.breakfasts.checked;
  state.settings.lactoseFree = f.lactoseFree.checked;
  state.settings.oven = f.oven.checked;
  state.settings.airfryer = f.airfryer.checked;
  addAvoid(f.querySelector('#avoid-q')?.value);
}

function makePlan() {
  const s = { ...state.settings };
  const res = generatePlan(s, state.fridge);
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

// Zakupy

function renderShopping() {
  if (!state.plan) return emptyState('🛒', 'Najpierw ułóż plan, a lista zakupów zrobi się sama.');
  const list = shopping();
  const groups = {};
  for (const it of list.items) (groups[it.cat] ||= []).push(it);
  const toBuy = list.items.filter((it) => it.packs > 0);
  const remaining = toBuy.filter((it) => !state.checked[it.id]).reduce((a, it) => a + it.cost, 0);
  const fromFridge = list.items.filter((it) => it.packs === 0);

  return `
    <h1>Lista zakupów</h1>
    <div class="card">
      <div class="sum"><span>Razem</span><span>${fmtZl(list.total)}</span></div>
      <div class="muted small">Zostało do kupienia: ${fmtZl(remaining)} · ${toBuy.filter((it) => !state.checked[it.id]).length} z ${toBuy.length} pozycji</div>
      <div class="muted small" style="margin-top:4px">Odhaczone produkty trafiają do <a href="#lodowka">lodówki</a>.</div>
      <div class="row" style="margin-top:12px"><button class="btn small" data-action="copy-list">Wyślij / skopiuj listę</button></div>
    </div>
    ${Object.keys(CATEGORIES).filter((c) => groups[c]?.some((it) => it.packs > 0)).map((c) => `
      <section class="shop-group">
        <h2>${CATEGORIES[c]}</h2>
        <div class="list">${groups[c].filter((it) => it.packs > 0).map(shopItem).join('')}</div>
      </section>`).join('')}
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
      <div><div class="name">${it.name}</div><div class="sub">${packTxt} · ${sub.join(' · ')}</div></div>
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

// Gotowanie

function renderCooking() {
  if (!state.plan) return emptyState('🍳', 'Najpierw ułóż plan, a tu pojawi się rozpiska gotowania.');
  const p = state.plan;
  return `
    <h1>Gotowanie</h1>
    <p class="muted">Zacznij od dań, które gotują się najdłużej. Ryż i kasze możesz ugotować w jednym garnku dla kilku dań.</p>
    ${cookDays(p.meals).map((day) => {
      const tasks = [];
      p.meals.forEach((m) => m.batches.forEach((b, bi) => { if (b.cookDay === day) tasks.push({ m, b, bi }); }));
      const times = tasks.map(({ m }) => recipeTime(recipeById[m.recipeId])).sort((a, b) => b - a);
      // Część kroków robisz równolegle, więc liczymy najdłuższe danie + połowę pozostałych.
      const est = Math.round((times[0] + times.slice(1).reduce((a, t) => a + t, 0) * 0.5) / 5) * 5;
      tasks.sort((a, b) => totalTime(b.m) - totalTime(a.m));
      return `
        <h2>${day === 0 ? 'Gotowanie na start' : 'Kolejne gotowanie'} · ${dayLong(day)}, ${dayLabel(day)}</h2>
        <p class="muted small">${tasks.length} ${plural(tasks.length, 'danie', 'dania', 'dań')} · ok. ${minTxt(est)}</p>
        ${tasks.map(cookCard).join('')}`;
    }).join('')}`;
}

const totalTime = (m) => recipeTime(recipeById[m.recipeId]);
const kcalTxt = (n) => `${n.kcal.toLocaleString('pl-PL')} kcal`;
const aniaBtn = (r, cls = 'btn small') => `<a class="${cls}" href="${r.source}" target="_blank" rel="noopener">${SITES[siteOf(r)].link} ↗</a>`;
const siteTag = (r) => (r.source ? ` · ${SITES[siteOf(r)].label}` : '');

function cookCard({ m, b, bi }) {
  const r = recipeById[m.recipeId];
  const f = (b.portions * (m.factor || 1)) / r.serves;
  const key = `${m.recipeId}#${bi}`;
  const steps = r.steps || [];
  const doneCount = steps.filter((_, i) => state.done[`${key}:${i}`]).length;
  const cooked = state.done[`${key}:all`];
  return `
    <article class="card">
      <div class="dish">
        <div class="emoji">${r.emoji}</div>
        <div>
          <h3>${r.name}</h3>
          <div class="meta">${portionsTxt(b.portions)}${portionSize(m)} · na ${daysRange(b.days)} · ${steps.length ? `${doneCount}/${steps.length} kroków` : `ok. ${minTxt(recipeTime(r))}`}</div>
          ${b.freeze ? `<div class="meta">❄️ ${portionsTxt(b.days.filter((d) => d + 1 > r.keeps).length * state.plan.settings.people)} od razu do zamrażarki</div>` : ''}
        </div>
      </div>
      <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) => `<li>${INGREDIENTS[buyId(id, state.plan.settings)].name}${INGREDIENTS[id].unit === 'szczypta' ? '' : ` — ${fmtQty(scaled(id, q, f), INGREDIENTS[id].unit)}`}</li>`).join('')}</ul>
      <div class="row" style="margin-top:10px">${r.source ? aniaBtn(r) : ''}
        <label class="row small" style="gap:6px"><input type="checkbox" data-action="cooked" data-k="${key}" data-m="${state.plan.meals.indexOf(m)}" data-b="${bi}" ${cooked ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--ok)"> Ugotowane (zdejmij składniki z lodówki)</label></div>
      <ol class="steps">${steps.map(([txt, min], i) => {
        const done = state.done[`${key}:${i}`];
        return `<li class="${done ? 'done' : ''}"><input type="checkbox" data-action="step-done" data-k="${key}:${i}" ${done ? 'checked' : ''} aria-label="Krok ${i + 1}"><span>${txt}</span><span class="min">${min} min</span></li>`;
      }).join('')}</ol>
    </article>`;
}

// Lodówka

function renderFridge() {
  const entries = Object.entries(state.fridge);
  return `
    <h1>Lodówka</h1>
    <p class="muted">Wpisz, co już masz. Nowy plan wykorzysta te produkty i nie każe ich kupować drugi raz.</p>
    <p class="muted small">Produkty odhaczone na liście zakupów trafiają tu same. Gdy w Gotowaniu oznaczysz danie jako ugotowane, jego składniki znikną z lodówki.</p>
    <form id="fridge-form" class="card">
      <label for="fridge-q" class="label" style="display:block;font-weight:600;margin-bottom:6px">Dodaj produkt</label>
      <input class="input" id="fridge-q" name="q" type="text" autocomplete="off" autocapitalize="none" enterkeyhint="done"
        placeholder="np. jajka 6, mleko 1 l, ryż 500 g" aria-describedby="fridge-hint">
      <div id="fridge-suggest" class="suggest">${fridgeSuggestions('')}</div>
      <p id="fridge-hint" class="muted small" style="margin:8px 0 0">Ilość możesz pominąć: dodamy jedno opakowanie i poprawisz ją na liście.</p>
    </form>
    ${entries.length ? `<div class="list" style="margin-top:16px">${entries.map(([id, q]) => `
      <div class="fridge-row">
        <span>${INGREDIENTS[id].name}</span>
        <span class="qty"><input type="number" inputmode="decimal" min="0" step="any" value="${round2(q)}" data-action="fridge-qty" data-id="${id}" aria-label="Ilość: ${INGREDIENTS[id].name}"><span>${INGREDIENTS[id].unit}</span></span>
        <button class="icon-btn" data-action="fridge-del" data-id="${id}" aria-label="Usuń ${INGREDIENTS[id].name}">✕</button>
      </div>`).join('')}</div>` : '<div class="card soft muted" style="margin-top:16px">Lodówka jest pusta.</div>'}
    ${entries.length ? '<button class="btn ghost" data-action="fridge-clear">Wyczyść lodówkę</button>' : ''}`;
}

// „jajka 6”, „mleko 1,5 l”, „2 kg ziemniaków” → nazwa + ilość w jednostce produktu.
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
  // Bez jednostki: sztuki dla produktów na sztuki, małe liczby to opakowania, duże to gramy.
  if (!mass) return n;
  return n <= 10 ? n * ing.pack : n;
}

function fridgeMatches(text) {
  const { words, n, unit } = parseFridgeText(text);
  if (!words.length) return [];
  // Odmiana: „jajek” → jaj…, „ziemniaków” → ziemnia…, więc porównujemy początki słów.
  const stems = words.map((w) => w.slice(0, Math.max(3, w.length - 2)));
  return Object.entries(INGREDIENTS)
    .filter(([id]) => id !== 'przyprawy' && id !== 'bulion')
    .map(([id, ing]) => {
      const nameWords = norm(ing.name).split(/[^a-z0-9]+/).filter(Boolean);
      // Dokładne słowo 3 pkt, początek słowa 2 pkt, ten sam rdzeń 1 pkt; pierwsze słowo nazwy waży więcej.
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

// Przepisy

function renderRecipes() {
  const chip = (action, cur, v, label) => `<button class="chip" data-action="${action}" data-v="${v}" aria-pressed="${cur === v}">${label}</button>`;
  const f = state.recipeFilter;
  const src = state.recipeSource;
  return `
    <h1>Przepisy</h1>
    <input class="input" type="search" id="recipe-search" placeholder="Szukaj: gulasz, kurczak, naleśniki…" value="${state.recipeQuery.replace(/"/g, '&quot;')}" aria-label="Szukaj przepisu" style="margin-bottom:10px">
    <div class="chips" style="margin-bottom:8px">${chip('rsource', src, 'all', 'Wszystkie')}${chip('rsource', src, 'ania', 'Ania Gotuje')}${chip('rsource', src, 'lidl', 'Kuchnia Lidla')}${chip('rsource', src, 'ks', 'Kwestia Smaku')}${chip('rsource', src, 'own', 'Wbudowane')}</div>
    <div class="chips" style="margin-bottom:14px">${chip('rfilter', f, 'obiad', 'Obiady')}${chip('rfilter', f, 'sniadanie', 'Śniadania')}${chip('rfilter', f, 'wege', 'Wege')}${chip('rfilter', f, 'wegan', 'Wegańskie')}${chip('rfilter', f, 'bezgl', 'Bez glutenu')}</div>
    <div id="recipe-list">${recipeList()}</div>`;
}


function recipeList() {
  const f = state.recipeFilter;
  const src = state.recipeSource;
  const q = norm(state.recipeQuery.trim());
  const stems = avoidStems(state.settings.avoid);
  const all = ALL_RECIPES.filter((r) => (r.type === f || r.tags.includes(f)) && (src === 'all' || siteOf(r) === src));
  const base = all.filter((r) => !containsAvoided(r, stems) && fitsEquipment(r, state.settings));
  const hidden = all.length - base.length;
  // Najpierw trafienia w nazwie dania, potem dania z takim składnikiem.
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
        <span><strong>${r.name}</strong><br><span class="muted small">ok. ${fmtZl(costPerPortion(r, state.settings))}/porcja · ${kcalTxt(nutrition(r))} · ${minTxt(recipeTime(r))}${siteTag(r)}</span></span>
        <span></span>
      </button>`).join('')}
    ${list.length > shown.length ? `<button class="btn block" data-action="more">Pokaż więcej (${list.length - shown.length})</button>` : ''}`;
}

// Szybkie i zdrowe

function renderQuick() {
  const s = state.settings;
  const f = state.quickType || 'obiad';
  const mode = state.quickMode || 'all';
  const stems = avoidStems(s.avoid);
  const list = ALL_RECIPES
    .filter((r) => r.type === f && isQuickHealthy(r) && fitsEquipment(r, s) && !containsAvoided(r, stems))
    .filter((r) => mode === 'all' || (mode === 'af' ? r.af : r.nocook))
    .map((r) => ({ r, h: healthInfo(r) }))
    .sort((a, b) => b.h.score - a.h.score);
  const shown = list.slice(0, state.quickLimit || 30);
  const chip = (action, cur, v, label) => `<button class="chip" data-action="${action}" data-v="${v}" aria-pressed="${cur === v}">${label}</button>`;
  return `
    <h1>Szybkie i zdrowe</h1>
    <p class="muted">Obiady do 25 minut, śniadania do 15. Najwyżej 7 produktów do kupienia, sporo białka, warzywa, bez smażenia w głębokim tłuszczu.</p>
    <div class="chips" style="margin-bottom:8px">${chip('qtype', f, 'obiad', 'Obiady')}${chip('qtype', f, 'sniadanie', 'Śniadania')}</div>
    <div class="chips" style="margin-bottom:12px">${chip('qmode', mode, 'all', 'Wszystkie')}${chip('qmode', mode, 'af', 'Air fryer')}${chip('qmode', mode, 'nocook', 'Bez gotowania')}</div>
    <p class="muted small">${list.length} ${plural(list.length, 'przepis', 'przepisy', 'przepisów')}${s.avoid?.length ? ` · bez: ${s.avoid.join(', ')}` : ''}${s.oven === false ? ' · bez piekarnika' : ''}</p>
    ${shown.map(({ r, h }) => `
      <article class="card dish">
        <div class="emoji">${r.emoji}</div>
        <div style="min-width:0">
          <h3>${r.name}</h3>
          <div class="meta">${minTxt(recipeTime(r))} · ${ingCount(r)} ${plural(ingCount(r), 'produkt', 'produkty', 'produktów')} · ${h.protein} g białka · ${h.kcal} kcal${siteTag(r)}</div>
          ${equipmentPill(r, s) ? `<div class="row" style="margin-top:6px">${equipmentPill(r, s)}</div>` : ''}
          <div class="row">
            ${r.source ? aniaBtn(r, 'btn small') : `<button class="btn small" data-action="recipe" data-id="${r.id}">Przepis</button>`}
            ${r.source ? `<button class="btn small ghost" data-action="recipe" data-id="${r.id}">Składniki</button>` : ''}
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
    ${r.source ? `<p>${aniaBtn(r, 'btn primary')}</p>` : ''}
    ${r.desc ? `<p>${r.desc}</p>` : ''}
    <div class="row" style="margin-bottom:10px">
      <span class="pill accent">${kcalTxt(n)} · ${n.protein} g białka / porcja</span>
      <span class="pill">ok. ${fmtZl(costPerPortion(r, state.settings))}/porcja</span>
      <span class="pill">${daysTxt(r.keeps)} w lodówce${r.freezes ? ', mrozi się' : ''}</span>
      ${equipmentPill(r, state.settings)}
      ${r.tags.map((t) => `<span class="pill">${TAG_LABELS[t]}</span>`).join('')}
    </div>
    <strong class="small">${r.source ? 'Zakupy' : 'Składniki'} na ${portionsTxt(r.serves)}</strong>
    <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) => `<li>${INGREDIENTS[buyId(id, state.settings)].name}${INGREDIENTS[id].unit === 'szczypta' ? '' : ` — ${fmtQty(q, INGREDIENTS[id].unit)}`}</li>`).join('')}</ul>
    ${r.source ? '<p class="muted small" style="margin-top:8px">Ilości przeliczone na produkty ze sklepu, do listy zakupów. Przyprawy, olej i sposób przygotowania znajdziesz w oryginale.</p>' : ''}
    ${r.steps ? `<ol style="padding-left:20px;margin:10px 0 0">${r.steps.map(([t, m]) => `<li style="margin-bottom:6px">${t} <span class="muted small">(${m} min)</span></li>`).join('')}</ol>` : ''}`;
}

function emptyState(icon, text) {
  return `<div class="empty"><div class="big">${icon}</div><p class="muted">${text}</p><a class="btn primary" href="#plan">Ułóż plan</a></div>`;
}

// ── Arkusze ──

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

// Partie dań z planu, które nie są jeszcze oznaczone jako ugotowane.
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

// Odhaczenie zakupu: kupiona ilość (całe opakowania) trafia do lodówki.
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

// Ugotowane danie zabiera z lodówki swoje składniki (tyle, ile w niej jest).
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

// ── Zdarzenia ──

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
  if (['check', 'step-done', 'fridge-qty', 'cooked'].includes(a)) return; // obsługiwane przez "change"
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
      // Na telefonie otwiera menu udostępniania (np. do notatek albo komunikatora).
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

// Enter w polu „Czego nie jesz?” dodaje produkt zamiast od razu układać plan.
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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
