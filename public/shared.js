// Logic shared by the app (browser) and the Worker (server): dates, repeats,
// reminder times, completing a task, XP. Keeping it in one file means the phone,
// the laptop and the server always agree on when something is due.
//
// "Local" time uses a fixed UTC offset in minutes east of UTC (India = 330).
// The app saves the device's offset into settings.tzOff. There is no daylight
// saving handling, which is correct for India.

export const MIN = 60000, DAY = 86400000;
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const tz = (set) => (set && Number.isFinite(set.tzOff) ? set.tzOff : 330);
// A Date whose UTC fields read as local wall-clock time.
export const loc = (ts, off) => new Date(ts + off * MIN);
export const dayKey = (ts, off) => loc(ts, off).toISOString().slice(0, 10);
export function keyTs(key, off, h = 0, m = 0) {
  const [y, mo, d] = key.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, h, m) - off * MIN;
}
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const hm = (s, dflt) => {
  const p = String(s || dflt).split(":").map(Number);
  return [p[0] || 0, p[1] || 0];
};

export function fmtTime(ts, off) {
  const d = loc(ts, off);
  let h = d.getUTCHours();
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return h + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " " + ap;
}
export function fmtDay(ts, off, now) {
  const k = dayKey(ts, off), t = dayKey(now, off);
  if (k === t) return "Today";
  if (k === addDays(t, 1)) return "Tomorrow";
  if (k === addDays(t, -1)) return "Yesterday";
  const d = loc(ts, off);
  const yr = d.getUTCFullYear() !== loc(now, off).getUTCFullYear() ? " " + d.getUTCFullYear() : "";
  return WD[d.getUTCDay()] + " " + d.getUTCDate() + " " + MO[d.getUTCMonth()] + yr;
}
export function fmtWhen(it, off, now) {
  if (it.at == null) return "";
  return fmtDay(it.at, off, now) + (it.allDay ? "" : ", " + fmtTime(it.at, off));
}

// ---------- repeats ----------
// rep = { f: "d"|"w"|"m"|"y", n: every n, days: [0-6] for weekly, dom: day of month anchor }
export function step(ts, rep, off) {
  const d = loc(ts, off), n = Math.max(1, rep.n || 1);
  if (rep.f === "d") return ts + n * DAY;
  if (rep.f === "w") {
    const days = rep.days && rep.days.length ? rep.days : [d.getUTCDay()];
    for (let i = 1; i <= 7; i++) {
      if (days.includes((d.getUTCDay() + i) % 7)) {
        const wrapped = d.getUTCDay() + i >= 7; // crossed into a new week
        return ts + i * DAY + (wrapped ? (n - 1) * 7 * DAY : 0);
      }
    }
  }
  const dom = rep.dom || d.getUTCDate();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n * (rep.f === "y" ? 12 : 1);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(dom, last), d.getUTCHours(), d.getUTCMinutes()) - off * MIN;
}
// First occurrence strictly after `after`, always moving at least one step.
export function nextOcc(at, rep, off, after) {
  let cur = at, g = 0;
  do { cur = step(cur, rep, off); } while (cur <= after && g++ < 4000);
  return cur;
}
// Every occurrence start inside [from, to).
export function occurrences(it, off, from, to) {
  if (it.at == null) return [];
  if (!it.rep) return it.at >= from && it.at < to ? [it.at] : [];
  const out = [];
  let cur = it.at, g = 0;
  while (cur < to && g++ < 4000) {
    if (cur >= from) out.push(cur);
    cur = step(cur, it.rep, off);
  }
  return out;
}
export function repText(rep) {
  if (!rep) return "";
  const n = rep.n || 1;
  if (rep.f === "w" && rep.days && rep.days.length) {
    if (rep.days.length === 5 && [1, 2, 3, 4, 5].every((x) => rep.days.includes(x))) return "Weekdays";
    if (rep.days.length === 7) return "Daily";
    return (n > 1 ? "Every " + n + " weeks on " : "Weekly on ") + rep.days.slice().sort().map((x) => WD[x]).join(", ");
  }
  const unit = { d: "day", w: "week", m: "month", y: "year" }[rep.f];
  return n > 1 ? "Every " + n + " " + unit + "s" : { d: "Daily", w: "Weekly", m: "Monthly", y: "Yearly" }[rep.f];
}

// ---------- reminders ----------
// The moment reminders count back from. All-day items use the "all-day reminder time".
export function baseTime(at, allDay, set) {
  if (!allDay) return at;
  const o = tz(set), [h, m] = hm(set.alldayAt, "09:00");
  return keyTs(dayKey(at, o), o, h, m);
}
export function remText(r) {
  if (r.at != null) return "At a set time";
  const m = r.off || 0;
  if (m === 0) return "At time of event";
  if (m % 10080 === 0) return m / 10080 + (m === 10080 ? " week" : " weeks") + " before";
  if (m % 1440 === 0) return m / 1440 + (m === 1440 ? " day" : " days") + " before";
  if (m % 60 === 0) return m / 60 + (m === 60 ? " hour" : " hours") + " before";
  return m + " min before";
}
// Upcoming reminder moments for one record. Anything more than 2 minutes in the
// past is skipped, so editing an old task never re-sends an old reminder.
// Repeating events and habits return their next two occurrences so the chain
// never breaks.
export function fires(rec, set, now) {
  const o = tz(set), out = [], floor = now - 2 * MIN;
  if (!rec || rec.del) return out;
  if (rec.type === "item") {
    if (rec.done) return out;
    for (const r of rec.rem || []) {
      if (!r.ch || !r.ch.length) continue;
      const nag = rec.kind === "task" ? rec.nag || 0 : 0;
      if (r.at != null) { // a reminder at an exact moment works even with no due date
        if (r.at > floor) out.push({ key: rec.id + ":" + r.id, at: r.at, ch: r.ch, nag });
        continue;
      }
      if (rec.at == null) continue;
      const rolling = rec.kind === "event" && rec.rep;
      let occ = rec.at, found = 0, g = 0;
      while (g++ < 4000) {
        const at = baseTime(occ, rec.allDay, set) - (r.off || 0) * MIN;
        if (at > floor) { out.push({ key: rec.id + ":" + r.id, at, ch: r.ch, nag }); found++; }
        if (!rolling || found >= 2) break;
        occ = step(occ, rec.rep, o);
      }
    }
  } else if (rec.type === "habit") {
    if (rec.arch || !rec.remAt || !(rec.remCh || []).length) return out;
    const [h, m] = hm(rec.remAt, "09:00");
    let k = dayKey(now, o);
    for (let i = 0; i < 3 && out.length < 2; i++, k = addDays(k, 1)) {
      const at = keyTs(k, o, h, m);
      if (at > floor) out.push({ key: rec.id + ":h", at, ch: rec.remCh, nag: 0 });
    }
  }
  return out;
}

// ---------- completing + XP ----------
export const xpFor = (it) => 10 + 5 * (it.pri || 0) + ({ med: 5, high: 10 }[it.energy] || 0);

// Returns the task as it should be after being ticked off. A repeating task
// moves to its next date; a one-off task is marked done.
export function complete(it, now, set) {
  const o = tz(set), n = { ...it, u: now };
  if (it.rep && it.at != null) {
    const after = it.allDay ? Math.max(it.at, keyTs(dayKey(now, o), o) - 1) : Math.max(it.at, now);
    n.at = nextOcc(it.at, it.rep, o, after);
    n.subs = (it.subs || []).map((s) => ({ ...s, d: 0 }));
    n.cnt = (it.cnt || 0) + 1;
  } else n.done = now;
  return n;
}
// The log entry that records a completion (and carries its XP).
export function taskLog(it, now, set) {
  const o = tz(set);
  const late = it.at != null && it.at < keyTs(dayKey(now, o), o);
  return { id: "l" + uid(), type: "log", k: "task", ref: it.id, title: it.title, at: now, u: now,
    xp: xpFor(it) + (late ? 5 : 0), late: late ? 1 : 0, prev: it.rep ? it.at : null };
}
export function level(xp) {
  let L = 1;
  while (xp >= 50 * L * (L + 1)) L++;
  return { L, cur: xp - 50 * L * (L - 1), need: 100 * L };
}
