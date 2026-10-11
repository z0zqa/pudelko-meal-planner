import { INGREDIENTS, CATEGORIES, TAG_LABELS } from './data.js';
import {
  ALL_RECIPES, recipeById, scaled, nutrition, dayNutrition, generatePlan, MEAL_SHARE, shoppingList, swapOptions, costPerPortion, cookDays,
  fmtQty, fmtZl, round2,
} from './planner.js';

// ── Stan (zapisywany w localStorage) ──
const KEY = 'pudelko-v1';
const DEFAULT_SETTINGS = { budget: 50, days: 5, people: 1, breakfasts: false, diet: 'all', glutenFree: false, source: 'all', kcal: 2000 };
const state = load();

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  return {
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    plan: saved.plan || null,
    fridge: saved.fridge || {},
    checked: saved.checked || {},
    done: saved.done || {},
    recipeFilter: 'obiad',
    recipeSource: 'all',
    recipeQuery: '',
    recipeLimit: 40,
  };
}
function save() {
  const { recipeFilter, recipeSource, recipeQuery, recipeLimit, editing, ...rest } = state;
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
  const render = { plan: renderPlan, zakupy: renderShopping, gotowanie: renderCooking, lodowka: renderFridge, przepisy: renderRecipes }[tab] || renderPlan;
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
  return shoppingList(state.plan.meals, state.plan.fridge);
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

function dishCard(m, i) {
  const r = recipeById[m.recipeId];
  const p = state.plan;
  const tags = [];
  const b = m.batches;
  if (b.some((x) => x.freeze)) tags.push('<span class="pill accent">część do zamrażarki</span>');
  if (b.length > 1 || b[0].cookDay > 0) tags.push(`<span class="pill">gotujesz: ${b.map((x) => dayShort(x.cookDay)).join(', ')}</span>`);
  return `
    <article class="card dish">
      <div class="emoji">${r.emoji}</div>
      <div>
        <h3>${r.name}</h3>
        <div class="meta">${portionsTxt(m.portions)}${portionSize(m)} · ${daysRange(m.days)} · ${kcalTxt(mealNutrition(m))} · ok. ${fmtZl(costPerPortion(r) * (m.factor || 1))}/porcja</div>
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
  const kcalChip = (v, label) => `<button class="chip" data-action="kcal" data-v="${v}" aria-pressed="${(s.kcal || 0) === v}">${label || `${v.toLocaleString('pl-PL')} kcal`}</button>`;
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
        <div class="label">Ile kalorii dziennie na osobę?</div>
        <div class="chips">${kcalChip(1600)}${kcalChip(2000)}${kcalChip(2500)}${kcalChip(0, 'Nie licz')}</div>
        <p class="muted small" style="margin:6px 0 0">Porcje obiadu dobierzemy na ok. 40% tej wartości, śniadania na 25%. Więcej jedzenia to większe zakupy.</p>
      </div>
      <div class="field">
        <div class="label">Skąd przepisy?</div>
        <div class="chips">${srcChip('all', 'Wszystkie')}${srcChip('ania', 'Ania Gotuje')}${srcChip('own', 'Wbudowane')}</div>
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

function readForm() {
  const f = document.getElementById('plan-form');
  if (!f) return;
  const budget = parseFloat(f.budget.value.replace(',', '.'));
  if (budget > 0) state.settings.budget = budget;
  state.settings.glutenFree = f.glutenFree.checked;
  state.settings.breakfasts = f.breakfasts.checked;
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

const recipeTime = (r) => r.totalTime || (r.steps || []).reduce((a, s) => a + s[1], 0) || 45;
const totalTime = (m) => recipeTime(recipeById[m.recipeId]);
const kcalTxt = (n) => `${n.kcal.toLocaleString('pl-PL')} kcal`;
const aniaBtn = (r, cls = 'btn small') => `<a class="${cls}" href="${r.source}" target="_blank" rel="noopener">Przepis u Ani ↗</a>`;

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
      <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) => `<li>${INGREDIENTS[id].name}${INGREDIENTS[id].unit === 'szczypta' ? '' : ` — ${fmtQty(scaled(id, q, f), INGREDIENTS[id].unit)}`}</li>`).join('')}</ul>
      ${r.source ? `<div class="row" style="margin-top:10px">${aniaBtn(r)}
        <label class="row small" style="gap:6px"><input type="checkbox" data-action="step-done" data-k="${key}:all" ${cooked ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--ok)"> Ugotowane</label></div>` : ''}
      <ol class="steps">${steps.map(([txt, min], i) => {
        const done = state.done[`${key}:${i}`];
        return `<li class="${done ? 'done' : ''}"><input type="checkbox" data-action="step-done" data-k="${key}:${i}" ${done ? 'checked' : ''} aria-label="Krok ${i + 1}"><span>${txt}</span><span class="min">${min} min</span></li>`;
      }).join('')}</ol>
    </article>`;
}

// Lodówka

function renderFridge() {
  const entries = Object.entries(state.fridge);
  const options = Object.entries(INGREDIENTS)
    .filter(([id, ing]) => !ing.pantry && !(id in state.fridge))
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pl'))
    .map(([id, ing]) => `<option value="${id}">${ing.name}</option>`).join('');
  return `
    <h1>Lodówka</h1>
    <p class="muted">Wpisz, co już masz. Nowy plan wykorzysta te produkty i nie każe ich kupować drugi raz.</p>
    ${entries.length ? `<div class="list">${entries.map(([id, q]) => `
      <div class="fridge-row">
        <span>${INGREDIENTS[id].name}</span>
        <span class="qty"><input type="number" inputmode="decimal" min="0" step="any" value="${round2(q)}" data-action="fridge-qty" data-id="${id}" aria-label="Ilość: ${INGREDIENTS[id].name}"><span>${INGREDIENTS[id].unit}</span></span>
        <button class="icon-btn" data-action="fridge-del" data-id="${id}" aria-label="Usuń ${INGREDIENTS[id].name}">✕</button>
      </div>`).join('')}</div>` : '<div class="card soft muted">Lodówka jest pusta.</div>'}
    <form id="fridge-form" class="card" style="margin-top:16px">
      <h3>Dodaj produkt</h3>
      <div class="row" style="flex-wrap:nowrap">
        <select name="ing" aria-label="Produkt" style="flex:2">${options}</select>
        <input class="input" name="qty" type="number" inputmode="decimal" min="0" step="any" placeholder="ilość" aria-label="Ilość" style="flex:1" required>
      </div>
      <button class="btn block" type="submit" style="margin-top:10px">Dodaj</button>
    </form>
    ${state.plan ? `<p class="muted small">Gdy zaczniesz nowy plan, zapytamy, czy przenieść tutaj resztki z obecnych zakupów.</p>` : ''}
    ${entries.length ? '<button class="btn ghost" data-action="fridge-clear">Wyczyść lodówkę</button>' : ''}`;
}

// Przepisy

function renderRecipes() {
  const chip = (action, cur, v, label) => `<button class="chip" data-action="${action}" data-v="${v}" aria-pressed="${cur === v}">${label}</button>`;
  const f = state.recipeFilter;
  const src = state.recipeSource;
  return `
    <h1>Przepisy</h1>
    <input class="input" type="search" id="recipe-search" placeholder="Szukaj: gulasz, kurczak, naleśniki…" value="${state.recipeQuery.replace(/"/g, '&quot;')}" aria-label="Szukaj przepisu" style="margin-bottom:10px">
    <div class="chips" style="margin-bottom:8px">${chip('rsource', src, 'all', 'Wszystkie')}${chip('rsource', src, 'ania', 'Ania Gotuje')}${chip('rsource', src, 'own', 'Wbudowane')}</div>
    <div class="chips" style="margin-bottom:14px">${chip('rfilter', f, 'obiad', 'Obiady')}${chip('rfilter', f, 'sniadanie', 'Śniadania')}${chip('rfilter', f, 'wege', 'Wege')}${chip('rfilter', f, 'wegan', 'Wegańskie')}${chip('rfilter', f, 'bezgl', 'Bez glutenu')}</div>
    <div id="recipe-list">${recipeList()}</div>`;
}

const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');

function recipeList() {
  const f = state.recipeFilter;
  const src = state.recipeSource;
  const q = norm(state.recipeQuery.trim());
  const base = ALL_RECIPES.filter((r) =>
    (r.type === f || r.tags.includes(f)) && (src === 'all' || (src === 'ania') === !!r.source));
  // Najpierw trafienia w nazwie dania, potem dania z takim składnikiem.
  const list = !q ? base : [
    ...base.filter((r) => norm(r.name).includes(q)),
    ...base.filter((r) => !norm(r.name).includes(q) && Object.keys(r.ing).some((id) => norm(INGREDIENTS[id].name).includes(q))),
  ];
  const shown = list.slice(0, state.recipeLimit);
  return `
    <p class="muted small">${list.length} ${plural(list.length, 'przepis', 'przepisy', 'przepisów')}</p>
    ${shown.map((r) => `
      <button class="option" data-action="recipe" data-id="${r.id}">
        <span class="emoji">${r.emoji}</span>
        <span><strong>${r.name}</strong><br><span class="muted small">ok. ${fmtZl(costPerPortion(r))}/porcja · ${kcalTxt(nutrition(r))} · ${minTxt(recipeTime(r))}${r.source ? ' · Ania Gotuje' : ''}</span></span>
        <span></span>
      </button>`).join('')}
    ${list.length > shown.length ? `<button class="btn block" data-action="more">Pokaż więcej (${list.length - shown.length})</button>` : ''}`;
}

function recipeBody(r) {
  const n = nutrition(r);
  return `
    ${r.source ? `<p>${aniaBtn(r, 'btn primary')}</p>` : ''}
    ${r.desc ? `<p>${r.desc}</p>` : ''}
    <div class="row" style="margin-bottom:10px">
      <span class="pill accent">${kcalTxt(n)} · ${n.protein} g białka / porcja</span>
      <span class="pill">ok. ${fmtZl(costPerPortion(r))}/porcja</span>
      <span class="pill">${daysTxt(r.keeps)} w lodówce${r.freezes ? ', mrozi się' : ''}</span>
      ${r.tags.map((t) => `<span class="pill">${TAG_LABELS[t]}</span>`).join('')}
    </div>
    <strong class="small">${r.source ? 'Zakupy' : 'Składniki'} na ${portionsTxt(r.serves)}</strong>
    <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) => `<li>${INGREDIENTS[id].name}${INGREDIENTS[id].unit === 'szczypta' ? '' : ` — ${fmtQty(q, INGREDIENTS[id].unit)}`}</li>`).join('')}</ul>
    ${r.source ? '<p class="muted small" style="margin-top:8px">Ilości przeliczone na produkty ze sklepu, do listy zakupów. Przyprawy, olej i sposób przygotowania znajdziesz u Ani.</p>' : ''}
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
        <span><strong>${o.recipe.name}</strong><br><span class="muted small">${o.recipe.source ? 'Ania Gotuje · ' : ''}${kcalTxt(nutrition(o.recipe))} · ok. ${fmtZl(costPerPortion(o.recipe))}/porcja</span></span>
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

function openNewPlan() {
  const leftovers = shopping().items.filter((it) => it.leftover > 0 && !(it.unit === 'szt' && it.leftover < 0.5));
  if (!leftovers.length) return startNewPlan(false);
  openSheet(`
    <h2 style="margin-top:0">Przenieść resztki do lodówki?</h2>
    <p class="muted">Po tym planie zostanie Ci: ${leftovers.map((it) => `${it.name} (${fmtQty(it.leftover, it.unit)})`).join(', ')}.</p>
    <p class="muted small">Kolejny plan je wykorzysta i nie każe kupować ich ponownie.</p>
    <div class="stack">
      <button class="btn primary block" data-action="new-plan-go" data-keep="1">Tak, przenieś resztki</button>
      <button class="btn block" data-action="new-plan-go" data-keep="0">Nie, zacznij od zera</button>
    </div>`);
}

function startNewPlan(keep) {
  if (keep) {
    for (const it of shopping().items) {
      if (it.leftover > 0) state.fridge[it.id] = round2(it.leftover);
      else delete state.fridge[it.id];
    }
  }
  state.plan = null;
  state.checked = {};
  state.done = {};
  save();
  if (sheet.open) sheet.close();
  location.hash = '#plan';
  route();
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
  if (['check', 'step-done', 'fridge-qty'].includes(a)) return; // obsługiwane przez "change"
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
    case 'kcal': readForm(); s.kcal = +el.dataset.v; break;
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
    case 'fridge-del': delete state.fridge[el.dataset.id]; save(); break;
    case 'fridge-clear': state.fridge = {}; save(); break;
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
    const q = parseFloat(e.target.qty.value.replace(',', '.'));
    if (q > 0) state.fridge[e.target.ing.value] = q;
    save();
  }
  route();
});

let searchTimer;
document.addEventListener('input', (e) => {
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
