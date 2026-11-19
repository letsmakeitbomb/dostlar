// Dostlar – cost splitting logic (same maths as the Windows app and the Kotlin version).
// Amounts are whole numbers. Parts are kept as exact fractions (BigInt) and each person's
// total is rounded only once, so people who had the same things get identical shares.

export const PAYS = 'PAYS';       // was there, pays own part
export const TREATED = 'TREATED'; // was there, the others pay their part (birthday)
export const ABSENT = 'ABSENT';   // was not there
export const ORDERED = 'ORDERED'; // unit price × quantity per friend
export const SHARED = 'SHARED';   // one price split equally among those who pay

export function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---- exact fractions ----------------------------------------------------------------

const absB = (a) => (a < 0n ? -a : a);
function gcd(a, b) { a = absB(a); b = absB(b); while (b) [a, b] = [b, a % b]; return a; }

export class Q {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new Error('division by zero');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  static of(n, d = 1) { return new Q(BigInt(n), BigInt(d)); }
  add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  mul(o) { return new Q(this.n * o.n, this.d * o.d); }
  get zero() { return this.n === 0n; }
  /** floor(x + 1/2), like the desktop app. */
  round() {
    const num = this.n * 2n + this.d, den = this.d * 2n;
    let q = num / den;
    if (num < 0n && q * den !== num) q -= 1n;
    return Number(q);
  }
}
export const ZERO = new Q(0n);
const sumQ = (arr) => arr.reduce((a, b) => a.add(b), ZERO);

// ---- helpers ------------------------------------------------------------------------

export const presenceOf = (ev, fid) => (ev.presence && ev.presence[fid]) || PAYS;
export const nameOf = (trip, fid) => (trip.friends.find((f) => f.id === fid) || {}).name || '?';
/** Extra payers besides the main one: [{id, amount}]. The main payer (payerId) pays the rest. */
export const otherPayers = (ev) => ev.otherPayers || [];
export const payerIds = (ev) => [ev.payerId, ...otherPayers(ev).map((p) => p.id)];
export const itemTotal = (it) =>
  it.kind === ORDERED ? it.price * Object.values(it.quantities || {}).reduce((a, b) => a + b, 0) : it.price;

// ---- one event ----------------------------------------------------------------------

/**
 * Returns { event, total, payments: {fid: amount}, shares: {fid: Q}, parts: {fid: [{item, own, forTreated, shared, total}]},
 *           extraParts: {fid: Q}, problems: [string] }
 */
export function eventResult(trip, ev) {
  const members = trip.friends.map((f) => f.id);
  const payers = members.filter((f) => presenceOf(ev, f) === PAYS);
  const problems = [];
  if (payers.length === 0) {
    problems.push('Nobody pays in this event.');
    return { event: ev, total: 0, payments: payments(trip, ev, 0, problems), shares: {}, parts: {}, extraParts: {}, problems };
  }

  const parts = {}; // fid -> Map(itemId -> part)
  const add = (fid, item, key, q) => {
    const m = (parts[fid] ||= new Map());
    const p = m.get(item.id) || { item, own: ZERO, forTreated: ZERO, shared: ZERO };
    p[key] = p[key].add(q);
    m.set(item.id, p);
  };

  let subtotal = 0;
  for (const item of ev.items || []) {
    if (item.kind === ORDERED) {
      let allocated = 0;
      for (const fid of members) {
        const q = (item.quantities || {})[fid] || 0;
        if (q <= 0) continue;
        const cost = item.price * q;
        const pr = presenceOf(ev, fid);
        if (pr === ABSENT) { problems.push(`${nameOf(trip, fid)} is away but has '${item.name}'; ignored.`); continue; }
        if (pr === PAYS) add(fid, item, 'own', Q.of(cost));
        else { const each = Q.of(cost, payers.length); payers.forEach((p) => add(p, item, 'forTreated', each)); }
        allocated += cost;
      }
      if (allocated === 0 && item.price > 0) problems.push(`Nobody ordered '${item.name}'.`);
      subtotal += allocated;
    } else {
      const excl = new Set(item.excluded || []);
      const sharers = payers.filter((p) => !excl.has(p));
      if (sharers.length === 0) { problems.push(`Nobody shares '${item.name}'.`); continue; }
      const each = Q.of(item.price, sharers.length);
      sharers.forEach((p) => add(p, item, 'shared', each));
      subtotal += item.price;
    }
  }

  const shares = {};
  const outParts = {};
  for (const [fid, m] of Object.entries(parts)) {
    const list = [...m.values()].map((p) => ({ ...p, total: p.own.add(p.forTreated).add(p.shared) }))
      .filter((p) => !p.total.zero);
    outParts[fid] = list;
    shares[fid] = sumQ(list.map((p) => p.total));
  }

  const extraParts = {};
  let total = subtotal;
  const extra = ev.extra || 0;
  if (extra !== 0) {
    if (subtotal + extra < 0) problems.push('The discount is larger than the bill; ignored.');
    else {
      total += extra;
      if (subtotal > 0) for (const [fid, s] of Object.entries(shares)) extraParts[fid] = s.mul(Q.of(extra, subtotal));
      else payers.forEach((p) => (extraParts[p] = Q.of(extra, payers.length)));
      for (const [fid, x] of Object.entries(extraParts)) shares[fid] = (shares[fid] || ZERO).add(x);
    }
  }
  return { event: ev, total, payments: payments(trip, ev, total, problems), shares, parts: outParts, extraParts, problems };
}

/** Who paid how much of this event: extra payers their amounts, the main payer the rest. */
function payments(trip, ev, total, problems) {
  const out = {};
  let others = 0;
  for (const p of otherPayers(ev)) {
    const a = Math.max(0, Math.round(p.amount || 0));
    out[p.id] = (out[p.id] || 0) + a;
    others += a;
  }
  const rest = total - others;
  if (rest < 0) problems.push(`The payers' amounts are ${fmt(others)}, more than the bill (${fmt(total)}).`);
  out[ev.payerId] = (out[ev.payerId] || 0) + rest;
  return out;
}

// ---- whole trip ---------------------------------------------------------------------

export function tripResult(trip) {
  const events = (trip.events || []).map((e) => eventResult(trip, e));
  const ids = trip.friends.map((f) => f.id);
  const paid = Object.fromEntries(ids.map((i) => [i, 0]));
  const exact = Object.fromEntries(ids.map((i) => [i, ZERO]));
  for (const r of events) {
    for (const [fid, a] of Object.entries(r.payments)) if (fid in paid) paid[fid] += a;
    for (const [fid, s] of Object.entries(r.shares)) if (fid in exact) exact[fid] = exact[fid].add(s);
  }
  // Round each person's total once; the few units lost/gained go to whoever spent the most.
  const share = Object.fromEntries(ids.map((i) => [i, exact[i].round()]));
  const diff = ids.reduce((a, i) => a + paid[i], 0) - ids.reduce((a, i) => a + share[i], 0);
  if (diff !== 0 && ids.length) {
    let top = ids[0];
    for (const i of ids) if (paid[i] > paid[top]) top = i;
    share[top] += diff;
  }
  const people = trip.friends.map((f) => ({ friend: f, paid: paid[f.id], share: share[f.id], balance: paid[f.id] - share[f.id] }));
  return { events, people, transfers: settle(people), total: events.reduce((a, r) => a + r.total, 0) };
}

/** Greedy: largest debtor pays largest creditor until everything is settled. */
export function settle(people) {
  const debtors = people.filter((p) => p.balance < 0).map((p) => ({ id: p.friend.id, left: -p.balance }))
    .sort((a, b) => b.left - a.left);
  const creditors = people.filter((p) => p.balance > 0).map((p) => ({ id: p.friend.id, left: p.balance }))
    .sort((a, b) => b.left - a.left);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].left -= amount; creditors[j].left -= amount;
    if (debtors[i].left === 0) i++;
    if (creditors[j].left === 0) j++;
  }
  return out;
}

// ---- text, import -------------------------------------------------------------------

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function shareText(trip, r) {
  const lines = [trip.name, `Total: ${fmt(r.total)}`, ''];
  if (!r.transfers.length) lines.push('Everyone is settled.');
  else {
    lines.push('Who pays whom:');
    r.transfers.forEach((t) => lines.push(`• ${nameOf(trip, t.from)} → ${nameOf(trip, t.to)}: ${fmt(t.amount)}`));
  }
  lines.push('', 'Shares:');
  r.people.forEach((p) => lines.push(`• ${p.friend.name}: spent ${fmt(p.paid)}, share ${fmt(p.share)}`));
  return lines.join('\n');
}

/** Accepts this app's export and the Windows app's party file. Always returns a new trip id. */
export function importTrip(text, fallbackName) {
  const data = JSON.parse(text);
  if (Array.isArray(data.expenses)) {
    const friends = (data.friends || []).map((n) => ({ id: newId(), name: String(n) }));
    const byName = Object.fromEntries(friends.map((f) => [f.name, f]));
    const events = [];
    for (const e of data.expenses) {
      const payer = byName[e.payer];
      if (!payer) continue;
      const desc = e.description || 'Expense';
      const amount = Math.round(Number(e.amount)) || 0;
      const parts = new Set(e.participants || []);
      const presence = {};
      if (parts.size) friends.filter((f) => !parts.has(f.name)).forEach((f) => (presence[f.id] = TREATED));
      events.push({ id: newId(), name: desc, payerId: payer.id, presence, extra: 0,
        items: [{ id: newId(), name: desc, kind: SHARED, price: amount, quantities: {}, excluded: [] }] });
    }
    return { id: newId(), name: fallbackName, friends, events, createdAt: Date.now() };
  }
  if (!Array.isArray(data.friends) || !Array.isArray(data.events)) throw new Error('Unknown file');
  return migrate({ ...data, id: newId(), createdAt: data.createdAt || Date.now() });
}

/**
 * Older data: a single shared item with people unticked on the item. Show those people as
 * "Treated" on the event instead (identical result, and it matches what the screen shows).
 */
export function migrate(trip) {
  for (const e of trip.events || []) {
    const it = e.items && e.items.length === 1 ? e.items[0] : null;
    if (!it || it.kind !== SHARED || !(it.excluded || []).length) continue;
    e.presence ||= {};
    for (const fid of it.excluded) if (presenceOf(e, fid) === PAYS) e.presence[fid] = TREATED;
    it.excluded = [];
  }
  return trip;
}
