// Draws the result of a group as a shareable PNG (1080 px wide, height grows with content).
import * as C from './calc.js';

const COLORS = {
  bg: '#f4f7f6', teal: '#00796b', tealDark: '#005b50', mint: '#e0f2f1', card: '#ffffff',
  text: '#1c2222', muted: '#66736f', line: '#e3e9e7', good: '#2e7d32', bad: '#c62828', gold: '#ffc107',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Vazirmatn, Tahoma, sans-serif';
const RTL = /[֐-ࣿ]/;

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Draws text at x (left or right edge per align), shrinking then trimming it to fit maxW. */
function text(ctx, s, x, y, { size = 36, weight = 400, color = COLORS.text, align = 'left', maxW = 2000, min = 24 } = {}) {
  s = String(s);
  ctx.direction = RTL.test(s) ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  ctx.fillStyle = color;
  let sz = size;
  ctx.font = `${weight} ${sz}px ${FONT}`;
  while (ctx.measureText(s).width > maxW && sz > min) { sz -= 2; ctx.font = `${weight} ${sz}px ${FONT}`; }
  if (ctx.measureText(s).width > maxW) {
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    s += '…';
  }
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

// ---- list of costs: every event, its items, and who paid (split into phone-sized pages) ----

const LINE_H = { item: 52, extra: 52, payer: 46 };

/** Returns one canvas per page (1080 wide, at most ~1920 tall). */
export function drawCosts(trip, r, { date = new Date(), maxH = 1920 } = {}) {
  const W = 1080, P = 48, IW = W - 2 * P;
  const HEAD = 190, FOOT = 90, GAP = 22, CARD_TOP = 96, CARD_MID = 30, CARD_BOTTOM = 26, TOTAL_H = 110;

  const blocks = r.events.filter((er) => er.event.items.length).map((er) => {
    const e = er.event;
    const lines = e.items.map((it) => {
      const q = it.kind === C.ORDERED ? Object.values(it.quantities || {}).reduce((a, b) => a + b, 0) : 0;
      return { type: 'item', q, name: it.name, unit: it.kind === C.ORDERED ? it.price : 0, amount: C.itemTotal(it) };
    });
    if (e.extra) lines.push({ type: 'extra', name: e.extra > 0 ? 'Service / tip' : 'Discount', amount: e.extra });
    // main payer first, then the extra payers in the order they were entered
    const payers = [...new Set(C.payerIds(e))].map((id) => [id, er.payments[id] || 0]).filter(([, a]) => a !== 0);
    payers.forEach(([id, a]) => lines.push({ type: 'payer', name: C.nameOf(trip, id), amount: a, many: payers.length > 1 }));
    const h = CARD_TOP + lines.reduce((a, l) => a + LINE_H[l.type], 0) + CARD_MID + CARD_BOTTOM;
    return { er, lines, h };
  });

  const pages = [];
  let cur = [], used = 0;
  const room = maxH - HEAD - FOOT;
  blocks.forEach((b, i) => {
    const need = b.h + (i === blocks.length - 1 ? GAP + TOTAL_H : 0);
    if (cur.length && used + GAP + need > room) { pages.push(cur); cur = []; used = 0; }
    used += (cur.length ? GAP : 0) + b.h;
    cur.push(b);
  });
  pages.push(cur);

  const when = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return pages.map((page, pi) => {
    const last = pi === pages.length - 1;
    const content = page.reduce((a, b) => a + b.h, 0) + GAP * Math.max(0, page.length - 1) + (last ? GAP + TOTAL_H : 0);
    const H = HEAD + content + FOOT;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, W, HEAD);
    grad.addColorStop(0, COLORS.teal);
    grad.addColorStop(1, COLORS.tealDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, HEAD - 30);
    text(ctx, 'LIST OF COSTS', P, 50, { size: 24, weight: 700, color: 'rgba(255,255,255,.75)' });
    text(ctx, trip.name, P, 102, { size: 48, weight: 800, color: '#fff', maxW: IW - 200, min: 30 });
    text(ctx, pages.length > 1 ? `${pi + 1} / ${pages.length}` : when, W - P, 102,
      { size: 30, weight: 700, color: 'rgba(255,255,255,.85)', align: 'right' });

    let y = HEAD;
    for (const { er, lines, h } of page) {
      roundRect(ctx, P, y, IW, h, 26, COLORS.card);
      ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2; ctx.stroke();
      roundRect(ctx, P, y, IW, 76, 26, COLORS.mint);
      ctx.fillStyle = COLORS.mint; ctx.fillRect(P, y + 50, IW, 26);
      text(ctx, er.event.name, P + 28, y + 40, { size: 34, weight: 800, color: COLORS.tealDark, maxW: IW - 330 });
      text(ctx, C.fmt(er.total), W - P - 28, y + 40, { size: 34, weight: 800, color: COLORS.tealDark, align: 'right' });

      let ly = y + CARD_TOP;
      let firstPayer = true;
      for (const l of lines) {
        if (l.type === 'payer' && firstPayer) {
          firstPayer = false;
          ctx.fillStyle = COLORS.line;
          ctx.fillRect(P + 28, ly + CARD_MID / 2 - 1, IW - 56, 2);
          ly += CARD_MID;
        }
        const cy = ly + LINE_H[l.type] / 2;
        if (l.type === 'item') {
          const qx = P + 28;
          if (l.q) text(ctx, `${l.q} ×`, qx + 60, cy, { size: 28, weight: 800, color: COLORS.teal, align: 'right' });
          const nw = text(ctx, l.name, qx + 76, cy, { size: 29, weight: 600, maxW: IW - 440 });
          if (l.unit && l.q > 1) text(ctx, `@ ${C.fmt(l.unit)}`, qx + 76 + nw + 14, cy + 2, { size: 22, color: COLORS.muted });
          text(ctx, C.fmt(l.amount), W - P - 28, cy, { size: 29, align: 'right' });
        } else if (l.type === 'extra') {
          text(ctx, l.name, P + 28 + 76, cy, { size: 27, color: COLORS.muted });
          text(ctx, (l.amount < 0 ? '−' : '+') + C.fmt(Math.abs(l.amount)), W - P - 28, cy, { size: 27, color: COLORS.muted, align: 'right' });
        } else {
          const lw = text(ctx, 'Paid by', P + 28, cy, { size: 26, color: COLORS.muted });
          text(ctx, l.name, P + 28 + lw + 12, cy, { size: 28, weight: 800, color: COLORS.good, maxW: IW - 420 });
          if (l.many) text(ctx, C.fmt(l.amount), W - P - 28, cy, { size: 28, weight: 700, color: COLORS.good, align: 'right' });
        }
        ly += LINE_H[l.type];
      }
      y += h + GAP;
    }
    if (last) {
      roundRect(ctx, P, y, IW, TOTAL_H, 26, COLORS.teal);
      text(ctx, 'Total', P + 32, y + TOTAL_H / 2, { size: 36, weight: 700, color: '#fff' });
      text(ctx, C.fmt(r.total), W - P - 32, y + TOTAL_H / 2, { size: 44, weight: 800, color: '#fff', align: 'right' });
    }
    if (pages.length > 1) text(ctx, when, P, H - 48, { size: 24, color: COLORS.muted });
    text(ctx, 'Made with Dostlar', W - P, H - 48, { size: 24, weight: 700, color: COLORS.teal, align: 'right' });
    return canvas;
  });
}

// ---- shared page frame for the paged images ----

const PAGE = { W: 1080, P: 48, HEAD: 190, FOOT: 90, MAX: 1920 };

function newPage(H, label, trip, pageNo, pageCount, when) {
  const { W, P, HEAD } = PAGE;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, HEAD);
  grad.addColorStop(0, COLORS.teal);
  grad.addColorStop(1, COLORS.tealDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEAD - 30);
  text(ctx, label, P, 50, { size: 24, weight: 700, color: 'rgba(255,255,255,.75)' });
  text(ctx, trip.name, P, 102, { size: 48, weight: 800, color: '#fff', maxW: W - 2 * P - 200, min: 30 });
  text(ctx, pageCount > 1 ? `${pageNo} / ${pageCount}` : when, W - P, 102,
    { size: 30, weight: 700, color: 'rgba(255,255,255,.85)', align: 'right' });
  if (pageCount > 1) text(ctx, when, P, H - 48, { size: 24, color: COLORS.muted });
  text(ctx, 'Made with Dostlar', W - P, H - 48, { size: 24, weight: 700, color: COLORS.teal, align: 'right' });
  return { canvas, ctx };
}

/** Splits rows of fixed height into pages; extra = space each page needs besides the rows. */
function chunk(rows, rowH, gap, extraFirst, extraLast) {
  const room = PAGE.MAX - PAGE.HEAD - PAGE.FOOT;
  const pages = [];
  let i = 0;
  while (i < rows.length || !pages.length) {
    let n = 0, used = extraFirst;
    while (i + n < rows.length && used + (n ? gap : 0) + rowH <= room) { used += (n ? gap : 0) + rowH; n++; }
    if (!n && i < rows.length) n = 1;
    pages.push(rows.slice(i, i + n));
    i += n;
    if (i >= rows.length) break;
  }
  // make sure the closing block fits on the last page
  const lastRows = pages[pages.length - 1].length;
  if (extraFirst + lastRows * (rowH + gap) + extraLast > room && lastRows > 1) {
    const moved = pages[pages.length - 1].splice(-1);
    pages.push(moved);
  }
  return pages;
}

// ---- image 1: who pays whom ----

export function drawTransfers(trip, r, { date = new Date() } = {}) {
  const { W, P, HEAD, FOOT } = PAGE, IW = W - 2 * P;
  const ROW = 116, GAP = 16, TOTAL = 110;
  const when = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const rows = r.transfers.length ? r.transfers : [null];
  const pages = chunk(rows, ROW, GAP, 0, GAP + TOTAL);
  return pages.map((rowsOnPage, pi) => {
    const last = pi === pages.length - 1;
    const H = HEAD + rowsOnPage.length * (ROW + GAP) - GAP + (last ? GAP + TOTAL : 0) + FOOT;
    const { canvas, ctx } = newPage(H, 'WHO PAYS WHOM', trip, pi + 1, pages.length, when);
    let y = HEAD;
    for (const t of rowsOnPage) {
      roundRect(ctx, P, y, IW, ROW, 26, COLORS.card);
      ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2; ctx.stroke();
      if (!t) {
        text(ctx, 'Everyone is settled', W / 2, y + ROW / 2, { size: 36, weight: 700, color: COLORS.good, align: 'center' });
      } else {
        roundRect(ctx, P, y, 12, ROW, 6, COLORS.gold);
        const amountW = text(ctx, C.fmt(t.amount), W - P - 32, y + ROW / 2, { size: 44, weight: 800, align: 'right' });
        const nameMax = (IW - amountW - 140) / 2;
        const cx = P + 40;
        const fromW = text(ctx, C.nameOf(trip, t.from), cx, y + ROW / 2, { size: 38, weight: 700, color: COLORS.bad, maxW: nameMax });
        text(ctx, '→', cx + fromW + 16, y + ROW / 2, { size: 38, weight: 700, color: COLORS.muted });
        text(ctx, C.nameOf(trip, t.to), cx + fromW + 70, y + ROW / 2, { size: 38, weight: 700, color: COLORS.good, maxW: nameMax });
      }
      y += ROW + GAP;
    }
    if (last) {
      roundRect(ctx, P, y, IW, TOTAL, 26, COLORS.teal);
      text(ctx, 'Total spent', P + 32, y + TOTAL / 2, { size: 34, weight: 700, color: '#fff' });
      text(ctx, C.fmt(r.total), W - P - 32, y + TOTAL / 2, { size: 44, weight: 800, color: '#fff', align: 'right' });
    }
    return canvas;
  });
}

// ---- image 2: each friend (spent / share / balance) ----

export function drawFriends(trip, r, { date = new Date() } = {}) {
  const { W, P, HEAD, FOOT } = PAGE, IW = W - 2 * P;
  const ROW = 84, TH = 72, LEGEND = 80;
  const when = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const pages = chunk(r.people, ROW, 0, TH + 20, LEGEND);
  return pages.map((people, pi) => {
    const last = pi === pages.length - 1;
    const tableH = TH + people.length * ROW + 16;
    const H = HEAD + tableH + (last ? LEGEND : 0) + FOOT;
    const { canvas, ctx } = newPage(H, 'EACH FRIEND', trip, pi + 1, pages.length, when);
    let y = HEAD;
    roundRect(ctx, P, y, IW, tableH, 26, COLORS.card);
    ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2; ctx.stroke();
    const colSpent = P + IW * 0.52, colShare = P + IW * 0.74, colBal = W - P - 28;
    const hy = y + 40;
    text(ctx, 'Friend', P + 28, hy, { size: 26, weight: 700, color: COLORS.muted });
    text(ctx, 'Spent', colSpent, hy, { size: 26, weight: 700, color: COLORS.muted, align: 'right' });
    text(ctx, 'Share', colShare, hy, { size: 26, weight: 700, color: COLORS.muted, align: 'right' });
    text(ctx, 'Balance', colBal, hy, { size: 26, weight: 700, color: COLORS.muted, align: 'right' });
    y += TH;
    people.forEach((p, i) => {
      if (i % 2 === 0) { ctx.fillStyle = '#f2f7f6'; ctx.fillRect(P + 2, y, IW - 4, ROW); }
      const cy = y + ROW / 2;
      text(ctx, p.friend.name, P + 28, cy, { size: 32, weight: 600, maxW: IW * 0.52 - 210 });
      text(ctx, C.fmt(p.paid), colSpent, cy, { size: 28, color: COLORS.muted, align: 'right' });
      text(ctx, C.fmt(p.share), colShare, cy, { size: 28, color: COLORS.muted, align: 'right' });
      const b = p.balance;
      text(ctx, b > 0 ? `+${C.fmt(b)}` : b < 0 ? `−${C.fmt(-b)}` : '0', colBal, cy,
        { size: 30, weight: 800, color: b > 0 ? COLORS.good : b < 0 ? COLORS.bad : COLORS.muted, align: 'right' });
      y += ROW;
    });
    if (last) {
      y += 16;
      text(ctx, '+ gets back from the others    − pays to the others', P + 8, y + LEGEND / 2, { size: 26, color: COLORS.muted });
    }
    return canvas;
  });
}
