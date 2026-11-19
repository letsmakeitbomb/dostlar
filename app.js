import * as C from './calc.js';

// ===== storage ========================================================================

const KEY = 'dostlar.trips.v1';
let trips = load();
function load() {
  try { return (JSON.parse(localStorage.getItem(KEY)) || []).map(C.migrate); } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(trips)); } catch { toast('Could not save!'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const tripById = (id) => trips.find((t) => t.id === id);
const eventById = (t, id) => t && t.events.find((e) => e.id === id);
function commit() { save(); render(); }

// ===== small helpers ==================================================================

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = C.fmt;

/** Persian / Arabic digits -> Latin, then the signed whole number in the text. */
function parseAmount(s) {
  const t = String(s ?? '').replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);
  const digits = t.replace(/\D/g, '');
  if (!digits) return 0;
  return (t.trim().startsWith('-') ? -1 : 1) * Number(digits.slice(0, 15));
}
const amountValue = (n) => (n ? fmt(n) : '');

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 21 5a3 3 0 1 0-5.91.7L8.04 9.81A3 3 0 1 0 6 15a2.99 2.99 0 0 0 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65A2.92 2.92 0 1 0 18 16.08"/></svg>',
  more: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4m0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4m0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/></svg>',
};

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function bar(title, { back, actions = '' } = {}) {
  return `<header class="bar">
    ${back ? `<button class="icon" data-act="back" data-to="${esc(back)}" aria-label="Back">${ICON.back}</button>` : ''}
    <h1 dir="auto">${esc(title)}</h1>${actions}</header>`;
}

// ===== dialogs ========================================================================

const dlg = document.getElementById('dlg');

/**
 * Opens a modal. buttons: [{value, label, cls, primary}]. validate(value, form) returns an error
 * text to keep it open. onAction(el, form) handles clicks on [data-dact] inside the body.
 * Resolves with {value, form}.
 */
function openDialog({ title, body, buttons, validate, onAction }) {
  return new Promise((resolve) => {
    dlg.innerHTML = `<form class="dlg" novalidate>
      ${title ? `<h3 dir="auto">${esc(title)}</h3>` : ''}
      <div class="dbody">${body}<div class="derr"></div></div>
      <div class="dbtns">${buttons.map((b) =>
        `<button type="button" class="btn ${b.cls || 'plain'}" data-dval="${b.value}">${esc(b.label)}</button>`).join('')}</div>
    </form>`;
    const form = dlg.querySelector('form');
    let done = false;
    const finish = (value) => { if (done) return; done = true; dlg.close(); resolve({ value, form }); };
    const attempt = (value) => {
      if (value !== 'cancel' && validate) {
        const err = validate(value, form);
        if (err) { form.querySelector('.derr').textContent = err; return; }
      }
      finish(value);
    };
    form.querySelectorAll('[data-dval]').forEach((b) => (b.onclick = () => attempt(b.dataset.dval)));
    form.onsubmit = (e) => {
      e.preventDefault();
      const p = buttons.find((b) => b.primary);
      if (p) attempt(p.value);
    };
    form.querySelector('.dbody').onclick = (e) => {
      const el = e.target.closest('[data-dact]');
      if (el && onAction) onAction(el, form);
    };
    dlg.oncancel = (e) => { e.preventDefault(); finish('cancel'); };
    dlg.showModal();
    const first = form.querySelector('[autofocus]');
    if (first) { first.focus(); if (first.select) first.select(); }
  });
}

async function askText(title, { value = '', label = 'Name', ok = 'Save' } = {}) {
  const { value: v, form } = await openDialog({
    title,
    body: `<label class="field">${esc(label)}<input name="t" value="${esc(value)}" dir="auto" autocomplete="off" autofocus></label>`,
    buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'ok', label: ok, cls: '', primary: true }],
    validate: (_, f) => (f.t.value.trim() ? '' : 'Please enter a name.'),
  });
  return v === 'ok' ? form.t.value.trim() : null;
}

async function confirmBox(title, message, ok = 'Delete') {
  const { value } = await openDialog({
    title, body: `<p dir="auto" style="margin:0">${esc(message)}</p>`,
    buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'ok', label: ok, cls: 'danger' }],
  });
  return value === 'ok';
}

function alertBox(title, message) {
  return openDialog({ title, body: `<p dir="auto" style="margin:0;white-space:pre-line">${esc(message)}</p>`,
    buttons: [{ value: 'cancel', label: 'OK', cls: '' }] });
}

// ===== routing ========================================================================
// #/                    trips
// #/t/<trip>/<tab>      trip (friends | events | result)
// #/e/<trip>/<event>    event editor
// #/f/<trip>/<friend>   one friend's details

// Screens opened inside the app are marked in history.state, so our back button can use
// history.back() (same as the phone's back gesture) and falls back to the parent screen.
function go(hash) { history.pushState({ app: true }, '', hash); render(); window.scrollTo(0, 0); }
function back(to) {
  if (history.state && history.state.app) history.back();
  else { history.replaceState(null, '', to); render(); window.scrollTo(0, 0); }
}
window.addEventListener('popstate', () => { render(); window.scrollTo(0, 0); });

function render() {
  const [, view, a, b] = location.hash.replace(/^#/, '').split('/');
  let html;
  if (view === 't' && tripById(a)) html = tripView(tripById(a), b || 'events');
  else if (view === 'e' && eventById(tripById(a), b)) html = eventView(tripById(a), eventById(tripById(a), b));
  else if (view === 'f' && tripById(a)) html = friendView(tripById(a), b);
  else html = tripsView();
  app.innerHTML = html;
  if (pendingFocus) { const el = app.querySelector(pendingFocus); if (el) el.focus(); pendingFocus = null; }
}
let pendingFocus = null;

// ===== trips list =====================================================================

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; render(); });

function tripsView() {
  const actions = (installPrompt ? '<button class="textbtn" data-act="install">Install</button>' : '') +
    '<button class="textbtn" data-act="import">Import</button>';
  const list = trips.length
    ? trips.map((t) => {
      const total = C.tripResult(t).total;
      return `<div class="card click row" data-act="openTrip" data-id="${t.id}">
        <div class="grow"><div class="title" dir="auto">${esc(t.name)}</div>
        <div class="muted">${t.friends.length} friends · ${t.events.length} events · <span class="num">${fmt(total)}</span></div></div>
        <button class="icon" data-act="tripMenu" data-id="${t.id}" aria-label="More">${ICON.more}</button></div>`;
    }).join('')
    : `<div class="empty">No groups yet.<br>Tap <b>New group</b> to start,<br>or <b>Import</b> a file from the Windows app.</div>`;
  return bar('Dostlar', { actions }) + `<div class="content">${list}</div>
    <button class="fab" data-act="newTrip">+ New group</button>`;
}

// ===== one trip =======================================================================

function tripView(t, tab) {
  const r = C.tripResult(t);
  const actions = t.events.length
    ? `<button class="icon" data-act="share" data-id="${t.id}" aria-label="Share result">${ICON.share}</button>` : '';
  const tabs = [['friends', `Friends (${t.friends.length})`], ['events', `Events (${t.events.length})`], ['result', 'Result']]
    .map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}" data-id="${t.id}">${l}</button>`).join('');
  const body = tab === 'friends' ? friendsTab(t) : tab === 'result' ? resultTab(t, r) : eventsTab(t, r);
  return bar(t.name, { back: '#/', actions }) + `<nav class="tabs">${tabs}</nav><div class="content">${body}</div>`;
}

function friendsTab(t) {
  const rows = t.friends.map((f) => `<li><span class="grow" dir="auto">${esc(f.name)}</span>
      <button class="icon" data-act="renameFriend" data-id="${f.id}" aria-label="Rename">${ICON.edit}</button>
      <button class="icon" data-act="deleteFriend" data-id="${f.id}" aria-label="Delete">${ICON.trash}</button></li>`).join('');
  return `<form class="addrow" data-form="addFriend" data-id="${t.id}">
      <input name="nm" id="friendName" placeholder="Friend's name" dir="auto" autocomplete="off" enterkeyhint="done">
      <button class="btn">Add</button></form>
    ${t.friends.length ? `<ul class="list">${rows}</ul>` : '<div class="empty">Add everyone in the group.</div>'}`;
}

function eventsTab(t, r) {
  if (!t.friends.length) {
    return `<div class="empty">Add the friends first.<br><br>
      <button class="btn soft" data-act="tab" data-tab="friends" data-id="${t.id}">Go to Friends</button></div>`;
  }
  const cards = t.events.map((e) => {
    const er = r.events.find((x) => x.event.id === e.id);
    const treated = Object.entries(e.presence || {}).filter(([, p]) => p === C.TREATED).map(([id]) => C.nameOf(t, id));
    return `<div class="card click row" data-act="openEvent" data-id="${e.id}">
      <div class="grow"><div class="title" dir="auto">${esc(e.name)}</div>
        <div class="muted">Paid by <span dir="auto">${esc(C.payerIds(e).map((id) => C.nameOf(t, id)).join(', '))}</span> · <span class="num">${fmt(er.total)}</span></div>
        ${treated.length ? `<div class="small" dir="auto">Treated: ${esc(treated.join(', '))}</div>` : ''}
        ${er.problems.length ? `<div class="warn" dir="auto">⚠ ${esc(er.problems[0])}</div>` : ''}</div>
      <button class="icon" data-act="deleteEvent" data-id="${e.id}" aria-label="Delete">${ICON.trash}</button></div>`;
  }).join('');
  return `<div class="btns"><button class="btn" data-act="newEvent">+ Event</button>
      <button class="btn outline" data-act="quickExpense">+ Single expense</button></div>
    <p class="hint"><b>Event</b>: a restaurant, a park… with items and who had what.<br>
      <b>Single expense</b>: one thing one person paid for, like a birthday cake.</p>
    ${cards}`;
}

function balanceHtml(b) {
  if (b > 0) return `<span class="good num">gets ${fmt(b)}</span>`;
  if (b < 0) return `<span class="bad num">pays ${fmt(-b)}</span>`;
  return '<span class="muted">settled</span>';
}

function resultTab(t, r) {
  const transfers = r.transfers.length
    ? r.transfers.map((x) => `<div class="card transfer row"><span class="grow" dir="auto">${esc(C.nameOf(t, x.from))} → ${esc(C.nameOf(t, x.to))}</span>
        <b class="num">${fmt(x.amount)}</b></div>`).join('')
    : '<p class="muted">Nothing to pay. Everyone is settled.</p>';
  const people = r.people.map((p) => `<div class="card click row" data-act="openFriend" data-id="${p.friend.id}">
      <div class="grow"><div class="title" dir="auto">${esc(p.friend.name)}</div>
      <div class="muted small num">Spent ${fmt(p.paid)} · Share ${fmt(p.share)}</div></div>${balanceHtml(p.balance)}</div>`).join('');
  return `<div class="title" style="font-size:20px">Total: <span class="num">${fmt(r.total)}</span></div>
    <h2>Who pays whom</h2>${transfers}<h2>Each friend <span class="muted small">(tap for details)</span></h2>${people}`;
}

// ===== event editor ===================================================================

const PRESENCE = [[C.PAYS, 'Pays'], [C.TREATED, 'Treated'], [C.ABSENT, 'Away']];

function eventView(t, e) {
  const r = C.eventResult(t, e);
  const opts = (sel) => t.friends.map((f) => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const others = C.otherPayers(e);
  const paidBy = `<div class="card payers">
    <div class="row"><select data-bind="payer">${opts(e.payerId)}</select>
      <input class="amount payamt" data-bind="mainAmt" inputmode="numeric" placeholder="${fmt(Math.max(0, r.total - others.reduce((a, p) => a + (p.amount || 0), 0)))}" value="${amountValue(e.payerAmount || 0)}">
      ${others.length ? '<span class="iconspace"></span>' : ''}</div>
    ${others.map((p, i) => `<div class="row"><select data-bind="opId" data-i="${i}">${opts(p.id)}</select>
      <input class="amount payamt" data-bind="opAmt" data-i="${i}" inputmode="numeric" placeholder="Amount" value="${amountValue(p.amount)}">
      <button class="icon" data-act="delPayer" data-i="${i}" aria-label="Remove payer">${ICON.trash}</button></div>`).join('')}
    <button class="btn plain" data-act="addPayer">+ Another payer</button>
    <p class="hint">Enter what each one paid. An empty first amount means “the rest of the bill” (shown in grey).</p>
  </div>`;
  const payLines = C.payerIds(e).filter((id, i, a) => a.indexOf(id) === i).map((id) =>
    `<div><span dir="auto">paid by ${esc(C.nameOf(t, id))}</span><span class="num">${fmt(r.payments[id] || 0)}</span></div>`).join('');
  const people = t.friends.map((f) => {
    const cur = C.presenceOf(e, f.id);
    return `<div class="prow"><span class="grow" dir="auto">${esc(f.name)}</span><div class="seg">${PRESENCE.map(([p, l]) =>
      `<button class="${cur === p ? 'on' : ''}" data-act="presence" data-f="${f.id}" data-p="${p}">${l}</button>`).join('')}</div></div>`;
  }).join('');
  const items = e.items.length ? e.items.map((it) => itemCard(t, e, it)).join('') : '<p class="muted">No items yet.</p>';
  const extraKind = (e.extra || 0) < 0 ? 'discount' : 'service';
  const shares = t.friends.filter((f) => r.shares[f.id]).map((f) =>
    `<div><span dir="auto">${esc(f.name)}</span><span class="num">${fmt(r.shares[f.id].round())}</span></div>`).join('');
  const problems = r.problems.map((p) => `<div class="warn" dir="auto">⚠ ${esc(p)}</div>`).join('');

  return bar(e.name, {
    back: `#/t/${t.id}/events`,
    actions: `<button class="icon" data-act="deleteThisEvent" aria-label="Delete event">${ICON.trash}</button>`,
  }) + `<div class="content">
    <label class="field">Event name<input data-bind="evName" value="${esc(e.name)}" dir="auto" autocomplete="off"></label>
    <h2>Paid by</h2>${paidBy}

    <h2>Who was there</h2>
    <p class="hint"><b>Treated</b> = was there, but the others pay their part (e.g. birthday).</p>
    <div class="card" style="padding:4px 12px">${people}</div>

    <h2>Items</h2>${items}
    <div class="btns"><button class="btn soft" data-act="newItem" data-kind="${C.ORDERED}">+ Ordered item</button>
      <button class="btn outline" data-act="newItem" data-kind="${C.SHARED}">+ Shared item</button></div>
    <p class="hint"><b>Ordered</b>: price of one, then who had how many (food, drinks, rides).<br>
      <b>Shared</b>: one price split equally (cake, entry fee).</p>

    <div class="row">
      <select data-bind="extraKind" style="width:auto">
        <option value="service" ${extraKind === 'service' ? 'selected' : ''}>Service / tip</option>
        <option value="discount" ${extraKind === 'discount' ? 'selected' : ''}>Discount</option></select>
      <input class="amount" data-bind="extra" inputmode="numeric" placeholder="0" value="${amountValue(Math.abs(e.extra || 0))}">
    </div>

    <h2>Shares in this event</h2>${problems}
    <div class="card lines">${shares || '<span class="muted">—</span>'}<hr>
      <div><b>Total</b><b class="num">${fmt(r.total)}</b></div>${payLines}</div>
  </div>`;
}

function itemCard(t, e, it) {
  let detail;
  if (it.kind === C.ORDERED) {
    const who = Object.entries(it.quantities || {}).filter(([, q]) => q > 0)
      .map(([id, q]) => (q === 1 ? C.nameOf(t, id) : `${C.nameOf(t, id)} ×${q}`)).join(', ');
    detail = `${fmt(it.price)} each · ${who || 'nobody yet'}`;
  } else {
    const ex = new Set(it.excluded || []);
    const payers = t.friends.filter((f) => C.presenceOf(e, f.id) === C.PAYS);
    const out = payers.filter((f) => ex.has(f.id)).map((f) => f.name);
    detail = `Shared by ${payers.length - out.length}` + (out.length ? ` · not: ${out.join(', ')}` : '');
  }
  return `<div class="card click row" data-act="editItem" data-id="${it.id}">
    <div class="grow"><div class="row"><b class="grow" dir="auto">${esc(it.name)}</b><b class="num">${fmt(C.itemTotal(it))}</b></div>
    <div class="muted small" dir="auto">${esc(detail)}</div></div>
    <button class="icon" data-act="deleteItem" data-id="${it.id}" aria-label="Delete item">${ICON.trash}</button></div>`;
}

async function itemDialog(t, e, original) {
  const d = structuredClone(original);
  d.quantities ||= {};
  d.excluded ||= [];
  const isNew = !e.items.some((x) => x.id === d.id);
  const dyn = () => {
    const kindSeg = `<div class="seg wide">${[[C.ORDERED, 'Ordered'], [C.SHARED, 'Shared']].map(([k, l]) =>
      `<button type="button" class="${d.kind === k ? 'on' : ''}" data-dact="kind" data-k="${k}">${l}</button>`).join('')}</div>`;
    let list;
    if (d.kind === C.ORDERED) {
      list = '<div class="muted">How many did each have?</div>' + t.friends.filter((f) => C.presenceOf(e, f.id) !== C.ABSENT).map((f) => {
        const q = d.quantities[f.id] || 0;
        const tr = C.presenceOf(e, f.id) === C.TREATED ? ' <span class="small" style="color:var(--accent)">treated</span>' : '';
        return `<div class="prow"><span class="grow" dir="auto">${esc(f.name)}${tr}</span><div class="qty">
          <button type="button" data-dact="q" data-f="${f.id}" data-d="-1" ${q ? '' : 'disabled'}>−</button><b>${q}</b>
          <button type="button" data-dact="q" data-f="${f.id}" data-d="1">+</button></div></div>`;
      }).join('');
    } else {
      const treated = t.friends.filter((f) => C.presenceOf(e, f.id) === C.TREATED).map((f) => f.name);
      list = '<div class="muted">Who shares it?</div>' + t.friends.filter((f) => C.presenceOf(e, f.id) === C.PAYS).map((f) =>
        `<div class="check" data-dact="ex" data-f="${f.id}"><input type="checkbox" ${d.excluded.includes(f.id) ? '' : 'checked'} tabindex="-1" style="pointer-events:none">
          <span dir="auto">${esc(f.name)}</span></div>`).join('') +
        (treated.length ? `<p class="hint" dir="auto">Treated friends (${esc(treated.join(', '))}) don't pay.</p>` : '');
    }
    return { kindSeg, list };
  };
  const paint = (form) => {
    const { kindSeg, list } = dyn();
    form.querySelector('.kindseg').innerHTML = kindSeg;
    form.querySelector('.dyn').innerHTML = list;
    form.querySelector('.pricelabel').firstChild.textContent = d.kind === C.ORDERED ? 'Price of one' : 'Total price';
  };
  const first = dyn();
  const { value, form } = await openDialog({
    title: isNew ? 'New item' : 'Edit item',
    body: `<div class="kindseg">${first.kindSeg}</div>
      <label class="field">Name<input name="nm" value="${esc(d.name)}" dir="auto" autocomplete="off" ${isNew ? 'autofocus' : ''}></label>
      <label class="field pricelabel">${d.kind === C.ORDERED ? 'Price of one' : 'Total price'}<input name="price" class="amount" inputmode="numeric" value="${amountValue(d.price)}"></label>
      <div class="dyn">${first.list}</div>`,
    buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'ok', label: 'Save', cls: '', primary: true }],
    validate: (_, f) => (!f.nm.value.trim() ? 'Please enter a name.' : parseAmount(f.price.value) <= 0 ? 'Please enter a price.' : ''),
    onAction: (el, f) => {
      const a = el.dataset.dact;
      if (a === 'kind') d.kind = el.dataset.k;
      if (a === 'q') {
        const n = (d.quantities[el.dataset.f] || 0) + Number(el.dataset.d);
        if (n > 0) d.quantities[el.dataset.f] = n; else delete d.quantities[el.dataset.f];
      }
      if (a === 'ex') {
        const id = el.dataset.f;
        d.excluded = d.excluded.includes(id) ? d.excluded.filter((x) => x !== id) : [...d.excluded, id];
      }
      paint(f);
    },
  });
  if (value !== 'ok') return;
  const item = {
    ...d,
    name: form.nm.value.trim(),
    price: parseAmount(form.price.value),
    quantities: d.kind === C.ORDERED ? d.quantities : {},
    excluded: d.kind === C.SHARED ? d.excluded : [],
  };
  const i = e.items.findIndex((x) => x.id === item.id);
  if (i >= 0) e.items[i] = item; else e.items.push(item);
  commit();
}

async function quickExpenseDialog(t) {
  const opts = (sel) => t.friends.map((f) => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const checks = t.friends.map((f) => `<label class="check"><input type="checkbox" name="s" value="${f.id}" checked>
    <span dir="auto">${esc(f.name)}</span></label>`).join('');
  let others = []; // extra payers [{id, amount}]; the main payer paid the rest

  const readOthers = () => {
    const ids = [...dlg.querySelectorAll('.qp-id')].map((x) => x.value);
    const amts = [...dlg.querySelectorAll('.qp-amt')].map((x) => Math.abs(parseAmount(x.value)));
    others = ids.map((id, i) => ({ id, amount: amts[i] || 0 }));
  };
  const othersHtml = () => others.map((p, i) => `<div class="row"><select class="qp-id">${opts(p.id)}</select>
      <input class="amount payamt qp-amt" inputmode="numeric" placeholder="Amount" value="${amountValue(p.amount)}">
      <button type="button" class="icon" data-dact="delp" data-i="${i}" aria-label="Remove payer">${ICON.trash}</button></div>`).join('');
  const updateRest = () => {
    const el = dlg.querySelector('.qrest');
    if (!el) return;
    readOthers();
    const price = parseAmount(dlg.querySelector('[name=price]').value);
    const sumOthers = others.reduce((a, p) => a + p.amount, 0);
    const typed = Math.abs(parseAmount(dlg.querySelector('[name=pamt]').value));
    dlg.querySelector('[name=pamt]').placeholder = fmt(Math.max(0, price - sumOthers));
    const paid = sumOthers + (typed || Math.max(0, price - sumOthers));
    const off = price > 0 && (sumOthers > price || (typed && paid !== price));
    el.textContent = off ? `The payers' amounts add up to ${fmt(sumOthers + typed)}, but the total is ${fmt(price)}.`
      : 'Enter what each one paid. An empty first amount means “the rest” (shown in grey).';
    el.style.color = off ? 'var(--bad)' : '';
  };
  const paint = () => { dlg.querySelector('.qothers').innerHTML = othersHtml(); updateRest(); };

  const opening = openDialog({
    title: 'Single expense',
    body: `<label class="field">What (e.g. Birthday cake)<input name="nm" dir="auto" autocomplete="off" autofocus></label>
      <label class="field">Amount<input name="price" class="amount" inputmode="numeric"></label>
      <div class="payers"><div class="muted">Paid by</div>
        <div class="row"><select name="payer">${opts(t.friends[0].id)}</select>
          <input name="pamt" class="amount payamt" inputmode="numeric"><span class="iconspace"></span></div>
        <div class="qothers payers"></div>
        <button type="button" class="btn plain" data-dact="addp">+ Another payer</button>
        <div class="hint qrest"></div></div>
      <div class="muted">Shared by <span class="small">(unticked friends don't pay; they show as Treated)</span></div>${checks}`,
    buttons: [{ value: 'cancel', label: 'Cancel' }, { value: 'ok', label: 'Save', cls: '', primary: true }],
    validate: (_, f) => {
      readOthers();
      const ids = [f.payer.value, ...others.map((p) => p.id)];
      if (!f.nm.value.trim()) return 'Please enter what it was.';
      if (parseAmount(f.price.value) <= 0) return 'Please enter the amount.';
      if (new Set(ids).size !== ids.length) return 'The same friend is listed twice as a payer.';
      if (others.some((p) => p.amount <= 0)) return "Please enter each extra payer's amount.";
      const sumOthers = others.reduce((a, p) => a + p.amount, 0);
      const typed = Math.abs(parseAmount(f.pamt.value));
      if (sumOthers > parseAmount(f.price.value)) return "The payers' amounts are more than the total.";
      if (typed && typed + sumOthers !== parseAmount(f.price.value)) return `The payers' amounts add up to ${fmt(typed + sumOthers)}, but the total is ${fmt(parseAmount(f.price.value))}.`;
      if (![...f.querySelectorAll('[name=s]')].some((c) => c.checked)) return 'At least one friend must share it.';
      return '';
    },
    onAction: (el) => {
      readOthers();
      if (el.dataset.dact === 'addp') {
        const used = new Set([dlg.querySelector('[name=payer]').value, ...others.map((p) => p.id)]);
        const free = t.friends.find((f) => !used.has(f.id));
        if (!free) return toast('Everyone is already a payer');
        others.push({ id: free.id, amount: 0 });
        paint();
        const amts = dlg.querySelectorAll('.qp-amt');
        amts[amts.length - 1].focus();
      }
      if (el.dataset.dact === 'delp') { others.splice(Number(el.dataset.i), 1); paint(); }
    },
  });
  dlg.querySelector('form').addEventListener('input', updateRest);
  dlg.querySelector('form').addEventListener('change', updateRest);
  updateRest();
  const { value, form } = await opening;
  if (value !== 'ok') return;
  readOthers();
  const sharing = new Set([...form.querySelectorAll('[name=s]')].filter((c) => c.checked).map((c) => c.value));
  const name = form.nm.value.trim();
  t.events.push({
    id: C.newId(), name, payerId: form.payer.value, otherPayers: others, extra: 0,
    ...(Math.abs(parseAmount(form.pamt.value)) ? { payerAmount: Math.abs(parseAmount(form.pamt.value)) } : {}),
    presence: Object.fromEntries(t.friends.filter((f) => !sharing.has(f.id)).map((f) => [f.id, C.TREATED])),
    items: [{ id: C.newId(), name, kind: C.SHARED, price: parseAmount(form.price.value), quantities: {}, excluded: [] }],
  });
  commit();
}

// ===== one friend =====================================================================

function friendView(t, fid) {
  const f = t.friends.find((x) => x.id === fid);
  if (!f) return tripsView();
  const r = C.tripResult(t);
  const p = r.people.find((x) => x.friend.id === fid);
  const events = r.events.map((er) => {
    const e = er.event;
    const pr = C.presenceOf(e, fid);
    const notes = [];
    if (C.payerIds(e).includes(fid)) notes.push(`paid ${fmt(er.payments[fid] || 0)}`);
    if (pr === C.TREATED) notes.push('treated — the others pay for them');
    if (pr === C.ABSENT) notes.push('was away');
    let lines = '';
    if (pr === C.PAYS) {
      const parts = new Map((er.parts[fid] || []).map((x) => [x.item.id, x]));
      for (const it of e.items) {
        const part = parts.get(it.id);
        if (!part) {
          if (it.kind === C.SHARED && (it.excluded || []).includes(fid)) {
            lines += `<div class="muted"><span dir="auto">${esc(it.name)}</span><span>excluded</span></div>`;
          }
          continue;
        }
        const bits = [];
        if (!part.own.zero) { const q = (it.quantities || {})[fid] || 0; bits.push(q === 1 ? 'own' : `own ×${q}`); }
        if (!part.forTreated.zero) bits.push(`for treated ${fmt(part.forTreated.round())}`);
        if (!part.shared.zero) bits.push('shared');
        lines += `<div><span dir="auto">${esc(it.name)} <span class="muted small">(${bits.join(', ')})</span></span>
          <span class="num">${fmt(part.total.round())}</span></div>`;
      }
      const x = er.extraParts[fid];
      if (x) lines += `<div><span>${(e.extra || 0) > 0 ? 'Service / tip' : 'Discount'}</span><span class="num">${fmt(x.round())}</span></div>`;
    }
    const share = er.shares[fid] ? er.shares[fid].round() : 0;
    return `<div class="card"><div class="row"><span class="title grow" dir="auto">${esc(e.name)}</span><b class="num">${fmt(share)}</b></div>
      ${notes.length ? `<div class="small" style="color:var(--accent)">${esc(notes.join(' · '))}</div>` : ''}
      ${lines ? `<hr><div class="lines">${lines}</div>` : ''}</div>`;
  }).join('');
  return bar(f.name, { back: `#/t/${t.id}/result` }) + `<div class="content">
    <div class="card lines"><div><span>Spent</span><span class="num">${fmt(p.paid)}</span></div>
      <div><span>Share</span><span class="num">${fmt(p.share)}</span></div>
      <div><b>Final</b>${balanceHtml(p.balance)}</div></div>${events}</div>`;
}

// ===== actions ========================================================================

function currentIds() {
  const [, view, a, b] = location.hash.replace(/^#/, '').split('/');
  return { view, trip: tripById(a), sub: b };
}

const actions = {
  back: (el) => back(el.dataset.to),
  install: async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; render(); } },
  import: () => document.getElementById('importFile').click(),
  openTrip: (el) => go(`#/t/${el.dataset.id}/${tripById(el.dataset.id).friends.length ? 'events' : 'friends'}`),
  newTrip: async () => {
    const name = await askText('New group', { label: 'Group name (e.g. North trip, birthday party)', ok: 'Create' });
    if (!name) return;
    const t = { id: C.newId(), name, friends: [], events: [], createdAt: Date.now() };
    trips.unshift(t);
    save();
    pendingFocus = '#friendName';
    go(`#/t/${t.id}/friends`);
  },
  tripMenu: async (el) => {
    const t = tripById(el.dataset.id);
    const { value } = await openDialog({
      title: t.name,
      body: `<div class="menu"><button type="button" data-dact="x" data-v="rename">Rename</button>
        <button type="button" data-dact="x" data-v="export">Export file (backup)</button>
        <button type="button" data-dact="x" data-v="delete" class="danger">Delete</button></div>`,
      buttons: [{ value: 'cancel', label: 'Close' }],
      onAction: (b) => { dlg.querySelector('[data-dval]').dataset.dval = b.dataset.v; dlg.querySelector('[data-dval]').click(); },
    });
    if (value === 'rename') {
      const name = await askText('Rename group', { value: t.name });
      if (name) { t.name = name; commit(); }
    } else if (value === 'export') {
      const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${t.name}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } else if (value === 'delete') {
      if (await confirmBox('Delete group?', `“${t.name}” and all its events will be deleted.`)) {
        trips = trips.filter((x) => x !== t);
        commit();
      }
    }
  },
  tab: (el) => { history.replaceState(history.state, '', `#/t/${el.dataset.id}/${el.dataset.tab}`); render(); },
  share: async (el) => {
    const t = tripById(el.dataset.id);
    const text = C.shareText(t, C.tripResult(t));
    try {
      if (navigator.share) await navigator.share({ title: t.name, text });
      else { await navigator.clipboard.writeText(text); toast('Result copied'); }
    } catch (err) { if (err && err.name !== 'AbortError') { try { await navigator.clipboard.writeText(text); toast('Result copied'); } catch { /* ignore */ } } }
  },

  // friends
  renameFriend: async (el) => {
    const { trip } = currentIds();
    const f = trip.friends.find((x) => x.id === el.dataset.id);
    const name = await askText('Rename', { value: f.name });
    if (!name) return;
    if (trip.friends.some((x) => x !== f && x.name.toLowerCase() === name.toLowerCase())) return alertBox('Not possible', `“${name}” is already in the list.`);
    f.name = name;
    commit();
  },
  deleteFriend: async (el) => {
    const { trip } = currentIds();
    const f = trip.friends.find((x) => x.id === el.dataset.id);
    const paid = trip.events.filter((e) => C.payerIds(e).includes(f.id));
    if (paid.length) return alertBox('Not possible', `${f.name} paid for: ${paid.map((e) => e.name).join(', ')}.\nChoose another payer for these first.`);
    if (!(await confirmBox(`Delete ${f.name}?`, 'Their orders in all events will be removed too.'))) return;
    trip.friends = trip.friends.filter((x) => x !== f);
    for (const e of trip.events) {
      delete (e.presence || {})[f.id];
      for (const it of e.items) {
        delete (it.quantities || {})[f.id];
        it.excluded = (it.excluded || []).filter((x) => x !== f.id);
      }
    }
    commit();
  },

  // events
  openEvent: (el) => go(`#/e/${currentIds().trip.id}/${el.dataset.id}`),
  newEvent: () => {
    const { trip } = currentIds();
    const e = { id: C.newId(), name: `Event ${trip.events.length + 1}`, payerId: trip.friends[0].id, presence: {}, items: [], extra: 0 };
    trip.events.push(e);
    save();
    go(`#/e/${trip.id}/${e.id}`);
  },
  quickExpense: () => quickExpenseDialog(currentIds().trip),
  deleteEvent: async (el) => {
    const { trip } = currentIds();
    const e = eventById(trip, el.dataset.id);
    if (await confirmBox(`Delete “${e.name}”?`, 'This event and its items will be deleted.')) {
      trip.events = trip.events.filter((x) => x !== e);
      commit();
    }
  },
  deleteThisEvent: async () => {
    const { trip, sub } = currentIds();
    const e = eventById(trip, sub);
    if (await confirmBox(`Delete “${e.name}”?`, 'This event and its items will be deleted.')) {
      trip.events = trip.events.filter((x) => x !== e);
      save();
      back(`#/t/${trip.id}/events`);
    }
  },
  presence: (el) => {
    const { trip, sub } = currentIds();
    const e = eventById(trip, sub);
    const fid = el.dataset.f, p = el.dataset.p;
    e.presence ||= {};
    if (p === C.PAYS) delete e.presence[fid]; else e.presence[fid] = p;
    if (p === C.ABSENT) e.items.forEach((it) => { if (it.quantities) delete it.quantities[fid]; });
    commit();
  },
  newItem: (el) => {
    const { trip, sub } = currentIds();
    itemDialog(trip, eventById(trip, sub), { id: C.newId(), name: '', kind: el.dataset.kind, price: 0, quantities: {}, excluded: [] });
  },
  editItem: (el) => {
    const { trip, sub } = currentIds();
    const e = eventById(trip, sub);
    itemDialog(trip, e, e.items.find((x) => x.id === el.dataset.id));
  },
  deleteItem: async (el) => {
    const { trip, sub } = currentIds();
    const e = eventById(trip, sub);
    const it = e.items.find((x) => x.id === el.dataset.id);
    if (await confirmBox(`Delete “${it.name}”?`, 'This item will be removed from the event.')) {
      e.items = e.items.filter((x) => x !== it);
      commit();
    }
  },
  addPayer: () => {
    const { trip, sub } = currentIds();
    const e = eventById(trip, sub);
    const free = trip.friends.find((f) => !C.payerIds(e).includes(f.id));
    if (!free) return toast('Everyone is already a payer');
    (e.otherPayers ||= []).push({ id: free.id, amount: 0 });
    commit();
    const inputs = app.querySelectorAll('.payamt');
    if (inputs.length) inputs[inputs.length - 1].focus();
  },
  delPayer: (el) => {
    const { trip, sub } = currentIds();
    const e = eventById(trip, sub);
    e.otherPayers.splice(Number(el.dataset.i), 1);
    commit();
  },
  openFriend: (el) => go(`#/f/${currentIds().trip.id}/${el.dataset.id}`),
};

document.addEventListener('click', (ev) => {
  if (ev.target.closest('dialog')) return;
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  ev.preventDefault();
  ev.stopPropagation();
  actions[el.dataset.act]?.(el);
});

// forms
document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  if (form.dataset.form === 'addFriend') {
    const t = tripById(form.dataset.id);
    const name = form.nm.value.trim();
    if (!name) return;
    if (t.friends.some((f) => f.name.toLowerCase() === name.toLowerCase())) return alertBox('Not possible', `“${name}” is already in the list.`);
    const f = { id: C.newId(), name };
    let join = true;
    if (t.events.length) {
      const { value } = await openDialog({
        title: `Add ${name}`, body: `<p style="margin:0" dir="auto">Was ${esc(name)} at the ${t.events.length} events already entered?</p>`,
        buttons: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes, include', cls: '' }],
      });
      if (value === 'cancel') return;
      join = value === 'yes';
    }
    t.friends.push(f);
    if (!join) t.events.forEach((e) => { (e.presence ||= {})[f.id] = C.ABSENT; });
    pendingFocus = '#friendName';
    commit();
  }
});

// live fields in the event editor (saved when the field is left / changed)
document.addEventListener('change', (ev) => {
  const el = ev.target;
  const bind = el.dataset && el.dataset.bind;
  if (!bind) return;
  const { trip, sub } = currentIds();
  const e = eventById(trip, sub);
  if (!e) return;
  if (bind === 'evName') { if (el.value.trim()) e.name = el.value.trim(); }
  if (bind === 'payer' || bind === 'opId') {
    const i = bind === 'opId' ? Number(el.dataset.i) : -1;
    const taken = C.payerIds(e).filter((_, k) => k !== i + 1);
    if (taken.includes(el.value)) { alertBox('Already a payer', 'This friend is already in the payers list.'); render(); return; }
    if (i < 0) e.payerId = el.value; else e.otherPayers[i].id = el.value;
  }
  if (bind === 'opAmt') e.otherPayers[Number(el.dataset.i)].amount = Math.abs(parseAmount(el.value));
  if (bind === 'mainAmt') { const a = Math.abs(parseAmount(el.value)); if (a) e.payerAmount = a; else delete e.payerAmount; }
  if (bind === 'extra' || bind === 'extraKind') {
    const amount = Math.abs(parseAmount(app.querySelector('[data-bind=extra]').value));
    const kind = app.querySelector('[data-bind=extraKind]').value;
    e.extra = kind === 'discount' ? -amount : amount;
  }
  commit();
});

// thousands separators while typing, keeping the cursor in place
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!el.classList || !el.classList.contains('amount')) return;
  const caret = el.selectionStart ?? el.value.length;
  const digitsBefore = el.value.slice(0, caret).replace(/[^\d۰-۹٠-٩]/g, '').length;
  const n = Math.abs(parseAmount(el.value));
  el.value = n ? fmt(n) : '';
  let pos = 0, seen = 0;
  while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value[pos])) seen++; pos++; }
  el.setSelectionRange(pos, pos);
});

// import a file (this app's export or the Windows app's party file)
document.getElementById('importFile').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const t = C.importTrip(await file.text(), file.name.replace(/\.json$/i, ''));
    trips.unshift(t);
    save();
    go(`#/t/${t.id}/result`);
    toast('Imported');
  } catch {
    alertBox('Could not import', 'This file is not a Dostlar trip.');
  }
});

render();
