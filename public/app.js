// Onward front end. No build step: plain modules, one render() per change.
// Data lives in localStorage as small records and syncs to the Worker when a
// sync key is set, so the app keeps working offline.
import { MIN, DAY, WD, MO, uid, tz, loc, dayKey, keyTs, addDays, fmtTime, fmtDay, fmtWhen,
  occurrences, occFrom, repOver, repSkipped, step, repText, untilText, remText, fires, habitTimes, habitNeed, complete, taskLog, level } from "./shared.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

const DEF = { id: "settings", type: "settings", tzOff: -new Date().getTimezoneOffset(), alldayAt: "09:00",
  defOff: 0, defCh: ["push"], digestAt: "08:30", digestCh: ["push"], sound: true, theme: "auto", tap: { label: "", value: 0 },
  dayStart: "08:00", dayEnd: "00:00", chime: 10 };
const CHS = [["push", "🔔 Push"], ["alarm", "⏰ Alarm"], ["tg", "✈️ Telegram"], ["email", "✉️ Email"]];
const PRE = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
// The three tally-counter palettes, each with brown, teal, turquoise and olive added.
const PAL = [
  ["Pastels", ["#F6C7BD", "#F7DDA6", "#E5E5A8", "#C6E5B4", "#B4E1D8", "#BCD7F2", "#CEC8EF", "#F2C5DE", "#FFF3A3", "#FFFFFF", "#D8BBA4", "#8FC7C2", "#A5E8EC", "#C9CC9A"]],
  ["Medium", ["#ED9C8C", "#ECBC6A", "#C0CA76", "#8AC290", "#71C0B6", "#7EABDD", "#A598DA", "#DE8CB6", "#F7D54A", "#9AA5AF", "#B07F5C", "#3F9C96", "#45C7CF", "#8F9440"]],
  ["Deeper", ["#E4705C", "#E09A2E", "#9BAF45", "#4FA06B", "#2E9E93", "#3F7FC8", "#7C68C4", "#C9538F", "#F2BE00", "#15181C", "#7A4A2B", "#0F6E69", "#0E9AA7", "#5F6B1E"]],
];
const COLORS = PAL[1][1];
const GRIP = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>';
const ICON_RULES = [
  ["water|drink|hydrat", "💧"], ["read|book|novel", "📚 📖"], ["study|learn|course|homework|revis|exam|class", "📖 🧠"],
  ["gym|workout|exercise|lift|weight|train", "🏋️"], ["run|jog|cardio", "🏃"], ["walk|steps|stroll|hike", "🚶"],
  ["yoga|stretch|meditat|mindful|breath", "🧘"], ["cycl|bike", "🚴"], ["swim", "🏊"], ["sleep|bed|nap|wake", "😴 🛌"],
  ["vitamin|pill|medic|tablet|supplement", "💊"], ["teeth|brush|floss", "🦷"], ["shower|bath|skin|face|cream|hair|groom", "🚿 🧴"],
  ["cook|meal|dinner|lunch|breakfast|eat|kitchen", "🍳 🍽️"], ["fruit|apple", "🍎"], ["salad|veg", "🥗"], ["coffee", "☕"], ["tea\\b", "🍵"],
  ["journal|diary|write|writing|blog|note", "✍️ 📝"], ["code|coding|program|leetcode|debug", "💻"], ["email|mail|inbox", "📧"],
  ["call|phone|mom|dad|family|friend", "📞"], ["budget|money|expense|saving|invest|bill|financ", "💰"],
  ["clean|tidy|vacuum|sweep|dust|declutter", "🧹"], ["laundry|clothes|wash", "🧺"], ["dish", "🍽️"], ["plant|garden", "🌱"],
  ["hamster", "🐹"], ["dog|puppy", "🐶"], ["cat\\b|kitten", "🐱"], ["guitar", "🎸"], ["piano|music|sing|practi[cs]e|instrument", "🎹"],
  ["draw|paint|sketch|art\\b", "🎨"], ["game|gaming", "🎮"], ["photo|camera", "📷"], ["sun|outside|outdoor|fresh air", "☀️"],
  ["pray|gratitude|thank", "🙏"], ["plan|schedule|calendar|review|todo", "📅"], ["doctor|checkup|health|weigh|blood", "🩺"], ["shop|grocer", "🛒"],
].map((r) => ({ re: new RegExp("\\b(?:" + r[0] + ")", "i"), icons: r[1].split(" ") }));
const EMOJI_GROUPS = [
  ["Health", "💧 🏃 🚶 🏋️ 🧘 🚴 🏊 💊 🦷 😴 🛌 🚿 🧴 🩺 ❤️"], ["Mind", "📚 📖 ✍️ 📝 🧠 🎯 💡 🎧 🙏 🔬 📅"], ["Work", "💻 📧 📞 💼 📊 💰 🧾"],
  ["Home", "🧹 🧺 🍽️ 🛒 🌱 🐹 🐶 🐱 🔧"], ["Food", "🍳 🥣 🍎 🥗 ☕ 🍵 🥦 🍞"], ["Fun", "🎸 🎹 🎨 🎮 📷 🎬 ☀️ 🌙 ✈️ ⭐ 🔥 ✅"],
];
function suggestIcons(name) {
  const out = [];
  if (!String(name || "").trim()) return out;
  for (const r of ICON_RULES) if (r.re.test(name)) for (const e of r.icons) if (!out.includes(e)) out.push(e);
  return out.slice(0, 5);
}
function firstGrapheme(str) {
  str = String(str || "").trim();
  try { if (Intl.Segmenter) { for (const g of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str)) return g.segment; return ""; } } catch (e) {}
  return Array.from(str).slice(0, 2).join("");
}
function rgbOf(hex) {
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}
const lumOf = (hex) => { const c = rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
// Dark text on pale colours, white text on deep ones.
const inkOn = (hex) => (lumOf(hex) > 0.3 ? "#18212B" : "#FFFFFF");
// White and near-black habits would vanish against the card, so they are drawn with visible neighbours.
const calColor = (hex) => { if (!/^#[0-9a-f]{3,8}$/i.test(String(hex))) return "#71C0B6"; const L = lumOf(hex); return L > 0.85 ? "#C5CDD5" : L < 0.03 ? "#56626F" : hex; };
const blend = (top, under, a) => { const A = rgbOf(top), B = rgbOf(under); return "#" + [0, 1, 2].map((i) => pad(Math.round(B[i] + (A[i] - B[i]) * a).toString(16))).join(""); };
const cssHex = (name, dflt) => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : dflt; };
// A day's colour deepens with how much of it is done, from a faint wash to the full colour.
function shade(base, lv) {
  if (lv <= 0) return null;
  const bg = lv >= 1 ? base : blend(base, cssHex("--card", "#FFFFFF"), 0.14 + 0.72 * lv);
  return { bg, ink: inkOn(bg) };
}
// Tally marks: four uprights and a slash per five.
function marks(v) {
  let groups = Math.floor(v / 5), h = "";
  const rem = v % 5, extra = Math.max(0, groups - 11);
  groups -= extra;
  const g = (n) => { const w = n === 5 ? 22 : (n - 1) * 5 + 4; let d = ""; for (let i = 0; i < Math.min(n, 4); i++) d += "M" + (2 + i * 5) + " 2V20"; return '<svg viewBox="0 0 ' + w + ' 22" style="width:' + w + 'px" aria-hidden="true"><path d="' + d + '"/>' + (n === 5 ? '<path d="M0 19L20 3"/>' : "") + "</svg>"; };
  if (extra) h += '<span class="more">+' + extra * 5 + "</span>";
  for (let i = 0; i < groups; i++) h += g(5);
  if (rem) h += g(rem);
  return '<span class="marks">' + h + "</span>";
}
// Accent colours you unlock by levelling up: [id, name, level, light-mode colour, dark-mode colour, light tint, dark tint]
const ACCENTS = [["teal", "Teal", 1, "#12594F", "#6FCBB8", "#E3F1EE", "#1D302D"], ["ocean", "Ocean", 2, "#1F5FA8", "#8AB8EE", "#E3EDF8", "#1C2A3B"], ["plum", "Plum", 3, "#6B3FA0", "#C3A6EE", "#EFE7F8", "#2A2238"],
  ["rose", "Rose", 5, "#A8325E", "#F0A3BF", "#F9E6ED", "#38202A"], ["forest", "Forest", 7, "#2F6B2A", "#9AD493", "#E6F2E4", "#1F301E"], ["ember", "Ember", 9, "#A84A14", "#F2B083", "#F8EADF", "#38271B"], ["ink", "Ink", 12, "#26313D", "#D5DEE8", "#E6EAEF", "#252C34"]];
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
const all_ = all;
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

// AI suggestions run on the server (Cloudflare Workers AI) and only when a suggest button is tapped.
async function aiAsk(body) {
  if (!key) throw new Error("AI suggestions need sync turned on (Settings).");
  if (!navigator.onLine) throw new Error("You are offline, so AI suggestions are unavailable.");
  return api("/api/ai", body);
}

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
  xp = Math.max(0, xp - (set().xpOff || 0)); // "Reset level and XP" hides everything earned before the reset
  return (memo = { xp, ...level(xp), streak, best, freezes, frozen });
}
const tagKey = (t) => String(t || "").trim().toLowerCase();
// Habits grouped by tag, A to Z, untagged last. The first spelling seen names the group.
function tagGroups(list) {
  const map = {}, keys = [];
  for (const c of list) { const k = tagKey(c.tag); if (!map[k]) { map[k] = { key: k, label: String(c.tag || "").trim(), tasks: [] }; keys.push(k); } map[k].tasks.push(c); }
  keys.sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  return keys.map((k) => map[k]);
}
// A habit counts on a day from the day it was made, or on any earlier day that has a check-off.
const applies = (h, k) => k >= dayKey(h.created || 0, O()) || !!(h.done || {})[k];
// How done a day is across the given habits.
function dayInfo(list, k) {
  let applicable = 0, complete = 0, partial = 0;
  for (const c of list) {
    if (!applies(c, k)) continue;
    applicable++;
    const n = (c.done || {})[k] || 0, f = c.freq || 1;
    if (n >= f) complete++; else if (n > 0) partial += n / f;
  }
  return { applicable, complete, ratio: applicable ? complete / applicable : 0, frac: applicable ? (complete + partial) / applicable : 0, full: applicable > 0 && complete === applicable };
}
const dayLevel = (info) => (info.applicable > 1 ? info.ratio : info.frac);
// Current streak counts back from today, or from yesterday while today is still unfinished.
function calStats(list) {
  const t = today(), keys = new Set();
  let checks = 0, best = 0, run = 0, prev = null, cur = 0;
  for (const c of list) for (const k in c.done || {}) { keys.add(k); checks += c.done[k]; }
  const days = [...keys].filter((k) => dayInfo(list, k).full).sort(), S = new Set(days);
  for (const k of days) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  for (let k = S.has(t) ? t : addDays(t, -1); S.has(k); k = addDays(k, -1)) cur++;
  return { cur, best, days: days.length, total: checks };
}
const habitStats = (h) => calStats([h]);
const habitDone = (h, k) => ((h.done || {})[k] || 0) >= (h.freq || 1);
const startToday = () => keyTs(today(), O());

// ---------- "Meaning to" shelf: undated things kept off Today, offered back one a day ----------
const onShelf = (i) => !!i.shelf && !i.done && i.kind === "task";
function waited(it) {
  const d = Math.floor((Date.now() - (it.shelfAt || it.created || Date.now())) / DAY);
  return d < 1 ? "added today" : d < 14 ? "waited " + d + (d === 1 ? " day" : " days") : "waited " + Math.floor(d / 7) + " weeks";
}
// Today's single offer. Never-offered items come first, then the longest since last offered, quick ones before heavy ones.
function shelfOffer() {
  const t = today();
  if (lsGet("onward.shelfDay") === t) return null;
  const light = (i) => (i.energy === "low" || (i.est && i.est <= 15) ? 0 : 1);
  // Something shelved in the last day is left alone: you only just decided it could wait.
  const c = items().filter((i) => onShelf(i) && Date.now() - (i.shelfAt || i.created || 0) > 20 * 3600e3).sort((a, b) => (a.offAt || "").localeCompare(b.offAt || "") || light(a) - light(b) || (a.shelfAt || 0) - (b.shelfAt || 0));
  if (!c.length) return null;
  const it = c[0], age = Date.now() - (it.shelfAt || it.created || Date.now());
  return { it, ask: age > 30 * DAY && Date.now() - (it.askAt || 0) > 30 * DAY };
}
const shelfAnswered = () => lsSet("onward.shelfDay", today());

// Three small things for today, chosen so there is nothing to decide.
function quest() {
  const id = "q-" + today(), start = startToday(), t = today();
  const cur = db.recs[id] && !db.recs[id].del ? db.recs[id] : { id, type: "quest", picks: [], rot: 0 };
  const isDone = (p) => { const r = db.recs[p.ref]; return !!r && (p.t === "habit" ? !r.del && habitDone(r, t) : taskDoneToday(r)); };
  // Finished quests are locked in (even if the task is deleted afterwards). Every other slot is
  // chosen again from what matters most right now, so a task added later can still become a quest.
  const used = new Set(cur.picks.filter(isDone).map((p) => p.ref)), fresh = [];
  const open = items().filter((i) => i.kind === "task" && !i.done && !i.shelf);
  const turn = (arr) => { const n = arr.length ? (cur.rot || 0) % arr.length : 0; return arr.slice(n).concat(arr.slice(0, n)); }; // "Shuffle" moves along each list
  const due = turn(open.filter((i) => i.at != null && i.at < start + DAY).sort((a, b) => (b.pri || 0) - (a.pri || 0) || a.at - b.at));
  const easy = turn(open.filter((i) => (i.energy === "low" || (i.est && i.est <= 15)) && (i.at == null || i.at < start + DAY)).sort((a, b) => (a.est || 99) - (b.est || 99)));
  const old = turn(open.filter((i) => i.at == null).sort((a, b) => (b.pri || 0) - (a.pri || 0) || (a.created || 0) - (b.created || 0)));
  const hs = turn(habits().filter((h) => !habitDone(h, t)));
  const room = () => used.size < 3;
  const take = (arr, ty) => { const x = arr.find((i) => !used.has(i.id)); if (x && room()) { used.add(x.id); fresh.push({ ref: x.id, t: ty }); } };
  if (!cur.picks.some((p) => p.t === "habit" && isDone(p))) take(hs, "habit");
  take(due, "item"); take(easy, "item");
  for (const [arr, ty] of [[due, "item"], [old, "item"], [hs, "habit"]]) for (let g = 0; g < 3 && room(); g++) take(arr, ty); // fill whatever is still empty
  // Keep every quest in the slot it already had where possible, so the list does not jump around.
  const picks = [], stay = new Set(fresh.map((p) => p.ref));
  for (let k = 0; k < 3; k++) { const p = cur.picks[k]; if (p && (isDone(p) || stay.has(p.ref))) { picks[k] = p; stay.delete(p.ref); } }
  const rest = fresh.filter((p) => stay.has(p.ref));
  for (let k = 0; k < 3 && rest.length; k++) if (!picks[k]) picks[k] = rest.shift();
  const out = picks.filter(Boolean);
  if (JSON.stringify(out) === JSON.stringify(cur.picks)) return cur;
  return put({ ...cur, picks: out });
}
const taskDoneToday = (r) => { const o = O(), t = today(); return !!r.done || logs().some((l) => l.ref === r.id && l.k === "task" && dayKey(l.at, o) === t); };
function questState(p) {
  const r = db.recs[p.ref];
  if (!r) return { title: "", ok: true, gone: true };
  const title = (r.icon ? r.icon + " " : "") + (r.title || r.name || "");
  if (r.del) return { title, ok: true, gone: true }; // finished today, then deleted: it still counts
  return { title, ok: p.t === "habit" ? habitDone(r, today()) : taskDoneToday(r) };
}
function checkQuests() {
  const t = today(), q = db.recs["q-" + t], pre = "qb-" + t + "-", live = (id) => db.recs[id] && !db.recs[id].del;
  if (!q || q.del) return;
  const ok = new Set();
  for (const p of q.picks) {
    const s = questState(p), id = pre + p.ref;
    if (!s.ok) continue;
    ok.add(p.ref);
    if (!live(id)) { put({ id, type: "log", k: "quest", title: "Quest: " + s.title, at: Date.now(), xp: 15 }); floatXp(15); }
  }
  // A quest that was unticked gives its bonus back, and leaves the Done list.
  for (const id in db.recs) if (id.startsWith(pre) && live(id) && !ok.has(id.slice(pre.length))) del(id);
  const allId = "qa-" + t, all3 = q.picks.length === 3 && ok.size === 3;
  if (all3 && !live(allId)) { put({ id: allId, type: "log", k: "quest", title: "All three quests", at: Date.now(), xp: 30 }); toast("All three quests done. +30 XP 🎉"); confetti(null, 40); }
  else if (!all3 && live(allId)) del(allId);
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
  let extra = "", hid = "";
  if (it.est && (it.spent || 0) >= 60) { // guess vs. tracked time, kept so future guesses get better
    const actual = Math.max(1, Math.round(it.spent / 60));
    hid = put({ id: "h" + uid(), type: "hist", title: it.title, est: it.est, actual, at: t }).id;
    extra = " You guessed " + dur(it.est) + " and tracked " + dur(actual) + ".";
  }
  if (nw.id === id) { nw = { id: "", why: "" }; saveNw(); }
  toast((l.shelf ? "Finally done. +" : l.late ? "Done. Late still counts. +" : "Done. +") + l.xp + " XP" + (l.shelf ? " (" + l.shelf + " for the wait)." : ".") + extra, () => { put(prev); del(l.id); if (hid) del(hid); });
}
// Undo today's completion. A repeating task goes back to the date it had before it was ticked.
function untickTask(id) {
  const it = db.recs[id], o = O(), t = today();
  if (!it) return;
  if (it.done) return toggleTask(id);
  const l = logs().filter((x) => x.ref === id && x.k === "task" && dayKey(x.at, o) === t).sort((a, b) => b.at - a.at)[0];
  if (!l) return;
  put({ ...it, at: l.prev != null ? l.prev : it.at, cnt: Math.max(0, (it.cnt || 1) - 1) });
  del(l.id);
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
  s = s.replace(/\s(someday|some day|meaning to)(?=\s)/i, () => { r.shelf = 1; return " "; });
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
  const MONS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const monthNo = (w) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(w.slice(0, 3).toLowerCase()) + 1;
  const ymd = (y, m, d) => y + "-" + pad(m) + "-" + pad(d);
  // A day and month with no year means the next time that date comes round.
  const dated = (m0, d, mo, y) => { d = +d; if (d < 1 || d > 31 || mo < 1 || mo > 12) return m0; let k = ymd(y || +t.slice(0, 4), mo, d); if (!y && k < t) k = ymd(+t.slice(0, 4) + 1, mo, d); r.dk = k; return " "; };
  s = s.replace(/\sday after tomorrow(?=\s)/i, () => { r.dk = addDays(t, 2); return " "; });
  s = s.replace(new RegExp("\\s(?:on\\s+|by\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MONS + ")(?:\\s+(\\d{4}))?(?=\\s)", "i"), (m0, d, mo, y) => dated(m0, d, monthNo(mo), +y || 0));
  s = s.replace(new RegExp("\\s(?:on\\s+|by\\s+)?(" + MONS + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)", "i"), (m0, mo, d, y) => dated(m0, d, monthNo(mo), +y || 0));
  s = s.replace(/\s(?:on|by|due)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/i, (m0, d, mo, y) => dated(m0, d, +mo, y ? (+y < 100 ? 2000 + +y : +y) : 0));
  s = s.replace(/\s(?:on|by)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?=\s)/i, (m0, d) => { // "on the 25th"; a bare "1st draft" is left alone
    d = +d; if (d < 1 || d > 31) return m0;
    let [Y, M] = t.split("-").map(Number), k = ymd(Y, M, d);
    if (k < t) { M++; if (M > 12) { M = 1; Y++; } k = ymd(Y, M, d); }
    r.dk = k; return " ";
  });
  s = s.replace(/\snext month(?=\s)/i, () => { const [Y, M, D] = t.split("-").map(Number), last = new Date(Date.UTC(Y, M + 1, 0)).getUTCDate(); r.dk = new Date(Date.UTC(Y, M, Math.min(D, last))).toISOString().slice(0, 10); return " "; });
  s = s.replace(/\s(?:this\s+)?weekend(?=\s)/i, () => { const wd = new Date(t + "T00:00:00Z").getUTCDay(); r.dk = addDays(t, wd === 0 || wd === 6 ? 0 : 6 - wd); return " "; });
  s = s.replace(/\s(today|tonight|tomorrow|tmrw|tmr|next week)(?=\s)/i, (m, g) => {
    g = g.toLowerCase();
    if (g === "today") r.dk = t; else if (g === "tonight") { r.dk = t; r.tm = r.tm || "20:00"; } else r.dk = addDays(t, g === "next week" ? 7 : 1);
    return " ";
  });
  s = s.replace(/\s(?:on\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|wed|thu|fri)(?=\s)/i, (m, g) => { r.dk = nextWd(W3.indexOf(g.slice(0, 3).toLowerCase())); return " "; });
  s = s.replace(/\s(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s)/i, (m, h, mi, ap) => { r.tm = pad((+h % 12) + (ap.toLowerCase() === "pm" ? 12 : 0)) + ":" + (mi || "00"); return " "; });
  const pmGuess = (h) => (h >= 1 && h <= 6 ? h + 12 : h); // "at 5" almost always means 5 in the evening
  if (!r.tm) s = s.replace(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m, h, mi) => { r.tm = pad(h.length === 1 ? pmGuess(+h) : +h) + ":" + mi; return " "; });
  // "at 5" counts only at the very end, so "look at 5 papers" is not read as a time.
  if (!r.tm) s = s.replace(/\sat\s+(\d{1,2})\s+$/i, (m0, h) => { h = +h; if (h > 23) return m0; r.tm = pad(pmGuess(h)) + ":00"; return " "; });
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
  if ((p.shelf || ctx.shelf) && f.at == null) { f.shelf = 1; f.shelfAt = Date.now(); }
  if (ctx.list) f.list = ctx.list;
  if (ctx.tag && !f.tags.includes(ctx.tag)) f.tags.push(ctx.tag);
  return f;
}
function quickPreview(text) {
  const p = parseQuick(text), o = O(), out = [];
  if (p.dk) out.push("📅 " + fmtDay(keyTs(p.dk, o), o, Date.now()) + (p.tm ? ", " + fmtTime(keyTs(p.dk, o, ...p.tm.split(":").map(Number)), o) : ""));
  if (p.shelf && !p.dk) out.push("🗂 Meaning to");
  if (p.rep) out.push("↻ " + repText(p.rep));
  if (p.pri) out.push(["", "Low", "Medium", "High"][p.pri] + " priority");
  for (const t of p.tags) out.push("#" + t);
  return out.join("  ·  ");
}

// ================= views =================
const ui = { tab: "today", filter: "inbox", q: "", month: today().slice(0, 7), sel: today(), calMode: "month", showDone: false,
  hcal: "all", hmonth: today().slice(0, 7), hSort: lsGet("onward.hsort") === "tag" ? "tag" : "manual", hFilter: "", selecting: false, selected: {}, collapsed: {}, foRef: "" };
const TABS = [["today", "Today"], ["tasks", "Tasks"], ["cal", "Calendar"], ["habits", "Habits"], ["focus", "Now"]];

const listOf = (it) => (it.list && db.recs[it.list] && !db.recs[it.list].del ? db.recs[it.list] : null);
function row(it, opt = {}) {
  const o = O(), now = Date.now(), at = opt.occ != null ? opt.occ : it.at, meta = [], L = listOf(it);
  const late = it.kind === "task" && !it.done && at != null && at < (it.allDay ? startToday() : now);
  if (at != null) meta.push('<span class="' + (late ? "late" : "") + '">' + esc(opt.timeOnly ? (it.allDay ? "All day" : fmtTime(at, o)) : fmtWhen({ at, allDay: it.allDay }, o, now)) + "</span>");
  if (onShelf(it)) meta.push("Meaning to · " + waited(it));
  if (it.kind === "event" && !it.allDay && it.dur) meta.push(it.dur < 60 ? it.dur + " min" : it.dur / 60 + " h");
  if (it.rep) meta.push("↻ " + esc(repText(it.rep) + untilText(it.rep)));
  if (L && !opt.noList) meta.push(esc(L.name));
  if (it.subs && it.subs.length) meta.push(it.subs.filter((s) => s.d).length + "/" + it.subs.length);
  if (it.est) meta.push("~" + it.est + " min");
  for (const t of it.tags || []) meta.push('<span class="tag">#' + esc(t) + "</span>");
  const lead = it.kind === "event"
    ? '<span class="evbar" style="background:' + esc(L ? L.color : "") + '"></span>'
    : '<button class="chk p' + (it.pri || 0) + '" data-a="toggle" data-id="' + it.id + '" aria-pressed="' + !!it.done + '" aria-label="' + (it.done ? "Mark not done: " : "Mark done: ") + esc(it.title) + '"></button>';
  return '<div class="row' + (it.kind === "task" && !opt.ghost ? " task" : "") + (it.done ? " done" : "") + (opt.ghost ? " ghost" : "") + '" data-a="edit" data-id="' + it.id + '" role="button" tabindex="0">' + lead +
    '<div class="rt"><div class="ti">' + esc((it.icon ? it.icon + " " : "") + it.title) + "</div>" + (it.step && !it.done ? '<div class="st">→ ' + esc(it.step) + "</div>" : "") +
    (meta.length ? '<div class="me">' + meta.join(" · ") + "</div>" : "") + "</div></div>";
}
const quickAdd = (ph) => '<div class="card qa"><input id="qa" type="text" list="names" enterkeyhint="done" autocomplete="off" placeholder="' + esc(ph) +
  '" aria-label="Quick add"><button data-a="qaAdd" aria-label="Add">+</button></div><div class="qap" id="qap"></div>';
const habitRow = (h, m = {}) => {
  const k = today(), n = (h.done || {})[k] || 0, freq = h.freq || 1, full = n >= freq, st = habitStats(h), col = calColor(h.color), times = habitTimes(h);
  const lead = m.selecting ? '<button class="chk sq" data-a="hSelect" data-id="' + h.id + '" aria-pressed="' + !!ui.selected[h.id] + '" aria-label="Select ' + esc(h.name) + '"></button>'
    : m.grip ? '<span class="grip" aria-label="Drag to reorder ' + esc(h.name) + '" role="button" tabindex="0" data-id="' + h.id + '">' + GRIP + "</span>" : "";
  return '<div class="hrow" data-id="' + h.id + '">' + lead + '<button class="hbtn' + (full ? " full" : "") + '" style="--hc:' + esc(col) + (full ? ";color:" + inkOn(col) : "") + '" data-a="habit" data-id="' + h.id +
    '" aria-label="Check off ' + esc(h.name) + '">' + (h.icon ? esc(h.icon) : full ? "✓" : "") + (freq > 1 ? '<span class="cnt">' + n + "/" + freq + "</span>" : "") + "</button>" +
    '<div class="rt" data-a="habitOpen" data-id="' + h.id + '" role="button" tabindex="0"><div class="ti">' + esc(h.name) + '</div><div class="me">' +
    (st.cur ? "🔥 " + st.cur + " day" + (st.cur > 1 ? "s" : "") : "Start today") + (times.length ? " · " + esc(times.join(", ")) : "") +
    (h.tag && !m.noTag ? ' · <span class="tag">#' + esc(h.tag) + "</span>" : "") + "</div></div>" +
    (n > 0 && freq > 1 ? '<button class="minus" data-a="habitMinus" data-id="' + h.id + '" aria-label="Undo one">−</button>' : "") + "</div>";
};
// Manual order, or grouped under tag headings that fold away.
function habitList(hs, m = {}) {
  if (ui.hSort !== "tag") return hs.map((h) => habitRow(h, m)).join("");
  const t = today();
  return tagGroups(hs).map((g) => '<div class="ghead" data-a="hGroup" data-v="' + esc(g.key) + '" role="button" tabindex="0" aria-expanded="' + !ui.collapsed[g.key] + '"><b>' + (g.key ? "#" + esc(g.label) : "No tag") +
    "</b><span>" + g.tasks.filter((h) => habitDone(h, t)).length + "/" + g.tasks.length + " " + (ui.collapsed[g.key] ? "▸" : "▾") + "</span></div>" +
    (ui.collapsed[g.key] ? "" : g.tasks.map((h) => habitRow(h, { ...m, noTag: true })).join(""))).join("");
}
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
  const dl = dayLeft();
  let h = '<div class="dayleft"><span id="dayLab">' + esc(dl.label) + '</span><div class="bar"><i id="dayFill" style="width:' + dl.pct + '%"></i></div></div>' + quickAdd("Add anything… try “call mom tomorrow 5pm”");
  if (q.picks.length) {
    const st = q.picks.map(questState), n = st.filter((s) => s.ok).length;
    h += '<div class="card quests"><h3>🎯 Today’s quests <span>' + n + "/" + q.picks.length + ' · +15 XP each</span><button class="qshuf" data-a="questShuffle" aria-label="Swap the unfinished quests for different ones">↻</button></h3>' +
      q.picks.map((p, i) => '<div class="quest' + (st[i].ok ? " ok" : "") + '"><button class="qd" data-a="questTick" data-i="' + i + '" aria-pressed="' + st[i].ok + '"' + (st[i].gone ? " disabled" : "") + ' aria-label="' + (st[i].gone ? "Done and since deleted: " : st[i].ok ? "Mark not done: " : "Mark done: ") + esc(st[i].title) + '">' + (st[i].ok ? "✓" : "") +
      '</button><span class="qt" data-a="questOpen" data-i="' + i + '" role="button" tabindex="0">' + esc(st[i].title) + "</span></div>").join("") + "</div>";
  }
  h += '<button class="btn soft pick" data-a="pick">🎲 Can’t decide? Pick one for me</button>';
  const so = shelfOffer();
  if (so) h += '<div class="card shelfc"><p class="eyebrow">Meaning to · ' + waited(so.it) + '</p><h3>' + esc(so.it.title) + "</h3>" + (so.ask
    ? '<p class="hint">Still want this? Dropping it is a decision, not a failure.</p><div class="acts"><button class="btn sm" data-a="shKeep" data-id="' + so.it.id + '">Keep</button><button class="btn ghost sm" data-a="shSmall" data-id="' + so.it.id + '">Make it smaller</button><button class="btn ghost sm" data-a="shDrop" data-id="' + so.it.id + '">Drop</button></div>'
    : '<p class="hint">Want to do this one today? No is a fine answer.</p><div class="acts"><button class="btn sm" data-a="shToday" data-id="' + so.it.id + '">Today</button><button class="btn ghost sm" data-a="shNo" data-id="' + so.it.id + '">Not today</button><button class="btn ghost sm" data-a="shDrop" data-id="' + so.it.id + '">Let it go</button></div>') + "</div>";
  if (late.length) h += '<div class="sec">Carried over <span class="n">' + late.length + '</span><button data-a="lateToday">Move all to today</button></div><div class="card list">' + late.map((i) => row(i)).join("") + "</div>";
  h += '<div class="sec">Today <span class="n">' + (cur.length || "") + "</span></div>";
  h += cur.length ? '<div class="card list">' + cur.map((x) => row(x.it, { occ: x.occ, timeOnly: true })).join("") + "</div>"
    : '<div class="card empty">' + (late.length || done.length ? "Nothing else scheduled today." : "A clear day. Add one small thing above, or let me pick.") + "</div>";
  if (hs.length) h += '<div class="sec">Habits <span class="n">' + hd + "/" + hs.length + '</span></div><div class="card list">' + habitList(hs) + "</div>";
  if (done.length) {
    const xp = done.reduce((n, l) => n + (l.xp || 0), 0);
    h += '<div class="sec">Done today <span class="n">' + done.length + " · +" + xp + ' XP</span><button data-a="toggleDone">' + (ui.showDone ? "Hide" : "Show") + "</button></div>";
    if (ui.showDone) h += '<div class="card list">' + done.map((l) => '<div class="row done"><span class="chk" aria-pressed="true"></span><div class="rt"><div class="ti">' + esc(l.title) + '</div><div class="me">' + fmtTime(l.at, o) + " · +" + (l.xp || 0) + " XP</div></div></div>").join("") + "</div>";
  }
  const sunday = loc(Date.now(), o).getUTCDay() === 0, reviewed = !!db.recs["wr-" + weekStart(0)];
  h += '<button class="btn ' + (sunday && !reviewed ? "soft" : "ghost") + ' pick" data-a="review">📋 ' + (sunday && !reviewed ? "It’s Sunday. Do your weekly review" : "Weekly review") + "</button>";
  return h;
}

function vTasks() {
  const o = O(), start = startToday(), f = ui.filter, its = items(), q = ui.q.trim().toLowerCase();
  const tags = [...new Set(its.filter((i) => !i.done).flatMap((i) => i.tags || []))].sort();
  const chip = (v, l) => '<button class="chip" data-a="filter" data-v="' + esc(v) + '" aria-pressed="' + (f === v) + '">' + esc(l) + "</button>";
  let h = '<div class="chips scroll">' + chip("inbox", "Inbox") + chip("all", "All") + chip("week", "Next 7 days") + chip("shelf", "Meaning to") + chip("quick", "Quick wins") +
    lists().map((l) => chip("list:" + l.id, l.name)).join("") + tags.map((t) => chip("tag:" + t, "#" + t)).join("") + chip("done", "Completed") +
    '<button class="chip" data-a="listNew">+ List</button><button class="chip" data-a="dump">🧠 Brain dump</button></div>';
  const lid = f.startsWith("list:") ? f.slice(5) : "", tag = f.startsWith("tag:") ? f.slice(4) : "";
  if (f !== "done") h += quickAdd(f === "shelf" ? "Something you keep meaning to do…" : lid && db.recs[lid] ? "Add to " + db.recs[lid].name + "…" : "Add a task…");
  if (f === "shelf") h += '<p class="hint" style="margin:2px 4px 0">No dates and no reminders here. Today offers you one of these a day, and saying no is fine.</p>';
  h += '<input class="in" id="q" type="search" placeholder="Search" aria-label="Search tasks" value="' + esc(ui.q) + '" style="margin-top:6px">';
  if (lid && db.recs[lid]) h += '<div class="sec">' + esc(db.recs[lid].name) + '<button data-a="listEdit" data-id="' + lid + '">Edit list</button></div>';
  const nowTs = Date.now(), gone = (i) => i.kind === "event" && !i.rep && i.at != null && (i.allDay ? i.at + DAY : i.at + (i.dur || 60) * MIN) < nowTs;
  const eff = (i) => (i.kind === "event" && i.rep ? occFrom(i, o, start) : i.at);
  const gone0 = gone;
  const over = (i) => gone0(i) || (i.kind === "event" && !!i.rep && i.at != null && eff(i) == null);
  let arr = its.filter((i) => (f === "done" ? i.done || over(i) : !i.done && !over(i))).filter((i) =>
    f === "shelf" ? onShelf(i) : f === "inbox" ? !listOf(i) && !i.shelf : f === "week" ? eff(i) != null && eff(i) < start + 7 * DAY : f === "quick" ? i.kind === "task" && (i.energy === "low" || (i.est && i.est <= 15)) :
    lid ? i.list === lid : tag ? (i.tags || []).includes(tag) : true);
  if (q) arr = arr.filter((i) => (i.title + " " + (i.notes || "") + " " + (i.tags || []).join(" ")).toLowerCase().includes(q));
  if (!arr.length) return h + '<div class="card empty" style="margin-top:14px">' + (q ? "Nothing matches that search." : f === "done" ? "Finished tasks will collect here." : f === "quick" ? "Tasks marked low energy or 15 minutes or less show up here." : f === "shelf" ? "Things you keep meaning to do, with no date in mind, live here. Add one above, or type “someday” in any quick add." : "Nothing here. Enjoy the quiet.") + "</div>";
  if (f === "done") return h + '<div class="card list" style="margin-top:14px">' + arr.sort((a, b) => (b.done || b.at) - (a.done || a.at)).slice(0, 200).map((i) => row(i)).join("") + "</div>";
  const names = ["Carried over", "Today", "Tomorrow", "Next 7 days", "Later", "No date", "Meaning to"], groups = names.map(() => []);
  for (const i of arr) { const at = eff(i); groups[at == null ? (i.shelf ? 6 : 5) : at < start ? 0 : at < start + DAY ? 1 : at < start + 2 * DAY ? 2 : at < start + 7 * DAY ? 3 : 4].push(i); }
  groups.forEach((g, n) => { if (g.length) h += '<div class="sec">' + names[n] + ' <span class="n">' + g.length + '</span></div><div class="card list">' + g.sort((a, b) => (eff(a) == null) - (eff(b) == null) || eff(a) - eff(b) || (b.pri || 0) - (a.pri || 0)).map((i) => row(i, { noList: !!lid, occ: eff(i) })).join("") + "</div>"; });
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
    if (i >= 28 && i % 7 === 0 && k.slice(0, 7) !== ui.month) break;
    if (k.slice(0, 7) !== ui.month) cls.push("out");
    if (k === t) cls.push("today");
    if (hs.length && k <= t && dayInfo(hs, k).full) cls.push("hab");
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

// Which habits the habit calendar is showing: all, one tag, or a single habit.
function calPick() {
  const all = habits();
  if (ui.hcal.startsWith("tag:")) { const v = all.filter((h) => tagKey(h.tag) === ui.hcal.slice(4)); if (v.length) return { list: v, single: null }; }
  else if (ui.hcal !== "all") { const h = all.find((x) => x.id === ui.hcal); if (h) return { list: [h], single: h }; }
  ui.hcal = "all";
  return { list: all, single: null };
}
function hCal() {
  const { list, single } = calPick(), st = calStats(list), t = today(), [y, m] = ui.hmonth.split("-").map(Number);
  const lead = new Date(ui.hmonth + "-01T00:00:00Z").getUTCDay(), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const base = single ? calColor(single.color) : cssHex("--accent", "#12594F");
  const chip = (id, label) => '<button class="chip" data-a="hcal" data-v="' + esc(id) + '" aria-pressed="' + (ui.hcal === id) + '">' + esc(label) + "</button>";
  let h = '<div class="sec">Days</div><div class="chips scroll" id="hcalChips">' + chip("all", "All habits") +
    tagGroups(habits()).map((g) => (g.key ? chip("tag:" + g.key, "#" + g.label) : "") + g.tasks.map((c) => chip(c.id, (c.icon ? c.icon + " " : "") + (c.name || "Untitled"))).join("")).join("") + "</div>";
  h += '<div class="stats s3">' + [["Current streak", st.cur], ["Max streak", st.best], ["Days completed", st.days]].map((x) => '<div class="card stat"><b>' + x[1] + "</b><span>" + x[0] + "</span></div>").join("") + "</div>";
  h += '<div class="tallyrow">' + marks(st.total) + "<span>" + st.total + (st.total === 1 ? " check-off" : " check-offs") + "</span></div>";
  h += '<div class="calhead"><button class="btn ghost sm" data-a="hMonth" data-v="-1" aria-label="Previous month">‹</button><button class="mtitle" data-a="hMonth" data-v="0" aria-label="Jump to this month">' + MO[m - 1] + " " + y +
    '</button><button class="btn ghost sm" data-a="hMonth" data-v="1" aria-label="Next month">›</button></div>';
  h += '<div class="grid">' + WD.map((d) => '<div class="dow">' + d[0] + "</div>").join("") + "<span></span>".repeat(lead);
  for (let d = 1; d <= dim; d++) {
    const k = ui.hmonth + "-" + pad(d), lv = dayLevel(dayInfo(list, k)), sh = shade(base, lv);
    h += '<button class="hday' + (k === t ? " today" : "") + '" ' + (k > t ? "disabled" : 'data-a="habitDay" data-v="' + k + '"') + (sh ? ' style="background:' + sh.bg + ";color:" + sh.ink + '"' : "") +
      ' aria-label="' + k + (lv > 0 ? ", " + Math.round(lv * 100) + " percent done" : "") + '">' + d + "</button>";
  }
  h += "</div>";
  if (!single || (single.freq || 1) > 1) h += '<div class="legend"><span>0%</span><i style="background:linear-gradient(90deg,' + shade(base, 0.01).bg + "," + base + ')"></i><span>100%</span></div>';
  h += '<p class="hint" style="margin-top:8px">' + (single ? ((single.freq || 1) > 1 ? "Tap a day to add a check-off. After the last one it clears. Paler days are partly done." : "Tap a day to mark it done, tap again to clear it.")
    : "A day gets deeper the more of its habits are done. Tap a day to see which ones.") + "</p>";
  return h;
}
function vHabits() {
  const all = habits(), t = today(), o = O(), s = set(), v = s.tap.value || 0, d = loc(Date.now(), o);
  let h = "";
  if (!all.length) h += '<div class="card empty" style="margin-top:8px">Habits are things you repeat daily: water, meds, a walk.<br>Each check-off adds to your streak and XP.</div>';
  else {
    let hs = all;
    if (ui.hFilter) { const f = all.filter((x) => tagKey(x.tag) === ui.hFilter); if (f.length) hs = f; else ui.hFilter = ""; }
    const dn = hs.filter((x) => habitDone(x, t)).length, tags = tagGroups(all).filter((g) => g.key), nSel = Object.keys(ui.selected).length;
    h += '<div class="card hsum"><div><b>' + WD[d.getUTCDay()] + " " + d.getUTCDate() + " " + MO[d.getUTCMonth()] + "</b><span>" + dn + " of " + hs.length + ' done</span></div><div class="bar"><i style="width:' + Math.round((100 * dn) / hs.length) + '%"></i></div></div>';
    h += '<div class="tools">' + (ui.selecting
      ? '<button class="btn ghost sm" data-a="hSelMode">Cancel</button><button class="btn ghost sm" data-a="hSelAll">Select all</button><span class="grow"></span><button class="btn danger sm" data-a="hSelDel"' + (nSel ? "" : " disabled") + ">Delete" + (nSel ? " " + nSel : "") + "</button>"
      : (all.length > 1 ? '<button class="btn ghost sm" data-a="hSort" aria-label="Change sort order">Sort: ' + (ui.hSort === "tag" ? "By tag" : "Manual") + '</button><span class="grow"></span><button class="btn ghost sm" data-a="hSelMode">Select</button>' : "")) + "</div>";
    if (tags.length) h += '<div class="chips scroll">' + [["", "All"]].concat(tags.map((g) => [g.key, "#" + g.label])).map(([k, l]) => '<button class="chip" data-a="hFilter" data-v="' + esc(k) + '" aria-pressed="' + (ui.hFilter === k) + '">' + esc(l) + "</button>").join("") + "</div>";
    h += '<div class="card list" id="hlist">' + habitList(hs, { selecting: ui.selecting, grip: ui.hSort === "manual" && !ui.hFilter && !ui.selecting && hs.length > 1 }) + "</div>";
  }
  h += '<button class="btn soft pick" data-a="habitNew">+ New habit</button>';
  if (all.length) h += hCal();
  const ne = all_("entry").length;
  h += '<div class="sec">Tap counter<button data-a="entries">Saved entries' + (ne ? " (" + ne + ")" : "") + '</button></div><div class="card tap"><input class="in" id="tapLabel" placeholder="What are you counting?" value="' + esc(s.tap.label || "") + '" aria-label="Counter label">' +
    '<button class="tapzone" data-a="tap" data-v="1" aria-label="Add one"><div class="num" id="tapNum">' + v + "</div>" + marks(v) + '<div class="hint">Tap anywhere here to add one</div></button>' +
    '<div class="r2"><button class="btn ghost" data-a="tap" data-v="-1" aria-label="Subtract one">−1</button><button class="btn" data-a="tapSave">Save</button>' + (v ? '<button class="btn ghost" data-a="tap" data-v="0">Reset</button>' : "") + "</div></div>";
  return h;
}
// Day detail for the habit calendar: which habits were done that day, and a way to fix it.
let dayK = "";
function dayBody() {
  const { list } = calPick(), k = dayK, info = dayInfo(list, k), here = list.filter((c) => applies(c, k));
  const cnt = (c) => (c.done || {})[k] || 0;
  let h = '<p class="hint">' + (!info.applicable ? "No habits on this day." : info.applicable > 1 ? info.complete + " of " + info.applicable + " habits done · " + Math.round(info.ratio * 100) + "%" : info.complete ? "Done" : "Not done") + "</p>";
  for (const [name, arr] of [["Done", here.filter((c) => cnt(c) >= (c.freq || 1))], ["Partly done", here.filter((c) => cnt(c) > 0 && cnt(c) < (c.freq || 1))], ["Not done", here.filter((c) => !cnt(c))]]) {
    if (!arr.length) continue;
    h += '<div class="sec">' + name + ' <span class="n">' + arr.length + '</span></div><div class="card list">' + arr.map((c) => {
      const n = cnt(c), f = c.freq || 1, col = calColor(c.color);
      return '<div class="hrow" data-a="dayCycle" data-id="' + c.id + '" role="button" tabindex="0"><span class="hbtn sm' + (n >= f ? " full" : "") + '" style="--hc:' + col + (n >= f ? ";color:" + inkOn(col) : "") + '">' + (n >= f ? "✓" : n || "") + "</span>" +
        '<div class="rt"><div class="ti">' + esc((c.icon ? c.icon + " " : "") + c.name) + "</div>" + (c.tag ? '<div class="me">#' + esc(c.tag) + "</div>" : "") + "</div>" + (f > 1 ? '<span class="hint">' + n + "/" + f + "</span>" : "") + "</div>";
    }).join("") + "</div>";
  }
  return h + (here.length ? '<p class="hint" style="margin-top:10px">Tap a habit to change it for this day.</p>' : "");
}
// One more check-off on a day; after the last one it clears. Today earns XP, past days are just corrections.
function cycleDay(id, k, el) {
  const h = db.recs[id], n = (h.done || {})[k] || 0, f = h.freq || 1;
  if (k === today()) { if (n < f) tickHabit(id, 1, el); else for (let i = 0; i < n; i++) tickHabit(id, -1); return; }
  const dn = { ...(h.done || {}) };
  if (n + 1 > f) delete dn[k]; else dn[k] = n + 1;
  put({ ...h, done: dn });
}

// ---------- Now: one step at a time (Foothold), with the focus timer ----------
let fo = null, nw = { id: "", why: "" }, np = { panel: "", stuck: "", prompt: "", skip: [] }, wl = null;
try { fo = JSON.parse(lsGet("onward.focus")); } catch (e) {}
try { nw = JSON.parse(lsGet("onward.now")) || nw; } catch (e) {}
const saveFo = () => lsSet("onward.focus", JSON.stringify(fo));
const saveNw = () => lsSet("onward.now", JSON.stringify(nw));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600); return (h ? h + ":" : "") + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60); };
// A stopwatch counts up: fo.sw is set, fo.start is when it last started (0 while paused), fo.acc is time banked before that.
const swElapsed = () => (fo.acc || 0) + (fo.start ? Date.now() - fo.start : 0);
const ticking = () => !!(fo && (fo.end || (fo.sw && fo.start)));
const foShown = () => (fo.sw ? mmss(Math.floor(swElapsed() / 1000) * 1000) : mmss(fo.end ? fo.end - Date.now() : fo.left) + " left");
const dur = (m) => { m = Math.round(m); if (m < 60) return m + " min"; const h = Math.floor(m / 60), r = m % 60; return r ? h + " h " + r + " m" : h + " h"; };
const running = () => !!(fo && (fo.end || fo.left || fo.sw));
const nowTask = () => { const it = db.recs[nw.id]; return it && !it.del && !it.done && it.kind === "task" ? it : null; };
const wakeOn = () => { try { if (navigator.wakeLock && !wl) navigator.wakeLock.request("screen").then((l) => { wl = l; l.addEventListener("release", () => { wl = null; }); }).catch(() => {}); } catch (e) {} };
const wakeOff = () => { try { if (wl) { wl.release(); wl = null; } } catch (e) {} };
// How much of your day is left, between the day start and end set in Settings.
function dayLeft() {
  const s = set(), d = new Date(), m = (x) => { const p = String(x || "0:0").split(":"); return +p[0] * 60 + (+p[1] || 0); };
  let n = d.getHours() * 60 + d.getMinutes(), a = m(s.dayStart), e = m(s.dayEnd), label, frac;
  if (e <= a) e += 1440;
  if (n < a && n + 1440 < e) n += 1440;
  if (n < a) { label = "day starts at " + ((Math.floor(a / 60) % 12) || 12) + ":" + pad(a % 60) + (a < 720 ? " AM" : " PM"); frac = 0; } else if (n >= e) { label = "past your day end"; frac = 1; } else { label = dur(e - n) + " left today"; frac = (n - a) / (e - a); }
  return { label: fmtTime(Date.now(), O()) + " · " + label, pct: Math.round(frac * 100) };
}
function setNow(id, why) {
  if (running() && fo.ref !== id) foFinish(true, true);
  if (fo && fo.ended) { fo = null; saveFo(); }
  nw = { id, why: why || "" }; saveNw();
  np.panel = ""; np.stuck = "";
}
// Chooses for you and says why. "small" hands over the lightest thing on the list.
function pickFor(skip, mode) {
  const start = startToday(), c = items().filter((i) => i.kind === "task" && !i.done && !i.shelf && !skip.includes(i.id) && (i.at == null || i.at < start + DAY));
  if (!c.length) return null;
  const est = (x) => x.est || 9999, age = (a, b) => (a.created || 0) - (b.created || 0);
  if (mode !== "small") {
    const due = c.filter((i) => i.at != null).sort((a, b) => a.at - b.at || (b.pri || 0) - (a.pri || 0))[0];
    if (due) return { t: due, why: due.at < start ? "it has been waiting the longest" : "it is due today" };
    const st = c.find((i) => i.spent > 0 || i.left || (i.subs || []).some((x) => x.d));
    if (st) return { t: st, why: "you already started it" };
    const hi = c.filter((i) => i.pri).sort((a, b) => b.pri - a.pri)[0];
    if (hi) return { t: hi, why: "it is your highest priority" };
  }
  const t = c.slice().sort((a, b) => est(a) - est(b) || age(a, b))[0];
  return { t, why: mode === "small" ? "it is the smallest thing on your list" : t.est ? "it has the shortest guess on your list" : "it has waited longest on your list" };
}
function pickNow() {
  let p = pickFor(np.skip);
  if (!p && np.skip.length) { np.skip = []; p = pickFor([]); }
  if (!p) { toast("Nothing waiting. Add a task first."); return false; }
  np.skip.push(p.t.id); setNow(p.t.id, p.why);
  return true;
}
const openShrink = (prompt) => { np.panel = "shrink"; np.prompt = prompt; };
// Asks the AI for steps for the task on the Now tab and shows them to accept or reject.
async function nowAi(kind) {
  const it = nowTask();
  if (!it) return;
  const cur = (it.subs || []).find((x) => !x.d), step = cur ? cur.t : it.step || it.title;
  np.panel = "ai"; np.ai = { kind, busy: true }; render();
  try {
    const r = await aiAsk(kind === "smaller" ? { kind, title: it.title, step } : { kind, title: it.title, notes: it.notes, steps: (it.subs || []).map((x) => x.t) });
    if (np.panel === "ai" && nw.id === it.id) np.ai = { kind, steps: r.steps.map((t) => ({ t, on: true })) };
  } catch (e) { if (np.panel === "ai") np.ai = { kind, err: e.message }; }
  render();
}
const STUCK = {
  start: { q: "I don’t know where to start", go: () => openShrink("What would your hands do first? Name something physical.") },
  big: { q: "It feels too big", go: () => openShrink("Cut off a piece you could finish in 2 minutes. What is it?") },
  need: { q: "I need something else first", go: () => openShrink("What has to happen first?") },
  dread: { q: "I’m dreading it", tip: "Do it badly on purpose for 2 minutes. A bad version counts, and you can stop when the timer ends.", btn: "Start 2 minutes", act: () => foStart(2, true) },
  boring: { q: "It’s boring", tip: "Race it. Guess how fast you can finish this step, then try to beat a 10 minute clock.", btn: "Start 10 minutes", act: () => foStart(10) },
  tired: { q: "I have no energy for this", tip: "Park it. Take the smallest thing on your list, or stop for now.", btn: "Give me something small", act: () => {
    const p = pickFor([nw.id], "small");
    if (!p) { toast("Nothing smaller on the list. Stopping is allowed."); np.panel = ""; np.stuck = ""; return; }
    setNow(p.t.id, p.why);
  } },
};
function foStart(min, starter) {
  const it = nowTask();
  const pick = $("#foRef");
  if (pick) ui.foRef = pick.value;
  const ref = it ? it.id : (fo && fo.ended && fo.ref) || ui.foRef || "";
  fo = min === "sw" ? { ref, sw: 1, start: Date.now(), acc: 0, min: 0, lastChk: 0 } : { ref, min, end: Date.now() + min * MIN, starter: !!starter, lastChk: 0 };
  np.panel = ""; np.stuck = ""; saveFo(); wakeOn(); beep([523]);
}
// Adds the time actually spent to the task, so guesses can be compared with reality.
function foBank() {
  const left = fo.end ? fo.end - Date.now() : fo.left || 0, secs = fo.sw ? Math.min(4 * 3600, Math.round(swElapsed() / 1000)) : Math.max(0, Math.round((fo.min * MIN - Math.max(0, left)) / 1000)), it = db.recs[fo.ref];
  if (it && it.type === "item" && !it.del && secs) put({ ...it, spent: (it.spent || 0) + secs });
  return secs;
}
function foFinish(early, quiet) {
  if (!running()) return;
  const was = fo, min = Math.round(foBank() / 60), ref = db.recs[was.ref], before = game().L;
  fo = early ? null : { ref: was.ref, ended: 1, min: was.min, starter: was.starter }; saveFo(); wakeOff();
  document.title = "Onward";
  if (min >= 1) {
    const xp = Math.max(2, Math.round(min / 5) * 2);
    put({ id: "l" + uid(), type: "log", k: "focus", ref: ref ? ref.id : "", title: "Focused " + min + " min" + (ref ? ": " + (ref.title || ref.name) : ""), at: Date.now(), xp, min });
    if (!quiet) { celebrate(xp, $("#clock"), before, !early); toast(early ? "Stopped at " + min + " min. That still counts. +" + xp + " XP" : (was.starter ? "2 minutes done. Starting was the hard part." : dur(min) + " done.") + " +" + xp + " XP"); }
  } else if (!quiet) toast("Stopped. Nothing lost.");
  if (!early) {
    beep([660, 880, 1100], 0.3, 0.5); if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
    try { if (document.hidden && "Notification" in window && Notification.permission === "granted") navigator.serviceWorker.ready.then((r) => r.showNotification(was.starter ? "2 minutes done" : dur(was.min) + " done", { body: ref ? ref.title || ref.name : "", tag: "timer", icon: "/icon-192.png" })); } catch (e) {}
  }
  checkQuests(); render();
}
function foTick() {
  const hd = $("#hdt");
  if (!ticking()) { if (hd && !running()) hd.hidden = true; return; }
  const now = Date.now(), left = fo.sw ? 0 : fo.end - now, gone = fo.sw ? swElapsed() : fo.min * MIN - left;
  if (!fo.sw && left <= 0) return foFinish(false);
  if (fo.sw && gone >= 4 * 3600e3) { foFinish(true, true); toast("Stopwatch stopped itself at 4 hours and logged them."); return; }
  const em = Math.floor(gone / MIN), ck = +set().chime;
  if (ck > 0 && em > 0 && em % ck === 0 && fo.lastChk !== em) { fo.lastChk = em; saveFo(); beep([520], 0.3, 0.12); }
  const el = $("#clock"), w = $("#wedge"), shown = fo.sw ? mmss(Math.floor(gone / 1000) * 1000) : mmss(left);
  if (el) el.textContent = shown;
  if (w) w.setAttribute("stroke-dasharray", (Math.min(1, (fo.sw ? gone % 3600000 : left) / 3600000) * 169.65).toFixed(2) + " 169.65");
  if (hd) hd.textContent = "⏱ " + foShown();
  document.title = shown + " · Onward";
}
// A 60 minute dial, so 25 minutes always looks like 25 minutes.
function dial() {
  const left = fo.sw ? swElapsed() % 3600000 : Math.max(0, fo.end ? fo.end - Date.now() : fo.left);
  let ticks = "";
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, x = Math.sin(a), y = -Math.cos(a); ticks += '<line x1="' + (60 + x * 55).toFixed(1) + '" y1="' + (60 + y * 55).toFixed(1) + '" x2="' + (60 + x * 59).toFixed(1) + '" y2="' + (60 + y * 59).toFixed(1) + '"/>'; }
  return '<div class="timer"><svg class="disc" viewBox="0 0 120 120" role="img" aria-label="Time left, shown on a 60 minute dial"><circle class="face" cx="60" cy="60" r="54"/>' +
    '<circle class="wedge" id="wedge" cx="60" cy="60" r="27" stroke-width="54" transform="rotate(-90 60 60)" stroke-dasharray="' + (Math.min(1, left / 3600000) * 169.65).toFixed(2) + ' 169.65"/>' + ticks + '<circle class="hub" cx="60" cy="60" r="3.5"/></svg>' +
    '<div class="readout"><span class="tleft" id="clock">' + (fo.sw ? mmss(Math.floor(swElapsed() / 1000) * 1000) : mmss(left)) + '</span><span class="hint">' + (fo.sw ? (fo.start ? "stopwatch · counting up" : "stopwatch · paused") : fo.end ? "left · ends " + fmtTime(fo.end, O()) : "paused") +
    '</span><span class="hint">' + (fo.sw ? "Runs until you finish it." : fo.starter ? "You can stop when it ends." : "Full dial is 60 minutes.") + "</span></div></div>";
}
// The suggested lengths are yours to change: "Edit" lets you remove any of them or add your own.
const PRESET_DEF = { timers: [10, 25, 45], guesses: [5, 15, 30, 60, 120] };
const presets = (k) => (Array.isArray(set()[k]) ? set()[k] : PRESET_DEF[k]);
function presetRow(k, label, pick, inputId, goAction, goLabel) {
  const edit = ui.pe === k;
  return '<div class="commit"><span>' + label + "</span>" + presets(k).map((n) => edit
    ? '<button class="chip del" data-a="peDel" data-k="' + k + '" data-v="' + n + '" aria-label="Remove ' + dur(n) + '">' + dur(n) + " ×</button>"
    : '<button class="chip" data-a="' + pick + '" data-v="' + n + '">' + dur(n) + "</button>").join("") +
    '<input class="in mini" id="' + inputId + '" type="number" min="1" max="600" inputmode="numeric" placeholder="min" aria-label="' + (edit ? "A length to add, in minutes" : "Your own length in minutes") + '">' +
    (edit ? '<button class="chip" data-a="peAdd" data-k="' + k + '" data-i="' + inputId + '">Add</button><button class="link" data-a="peEdit" data-k="' + k + '">Done</button>'
      : '<button class="chip" data-a="' + goAction + '">' + goLabel + '</button><button class="link" data-a="peEdit" data-k="' + k + '">Edit</button>') + "</div>";
}
function timerBox(hasStep) {
  const step = hasStep ? '<button class="btn" data-a="nwStepDone">Step done</button>' : "";
  if (running()) return dial() + '<div class="acts">' + step + '<button class="btn ghost" data-a="foPause">' + (ticking() ? "Pause" : "Resume") + '</button><button class="btn ghost" data-a="foStop">' + (fo.sw ? "Finish" : "Finish early") + '</button><button class="btn ghost" data-a="foReset">Reset</button></div>';
  if (fo && fo.ended) return '<p class="ended">' + (fo.starter ? "2 minutes done. Starting was the hard part." : dur(fo.min) + " done.") + '</p><div class="acts"><button class="btn" data-a="foStart" data-v="10">Keep going 10 min</button><button class="btn ghost" data-a="foStart" data-v="25">25 min</button>' +
    (hasStep ? '<button class="btn ghost" data-a="nwStepDone">Step done</button>' : '<button class="btn ghost" data-a="foClear">Enough for now</button>') + "</div>";
  return '<button class="btn big" data-a="foStart" data-v="2" data-s="1">Start with 2 minutes</button>' + presetRow("timers", "Or commit to", "foStart", "foCustom", "foCustom", "Start") +
    '<div class="commit"><button class="chip" data-a="foStart" data-v="sw">⏱ Stopwatch</button></div>' +
    (hasStep ? '<div class="acts"><button class="btn ghost" data-a="nwStepDone">Step done</button></div>' : "");
}
function panelHtml() {
  const cancel = '<button class="link" data-a="nwClose">Cancel</button>';
  if (np.panel === "ai") {
    const a = np.ai || {}, again = '<button class="btn ghost" data-a="' + (a.kind === "smaller" ? "aiSmaller" : "aiSteps") + '">Try again</button>';
    if (a.busy) return '<div class="panel"><p class="q">✨ Thinking of small steps…</p><p class="hint">This usually takes a few seconds.</p>' + cancel + "</div>";
    if (a.err) return '<div class="panel"><p class="q">No suggestions this time</p><p class="hint">' + esc(a.err) + '</p><div class="acts">' + again + cancel + "</div></div>";
    return '<div class="panel"><p class="q">✨ Suggested ' + (a.kind === "smaller" ? "smaller steps" : "steps") + '</p><p class="hint" style="margin-bottom:8px">Tap any you don’t want. You can edit them later.</p>' +
      a.steps.map((x, i) => '<button class="aistep" data-a="aiToggle" data-i="' + i + '" aria-pressed="' + x.on + '"><span class="chk sq" aria-pressed="' + x.on + '"></span>' + esc(x.t) + "</button>").join("") +
      '<div class="acts"><button class="btn" data-a="aiAdd">Add ' + a.steps.filter((x) => x.on).length + " steps</button>" + again + cancel + "</div></div>";
  }
  if (np.panel === "shrink") return '<div class="panel"><label for="nwShrink">' + esc(np.prompt) + '</label><input class="in" id="nwShrink" type="text" autocomplete="off" placeholder="A smaller step"><div class="acts"><button class="btn" data-a="nwShrinkGo">Do this first</button><button class="btn soft" data-a="aiSmaller">✨ Suggest for me</button>' + cancel + "</div></div>";
  if (np.panel === "park") return '<div class="panel"><label for="nwPark">Where are you leaving off? (optional)</label><input class="in" id="nwPark" type="text" autocomplete="off" placeholder="A note for when you come back"><div class="acts"><button class="btn" data-a="nwParkGo">Park it</button>' + cancel + "</div></div>";
  if (np.panel === "stuck") {
    if (np.stuck) { const r = STUCK[np.stuck]; return '<div class="panel"><p class="q">' + esc(r.q) + "</p><p>" + esc(r.tip) + '</p><div class="acts"><button class="btn" data-a="nwTactic">' + esc(r.btn) + '</button><button class="link" data-a="nwStuck">Back</button></div></div>'; }
    return '<div class="panel"><p class="q">What is in the way?</p><div class="reasons">' + Object.keys(STUCK).map((k) => '<button class="btn ghost" data-a="nwReason" data-v="' + k + '">' + esc(STUCK[k].q) + "</button>").join("") + '</div><button class="link" data-a="nwClose">Never mind</button></div>';
  }
  return "";
}
const dumpForm = () => '<textarea class="in" id="dumpText" rows="5" placeholder="One thing per line. Messy is fine."></textarea><button class="btn" style="margin-top:8px" data-a="dumpGo">Add to my list</button>';
function vFocus() {
  const o = O(), t = today(), start = startToday(), it = nowTask();
  let h = "", tail = "";
  if (!it) {
    const open = items().filter((i) => i.kind === "task" && !i.done && !i.shelf);
    if (!open.length) tail = '<div class="card nowc"><h1 class="step">Nothing on your list.</h1><p class="lede">Write down whatever is taking up space in your head. Sorting comes later.</p>' + dumpForm() + "</div>";
    else {
      let list = open.filter((i) => i.at != null && i.at < start + DAY).sort(byAt), from = "Today";
      if (!list.length) { list = open.filter((i) => i.at == null).sort((a, b) => (a.created || 0) - (b.created || 0)); from = "From your list, because today is empty"; }
      if (!list.length) { list = open.slice().sort(byAt); from = "Coming up"; }
      h += '<div class="card nowc"><h1 class="step">What now?</h1><p class="lede">Choosing is work too. Let the app choose, or tap one yourself.</p><button class="btn big" data-a="nwPick">Pick for me</button></div>' +
        '<div class="sec">' + from + '</div><div class="card list">' + list.slice(0, 6).map((x) => '<div class="row" data-a="nwSet" data-id="' + x.id + '" role="button" tabindex="0"><div class="rt"><div class="ti">' + esc(x.title) + "</div>" +
        (x.left || x.est || x.at != null ? '<div class="me">' + [x.at != null ? fmtWhen(x, o, Date.now()) : "", x.est ? "~" + dur(x.est) : "", x.left ? "left off: " + x.left : ""].filter(Boolean).map(esc).join(" · ") + "</div>" : "") + "</div></div>").join("") + "</div>";
    }
    const tk = items().filter((i) => i.kind === "task" && !i.done).sort(byAt).slice(0, 40), hb = habits();
    h += '<div class="sec">' + (tail ? "Run a timer" : "Or just run a timer") + '</div><div class="card nowc">' + (running() || (fo && fo.ended) ? "" : '<select class="in" id="foRef" aria-label="What the timer is for" style="margin-bottom:8px"><option value="">Nothing specific</option>' +
      (tk.length ? '<optgroup label="Tasks">' + opts(tk.map((i) => [i.id, i.title]), ui.foRef) + "</optgroup>" : "") + (hb.length ? '<optgroup label="Habits">' + opts(hb.map((x) => [x.id, (x.icon ? x.icon + " " : "") + x.name]), ui.foRef) + "</optgroup>" : "") + "</select>") + timerBox(false) + "</div>";
  } else {
    const subs = it.subs || [], n = subs.length, dn = subs.filter((x) => x.d).length, st = subs.find((x) => !x.d) || (!n && it.step ? { t: it.step } : null);
    const park = '<button class="link" data-a="nwPark">Not now</button>';
    h += '<div class="card nowc"><p class="eyebrow">' + esc((it.icon ? it.icon + " " : "") + it.title) + "</p>";
    if (nw.why) h += '<p class="why">Picked because ' + esc(nw.why) + '. <button class="link" data-a="nwAnother">Pick another</button></p>';
    if (it.left) h += '<p class="leftoff"><b>Where you left off:</b> ' + esc(it.left) + "</p>";
    if (!st && !n) {
      h += '<h1 class="step">What would your hands do first?</h1><p class="lede">Name something physical and small, like opening the file or putting on shoes.</p>' +
        '<div class="inl"><input class="in" id="nwFirst" type="text" autocomplete="off" placeholder="First tiny step" aria-label="First tiny step"><button class="btn" data-a="nwFirst">Add</button></div>' +
        (np.panel ? "" : '<button class="btn soft" style="margin-top:10px;width:100%" data-a="aiSteps">✨ Break it down for me</button>') +
        '<div class="links"><button class="link" data-a="nwOne">It is one step. Just start.</button>' + park + '<button class="link" data-a="nwEdit">Edit task</button></div>' + (np.panel ? panelHtml() : "");
    } else if (!st) {
      h += '<h1 class="step">All steps done. Is the whole task finished?</h1><button class="btn big" data-a="nwFinish">Yes, finished</button>' +
        '<div class="inl"><input class="in" id="nwAdd" type="text" autocomplete="off" placeholder="Or add the next step" aria-label="Next step"><button class="btn ghost" data-a="nwAdd">Add</button></div><div class="links"><button class="link" data-a="aiSteps">✨ Suggest next steps</button>' + park + "</div>" + (np.panel ? panelHtml() : "");
    } else {
      let dots = "";
      for (const x of subs) dots += '<i class="' + (x.d ? "d" : x === st ? "c" : "") + '"></i>';
      h += '<h1 class="step">' + esc(st.t) + "</h1>" + (n ? '<p class="prog"><span>Step ' + (dn + 1) + " of " + n + '</span><span class="dots" aria-hidden="true">' + dots + "</span></p>" : "");
      h += np.panel ? panelHtml() : timerBox(true) + '<div class="links"><button class="link" data-a="nwShrink">Make it smaller</button><button class="link" data-a="nwStuck">I’m stuck</button><button class="link" data-a="aiSteps">✨ Suggest steps</button>' + park + '<button class="link" data-a="nwEdit">Edit task</button></div>';
    }
    h += it.est ? '<p class="guess"><span>Your guess: ' + dur(it.est) + " · tracked so far: " + dur((it.spent || 0) / 60) + '</span><button class="link" data-a="nwGuess" data-v="0">Change</button></p>'
      : '<div class="guess">' + presetRow("guesses", "Guess the whole task:", "nwGuess", "nwGuessN", "nwGuessC", "Set") + "</div>";
    if (n) h += '<details class="allsteps" id="allSteps"' + (ui.stepsOpen ? " open" : "") + "><summary>All steps (" + n + ")</summary><ol>" + subs.map((x) => '<li class="' + (x.d ? "d" : x === st ? "c" : "") + '">' + esc(x.t) + "</li>").join("") +
      '</ol><div class="inl"><input class="in" id="nwAdd" type="text" autocomplete="off" placeholder="Add a later step" aria-label="Add a later step"><button class="btn ghost" data-a="nwAdd">Add</button></div></details>';
    h += "</div>";
  }
  const L = logs().filter((l) => dayKey(l.at, o) === t), mins = L.filter((l) => l.k === "focus").reduce((a, l) => a + (l.min || 0), 0);
  h += '<div class="stats s3"><button class="card stat" data-a="foLog"><b>' + L.filter((l) => l.k === "focus").length + '</b><span>Sessions today ›</span></button><button class="card stat" data-a="foViz"><b>' + mins +
    '</b><span>Minutes focused today ›</span></button><div class="card stat"><b>' + L.filter((l) => l.k === "step").length + "</b><span>Steps today</span></div></div>";
  const hs = all("hist").sort((a, b) => a.at - b.at);
  h += '<div class="sec">Guess vs. tracked time</div>';
  if (!hs.length) h += '<p class="hint">Guess how long a task takes, run the timer while you do it, and finish it. Your real ratio shows up here.</p>';
  else {
    let e = 0, a = 0;
    for (const x of hs) { e += x.est; a += x.actual; }
    const r = a / e;
    h += '<div class="card nowc"><p>Across ' + hs.length + (hs.length === 1 ? " task" : " tasks") + ", things took <b>" + r.toFixed(1) + "×</b> your guess." + (hs.length >= 3 && r > 1.15 ? " Multiply your next guess by " + r.toFixed(1) + "." : "") + "</p>" +
      hs.slice(-6).reverse().map((x) => '<p class="hint" style="margin-top:6px"><b>' + (x.actual / x.est).toFixed(1) + "×</b> " + esc(x.title) + ": guessed " + dur(x.est) + ", tracked " + dur(x.actual) + "</p>").join("") + "</div>";
  }
  return h + (tail ? '<div style="height:14px"></div>' + tail : "");
}

// ---------- shell ----------
function drawTop() {
  const g = game(), o = O(), d = loc(Date.now(), o);
  const title = ui.tab === "today" ? WD[d.getUTCDay()] + " " + d.getUTCDate() + " " + MO[d.getUTCMonth()] : TABS.find((t) => t[0] === ui.tab)[1];
  const tmr = running() && ui.tab !== "focus" ? '<button class="hdt" id="hdt" data-a="tab" data-v="focus" aria-label="Go to the running timer">⏱ ' + foShown() + "</button>" : "";
  $("#top").innerHTML = '<div class="grow"><h1>' + title + '</h1><div class="sub">' + (tmr || TITLES[Math.min(g.L, TITLES.length) - 1]) + "</div></div>" +
    '<span class="pill fire" title="Day streak. ❄ are streak freezes that cover a missed day.">🔥 ' + g.streak + (g.freezes ? " · ❄" + g.freezes : "") + "</span>" +
    '<div class="lvl" title="' + g.xp + ' XP in total"><b>Lv ' + g.L + "<span>" + g.cur + "/" + g.need + '</span></b><div class="bar"><i style="width:' + Math.round((100 * g.cur) / g.need) + '%"></i></div></div>' +
    '<button class="ib" data-a="settings" aria-label="Settings">' + ICON.gear + '<span class="dot ' + dot + '"></span></button>';
}
// Names of current and past tasks and habits, offered while typing a name.
function pastNames() {
  const seen = new Set(), out = [];
  for (const r of Object.values(db.recs).filter((x) => x.type === "item" || x.type === "habit").sort((a, b) => (b.u || 0) - (a.u || 0))) {
    const n = String(r.title || r.name || "").trim(), k = n.toLowerCase();
    if (n && !seen.has(k)) { seen.add(k); out.push(n); if (out.length >= 150) break; }
  }
  return out;
}
function render() {
  if (drag) { drag.stale = true; return; }
  $("#names").innerHTML = pastNames().map((n) => '<option value="' + esc(n) + '">').join("");
  const main = $("#main"), a = document.activeElement, keep = a && a.id && main.contains(a) ? { id: a.id, v: a.value, s: a.selectionStart } : null, y = main.scrollTop;
  const drafts = {};
  for (const el of $$("input[id], textarea[id], select[id]", main)) if (el.type !== "search" && el.value !== "") drafts[el.id] = el.value;
  $("#nav").innerHTML = '<div class="brand">Onward</div>' + TABS.map(([k, l]) => '<button data-a="tab" data-v="' + k + '"' + (ui.tab === k ? ' aria-current="page"' : "") + ">" + ICON[k] + "<span>" + l + "</span></button>").join("");
  drawTop();
  main.innerHTML = { today: vToday, tasks: vTasks, cal: vCal, habits: vHabits, focus: vFocus }[ui.tab]();
  main.scrollTop = y;
  for (const id in drafts) { const el = document.getElementById(id); if (el && main.contains(el)) el.value = drafts[id]; }
  if ($("#qa") && $("#qa").value) $("#qap").textContent = quickPreview($("#qa").value);
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (e) {} } }
}
const done = () => { checkQuests(); render(); };

// ================= sheets =================
// Every pop-up, the alarm screen, select mode and leaving the Today tab add one history entry,
// so the phone's back button undoes the top one instead of leaving the app.
const layers = [];
let ignorePop = 0, deferredPush = 0, popTimer = 0;
function pushLayer(kind, undo) {
  layers.push({ kind, undo });
  if (ignorePop > 0) { deferredPush++; return; }
  try { history.pushState({ layer: layers.length }, ""); } catch (e) {}
}
function flushPushes() {
  clearTimeout(popTimer);
  while (deferredPush > 0) { deferredPush--; try { history.pushState({ layer: layers.length }, ""); } catch (e) {} }
}
function dropLayer(kind) {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].kind !== kind) continue;
    layers.splice(i, 1);
    ignorePop++;
    clearTimeout(popTimer);
    popTimer = setTimeout(() => { ignorePop = 0; flushPushes(); }, 700);
    try { history.back(); } catch (e) { ignorePop--; }
    return;
  }
}
window.addEventListener("popstate", () => {
  if (ignorePop > 0) { ignorePop--; if (ignorePop === 0) flushPushes(); return; }
  const l = layers.pop();
  if (l) l.undo();
});
const hasLayer = (kind) => layers.some((l) => l.kind === kind);
function setTab(tab, dir) {
  if (tab === ui.tab) return;
  if (tab === "today") dropLayer("tab");
  else if (!hasLayer("tab")) pushLayer("tab", () => { ui.tab = "today"; render(); });
  if (ui.selecting) { ui.selecting = false; ui.selected = {}; dropLayer("select"); }
  ui.tab = tab; $("#main").scrollTop = 0; render(); $("#main").scrollTop = 0;
  const m = $("#main");
  m.classList.remove("fwd", "back"); void m.offsetWidth; if (dir) m.classList.add(dir);
}

let onSheetClose = null;
function openSheet(title, body, onClose, btn) {
  $("#sheet").innerHTML = '<div class="sh" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="shh"><h2>' + esc(title) +
    '</h2><button class="btn sm" data-a="closeSheet">' + (btn || "Done") + '</button></div><div class="shb">' + body + "</div></div>";
  $("#sheet").hidden = false; onSheetClose = onClose || null;
  if (!hasLayer("sheet")) pushLayer("sheet", () => closeSheet(false, true));
  const af = $("#sheet [autofocus]"); if (af) af.focus();
}
function closeSheet(skip, fromBack) {
  const f = onSheetClose; onSheetClose = null;
  if (f && !skip) f();
  $("#sheet").hidden = true; $("#sheet").innerHTML = "";
  if (!fromBack) dropLayer("sheet");
  done();
}
function setBody(html) {
  const b = $("#sheet .shb"), y = b.scrollTop, a = document.activeElement, open = $$("details", b).map((d) => d.open);
  const k = a && b.contains(a) && a.dataset.f ? '[data-f="' + a.dataset.f + '"]' + (a.dataset.i ? '[data-i="' + a.dataset.i + '"]' : "") : "";
  b.innerHTML = html;
  const ds = $$("details", b);
  if (ds.length === open.length) ds.forEach((d, i) => { d.open = open[i]; });
  b.scrollTop = y;
  if (k && $(k, b)) $(k, b).focus();
}
const chipBtn = (a, v, l, on, extra) => '<button class="chip" data-a="' + a + '" data-v="' + esc(v) + '" aria-pressed="' + !!on + '"' + (extra || "") + ">" + l + "</button>";
const opts = (arr, cur) => arr.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(l) + "</option>").join("");
const chRow = (a, cur, extra) => '<div class="chips">' + CHS.map(([c, l]) => chipBtn(a, c, l, (cur || []).includes(c), extra)).join("") + "</div>";

// Plain-language reasons a chosen channel will not deliver yet, so a silent reminder is never a surprise.
function chProblems(chs) {
  const out = [], has = (c) => chs.includes(c);
  if (!chs.length) return out;
  if (!key) return ["Sync is off, so nothing can be sent while the app is closed. Only the in-app alarm will ring. Turn sync on in Settings."];
  if (!cfg) return out;
  if ((has("push") || has("alarm")) && !cfg.pushDevices) out.push("Push and Alarm: no device has notifications turned on yet.");
  if (has("tg") && !cfg.tgChat) out.push("Telegram: not linked yet.");
  if (has("email") && !(cfg.resendKey && cfg.emailTo)) out.push("Email: not set up yet.");
  return out.length ? out.concat("Fix these in Settings (gear icon).") : out;
}
const warn = (chs) => { const p = chProblems(chs); return p.length ? '<p class="warn">' + p.map(esc).join("<br>") + "</p>" : ""; };

// ---------- task / event editor ----------
let ed = null;
function editItem(id, preset) {
  const o = O(), ex = id && db.recs[id] && !db.recs[id].del ? db.recs[id] : null;
  const it = ex ? JSON.parse(JSON.stringify(ex)) : newItem({ withRem: true, ...(preset || {}) });
  const r = it.rep, wd5 = r && r.f === "w" && r.days && r.days.length === 5 && [1, 2, 3, 4, 5].every((x) => r.days.includes(x));
  ed = { it, isNew: !ex, dk: it.at != null ? dayKey(it.at, o) : "", tm: it.at != null && !it.allDay ? hhmm(it.at) : "",
    rs: !r ? "" : wd5 ? "wd" : (r.n || 1) > 1 ? "c" : r.f, cn: r ? r.n || 1 : 2, cu: r ? r.f : "d", days: r && r.days && !wd5 ? r.days.slice() : [], until: r && r.until ? r.until : "" };
  openSheet(ex ? "Edit" : "New", edBody(), saveEd, "Save");
}
// The occurrence "Skip this one" would skip: a task's current date, or an event's next one.
function skipTarget(it) {
  if (!it.rep || it.at == null || it.done) return null;
  return it.kind === "event" ? occFrom(it, O(), Date.now()) : it.at;
}
function skipBtn() {
  if (ed.isNew) return "";
  const cur = db.recs[ed.it.id], at = cur ? skipTarget(cur) : null;
  return at == null ? "" : '<button class="btn ghost sm" style="margin-top:10px" data-a="edSkip">Skip just this one (' + esc(fmtDay(at, O(), Date.now())) + ")</button>";
}
const edSugHtml = () => [...new Set([...(ed.ai || []), ...suggestIcons(ed.it.title)])].filter((e) => e !== ed.it.icon).slice(0, 6).map((e) => '<button class="emo" data-a="edIcon" data-v="' + e + '" aria-label="Use ' + e + '">' + e + "</button>").join("");
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
  return '<input class="in title" data-f="title" list="names" autocomplete="off" placeholder="' + (ev ? "What’s happening?" : "What needs doing?") + '" value="' + esc(it.title) + '"' + (ed.isNew ? " autofocus" : "") + ">" +
    '<div class="iconrow" style="margin-top:10px"><input class="in icn" data-f="icon" maxlength="8" value="' + esc(it.icon || "") + '" placeholder="🙂" aria-label="Icon, one emoji (optional)"><span id="edSug">' + edSugHtml() +
    '</span><button class="btn ghost sm" data-a="edIconAi" aria-label="Suggest icons with AI">✨ Suggest</button></div>' +
    (ev ? "" : '<div class="f"><input class="in" data-f="step" placeholder="Tiniest first step (optional), e.g. “open the doc”" value="' + esc(it.step || "") + '" aria-label="First tiny step"></div>') +
    '<div class="f chips">' + chipBtn("edKind", "task", "Task", !ev) + chipBtn("edKind", "event", "Event", ev) + "</div>" +
    '<div class="f"><label>When</label><div class="chips" style="margin-bottom:8px">' + [["", "No date"], [t, "Today"], [addDays(t, 1), "Tomorrow"], [addDays(t, 7), "Next week"]].map(([v, l]) => chipBtn("edDk", v, l, ed.dk === v && !(v === "" && it.shelf))).join("") + (ev ? "" : chipBtn("edShelf", "1", "Meaning to", !!it.shelf && !ed.dk)) +
    '</div><div class="r2"><input class="in" type="date" data-f="dk" data-c="redraw" value="' + ed.dk + '" aria-label="Date"><input class="in" type="time" data-f="tm" data-c="redraw" value="' + ed.tm + '" aria-label="Time, leave empty for all day"></div>' +
    (ev && ed.tm ? '<select class="in" data-f="dur" style="margin-top:8px" aria-label="Length">' + opts([[15, "15 minutes long"], [30, "30 minutes long"], [45, "45 minutes long"], [60, "1 hour long"], [90, "1.5 hours long"], [120, "2 hours long"], [180, "3 hours long"], [240, "4 hours long"]], it.dur || 60) + "</select>" : "") +
    (ed.dk && !ed.tm ? '<p class="hint" style="margin-top:6px">No time set, so this is all day. Reminders count from ' + esc(set().alldayAt) + ".</p>" : "") + "</div>" +
    '<div class="f"><label>Repeat</label><select class="in" data-f="rs" data-c="redraw" aria-label="Repeat">' + opts([["", "Doesn’t repeat"], ["d", "Daily"], ["wd", "Weekdays (Mon to Fri)"], ["w", "Weekly"], ["m", "Monthly"], ["y", "Yearly"], ["c", "Custom…"]], ed.rs) + "</select>" +
    (ed.rs === "c" ? '<div class="r2" style="margin-top:8px"><input class="in" type="number" min="1" inputmode="numeric" data-f="cn" value="' + ed.cn + '" aria-label="Every how many"><select class="in" data-f="cu" data-c="redraw" aria-label="Unit">' + opts([["d", "days"], ["w", "weeks"], ["m", "months"], ["y", "years"]], ed.cu) + "</select></div>" : "") +
    (wk ? '<div class="chips" style="margin-top:8px">' + WD.map((d, i) => chipBtn("edWd", i, d, ed.days.includes(i))).join("") + "</div>" : "") +
    (ed.rs ? '<div class="r2" style="margin-top:8px;align-items:center"><span class="hint" style="flex:none">Ends on</span><input class="in" type="date" data-f="until" value="' + esc(ed.until) + '" aria-label="Repeat ends on, empty for never"></div><p class="hint" style="margin-top:6px">Leave the end date empty to repeat forever.</p>' : "") +
    skipBtn() + "</div>" +
    '<div class="f"><label>Reminders</label>' + it.rem.map(remRow).join("") + '<button class="btn soft sm" data-a="remAdd">+ Add reminder</button>' +
    (it.rem.some((r) => r.at == null) && !ed.dk ? '<p class="hint" style="margin-top:6px">Pick a date above, or these reminders have nothing to count from.</p>' : "") +
    warn([...new Set(it.rem.flatMap((r) => r.ch))]) + "</div>" +
    (ev ? "" : '<div class="f"><label>If I ignore it</label><select class="in" data-f="nag" aria-label="Keep nudging">' + opts([[0, "Remind once"], [5, "Nudge every 5 min until done (up to 5 times)"], [10, "Nudge every 10 min until done (up to 5 times)"], [30, "Nudge every 30 min until done (up to 5 times)"]], it.nag || 0) + "</select></div>") +
    '<div class="f r2"><div><span class="lab">List</span><select class="in" data-f="list" data-c="edList" aria-label="List">' + opts([["", "Inbox"]].concat(lists().map((l) => [l.id, l.name]), [["__new", "+ New list…"]]), ed.newList ? "__new" : it.list) + "</select></div>" +
    '<div><span class="lab">Takes about</span><select class="in" data-f="est" data-c="edEst" aria-label="Estimate">' + opts([[0, "Not sure"]].concat([...new Set([...presets("guesses"), ...(it.est ? [it.est] : [])])].sort((a, b) => a - b).map((n) => [n, dur(n)]), [["c", "Custom…"]]), ed.estC ? "c" : it.est || 0) + "</select>" +
    (ed.estC ? '<input class="in" style="margin-top:8px" type="number" min="1" max="6000" inputmode="numeric" data-f="estN" id="edEstN" placeholder="Minutes" value="' + (it.est || "") + '" aria-label="Your own estimate in minutes">' : "") + "</div></div>" +
    (ed.newList ? '<div class="r2" style="margin-top:8px"><input class="in" id="edNewList" type="text" autocomplete="off" placeholder="Name of the new list" aria-label="Name of the new list"><button class="btn" style="flex:none" data-a="edListAdd">Create</button></div>' : "") +
    (ev ? "" : '<div class="f"><label>Priority</label><div class="chips">' + ["None", "Low", "Medium", "High"].map((l, i) => chipBtn("edPri", i, l, (it.pri || 0) === i)).join("") + "</div></div>" +
      '<div class="f"><label>Energy it needs</label><div class="chips">' + [["", "Not set"], ["low", "Low"], ["med", "Medium"], ["high", "High"]].map(([v, l]) => chipBtn("edEn", v, l, (it.energy || "") === v)).join("") + "</div></div>") +
    '<div class="f"><label>Tags</label><input class="in" data-f="tags" placeholder="home, study" value="' + esc((it.tags || []).join(", ")) + '" aria-label="Tags, separated by commas"></div>' +
    (ev ? "" : '<div class="f"><label>Subtasks</label>' + it.subs.map((s, i) => '<div class="sub"><button class="chk" data-a="subT" data-i="' + i + '" aria-pressed="' + !!s.d + '" aria-label="Toggle subtask"></button><input class="in" type="text" data-f="sub" data-i="' + i + '" value="' + esc(s.t) + '" aria-label="Subtask"><button class="x" data-a="subDel" data-i="' + i + '" aria-label="Remove subtask">×</button></div>').join("") +
      '<div class="sub"><input class="in" type="text" id="subNew" data-f="subNew" placeholder="Add a step, then press Enter" aria-label="New subtask"><button class="btn soft sm" data-a="subAdd">Add</button></div>' +
      '<button class="btn ghost sm" data-a="edAi">✨ Suggest steps</button><div class="msg" id="edAiMsg"></div></div>') +
    (!ev && (it.left || it.spent) ? '<div class="f"><label>Where I left off</label><input class="in" data-f="left" value="' + esc(it.left || "") + '" aria-label="Where I left off">' + (it.spent ? '<p class="hint" style="margin-top:6px">Tracked so far: ' + dur(it.spent / 60) + (it.est ? " of a " + dur(it.est) + " guess" : "") + ".</p>" : "") + "</div>" : "") +
    '<div class="f"><label>Notes</label><textarea class="in" data-f="notes" aria-label="Notes">' + esc(it.notes || "") + "</textarea></div>" +
    '<div class="f r2"><button class="btn" data-a="closeSheet">Save</button>' + (ed.isNew ? '<button class="btn ghost" data-a="cancelSheet">Cancel</button>' : '<button class="btn danger" data-a="delItem">Delete</button>') + "</div>" +
    (ed.isNew ? "" : '<div class="links"><button class="link" data-a="cancelSheet">Discard my changes</button></div>');
}
function readForm() {
  if (!ed) return;
  const it = ed.it, o = O();
  for (const el of $$("#sheet [data-f]")) {
    const f = el.dataset.f, v = el.value, i = +el.dataset.i;
    if (f === "list") { if (v !== "__new") it.list = v; }
    else if (f === "title" || f === "step" || f === "notes") it[f] = v;
    else if (f === "icon") it.icon = firstGrapheme(v);
    else if (f === "left") it.left = v;
    else if (f === "until") ed.until = v;
    else if (f === "dk" || f === "tm" || f === "rs" || f === "cu") ed[f] = v;
    else if (f === "cn") ed.cn = Math.max(1, Math.floor(+v) || 1);
    else if (f === "dur" || f === "nag") it[f] = +v;
    else if (f === "est") { if (v !== "c") it.est = +v; }
    else if (f === "estN") { const n = Math.floor(+v); if (n >= 1) it.est = Math.min(6000, n); }
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
  if (e.dk || it.kind === "event") it.shelf = 0;
  if (it.shelf && !it.shelfAt) it.shelfAt = Date.now();
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
    if (e.until && e.until >= dayKey(it.at, o)) rep.until = e.until;
    it.rep = rep;
  }
  put(it);
}

// ---------- habit + list editors ----------
let hd = null;
function editHabit(id) {
  const ex = id && db.recs[id];
  hd = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid(), type: "habit", name: "", icon: "", tag: ui.hFilter ? (habits().find((h) => tagKey(h.tag) === ui.hFilter) || {}).tag || "" : "",
    color: PAL[0][1][habits().length % PAL[0][1].length], freq: 1, done: {}, remCh: [...set().defCh], ord: Date.now(), created: Date.now(), isNew: 1 };
  hd.rems = habitTimes(hd); delete hd.remAt;
  openSheet(ex ? "Edit habit" : "New habit", hdBody(), saveHabit, "Save");
}
const sugHtml = () => [...new Set([...(hd._ai || []), ...suggestIcons(hd.name)])].filter((e) => e !== hd.icon).slice(0, 6).map((e) => '<button class="emo" data-a="hdIcon" data-v="' + e + '" aria-label="Use ' + e + '">' + e + "</button>").join("");
function hdBody() {
  const freq = hd.freq || 1, tags = tagGroups(habits()).filter((g) => g.key && g.key !== tagKey(hd.tag)).map((g) => g.label);
  return '<input class="in title" data-f="name" id="hdName" list="names" autocomplete="off" placeholder="e.g. Drink water" value="' + esc(hd.name) + '"' + (hd.isNew ? " autofocus" : "") + ">" +
    '<div class="f"><label>Icon</label><div class="iconrow"><input class="in icn" data-f="icon" maxlength="8" value="' + esc(hd.icon || "") + '" placeholder="🙂" aria-label="Icon, one emoji"><span id="hdSug">' + sugHtml() +
    '</span><button class="btn ghost sm" data-a="hdIconAi" aria-label="Suggest icons with AI">✨ Suggest</button><button class="btn ghost sm" data-a="hdEmoji">' + (hd._em ? "Fewer" : "More") + "</button></div>" +
    (hd._em ? EMOJI_GROUPS.map(([n, list]) => '<div class="swl">' + n + '</div><div class="emojis">' + list.split(" ").map((e) => '<button class="emo" data-a="hdIcon" data-v="' + e + '" aria-label="Use ' + e + '">' + e + "</button>").join("") + "</div>").join("") : "") + "</div>" +
    '<div class="f"><label>Tag</label><input class="in" data-f="tag" autocomplete="off" placeholder="e.g. health, study" value="' + esc(hd.tag || "") + '" aria-label="Tag">' +
    (tags.length ? '<div class="chips" style="margin-top:8px">' + tags.map((t) => '<button class="chip" data-a="hdTag" data-v="' + esc(t) + '">#' + esc(t) + "</button>").join("") + "</div>" : "") + "</div>" +
    '<div class="f"><label>Times per day</label><div class="stepper"><button data-a="hdFreq" data-v="-1" aria-label="Fewer times">−</button><b>' + freq + '</b><button data-a="hdFreq" data-v="1" aria-label="More times">+</button><span class="hint">' +
    (freq === 1 ? "Once a day" : "Tap " + freq + " times to finish the day") + "</span></div></div>" +
    '<div class="f"><label>Colour</label>' + swatches("hdColor", hd.color) + "</div>" +
    '<div class="f"><label>Reminders</label>' + hd.rems.map((t, i) => '<div class="r2" style="margin-bottom:8px;align-items:center"><input class="in" type="time" data-f="rem" data-i="' + i + '" value="' + esc(t) + '" aria-label="Reminder ' + (i + 1) +
      '"><button class="x" data-a="hdRemDel" data-i="' + i + '" aria-label="Remove reminder ' + (i + 1) + '">×</button></div>').join("") +
    (hd.rems.length < freq ? '<button class="btn soft sm" data-a="hdRemAdd">+ Add reminder time</button>' : "") +
    '<p class="hint" style="margin:6px 0 8px">' + (freq === 1 ? "One reminder a day." : "Up to " + freq + " reminders, one for each time.") + " A reminder is skipped once you are already that far along for the day.</p>" +
    (hd.rems.length ? chRow("hdCh", hd.remCh) + warn(hd.remCh || []) : "") + "</div>" +
    '<div class="f r2"><button class="btn" data-a="closeSheet">Save</button>' + (hd.isNew ? '<button class="btn ghost" data-a="cancelSheet">Cancel</button>' : '<button class="btn danger" data-a="hdDel">Delete</button>') + "</div>" +
    (hd.isNew ? "" : '<div class="f r2"><button class="btn ghost sm" data-a="hdClear">Clear today</button><button class="btn ghost sm" data-a="hdMove" data-v="-1">Move up</button><button class="btn ghost sm" data-a="hdMove" data-v="1">Move down</button></div>');
}
function readHd() {
  if (!hd) return;
  for (const el of $$("#sheet [data-f]")) {
    const f = el.dataset.f, v = el.value.trim();
    if (f === "rem") hd.rems[+el.dataset.i] = v; else if (f === "icon") hd.icon = firstGrapheme(v); else hd[f] = v;
  }
}
function saveHabit() {
  if (!hd) return;
  readHd();
  const h = hd; hd = null;
  if (!h.name) return;
  if (h.isNew && !h.icon && !h._iconSet) h.icon = suggestIcons(h.name)[0] || "";
  h.rems = h.rems.filter(Boolean).sort().slice(0, h.freq || 1);
  delete h.isNew; delete h._em; delete h._iconSet; delete h._ai;
  put(h);
}
const swatches = (a, cur) => PAL.map(([name, cols]) => '<div class="swl">' + name + '</div><div class="sw">' + cols.map((c) => '<button data-a="' + a + '" data-v="' + c + '" style="background:' + c +
  '" aria-pressed="' + (c.toLowerCase() === String(cur).toLowerCase()) + '" aria-label="' + name + " colour " + c + '"></button>').join("") + "</div>").join("") +
  '<label class="custom"><input type="color" data-c="' + a + '" value="' + (/^#[0-9a-f]{6}$/i.test(cur) ? cur : "#71C0B6") + '" aria-label="Custom colour"><span class="hint">or pick your own</span></label>';
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

// ---------- settings ----------
let cfg = null;
const sMsg = (id, text, cls) => { const el = document.getElementById(id); if (el) { el.textContent = text; el.className = "msg " + (cls || ""); } };
function statusHtml() {
  if (!key) return '<div class="card grp st"><b>Reminder status</b><p class="warn">Sync is off. The server does not know about your reminders, so push, Telegram and email cannot be sent. Only the in-app alarm rings, and only while the app is open.</p></div>';
  const c = cfg;
  if (!c) return '<div class="card grp st"><b>Reminder status</b><p class="hint">Checking the server…</p></div>';
  const o = O(), ago = (ts) => { const sec = Math.max(0, Math.round((c.now - ts) / 1000)); return sec < 90 ? sec + " s ago" : sec < 5400 ? Math.round(sec / 60) + " min ago" : Math.round(sec / 3600) + " h ago"; };
  const ok = (good, text) => '<div class="ln"><span class="' + (good ? "good" : "bad") + '">' + (good ? "✓" : "✗") + "</span>" + text + "</div>";
  const names = { push: "Push", alarm: "Alarm", tg: "Telegram", email: "Email", error: "Error" };
  let h = '<div class="card grp st"><b>Reminder status</b>' +
    ok(c.lastTick && c.now - c.lastTick < 3 * MIN, c.lastTick ? "Reminder clock last ran " + ago(c.lastTick) + (c.now - c.lastTick < 3 * MIN ? "" : ". It should run every minute.") : "Reminder clock has never run. In Cloudflare, open the Worker > Settings > Trigger Events and check a Cron Trigger (* * * * *) is listed.") +
    ok(c.pushDevices > 0, "Push and Alarm: " + (c.pushDevices ? c.pushDevices + " device" + (c.pushDevices === 1 ? "" : "s") + " registered" : "no device registered. Tap “Turn on push + alarm here” below.")) +
    ok(c.tgChat, "Telegram: " + (c.tgChat ? "linked" : c.tgToken ? "token saved, chat not linked" : "not set up")) +
    ok(c.resendKey && c.emailTo, "Email: " + (c.resendKey && c.emailTo ? "set to " + esc(c.emailTo) : "not set up")) +
    '<div class="ln"><span>•</span>' + c.queued + " reminder" + (c.queued === 1 ? "" : "s") + " queued" + (c.nextFire ? ", next " + fmtDay(c.nextFire, o, c.now) + " " + fmtTime(c.nextFire, o) : "") + "</div>";
  if ((c.sendLog || []).length) h += '<div class="swl">Recent deliveries</div>' + c.sendLog.map((l) => '<div class="ln sm"><span>' + fmtTime(l.at, o) + "</span><div><b>" + esc(l.title) + "</b><br>" +
    Object.keys(l.res || {}).map((k) => '<span class="' + (l.res[k] ? "bad" : "good") + '">' + (names[k] || k) + (l.res[k] ? " failed: " + esc(l.res[k]) : " sent") + "</span>").join("<br>") + "</div></div>").join("");
  return h + '<button class="btn ghost sm" style="margin-top:10px" data-a="cfgRefresh">Refresh</button></div>';
}
async function loadCfg() { if (!key) { cfg = null; return; } try { cfg = await api("/api/config"); } catch (e) {} }
function settingsBody() {
  const s = set(), perm = "Notification" in window ? Notification.permission : "unsupported";
  const c = cfg || {};
  return statusHtml() + '<details class="card grp"' + (key ? "" : " open") + "><summary>Sync between devices " + (key ? (dot === "err" ? "· key rejected" : "· connected") : "· off") + "</summary>" +
    '<p class="hint">Type the same key (your APP_KEY secret from Cloudflare) on your phone and laptop. Reminders need this to be on.</p>' +
    '<div class="r2" style="margin-top:8px"><input class="in" id="sKey" type="password" autocomplete="off" placeholder="Sync key" value="' + esc(key) + '"><button class="btn" style="flex:none" data-a="sKey">Save</button></div>' + (key ? '<div class="r2" style="margin-top:8px"><button class="btn ghost sm" data-a="syncNow">Sync now</button><button class="btn ghost sm" data-a="syncOff">Disconnect</button></div>' : "") + '<div class="msg" id="mKey"></div></details>' +

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
    '<p class="hint" style="margin-top:6px">One message a day with what is planned and what carried over. Clear the time to turn it off.</p>' +
    '<span class="lab" style="margin-top:12px">Quiet hours</span><div class="r2"><div><span class="hint">From</span><input class="in" type="time" data-s="quietFrom" value="' + esc(s.quietFrom || "") + '" aria-label="Quiet hours start"></div><div><span class="hint">To</span><input class="in" type="time" data-s="quietTo" value="' + esc(s.quietTo || "") + '" aria-label="Quiet hours end"></div></div>' +
    '<p class="hint" style="margin-top:6px">Reminders due in this window wait and arrive when it ends. Anything set as an Alarm still comes through. Clear both times to turn it off.</p></details>' +

    '<details class="card grp"><summary>My day and the timer</summary><div class="r2"><div><span class="lab">Day starts</span><input class="in" type="time" data-s="dayStart" value="' + esc(s.dayStart) + '"></div><div><span class="lab">Day ends</span><input class="in" type="time" data-s="dayEnd" value="' + esc(s.dayEnd) + '"></div></div>' +
    '<p class="hint" style="margin-top:6px">Sets the “left today” bar on the Today tab.</p><span class="lab" style="margin-top:12px">Chime while a timer runs</span><select class="in" data-s="chime">' + opts([[0, "Off"], [5, "Every 5 min"], [10, "Every 10 min"], [15, "Every 15 min"]], s.chime) + "</select></details>" +

    '<details class="card grp"><summary>Look and sound</summary><span class="lab">Theme</span><select class="in" data-s="theme">' + opts([["auto", "Match my device"], ["light", "Light"], ["dark", "Dark"]], s.theme) + "</select>" +
    '<span class="lab" style="margin-top:12px">Accent colour</span><div class="accents">' + ACCENTS.map((a) => { const open = topLevel() >= a[2], on = (s.accent || "teal") === a[0];
      return '<button class="acc" data-a="accent" data-v="' + a[0] + '"' + (open ? "" : " disabled") + ' aria-pressed="' + on + '" aria-label="' + a[1] + (open ? "" : ", unlocks at level " + a[2]) + '"><i style="background:' + a[3] + '"></i><span>' + a[1] + "</span><em>" + (open ? (on ? "In use" : "Unlocked") : "🔒 Level " + a[2]) + "</em></button>"; }).join("") + "</div>" +
    '<p class="hint" style="margin-top:6px">You are level ' + game().L + ". New colours unlock as you level up.</p>" +
    '<span class="lab" style="margin-top:12px">Sounds</span><select class="in" data-s="sound">' + opts([["1", "On"], ["", "Off"]], s.sound ? "1" : "") + "</select></details>" +

    '<details class="card grp"><summary>Bring in my Tally counter data</summary>' +
    '<p class="hint">Your tally tasks become habits here, with every past check-off and streak kept. Safe to run twice.</p>' +
    '<input class="in" id="sTu" type="url" style="margin-top:8px" placeholder="Old app address, e.g. https://tallycounter.you.workers.dev">' +
    '<input class="in" id="sTk" type="password" autocomplete="off" style="margin-top:8px" placeholder="Old app sync key">' +
    '<button class="btn" style="margin-top:8px" data-a="tallyFetch">Import</button>' +
    '<p class="hint" style="margin-top:12px">Or, if the old app never used sync: open it on your laptop, press F12, paste <code>copy(localStorage.getItem("tallyCounter.v1"))</code> into the Console, then paste the result here.</p>' +
    '<textarea class="in" id="sTj" style="margin-top:8px" placeholder="Paste tally data"></textarea><button class="btn ghost" style="margin-top:8px" data-a="tallyPaste">Import pasted data</button><div class="msg" id="mTally"></div></details>' +

    '<details class="card grp"><summary>Bring in my Foothold data</summary><p class="hint">In Foothold, open Done > Settings > “Copy a backup”, then paste it here. Tasks, steps, guesses, tracked time and “where you left off” notes come across. Example tasks are skipped. Safe to run twice.</p>' +
    '<textarea class="in" id="sFh" style="margin-top:8px" placeholder="Paste the Foothold backup"></textarea><button class="btn" style="margin-top:8px" data-a="footholdPaste">Import</button><div class="msg" id="mFh"></div></details>' +

    '<details class="card grp"><summary>Backup and reset</summary><div class="r2"><button class="btn ghost" data-a="exportData">Download backup</button><label class="btn ghost" style="cursor:pointer">Restore backup<input type="file" id="sFile" accept="application/json,.json" hidden></label></div><div class="r2" style="margin-top:12px"><button class="btn ghost sm" data-a="xpReset">Reset level and XP</button><button class="btn danger sm" data-a="erase">Erase everything</button></div><div class="msg" id="mBak"></div></details>';
}
async function openSettings() {
  openSheet("Settings", settingsBody(), null, "Close");
  await loadCfg();
  if (!$("#sheet").hidden && $("#sKey")) setBody(settingsBody());
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
// ---------- weekly review ----------
const weekStart = (back) => addDays(today(), -new Date(today() + "T00:00:00Z").getUTCDay() - 7 * back);
let rvBack = 0;
function reviewBody() {
  const o = O(), t = today(), now = Date.now(), ws = weekStart(rvBack), from = keyTs(ws, o), to = from + 7 * DAY;
  const L = logs().filter((l) => l.at >= from && l.at < to), tasks = L.filter((l) => l.k === "task"), hab = L.filter((l) => l.k === "habit"), mins = L.filter((l) => l.k === "focus").reduce((a, l) => a + (l.min || 0), 0), xp = L.reduce((a, l) => a + (l.xp || 0), 0);
  const chip = (v, l) => '<button class="chip" data-a="rvWeek" data-v="' + v + '" aria-pressed="' + (rvBack === v) + '">' + l + "</button>";
  let h = '<div class="chips">' + chip(0, "This week") + chip(1, "Last week") + '</div><p class="hint" style="margin-top:8px">' + fmtDay(from, o, now) + " to " + fmtDay(to - DAY, o, now) + "</p>";
  h += '<div class="stats" style="grid-template-columns:repeat(2,1fr)">' + [[tasks.length, "Tasks done"], [hab.length, "Habit check-offs"], [dur(mins), "Focused"], ["+" + xp, "XP earned"]].map((x) => '<div class="card stat"><b>' + x[0] + "</b><span>" + x[1] + "</span></div>").join("") + "</div>";
  // tasks done per day: one series, one colour
  const per = Array.from({ length: 7 }, (_, i) => tasks.filter((l) => dayKey(l.at, o) === addDays(ws, i)).length), mx = Math.max(...per, 1);
  h += '<div class="card vz"><div class="wkbars">' + per.map((n, i) => '<div class="wkb" title="' + WD[i] + ": " + n + '"><em>' + (n || "") + '</em><i style="height:' + Math.round((60 * n) / mx) + 'px"></i><span>' + WD[i][0] + "</span></div>").join("") + '</div><p class="hint">Tasks finished each day.</p></div>';
  h += '<div class="sec">Wins</div>';
  if (!tasks.length) h += '<p class="hint">' + (rvBack ? "No tasks were ticked off that week." : "Nothing ticked off yet this week. One small thing still counts.") + "</p>";
  else h += '<div class="card list">' + tasks.slice().sort((a, b) => b.at - a.at).slice(0, 12).map((l) => '<div class="hrow"><div class="rt"><div class="ti">' + esc(l.title) + '</div><div class="me">' + fmtDay(l.at, o, now) + "</div></div></div>").join("") + "</div>" + (tasks.length > 12 ? '<p class="hint" style="margin-top:6px">and ' + (tasks.length - 12) + " more.</p>" : "");
  const hs = habits();
  if (hs.length) {
    const days = Math.min(7, Math.max(1, Math.floor((Math.min(now, to - 1) - from) / DAY) + 1));
    h += '<div class="sec">Habits</div><div class="card vz">' + hs.map((x) => { let n = 0; for (let i = 0; i < 7; i++) if (habitDone(x, addDays(ws, i))) n++;
      return '<div class="vrow"><span>' + esc((x.icon ? x.icon + " " : "") + x.name) + '</span><i><b style="width:' + Math.round((100 * n) / days) + '%"></b></i><em>' + n + "/" + days + " days</em></div>"; }).join("") + "</div>";
  }
  const hist = all("hist").filter((x) => x.at >= from && x.at < to);
  if (hist.length) { let e = 0, a = 0; for (const x of hist) { e += x.est; a += x.actual; }
    h += '<div class="sec">Guess vs. tracked</div><p>Across ' + hist.length + (hist.length === 1 ? " task" : " tasks") + " this week, things took <b>" + (a / e).toFixed(1) + "×</b> your guess (" + dur(e) + " guessed, " + dur(a) + " tracked).</p>"; }
  if (!rvBack) {
    const late = items().filter((i) => i.kind === "task" && !i.done && i.at != null && i.at < startToday());
    if (late.length) h += '<div class="sec">Carried over</div><p>' + late.length + (late.length === 1 ? " task is" : " tasks are") + ' waiting from earlier days.</p><button class="btn ghost sm" style="margin-top:8px" data-a="rvLate">Move all to today</button>';
    const shelf = items().filter(onShelf).sort((a, b) => (a.shelfAt || 0) - (b.shelfAt || 0));
    h += '<div class="sec">Meaning to <span class="n">' + shelf.length + "</span></div>";
    if (!shelf.length) h += '<p class="hint">The shelf is empty.</p>';
    else h += '<div class="card list">' + shelf.map((i) => '<div class="hrow" style="flex-wrap:wrap"><div class="rt"><div class="ti">' + esc(i.title) + '</div><div class="me">' + waited(i) + '</div></div><div class="chips">' +
      [["today", "Today"], ["keep", "Keep"], ["drop", "Drop"]].map(([v, l]) => '<button class="chip" data-a="rvShelf" data-id="' + i.id + '" data-v="' + v + '">' + l + "</button>").join("") + "</div></div>").join("") + "</div>";
    const did = !!db.recs["wr-" + ws];
    h += '<div class="f"><button class="btn" style="width:100%" data-a="rvDone"' + (did ? " disabled" : "") + ">" + (did ? "Reviewed this week ✓" : "Finish review (+20 XP)") + "</button></div>";
  }
  return h;
}

// ---------- focus history and charts ----------
const focusName = (l) => { const r = db.recs[l.ref]; return r ? (r.icon ? r.icon + " " : "") + (r.title || r.name) : l.ref ? String(l.title || "").replace(/^Focused \d+ min:? ?/, "") || "Removed item" : "No specific task"; };
const focusTags = (l) => { const r = db.recs[l.ref]; return !r ? [] : r.type === "habit" ? (r.tag ? [tagKey(r.tag)] : []) : (r.tags || []).map(tagKey); };
function foLogBody() {
  const o = O(), now = Date.now(), L = logs().filter((l) => l.k === "focus").sort((a, b) => b.at - a.at);
  if (!L.length) return '<div class="empty">No sessions yet. Start a timer on the Now tab and it will be logged here.</div>';
  let h = '<p class="hint">' + L.length + " sessions, " + dur(L.reduce((a, l) => a + (l.min || 0), 0)) + " in total.</p>", day = "";
  for (const l of L.slice(0, 300)) {
    const k = dayKey(l.at, o);
    if (k !== day) {
      const same = L.filter((x) => dayKey(x.at, o) === k);
      h += (day ? "</div>" : "") + '<div class="sec">' + fmtDay(l.at, o, now) + ' <span class="n">' + same.length + (same.length === 1 ? " session · " : " sessions · ") + dur(same.reduce((a, x) => a + (x.min || 0), 0)) + '</span></div><div class="card list">';
      day = k;
    }
    h += '<div class="hrow"><div class="rt"><div class="ti">' + esc(focusName(l)) + '</div><div class="me">' + fmtTime(l.at - (l.min || 0) * MIN, o) + " to " + fmtTime(l.at, o) + " · +" + (l.xp || 0) + ' XP</div></div><b>' + (l.min || 0) + ' min</b><button class="x" data-a="foLogDel" data-id="' + l.id + '" aria-label="Delete this session">×</button></div>';
  }
  return h + "</div>" + (L.length > 300 ? '<p class="hint" style="margin-top:8px">Showing the latest 300.</p>' : "");
}
const vz = { range: "week", kind: "all", tag: "" };
function foVizBody() {
  const o = O(), t = today(), now = Date.now(), all = logs().filter((l) => l.k === "focus");
  const tags = [...new Set(all.flatMap(focusTags))].sort();
  if (vz.tag && !tags.includes(vz.tag)) vz.tag = "";
  let from, n, idx, lab, name;
  if (vz.range === "today") { from = startToday(); n = 24; idx = (l) => loc(l.at, o).getUTCHours(); lab = (i) => (i % 6 === 0 ? (i % 12 || 12) + (i < 12 ? "am" : "pm") : ""); name = (i) => (i % 12 || 12) + (i < 12 ? " am" : " pm") + " to " + ((i + 1) % 12 || 12) + ((i + 1) % 24 < 12 ? " am" : " pm"); }
  else if (vz.range === "week") { from = keyTs(addDays(t, -new Date(t + "T00:00:00Z").getUTCDay()), o); n = 7; idx = (l) => Math.floor((l.at - from) / DAY); lab = (i) => WD[i]; name = (i) => fmtDay(from + i * DAY, o, now); }
  else { const [y, m] = t.split("-").map(Number); from = keyTs(t.slice(0, 8) + "01", o); n = new Date(Date.UTC(y, m, 0)).getUTCDate(); idx = (l) => +dayKey(l.at, o).slice(8) - 1; lab = (i) => (i % 7 === 0 ? String(i + 1) : ""); name = (i) => i + 1 + " " + MO[m - 1]; }
  const to = vz.range === "today" ? from + DAY : vz.range === "week" ? from + 7 * DAY : from + n * DAY;
  const L = all.filter((l) => l.at >= from && l.at < to).filter((l) => { const r = db.recs[l.ref]; return (vz.kind === "all" || (vz.kind === "task" ? r && r.type === "item" : r && r.type === "habit")) && (!vz.tag || focusTags(l).includes(vz.tag)); });
  const bins = Array.from({ length: n }, () => ({ min: 0, c: 0 })), by = {}, byTag = {};
  let total = 0;
  for (const l of L) {
    const b = bins[Math.min(n - 1, Math.max(0, idx(l)))], m = l.min || 0, nm = focusName(l);
    b.min += m; b.c++; total += m; by[nm] = (by[nm] || 0) + m;
    for (const g of focusTags(l)) byTag[g] = (byTag[g] || 0) + m;
  }
  const chip = (a, v, l, on) => '<button class="chip" data-a="' + a + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(l) + "</button>";
  let h = '<div class="chips">' + [["today", "Today"], ["week", "This week"], ["month", "This month"]].map(([v, l]) => chip("vzRange", v, l, vz.range === v)).join("") + "</div>" +
    '<div class="chips" style="margin-top:8px">' + [["all", "Everything"], ["task", "Tasks"], ["habit", "Habits"]].map(([v, l]) => chip("vzKind", v, l, vz.kind === v)).join("") + "</div>" +
    (tags.length ? '<div class="chips scroll" style="margin-top:8px">' + chip("vzTag", "", "All tags", !vz.tag) + tags.map((g) => chip("vzTag", g, "#" + g, vz.tag === g)).join("") + "</div>" : "");
  const active = bins.filter((b) => b.min).length, unit = vz.range === "today" ? "hour" : "day";
  h += '<div class="vzhero"><b>' + dur(total) + "</b><span>" + L.length + (L.length === 1 ? " session" : " sessions") + (active > 1 ? " · about " + dur(total / active) + " per active " + unit : "") + "</span></div>";
  // One series, so one colour. Thin bars with rounded tops on a baseline; the tallest bar carries the only value label.
  const W = 320, H = 150, padL = 4, padB = 18, padT = 16, max = Math.max(...bins.map((b) => b.min), 1), slot = (W - padL * 2) / n, bw = Math.max(2, Math.min(26, slot - 2)), top = bins.findIndex((b) => b.min === max && b.min > 0);
  let bars = "";
  bins.forEach((b, i) => {
    const x = padL + i * slot + (slot - bw) / 2, bh = b.min ? Math.max(2, ((H - padB - padT) * b.min) / max) : 0, y = H - padB - bh, r = Math.min(4, bw / 2, bh);
    if (bh) bars += '<path class="vbar" d="M' + x.toFixed(1) + " " + (H - padB) + "V" + (y + r).toFixed(1) + "q0 -" + r + " " + r + " -" + r + "h" + (bw - 2 * r).toFixed(1) + "q" + r + " 0 " + r + " " + r + "V" + (H - padB) + 'z"/>';
    if (i === top) bars += '<text class="vval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + b.min + "</text>";
    if (lab(i)) bars += '<text class="vlab" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + lab(i) + "</text>";
    bars += '<rect class="vhit" x="' + (padL + i * slot).toFixed(1) + '" y="0" width="' + slot.toFixed(1) + '" height="' + (H - padB) + '" data-tip="' + esc(name(i) + ": " + (b.min ? dur(b.min) + ", " + b.c + (b.c === 1 ? " session" : " sessions") : "nothing logged")) + '" tabindex="0"/>';
  });
  h += '<div class="card vz"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Minutes focused per ' + unit + '"><line class="vgrid" x1="0" x2="' + W + '" y1="' + padT + '" y2="' + padT + '"/><line class="vbase" x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '"/>' + bars +
    '</svg><p class="hint" id="vzTip">' + (total ? "Tap a bar for its numbers. Minutes per " + unit + "." : "Nothing logged for this view yet.") + "</p></div>";
  const table = (title, obj) => {
    const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8), mx = rows.length ? rows[0][1] : 1;
    return rows.length ? '<div class="sec">' + title + '</div><div class="card vz">' + rows.map(([k, v]) => '<div class="vrow"><span>' + esc(k) + '</span><i><b style="width:' + Math.max(2, Math.round((100 * v) / mx)) + '%"></b></i><em>' + dur(v) + "</em></div>").join("") + "</div>" : "";
  };
  return h + table("By task or habit", by) + table("By tag", Object.fromEntries(Object.entries(byTag).map(([k, v]) => ["#" + k, v])));
}
function importFoothold(d) {
  if (!d || !Array.isArray(d.tasks) || !d.settings) throw new Error("not a backup");
  const o = O(), t = today();
  let n = 0;
  for (const x of d.tasks) {
    const id = "f-" + x.id;
    if (x.example || !x.id || db.recs[id]) continue;
    const dk = (x.wake && x.wake > t ? x.wake : x.due) || (x.bucket === "today" ? t : "");
    const rep = x.repeat === "daily" ? { f: "d", n: 1 } : x.repeat === "weekdays" ? { f: "w", n: 1, days: [1, 2, 3, 4, 5] } : x.repeat === "weekly" ? { f: "w", n: 1 } : null;
    put(newItem({ id, title: String(x.title || "Untitled"), subs: (x.steps || []).map((y) => ({ id: uid(), t: String(y.text || ""), d: y.done ? 1 : 0 })), est: +x.est || 0, spent: +x.spent || 0, left: String(x.note || ""),
      at: dk ? keyTs(dk, o) : null, allDay: true, rep, done: x.doneAt || null, created: x.createdAt || Date.now(), rem: [] }));
    n++;
  }
  for (const h of d.history || []) { const id = "fh-" + h.at; if (h.at && h.est && !db.recs[id]) put({ id, type: "hist", title: String(h.title || ""), est: +h.est, actual: +h.actual || 1, at: h.at }); }
  const s = set(), fs = d.settings;
  put({ ...s, dayStart: fs.dayStart || s.dayStart, dayEnd: fs.dayEnd || s.dayEnd, chime: fs.check != null ? +fs.check : s.chime });
  return n;
}
function entriesBody() {
  const es = all("entry").sort((a, b) => b.at - a.at), o = O();
  if (!es.length) return '<div class="empty">Nothing saved yet. Use Save on the tap counter to keep a count here.</div>';
  return '<div class="card list">' + es.map((e) => '<div class="hrow"><div class="rt"><div class="ti">' + esc(e.name) + '</div><div class="me">' + fmtDay(e.at, o, Date.now()) + ", " + fmtTime(e.at, o) + (e.detail ? " · " + esc(e.detail) : "") +
    '</div></div><b style="font-size:20px">' + e.total + '</b><button class="x" data-a="entryDel" data-id="' + e.id + '" aria-label="Delete entry">×</button></div>').join("") + "</div>";
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
      icon: firstGrapheme(c.icon === undefined ? suggestIcons(c.name)[0] || "" : c.icon), freq, done: dn, rems: ex ? habitTimes(ex) : [], remCh: ex ? ex.remCh : [], ord: ex ? ex.ord : base + i, created: Date.parse(c.createdAt) || Date.now() });
  });
  for (const e of Array.isArray(d.log) ? d.log : []) { // the old app's "Saved entries"
    const id = "te-" + String(e.id || "");
    if (e.id && !db.recs[id]) put({ id, type: "entry", name: String(e.name || "Count"), total: +e.total || 0, detail: String(e.detail || ""), at: Date.parse(e.at) || Date.now() });
  }
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
function beep(freqs, len = 0.12, vol = 0.18, type = "sine", always = false) {
  if (!set().sound && !always) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * len;
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
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
    const won = ACCENTS.filter((a) => a[2] > levelBefore && a[2] <= g.L && a[2] > (set().maxL || 1)).map((a) => a[1]);
    if (g.L > (set().maxL || 1)) put({ ...set(), maxL: g.L });
    if ($("#sheet").hidden) openSheet("Level up", '<div class="lvup"><div class="big">🏆</div><h2 style="font-size:26px;margin:6px 0">Level ' + g.L + '</h2><p class="hint">You are now “' + TITLES[Math.min(g.L, TITLES.length) - 1] + "”. Small steps got you here.</p>" +
      (won.length ? '<p style="margin-top:10px;font-weight:650">🎨 New accent colour unlocked: ' + won.join(", ") + '</p><p class="hint">Pick it in Settings > Look and sound.</p>' : "") + "</div>", null, "Nice");
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
  if (!hasLayer("ring")) pushLayer("ring", () => ringStop(true));
  clearInterval(ringT);
  // Full volume and a harsher tone, so it is as loud as the phone's media volume allows.
  const buzz = () => { beep([880, 1175, 880, 1175, 880, 1175], 0.2, 1, "square", true); if (navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 500]); };
  buzz(); ringT = setInterval(buzz, 1500);
  setTimeout(() => { if (ringRec === rec) clearInterval(ringT); }, 5 * MIN);
}
function ringStop(fromBack) { clearInterval(ringT); ringRec = null; $("#ring").hidden = true; if (navigator.vibrate) navigator.vibrate(0); if (fromBack !== true) dropLayer("ring"); }
// While the app is open, an "alarm" reminder rings here even with no internet.
function checkAlarms() {
  const now = Date.now(), s = set();
  let rung = {};
  try { rung = JSON.parse(lsGet("onward.rung")) || {}; } catch (e) {}
  for (const k in rung) if (now - rung[k] > DAY) delete rung[k];
  for (const r of [...items(), ...habits()]) {
    for (const f of fires(r, s, now)) {
      const k = f.key + f.at, hi = /:h(\d+)$/.exec(f.key);
      if (hi && ((r.done || {})[today()] || 0) >= habitNeed(r, +hi[1])) continue;
      if (f.ch.includes("alarm") && f.at <= now && !rung[k]) { rung[k] = now; lsSet("onward.rung", JSON.stringify(rung)); ring(r); return; }
    }
  }
}

// ================= event handlers =================
const A = {
  tab(el) { setTab(el.dataset.v); },
  settings: () => openSettings(),
  closeSheet: () => closeSheet(),
  cancelSheet() { ed = hd = ld = null; closeSheet(true); },
  toggle(el) { toggleTask(el.dataset.id, el); done(); },
  edit(el) { editItem(el.dataset.id); },
  qaAdd() {
    const inp = $("#qa"), text = inp.value.trim();
    if (!text) { editItem(null, ui.tab === "cal" ? { at: keyTs(ui.sel, O()) } : ui.tab === "tasks" && ui.filter === "shelf" ? { shelf: 1, rem: [] } : {}); return; }
    const f = ui.filter, ctx = ui.tab === "cal" ? { dk: ui.sel } : ui.tab === "tasks" ? { list: f.startsWith("list:") ? f.slice(5) : "", tag: f.startsWith("tag:") ? f.slice(4) : "", shelf: f === "shelf" } : {};
    const fields = quickFields(text, ctx);
    if (!fields.title) return;
    const old = Object.values(db.recs).filter((r) => r.type === "item" && String(r.title).toLowerCase() === fields.title.toLowerCase()).sort((a, b) => (b.u || 0) - (a.u || 0))[0];
    if (old) { // same name as before: start with the same list, tags, priority, estimate and steps
      if (!fields.list) fields.list = listOf(old) ? old.list : "";
      if (!fields.tags.length) fields.tags = [...(old.tags || [])];
      if (!fields.pri) fields.pri = old.pri || 0;
      Object.assign(fields, { est: old.est || 0, energy: old.energy || "", step: old.step || "", subs: (old.subs || []).map((x) => ({ id: uid(), t: x.t, d: 0 })) });
    }
    put(newItem(fields)); inp.value = ""; $("#qap").textContent = "";
    beep([660]); done(); $("#qa").focus();
  },
  pick() { if (pickNow()) setTab("focus", "fwd"); },
  questOpen(el) { const p = quest().picks[+el.dataset.i], r = p && db.recs[p.ref]; if (!r || r.del) return; if (p.t === "habit") { tickHabit(r.id, 1, el); done(); } else editItem(r.id); },
  questShuffle() {
    const q = quest(), was = JSON.stringify(q.picks);
    put({ ...q, rot: (q.rot || 0) + 1 });
    toast(JSON.stringify(quest().picks) === was ? "Nothing else to swap in right now." : "Swapped the unfinished quests."); done();
  },
  questTick(el) {
    const p = quest().picks[+el.dataset.i], r = p && db.recs[p.ref];
    if (!r || r.del) return;
    if (p.t === "habit") tickHabit(r.id, habitDone(r, today()) ? -1 : 1, el);
    else if (questState(p).ok) untickTask(r.id);
    else toggleTask(r.id, el);
    done();
  },
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
  ldColor(el) { ld.name = $("#sheet [data-f=name]").value; ld.color = el.dataset.v || el.value; setBody(ld.body()); },
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
  habitOpen(el) { if (ui.selecting) return A.hSelect(el); if (ui.tab === "habits") return editHabit(el.dataset.id); ui.hcal = el.dataset.id; ui.hmonth = today().slice(0, 7); setTab("habits", "fwd"); },
  hcal(el) { ui.hcal = el.dataset.v; render(); },
  hMonth(el) { const v = +el.dataset.v, [y, m] = ui.hmonth.split("-").map(Number); ui.hmonth = v ? new Date(Date.UTC(y, m - 1 + v, 1)).toISOString().slice(0, 7) : today().slice(0, 7); render(); },
  hSort() { ui.hSort = ui.hSort === "tag" ? "manual" : "tag"; lsSet("onward.hsort", ui.hSort); render(); },
  hFilter(el) { ui.hFilter = el.dataset.v; render(); },
  hGroup(el) { const k = el.dataset.v; ui.collapsed[k] = !ui.collapsed[k]; render(); },
  hSelMode() { ui.selecting = !ui.selecting; ui.selected = {}; if (ui.selecting) pushLayer("select", () => { ui.selecting = false; ui.selected = {}; render(); }); else dropLayer("select"); render(); },
  hSelect(el) { const id = el.dataset.id; if (ui.selected[id]) delete ui.selected[id]; else ui.selected[id] = 1; render(); },
  hSelAll() { const hs = habits().filter((h) => !ui.hFilter || tagKey(h.tag) === ui.hFilter), allOn = hs.every((h) => ui.selected[h.id]); ui.selected = {}; if (!allOn) for (const h of hs) ui.selected[h.id] = 1; render(); },
  hSelDel() {
    const prev = Object.keys(ui.selected).map((id) => db.recs[id]).filter(Boolean);
    for (const h of prev) del(h.id);
    ui.selecting = false; ui.selected = {}; dropLayer("select");
    toast("Deleted " + prev.length + (prev.length === 1 ? " habit." : " habits."), () => { for (const h of prev) put({ ...h, del: 0 }); });
    done();
  },
  dayCycle(el) { cycleDay(el.dataset.id, dayK, el); checkQuests(); setBody(dayBody()); },
  tapSave() {
    const s = set();
    openSheet("Save this count", '<input class="in title" id="eName" placeholder="Entry name" value="' + esc(s.tap.label || "") + '" autofocus><p class="hint" style="margin-top:8px">Count: ' + (s.tap.value || 0) +
      '</p><div class="f r2"><button class="btn ghost" data-a="tapSaveGo" data-v="0">Save</button><button class="btn" data-a="tapSaveGo" data-v="1">Save and reset</button></div>', null, "Cancel");
  },
  tapSaveGo(el) {
    const s = set(), name = $("#eName").value.trim() || s.tap.label || "Count";
    put({ id: "e" + uid(), type: "entry", name, total: s.tap.value || 0, at: Date.now() });
    if (el.dataset.v === "1") put({ ...s, tap: { ...s.tap, value: 0 } });
    closeSheet(true); toast("Saved “" + name + "”.");
  },
  entries() { openSheet("Saved entries", entriesBody(), null, "Close"); },
  entryDel(el) { del(el.dataset.id); setBody(entriesBody()); },
  habitNew: () => editHabit(),
  habitEdit: (el) => editHabit(el.dataset.id),
  habitDay(el) {
    const { single } = calPick(), k = el.dataset.v;
    if (single) { cycleDay(single.id, k, el); return done(); }
    dayK = k;
    openSheet(fmtDay(keyTs(k, O()), O(), Date.now()), dayBody(), null, "Close");
  },
  hdColor(el) { readHd(); hd.color = el.dataset.v || el.value; setBody(hdBody()); },
  hdIcon(el) { readHd(); hd.icon = el.dataset.v; hd._iconSet = 1; setBody(hdBody()); },
  hdEmoji() { readHd(); hd._em = !hd._em; setBody(hdBody()); },
  hdTag(el) { readHd(); hd.tag = el.dataset.v; setBody(hdBody()); },
  hdFreq(el) { readHd(); hd.freq = Math.min(50, Math.max(1, (hd.freq || 1) + +el.dataset.v)); hd.rems = hd.rems.slice(0, hd.freq); setBody(hdBody()); },
  hdRemAdd() { readHd(); const last = hd.rems[hd.rems.length - 1], h = last ? Math.min(23, +last.split(":")[0] + 3) : 9; hd.rems.push(pad(h) + ":00"); if (!(hd.remCh || []).length) hd.remCh = ["push"]; setBody(hdBody()); },
  hdRemDel(el) { readHd(); hd.rems.splice(+el.dataset.i, 1); setBody(hdBody()); },
  hdClear() { const id = hd.id, n = (db.recs[id].done || {})[today()] || 0; for (let i = 0; i < n; i++) tickHabit(id, -1); hd.done = { ...(db.recs[id].done || {}) }; toast(n ? "Today cleared for this habit." : "Nothing to clear today."); },
  hdCh(el) { readHd(); const c = el.dataset.v; hd.remCh = (hd.remCh || []).includes(c) ? hd.remCh.filter((x) => x !== c) : [...(hd.remCh || []), c]; setBody(hdBody()); },
  hdDel() { const id = hd.id; hd = null; closeSheet(true); del(id); done(); },
  hdMove(el) {
    readHd();
    const hs = habits(), i = hs.findIndex((h) => h.id === hd.id), j = i + +el.dataset.v;
    if (i < 0 || j < 0 || j >= hs.length) return;
    [hs[i], hs[j]] = [hs[j], hs[i]];
    hs.forEach((h, n) => { if (h.id === hd.id) hd.ord = n; else if (h.ord !== n) put({ ...db.recs[h.id], ord: n }); });
    toast("Moved.");
  },
  tap(el) {
    const s = set(), v = +el.dataset.v, lab = $("#tapLabel") ? $("#tapLabel").value : s.tap.label;
    put({ ...s, tap: { label: lab, value: v === 0 ? 0 : Math.max(0, (s.tap.value || 0) + v) } });
    if (v === 1) { beep([700], 0.05); if (navigator.vibrate) navigator.vibrate(10); }
    render();
  },
  foStart(el) { foStart(el.dataset.v === "sw" ? "sw" : +el.dataset.v, !!el.dataset.s); render(); },
  foCustom() {
    const n = Math.floor(+$("#foCustom").value);
    if (!(n >= 1 && n <= 600)) return toast("Type a length between 1 and 600 minutes.");
    $("#foCustom").value = ""; foStart(n); render();
  },
  foPause() {
    if (fo.sw) { if (fo.start) { fo.acc = swElapsed(); fo.start = 0; wakeOff(); } else { fo.start = Date.now(); wakeOn(); } }
    else if (fo.end) { fo.left = fo.end - Date.now(); fo.end = 0; wakeOff(); } else { fo.end = Date.now() + fo.left; fo.left = 0; wakeOn(); }
    saveFo(); render();
  },
  foStop: () => foFinish(true),
  foReset() { fo = null; saveFo(); wakeOff(); document.title = "Onward"; toast("Timer reset. Nothing was logged."); render(); },
  foClear() { fo = null; saveFo(); render(); },
  nwPick() { pickNow(); render(); },
  nwAnother() { pickNow(); render(); },
  nwSet(el) { np.skip = []; setNow(el.dataset.id, ""); render(); },
  nwEdit() { editItem(nw.id); },
  nwClose() { np.panel = ""; np.stuck = ""; render(); },
  nwFirst() { const v = $("#nwFirst").value.trim(), it = nowTask(); if (!v || !it) return; put({ ...it, subs: [{ id: uid(), t: v, d: 0 }] }); render(); },
  nwOne() { const it = nowTask(); if (it) put({ ...it, subs: [{ id: uid(), t: it.title, d: 0 }] }); render(); },
  nwAdd() { const el = $("#nwAdd"), v = el.value.trim(), it = nowTask(); if (!v || !it) return; el.value = ""; put({ ...it, subs: [...(it.subs || []), { id: uid(), t: v, d: 0 }] }); render(); },
  nwStepDone(el) {
    const it = nowTask(); if (!it) return;
    const subs = (it.subs || []).map((x) => ({ ...x })), i = subs.findIndex((x) => !x.d), before = game().L;
    let text = "";
    if (i >= 0) { subs[i].d = 1; text = subs[i].t; } else if (it.step) { subs.push({ id: uid(), t: it.step, d: 1 }); text = it.step; } else return;
    put({ ...it, subs, step: i < 0 ? "" : it.step });
    put({ id: "l" + uid(), type: "log", k: "step", ref: it.id, title: text, at: Date.now(), xp: 2 });
    if (fo && fo.ended) { fo = null; saveFo(); }
    celebrate(2, el, before, false); done();
  },
  nwFinish(el) { const id = nw.id; if (running()) foFinish(true, true); toggleTask(id, el); nw = { id: "", why: "" }; saveNw(); np.skip = []; done(); },
  nwShrink() { openShrink("What is a smaller first piece of this?"); render(); const e = $("#nwShrink"); if (e) e.focus(); },
  nwShrinkGo() {
    const v = $("#nwShrink").value.trim(), it = nowTask(); if (!v || !it) return;
    const subs = (it.subs || []).slice(), i = subs.findIndex((x) => !x.d);
    if (!subs.length && it.step) subs.push({ id: uid(), t: it.step, d: 0 });
    subs.splice(i < 0 ? 0 : i, 0, { id: uid(), t: v, d: 0 });
    put({ ...it, subs, step: "" }); np.panel = ""; np.stuck = ""; render();
  },
  nwPark() { np.panel = "park"; render(); const e = $("#nwPark"); if (e) e.focus(); },
  nwParkGo() {
    const it = nowTask(), v = $("#nwPark").value.trim(); if (!it) return;
    if (running()) foFinish(true, true);
    put({ ...db.recs[it.id], left: v }); np.skip = [it.id]; np.panel = ""; nw = { id: "", why: "" }; saveNw(); fo = null; saveFo();
    toast("Parked: " + it.title + ". It will be here when you come back."); render();
  },
  nwStuck() { np.panel = "stuck"; np.stuck = ""; render(); },
  nwReason(el) { const r = STUCK[el.dataset.v]; if (r.go) { r.go(); render(); const e = $("#nwShrink"); if (e) e.focus(); } else { np.stuck = el.dataset.v; render(); } },
  nwTactic() { const r = STUCK[np.stuck]; np.panel = ""; np.stuck = ""; r.act(); render(); },
  nwGuess(el) { const it = nowTask(); if (it) put({ ...it, est: +el.dataset.v }); render(); },
  nwGuessC() {
    const el = $("#nwGuessN"), n = Math.floor(+el.value), it = nowTask();
    if (!(n >= 1 && n <= 6000)) return toast("Type your guess in minutes.");
    el.value = ""; if (it) put({ ...it, est: n }); render();
  },
  peEdit(el) { ui.pe = ui.pe === el.dataset.k ? "" : el.dataset.k; render(); },
  peDel(el) { const k = el.dataset.k; put({ ...set(), [k]: presets(k).filter((n) => n !== +el.dataset.v) }); render(); },
  peAdd(el) {
    const k = el.dataset.k, inp = document.getElementById(el.dataset.i), n = Math.floor(+inp.value);
    if (!(n >= 1 && n <= 600)) return toast("Type a length between 1 and 600 minutes.");
    inp.value = ""; put({ ...set(), [k]: [...new Set([...presets(k), n])].sort((a, b) => a - b) }); render();
    const again = document.getElementById(el.dataset.i); if (again) again.focus();
  },
  async aiSteps() { await nowAi("steps"); },
  async aiSmaller() { await nowAi("smaller"); },
  aiToggle(el) { const x = np.ai.steps[+el.dataset.i]; x.on = !x.on; render(); },
  aiAdd() {
    const it = nowTask(), a = np.ai, add = a.steps.filter((x) => x.on).map((x) => ({ id: uid(), t: x.t, d: 0 }));
    if (!it || !add.length) return;
    const subs = (it.subs || []).slice();
    if (a.kind === "smaller") { const i = subs.findIndex((x) => !x.d); if (!subs.length && it.step) subs.push({ id: uid(), t: it.step, d: 0 }); subs.splice(i < 0 ? 0 : i, 0, ...add); }
    else subs.push(...add);
    put({ ...it, subs, step: a.kind === "smaller" ? "" : it.step }); np.panel = ""; np.ai = null;
    toast("Added " + add.length + (add.length === 1 ? " step." : " steps.")); render();
  },
  async edAi() {
    readForm();
    const it = ed.it, id = it.id;
    if (!it.title.trim()) return sMsg("edAiMsg", "Give the task a name first.", "bad");
    sMsg("edAiMsg", "✨ Thinking of small steps…");
    try {
      const r = await aiAsk({ kind: "steps", title: it.title, notes: it.notes, steps: it.subs.map((x) => x.t) });
      if (!ed || ed.it.id !== id) return;
      readForm(); for (const t of r.steps) ed.it.subs.push({ id: uid(), t, d: 0 });
      setBody(edBody()); sMsg("edAiMsg", "Added " + r.steps.length + " suggested steps. Remove any you don’t want.", "ok");
    } catch (e) { sMsg("edAiMsg", e.message, "bad"); }
  },
  edIcon(el) { readForm(); ed.it.icon = el.dataset.v; setBody(edBody()); },
  async edIconAi() {
    readForm();
    const id = ed.it.id;
    if (!ed.it.title.trim()) return;
    $("#edSug").innerHTML = '<span class="hint">✨ Thinking…</span>';
    try { const r = await aiAsk({ kind: "icons", what: "task", title: ed.it.title }); if (!ed || ed.it.id !== id) return; readForm(); ed.ai = r.icons; setBody(edBody()); }
    catch (e) { if (ed && $("#edSug")) $("#edSug").innerHTML = '<span class="hint">' + esc(e.message) + "</span>"; }
  },
  async hdIconAi() {
    readHd();
    const id = hd.id;
    if (!hd.name) return;
    $("#hdSug").innerHTML = '<span class="hint">✨ Thinking…</span>';
    try { const r = await aiAsk({ kind: "icons", what: "habit", title: hd.name }); if (!hd || hd.id !== id) return; readHd(); hd._ai = r.icons; setBody(hdBody()); }
    catch (e) { if (hd && $("#hdSug")) $("#hdSug").innerHTML = '<span class="hint">' + esc(e.message) + "</span>"; }
  },
  review() { rvBack = 0; openSheet("Weekly review", reviewBody(), null, "Close"); },
  rvWeek(el) { rvBack = +el.dataset.v; setBody(reviewBody()); },
  rvLate() { A.lateToday(); setBody(reviewBody()); },
  rvShelf(el) {
    const it = db.recs[el.dataset.id], v = el.dataset.v;
    if (v === "today") put({ ...it, shelf: 0, at: startToday(), allDay: true });
    else if (v === "keep") { put({ ...it, askAt: Date.now() }); toast("Kept on the shelf."); }
    else { del(it.id); toast("Let go. That was a decision, not a failure.", () => { put({ ...it, del: 0 }); if ($("#sheet .shb")) setBody(reviewBody()); }); }
    setBody(reviewBody());
  },
  rvDone(el) {
    const id = "wr-" + weekStart(0), before = game().L;
    if (db.recs[id]) return;
    put({ id, type: "log", k: "bonus", title: "Weekly review", at: Date.now(), xp: 20 });
    celebrate(20, el, before); closeSheet(true); toast("Review done. +20 XP");
  },
  foLog() { openSheet("Focus sessions", foLogBody(), null, "Close"); },
  foLogDel(el) { del(el.dataset.id); setBody(foLogBody()); },
  foViz() { openSheet("Minutes focused", foVizBody(), null, "Close"); },
  vzRange(el) { vz.range = el.dataset.v; setBody(foVizBody()); },
  vzKind(el) { vz.kind = el.dataset.v; setBody(foVizBody()); },
  vzTag(el) { vz.tag = el.dataset.v; setBody(foVizBody()); },
  xpReset(el) {
    if (!el.dataset.armed) { el.dataset.armed = "1"; el.textContent = "Tap again to go back to level 1"; return; }
    const s = set(), prev = s.xpOff || 0, total = logs().reduce((a, l) => a + (l.xp || 0), 0);
    put({ ...s, xpOff: total, maxL: topLevel() }); closeSheet(true); // colours already unlocked stay unlocked
    toast("Level and XP reset. Your streak and history are kept.", () => put({ ...set(), xpOff: prev }));
  },
  dump() { openSheet("Brain dump", '<p class="hint" style="margin-bottom:8px">Write down whatever is taking up space in your head. Sorting comes later. Everything lands in your Inbox.</p>' + dumpForm(), null, "Close"); const e = $("#dumpText"); if (e) e.focus(); },
  dumpGo() {
    const lines = $("#dumpText").value.split(/\n+/).map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    for (const l of lines) put(newItem({ title: l }));
    if (!$("#sheet").hidden) closeSheet(true);
    toast("Added " + lines.length + (lines.length === 1 ? " task" : " tasks") + " to your Inbox."); done();
  },
  // editor
  edKind(el) { readForm(); ed.it.kind = el.dataset.v; setBody(edBody()); },
  edDk(el) { readForm(); ed.dk = el.dataset.v; ed.it.shelf = 0; if (!ed.dk) ed.tm = ""; setBody(edBody()); },
  edSkip() {
    const id = ed.it.id, o = O(), now = Date.now();
    closeSheet(); // keeps any edits made so far
    const it = db.recs[id], at = it ? skipTarget(it) : null;
    if (at == null) return;
    let next;
    if (it.kind === "event") { put({ ...it, skip: [...(it.skip || []), dayKey(at, o)] }); next = occFrom(db.recs[id], o, now); }
    else {
      next = step(at, it.rep, o);
      for (let g = 0; repSkipped(it, next, o) && g < 400; g++) next = step(next, it.rep, o);
      if (repOver(it, next, o)) { put({ ...it, done: now }); next = null; } else put({ ...it, at: next, subs: (it.subs || []).map((x) => ({ ...x, d: 0 })) });
    }
    toast("Skipped " + fmtDay(at, o, now) + (next != null ? ". Next: " + fmtDay(next, o, now) + "." : ". That was the last one."), () => put({ ...it }));
    done();
  },
  edListAdd() {
    const name = $("#edNewList").value.trim();
    if (!name) return;
    readForm();
    const same = lists().find((l) => l.name.toLowerCase() === name.toLowerCase());
    ed.it.list = same ? same.id : put({ id: uid(), type: "list", name, color: COLORS[lists().length % COLORS.length], ord: Date.now() }).id;
    ed.newList = false; setBody(edBody());
  },
  edShelf() { readForm(); ed.it.shelf = 1; ed.dk = ""; ed.tm = ""; ed.rs = ""; ed.it.rem = []; setBody(edBody()); },
  shToday(el) { const it = db.recs[el.dataset.id]; put({ ...it, shelf: 0, at: startToday(), allDay: true }); shelfAnswered(); toast("On today’s list. One small step is enough."); done(); },
  shNo(el) { put({ ...db.recs[el.dataset.id], offAt: today() }); shelfAnswered(); toast("No problem. It will wait."); render(); },
  shKeep(el) { put({ ...db.recs[el.dataset.id], offAt: today(), askAt: Date.now() }); shelfAnswered(); toast("Kept. It stays on the shelf."); render(); },
  shDrop(el) { const prev = db.recs[el.dataset.id]; del(prev.id); shelfAnswered(); toast("Let go. That was a decision, not a failure.", () => put({ ...prev, del: 0 })); done(); },
  shSmall(el) {
    const it = db.recs[el.dataset.id];
    put({ ...it, shelf: 0, at: startToday(), allDay: true, askAt: Date.now() }); shelfAnswered();
    np.skip = []; setNow(it.id, "");
    // With no steps yet, Now already asks for a first tiny step; otherwise open "make it smaller".
    if ((it.subs || []).length || it.step) openShrink("What is a smaller first piece of this?");
    setTab("focus", "fwd");
    const e = $("#nwShrink") || $("#nwFirst"); if (e) e.focus();
  },
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
      for (let g = 0; syncing && g < 60; g++) await new Promise((r) => setTimeout(r, 150));
      for (const id in db.recs) db.dirty[id] = 1; // first connect: offer everything on this device to the server
      db.rev = 0; if (!db.recs.settings) put(set());
      await sync(); sMsg("mKey", "Connected. This device is now in sync.", "ok");
      cfg = await api("/api/config"); setBody(settingsBody());
    } catch (e) { setDot("err"); sMsg("mKey", e.status === 401 ? "That key was not accepted." : e.message, "bad"); }
  },
  accent(el) { put({ ...set(), accent: el.dataset.v }); applyTheme(); setBody(settingsBody()); render(); },
  pushOn: () => pushOn().then(loadCfg),
  async cfgRefresh() { await sync(); await loadCfg(); if ($("#sKey")) setBody(settingsBody()); },
  async syncNow() { sMsg("mKey", "Syncing…"); await sync(); sMsg("mKey", dot === "on" ? "Up to date." : "Could not reach the server.", dot === "on" ? "ok" : "bad"); },
  syncOff() { key = ""; lsSet("onward.key", ""); cfg = null; setDot(""); setBody(settingsBody()); sMsg("mKey", "Disconnected. Your data stays on this device.", ""); },
  erase(el) {
    if (!el.dataset.armed) { el.dataset.armed = "1"; el.textContent = "Tap again to erase everything, on every synced device"; return; }
    for (const r of Object.values(db.recs)) if (!r.del && r.id !== "settings") del(r.id);
    put({ ...DEF, tap: { label: "", value: 0 } }); applyTheme();
    fo = null; saveFo(); nw = { id: "", why: "" }; saveNw(); closeSheet(true); toast("Everything was erased.");
  },
  async test(el) {
    if (!key) return sMsg("mTest", "Connect sync first.", "bad");
    sMsg("mTest", "Sending…");
    try { const r = await api("/api/test", { ch: el.dataset.v }); sMsg("mTest", r.error ? "Did not send: " + r.error : "Sent. It should arrive within a few seconds.", r.error ? "bad" : "ok"); loadCfg(); }
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
  footholdPaste() {
    try { const n = importFoothold(JSON.parse($("#sFh").value)); sMsg("mFh", "Imported " + n + (n === 1 ? " task." : " tasks."), "ok"); }
    catch (e) { sMsg("mFh", "That text is not a Foothold backup. Paste the whole thing you copied.", "bad"); }
  },
  exportData() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "onward", at: Date.now(), recs: Object.values(db.recs) })], { type: "application/json" }));
    a.download = "onward-backup-" + today() + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};
const C = {
  hdColor: (el) => A.hdColor(el),
  ldColor: (el) => A.ldColor(el),
  redraw() { readForm(); setBody(edBody()); },
  edEst(el) { readForm(); ed.estC = el.value === "c"; setBody(edBody()); const n = $("#edEstN"); if (n) n.focus(); },
  edList(el) { readForm(); ed.newList = el.value === "__new"; setBody(edBody()); const n = $("#edNewList"); if (n) n.focus(); },
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
    const k = el.dataset.s, v = k === "defOff" || k === "chime" ? +el.value : k === "sound" ? !!el.value : el.value;
    put({ ...set(), [k]: v }); if (k === "theme") applyTheme();
  }
  if (el.id === "tapLabel") { const s = set(); put({ ...s, tap: { ...s.tap, label: el.value } }); }
  if (el.id === "foRef") ui.foRef = el.value;
  if (el.id === "sFile" && el.files[0]) el.files[0].text().then((t) => {
    const d = JSON.parse(t);
    if (!d || d.app !== "onward" || !Array.isArray(d.recs)) throw new Error("not a Onward backup");
    for (const r of d.recs) if (r && r.id && r.type && (!db.recs[r.id] || db.recs[r.id].u < r.u)) put({ ...r });
    sMsg("mBak", "Restored " + d.recs.length + " records.", "ok");
  }).catch((err) => sMsg("mBak", "Could not restore: " + err.message, "bad"));
});
document.addEventListener("toggle", (e) => { if (e.target.id === "allSteps") ui.stepsOpen = e.target.open; }, true);
document.addEventListener("input", (e) => {
  if (e.target.id === "qa") $("#qap").textContent = quickPreview(e.target.value);
  if (e.target.id === "q") { ui.q = e.target.value; render(); }
  if (e.target.id === "hdName" && hd) { hd.name = e.target.value; $("#hdSug").innerHTML = sugHtml(); }
  if (ed && e.target.dataset.f === "title" && $("#edSug")) { ed.it.title = e.target.value; $("#edSug").innerHTML = edSugHtml(); }
});
document.addEventListener("keydown", (e) => {
  const el = e.target;
  if (e.key === "Enter" && el.id === "qa") { e.preventDefault(); A.qaAdd(); }
  else if (e.key === "Enter" && el.id === "subNew") { e.preventDefault(); A.subAdd(); }
  else if (e.key === "Enter" && (el.id === "hdName" || (el.dataset && el.dataset.f === "title"))) { e.preventDefault(); closeSheet(); }
  else if (e.key === "Enter" && { nwFirst: 1, nwAdd: 1, nwShrink: 1, nwPark: 1 }[el.id]) { e.preventDefault(); A[{ nwFirst: "nwFirst", nwAdd: "nwAdd", nwShrink: "nwShrinkGo", nwPark: "nwParkGo" }[el.id]](); }
  else if (e.key === "Enter" && el.id === "edNewList") { e.preventDefault(); A.edListAdd(); }
  else if (e.key === "Enter" && (el.id === "foCustom" || el.id === "nwGuessN")) {
    e.preventDefault();
    const k = el.id === "foCustom" ? "timers" : "guesses";
    if (ui.pe === k) A.peAdd({ dataset: { k, i: el.id } }); else A[el.id === "foCustom" ? "foCustom" : "nwGuessC"]();
  }
  else if (e.key === "Enter" && el.id === "eName") { e.preventDefault(); A.tapSaveGo({ dataset: { v: "0" } }); }
  else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && el.classList && el.classList.contains("grip")) { e.preventDefault(); moveHabit(el.dataset.id, e.key === "ArrowUp" ? -1 : 1); }
  else if ((e.key === "Enter" || e.key === " ") && el.getAttribute && el.getAttribute("role") === "button") { e.preventDefault(); el.click(); }
  else if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
  else if ((e.key === "n" || e.key === "/") && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && $("#sheet").hidden && $("#qa")) { e.preventDefault(); $("#qa").focus(); }
});

// ---------- drag a habit by its grip to reorder ----------
let drag = null;
function commitOrder(ids) { ids.forEach((id, n) => { const h = db.recs[id]; if (h && h.ord !== n) put({ ...h, ord: n }); }); }
function moveHabit(id, d) {
  const ids = habits().map((h) => h.id), i = ids.indexOf(id), j = i + d;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]]; commitOrder(ids); render();
  const g = $('.grip[data-id="' + id + '"]'); if (g) g.focus();
}
document.addEventListener("pointerdown", (e) => {
  const g = e.target.closest && e.target.closest(".grip");
  if (!g || drag) return;
  e.preventDefault();
  const row = g.closest(".hrow");
  try { g.setPointerCapture(e.pointerId); } catch (err) {}
  drag = { row, y: e.clientY, pid: e.pointerId };
  row.classList.add("dragging");
  if (navigator.vibrate) navigator.vibrate(8);
});
document.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  const row = drag.row, list = row.parentElement, main = $("#main"), r = main.getBoundingClientRect();
  let dy = e.clientY - drag.y;
  const next = row.nextElementSibling, prev = row.previousElementSibling;
  if (next && next.classList.contains("hrow") && dy > next.offsetHeight / 2) { list.insertBefore(next, row); drag.y += next.offsetHeight; dy -= next.offsetHeight; }
  else if (prev && prev.classList.contains("hrow") && dy < -prev.offsetHeight / 2) { list.insertBefore(row, prev); drag.y -= prev.offsetHeight; dy += prev.offsetHeight; }
  row.style.transform = "translateY(" + dy + "px)";
  // Nudge the page along when the finger nears the top or bottom edge.
  const edge = e.clientY < r.top + 50 ? -12 : e.clientY > r.bottom - 50 ? 12 : 0;
  if (edge) { const before = main.scrollTop; main.scrollTop += edge; drag.y -= main.scrollTop - before; }
});
function endDrag(e) {
  if (!drag || (e.pointerId != null && e.pointerId !== drag.pid)) return;
  const row = drag.row, ids = $$(".hrow", row.parentElement).map((x) => x.dataset.id);
  row.style.transform = ""; row.classList.remove("dragging");
  drag = null;
  commitOrder(ids); render();
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

// ---------- swipe a task: right to tick it off, left to move it to tomorrow ----------
function postpone(id) {
  const it = db.recs[id], o = O();
  if (!it || it.done) return;
  const tom = addDays(today(), 1), d = it.at != null ? loc(it.at, o) : null;
  put({ ...it, shelf: 0, at: d && !it.allDay ? keyTs(tom, o, d.getUTCHours(), d.getUTCMinutes()) : keyTs(tom, o), allDay: it.at == null ? true : it.allDay });
  toast("Moved to tomorrow.", () => put({ ...it }));
  done();
}
let rsw = null;
$("#main").addEventListener("touchstart", (e) => {
  const row = e.target.closest(".row.task");
  rsw = row && e.touches.length === 1 && $("#sheet").hidden ? { row, x: e.touches[0].clientX, y: e.touches[0].clientY, on: false, dx: 0 } : null;
}, { passive: true });
$("#main").addEventListener("touchmove", (e) => {
  if (!rsw) return;
  const c = e.touches[0], dx = c.clientX - rsw.x, dy = c.clientY - rsw.y;
  if (!rsw.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { rsw = null; return; } // it is a scroll
    if (Math.abs(dx) < 14) return;
    rsw.on = true; rsw.row.classList.add("swiping");
  }
  rsw.dx = dx;
  rsw.row.style.transform = "translateX(" + dx + "px)";
  rsw.row.dataset.sw = dx > 90 ? "done" : dx < -90 ? "later" : "";
}, { passive: true });
const endRowSwipe = (commit) => {
  if (!rsw) return;
  const { row, dx, on } = rsw;
  rsw = null;
  if (!on) return;
  row.classList.remove("swiping"); row.style.transform = ""; delete row.dataset.sw;
  if (!commit) return;
  if (dx > 90) { toggleTask(row.dataset.id, row.querySelector(".chk")); done(); }
  else if (dx < -90) postpone(row.dataset.id);
};
$("#main").addEventListener("touchend", () => endRowSwipe(true), { passive: true });
$("#main").addEventListener("touchcancel", () => endRowSwipe(false), { passive: true });

// ---------- swipe left or right to change section ----------
let sw = null;
$("#main").addEventListener("touchstart", (e) => {
  const t = e.target;
  sw = e.touches.length === 1 && $("#sheet").hidden && !drag && !ui.selecting && !t.closest(".chips.scroll, input, textarea, select, .grip, .row.task")
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}, { passive: true });
$("#main").addEventListener("touchend", (e) => {
  if (!sw) return;
  const c = e.changedTouches[0], dx = c.clientX - sw.x, dy = c.clientY - sw.y;
  sw = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
  const j = TABS.findIndex((t) => t[0] === ui.tab) + (dx < 0 ? 1 : -1);
  if (j >= 0 && j < TABS.length) setTab(TABS[j][0], dx < 0 ? "fwd" : "back");
}, { passive: true });

const showTip = (e) => { const el = e.target.closest && e.target.closest("[data-tip]"), out = $("#vzTip"); if (el && out) { out.textContent = el.dataset.tip; $$(".vhit.on").forEach((x) => x.classList.remove("on")); el.classList.add("on"); } };
document.addEventListener("pointerover", showTip);
document.addEventListener("focusin", showTip);
document.addEventListener("click", showTip);

// ================= boot =================
const topLevel = () => Math.max(game().L, set().maxL || 1); // the highest level ever reached, so a reset does not lock colours again
function applyTheme() {
  const s = set(), t = s.theme, root = document.documentElement;
  if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches), a = ACCENTS.find((x) => x[0] === s.accent);
  if (!a || a[0] === "teal") for (const v of ["--accent", "--accent-ink", "--soft"]) root.style.removeProperty(v);
  else { root.style.setProperty("--accent", dark ? a[4] : a[3]); root.style.setProperty("--accent-ink", dark ? "#0E1418" : "#FFFFFF"); root.style.setProperty("--soft", dark ? a[6] : a[5]); }
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { applyTheme(); render(); });
function openFromLink(id, alarm) {
  const r = db.recs[id];
  if (!r || r.del) return;
  if (alarm) ring(r); else if (r.type === "item") editItem(id); else { ui.hcal = id; setTab("habits"); }
}
applyTheme();
if (db.recs.settings && db.recs.settings.tzOff !== DEF.tzOff) put({ ...set(), tzOff: DEF.tzOff });
render();
window.addEventListener("pagehide", () => { if (saveT) flush(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (saveT) flush(); } else { sync(); render(); if (ticking()) wakeOn(); } });
window.addEventListener("online", sync);
setInterval(() => { if (!document.hidden) sync(); }, 60000);
setInterval(foTick, 500);
setInterval(checkAlarms, 10000);
let lastDay = today();
setInterval(() => {
  if (today() !== lastDay) { lastDay = today(); memo = null; render(); }
  const lab = $("#dayLab"); if (lab) { const dl = dayLeft(); lab.textContent = dl.label; $("#dayFill").style.width = dl.pct + "%"; }
}, 30000);
if (ticking()) wakeOn();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.sync) sync();
    if (d.open) sync().then(() => openFromLink(d.open, d.alarm));
  });
}
sync().then(loadCfg).then(() => {
  const p = new URLSearchParams(location.search);
  if (p.get("open")) openFromLink(p.get("open"), p.get("alarm"));
  // Long-press shortcuts on the app icon.
  const go = p.get("do");
  if (go === "add") editItem(null);
  else if (go === "timer") setTab("focus");
  else if (go === "dump") A.dump();
  // Text or a link shared to Onward from another app becomes an Inbox task straight away.
  const st = (p.get("title") || "").trim(), sx = (p.get("text") || "").trim(), su = (p.get("url") || "").trim();
  if (st || sx || su) {
    const lines = (sx || st || su).split(/\n+/).map((x) => x.trim()).filter(Boolean), link = su || ((sx.match(/https?:\/\/\S+/) || [])[0] || "");
    const title = (st && st !== link ? st : lines[0] || link).replace(/https?:\/\/\S+/g, "").trim().slice(0, 140) || link.slice(0, 140);
    const notes = [sx && sx !== title ? sx : "", link && !sx.includes(link) ? link : ""].filter(Boolean).join("\n");
    const it = put(newItem({ title, notes }));
    toast("Added to your Inbox: " + title.slice(0, 40), null); done(); editItem(it.id);
  }
  if (location.search) history.replaceState(null, "", "/");
});
