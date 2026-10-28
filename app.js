/* Bulk Trade Stats — static, no backend. Reads the public Bulk Exchange REST API straight from the browser. */
(() => {
'use strict';
const API = 'https://mainnet-api1.bulk.trade/api/v1';
const VERSION = 'v1.0';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 2) => x == null || !isFinite(x) ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (x, d = 2) => x == null || !isFinite(x) ? '—' : (x < 0 ? '−' : '') + '$' + fmt(Math.abs(x), d);
const smoney = (x, d = 2) => x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + '$' + fmt(Math.abs(x), d);
const big = x => { const a = Math.abs(x); return a >= 1e9 ? fmt(x / 1e9, 2) + 'B' : a >= 1e6 ? fmt(x / 1e6, 2) + 'M' : a >= 1e4 ? fmt(x / 1e3, 1) + 'K' : fmt(x, 0); };
const cls = x => x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '';
const pxf = p => p == null ? '—' : p >= 1000 ? fmt(p, 2) : p >= 1 ? fmt(p, 3) : fmt(p, 5);
const qf = q => { const a = Math.abs(q); return a >= 1000 ? fmt(q, 1) : a >= 1 ? fmt(q, 3) : fmt(q, 5); };
const dt = ms => new Date(ms).toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
const dtl = ms => new Date(ms).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
const dshort = ms => new Date(ms).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const dur = s => { s = Math.max(0, s | 0); const d = s / 86400 | 0, h = (s % 86400) / 3600 | 0, m = (s % 3600) / 60 | 0; return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const sym = s => String(s).replace(/-USD$/, '');
const DAY = 864e5;

/* ---------------------------------------------------------------- API (public limit: 5 req/s per IP, 150 burst) */
let lastReq = 0;
async function post(body) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastReq + 230 - Date.now(); if (wait > 0) await sleep(wait); lastReq = Date.now();
    let r;
    try { r = await fetch(API + '/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { if (attempt < 3) { await sleep(800 * (attempt + 1)); continue; } throw new Error('Network error: could not reach the Bulk API'); }
    if (r.status === 429 && attempt < 6) { const ra = parseFloat(r.headers.get('Retry-After')); await sleep(ra > 0 ? ra * 1000 : 1000 * 2 ** attempt); continue; }
    let j = null; try { j = await r.json(); } catch (e) { }
    if (!r.ok) { const err = new Error((j && j.error && j.error.message) || 'HTTP ' + r.status); err.code = j && j.error && j.error.code; throw err; }
    return j;
  }
}
async function fetchHistory(type, user, label, maxPages = 40) {   // newest-first pages of up to 5000 rows, continued with the opaque cursor
  const rows = []; let cursor = null;
  for (let p = 0; p < maxPages; p++) {
    const j = await post(cursor ? { type, user, limit: 5000, cursor } : { type, user, limit: 5000 });
    rows.push(...(j.data || [])); const info = j.page || {};
    status(`Loading ${label}… ${fmt(rows.length, 0)} rows`, true);
    if (!info.hasMore || !info.nextCursor) return { rows, truncated: false };
    cursor = info.nextCursor;
  }
  return { rows, truncated: true };
}

/* ---------------------------------------------------------------- charts */
function lineChart(box, pts, o) {
  const W = box.clientWidth || 500, H = box.clientHeight || 220, m = { l: 54, r: 10, t: 8, b: 22 };
  if (pts.length < 2) { box.innerHTML = '<div class="empty">Not enough data</div>'; return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let y0 = Math.min(...ys), y1 = Math.max(...ys); if (o.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 - y0 < (o.minRange || 1e-9)) { const c = (y0 + y1) / 2; y0 = c - (o.minRange || 1) / 2; y1 = c + (o.minRange || 1) / 2; }
  const pad = (y1 - y0) * .08; y0 -= pad; y1 += pad;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const X = t => m.l + (t - x0) / ((x1 - x0) || 1) * (W - m.l - m.r), Y = v => H - m.b - (v - y0) / ((y1 - y0) || 1) * (H - m.t - m.b);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, y = Y(v); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${o.axis(v)}</text>`; }
  for (let i = 0; i <= 4; i++) { const t = x0 + (x1 - x0) * i / 4; g += `<text x="${X(t)}" y="${H - 5}" text-anchor="${i == 0 ? 'start' : i == 4 ? 'end' : 'middle'}" font-size="11" fill="var(--ink-3)">${o.xfmt(t)}</text>`; }
  if (o.zero) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`;
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  const base = Y(Math.max(y0, Math.min(y1, 0)));
  const area = o.area ? `<path d="${d}L${X(x1)} ${base}L${X(x0)} ${base}Z" fill="${o.color}" opacity=".10"/>` : '';
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}${area}<path d="${d}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><g class="hv" style="display:none"><line y1="${m.t}" y2="${H - m.b}" stroke="var(--ink-3)"/><circle r="4" fill="${o.color}" stroke="var(--surface)" stroke-width="2"/></g></svg><div class="tt"></div>`;
  hover(box, W, H, (px) => {
    let lo = 0, hi = pts.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (X(pts[mid][0]) < px) lo = mid + 1; else hi = mid; }
    const p = pts[lo]; return { x: X(p[0]), y: Y(p[1]), html: `<span class="k">${o.tfmt(p[0])}</span><br><b class="num">${o.tip(p[1])}</b>` };
  });
}
function barChart(box, items, o) {
  const W = box.clientWidth || 500, H = box.clientHeight || 220, m = { l: 54, r: 8, t: 8, b: 24 };
  if (!items.length) { box.innerHTML = '<div class="empty">No data</div>'; return; }
  let y0 = Math.min(0, ...items.map(i => i.v)), y1 = Math.max(0, ...items.map(i => i.v)); if (y1 === y0) y1 = y0 + 1;
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b), bw = (W - m.l - m.r) / items.length, gap = Math.min(2, bw * .15);
  let g = ''; for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, y = Y(v); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${o.axis(v)}</text>`; }
  const step = Math.ceil(items.length / 8);
  const bars = items.map((it, i) => {
    const w = Math.max(1, Math.min(bw - gap, 56)), x = m.l + i * bw + (bw - w) / 2, yy = Y(Math.max(it.v, 0)), h = Math.max(1, Math.abs(Y(it.v) - Y(0)));
    const lab = i % step === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(it.label)}</text>` : '';
    return `<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="${Math.min(3, w / 3)}" fill="${o.color}" data-i="${i}"/>${lab}`;
  }).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink-3)"/>${bars}</svg><div class="tt"></div>`;
  const tip = $('.tt', box), svg = $('svg', box);
  box.onmousemove = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width), i = Math.max(0, Math.min(items.length - 1, Math.floor((px - m.l) / bw)));
    tip.style.display = 'block'; tip.innerHTML = `<span class="k">${esc(items[i].label)}</span><br><b class="num">${o.tip(items[i].v, items[i])}</b>`;
    const bx = box.getBoundingClientRect(); let lx = e.clientX - bx.left + 14; if (lx > bx.width - 150) lx = e.clientX - bx.left - 150; tip.style.left = lx + 'px'; tip.style.top = '8px';
  };
  box.onmouseleave = () => tip.style.display = 'none';
}
function hover(box, W, H, f) {
  const svg = $('svg', box), hv = $('.hv', svg), tip = $('.tt', box);
  box.onmousemove = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width), p = f(px);
    hv.style.display = ''; const l = hv.firstChild; l.setAttribute('x1', p.x); l.setAttribute('x2', p.x);
    const c = hv.lastChild; c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    tip.style.display = 'block'; tip.innerHTML = p.html;
    const bx = box.getBoundingClientRect(); let lx = e.clientX - bx.left + 14; if (lx > bx.width - 150) lx = e.clientX - bx.left - 150; tip.style.left = lx + 'px'; tip.style.top = '8px';
  };
  box.onmouseleave = () => { hv.style.display = 'none'; tip.style.display = 'none'; };
}


/* ---------------------------------------------------------------- state & derived data */
let S = null, AURA = null;
// Weekly Aura periods run Saturday to Saturday: pre-deposit week 1 started 6 Jun 2026, mainnet week 1 on 12 Sep 2026 (= pre-deposit week 14 + 7 days), Challenger season 1 on 10 Oct 2026.
const WK = { pre: Date.UTC(2026, 5, 6), main: Date.UTC(2026, 8, 12), ch: Date.UTC(2026, 9, 10) };
const wkRange = (base, n) => { const f = base + (n - 1) * 7 * 864e5; return ' (' + dshort(f) + ' – ' + dshort(f + 7 * 864e5) + ')'; };
const auraName = k => { let m;
  if (m = /^mainnet_week(\d+)_(\w+)$/.exec(k)) return 'Week ' + m[1] + ' ' + m[2] + wkRange(WK.main, +m[1]);
  if (m = /^challenger_week_(\d+)_(\w+)$/.exec(k)) return 'Week ' + m[1] + ' ' + m[2] + wkRange(WK.ch, +m[1]);
  if (m = /^predeposit_referral_week(\d+)$/.exec(k)) return 'Pre-deposit referral wk ' + m[1] + wkRange(WK.pre, +m[1]);
  if (m = /^predeposit_week(\d+)$/.exec(k)) return 'Pre-deposit week ' + m[1] + wkRange(WK.pre, +m[1]);
  return k.replace(/_/g, ' '); };
const auraSort = k => { const m = /(\d+)/.exec(k); return (m ? +m[1] : 0) + (/^predeposit/.test(k) ? -100 : 0); };
fetch('aura.json').then(r => r.json()).then(j => { AURA = { fetchedAt: j.fetchedAt, total: j.total, rows: j.rows, map: Object.fromEntries(j.rows.map(x => [x.w, x])) }; drawAuraWeeks(); drawAuraAll(); if (S) render(); }).catch(() => { });
const PERIODS = [['all', 'All time'], ['1d', 'Last 24h'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['custom', 'Custom range…']];
let period = store.get('bulk.period', { k: 'all' });
function getPeriod() {
  if (period.k === 'all') return null;
  if (period.k === 'custom') return period.from != null && period.to != null ? { from: period.from, to: period.to, label: dtl(period.from) + ' → ' + dtl(period.to) + ' GMT' } : null;
  const d = { '1d': 1, '7d': 7, '30d': 30 }[period.k], now = Date.now();
  return { from: now - d * DAY, to: now, label: 'Last ' + (d === 1 ? '24 hours' : d + ' days') };
}
function normalize(S) {
  const me = new Set([S.addr]);
  S.fills.forEach(f => { if (f.isoPubkey) me.add(f.isoPubkey); });
  S.fills = S.fills.map(f => ({ t: f.timestamp / 1e6, sym: f.symbol, buy: !!f.isBuy, sz: f.amount, px: f.price, notional: f.amount * f.price, fee: f.fee, maker: me.has(f.maker) && !(me.has(f.taker) && f.fee === f.takerFee && f.fee !== f.makerFee), liq: f.reasonCode ? (f.reason || 'liquidation') : null }));
  S.closed = S.closed.map(c => ({ sym: c.symbol, long: c.quantity > 0, sz: Math.abs(c.quantity), vol: c.totalVolume * (c.avgOpenPrice + c.avgClosePrice) / 2, open: c.avgOpenPrice, close: c.avgClosePrice, rpnl: c.realizedPnl, fee: c.fees, fund: c.funding, net: c.realizedPnl + c.fees + c.funding, t0: c.openTime / 1e6, t1: c.closeTime / 1e6, reason: c.closeReason }));
  S.funding = S.funding.map(f => ({ t: f.timestamp / 1e6, sym: f.symbol, pay: f.payment }));
  S.acts = S.acts.map(a => ({ t: a.timestamp / 1e6, type: a.activityType, status: a.status, from: a.from, to: a.to, amount: a.amount }));
}
const inP = (t, p) => !p || (t >= p.from && t <= p.to);
function derive(S, p) {
  const F = S.fills.filter(f => inP(f.t, p)), C = S.closed.filter(c => inP(c.t1, p)), FU = S.funding.filter(f => inP(f.t, p)), A = S.acts.filter(a => inP(a.t, p) && a.status === 'completed');
  const D = { F, C, FU, A, vol: 0, fvol: 0, mvol: 0, tvol: 0, fees: 0, mfee: 0, tfee: 0, rpnl: 0, fund: 0, liqs: 0, mk: {}, day: {}, hour: Array(24).fill(0), ev: [] };
  const mk = s => D.mk[s] || (D.mk[s] = { sym: s, vol: 0, fills: 0, fees: 0, fund: 0, rpnl: 0, closed: 0, wins: 0 });
  const dayOf = t => { const d = new Date(t).toISOString().slice(0, 10); return D.day[d] || (D.day[d] = { vol: 0, pnl: 0, fills: 0 }); };
  for (const f of F) {
    D.fvol += f.notional; if (f.liq) D.liqs++;
    if (f.maker) { D.mvol += f.notional; D.mfee += f.fee; } else { D.tvol += f.notional; D.tfee += f.fee; }
    mk(f.sym).fills++; dayOf(f.t).fills++;
    D.hour[new Date(f.t).getUTCHours()] += f.notional;
  }
  for (const c of C) {   // volume, fees and funding come from closed positions: the fill history is retained only for a limited time, positions go back to the start
    D.rpnl += c.rpnl; D.fees += c.fee; D.fund += c.fund; D.vol += c.vol;
    const m = mk(c.sym); m.rpnl += c.rpnl; m.fees += c.fee; m.fund += c.fund; m.vol += c.vol; m.closed++; if (c.net > 0) m.wins++;
    const d = dayOf(c.t1); d.pnl += c.net; d.vol += c.vol; D.ev.push([c.t1, c.net]);
  }
  D.net = D.rpnl + D.fees + D.fund;
  D.ev.sort((a, b) => a[0] - b[0]);
  const w = C.filter(c => c.net > 0), l = C.filter(c => c.net < 0);
  D.wins = w.length; D.losses = l.length; D.gw = w.reduce((a, c) => a + c.net, 0); D.gl = -l.reduce((a, c) => a + c.net, 0);
  D.best = C.reduce((a, c) => !a || c.net > a.net ? c : a, null); D.worst = C.reduce((a, c) => !a || c.net < a.net ? c : a, null);
  D.dep = 0; D.wd = 0;
  for (const a of A) {
    if (a.type === 'deposit') D.dep += a.amount; else if (a.type === 'withdrawal') D.wd += a.amount;
    else if (a.type === 'transferExternal') { if (a.to === S.addr && a.from !== S.addr) D.dep += a.amount; else if (a.from === S.addr && a.to !== S.addr) D.wd += a.amount; }
  }
  const hs = C.map(c => (c.t1 - c.t0) / 1000).filter(s => s >= 0).sort((a, b) => a - b);
  D.hold = hs.length ? { n: hs.length, avg: hs.reduce((a, b) => a + b, 0) / hs.length, med: hs.length % 2 ? hs[hs.length >> 1] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2, min: hs[0], max: hs[hs.length - 1] } : null;
  return D;
}
const volRange = (S, ms) => { const t = Date.now() - ms; return S.closed.reduce((a, c) => c.t1 >= t ? a + c.vol : a, 0); };
const fillsSince = S => S.fills.length ? dtl(S.fills.reduce((a, f) => Math.min(a, f.t), Infinity)) : null;

/* ---------------------------------------------------------------- cards */
const row = (k, v, tip) => `<div class="row"${tip ? ` data-tip="${esc(tip)}"` : ''}><span>${k}</span><b class="num">${v}</b></div>`;
const tbl = (head, rows, cap) => `<div class="scroll"${cap ? ` style="max-height:${cap}px"` : ''}><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td class="num">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const sideTag = long => `<span class="${long ? 'pos' : 'neg'}">${long ? 'Long' : 'Short'}</span>`;
const empty = t => `<div class="empty">${t}</div>`;
const CARDS = [
  { id: 'net', title: 'Net PnL', w: 4, sub: () => { const p = getPeriod(); return p ? esc(p.label) : 'all time'; }, render(S, D) {
    return `<div class="big num ${cls(D.net)}">${smoney(D.net)}</div><div class="rows">` +
      row('Realized PnL (gross)', `<span class="${cls(D.rpnl)}">${smoney(D.rpnl)}</span>`, 'Sum of realized PnL of positions closed in the period (before fees and funding).') +
      row('Fees', `<span class="${cls(D.fees)}">${smoney(D.fees)}</span>`, 'Trading fees paid (negative) minus maker rebates received (positive).') +
      row('Funding', `<span class="${cls(D.fund)}">${smoney(D.fund)}</span>`, 'Funding payments received (+) or paid (−), including on still-open positions.') +
      row('Volume', money(D.vol, 0), 'Traded volume (opening + closing legs) of the positions closed in the period.') + row('Closed positions', fmt(D.C.length, 0)) +
      row('Win rate', D.C.length ? `${fmt(D.wins / D.C.length * 100, 1)}% <small>(${D.wins}W / ${D.losses}L)</small>` : '—', 'Share of closed positions whose PnL after fees and funding was positive.') +
      row('Profit factor', D.gl ? fmt(D.gw / D.gl, 2) : D.gw ? '∞' : '—', 'Gross profit of winning positions divided by gross loss of losing ones.') + `</div>
      <p class="note">PnL is booked when a position is fully closed. Unrealized PnL of open positions is not included.</p>`;
  } },
  { id: 'margin', title: 'Margin', w: 4, render(S) {
    const m = S.acct.margin || {}, lev = m.totalMargin > 0 ? m.notional / m.totalMargin : null;
    return `<div class="big num">${money(m.totalMargin)}</div><div class="rows">` +
      row('Available margin', money(m.availableMargin)) + row('Maintenance margin', money(m.marginUsed)) + row('With buffer', money(m.bufferedMargin)) +
      row('Open notional', money(m.notional, 0)) + row('Effective leverage', lev == null ? '—' : fmt(lev, 2) + '×') +
      row('Unrealized PnL', `<span class="${cls(m.unrealizedPnl)}">${smoney(m.unrealizedPnl)}</span>`) +
      row('Lifetime realized PnL', `<span class="${cls(m.realizedPnl)}">${smoney(m.realizedPnl)}</span>`, 'Exchange-reported, all time, before fees and funding.') +
      row('Lifetime fees', `<span class="${cls(m.fees)}">${smoney(m.fees)}</span>`) + row('Lifetime funding', `<span class="${cls(m.funding)}">${smoney(m.funding)}</span>`) + `</div>`;
  } },
  { id: 'volume', title: 'Volume & fees', w: 4, render(S) {
    const ft = (S.fee && S.fee.feeTier) || (S.acct.feeTiers || [])[0] || {}, all = S.closed.reduce((a, c) => a + c.vol, 0), fs = fillsSince(S);
    return `<div class="big num">${money(all, 0)}</div><div class="rows">` + row('Last 24h', money(volRange(S, DAY), 0)) + row('Last 7 days', money(volRange(S, 7 * DAY), 0)) + row('Last 30 days', money(volRange(S, 30 * DAY), 0)) +
      row('Fills on record', fmt(S.fills.length, 0) + (fs ? ` <small>since ${fs}</small>` : ''), 'Bulk keeps individual fills only for a limited time; volume, fees and PnL here are taken from closed positions, which go back further.') +
      row('Fee tier', ft.tierIndex == null ? '—' : '#' + ft.tierIndex) + row('Maker / taker', ft.makerBps == null ? '—' : `${fmt(ft.makerBps, 2)} / ${fmt(ft.takerBps, 2)} bps`) +
      row(`Rolling volume (${ft.windowDays || 14}d)`, ft.rollingVolume == null ? '—' : money(ft.rollingVolume, 0), 'Your trading volume over the last ' + (ft.windowDays || 14) + ' days (moving window, not calendar). Bulk uses it to set your fee tier: the higher it is, the lower your maker/taker fees. It drops back to $0 after ' + (ft.windowDays || 14) + ' days without trading.') + `</div>` + (S.trunc ? '<p class="note">Very long history: only the newest rows were loaded, so all-time totals may be incomplete.</p>' : '');
  } },
  { id: 'cum', title: 'Cumulative PnL', w: 6, render() { return '<div class="chartbox" data-ch="cum"></div>'; }, after(el, S, D) {
    let c = 0; const pts = D.ev.map(e => [e[0], c += e[1]]);
    lineChart($('[data-ch=cum]', el), pts, { color: css('--s1'), zero: true, area: true, axis: v => '$' + big(v), xfmt: t => dshort(t), tfmt: t => dtl(t), tip: v => smoney(v), minRange: 1 });
  } },
  { id: 'daypnl', title: 'Daily PnL', w: 6, sub: 'net, by close day (UTC)', render() { return '<div class="chartbox" data-ch="dp"></div>'; }, after(el, S, D) {
    barChart($('[data-ch=dp]', el), Object.keys(D.day).sort().map(d => ({ label: d.slice(5), v: D.day[d].pnl })), { color: css('--s3'), axis: v => '$' + big(v), tip: v => smoney(v) });
  } },
  { id: 'dayvol', title: 'Daily volume', w: 6, sub: 'by close day (UTC)', render() { return '<div class="chartbox" data-ch="dv"></div>'; }, after(el, S, D) {
    barChart($('[data-ch=dv]', el), Object.keys(D.day).sort().map(d => ({ label: d.slice(5), v: D.day[d].vol })), { color: css('--s1'), axis: v => '$' + big(v), tip: v => money(v, 0) });
  } },
  { id: 'hours', title: 'Volume by hour (UTC)', w: 6, sub: S => { const f = fillsSince(S); return f ? 'fills since ' + f : ''; }, render() { return '<div class="chartbox" data-ch="hr"></div>'; }, after(el, S, D) {
    barChart($('[data-ch=hr]', el), D.hour.map((v, h) => ({ label: String(h).padStart(2, '0'), v })), { color: css('--s4'), axis: v => '$' + big(v), tip: v => money(v, 0) });
  } },
  { id: 'mt', title: 'Maker / taker', w: 4, sub: S => { const f = fillsSince(S); return f ? 'fills since ' + f : ''; }, render(S, D) {
    const tp = D.fvol ? D.mvol / D.fvol * 100 : 0;
    return `<div class="big num">${D.fvol ? fmt(tp, 1) + '% maker' : '—'}</div><div class="bar2"><span style="width:${tp}%;background:var(--s3)"></span><span style="left:${tp}%;width:${100 - tp}%;background:var(--s2)"></span></div><div class="rows">` +
      row('Maker volume', money(D.mvol, 0)) + row('Taker volume', money(D.tvol, 0)) + row('Maker fees / rebates', `<span class="${cls(D.mfee)}">${smoney(D.mfee)}</span>`) + row('Taker fees', `<span class="${cls(D.tfee)}">${smoney(D.tfee)}</span>`) +
      row('Net fee, bps of volume', D.fvol ? fmt(-(D.mfee + D.tfee) / D.fvol * 1e4, 2) : '—') + row('Fills', fmt(D.F.length, 0)) + row('Liquidation fills', fmt(D.liqs, 0)) + `</div>`;
  } },
  { id: 'hold', title: 'Position holding', w: 4, render(S, D) {
    const h = D.hold; if (!h) return empty('No closed positions in this period');
    const bm = {}; D.C.forEach(c => (bm[c.sym] = bm[c.sym] || []).push((c.t1 - c.t0) / 1000));
    const top = Object.entries(bm).map(([k, v]) => ({ k, n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.n - a.n).slice(0, 5);
    return `<div class="big num">${dur(h.avg)}</div><div class="rows">` + row('Average', dur(h.avg)) + row('Median', dur(h.med)) + row('Shortest', dur(h.min)) + row('Longest', dur(h.max)) + row('Closed positions', fmt(h.n, 0)) +
      `</div><div class="rows" style="margin-top:12px">` + top.map(t => row(sym(t.k) + ` <small>(${t.n})</small>`, dur(t.avg))).join('') + `</div>`;
  } },
  { id: 'best', title: 'Best & worst', w: 4, render(S, D) {
    if (!D.best) return empty('No closed positions in this period');
    const one = (lbl, c) => `<div class="rows">${row(lbl, `<span class="${cls(c.net)}">${smoney(c.net)}</span>`)}${row(sym(c.sym) + ' ' + (c.long ? 'long' : 'short'), money(c.sz * c.open, 0) + ' notional')}${row('Closed', dt(c.t1) + ' · held ' + dur((c.t1 - c.t0) / 1000))}</div>`;
    return one('Best position', D.best) + '<hr style="border:0;border-top:1px solid var(--line);margin:12px 0">' + one('Worst position', D.worst) +
      `<div class="rows" style="margin-top:10px">` + row('Avg win', D.wins ? smoney(D.gw / D.wins) : '—') + row('Avg loss', D.losses ? smoney(-D.gl / D.losses) : '—') + `</div>`;
  } },
  { id: 'positions', title: 'Open positions', w: 12, sub: S => `${S.acct.positions.length}`, render(S) {
    const P = S.acct.positions; if (!P.length) return empty('No open positions');
    return tbl(['Market', 'Side', 'Size', 'Entry', 'Mark', 'Notional', 'Unrealized', 'Lev', 'Liq. price', 'Funding', 'Opened'],
      P.map(p => [esc(sym(p.symbol)) + (p.iso ? ' <small>iso</small>' : ''), sideTag(p.size > 0), qf(Math.abs(p.size)), pxf(p.price), pxf(p.fairPrice), money(p.notional, 0), `<span class="${cls(p.unrealizedPnl)}">${smoney(p.unrealizedPnl)}</span>`, fmt(p.leverage, 1) + '×', pxf(p.liquidationPrice), `<span class="${cls(p.funding)}">${smoney(p.funding)}</span>`, p.averageEntryTime ? dt(p.averageEntryTime / 1e6) : '—']));
  } },
  { id: 'orders', title: 'Open orders', w: 12, sub: S => `${S.acct.openOrders.length}`, render(S) {
    const O = S.acct.openOrders; if (!O.length) return empty('No open orders');
    return tbl(['Market', 'Type', 'Price', 'Size', 'Filled', 'TIF', 'Flags', 'Placed'],
      O.map(o => [esc(sym(o.symbol)), esc(o.orderType || '—'), pxf(o.price), qf(o.originalSize), qf(o.filledSize), esc(o.tif || '—'), [o.reduceOnly ? 'reduce' : '', o.maker ? 'maker' : '', o.iso ? 'iso' : ''].filter(Boolean).join(' ') || '—', o.timestamp ? dt(o.timestamp / 1e6) : '—']), 320);
  } },
  { id: 'markets', title: 'By market', w: 12, render(S, D) {
    const M = Object.values(D.mk).filter(m => m.vol || m.closed || m.fund).sort((a, b) => b.vol - a.vol); if (!M.length) return empty('No activity in this period');
    return tbl(['Market', 'Volume', 'Fills', 'Closed', 'Win rate', 'Realized', 'Fees', 'Funding', 'Net'],
      M.map(m => { const net = m.rpnl + m.fees + m.fund; return [esc(sym(m.sym)), money(m.vol, 0), fmt(m.fills, 0), fmt(m.closed, 0), m.closed ? fmt(m.wins / m.closed * 100, 0) + '%' : '—', `<span class="${cls(m.rpnl)}">${smoney(m.rpnl)}</span>`, `<span class="${cls(m.fees)}">${smoney(m.fees)}</span>`, `<span class="${cls(m.fund)}">${smoney(m.fund)}</span>`, `<b class="${cls(net)}">${smoney(net)}</b>`]; }));
  } },
  { id: 'closed', title: 'Closed positions', w: 12, sub: 'newest first', render(S, D) {
    if (!D.C.length) return empty('No closed positions in this period');
    return tbl(['Market', 'Side', 'Size', 'Open', 'Close', 'Realized', 'Fees', 'Funding', 'Net', 'Held', 'Closed (GMT)', 'Reason'],
      D.C.slice(0, 200).map(c => [esc(sym(c.sym)), sideTag(c.long), qf(c.sz), pxf(c.open), pxf(c.close), `<span class="${cls(c.rpnl)}">${smoney(c.rpnl)}</span>`, smoney(c.fee), smoney(c.fund), `<b class="${cls(c.net)}">${smoney(c.net)}</b>`, dur((c.t1 - c.t0) / 1000), dt(c.t1), c.reason === 'normal' ? '' : `<span class="neg">${esc(c.reason)}</span>`]), 420) + (D.C.length > 200 ? `<p class="note">Showing 200 of ${fmt(D.C.length, 0)}.</p>` : '');
  } },
  { id: 'funding', title: 'Funding', w: 4, render(S, D) {
    const open = S.acct.positions.reduce((a, p) => a + (p.funding || 0), 0), M = Object.values(D.mk).filter(m => m.fund).sort((a, b) => Math.abs(b.fund) - Math.abs(a.fund)).slice(0, 8);
    if (!M.length && !open) return empty('No funding in this period');
    return `<div class="big num ${cls(D.fund)}">${smoney(D.fund)}</div><div class="rows">` + row('On closed positions', smoney(D.fund)) + row('Open positions (accrued)', smoney(open)) +
      `</div><div class="rows" style="margin-top:12px">` + M.map(m => row(sym(m.sym), `<span class="${cls(m.fund)}">${smoney(m.fund)}</span>`)).join('') + `</div>`;
  } },
  { id: 'transfers', title: 'Deposits & withdrawals', w: 8, render(S, D) {
    const A = D.A.filter(a => ['deposit', 'withdrawal', 'transferExternal'].includes(a.type)); if (!A.length) return empty('No transfers in this period');
    return `<div class="rows" style="margin:0 0 10px">` + row('Deposited', money(D.dep)) + row('Withdrawn', money(D.wd)) + row('Net in', `<span class="${cls(D.dep - D.wd)}">${smoney(D.dep - D.wd)}</span>`) + `</div>` +
      tbl(['Type', 'Amount', 'Counterparty', 'Time (GMT)'], A.slice(0, 100).map(a => { const out = a.type === 'withdrawal' || (a.type === 'transferExternal' && a.from === S.addr), other = out ? a.to : a.from; return [esc(a.type === 'transferExternal' ? (out ? 'transfer out' : 'transfer in') : a.type), `<span class="${out ? 'neg' : 'pos'}">${out ? '−' : '+'}$${fmt(a.amount)}</span>`, `<code>${esc(other.slice(0, 4) + '…' + other.slice(-4))}</code>`, dt(a.t)]; }), 260);
  } },
  { id: 'fills', title: 'Recent fills', w: 12, render(S, D) {
    if (!D.F.length) return empty('No fills in this period');
    return tbl(['Time (GMT)', 'Market', 'Side', 'Size', 'Price', 'Notional', 'Role', 'Fee'],
      D.F.slice(0, 100).map(f => [dt(f.t), esc(sym(f.sym)), sideTag(f.buy), qf(f.sz), pxf(f.px), money(f.notional, 0), (f.maker ? 'maker' : 'taker') + (f.liq ? ` <span class="neg">${esc(f.liq)}</span>` : ''), `<span class="${cls(f.fee)}">${smoney(f.fee, 4)}</span>`]), 420);
  } },
];
CARDS.splice(3, 0, { id: 'aura', title: 'Challenger Aura', w: 4, sub: () => AURA && AURA.fetchedAt ? 'snapshot ' + dtl(AURA.fetchedAt) + ' GMT' : '', render(S) {
  if (!AURA) return empty('Aura data is not available');
  const a = AURA.map[S.root];
  if (!a) return empty('This wallet is not in the Challenger leaderboard snapshot (' + fmt(AURA.total, 0) + ' wallets).');
  const cats = Object.entries(a.c || {}).sort((x, y) => auraSort(x[0]) - auraSort(y[0]) || x[0].localeCompare(y[0]));
  return `<div class="big num">${fmt(a.a, 0)}</div><div class="rows">` + row('Rank', `#${fmt(a.r, 0)} <small>of ${fmt(AURA.total, 0)}</small>`) + row('League', esc(a.l || '—') + (a.tp ? ` <small>top ${fmt(a.tp, 1)}%</small>` : '')) + row('Trading Aura', fmt(a.t, 0)) + row('Other Aura', fmt(a.a - a.t, 0), 'Bonus categories such as boosts, the weekly gauntlet and pre-deposit weeks.') +
    `</div><div class="rows" style="margin-top:12px">` + cats.map(([k, v]) => row(auraName(k), fmt(v, 0))).join('') + `</div>`;
} });
const DEFAULT_ON = CARDS.map(c => c.id);
let enabled = new Set(store.get('bulk.cards', DEFAULT_ON).filter(id => CARDS.some(c => c.id === id)));

/* ---------------------------------------------------------------- render */
function render() {
  if (!S) return;
  const out = $('#out'), list = CARDS.filter(c => enabled.has(c.id)), p = getPeriod(), D = derive(S, p);
  const hdr = `<div class="hdr"><code class="addr">${esc(S.addr)}</code><span class="tag">${S.sub ? 'sub-account' : 'master'}</span><span class="tag ${p ? 'warn' : ''}">${p ? esc(p.label) : 'all time'}</span><a href="https://solscan.io/account/${esc(S.addr)}" target="_blank" rel="noopener">Solscan ↗</a><span class="muted" id="upd"></span></div>`;
  out.innerHTML = hdr + list.map(c => `<section class="card w${c.w}" data-card="${c.id}"><h2>${c.title}${c.sub ? `<span class="sub">${typeof c.sub === 'function' ? c.sub(S) : c.sub}</span>` : ''}</h2>${c.render(S, D)}</section>`).join('');
  const draw = () => list.forEach(c => { if (c.after) { try { c.after($(`[data-card=${c.id}]`, out), S, D); } catch (e) { console.error(c.id, e); } } });
  draw(); cancelAnimationFrame(render.raf); render.raf = requestAnimationFrame(() => { const w = out.clientWidth; if (w !== render.w) { render.w = w; draw(); } });
  $('#upd').textContent = 'updated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
  $('#welcome').hidden = true;
}

/* ---------------------------------------------------------------- loading */
function status(msg, busy) { const el = $('#status'); el.className = 'status' + (busy ? ' busy' : ''); el.innerHTML = busy ? `<span class="spin"></span>${esc(msg)}` : esc(msg); }
function err(msg) { const el = $('#status'); el.className = 'status err'; el.textContent = msg; }
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
let token = 0;
async function load(addr, user, quiet) {
  const my = ++token; user = user || addr;
  if (!B58.test(addr)) return err('That does not look like a Solana address (32–44 base58 characters).');
  if (!quiet) { status('Loading account…', true); $('#out').innerHTML = ''; $('#welcome').hidden = true; }
  try {
    const fa = await post({ type: 'fullAccount', user });
    const acct = fa && fa[0] && fa[0].fullAccount; if (!acct) throw new Error('Account not found');
    acct.positions = acct.positions || []; acct.openOrders = acct.openOrders || [];
    const fee = await post({ type: 'feeTier', user }).then(j => j && j[0], () => null);
    const fl = await fetchHistory('fills', user, 'fills'), cl = await fetchHistory('positions', user, 'closed positions'), fu = await fetchHistory('fundingHistory', user, 'funding'), ac = await fetchHistory('activityHistory', user, 'transfers');
    if (my !== token) return;
    S = { addr: user, root: addr, sub: user !== addr, acct, fee, fills: fl.rows, closed: cl.rows, funding: fu.rows, acts: ac.rows, trunc: fl.truncated || cl.truncated };
    normalize(S);
    if (!S.sub) $('#sub').innerHTML = '<option value="">master account</option>' + (acct.subAccounts || []).map(s => `<option value="${esc(s.pubkey)}">sub ${esc(s.pubkey.slice(0, 4))}…${esc(s.pubkey.slice(-4))}</option>`).join('');
    $('#sub').value = S.sub ? user : '';
    remember(addr); status(''); render();
  } catch (e) {
    if (my !== token) return;
    err(e.code === 'ACCOUNT_NOT_FOUND' ? 'Account not found on Bulk: this address has never traded or deposited there.' : (e.message || String(e)));
  }
}
function remember(a) { store.set('bulk.recent', [a, ...store.get('bulk.recent', []).filter(x => x !== a)].slice(0, 6)); drawRecent(); }
function drawRecent() { const r = store.get('bulk.recent', []); $('#recent').innerHTML = r.length ? 'Recent: ' + r.map(a => `<button type="button" class="chip" data-a="${esc(a)}">${esc(a.slice(0, 4))}…${esc(a.slice(-4))}</button>`).join('') : ''; }

/* ---------------------------------------------------------------- platform volume (top pill) */
async function loadPlatform() {
  try {
    const j = await (await fetch(API + '/stats?period=1d')).json();
    $('#platVol').textContent = '$' + big(j.volume.totalUsd);
    $('#platOi').textContent = '$' + big(j.openInterest.totalUsd);
    $('#plat').title = 'Bulk exchange-wide, rolling 24 hours (updated ' + new Date().toLocaleTimeString('en-US', { hour12: false }) + ')';
    $('#plat').hidden = false;
  } catch (e) { }
}
loadPlatform(); setInterval(loadPlatform, 60000);

/* ---------------------------------------------------------------- Challenger Aura by week (all wallets of the leaderboard snapshot) */
// Season 1 started Saturday 10 Oct 2026 and runs 8 weeks, Saturday to Saturday (docs.bulk.trade). Challenger week N = mainnet Aura week N + 4.
const SEASON0 = Date.UTC(2026, 9, 10), SEASON_WEEKS = 8;
function auraWeekTotals(w) {
  const mw = w + 4, T = { trading: 0, gauntlet: 0, other: 0, wallets: 0 };
  if (!AURA) return null;
  for (const r of AURA.rows) {
    const c = r.c || {}; let any = false;
    for (const [k, v] of Object.entries(c)) {
      const m = /^mainnet_week(\d+)_(\w+)$/.exec(k);
      if (m && +m[1] === mw) { any = true; if (m[2] === 'trading') T.trading += v; else T.other += v; }
      else if (k === 'challenger_week_' + w + '_gauntlet') { T.gauntlet += v; any = true; }
    }
    if (any) T.wallets++;
  }
  return T;
}
function drawAuraWeeks() {
  const box = $('#auraWeeks'); if (!box || !AURA) return;
  const now = Date.now(), cur = Math.min(SEASON_WEEKS, Math.max(0, Math.floor((now - SEASON0) / (7 * DAY)) + 1));
  const rows = []; let curT = null;
  for (let w = 1; w <= SEASON_WEEKS; w++) {
    const from = SEASON0 + (w - 1) * 7 * DAY, to = from + 7 * DAY, T = w <= cur ? auraWeekTotals(w) : null;
    if (w === cur) curT = T;
    const state = w < cur ? 'finished' : w === cur ? '<b class="pos">live</b>' : 'upcoming';
    rows.push([`Week ${w}`, `${dshort(from)} – ${dshort(to)}`, state, T ? fmt(T.trading, 0) : '—', T ? fmt(T.gauntlet, 0) : '—', T ? fmt(T.other, 0) : '—', T ? `<b>${fmt(T.trading + T.gauntlet + T.other, 0)}</b>` : '—', T ? fmt(T.wallets, 0) : '—']);
  }
  const left = cur >= 1 && cur <= SEASON_WEEKS ? SEASON0 + cur * 7 * DAY - now : 0;
  $('#auraHead').innerHTML = cur < 1 ? 'Season 1 has not started yet.' : `<b>Week ${cur} of ${SEASON_WEEKS}</b> is live · ends Saturday ${dshort(SEASON0 + cur * 7 * DAY)} GMT (in ${dur(left / 1000)})` +
    (curT ? ` · <b class="num">${fmt(curT.trading + curT.gauntlet + curT.other, 0)}</b> Aura credited so far to <span class="num">${fmt(curT.wallets, 0)}</span> wallets, of which <span class="num">${fmt(curT.trading, 0)}</span> trading Aura` : '');
  box.innerHTML = tbl(['Week', 'Dates (GMT)', 'Status', 'Trading Aura', 'Gauntlet', 'Other', 'Total', 'Wallets'], rows);
  $('#auraNote').textContent = `Sums over the ${fmt(AURA.total, 0)} wallets of the leaderboard snapshot of ${dtl(AURA.fetchedAt)} GMT, so the live week keeps growing and the figures are a lower bound. "Other" = maker, referrals, protocol and boost Aura. The docs state a weekly budget of 1,000,000 Aura (the Gauntlet's 50,000 is part of it). Only Trading Aura (incl. Gauntlet) counts toward the weekly league.`;
  $('#auraBlock').hidden = false;
}

/* ---------------------------------------------------------------- Aura, whole history (all categories, all weeks) */
function auraClass(k) {   // -> [timeline, week, column]
  let m;
  if (/^retro_/.test(k)) return ['retro', 0, 'retro'];
  if (m = /^predeposit_referral_week(\d+)$/.exec(k)) return ['pre', +m[1], 'ref'];
  if (m = /^predeposit_week(\d+)$/.exec(k)) return ['pre', +m[1], 'dep'];
  if (m = /^week(\d+)_(protocol|exponent)/.exec(k)) return ['pre', +m[1], 'proto'];
  if (m = /^mainnet_week(\d+)_(\w+)$/.exec(k)) return ['main', +m[1], { trading: 'trading', maker: 'maker', referrals: 'ref', protocol: 'proto', boost: 'boost' }[m[2]] || 'boost'];
  if (m = /^challenger_week_(\d+)_/.exec(k)) return ['main', +m[1] + 4, 'boost'];
  return ['other', 0, 'boost'];
}
function drawAuraAll() {
  const box = $('#auraAllTable'); if (!box || !AURA) return;
  const COLS = ['dep', 'ref', 'proto', 'trading', 'maker', 'boost'], T = {}, tot = {};
  for (const r of AURA.rows) for (const [k, v] of Object.entries(r.c || {})) {
    const [tl, w, col] = auraClass(k), key = tl + ':' + w, o = T[key] || (T[key] = { tl, w, dep: 0, ref: 0, proto: 0, trading: 0, maker: 0, boost: 0, retro: 0 });
    o[col] += v;
  }
  const keys = Object.keys(T).sort((a, b) => { const x = T[a], y = T[b], ord = { retro: 0, pre: 1, main: 2, other: 3 }; return ord[x.tl] - ord[y.tl] || x.w - y.w; });
  const sum = o => o.dep + o.ref + o.proto + o.trading + o.maker + o.boost + o.retro;
  const now = Date.now(); let all = 0;
  const rows = keys.map(k => {
    const o = T[k]; all += sum(o); for (const c of COLS) tot[c] = (tot[c] || 0) + o[c]; tot.retro = (tot.retro || 0) + o.retro;
    const base = o.tl === 'pre' ? WK.pre : WK.main, from = base + (o.w - 1) * 7 * 864e5, live = o.tl === 'main' && now >= from && now < from + 7 * 864e5;
    const name = o.tl === 'retro' ? 'Retro (one-off)' : o.tl === 'pre' ? 'Pre-deposit week ' + o.w : o.tl === 'main' ? 'Mainnet week ' + o.w + (live ? ' · live' : '') : 'Other';
    const dates = o.tl === 'pre' || o.tl === 'main' ? dshort(from) + ' – ' + dshort(from + 7 * 864e5) : '—';
    const f = v => v ? fmt(v, 0) : '—';
    return [name, dates, f(o.dep), f(o.ref), f(o.proto), f(o.trading), f(o.maker), f(o.boost), '<b>' + fmt(sum(o), 0) + '</b>'];
  });
  const f = v => fmt(v || 0, 0);
  rows.push(['<b>Total</b>', '', f(tot.dep), f(tot.ref), f(tot.proto), f(tot.trading), f(tot.maker), f(tot.boost), '<b>' + fmt(all, 0) + '</b>']);
  $('#auraAllHead').innerHTML = '<b class="num">' + fmt(all, 0) + '</b> Aura credited in total across all weeks to the <span class="num">' + fmt(AURA.total, 0) + '</span> wallets of the leaderboard snapshot' + (S && AURA.map[S.root] ? ' · this wallet: <b class="num">' + fmt(AURA.map[S.root].a, 0) + '</b> (' + fmt(AURA.map[S.root].a / all * 100, 2) + '% of all)' : '');
  box.innerHTML = tbl(['Period', 'Dates (GMT)', 'Deposit', 'Referrals', 'Protocols', 'Trading', 'Maker', 'Boost / gauntlet', 'Total'], rows, 560);
  $('#auraAllNote').textContent = 'Everything the Aura leaderboard snapshot of ' + dtl(AURA.fetchedAt) + ' GMT holds, grouped by week. Deposit = pre-deposit Aura (USDC held x time). Protocols = Aura from integrated protocols (Exponent, Loopscale, p0, validator and BULKSOL staking and their corrections). The leaderboard lists only wallets that have Trading Aura, so wallets that only deposited or only farmed other categories are not counted: real totals are higher. Mainnet week N is Challenger week N-4.';
  $('#auraAll').hidden = false;
}
/* ---------------------------------------------------------------- UI wiring */
const SH = { name: store.get('bulk.sh_name', ''), bg: null, dim: +store.get('bulk.sh_dim', 55), pnl: store.get('bulk.sh_pnl', true) };
// embedded as a data URI so the canvas is never tainted (toBlob would fail otherwise)
{ const im = new Image(); im.onload = () => { SH.logo = im; if ($('#shareDlg').open) shDraw(); }; im.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHwAAAA4CAYAAAA/15zEAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAPZSURBVHhe7ZoxbtswFEC/261AO3WqpTFXsMFrJJAmX8EeOHXs2oUB7Cu4kw5COFfIqpyjHeSvUD+mRMmkYPf/BxiwGFIi+fSpLzqL5Y/vf0FgwydaIPzfiHBmiHBmiHBmiHBmiHBmiHBmiHBmiHBmiHBmiHBmiHBmiHBmiHBmiHBmLG7t93Ctt51ja19AqVWnDADAmAMt6kDPA+dzWXuixR1oO7wOLYfA8yFj29P6fXXHcHPCq+oISq3b4yx7aL9rvQWtd+2xMXuv+DF1KdgHt41Sa6iqY1vH2hMUxcZp1c+U9nX9CtaewJhDFNkQe0mnd+UU+qQYcyA3wK4ziS7WvvQe94F9cPtCJ5weD0Hr02OK1lswZg9FsRmsO4aowt3ITIkbGUqtg647ZtKsPV2sf6lsDKHtMXD6bv6pRBV+S4ROro+h9mNWjEv42qeUDTGFh0aa4AfnL5VsiCu8yaSpdHocAzdrN2Y/GI33QBMwq6Sy4VrhNKN2UWoNWm+TyMDsGzPYe2cu2XCtcGMOUFXHTnau1Aq03kJVHaMMAB8V+MGbqCg2g68198CcsuFa4U2E7UHrXRt1+N2YPa1+FUqtOo+N5j27+dwrOA787lstYzJJuBttfZ0c+nsI+IpkzKH9YGTjzXWv0pVaOWNpVsW6fk06nmDhGE11/QpVdTwv5TuvUJSBg8CB+OqPAZd0zA/6NmBuGXeDh44nxjxdIlg4RleWPUCWPUBRbM5bj5eXbtwlKopN28ZE3CIE8voy15KYEnc8qaI8WDjFlyGjUNzsjymYQs+dapLmwp2vVDfwZOHQJh1NgvYuuknk5lpiqXQfKSYvBamj/ErhTdLhLtXWvpyX//mkI1Q+Pb4H3D6niPLJwpVafxDt4mbTKQmdkEu/qftQav1hPHPiSo8d5ZOF+6LHVz4HNKegSV0oSq2ijGNqhE7tdwiThVNiTNBY3Lv/0mqC+QS0+cZwtITUCUX3bC33rTiWJLsxpUcTDpGk902ES7MvsANL3skpmE9AuzfgF4pLOV0pkDETf2nPgR73kSp5+/zt65dftHAqdf0Gdf1Gi0dRVX9oEQAsIM8zyPMMyvIRtN5Bnmeg9U8w5jB4Tfd5XJZPoNQa8nx5FtCc+/n5d+//jVGBeb6EPF92+obnKctHKMsnAEccbY83l6/vWN70NTuXLrz1Q7m5/2kbigKfkFCa5+r7KoI3w9B5h/rlA8/rax9y3SanCOvnEDcnXEhL1Ge4cPuIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGaIcGb8A2CuDgjUni6DAAAAAElFTkSuQmCC'; }
{ const b = store.get('bulk.sh_bg', null); if (b) { const im = new Image(); im.onload = () => { SH.bg = im; }; im.src = b; } }
function shDraw() {
  const cv = $('#shCv'), c = cv.getContext('2d'), W = 720, H = 486, D = derive(S, getPeriod()), p = getPeriod();
  const ink = '#ffffff', ink2 = '#c3c2b7', ink3 = '#8c8b83', good = '#3ec28a', bad = '#ff6b6b', acc = '#9ef01a';
  c.clearRect(0, 0, W, H); c.fillStyle = '#111110'; c.fillRect(0, 0, W, H);
  if (SH.bg) { const r = Math.max(W / SH.bg.width, H / SH.bg.height), w = SH.bg.width * r, h = SH.bg.height * r; c.drawImage(SH.bg, (W - w) / 2, (H - h) / 2, w, h); c.fillStyle = `rgba(17,17,16,${SH.dim / 100})`; c.fillRect(0, 0, W, H); }
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const txt = (s, x, y, size, color, weight = 500, align = 'left') => { c.font = `${weight} ${size}px system-ui,-apple-system,"Segoe UI",sans-serif`; c.fillStyle = color; c.textAlign = align; c.fillText(s, x, y); };
  // brand
  let nx = 28; if (SH.logo) { c.save(); rr(28, 22, 68, 31, 6); c.clip(); c.drawImage(SH.logo, 28, 22, 68, 31); c.restore(); nx = 108; }
  txt(SH.name || 'Trade Stats', nx, 46, 20, ink, 700);
  txt(p ? p.label : 'All time', W - 28, 40, 13, ink2, 500, 'right');
  txt('Closed positions · GMT', W - 28, 57, 11, ink3, 400, 'right');
  // hero
  const pos = D.net >= 0, hero = SH.pnl ? smoney(D.net) : money(D.vol, 0);
  txt(SH.pnl ? 'NET PNL' : 'VOLUME', 28, 100, 12, ink3, 600);
  txt(hero, 28, 148, 52, SH.pnl ? (pos ? good : bad) : ink, 750);
  txt(SH.pnl ? `${money(D.vol, 0)} volume · ${fmt(D.C.length, 0)} closed positions` : `${fmt(D.C.length, 0)} closed positions`, 28, 174, 14, ink2, 500);
  // stats grid
  const hold = D.hold ? dur(D.hold.avg) : '—';
  const stats = [['Volume', money(D.vol, 0)], ['Fees', SH.pnl ? smoney(D.fees) : money(-D.fees, 2)], ['Win rate', D.C.length ? fmt(D.wins / D.C.length * 100, 1) + '%' : '—'],
    ['Avg. hold', hold], ['Profit factor', D.gl ? fmt(D.gw / D.gl, 2) : '—'], ['Funding', SH.pnl ? smoney(D.fund) : '—']];
  stats.forEach((s, i) => { const x = 28 + (i % 3) * 226, y = 196 + Math.floor(i / 3) * 62;
    rr(x, y, 212, 52, 10); c.fillStyle = 'rgba(255,255,255,.06)'; c.fill();
    txt(s[0].toUpperCase(), x + 12, y + 20, 10.5, ink3, 600); const col = SH.pnl && /^[+−]/.test(s[1]) ? (s[1][0] === '+' ? good : bad) : ink; txt(s[1], x + 12, y + 42, 18, col, 650); });
  // daily bars (net PnL, or volume when profit is hidden)
  const days = Object.keys(D.day).sort().slice(-30), vals = days.map(d => SH.pnl ? D.day[d].pnl : D.day[d].vol);
  const x0 = 28, x1 = W - 28, y0 = 340, y1 = 458;
  txt(SH.pnl ? 'DAILY PNL' : 'DAILY VOLUME', x0, y0 - 6, 10.5, ink3, 600);
  if (vals.length) {
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = (hi - lo) || 1, Y = v => y1 - (v - lo) / span * (y1 - y0 - 8), bw = (x1 - x0) / vals.length;
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, Y(0)); c.lineTo(x1, Y(0)); c.stroke();
    vals.forEach((v, i) => { const w = Math.max(2, Math.min(bw - 3, 34)), x = x0 + i * bw + (bw - w) / 2, top = Y(Math.max(v, 0)), h = Math.max(2, Math.abs(Y(v) - Y(0)));
      c.fillStyle = SH.pnl ? (v >= 0 ? good : bad) : '#3987e5'; rr(x, top, w, h, Math.min(3, w / 2)); c.fill(); });
    txt(days[0].slice(5), x0, y1 + 16, 10.5, ink3, 500); txt(days[days.length - 1].slice(5), x1, y1 + 16, 10.5, ink3, 500, 'right');
  } else txt('No closed positions in this period', W / 2, (y0 + y1) / 2, 13, ink3, 500, 'center');
  txt('bulk stats · unofficial', W / 2, H - 6, 10, ink3, 400, 'center');
}
function shOpen() { if (!S) return err('Load a wallet first.'); $('#shName').value = SH.name; $('#shPnl').checked = SH.pnl; $('#shDim').value = SH.dim; $('#shDimV').textContent = SH.dim + '%'; $('#shareDlg').showModal(); shDraw(); }
const shBlob = () => new Promise(r => $('#shCv').toBlob(r, 'image/png'));
$('#btnShare').addEventListener('click', shOpen);
$('#shClose').addEventListener('click', () => $('#shareDlg').close());
$('#shName').addEventListener('input', e => { SH.name = e.target.value; store.set('bulk.sh_name', SH.name); shDraw(); });
$('#shPnl').addEventListener('change', e => { SH.pnl = e.target.checked; store.set('bulk.sh_pnl', SH.pnl); shDraw(); });
$('#shDim').addEventListener('input', e => { SH.dim = +e.target.value; $('#shDimV').textContent = SH.dim + '%'; store.set('bulk.sh_dim', SH.dim); shDraw(); });
$('#shBgBtn').addEventListener('click', () => $('#shBg').click());
$('#shBgClear').addEventListener('click', () => { SH.bg = null; store.set('bulk.sh_bg', null); shDraw(); });
$('#shBg').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { SH.bg = im; try { store.set('bulk.sh_bg', rd.result); } catch (x) { } shDraw(); }; im.src = rd.result; }; rd.readAsDataURL(f); });
$('#shDl').addEventListener('click', async () => { const b = await shBlob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'bulk-stats.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
$('#shCopy').addEventListener('click', async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await shBlob() })]); $('#shMsg').textContent = 'Copied to clipboard.'; } catch (e) { $('#shMsg').textContent = 'Copy is not available here, use Download PNG.'; } });


function drawPeriods() {
  $('#periodbar').innerHTML = PERIODS.map(([k, t]) => `<button type="button" class="pbtn ${period.k === k ? 'on' : ''}" data-p="${k}">${t}</button>`).join('');
  $('#custom').hidden = period.k !== 'custom';
  const p = getPeriod(); $('#pnote').textContent = p ? `Period: ${p.label}. Margin, positions and orders always show the current state.` : '';
}
function go(addr) { addr = addr.trim(); if (!addr) return; if (decodeURIComponent(location.hash.slice(1)) !== addr) window.history.replaceState(null, '', '#' + addr); load(addr); }
$('#form').addEventListener('submit', e => { e.preventDefault(); go($('#addr').value); });
$('#sub').addEventListener('change', e => { if (S) load(S.root, e.target.value || S.root); });
$('#recent').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) { $('#addr').value = b.dataset.a; go(b.dataset.a); } });
$('#periodbar').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; period = { k: b.dataset.p, from: period.from, to: period.to }; store.set('bulk.period', period); drawPeriods(); render(); });
const parseGmt = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(s.trim()); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; };
$('#pgo').addEventListener('click', () => { const a = parseGmt($('#pf').value), b = parseGmt($('#pt').value); if (a == null || b == null || b <= a) return err('Enter dates as YYYY-MM-DD HH:MM (GMT), with "to" after "from".'); period = { k: 'custom', from: a, to: b }; store.set('bulk.period', period); status(''); drawPeriods(); render(); });
let autoT = null; $('#auto').addEventListener('change', e => { clearInterval(autoT); if (e.target.checked) autoT = setInterval(() => S && load(S.root, S.addr, true), 60000); });
{ const t = store.get('bulk.theme', null); if (t) document.documentElement.dataset.theme = t; }
$('#btnTheme').addEventListener('click', () => { const r = document.documentElement, t = r.dataset.theme === 'dark' ? 'light' : 'dark'; r.dataset.theme = t; store.set('bulk.theme', t); render(); });
function drawCards() { $('#cardsList').innerHTML = CARDS.map(c => `<label class="chk"><input type="checkbox" data-c="${c.id}" ${enabled.has(c.id) ? 'checked' : ''}> ${c.title}</label>`).join(''); }
$('#btnCards').addEventListener('click', () => { const p = $('#cardsPanel'); p.hidden = !p.hidden; $('#btnCards').setAttribute('aria-expanded', !p.hidden); });
$('#cardsList').addEventListener('change', e => { const id = e.target.dataset.c; if (!id) return; e.target.checked ? enabled.add(id) : enabled.delete(id); store.set('bulk.cards', [...enabled]); render(); });
$('#cardsAll').onclick = $('#cardsReset').onclick = () => { enabled = new Set(DEFAULT_ON); store.set('bulk.cards', [...enabled]); drawCards(); render(); };
$('#cardsNone').onclick = () => { enabled = new Set(); store.set('bulk.cards', []); drawCards(); render(); };
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 150); });
$('#ver').textContent = VERSION;
drawPeriods(); drawCards(); drawRecent();
const fromHash = () => decodeURIComponent(location.hash.slice(1)).trim();
{ const h = fromHash(); if (h) { $('#addr').value = h; load(h); } }
addEventListener('hashchange', () => { const h = fromHash(); if (h && h !== (S && S.root)) { $('#addr').value = h; load(h); } });
})();
