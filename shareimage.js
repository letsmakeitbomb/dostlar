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

export function drawResult(trip, r, { date = new Date() } = {}) {
  const W = 1080, P = 56, IW = W - 2 * P;
  const HEADER = 300, SECTION = 96, TR_H = 116, TR_GAP = 16, ROW_H = 84, FOOT = 120;
  const trH = r.transfers.length ? r.transfers.length * (TR_H + TR_GAP) - TR_GAP : 96;
  const tableH = 72 + r.people.length * ROW_H;
  const H = HEADER + SECTION + trH + SECTION + tableH + FOOT;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // ---- header ----
  const grad = ctx.createLinearGradient(0, 0, W, HEADER);
  grad.addColorStop(0, COLORS.teal);
  grad.addColorStop(1, COLORS.tealDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEADER);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(W - 90, 60, 170, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W - 250, HEADER + 20, 110, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  text(ctx, 'DOSTLAR', P, 62, { size: 26, weight: 700, color: 'rgba(255,255,255,.75)' });
  text(ctx, trip.name, P, 126, { size: 58, weight: 800, color: '#fff', maxW: IW, min: 34 });
  const when = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  text(ctx, `${trip.friends.length} friends · ${trip.events.length} events · ${when}`, P, 186,
    { size: 30, color: 'rgba(255,255,255,.85)', maxW: IW });
  text(ctx, 'Total', P, 246, { size: 30, color: 'rgba(255,255,255,.85)' });
  text(ctx, C.fmt(r.total), P + 100, 244, { size: 44, weight: 800, color: '#fff' });

  // ---- who pays whom ----
  let y = HEADER;
  text(ctx, 'Who pays whom', P, y + 58, { size: 38, weight: 800, color: COLORS.teal });
  y += SECTION;
  if (!r.transfers.length) {
    roundRect(ctx, P, y, IW, 96, 24, COLORS.mint);
    text(ctx, 'Everyone is settled 🎉', W / 2, y + 48, { size: 34, weight: 600, align: 'center' });
    y += 96;
  }
  for (const t of r.transfers) {
    roundRect(ctx, P, y, IW, TR_H, 26, COLORS.card);
    ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2; ctx.stroke();
    roundRect(ctx, P, y, 12, TR_H, 6, COLORS.gold);
    const amountW = text(ctx, C.fmt(t.amount), W - P - 32, y + TR_H / 2, { size: 44, weight: 800, align: 'right' });
    const nameMax = (IW - amountW - 140) / 2;
    const cx = P + 40;
    const fromW = text(ctx, C.nameOf(trip, t.from), cx, y + TR_H / 2, { size: 38, weight: 700, color: COLORS.bad, maxW: nameMax });
    text(ctx, '→', cx + fromW + 16, y + TR_H / 2, { size: 38, weight: 700, color: COLORS.muted });
    text(ctx, C.nameOf(trip, t.to), cx + fromW + 70, y + TR_H / 2, { size: 38, weight: 700, color: COLORS.good, maxW: nameMax });
    y += TR_H + TR_GAP;
  }
  if (r.transfers.length) y -= TR_GAP;

  // ---- each friend ----
  text(ctx, 'Each friend', P, y + 58, { size: 38, weight: 800, color: COLORS.teal });
  y += SECTION;
  roundRect(ctx, P, y, IW, tableH, 26, COLORS.card);
  const colSpent = P + IW * 0.52, colShare = P + IW * 0.74, colBal = W - P - 28;
  const hy = y + 38;
  text(ctx, 'Friend', P + 28, hy, { size: 26, weight: 700, color: COLORS.muted });
  text(ctx, 'Spent', colSpent, hy, { size: 26, weight: 700, color: COLORS.muted, align: 'right' });
  text(ctx, 'Share', colShare, hy, { size: 26, weight: 700, color: COLORS.muted, align: 'right' });
  text(ctx, 'Balance', colBal, hy, { size: 26, weight: 700, color: COLORS.muted, align: 'right' });
  y += 72;
  r.people.forEach((p, i) => {
    if (i % 2 === 0) { ctx.fillStyle = '#f7faf9'; ctx.fillRect(P + 2, y, IW - 4, ROW_H); }
    const cy = y + ROW_H / 2;
    text(ctx, p.friend.name, P + 28, cy, { size: 32, weight: 600, maxW: IW * 0.52 - 210 });
    text(ctx, C.fmt(p.paid), colSpent, cy, { size: 28, color: COLORS.muted, align: 'right' });
    text(ctx, C.fmt(p.share), colShare, cy, { size: 28, color: COLORS.muted, align: 'right' });
    const b = p.balance;
    text(ctx, b > 0 ? `+${C.fmt(b)}` : b < 0 ? `−${C.fmt(-b)}` : '0', colBal, cy,
      { size: 30, weight: 800, color: b > 0 ? COLORS.good : b < 0 ? COLORS.bad : COLORS.muted, align: 'right' });
    y += ROW_H;
  });

  // ---- footer ----
  text(ctx, '+ gets back   − pays', P, H - 62, { size: 26, color: COLORS.muted });
  text(ctx, 'Made with Dostlar', W - P, H - 62, { size: 26, weight: 700, color: COLORS.teal, align: 'right' });
  return canvas;
}
