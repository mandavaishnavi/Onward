// Onward front end. No build step: plain modules, one render() per change.
// Data lives in localStorage as small records and syncs to the Worker when a
// sync key is set, so the app keeps working offline.
import { MIN, DAY, WD, MO, uid, tz, loc, dayKey, keyTs, addDays, fmtTime, fmtDay, fmtWhen,
  occurrences, repText, remText, fires, complete, taskLog, level } from "./shared.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

const DEF = { id: "settings", type: "settings", tzOff: -new Date().getTimezoneOffset(), alldayAt: "09:00",
  defOff: 0, defCh: ["push"], digestAt: "08:30", digestCh: ["push"], sound: true, theme: "auto", tap: { label: "", value: 0 } };
const CHS = [["push", "🔔 Push"], ["alarm", "⏰ Alarm"], ["tg", "✈️ Telegram"], ["email", "✉️ Email"]];
const PRE = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
const COLORS = ["#ED9C8C", "#ECBC6A", "#C0CA76", "#8AC290", "#71C0B6", "#7EABDD", "#A598DA", "#DE8CB6", "#F7D54A", "#9AA5AF"];
const TITLES = ["Seedling", "Sprout", "Starter", "Mover", "Builder", "Steady", "In flow", "Trailblazer", "Unstoppable", "Legend"];
const ICON = {
  today: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  habits: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0114-5l2 2M20 4v5h-5M20 12a8 8 0 01-14 5l-2-2M4 20v-5h5"/></svg>',
  focus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
};

// ================= store + sync =================
const LS = "onward.db.v1";
let db = { recs: {}, dirty: {}, rev: 0 };
try { const r = JSON.parse(lsGet(LS)); if (r && r.recs) db = { recs: r.recs, dirty: r.dirty || {}, rev: r.rev || 0 }; } catch (e) {}
let key = lsGet("onward.key") || "";
let memo = null, saveT = 0, syncT = 0, syncing = false, dot = key ? "busy" : "";

function flush() { clearTimeout(saveT); saveT = 0; if (!lsSet(LS, JSON.stringify(db))) toast("Could not save. Browser storage is blocked or full."); }
function persist() { clearTimeout(saveT); saveT = setTimeout(flush, 200); }
function put(rec) {
  rec.u = Date.now(); db.recs[rec.id] = rec; db.dirty[rec.id] = 1; memo = null;
  persist(); clearTimeout(syncT); syncT = setTimeout(sync, 1200);
  return rec;
}
const del = (id) => { const r = db.recs[id]; if (r) put({ ...r, del: 1 }); };
const all = (type) => Object.values(db.recs).filter((r) => r.type === type && !r.del);
const set = () => ({ ...DEF, ...(db.recs.settings || {}) });
const O = () => tz(set());
const today = () => dayKey(Date.now(), O());
const items = () => all("item");
const lists = () => all("list").sort((a, b) => (a.ord || 0) - (b.ord || 0));
const habits = () => all("habit").sort((a, b) => (a.ord || 0) - (b.ord || 0));
const logs = () => all("log");
const hhmm = (ts) => { const d = loc(ts, O()); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };

async function api(path, body) {
  const res = await fetch(path, { method: body ? "POST" : "GET",
    headers: body ? { "x-key": key, "content-type": "application/json" } : { "x-key": key }, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(d.error || "The server answered " + res.status); e.status = res.status; throw e; }
  return d;
}
async function sync() {
  if (!key || syncing) return;
  if (!navigator.onLine) { setDot(""); return; }
  syncing = true; setDot("busy");
  try {
    for (let g = 0; g < 30; g++) {
      const ids = Object.keys(db.dirty).slice(0, 100), sent = {};
      const changes = ids.map((i) => db.recs[i]).filter(Boolean);
      for (const c of changes) sent[c.id] = c.u;
      const res = await api("/api/sync", { since: db.rev, changes });
      let changed = false;
      for (const r of res.recs) { const l = db.recs[r.id]; if (!l || r.u > l.u) { db.recs[r.id] = r; changed = true; } }
      for (const i of ids) if (!db.recs[i] || db.recs[i].u === sent[i]) delete db.dirty[i];
      db.rev = res.rev; memo = null; persist();
      if (changed) render();
      if (!res.more && !Object.keys(db.dirty).length) break;
    }
    setDot("on");
  } catch (e) { setDot(e.status === 401 || e.status === 503 ? "err" : ""); }
  syncing = false;
}
function setDot(d) { dot = d; const el = $("#top .dot"); if (el) el.className = "dot " + d; }

// ================= derived: XP, streaks, quests =================
function game() {
  if (memo) return memo;
  const o = O(), t = today(), active = new Set();
  let xp = 0;
  for (const l of logs()) { xp += l.xp || 0; active.add(dayKey(l.at, o)); }
  for (const h of all("habit")) for (const k in h.done || {}) if (h.done[k] > 0) active.add(k);
  // A missed day uses up a freeze instead of ending the streak. You start with
  // one freeze and earn another every 7 streak days (2 at most).
  let streak = 0, best = 0, freezes = 1;
  const frozen = new Set();
  if (active.size) {
    let k = [...active].sort()[0];
    for (let g = 0; k <= t && g < 6000; k = addDays(k, 1), g++) {
      if (active.has(k)) { streak++; if (streak % 7 === 0) freezes = Math.min(2, freezes + 1); }
      else if (k === t) { /* today still open */ }
      else if (freezes > 0 && streak > 0) { freezes--; frozen.add(k); }
      else streak = 0;
      best = Math.max(best, streak);
    }
  }
  return (memo = { xp, ...level(xp), streak, best, freezes, frozen });
}
function habitStats(h) {
  const t = today(), freq = h.freq || 1, done = h.done || {};
  const days = Object.keys(done).filter((k) => done[k] >= freq).sort(), S = new Set(days);
  let total = 0, best = 0, run = 0, prev = null, cur = 0;
  for (const k in done) total += done[k];
  for (const k of days) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  for (let k = S.has(t) ? t : addDays(t, -1); S.has(k); k = addDays(k, -1)) cur++;
  return { cur, best, days: days.length, total };
}
const habitDone = (h, k) => ((h.done || {})[k] || 0) >= (h.freq || 1);
const startToday = () => keyTs(today(), O());

// Three small things for today, chosen so there is nothing to decide.
function quest() {
  const id = "q-" + today(), start = startToday();
  let q = db.recs[id] && !db.recs[id].del ? db.recs[id] : { id, type: "quest", picks: [] };
  if (q.picks.length >= 3) return q;
  const used = new Set(q.picks.map((p) => p.ref)), picks = q.picks.slice();
  const open = items().filter((i) => i.kind === "task" && !i.done);
  const due = open.filter((i) => i.at != null && i.at < start + DAY).sort((a, b) => (b.pri || 0) - (a.pri || 0) || a.at - b.at);
  const easy = open.filter((i) => (i.energy === "low" || (i.est && i.est <= 15)) && (i.at == null || i.at < start + DAY));
  const old = open.filter((i) => i.at == null).sort((a, b) => (a.created || 0) - (b.created || 0));
  const hs = habits().filter((h) => !habitDone(h, today()));
  const take = (arr, t) => { const x = arr.find((i) => !used.has(i.id)); if (x && picks.length < 3) { used.add(x.id); picks.push({ ref: x.id, t }); } };
  if (!picks.some((p) => p.t === "habit")) take(hs, "habit");
  take(due, "item"); take(easy, "item"); take(due, "item"); take(old, "item"); take(old, "item");
  if (picks.length > q.picks.length) q = put({ ...q, picks });
  return q;
}
function questState(p) {
  const r = db.recs[p.ref];
  if (!r || r.del) return { title: "(removed)", ok: true };
  if (p.t === "habit") return { title: (r.icon ? r.icon + " " : "") + r.name, ok: habitDone(r, today()) };
  const o = O(), t = today();
  return { title: r.title, ok: !!r.done || logs().some((l) => l.ref === r.id && l.k === "task" && dayKey(l.at, o) === t) };
}
function checkQuests() {
  const q = db.recs["q-" + today()];
  if (!q || q.del) return;
  let n = 0;
  for (const p of q.picks) {
    const s = questState(p), id = "qb-" + today() + "-" + p.ref;
    if (s.ok) { n++; if (!db.recs[id]) { put({ id, type: "log", k: "quest", title: "Quest: " + s.title, at: Date.now(), xp: 15 }); floatXp(15); } }
  }
  const allId = "qa-" + today();
  if (q.picks.length === 3 && n === 3 && !db.recs[allId]) {
    put({ id: allId, type: "log", k: "quest", title: "All three quests", at: Date.now(), xp: 30 });
    toast("All three quests done. +30 XP 🎉"); confetti(null, 40);
  }
}

// ================= actions =================
function newItem(p = {}) {
  const s = set();
  return { id: uid(), type: "item", kind: "task", title: "", step: "", notes: "", list: "", tags: [], pri: 0, at: null, allDay: true,
    dur: 60, rep: null, rem: [], nag: 0, subs: [], est: 0, energy: "", done: null, created: Date.now(), ...p,
    ...(p.rem ? {} : { rem: p.at != null || p.withRem ? [{ id: uid(), off: s.defOff || 0, ch: [...(s.defCh || [])] }] : [] }), withRem: undefined };
}
function toggleTask(id, el) {
  const it = db.recs[id];
  if (!it) return;
  if (it.done) {
    put({ ...it, done: null });
    const l = logs().filter((x) => x.ref === id && x.k === "task").sort((a, b) => b.at - a.at)[0];
    if (l) del(l.id);
    return;
  }
  const before = game().L, t = Date.now(), l = taskLog(it, t, set()), prev = { ...it };
  put(complete(it, t, set())); put(l);
  celebrate(l.xp, el, before);
  toast(l.late ? "Done. Late still counts. +" + l.xp + " XP" : "Done. +" + l.xp + " XP", () => { put(prev); del(l.id); });
}
function tickHabit(id, d, el) {
  const h = db.recs[id], k = today(), done = { ...(h.done || {}) }, freq = h.freq || 1, o = O();
  const undo = () => {
    if (!done[k]) return;
    done[k]--; if (!done[k]) delete done[k];
    put({ ...h, done });
    const l = logs().filter((x) => x.ref === id && x.k === "habit" && dayKey(x.at, o) === k).sort((a, b) => b.at - a.at)[0];
    if (l) del(l.id);
  };
  if (d < 0) return undo();
  if ((done[k] || 0) >= freq) return freq === 1 ? undo() : toast("Already complete for today. Use − to undo one.");
  const before = game().L;
  done[k] = (done[k] || 0) + 1;
  put({ ...h, done });
  const xp = 5 + (done[k] >= freq ? 5 : 0);
  put({ id: "l" + uid(), type: "log", k: "habit", ref: id, title: h.name, at: Date.now(), xp });
  celebrate(xp, el, before, done[k] >= freq);
}

// "call mom tomorrow 5pm #home !high every week" -> fields
function parseQuick(text) {
  const o = O(), now = Date.now(), t = today(), r = { tags: [], pri: 0, dk: "", tm: "", rep: null };
  const W3 = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const nextWd = (d) => { let k = addDays(t, 1); while (new Date(k + "T00:00:00Z").getUTCDay() !== d) k = addDays(k, 1); return k; };
  let s = " " + text + " ";
  s = s.replace(/\s#([\p{L}\d_-]+)/gu, (m, g) => { r.tags.push(g.toLowerCase()); return " "; });
  s = s.replace(/\s!(high|medium|med|low|[123])(?=\s)/i, (m, g) => { g = g.toLowerCase(); r.pri = g === "high" || g === "3" ? 3 : g === "low" || g === "1" ? 1 : 2; return " "; });
  s = s.replace(/\s(every\s?day|daily)(?=\s)/i, () => { r.rep = { f: "d", n: 1 }; return " "; });
  s = s.replace(/\s(every\s+weekday|weekdays)(?=\s)/i, () => { r.rep = { f: "w", n: 1, days: [1, 2, 3, 4, 5] }; return " "; });
  s = s.replace(/\s(every\s+week|weekly)(?=\s)/i, () => { r.rep = { f: "w", n: 1 }; return " "; });
  s = s.replace(/\s(every\s+month|monthly)(?=\s)/i, () => { r.rep = { f: "m", n: 1 }; return " "; });
  s = s.replace(/\severy\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?=\s)/i, (m, g) => { const d = W3.indexOf(g.toLowerCase()); r.rep = { f: "w", n: 1, days: [d] }; r.dk = nextWd(d); return " "; });
  s = s.replace(/\sin\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|h|days?|d|weeks?|w)(?=\s)/i, (m, n, u) => {
    u = u[0].toLowerCase(); n = +n;
    if (u === "m" || u === "h") { const ts = now + n * (u === "m" ? MIN : 60 * MIN), d = loc(ts, o); r.dk = dayKey(ts, o); r.tm = pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
    else r.dk = addDays(t, n * (u === "w" ? 7 : 1));
    return " ";
  });
  s = s.replace(/\s(today|tonight|tomorrow|tmrw|tmr|next week)(?=\s)/i, (m, g) => {
    g = g.toLowerCase();
    if (g === "today") r.dk = t; else if (g === "tonight") { r.dk = t; r.tm = r.tm || "20:00"; } else r.dk = addDays(t, g === "next week" ? 7 : 1);
    return " ";
  });
  s = s.replace(/\s(?:on\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|wed|thu|fri)(?=\s)/i, (m, g) => { r.dk = nextWd(W3.indexOf(g.slice(0, 3).toLowerCase())); return " "; });
  s = s.replace(/\s(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s)/i, (m, h, mi, ap) => { r.tm = pad((+h % 12) + (ap.toLowerCase() === "pm" ? 12 : 0)) + ":" + (mi || "00"); return " "; });
  if (!r.tm) s = s.replace(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m, h, mi) => { r.tm = pad(+h) + ":" + mi; return " "; });
  if (!r.tm) s = s.replace(/\s(?:at\s+|in the\s+)?(noon|morning|afternoon|evening)(?=\s)/i, (m, g) => { r.tm = { noon: "12:00", morning: "09:00", afternoon: "15:00", evening: "18:00" }[g.toLowerCase()]; return " "; });
  if ((r.tm || r.rep) && !r.dk) { r.dk = t; if (r.tm && keyTs(t, o, ...r.tm.split(":").map(Number)) < now) r.dk = addDays(t, 1); }
  r.title = s.trim().replace(/\s+/g, " ");
  return r;
}
function quickFields(text, ctx) {
  const p = parseQuick(text), o = O(), f = { title: p.title, tags: p.tags, pri: p.pri, rep: p.rep };
  const dk = p.dk || ctx.dk || "";
  if (dk) {
    f.allDay = !p.tm;
    f.at = p.tm ? keyTs(dk, o, ...p.tm.split(":").map(Number)) : keyTs(dk, o);
  }
  if (f.rep && f.rep.f === "m" && f.at != null) f.rep.dom = loc(f.at, o).getUTCDate();
  if (ctx.list) f.list = ctx.list;
  if (ctx.tag && !f.tags.includes(ctx.tag)) f.tags.push(ctx.tag);
  return f;
}
function quickPreview(text) {
  const p = parseQuick(text), o = O(), out = [];
  if (p.dk) out.push("📅 " + fmtDay(keyTs(p.dk, o), o, Date.now()) + (p.tm ? ", " + fmtTime(keyTs(p.dk, o, ...p.tm.split(":").map(Number)), o) : ""));
  if (p.rep) out.push("↻ " + repText(p.rep));
  if (p.pri) out.push(["", "Low", "Medium", "High"][p.pri] + " priority");
  for (const t of p.tags) out.push("#" + t);
  return out.join("  ·  ");
}

// ================= views =================
const ui = { tab: "today", filter: "inbox", q: "", month: today().slice(0, 7), sel: today(), calMode: "month", habit: "", showDone: false };
const TABS = [["today", "Today"], ["tasks", "Tasks"], ["cal", "Calendar"], ["habits", "Habits"], ["focus", "Focus"]];

const listOf = (it) => (it.list && db.recs[it.list] && !db.recs[it.list].del ? db.recs[it.list] : null);
function row(it, opt = {}) {
  const o = O(), now = Date.now(), at = opt.occ != null ? opt.occ : it.at, meta = [], L = listOf(it);
  const late = it.kind === "task" && !it.done && at != null && at < (it.allDay ? startToday() : now);
  if (at != null) meta.push('<span class="' + (late ? "late" : "") + '">' + esc(opt.timeOnly ? (it.allDay ? "All day" : fmtTime(at, o)) : fmtWhen({ at, allDay: it.allDay }, o, now)) + "</span>");
  if (it.kind === "event" && !it.allDay && it.dur) meta.push(it.dur < 60 ? it.dur + " min" : it.dur / 60 + " h");
  if (it.rep) meta.push("↻ " + esc(repText(it.rep)));
  if (L && !opt.noList) meta.push(esc(L.name));
  if (it.subs && it.subs.length) meta.push(it.subs.filter((s) => s.d).length + "/" + it.subs.length);
  if ((it.rem || []).length) meta.push("🔔" + (it.nag ? "×" : ""));
  if (it.est) meta.push("~" + it.est + " min");
  for (const t of it.tags || []) meta.push('<span class="tag">#' + esc(t) + "</span>");
  const lead = it.kind === "event"
    ? '<span class="evbar" style="background:' + esc(L ? L.color : "") + '"></span>'
    : '<button class="chk p' + (it.pri || 0) + '" data-a="toggle" data-id="' + it.id + '" aria-pressed="' + !!it.done + '" aria-label="' + (it.done ? "Mark not done: " : "Mark done: ") + esc(it.title) + '"></button>';
  return '<div class="row' + (it.done ? " done" : "") + (opt.ghost ? " ghost" : "") + '" data-a="edit" data-id="' + it.id + '" role="button" tabindex="0">' + lead +
    '<div class="rt"><div class="ti">' + esc(it.title) + "</div>" + (it.step && !it.done ? '<div class="st">→ ' + esc(it.step) + "</div>" : "") +
    (meta.length ? '<div class="me">' + meta.join(" · ") + "</div>" : "") + "</div></div>";
}
const quickAdd = (ph) => '<div class="card qa"><input id="qa" type="text" enterkeyhint="done" autocomplete="off" placeholder="' + esc(ph) +
  '" aria-label="Quick add"><button data-a="qaAdd" aria-label="Add">+</button></div><div class="qap" id="qap"></div>';
const habitRow = (h) => {
  const k = today(), n = (h.done || {})[k] || 0, freq = h.freq || 1, full = n >= freq, st = habitStats(h);
  return '<div class="hrow"><button class="hbtn' + (full ? " full" : "") + '" style="--hc:' + esc(h.color) + '" data-a="habit" data-id="' + h.id +
    '" aria-label="Check off ' + esc(h.name) + '">' + (h.icon ? esc(h.icon) : full ? "✓" : "") + (freq > 1 ? '<span class="cnt">' + n + "/" + freq + "</span>" : "") + "</button>" +
    '<div class="rt" data-a="habitOpen" data-id="' + h.id + '" role="button" tabindex="0"><div class="ti">' + esc(h.name) + '</div><div class="me">' +
    (st.cur ? "🔥 " + st.cur + " day" + (st.cur > 1 ? "s" : "") : "Start today") + (h.remAt ? " · 🔔 " + esc(h.remAt) : "") + "</div></div>" +
    (n > 0 && freq > 1 ? '<button class="minus" data-a="habitMinus" data-id="' + h.id + '" aria-label="Undo one">−</button>' : "") + "</div>";
};
const byAt = (a, b) => (a.at == null) - (b.at == null) || a.at - b.at || (b.pri || 0) - (a.pri || 0);

function vToday() {
  const o = O(), t = today(), start = startToday(), end = start + DAY, its = items();
  const late = its.filter((i) => i.kind === "task" && !i.done && i.at != null && i.at < start).sort(byAt);
  const cur = [];
  for (const i of its) {
    if (i.done || i.at == null) continue;
    if (i.kind === "event") for (const oc of occurrences(i, o, start, end)) cur.push({ it: i, occ: oc });
    else if (i.at >= start && i.at < end) cur.push({ it: i, occ: i.at });
  }
  cur.sort((a, b) => b.it.allDay - a.it.allDay || a.occ - b.occ);
  const hs = habits(), hd = hs.filter((h) => habitDone(h, t)).length;
  const done = logs().filter((l) => dayKey(l.at, o) === t).sort((a, b) => b.at - a.at);
  const q = quest();
  let h = quickAdd("Add anything… try “call mom tomorrow 5pm”");
  if (q.picks.length) {
    const st = q.picks.map(questState), n = st.filter((s) => s.ok).length;
    h += '<div class="card quests"><h3>🎯 Today’s quests <span>' + n + "/" + q.picks.length + " · +15 XP each</span></h3>" +
      q.picks.map((p, i) => '<div class="quest' + (st[i].ok ? " ok" : "") + '" data-a="questOpen" data-i="' + i + '" role="button" tabindex="0"><span class="qd">' + (st[i].ok ? "✓" : "") + "</span>" + esc(st[i].title) + "</div>").join("") + "</div>";
  }
  h += '<button class="btn soft pick" data-a="pick">🎲 Can’t decide? Pick one for me</button>';
  if (late.length) h += '<div class="sec">Carried over <span class="n">' + late.length + '</span><button data-a="lateToday">Move all to today</button></div><div class="card list">' + late.map((i) => row(i)).join("") + "</div>";
  h += '<div class="sec">Today <span class="n">' + (cur.length || "") + "</span></div>";
  h += cur.length ? '<div class="card list">' + cur.map((x) => row(x.it, { occ: x.occ, timeOnly: true })).join("") + "</div>"
    : '<div class="card empty">' + (late.length || done.length ? "Nothing else scheduled today." : "A clear day. Add one small thing above, or let me pick.") + "</div>";
  if (hs.length) h += '<div class="sec">Habits <span class="n">' + hd + "/" + hs.length + '</span></div><div class="card list">' + hs.map(habitRow).join("") + "</div>";
  if (done.length) {
    const xp = done.reduce((n, l) => n + (l.xp || 0), 0);
    h += '<div class="sec">Done today <span class="n">' + done.length + " · +" + xp + ' XP</span><button data-a="toggleDone">' + (ui.showDone ? "Hide" : "Show") + "</button></div>";
    if (ui.showDone) h += '<div class="card list">' + done.map((l) => '<div class="row done"><span class="chk" aria-pressed="true"></span><div class="rt"><div class="ti">' + esc(l.title) + '</div><div class="me">' + fmtTime(l.at, o) + " · +" + (l.xp || 0) + " XP</div></div></div>").join("") + "</div>";
  }
  return h;
}

function vTasks() {
  const o = O(), start = startToday(), f = ui.filter, its = items(), q = ui.q.trim().toLowerCase();
  const tags = [...new Set(its.filter((i) => !i.done).flatMap((i) => i.tags || []))].sort();
  const chip = (v, l) => '<button class="chip" data-a="filter" data-v="' + esc(v) + '" aria-pressed="' + (f === v) + '">' + esc(l) + "</button>";
  let h = '<div class="chips scroll">' + chip("inbox", "Inbox") + chip("all", "All") + chip("week", "Next 7 days") + chip("quick", "Quick wins") +
    lists().map((l) => chip("list:" + l.id, l.name)).join("") + tags.map((t) => chip("tag:" + t, "#" + t)).join("") + chip("done", "Completed") +
    '<button class="chip" data-a="listNew">+ List</button></div>';
  const lid = f.startsWith("list:") ? f.slice(5) : "", tag = f.startsWith("tag:") ? f.slice(4) : "";
  if (f !== "done") h += quickAdd(lid && db.recs[lid] ? "Add to " + db.recs[lid].name + "…" : "Add a task…");
  h += '<input class="in" id="q" type="search" placeholder="Search" aria-label="Search tasks" value="' + esc(ui.q) + '" style="margin-top:6px">';
  if (lid && db.recs[lid]) h += '<div class="sec">' + esc(db.recs[lid].name) + '<button data-a="listEdit" data-id="' + lid + '">Edit list</button></div>';
  let arr = its.filter((i) => (f === "done" ? i.done : !i.done)).filter((i) =>
    f === "inbox" ? !listOf(i) : f === "week" ? i.at != null && i.at < start + 7 * DAY : f === "quick" ? i.kind === "task" && (i.energy === "low" || (i.est && i.est <= 15)) :
    lid ? i.list === lid : tag ? (i.tags || []).includes(tag) : true);
  if (q) arr = arr.filter((i) => (i.title + " " + (i.notes || "") + " " + (i.tags || []).join(" ")).toLowerCase().includes(q));
  if (!arr.length) return h + '<div class="card empty" style="margin-top:14px">' + (q ? "Nothing matches that search." : f === "done" ? "Finished tasks will collect here." : f === "quick" ? "Tasks marked low energy or 15 minutes or less show up here." : "Nothing here. Enjoy the quiet.") + "</div>";
  if (f === "done") return h + '<div class="card list" style="margin-top:14px">' + arr.sort((a, b) => b.done - a.done).slice(0, 200).map((i) => row(i)).join("") + "</div>";
  const names = ["Carried over", "Today", "Tomorrow", "Next 7 days", "Later", "No date"], groups = names.map(() => []);
  for (const i of arr) groups[i.at == null ? 5 : i.at < start ? (i.kind === "event" && i.rep ? 4 : 0) : i.at < start + DAY ? 1 : i.at < start + 2 * DAY ? 2 : i.at < start + 7 * DAY ? 3 : 4].push(i);
  groups.forEach((g, n) => { if (g.length) h += '<div class="sec">' + names[n] + ' <span class="n">' + g.length + '</span></div><div class="card list">' + g.sort(byAt).map((i) => row(i, { noList: !!lid })).join("") + "</div>"; });
  return h;
}

function dayMap(from, to) {
  const o = O(), map = {};
  for (const it of items()) {
    if (it.at == null) continue;
    for (const occ of it.done ? (it.at >= from && it.at < to ? [it.at] : []) : occurrences(it, o, from, to)) {
      (map[dayKey(occ, o)] = map[dayKey(occ, o)] || []).push({ it, occ, ghost: it.kind === "task" && occ !== it.at });
    }
  }
  for (const k in map) map[k].sort((a, b) => b.it.allDay - a.it.allDay || a.occ - b.occ);
  return map;
}
function vCal() {
  const o = O(), t = today(), [y, m] = ui.month.split("-").map(Number), first = ui.month + "-01", g = game(), hs = habits();
  const agenda = (k, map) => {
    const arr = map[k] || [];
    return arr.length ? '<div class="card list">' + arr.map((x) => row(x.it, { occ: x.occ, timeOnly: true, ghost: x.ghost })).join("") + "</div>" : "";
  };
  let h = '<div class="calhead"><h2>' + MO[m - 1] + " " + y + '</h2><button class="btn ghost sm" data-a="calMode">' + (ui.calMode === "month" ? "Week" : "Month") +
    '</button><button class="btn ghost sm" data-a="calNav" data-v="0">Today</button><button class="btn ghost sm" data-a="calNav" data-v="-1" aria-label="Previous">‹</button><button class="btn ghost sm" data-a="calNav" data-v="1" aria-label="Next">›</button></div>';
  if (ui.calMode === "week") {
    const s = addDays(ui.sel, -new Date(ui.sel + "T00:00:00Z").getUTCDay()), map = dayMap(keyTs(s, o), keyTs(s, o) + 7 * DAY);
    for (let i = 0; i < 7; i++) {
      const k = addDays(s, i);
      h += '<div class="sec">' + fmtDay(keyTs(k, o), o, Date.now()) + (k === t ? "" : "") + '<button data-a="calAdd" data-v="' + k + '">+ Add</button></div>' + (agenda(k, map) || '<div class="hint" style="padding:0 4px">Free</div>');
    }
    return h;
  }
  const startK = addDays(first, -new Date(first + "T00:00:00Z").getUTCDay()), from = keyTs(startK, o), map = dayMap(from, from + 42 * DAY);
  h += '<div class="grid">' + WD.map((d) => '<div class="dow">' + d + "</div>").join("");
  for (let i = 0; i < 42; i++) {
    const k = addDays(startK, i), arr = (map[k] || []).filter((x) => !x.it.done), cls = ["day"];
    if (i >= 35 && k.slice(0, 7) !== ui.month && addDays(startK, 35).slice(0, 7) !== ui.month) break;
    if (k.slice(0, 7) !== ui.month) cls.push("out");
    if (k === t) cls.push("today");
    if (hs.length && k <= t && hs.every((x) => habitDone(x, k))) cls.push("hab");
    if (g.frozen.has(k)) cls.push("frz");
    h += '<button class="' + cls.join(" ") + '" data-a="calSel" data-v="' + k + '" aria-pressed="' + (k === ui.sel) + '" aria-label="' + k + ", " + arr.length + ' items">' + Number(k.slice(8)) +
      '<span class="dots">' + arr.slice(0, 4).map((x) => { const L = listOf(x.it); return "<i" + (L ? ' style="background:' + esc(L.color) + '"' : "") + "></i>"; }).join("") + "</span>" +
      arr.slice(0, 3).map((x) => '<span class="mini">' + esc(x.it.title) + "</span>").join("") + "</button>";
  }
  h += "</div>";
  h += '<div class="sec">' + fmtDay(keyTs(ui.sel, o), o, Date.now()) + '<button data-a="calAdd" data-v="' + ui.sel + '">+ Event</button></div>' +
    quickAdd("Add on this day…") + '<div style="height:8px"></div>' + (agenda(ui.sel, map) || '<div class="card empty">Nothing on this day.</div>');
  return h;
}

function vHabits() {
  const hs = habits(), t = today(), s = set();
  let h = "";
  if (!hs.length) h += '<div class="card empty" style="margin-top:8px">Habits are things you repeat daily: water, meds, a walk.<br>Each check-off adds to your streak and XP.</div>';
  else h += '<div class="card list" style="margin-top:8px">' + hs.map(habitRow).join("") + "</div>";
  h += '<button class="btn soft pick" data-a="habitNew">+ New habit</button>';
  const sel = db.recs[ui.habit] && !db.recs[ui.habit].del ? db.recs[ui.habit] : hs[0];
  if (sel) {
    const st = habitStats(sel), [y, m] = ui.month.split("-").map(Number), first = ui.month + "-01", lead = new Date(first + "T00:00:00Z").getUTCDay();
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), freq = sel.freq || 1;
    h += '<div class="sec">Calendar</div><div class="chips scroll">' + hs.map((x) => '<button class="chip" data-a="habitSel" data-id="' + x.id + '" aria-pressed="' + (x.id === sel.id) + '">' + esc((x.icon ? x.icon + " " : "") + x.name) + "</button>").join("") + "</div>";
    h += '<div class="stats">' + [["Current streak", st.cur], ["Best streak", st.best], ["Days done", st.days], ["Total", st.total]].map((x) => '<div class="card stat"><b>' + x[1] + "</b><span>" + x[0] + "</span></div>").join("") + "</div>";
    h += '<div class="calhead"><h2>' + MO[m - 1] + " " + y + '</h2><button class="btn ghost sm" data-a="calNav" data-v="-1" aria-label="Previous month">‹</button><button class="btn ghost sm" data-a="calNav" data-v="1" aria-label="Next month">›</button><button class="btn ghost sm" data-a="habitEdit" data-id="' + sel.id + '">Edit</button></div>';
    h += '<div class="grid">' + WD.map((d) => '<div class="dow">' + d + "</div>").join("") + "<span></span>".repeat(lead);
    for (let d = 1; d <= dim; d++) {
      const k = ui.month + "-" + pad(d), n = (sel.done || {})[k] || 0, fut = k > t;
      const bg = n >= freq ? sel.color : n > 0 ? sel.color + "55" : "";
      h += '<button class="hday' + (k === t ? " today" : "") + (fut ? " fut" : "") + '" ' + (fut ? "disabled" : 'data-a="habitDay" data-id="' + sel.id + '" data-v="' + k + '"') +
        ' style="' + (bg ? "background:" + esc(bg) + ";color:#16202A" : "") + '" aria-label="' + k + ": " + n + " of " + freq + '">' + d + "</button>";
    }
    h += '</div><p class="hint" style="margin-top:8px">Tap a past day to fix a missed check-off. Solid means complete, pale means partly done.</p>';
  }
  h += '<div class="sec">Tap counter</div><div class="card tap"><input class="in" id="tapLabel" placeholder="What are you counting?" value="' + esc(s.tap.label || "") + '" aria-label="Counter label">' +
    '<div class="num" id="tapNum">' + (s.tap.value || 0) + '</div><button class="btn big" data-a="tap" data-v="1">Tap +1</button>' +
    '<div class="r2"><button class="btn ghost" data-a="tap" data-v="-1">−1</button>' + (s.tap.value ? '<button class="btn ghost" data-a="tap" data-v="0">Reset</button>' : "") + "</div></div>";
  return h;
}

// ---------- focus timer ----------
let fo = null;
try { fo = JSON.parse(lsGet("onward.focus")); } catch (e) {}
const saveFo = () => lsSet("onward.focus", JSON.stringify(fo));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 60)) + ":" + pad(s % 60); };
function vFocus() {
  const o = O(), t = today(), start = startToday(), running = fo && (fo.end || fo.left);
  const cand = items().filter((i) => i.kind === "task" && !i.done && (i.at == null || i.at < start + DAY)).sort(byAt).slice(0, 40);
  const mins = logs().filter((l) => l.k === "focus" && dayKey(l.at, o) === t).reduce((n, l) => n + (l.min || 0), 0);
  let h = '<div class="card focus"><div class="hint">' + (running ? "Stay with it. Just this one thing." : "Starting is the hard part. Five minutes counts.") + "</div>" +
    '<div class="clock" id="clock">' + (running ? mmss(fo.end ? fo.end - Date.now() : fo.left) : "25:00") + "</div>";
  h += '<select class="in" id="foRef" aria-label="Task to focus on"><option value="">No specific task</option>' +
    cand.map((i) => '<option value="' + i.id + '"' + (fo && fo.ref === i.id ? " selected" : "") + ">" + esc(i.title) + "</option>").join("") + "</select>";
  if (running) h += '<div class="r2"><button class="btn" data-a="foPause">' + (fo.end ? "Pause" : "Resume") + '</button><button class="btn ghost" data-a="foStop">Finish early</button></div>';
  else h += '<div class="chips" style="justify-content:center">' + [5, 15, 25, 50].map((n) => '<button class="btn ' + (n === 5 ? "" : "ghost") + '" data-a="foStart" data-v="' + n + '">' + (n === 5 ? "Just 5 min" : n + " min") + "</button>").join("") + "</div>";
  h += "</div>";
  h += '<div class="stats" style="grid-template-columns:repeat(2,1fr)"><div class="card stat"><b>' + mins + '</b><span>Minutes focused today</span></div><div class="card stat"><b>' +
    logs().filter((l) => l.k === "focus" && dayKey(l.at, o) === t).length + "</b><span>Sessions today</span></div></div>";
  h += '<p class="hint">Stopping early still earns XP for the minutes you did. Keep this tab open while the timer runs.</p>';
  return h;
}
function foFinish(early) {
  if (!fo) return;
  const total = fo.min * MIN, left = fo.end ? fo.end - Date.now() : fo.left || 0, min = Math.max(0, Math.round((total - Math.max(0, left)) / MIN));
  const ref = db.recs[fo.ref], before = game().L;
  fo = fo.ref ? { ref: fo.ref } : null; saveFo();
  document.title = "Onward";
  if (min >= 1) {
    const xp = Math.max(2, Math.round(min / 5) * 2);
    put({ id: "l" + uid(), type: "log", k: "focus", ref: ref ? ref.id : "", title: "Focused " + min + " min" + (ref ? ": " + ref.title : ""), at: Date.now(), xp, min });
    celebrate(xp, $("#clock"), before, !early);
    toast(early ? "Stopped at " + min + " min. That still counts. +" + xp + " XP" : "Session complete. +" + xp + " XP");
    if (!early) { beep([660, 880, 1100]); if (navigator.vibrate) navigator.vibrate([300, 100, 300]); }
  }
  checkQuests(); render();
}
function foTick() {
  if (!fo || !fo.end) return;
  const left = fo.end - Date.now();
  if (left <= 0) return foFinish(false);
  const el = $("#clock");
  if (el) el.textContent = mmss(left);
  document.title = mmss(left) + " · Onward";
}

// ---------- shell ----------
function drawTop() {
  const g = game(), o = O(), d = loc(Date.now(), o);
  const title = ui.tab === "today" ? WD[d.getUTCDay()] + " " + d.getUTCDate() + " " + MO[d.getUTCMonth()] : TABS.find((t) => t[0] === ui.tab)[1];
  $("#top").innerHTML = '<div class="grow"><h1>' + title + '</h1><div class="sub">' + TITLES[Math.min(g.L, TITLES.length) - 1] + "</div></div>" +
    '<span class="pill fire" title="Day streak. ❄ are streak freezes that cover a missed day.">🔥 ' + g.streak + (g.freezes ? " · ❄" + g.freezes : "") + "</span>" +
    '<div class="lvl" title="' + g.xp + ' XP in total"><b>Lv ' + g.L + "<span>" + g.cur + "/" + g.need + '</span></b><div class="bar"><i style="width:' + Math.round((100 * g.cur) / g.need) + '%"></i></div></div>' +
    '<button class="ib" data-a="settings" aria-label="Settings">' + ICON.gear + '<span class="dot ' + dot + '"></span></button>';
}
function render() {
  const main = $("#main"), a = document.activeElement, keep = a && a.id && main.contains(a) ? { id: a.id, v: a.value, s: a.selectionStart } : null, y = main.scrollTop;
  const qa = $("#qa"), qaVal = qa ? qa.value : "";
  $("#nav").innerHTML = '<div class="brand">Onward</div>' + TABS.map(([k, l]) => '<button data-a="tab" data-v="' + k + '"' + (ui.tab === k ? ' aria-current="page"' : "") + ">" + ICON[k] + "<span>" + l + "</span></button>").join("");
  drawTop();
  main.innerHTML = { today: vToday, tasks: vTasks, cal: vCal, habits: vHabits, focus: vFocus }[ui.tab]();
  main.scrollTop = y;
  if ($("#qa") && qaVal) { $("#qa").value = qaVal; $("#qap").textContent = quickPreview(qaVal); }
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (e) {} } }
}
const done = () => { checkQuests(); render(); };

// ================= sheets =================
let onSheetClose = null;
function openSheet(title, body, onClose, btn) {
  $("#sheet").innerHTML = '<div class="sh" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="shh"><h2>' + esc(title) +
    '</h2><button class="btn sm" data-a="closeSheet">' + (btn || "Done") + '</button></div><div class="shb">' + body + "</div></div>";
  $("#sheet").hidden = false; onSheetClose = onClose || null;
  const af = $("#sheet [autofocus]"); if (af) af.focus();
}
function closeSheet(skip) {
  const f = onSheetClose; onSheetClose = null;
  if (f && !skip) f();
  $("#sheet").hidden = true; $("#sheet").innerHTML = "";
  done();
}
function setBody(html) {
  const b = $("#sheet .shb"), y = b.scrollTop, a = document.activeElement;
  const k = a && b.contains(a) && a.dataset.f ? '[data-f="' + a.dataset.f + '"]' + (a.dataset.i ? '[data-i="' + a.dataset.i + '"]' : "") : "";
  b.innerHTML = html; b.scrollTop = y;
  if (k && $(k, b)) $(k, b).focus();
}
const chipBtn = (a, v, l, on, extra) => '<button class="chip" data-a="' + a + '" data-v="' + esc(v) + '" aria-pressed="' + !!on + '"' + (extra || "") + ">" + l + "</button>";
const opts = (arr, cur) => arr.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(l) + "</option>").join("");
const chRow = (a, cur, extra) => '<div class="chips">' + CHS.map(([c, l]) => chipBtn(a, c, l, (cur || []).includes(c), extra)).join("") + "</div>";

// ---------- task / event editor ----------
let ed = null;
function editItem(id, preset) {
  const o = O(), ex = id && db.recs[id] && !db.recs[id].del ? db.recs[id] : null;
  const it = ex ? JSON.parse(JSON.stringify(ex)) : newItem({ withRem: true, ...(preset || {}) });
  const r = it.rep, wd5 = r && r.f === "w" && r.days && r.days.length === 5 && [1, 2, 3, 4, 5].every((x) => r.days.includes(x));
  ed = { it, isNew: !ex, dk: it.at != null ? dayKey(it.at, o) : "", tm: it.at != null && !it.allDay ? hhmm(it.at) : "",
    rs: !r ? "" : wd5 ? "wd" : (r.n || 1) > 1 ? "c" : r.f, cn: r ? r.n || 1 : 2, cu: r ? r.f : "d", days: r && r.days && !wd5 ? r.days.slice() : [] };
  openSheet(ex ? "Edit" : "New", edBody(), saveEd, "Save");
}
function remRow(r, i) {
  const mode = r.at != null ? "x" : r._c || !PRE.includes(r.off) ? "c" : String(r.off), m = r.off || 0;
  const u = m && m % 10080 === 0 ? 10080 : m && m % 1440 === 0 ? 1440 : m && m % 60 === 0 ? 60 : 1;
  const dtl = (ts) => dayKey(ts, O()) + "T" + hhmm(ts);
  return '<div class="card rem"><div class="r2"><select class="in" data-c="remWhen" data-i="' + i + '" aria-label="When to remind">' +
    opts(PRE.map((p) => [p, remText({ off: p })]).concat([["c", "Custom…"], ["x", "At an exact date and time…"]]), mode) +
    '</select><button class="x" data-a="remDel" data-i="' + i + '" aria-label="Remove reminder">×</button></div>' +
    (mode === "c" ? '<div class="r2"><input class="in" type="number" min="1" inputmode="numeric" data-f="remN" data-i="' + i + '" value="' + (m / u || 20) + '" aria-label="How many"><select class="in" data-f="remU" data-i="' + i + '" aria-label="Unit">' +
      opts([[1, "minutes before"], [60, "hours before"], [1440, "days before"], [10080, "weeks before"]], u) + "</select></div>" : "") +
    (mode === "x" ? '<div class="r2"><input class="in" type="datetime-local" data-f="remAt" data-i="' + i + '" value="' + dtl(r.at) + '" aria-label="Exact time"></div>' : "") +
    chRow("remCh", r.ch, ' data-i="' + i + '"') + "</div>";
}
function edBody() {
  const it = ed.it, t = today(), ev = it.kind === "event", wk = ed.rs === "w" || (ed.rs === "c" && ed.cu === "w");
  return '<input class="in title" data-f="title" placeholder="' + (ev ? "What’s happening?" : "What needs doing?") + '" value="' + esc(it.title) + '"' + (ed.isNew ? " autofocus" : "") + ">" +
    (ev ? "" : '<div class="f"><input class="in" data-f="step" placeholder="Tiniest first step (optional), e.g. “open the doc”" value="' + esc(it.step || "") + '" aria-label="First tiny step"></div>') +
    '<div class="f chips">' + chipBtn("edKind", "task", "Task", !ev) + chipBtn("edKind", "event", "Event", ev) + "</div>" +
    '<div class="f"><label>When</label><div class="chips" style="margin-bottom:8px">' + [["", "No date"], [t, "Today"], [addDays(t, 1), "Tomorrow"], [addDays(t, 7), "Next week"]].map(([v, l]) => chipBtn("edDk", v, l, ed.dk === v)).join("") +
    '</div><div class="r2"><input class="in" type="date" data-f="dk" data-c="redraw" value="' + ed.dk + '" aria-label="Date"><input class="in" type="time" data-f="tm" data-c="redraw" value="' + ed.tm + '" aria-label="Time, leave empty for all day"></div>' +
    (ev && ed.tm ? '<select class="in" data-f="dur" style="margin-top:8px" aria-label="Length">' + opts([[15, "15 minutes long"], [30, "30 minutes long"], [45, "45 minutes long"], [60, "1 hour long"], [90, "1.5 hours long"], [120, "2 hours long"], [180, "3 hours long"], [240, "4 hours long"]], it.dur || 60) + "</select>" : "") +
    (ed.dk && !ed.tm ? '<p class="hint" style="margin-top:6px">No time set, so this is all day. Reminders count from ' + esc(set().alldayAt) + ".</p>" : "") + "</div>" +
    '<div class="f"><label>Repeat</label><select class="in" data-f="rs" data-c="redraw" aria-label="Repeat">' + opts([["", "Doesn’t repeat"], ["d", "Daily"], ["wd", "Weekdays (Mon to Fri)"], ["w", "Weekly"], ["m", "Monthly"], ["y", "Yearly"], ["c", "Custom…"]], ed.rs) + "</select>" +
    (ed.rs === "c" ? '<div class="r2" style="margin-top:8px"><input class="in" type="number" min="1" inputmode="numeric" data-f="cn" value="' + ed.cn + '" aria-label="Every how many"><select class="in" data-f="cu" data-c="redraw" aria-label="Unit">' + opts([["d", "days"], ["w", "weeks"], ["m", "months"], ["y", "years"]], ed.cu) + "</select></div>" : "") +
    (wk ? '<div class="chips" style="margin-top:8px">' + WD.map((d, i) => chipBtn("edWd", i, d, ed.days.includes(i))).join("") + "</div>" : "") + "</div>" +
    '<div class="f"><label>Reminders</label>' + it.rem.map(remRow).join("") + '<button class="btn soft sm" data-a="remAdd">+ Add reminder</button>' +
    (it.rem.some((r) => r.at == null) && !ed.dk ? '<p class="hint" style="margin-top:6px">Pick a date above, or these reminders have nothing to count from.</p>' : "") + "</div>" +
    (ev ? "" : '<div class="f"><label>If I ignore it</label><select class="in" data-f="nag" aria-label="Keep nudging">' + opts([[0, "Remind once"], [5, "Nudge every 5 min until done (up to 5 times)"], [10, "Nudge every 10 min until done (up to 5 times)"], [30, "Nudge every 30 min until done (up to 5 times)"]], it.nag || 0) + "</select></div>") +
    '<div class="f r2"><div><span class="lab">List</span><select class="in" data-f="list" aria-label="List">' + opts([["", "Inbox"]].concat(lists().map((l) => [l.id, l.name])), it.list) + "</select></div>" +
    '<div><span class="lab">Takes about</span><select class="in" data-f="est" aria-label="Estimate">' + opts([[0, "Not sure"], [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hour"], [120, "2 hours"], [240, "Half a day"]], it.est || 0) + "</select></div></div>" +
    (ev ? "" : '<div class="f"><label>Priority</label><div class="chips">' + ["None", "Low", "Medium", "High"].map((l, i) => chipBtn("edPri", i, l, (it.pri || 0) === i)).join("") + "</div></div>" +
      '<div class="f"><label>Energy it needs</label><div class="chips">' + [["", "Not set"], ["low", "Low"], ["med", "Medium"], ["high", "High"]].map(([v, l]) => chipBtn("edEn", v, l, (it.energy || "") === v)).join("") + "</div></div>") +
    '<div class="f"><label>Tags</label><input class="in" data-f="tags" placeholder="home, study" value="' + esc((it.tags || []).join(", ")) + '" aria-label="Tags, separated by commas"></div>' +
    (ev ? "" : '<div class="f"><label>Subtasks</label>' + it.subs.map((s, i) => '<div class="sub"><button class="chk" data-a="subT" data-i="' + i + '" aria-pressed="' + !!s.d + '" aria-label="Toggle subtask"></button><input class="in" type="text" data-f="sub" data-i="' + i + '" value="' + esc(s.t) + '" aria-label="Subtask"><button class="x" data-a="subDel" data-i="' + i + '" aria-label="Remove subtask">×</button></div>').join("") +
      '<div class="sub"><input class="in" type="text" id="subNew" data-f="subNew" placeholder="Add a step, then press Enter" aria-label="New subtask"><button class="btn soft sm" data-a="subAdd">Add</button></div></div>') +
    '<div class="f"><label>Notes</label><textarea class="in" data-f="notes" aria-label="Notes">' + esc(it.notes || "") + "</textarea></div>" +
    '<div class="f r2"><button class="btn" data-a="closeSheet">Save</button>' + (ed.isNew ? '<button class="btn ghost" data-a="cancelSheet">Cancel</button>' : '<button class="btn danger" data-a="delItem">Delete</button>') + "</div>";
}
function readForm() {
  if (!ed) return;
  const it = ed.it, o = O();
  for (const el of $$("#sheet [data-f]")) {
    const f = el.dataset.f, v = el.value, i = +el.dataset.i;
    if (f === "title" || f === "step" || f === "notes" || f === "list") it[f] = v;
    else if (f === "dk" || f === "tm" || f === "rs" || f === "cu") ed[f] = v;
    else if (f === "cn") ed.cn = Math.max(1, Math.floor(+v) || 1);
    else if (f === "dur" || f === "nag" || f === "est") it[f] = +v;
    else if (f === "tags") it.tags = [...new Set(v.split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))];
    else if (f === "sub" && it.subs[i]) it.subs[i].t = v;
    else if (f === "remN" && it.rem[i]) it.rem[i]._n = Math.max(1, Math.floor(+v) || 1);
    else if (f === "remU" && it.rem[i]) it.rem[i].off = (it.rem[i]._n || 1) * +v;
    else if (f === "remAt" && it.rem[i] && v) { const [d, tm] = v.split("T"); it.rem[i].at = keyTs(d, o, ...tm.split(":").map(Number)); }
    else if (f === "subNew" && v.trim()) { it.subs.push({ id: uid(), t: v.trim(), d: 0 }); el.value = ""; }
  }
}
function saveEd() {
  if (!ed) return;
  readForm();
  const e = ed, it = e.it, o = O();
  ed = null;
  it.title = it.title.trim();
  if (!it.title) { if (!e.isNew) toast("The title was empty, so nothing was changed."); return; }
  it.subs = it.subs.filter((s) => s.t.trim());
  it.rem = it.rem.map((r) => (r.at != null ? { id: r.id, at: r.at, ch: r.ch } : { id: r.id, off: r.off || 0, ch: r.ch }));
  if (e.rs && !e.dk) e.dk = today();
  if (e.dk) {
    it.allDay = !e.tm;
    it.at = e.tm ? keyTs(e.dk, o, ...e.tm.split(":").map(Number)) : keyTs(e.dk, o);
  } else { it.at = null; it.allDay = true; }
  if (!e.rs) it.rep = null;
  else {
    const f = e.rs === "c" ? e.cu : e.rs === "wd" ? "w" : e.rs, rep = { f, n: e.rs === "c" ? e.cn : 1 };
    if (e.rs === "wd") rep.days = [1, 2, 3, 4, 5];
    else if (f === "w" && e.days.length) rep.days = e.days.slice().sort();
    if (f === "m") rep.dom = loc(it.at, o).getUTCDate();
    if (rep.days) for (let g = 0; g < 7 && !rep.days.includes(loc(it.at, o).getUTCDay()); g++) it.at += DAY;
    it.rep = rep;
  }
  put(it);
}

// ---------- habit + list editors ----------
let hd = null;
function editHabit(id) {
  const ex = id && db.recs[id];
  hd = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid(), type: "habit", name: "", icon: "", color: COLORS[habits().length % COLORS.length], freq: 1, done: {}, remAt: "", remCh: [...set().defCh], ord: Date.now(), created: Date.now(), isNew: 1 };
  openSheet(ex ? "Edit habit" : "New habit", hdBody(), saveHabit, "Save");
}
const swatches = (a, cur) => '<div class="sw">' + COLORS.map((c) => '<button data-a="' + a + '" data-v="' + c + '" style="background:' + c + '" aria-pressed="' + (c === cur) + '" aria-label="Colour ' + c + '"></button>').join("") + "</div>";
function hdBody() {
  return '<input class="in title" data-f="name" placeholder="e.g. Drink water" value="' + esc(hd.name) + '"' + (hd.isNew ? " autofocus" : "") + ">" +
    '<div class="f r2"><div><span class="lab">Icon (emoji)</span><input class="in" data-f="icon" maxlength="4" value="' + esc(hd.icon || "") + '" placeholder="💧"></div>' +
    '<div><span class="lab">Times per day</span><input class="in" type="number" min="1" max="50" inputmode="numeric" data-f="freq" value="' + (hd.freq || 1) + '"></div></div>' +
    '<div class="f"><label>Colour</label>' + swatches("hdColor", hd.color) + "</div>" +
    '<div class="f"><label>Daily reminder</label><input class="in" type="time" data-f="remAt" value="' + esc(hd.remAt || "") + '" aria-label="Reminder time, empty for none"><div style="height:8px"></div>' + chRow("hdCh", hd.remCh) +
    '<p class="hint" style="margin-top:6px">Leave the time empty for no reminder. It is skipped on days you have already finished.</p></div>' +
    '<div class="f r2"><button class="btn" data-a="closeSheet">Save</button>' + (hd.isNew ? '<button class="btn ghost" data-a="cancelSheet">Cancel</button>' : '<button class="btn danger" data-a="hdDel">Delete</button>') + "</div>" +
    (hd.isNew ? "" : '<div class="f r2"><button class="btn ghost sm" data-a="hdMove" data-v="-1">Move up</button><button class="btn ghost sm" data-a="hdMove" data-v="1">Move down</button></div>');
}
function readHd() {
  if (!hd) return;
  for (const el of $$("#sheet [data-f]")) hd[el.dataset.f] = el.dataset.f === "freq" ? Math.min(50, Math.max(1, Math.floor(+el.value) || 1)) : el.value.trim();
}
function saveHabit() {
  if (!hd) return;
  readHd();
  const h = hd; hd = null;
  if (!h.name) return;
  delete h.isNew;
  put(h); ui.habit = h.id;
}
let ld = null;
function editList(id) {
  const ex = id && db.recs[id];
  ld = ex ? { ...ex } : { id: uid(), type: "list", name: "", color: COLORS[lists().length % COLORS.length], ord: Date.now(), isNew: 1 };
  const body = () => '<input class="in title" data-f="name" placeholder="e.g. Placements, Home, Research" value="' + esc(ld.name) + '"' + (ld.isNew ? " autofocus" : "") + '><div class="f"><label>Colour</label>' + swatches("ldColor", ld.color) + "</div>" +
    '<div class="f r2"><button class="btn" data-a="closeSheet">Save</button>' + (ld.isNew ? '<button class="btn ghost" data-a="cancelSheet">Cancel</button>' : '<button class="btn danger" data-a="ldDel">Delete list</button>') + "</div>" +
    (ld.isNew ? "" : '<p class="hint" style="margin-top:8px">Deleting a list keeps its tasks and moves them to the Inbox.</p>');
  ld.body = body;
  openSheet(ex ? "Edit list" : "New list", body(), () => {
    if (!ld) return;
    const l = ld; ld = null;
    l.name = ($("#sheet [data-f=name]") || {}).value.trim();
    if (!l.name) return;
    const isNew = l.isNew; delete l.isNew; delete l.body;
    put(l); if (isNew) ui.filter = "list:" + l.id;
  }, "Save");
}

// ---------- pick for me ----------
let picked = [];
function pickOne() {
  const start = startToday(), q = quest(), qs = new Set(q.picks.map((p) => p.ref));
  let c = items().filter((i) => i.kind === "task" && !i.done && (i.at == null || i.at < start + DAY));
  if (!c.length) return toast("Nothing waiting. Add a task first.");
  if (c.every((i) => picked.includes(i.id))) picked = [];
  c = c.filter((i) => !picked.includes(i.id));
  const w = c.map((i) => 1 + (qs.has(i.id) ? 3 : 0) + (i.pri || 0) + (i.energy === "low" ? 1 : 0) + (i.at != null ? 1 : 0));
  let r = Math.random() * w.reduce((a, b) => a + b, 0), it = c[0];
  for (let i = 0; i < c.length; i++) { r -= w[i]; if (r <= 0) { it = c[i]; break; } }
  picked.push(it.id);
  openSheet("Just this one", '<div class="lvup"><div class="big">👉</div><h2 style="font-size:24px;margin:8px 0">' + esc(it.title) + "</h2>" +
    (it.step ? '<p style="color:var(--accent);font-weight:600">First step: ' + esc(it.step) + "</p>" : '<p class="hint">What is the smallest possible first move? Do only that.</p>') + "</div>" +
    '<div class="f"><button class="btn" style="width:100%" data-a="pickFocus" data-id="' + it.id + '">Start with just 5 minutes</button></div>' +
    '<div class="f r2"><button class="btn ghost" data-a="pickDone" data-id="' + it.id + '">Already done ✓</button><button class="btn ghost" data-a="pick">Not this one</button></div>', null, "Close");
}

// ---------- settings ----------
let cfg = null;
const sMsg = (id, text, cls) => { const el = document.getElementById(id); if (el) { el.textContent = text; el.className = "msg " + (cls || ""); } };
function settingsBody() {
  const s = set(), perm = "Notification" in window ? Notification.permission : "unsupported";
  const c = cfg || {};
  return '<details class="card grp"' + (key ? "" : " open") + "><summary>Sync between devices " + (key ? (dot === "err" ? "· key rejected" : "· connected") : "· off") + "</summary>" +
    '<p class="hint">Type the same key (your APP_KEY secret from Cloudflare) on your phone and laptop. Reminders need this to be on.</p>' +
    '<div class="r2" style="margin-top:8px"><input class="in" id="sKey" type="password" autocomplete="off" placeholder="Sync key" value="' + esc(key) + '"><button class="btn" style="flex:none" data-a="sKey">Save</button></div><div class="msg" id="mKey"></div></details>' +

    '<details class="card grp" open><summary>Notifications on this device</summary>' +
    '<p class="hint">' + (perm === "granted" ? "Allowed in this browser." : perm === "denied" ? "Blocked. Allow notifications for this site in your browser settings, then come back." : perm === "unsupported" ? "This browser cannot show notifications." : "Not turned on yet.") +
    (c.pushDevices != null ? " " + c.pushDevices + " device" + (c.pushDevices === 1 ? "" : "s") + " registered." : "") + "</p>" +
    '<button class="btn" style="margin-top:8px" data-a="pushOn">Turn on push + alarm here</button><div class="msg" id="mPush"></div>' +
    '<span class="lab" style="margin-top:10px">Send a test</span><div class="chips">' + CHS.map(([k, l]) => '<button class="chip" data-a="test" data-v="' + k + '">' + l + '</button>').join("") + '</div><div class="msg" id="mTest"></div></details>' +

    '<details class="card grp"><summary>Telegram ' + (c.tgChat ? "· linked" : c.tgToken ? "· token saved, not linked" : "· not set up") + "</summary>" +
    '<p class="hint">1. In Telegram, message @BotFather, send /newbot and copy the token it gives you.<br>2. Paste the token here and save.<br>3. Open your new bot, press Start, then tap Link.</p>' +
    '<div class="r2" style="margin-top:8px"><input class="in" id="sTg" type="password" autocomplete="off" placeholder="' + (c.tgToken ? "Token saved. Paste to replace" : "Bot token") + '"><button class="btn" style="flex:none" data-a="tgSave">Save</button></div>' +
    '<button class="btn soft" style="margin-top:8px" data-a="tgLink">Link my chat</button><div class="msg" id="mTg"></div></details>' +

    '<details class="card grp"><summary>Email ' + (c.resendKey && c.emailTo ? "· " + esc(c.emailTo) : "· not set up") + "</summary>" +
    '<p class="hint">Email goes out through Resend (free tier). Create an account at resend.com, make an API key, and paste it here. Without your own domain, Resend only delivers to the address you signed up with.</p>' +
    '<input class="in" id="sRk" type="password" autocomplete="off" style="margin-top:8px" placeholder="' + (c.resendKey ? "API key saved. Paste to replace" : "Resend API key") + '">' +
    '<input class="in" id="sTo" type="email" style="margin-top:8px" placeholder="Send reminders to this address" value="' + esc(c.emailTo || "") + '">' +
    '<input class="in" id="sFrom" type="text" style="margin-top:8px" placeholder="From (optional, needs a verified domain)" value="' + esc(c.emailFrom || "") + '">' +
    '<button class="btn" style="margin-top:8px" data-a="mailSave">Save</button><div class="msg" id="mMail"></div></details>' +

    '<details class="card grp"><summary>Reminder defaults</summary>' +
    '<span class="lab">New items remind me</span><select class="in" data-s="defOff">' + opts(PRE.map((p) => [p, remText({ off: p })]), s.defOff) + "</select>" +
    '<span class="lab" style="margin-top:12px">Through</span>' + chRow("sDefCh", s.defCh) +
    '<span class="lab" style="margin-top:12px">All-day items count from</span><input class="in" type="time" data-s="alldayAt" value="' + esc(s.alldayAt) + '">' +
    '<span class="lab" style="margin-top:12px">Morning plan at</span><input class="in" type="time" data-s="digestAt" value="' + esc(s.digestAt || "") + '"><div style="height:8px"></div>' + chRow("sDigCh", s.digestCh) +
    '<p class="hint" style="margin-top:6px">One message a day with what is planned and what carried over. Clear the time to turn it off.</p></details>' +

    '<details class="card grp"><summary>Look and sound</summary><span class="lab">Theme</span><select class="in" data-s="theme">' + opts([["auto", "Match my device"], ["light", "Light"], ["dark", "Dark"]], s.theme) + "</select>" +
    '<span class="lab" style="margin-top:12px">Sounds</span><select class="in" data-s="sound">' + opts([["1", "On"], ["", "Off"]], s.sound ? "1" : "") + "</select></details>" +

    '<details class="card grp"><summary>Bring in my Tally counter data</summary>' +
    '<p class="hint">Your tally tasks become habits here, with every past check-off and streak kept. Safe to run twice.</p>' +
    '<input class="in" id="sTu" type="url" style="margin-top:8px" placeholder="Old app address, e.g. https://tallycounter.you.workers.dev">' +
    '<input class="in" id="sTk" type="password" autocomplete="off" style="margin-top:8px" placeholder="Old app sync key">' +
    '<button class="btn" style="margin-top:8px" data-a="tallyFetch">Import</button>' +
    '<p class="hint" style="margin-top:12px">Or, if the old app never used sync: open it on your laptop, press F12, paste <code>copy(localStorage.getItem("tallyCounter.v1"))</code> into the Console, then paste the result here.</p>' +
    '<textarea class="in" id="sTj" style="margin-top:8px" placeholder="Paste tally data"></textarea><button class="btn ghost" style="margin-top:8px" data-a="tallyPaste">Import pasted data</button><div class="msg" id="mTally"></div></details>' +

    '<details class="card grp"><summary>Backup</summary><div class="r2"><button class="btn ghost" data-a="exportData">Download backup</button><label class="btn ghost" style="cursor:pointer">Restore backup<input type="file" id="sFile" accept="application/json,.json" hidden></label></div><div class="msg" id="mBak"></div></details>';
}
async function openSettings() {
  openSheet("Settings", settingsBody(), null, "Close");
  if (!key) return;
  try { cfg = await api("/api/config"); if (!$("#sheet").hidden && $("#sKey")) setBody(settingsBody()); } catch (e) {}
}
function b64ToU8(s) { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
async function pushOn() {
  if (!key) return sMsg("mPush", "Connect sync first (top section).", "bad");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return sMsg("mPush", "This browser cannot receive push notifications. On Android use Chrome and install the app.", "bad");
  sMsg("mPush", "Asking for permission…");
  try {
    if ((await Notification.requestPermission()) !== "granted") return sMsg("mPush", "Notifications are blocked for this site. Allow them in the browser’s site settings.", "bad");
    const reg = await navigator.serviceWorker.ready, vk = (await api("/api/push/key")).key;
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe().catch(() => {});
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vk) });
    await api("/api/push/sub", sub.toJSON());
    sMsg("mPush", "On. Tap “🔔 Push” below to send yourself a test.", "ok");
  } catch (e) { sMsg("mPush", "Could not turn on: " + e.message, "bad"); }
}
function importTally(d) {
  if (!d || !Array.isArray(d.counters)) throw new Error("That is not tally counter data.");
  let total = 0;
  const base = habits().length;
  d.counters.forEach((c, i) => {
    const freq = Math.min(50, Math.max(1, Math.floor(+c.freq) || 1)), src = c.done || c.days || {}, id = "t-" + String(c.id || i), ex = db.recs[id] && !db.recs[id].del ? db.recs[id] : null;
    const dn = { ...(ex ? ex.done : {}) };
    for (const k in src) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const n = typeof src[k] === "string" ? freq : Math.floor(+src[k]) || 0; // older saves stored a colour for a painted day
      if (n > 0) { dn[k] = Math.max(dn[k] || 0, Math.min(n, 999)); total += n; }
    }
    put({ id, type: "habit", name: String(c.name || "Untitled"), tag: String(c.tag || ""), color: /^#[0-9a-f]{3,8}$/i.test(c.color || "") ? c.color : COLORS[4],
      icon: String(c.icon || "").slice(0, 8), freq, done: dn, remAt: ex ? ex.remAt : "", remCh: ex ? ex.remCh : [], ord: ex ? ex.ord : base + i, created: Date.parse(c.createdAt) || Date.now() });
  });
  if (d.tap && +d.tap.value > 0) { const s = set(); put({ ...s, tap: { label: s.tap.label || String(d.tap.label || ""), value: Math.max(s.tap.value || 0, +d.tap.value) } }); }
  if (total && !db.recs["l-tally-import"]) put({ id: "l-tally-import", type: "log", k: "bonus", title: "Brought over tally history", at: Date.now(), xp: Math.min(3000, total * 5) });
  return d.counters.length;
}

// ================= feedback: toast, sound, confetti, alarm =================
function toast(msg, undo) {
  const el = document.createElement("div");
  el.className = "tst"; el.textContent = msg;
  if (undo) { const b = document.createElement("button"); b.textContent = "Undo"; b.onclick = () => { undo(); el.remove(); done(); }; el.appendChild(b); }
  $("#toast").appendChild(el);
  while ($("#toast").children.length > 2) $("#toast").firstChild.remove();
  setTimeout(() => el.remove(), undo ? 6000 : 3500);
}
let actx = null;
function beep(freqs, len = 0.12) {
  if (!set().sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * len;
      o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + len + 0.02);
    });
  } catch (e) {}
}
function spot(el) {
  const r = el && el.isConnected ? el.getBoundingClientRect() : null;
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
}
function floatXp(xp, el) {
  const p = spot(el), d = document.createElement("div");
  d.className = "xp"; d.textContent = "+" + xp + " XP"; d.style.left = p.x + 14 + "px"; d.style.top = p.y - 14 + "px";
  $("#fx").appendChild(d); setTimeout(() => d.remove(), 1100);
}
function confetti(el, n = 16) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const p = spot(el);
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i"), a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 90;
    c.className = "cf"; c.style.cssText = "left:" + p.x + "px;top:" + p.y + "px;background:" + COLORS[i % COLORS.length] + ";--dx:" + Math.cos(a) * d + "px;--dy:" + (Math.sin(a) * d + 40) + "px;--r:" + (Math.random() * 720 - 360) + "deg";
    $("#fx").appendChild(c); setTimeout(() => c.remove(), 950);
  }
}
function celebrate(xp, el, levelBefore, big = true) {
  const p = spot(el);
  floatXp(xp, el); if (big) confetti(el);
  beep(big ? [523, 784] : [523]);
  if (navigator.vibrate) navigator.vibrate(big ? 30 : 12);
  const g = game();
  if (g.L > levelBefore) setTimeout(() => {
    confetti({ isConnected: true, getBoundingClientRect: () => ({ left: p.x, top: p.y, width: 1, height: 1 }) }, 60); beep([523, 659, 784, 1047]);
    if ($("#sheet").hidden) openSheet("Level up", '<div class="lvup"><div class="big">🏆</div><h2 style="font-size:26px;margin:6px 0">Level ' + g.L + '</h2><p class="hint">You are now “' + TITLES[Math.min(g.L, TITLES.length) - 1] + "”. Small steps got you here.</p></div>", null, "Nice");
    else toast("Level up! You reached level " + g.L + " 🏆");
  }, 350);
}

let ringT = 0, ringRec = null;
function ring(rec) {
  ringRec = rec;
  const o = O();
  $("#ring").innerHTML = '<div class="bell">⏰</div><h2>' + esc(rec.title || rec.name) + "</h2><p>" + esc(rec.type === "habit" ? "Habit check-in" : fmtWhen(rec, o, Date.now())) + (rec.step ? "<br>First step: " + esc(rec.step) : "") + "</p>" +
    (rec.kind === "event" ? "" : '<button class="btn" data-a="ringDone">Done ✓</button>') + '' + (rec.type === "item" ? '<button class="btn alt" data-a="ringSnooze">Snooze 10 min</button>' : "") + '<button class="btn alt" data-a="ringStop">Dismiss</button>';
  $("#ring").hidden = false;
  clearInterval(ringT);
  const buzz = () => { beep([880, 880, 1175, 880], 0.16); if (navigator.vibrate) navigator.vibrate([400, 150, 400]); };
  buzz(); ringT = setInterval(buzz, 1500);
  setTimeout(() => { if (ringRec === rec) clearInterval(ringT); }, 5 * MIN);
}
function ringStop() { clearInterval(ringT); ringRec = null; $("#ring").hidden = true; if (navigator.vibrate) navigator.vibrate(0); }
// While the app is open, an "alarm" reminder rings here even with no internet.
function checkAlarms() {
  const now = Date.now(), s = set();
  let rung = {};
  try { rung = JSON.parse(sessionStorage.getItem("onward.rung")) || {}; } catch (e) {}
  for (const r of [...items(), ...habits()]) {
    if (r.type === "habit" && habitDone(r, today())) continue;
    for (const f of fires(r, s, now)) {
      const k = f.key + f.at;
      if (f.ch.includes("alarm") && f.at <= now && !rung[k]) { rung[k] = 1; try { sessionStorage.setItem("onward.rung", JSON.stringify(rung)); } catch (e) {} ring(r); return; }
    }
  }
}

// ================= event handlers =================
const A = {
  tab(el) { ui.tab = el.dataset.v; $("#main").scrollTop = 0; render(); $("#main").scrollTop = 0; },
  settings: () => openSettings(),
  closeSheet: () => closeSheet(),
  cancelSheet() { ed = hd = ld = null; closeSheet(true); },
  toggle(el) { toggleTask(el.dataset.id, el); done(); },
  edit(el) { editItem(el.dataset.id); },
  qaAdd() {
    const inp = $("#qa"), text = inp.value.trim();
    if (!text) { editItem(null, ui.tab === "cal" ? { at: keyTs(ui.sel, O()) } : {}); return; }
    const f = ui.filter, ctx = ui.tab === "cal" ? { dk: ui.sel } : ui.tab === "tasks" ? { list: f.startsWith("list:") ? f.slice(5) : "", tag: f.startsWith("tag:") ? f.slice(4) : "" } : {};
    const fields = quickFields(text, ctx);
    if (!fields.title) return;
    put(newItem(fields)); inp.value = ""; $("#qap").textContent = "";
    beep([660]); done(); $("#qa").focus();
  },
  pick: () => pickOne(),
  pickFocus(el) { closeSheet(true); fo = { ref: el.dataset.id, min: 5, end: Date.now() + 5 * MIN }; saveFo(); ui.tab = "focus"; render(); },
  pickDone(el) { closeSheet(true); toggleTask(el.dataset.id, null); done(); },
  questOpen(el) { const p = quest().picks[+el.dataset.i], r = p && db.recs[p.ref]; if (!r || r.del) return; if (p.t === "habit") { tickHabit(r.id, 1, el); done(); } else editItem(r.id); },
  lateToday() {
    const o = O(), now = Date.now(), t = today(), start = startToday();
    for (const i of items()) if (i.kind === "task" && !i.done && i.at != null && i.at < start) {
      const d = loc(i.at, o), at = i.allDay ? start : keyTs(t, o, d.getUTCHours(), d.getUTCMinutes());
      put(at > now || i.allDay ? { ...i, at } : { ...i, at: start, allDay: true });
    }
    toast("Fresh start. Everything is on today’s list."); done();
  },
  toggleDone() { ui.showDone = !ui.showDone; render(); },
  filter(el) { ui.filter = el.dataset.v; render(); },
  listNew: () => editList(),
  listEdit: (el) => editList(el.dataset.id),
  ldColor(el) { ld.name = $("#sheet [data-f=name]").value; ld.color = el.dataset.v; setBody(ld.body()); },
  ldDel() { const id = ld.id; ld = null; closeSheet(true); for (const i of items()) if (i.list === id) put({ ...i, list: "" }); del(id); ui.filter = "inbox"; done(); },
  calNav(el) {
    const v = +el.dataset.v, t = today();
    if (ui.tab === "cal" && ui.calMode === "week") { ui.sel = v ? addDays(ui.sel, 7 * v) : t; ui.month = ui.sel.slice(0, 7); }
    else if (!v) { ui.month = t.slice(0, 7); ui.sel = t; }
    else { const [y, m] = ui.month.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + v, 1)); ui.month = d.toISOString().slice(0, 7); }
    render();
  },
  calMode() { ui.calMode = ui.calMode === "month" ? "week" : "month"; render(); },
  calSel(el) { ui.sel = el.dataset.v; ui.month = ui.sel.slice(0, 7); render(); },
  calAdd(el) { editItem(null, { kind: "event", at: keyTs(el.dataset.v, O()) }); },
  habit(el) { tickHabit(el.dataset.id, 1, el); done(); },
  habitMinus(el) { tickHabit(el.dataset.id, -1); done(); },
  habitOpen(el) { ui.habit = el.dataset.id; if (ui.tab !== "habits") { ui.tab = "habits"; ui.month = today().slice(0, 7); } render(); },
  habitSel(el) { ui.habit = el.dataset.id; render(); },
  habitNew: () => editHabit(),
  habitEdit: (el) => editHabit(el.dataset.id),
  habitDay(el) {
    const h = db.recs[el.dataset.id], k = el.dataset.v, dn = { ...(h.done || {}) }, n = (dn[k] || 0) + 1;
    if (k === today()) { tickHabit(h.id, (dn[k] || 0) >= (h.freq || 1) ? -1 : 1, el); return done(); }
    if (n > (h.freq || 1)) delete dn[k]; else dn[k] = n;
    put({ ...h, done: dn }); done();
  },
  hdColor(el) { readHd(); hd.color = el.dataset.v; setBody(hdBody()); },
  hdCh(el) { readHd(); const c = el.dataset.v; hd.remCh = (hd.remCh || []).includes(c) ? hd.remCh.filter((x) => x !== c) : [...(hd.remCh || []), c]; setBody(hdBody()); },
  hdDel() { const id = hd.id; hd = null; closeSheet(true); del(id); done(); },
  hdMove(el) {
    readHd();
    const hs = habits(), i = hs.findIndex((h) => h.id === hd.id), j = i + +el.dataset.v;
    if (i < 0 || j < 0 || j >= hs.length) return;
    [hs[i], hs[j]] = [hs[j], hs[i]];
    hs.forEach((h, n) => { if (h.id === hd.id) hd.ord = n; else if (h.ord !== n) put({ ...h, ord: n }); });
    toast("Moved.");
  },
  tap(el) {
    const s = set(), v = +el.dataset.v, lab = $("#tapLabel") ? $("#tapLabel").value : s.tap.label;
    put({ ...s, tap: { label: lab, value: v === 0 ? 0 : Math.max(0, (s.tap.value || 0) + v) } });
    if (v === 1) { beep([700], 0.05); if (navigator.vibrate) navigator.vibrate(10); }
    render();
  },
  foStart(el) { fo = { ref: $("#foRef").value, min: +el.dataset.v, end: Date.now() + +el.dataset.v * MIN }; saveFo(); beep([523]); render(); },
  foPause() { if (fo.end) { fo.left = fo.end - Date.now(); fo.end = 0; } else { fo.end = Date.now() + fo.left; fo.left = 0; } saveFo(); render(); },
  foStop: () => foFinish(true),
  // editor
  edKind(el) { readForm(); ed.it.kind = el.dataset.v; setBody(edBody()); },
  edDk(el) { readForm(); ed.dk = el.dataset.v; if (!ed.dk) ed.tm = ""; setBody(edBody()); },
  edWd(el) { readForm(); const d = +el.dataset.v; ed.days = ed.days.includes(d) ? ed.days.filter((x) => x !== d) : [...ed.days, d]; setBody(edBody()); },
  edPri(el) { readForm(); ed.it.pri = +el.dataset.v; setBody(edBody()); },
  edEn(el) { readForm(); ed.it.energy = el.dataset.v; setBody(edBody()); },
  remAdd() { readForm(); const s = set(); ed.it.rem.push({ id: uid(), off: ed.it.rem.length ? 10 : s.defOff || 0, ch: [...(s.defCh || ["push"])] }); setBody(edBody()); },
  remDel(el) { readForm(); ed.it.rem.splice(+el.dataset.i, 1); setBody(edBody()); },
  remCh(el) { readForm(); const r = ed.it.rem[+el.dataset.i], c = el.dataset.v; r.ch = r.ch.includes(c) ? r.ch.filter((x) => x !== c) : [...r.ch, c]; setBody(edBody()); },
  subT(el) { readForm(); const s = ed.it.subs[+el.dataset.i]; s.d = s.d ? 0 : 1; if (s.d) beep([600], 0.06); setBody(edBody()); },
  subDel(el) { readForm(); ed.it.subs.splice(+el.dataset.i, 1); setBody(edBody()); },
  subAdd() { readForm(); setBody(edBody()); const n = $("#subNew"); if (n) n.focus(); },
  delItem() { const it = ed.it; ed = null; closeSheet(true); const prev = db.recs[it.id]; del(it.id); toast("Deleted.", () => put({ ...prev, del: 0 })); done(); },
  // alarm
  ringDone() { const r = ringRec; ringStop(); if (r.type === "habit") tickHabit(r.id, 1, null); else if (db.recs[r.id] && !db.recs[r.id].done) toggleTask(r.id, null); done(); },
  ringSnooze() {
    const r = ringRec, at = Date.now() + 10 * MIN; ringStop();
    if (r.type === "item") put({ ...db.recs[r.id], rem: [...(db.recs[r.id].rem || []).filter((x) => x.id !== "snz"), { id: "snz", at, ch: ["push", "alarm"] }] });
    toast("Snoozed for 10 minutes.");
  },
  ringStop: () => ringStop(),
  // settings
  async sKey() {
    key = $("#sKey").value.trim(); lsSet("onward.key", key);
    if (!key) { setDot(""); return sMsg("mKey", "Sync is off. Everything stays on this device.", ""); }
    sMsg("mKey", "Checking…");
    try {
      await api("/api/config");
      for (const id in db.recs) db.dirty[id] = 1; // first connect: offer everything on this device to the server
      db.rev = 0; if (!db.recs.settings) put(set());
      await sync(); sMsg("mKey", "Connected. This device is now in sync.", "ok");
      cfg = await api("/api/config"); setBody(settingsBody());
    } catch (e) { setDot("err"); sMsg("mKey", e.status === 401 ? "That key was not accepted." : e.message, "bad"); }
  },
  pushOn: () => pushOn(),
  async test(el) {
    if (!key) return sMsg("mTest", "Connect sync first.", "bad");
    sMsg("mTest", "Sending…");
    try { const r = await api("/api/test", { ch: el.dataset.v }); sMsg("mTest", r.error ? "Did not send: " + r.error : "Sent. It should arrive within a few seconds.", r.error ? "bad" : "ok"); }
    catch (e) { sMsg("mTest", e.message, "bad"); }
  },
  async tgSave() {
    try { cfg = await api("/api/config", { tgToken: $("#sTg").value }); sMsg("mTg", "Token saved. Now press Start in your bot, then tap Link.", "ok"); } catch (e) { sMsg("mTg", e.message, "bad"); }
  },
  async tgLink() {
    sMsg("mTg", "Looking for your message…");
    try { const r = await api("/api/tg/link", {}); cfg = await api("/api/config"); sMsg("mTg", "Linked to " + r.name + ". Send a Telegram test from the Notifications section.", "ok"); } catch (e) { sMsg("mTg", e.message, "bad"); }
  },
  async mailSave() {
    const b = { emailTo: $("#sTo").value, emailFrom: $("#sFrom").value };
    if ($("#sRk").value.trim()) b.resendKey = $("#sRk").value;
    try { cfg = await api("/api/config", b); sMsg("mMail", "Saved. Send an email test from the Notifications section.", "ok"); } catch (e) { sMsg("mMail", e.message, "bad"); }
  },
  sDefCh(el) { const s = set(), c = el.dataset.v; put({ ...s, defCh: s.defCh.includes(c) ? s.defCh.filter((x) => x !== c) : [...s.defCh, c] }); el.setAttribute("aria-pressed", set().defCh.includes(c)); },
  sDigCh(el) { const s = set(), c = el.dataset.v, cur = s.digestCh || []; put({ ...s, digestCh: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] }); el.setAttribute("aria-pressed", set().digestCh.includes(c)); },
  async tallyFetch() {
    if (!key) return sMsg("mTally", "Connect sync first, or use the paste option below.", "bad");
    sMsg("mTally", "Fetching…");
    try { const r = await api("/api/import-tally", { url: $("#sTu").value.trim(), key: $("#sTk").value.trim() }); const n = importTally(r.data); sMsg("mTally", "Imported " + n + " habits with their history.", "ok"); }
    catch (e) { sMsg("mTally", e.message, "bad"); }
  },
  tallyPaste() {
    try { const n = importTally(JSON.parse($("#sTj").value)); sMsg("mTally", "Imported " + n + " habits with their history.", "ok"); }
    catch (e) { sMsg("mTally", "Could not read that: " + e.message, "bad"); }
  },
  exportData() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "onward", at: Date.now(), recs: Object.values(db.recs) })], { type: "application/json" }));
    a.download = "onward-backup-" + today() + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};
const C = {
  redraw() { readForm(); setBody(edBody()); },
  remWhen(el) {
    readForm();
    const r = ed.it.rem[+el.dataset.i], v = el.value;
    delete r.at; delete r._c;
    if (v === "c") { r._c = 1; if (!r.off) r.off = 20; }
    else if (v === "x") r.at = ed.dk ? keyTs(ed.dk, O(), ...(ed.tm || set().alldayAt).split(":").map(Number)) : Date.now() + 60 * MIN;
    else r.off = +v;
    setBody(edBody());
  },
};

document.addEventListener("click", (e) => {
  if (e.target.id === "sheet") return closeSheet();
  const el = e.target.closest("[data-a]");
  if (el && A[el.dataset.a]) { if (el.tagName !== "LABEL") e.preventDefault(); A[el.dataset.a](el, e); }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.c && C[el.dataset.c]) return C[el.dataset.c](el);
  if (el.dataset.s) {
    const k = el.dataset.s, v = k === "defOff" ? +el.value : k === "sound" ? !!el.value : el.value;
    put({ ...set(), [k]: v }); if (k === "theme") applyTheme();
  }
  if (el.id === "tapLabel") { const s = set(); put({ ...s, tap: { ...s.tap, label: el.value } }); }
  if (el.id === "foRef" && fo) { fo.ref = el.value; saveFo(); } else if (el.id === "foRef") { fo = { ref: el.value }; saveFo(); }
  if (el.id === "sFile" && el.files[0]) el.files[0].text().then((t) => {
    const d = JSON.parse(t);
    if (!d || d.app !== "onward" || !Array.isArray(d.recs)) throw new Error("not a Onward backup");
    for (const r of d.recs) if (r && r.id && r.type && (!db.recs[r.id] || db.recs[r.id].u < r.u)) put({ ...r });
    sMsg("mBak", "Restored " + d.recs.length + " records.", "ok");
  }).catch((err) => sMsg("mBak", "Could not restore: " + err.message, "bad"));
});
document.addEventListener("input", (e) => {
  if (e.target.id === "qa") $("#qap").textContent = quickPreview(e.target.value);
  if (e.target.id === "q") { ui.q = e.target.value; render(); }
});
document.addEventListener("keydown", (e) => {
  const el = e.target;
  if (e.key === "Enter" && el.id === "qa") { e.preventDefault(); A.qaAdd(); }
  else if (e.key === "Enter" && el.id === "subNew") { e.preventDefault(); A.subAdd(); }
  else if (e.key === "Enter" && el.dataset && el.dataset.f === "title") { e.preventDefault(); closeSheet(); }
  else if ((e.key === "Enter" || e.key === " ") && el.getAttribute && el.getAttribute("role") === "button") { e.preventDefault(); el.click(); }
  else if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
  else if ((e.key === "n" || e.key === "/") && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && $("#sheet").hidden && $("#qa")) { e.preventDefault(); $("#qa").focus(); }
});

// ================= boot =================
function applyTheme() { const t = set().theme; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); }
function openFromLink(id, alarm) {
  const r = db.recs[id];
  if (!r || r.del) return;
  if (alarm) ring(r); else if (r.type === "item") editItem(id); else { ui.tab = "habits"; ui.habit = id; render(); }
}
applyTheme();
if (db.recs.settings && db.recs.settings.tzOff !== DEF.tzOff) put({ ...set(), tzOff: DEF.tzOff });
render();
window.addEventListener("pagehide", () => { if (saveT) flush(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (saveT) flush(); } else { sync(); render(); } });
window.addEventListener("online", sync);
setInterval(() => { if (!document.hidden) sync(); }, 60000);
setInterval(foTick, 500);
setInterval(checkAlarms, 10000);
let lastDay = today();
setInterval(() => { if (today() !== lastDay) { lastDay = today(); memo = null; render(); } }, 30000);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.sync) sync();
    if (d.open) sync().then(() => openFromLink(d.open, d.alarm));
  });
}
sync().then(() => {
  const p = new URLSearchParams(location.search);
  if (p.get("open")) { openFromLink(p.get("open"), p.get("alarm")); history.replaceState(null, "", "/"); }
});
