// Onward Worker: serves the app, syncs records between devices, and sends
// reminders (web push, Telegram, email) from a once-a-minute cron.
//
// Needs on the Cloudflare project:
//   DB       D1 database binding
//   APP_KEY  secret text: the passphrase you type into the app on each device
//   ASSETS   static assets binding (declared in wrangler.jsonc)
//   AI       Workers AI binding (declared in wrangler.jsonc), for step and icon suggestions
// Telegram and email details are entered inside the app (Settings) and stored
// in the database, so there is nothing else to configure here.

import { fires, complete, taskLog, habitNeed, quietUntil, waterDue, fmtTime, tz, dayKey, keyTs, MIN, DAY, uid, fmtWhen } from "../public/shared.js";

const enc = new TextEncoder();
const J = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- database ----------
let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch([
    "CREATE TABLE IF NOT EXISTS recs (id TEXT PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL, u INTEGER NOT NULL, rev INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS recs_rev ON recs (rev)",
    "CREATE TABLE IF NOT EXISTS rem (rk TEXT NOT NULL, orig INTEGER NOT NULL, rid TEXT NOT NULL, fire INTEGER NOT NULL, ch TEXT NOT NULL, nag INTEGER NOT NULL DEFAULT 0, nleft INTEGER NOT NULL DEFAULT 0, fired INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (rk, orig))",
    "CREATE INDEX IF NOT EXISTS rem_due ON rem (sent, fire)",
    "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, at INTEGER NOT NULL)",
  ].map((s) => env.DB.prepare(s)));
  ready = true;
}
async function kget(env, k) {
  const r = await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first();
  return r ? r.v : null;
}
const kset = (env, k, v) => env.DB.prepare(
  "INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, String(v)).run();
async function getRec(env, id) {
  const r = await env.DB.prepare("SELECT data FROM recs WHERE id = ?").bind(id).first();
  try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; }
}
const getSet = async (env) => (await getRec(env, "settings")) || {};
const nextRev = async (env) => ((await env.DB.prepare("SELECT MAX(rev) m FROM recs").first()).m || 0) + 1;
const upsert = (env, rec, rev) => env.DB.prepare(
  "INSERT INTO recs (id, type, data, u, rev) VALUES (?, ?, ?, ?, ?) " +
  "ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data, u = excluded.u, rev = excluded.rev"
).bind(rec.id, rec.type, JSON.stringify(rec), Number(rec.u) || Date.now(), rev);

// Statements that bring one record's reminder rows up to date. Rows that never
// fired are rebuilt; a nag that is mid-way keeps going unless the task is gone or done.
function sched(env, rec, set, now) {
  const dead = rec.del || (rec.type === "item" && rec.done) ? 1 : 0;
  // A pending snooze survives ordinary edits; it only goes when the task is done or deleted.
  const out = [env.DB.prepare("DELETE FROM rem WHERE rid = ? AND sent = 0 AND ((fired = 0 AND rk NOT LIKE '%:snz') OR ? = 1)").bind(rec.id, dead)];
  for (const f of fires(rec, set, now)) {
    out.push(env.DB.prepare(
      "INSERT OR IGNORE INTO rem (rk, orig, rid, fire, ch, nag, nleft) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(f.key, f.at, rec.id, f.at, JSON.stringify(f.ch), f.nag, f.nag ? 4 : 0));
  }
  return out;
}

// ---------- sync ----------
async function handleSync(req, env) {
  let body;
  try { body = await req.json(); } catch (e) { return J({ error: "bad json" }, 400); }
  const since = Number(body.since) || 0, now = Date.now();
  const changes = (Array.isArray(body.changes) ? body.changes : [])
    .filter((c) => c && typeof c.id === "string" && c.id.length < 80 && typeof c.type === "string").slice(0, 200);
  let set = await getSet(env);
  if (changes.length) {
    const have = {};
    for (let i = 0; i < changes.length; i += 50) {
      const ids = changes.slice(i, i + 50).map((c) => c.id);
      const { results } = await env.DB.prepare(
        "SELECT id, u FROM recs WHERE id IN (" + ids.map(() => "?").join(",") + ")").bind(...ids).all();
      for (const r of results) have[r.id] = r.u;
    }
    let rev = await nextRev(env), all = false;
    const accepted = changes.filter((c) => !(have[c.id] > (Number(c.u) || 0)));
    const st = accepted.map((c) => upsert(env, c, rev++));
    const s = accepted.find((c) => c.id === "settings");
    if (s) { all = s.tzOff !== set.tzOff || s.alldayAt !== set.alldayAt; set = s; }
    let todo = accepted.filter((c) => c.type === "item" || c.type === "habit");
    if (all) {
      // The clock settings changed, so every reminder time has to be worked out again.
      const { results } = await env.DB.prepare("SELECT data FROM recs WHERE type IN ('item','habit')").all();
      const seen = new Set(todo.map((c) => c.id));
      for (const r of results) { try { const x = JSON.parse(r.data); if (!seen.has(x.id) && !x.del) todo.push(x); } catch (e) {} }
    }
    for (const c of todo) st.push(...sched(env, c, set, now));
    if (st.length) await env.DB.batch(st);
  }
  const { results } = await env.DB.prepare("SELECT data, rev FROM recs WHERE rev > ? ORDER BY rev LIMIT 400").bind(since).all();
  const recs = [];
  for (const r of results) { try { recs.push(JSON.parse(r.data)); } catch (e) {} }
  const rev = results.length ? results[results.length - 1].rev : since;
  kset(env, "origin", new URL(req.url).origin).catch(() => {});
  return J({ rev, recs, more: results.length === 400 });
}

// ---------- web push (RFC 8291 + VAPID), no libraries ----------
async function vapid(env) {
  const saved = await kget(env, "vapid");
  if (saved) return JSON.parse(saved);
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const v = { x: jwk.x, y: jwk.y, d: jwk.d, pub: b64u(cat(new Uint8Array([4]), b64d(jwk.x), b64d(jwk.y))) };
  await kset(env, "vapid", JSON.stringify(v));
  return v;
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
export async function encryptPush(sub, text) {
  const ua = b64d(sub.p256dh), auth = b64d(sub.auth);
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(auth, secret, cat(enc.encode("WebPush: info\0"), ua, as), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0, as.length]), as, ct);
}
export async function vapidJwt(v, aud) {
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: v.x, y: v.y, d: v.d },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:onward@example.com" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + claims));
  return head + "." + claims + "." + b64u(sig);
}
async function pushAll(env, payload) {
  const { results } = await env.DB.prepare("SELECT * FROM subs").all();
  if (!results.length) return "no device has notifications turned on yet";
  const v = await vapid(env), errs = [];
  let ok = 0;
  for (const s of results) {
    try {
      const res = await fetch(s.endpoint, {
        method: "POST",
        headers: {
          TTL: "86400", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
          Authorization: "vapid t=" + (await vapidJwt(v, new URL(s.endpoint).origin)) + ", k=" + v.pub,
        },
        body: await encryptPush(s, JSON.stringify(payload)),
      });
      if (res.status === 404 || res.status === 410) await env.DB.prepare("DELETE FROM subs WHERE endpoint = ?").bind(s.endpoint).run();
      if (res.ok) ok++; else errs.push("push service said " + res.status);
    } catch (e) { errs.push(String(e.message || e)); }
  }
  return ok ? "" : errs.join("; ");
}

// ---------- telegram + email ----------
async function telegram(env, msg, links) {
  const token = await kget(env, "tgToken"), chat = await kget(env, "tgChat");
  if (!token) return "Telegram bot token is not saved yet";
  if (!chat) return "Telegram is not linked yet";
  const body = { chat_id: chat, parse_mode: "HTML", text: "<b>" + esc(msg.title) + "</b>" + (msg.body ? "\n" + esc(msg.body) : "") };
  if (links) body.reply_markup = { inline_keyboard: [[{ text: "✅ Done", url: links.done }, { text: "💤 Snooze 10 min", url: links.snooze }]] };
  const res = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return res.ok ? "" : "Telegram said: " + (await res.text()).slice(0, 200);
}
async function email(env, msg, links) {
  const apiKey = await kget(env, "resendKey"), to = await kget(env, "emailTo");
  if (!apiKey) return "Resend API key is not saved yet";
  if (!to) return "Email address is not saved yet";
  const btn = (href, label) => '<a href="' + esc(href) + '" style="display:inline-block;padding:10px 16px;margin:12px 8px 0 0;background:#12594F;color:#fff;border-radius:8px;text-decoration:none">' + label + "</a>";
  const html = '<div style="font-family:system-ui,sans-serif;font-size:16px;color:#16202A"><p style="font-size:19px;margin:0 0 6px"><b>' +
    esc(msg.title) + "</b></p><p style=\"margin:0;white-space:pre-line\">" + esc(msg.body) + "</p>" +
    (links ? btn(links.done, "Mark done") + btn(links.snooze, "Snooze 10 min") : "") + "</div>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
    body: JSON.stringify({ from: (await kget(env, "emailFrom")) || "Onward <onboarding@resend.dev>", to: [to], subject: msg.title, html }),
  });
  return res.ok ? "" : "Resend said: " + (await res.text()).slice(0, 200);
}

// Sends one message over the chosen channels. Returns { channel: "" | error text }.
async function notify(env, ch, msg, rid) {
  const origin = await kget(env, "origin");
  const tok = rid ? await mkTok(env, rid) : "";
  const links = tok && origin ? { done: origin + "/act?a=done&t=" + tok, snooze: origin + "/act?a=snooze&t=" + tok } : null;
  const out = {}, alarm = ch.includes("alarm");
  if (alarm || ch.includes("push")) {
    const r = await pushAll(env, { t: msg.title, b: msg.body, tag: msg.tag || rid || "onward", alarm, id: rid || "", tok });
    if (alarm) out.alarm = r;
    if (ch.includes("push")) out.push = r;
  }
  if (ch.includes("tg")) out.tg = await telegram(env, msg, links).catch((e) => String(e.message || e));
  if (ch.includes("email")) out.email = await email(env, msg, links).catch((e) => String(e.message || e));
  return out;
}

// ---------- one-tap Done / Snooze from a notification, Telegram or email ----------
async function hmac(env, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(env.APP_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(msg))).slice(0, 32);
}
async function mkTok(env, rid) {
  const exp = Date.now() + 7 * DAY;
  return rid + "." + exp + "." + (await hmac(env, rid + "|" + exp));
}
async function ckTok(env, t) {
  const p = String(t || "").split(".");
  if (p.length !== 3 || !(Number(p[1]) > Date.now())) return null;
  return safeEq(p[2], await hmac(env, p[0] + "|" + p[1])) ? p[0] : null;
}
async function act(env, rid, a) {
  const rec = await getRec(env, rid), now = Date.now(), set = await getSet(env);
  if (!rec || rec.del) return "That item no longer exists.";
  if (a === "snooze") {
    const ch = new Set();
    for (const r of rec.rem || []) for (const c of r.ch || []) ch.add(c);
    for (const c of rec.remCh || []) ch.add(c);
    await env.DB.prepare("INSERT OR REPLACE INTO rem (rk, orig, rid, fire, ch) VALUES (?, ?, ?, ?, ?)")
      .bind(rid + ":snz", now + 10 * MIN, rid, now + 10 * MIN, JSON.stringify(ch.size ? [...ch] : ["push"])).run();
    return "Snoozed. I'll remind you again in 10 minutes.";
  }
  let rev = await nextRev(env);
  if (rec.type === "habit") {
    const k = dayKey(now, tz(set)), n = { ...rec, u: now, done: { ...(rec.done || {}) } };
    n.done[k] = (n.done[k] || 0) + 1;
    const log = { id: "l" + uid(), type: "log", k: "habit", ref: rec.id, title: rec.name, at: now, u: now, xp: 5 };
    await env.DB.batch([upsert(env, n, rev++), upsert(env, log, rev++), ...sched(env, n, set, now)]);
    return "Checked off “" + rec.name + "”. +5 XP";
  }
  if (rec.kind !== "task") return "Events don't need ticking off. You're all set.";
  if (rec.done) return "Already done. Nice.";
  const n = complete(rec, now, set), log = taskLog(rec, now, set);
  await env.DB.batch([upsert(env, n, rev++), upsert(env, log, rev++), ...sched(env, n, set, now)]);
  return "Done: “" + rec.title + "”. +" + log.xp + " XP";
}
const page = (inner) => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Onward</title>' +
  "<style>body{font-family:system-ui,sans-serif;background:#F2F5F7;color:#16202A;display:grid;place-items:center;min-height:100vh;margin:0}" +
  "main{background:#fff;padding:28px;border-radius:18px;max-width:340px;text-align:center;box-shadow:0 8px 24px rgba(20,35,50,.08)}" +
  "button,a.b{display:block;width:100%;box-sizing:border-box;padding:14px;margin-top:12px;border:0;border-radius:12px;background:#12594F;color:#fff;font:inherit;font-weight:600;text-decoration:none}" +
  "@media(prefers-color-scheme:dark){body{background:#10151A;color:#E9EFF4}main{background:#192027}}</style><main>" + inner + "</main>",
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
async function handleAct(req, env, url) {
  const rid = await ckTok(env, url.searchParams.get("t"));
  const a = url.searchParams.get("a") === "snooze" ? "snooze" : "done";
  if (!rid) return req.method === "POST" && url.searchParams.get("j") ? J({ error: "link expired" }, 401) : page("<p>This link has expired. Open the app instead.</p><a class=b href=/>Open Onward</a>");
  if (req.method === "POST") {
    const msg = await act(env, rid, a);
    return url.searchParams.get("j") ? J({ ok: true, msg }) : page("<p>" + esc(msg) + "</p><a class=b href=/>Open Onward</a>");
  }
  // A plain GET only shows a button. Link previewers and mail scanners that
  // open links automatically therefore can't tick things off by accident.
  const rec = await getRec(env, rid);
  return page("<p><b>" + esc(rec ? rec.title || rec.name : "") + "</b></p><form method=post><button>" +
    (a === "snooze" ? "Snooze 10 minutes" : "Mark as done") + "</button></form>");
}

// Keeps the last few deliveries (and why any failed) for the status panel in Settings.
async function logSend(env, at, title, res) {
  let log = [];
  try { log = JSON.parse((await kget(env, "sendLog")) || "[]"); } catch (e) {}
  log.unshift({ at, title: String(title).slice(0, 80), res });
  await kset(env, "sendLog", JSON.stringify(log.slice(0, 8)));
}

// ---------- cron: runs every minute ----------
async function tick(env) {
  await init(env);
  if (!env.APP_KEY) return;
  const now = Date.now(), set = await getSet(env), o = tz(set);
  await kset(env, "lastTick", now); // shown in Settings so you can see the reminder clock is running
  const { results } = await env.DB.prepare("SELECT * FROM rem WHERE sent = 0 AND fire <= ? ORDER BY fire LIMIT 30").bind(now).all();
  for (const r of results) {
    const rec = await getRec(env, r.rid);
    let live = rec && !rec.del && !(rec.type === "item" && rec.done) && now - r.fire < 6 * 3600e3;
    if (live && rec.type === "habit") {
      // Skip a habit reminder when enough of today's check-offs are already in.
      const hi = /:h(\d+)$/.exec(r.rk), need = hi ? habitNeed(rec, Number(hi[1])) : rec.freq || 1;
      if (((rec.done || {})[dayKey(now, o)] || 0) >= need) live = false;
    }
    let ch = [];
    try { ch = JSON.parse(r.ch); } catch (e) {}
    // Quiet hours: anything that is not an alarm waits until the window ends.
    const hold = live && !ch.includes("alarm") ? quietUntil(set, now) : 0;
    if (hold) { await env.DB.prepare("UPDATE rem SET fire = ? WHERE rk = ? AND orig = ?").bind(hold, r.rk, r.orig).run(); continue; }
    const again = live && rec.type === "item" && r.nleft > 0;
    // Mark first, send second: if sending crashes, the reminder is not repeated forever.
    if (again) await env.DB.prepare("UPDATE rem SET fire = ?, nleft = nleft - 1, fired = fired + 1 WHERE rk = ? AND orig = ?").bind(now + r.nag * MIN, r.rk, r.orig).run();
    else await env.DB.prepare("UPDATE rem SET sent = 1, fired = fired + 1 WHERE rk = ? AND orig = ?").bind(r.rk, r.orig).run();
    if (live) {
      const isHabit = rec.type === "habit", nagging = r.fired > 0, held = !nagging && r.fire - r.orig > 5 * MIN && !/:snz$/.test(r.rk);
      const msg = {
        title: (ch.includes("alarm") ? "⏰ " : "") + (isHabit ? rec.name : rec.title),
        body: (held ? "Held during quiet hours (was due " + fmtTime(r.orig, o) + "). " : "") + (isHabit ? "Habit check-in. One tap counts." : (nagging ? "Still waiting on this one. " : "") + fmtWhen(rec, o, now) + (rec.step ? "\nFirst step: " + rec.step : "")),
        tag: r.rk,
      };
      let res;
      try { res = await notify(env, ch, msg, rec.id); } catch (e) { res = { error: String(e && e.message || e) }; }
      await logSend(env, now, msg.title, res);
    }
    if (rec && !rec.del && (rec.type === "habit" || (rec.rep && rec.kind === "event"))) await env.DB.batch(sched(env, rec, set, now));
  }
  // Water nudges: spread through the day, stopped once today's goal is reached.
  if (set.waterRem && set.waterRem.on) {
    const b = await getRec(env, "b-" + dayKey(now, o)), due = waterDue(set, now, b && !b.del && b.water ? b.water : 0);
    if (due && (await kget(env, "waterSlot")) !== due.key) {
      await kset(env, "waterSlot", due.key);
      const ch = due.ch.filter((c) => c === "push" || c === "tg" || c === "email");
      if (ch.length) await logSend(env, now, "💧 Water", await notify(env, ch, { title: "💧 Time for water", body: due.body, tag: "water" }, ""));
    }
  }
  // Morning plan: one summary a day at the time chosen in Settings.
  if (set.digestAt && (set.digestCh || []).length) {
    const k = dayKey(now, o), [h, m] = String(set.digestAt).split(":").map(Number), at = keyTs(k, o, h || 0, m || 0);
    if (now >= at && now < at + 3 * 3600e3 && (await kget(env, "digest")) !== k) {
      await kset(env, "digest", k);
      const { results: rows } = await env.DB.prepare("SELECT data FROM recs WHERE type = 'item'").all();
      const start = keyTs(k, o), today = [], late = [];
      for (const row of rows) {
        try {
          const it = JSON.parse(row.data);
          if (it.del || it.done || it.at == null || it.kind !== "task") continue;
          if (it.at < start) late.push(it); else if (it.at < start + DAY) today.push(it);
        } catch (e) {}
      }
      if (today.length || late.length) {
        const first = today.concat(late).sort((a, b) => (b.pri || 0) - (a.pri || 0))[0];
        const title = "Today: " + today.length + " planned" + (late.length ? ", " + late.length + " carried over" : "");
        await logSend(env, now, title, await notify(env, set.digestCh, { title, body: "Start with just one: " + first.title, tag: "digest" }, ""));
      }
    }
  }
  if (new Date(now).getUTCMinutes() === 7) await env.DB.prepare("DELETE FROM rem WHERE sent = 1 AND fire < ?").bind(now - 3 * DAY).run();
}

// ---------- AI suggestions (Cloudflare Workers AI) ----------
// Used only when you tap a suggest button. It is sent the name, your notes and the
// existing steps of that one task, nothing else.
const AI_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fp8-fast"];
function aiText(r) {
  if (!r) return "";
  const x = r.response != null ? r.response : r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : r.output_text != null ? r.output_text : "";
  return typeof x === "string" ? x : JSON.stringify(x);
}
function pickJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const m = /\{[\s\S]*\}/.exec(text);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}
export async function aiSuggest(env, b) {
  if (!env.AI) return { status: 503, error: "AI is not switched on for this Worker yet. Redeploy it with the “ai” binding from wrangler.jsonc." };
  const clip = (x, n) => String(x == null ? "" : x).replace(/\s+/g, " ").trim().slice(0, n);
  const kind = b.kind === "icons" ? "icons" : b.kind === "smaller" ? "smaller" : "steps";
  const title = clip(b.title, 200), have = (Array.isArray(b.steps) ? b.steps : []).map((x) => clip(x, 90)).filter(Boolean).slice(0, 20);
  if (!title) return { status: 400, error: "Give it a name first." };
  let system, user, max = 300;
  if (kind === "icons") {
    system = "You pick emoji. Reply with only JSON like {\"icons\":[\"💧\",\"🚰\"]}: five different single emoji that best represent the given " + (b.what === "habit" ? "habit" : "task") + ", best match first. No text.";
    user = title; max = 60;
  } else if (kind === "smaller") {
    system = "You help someone with ADHD who is stuck on one step of a task. Split that step into 2 or 3 smaller physical actions, in order. The first must take under two minutes and be something the hands can do right now. Each is at most 8 words, starts with a verb, plain language, no numbering. Reply with only JSON like {\"steps\":[\"...\"]}.";
    user = "Task: " + title + "\nStuck on this step: " + clip(b.step, 120);
  } else {
    system = "You help someone with ADHD get started on a task. Break it into 3 to 6 small, concrete steps in the order they would be done. The first step must take under two minutes and be something the hands can do right now, such as opening a file or picking something up. Each step is at most 8 words, starts with a verb, plain language, no numbering, no explanations. Do not repeat steps that already exist. Reply with only JSON like {\"steps\":[\"...\"]}.";
    user = "Task: " + title + (clip(b.notes, 400) ? "\nNotes: " + clip(b.notes, 400) : "") + (have.length ? "\nSteps that already exist: " + have.join("; ") + "\nSuggest only the steps that are still missing." : "");
  }
  let text = "", err = "";
  for (const model of env.AI_MODEL ? [env.AI_MODEL] : AI_MODELS) {
    try {
      text = aiText(await env.AI.run(model, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: max, temperature: 0.4 }));
      if (text) break;
    } catch (e) { err = String(e && e.message || e); }
  }
  if (!text) return { status: 502, error: /limit|quota|allocation|neuron/i.test(err) ? "Today’s free AI allowance is used up. It resets at 5:30 AM India time." : "The AI did not answer" + (err ? ": " + err.slice(0, 140) : ".") };
  const out = pickJson(text) || {};
  if (kind === "icons") {
    const src = Array.isArray(out.icons) ? out.icons.join(" ") : text, icons = [];
    for (const m of src.matchAll(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu)) if (!icons.includes(m[0])) icons.push(m[0]);
    return icons.length ? { icons: icons.slice(0, 6) } : { status: 502, error: "The AI gave nothing usable. Try again." };
  }
  const seen = new Set(have.map((x) => x.toLowerCase())), steps = [];
  for (const raw of Array.isArray(out.steps) ? out.steps : text.split(/\n+/)) {
    const t = clip(String(raw).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["'“]+|["'”.]+$/g, ""), 90);
    if (t && !/^[{}\[\]]/.test(t) && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); steps.push(t); }
  }
  return steps.length ? { steps: steps.slice(0, kind === "smaller" ? 3 : 6) } : { status: 502, error: "The AI gave nothing usable. Try again." };
}

// ---------- settings that live on the server ----------
async function handleConfig(req, env) {
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    for (const k of ["tgToken", "resendKey", "emailTo", "emailFrom"]) {
      if (typeof b[k] === "string") {
        if (b[k].trim()) await kset(env, k, b[k].trim().slice(0, 300));
        else await env.DB.prepare("DELETE FROM kv WHERE k = ?").bind(k).run();
      }
    }
    if (b.tgUnlink) await env.DB.prepare("DELETE FROM kv WHERE k = 'tgChat'").run();
  }
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM subs").first()).n;
  const q = await env.DB.prepare("SELECT COUNT(*) n, MIN(fire) next FROM rem WHERE sent = 0").first();
  let sendLog = [];
  try { sendLog = JSON.parse((await kget(env, "sendLog")) || "[]"); } catch (e) {}
  return J({
    lastTick: Number(await kget(env, "lastTick")) || 0, queued: q.n || 0, nextFire: q.next || 0, sendLog, now: Date.now(),
    tgToken: !!(await kget(env, "tgToken")), tgChat: !!(await kget(env, "tgChat")), resendKey: !!(await kget(env, "resendKey")),
    emailTo: (await kget(env, "emailTo")) || "", emailFrom: (await kget(env, "emailFrom")) || "", pushDevices: n,
  });
}
async function handleTgLink(env) {
  const token = await kget(env, "tgToken");
  if (!token) return J({ error: "Save the bot token first." }, 400);
  const res = await fetch("https://api.telegram.org/bot" + token + "/getUpdates?limit=20&allowed_updates=%5B%22message%22%5D");
  const data = await res.json().catch(() => null);
  if (!data || !data.ok) return J({ error: "Telegram rejected that token. Check it and save again." }, 400);
  const m = data.result.map((u) => u.message).filter((x) => x && x.chat && x.chat.type === "private").pop();
  if (!m) return J({ error: "No message found. Open your bot in Telegram, press Start, then try again." }, 400);
  await kset(env, "tgChat", m.chat.id);
  return J({ ok: true, name: m.chat.first_name || m.chat.username || "you" });
}

async function api(req, env, url) {
  const p = url.pathname;
  if (!env.APP_KEY || !env.DB) return J({ error: "Server is not configured: add the APP_KEY secret and the DB binding." }, 503);
  if (!safeEq(req.headers.get("x-key") || "", env.APP_KEY)) return J({ error: "unauthorized" }, 401);
  if (p === "/api/sync" && req.method === "POST") return handleSync(req, env);
  if (p === "/api/config") return handleConfig(req, env);
  if (p === "/api/push/key") return J({ key: (await vapid(env)).pub });
  if (p === "/api/push/sub" && req.method === "POST") {
    const s = await req.json().catch(() => null);
    if (!s || !s.endpoint || !s.keys || !/^https:\/\//.test(s.endpoint)) return J({ error: "bad subscription" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO subs (endpoint, p256dh, auth, at) VALUES (?, ?, ?, ?)")
      .bind(s.endpoint, s.keys.p256dh, s.keys.auth, Date.now()).run();
    return J({ ok: true });
  }
  if (p === "/api/push/unsub" && req.method === "POST") {
    const s = await req.json().catch(() => ({}));
    await env.DB.prepare("DELETE FROM subs WHERE endpoint = ?").bind(String(s.endpoint || "")).run();
    return J({ ok: true });
  }
  if (p === "/api/tg/link" && req.method === "POST") return handleTgLink(env);
  if (p === "/api/ai" && req.method === "POST") {
    const r = await aiSuggest(env, await req.json().catch(() => ({})));
    return J(r, r.status || 200);
  }
  if (p === "/api/test" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ch = ["push", "alarm", "tg", "email"].includes(b.ch) ? b.ch : "push";
    await kset(env, "origin", url.origin);
    const r = await notify(env, [ch], { title: (ch === "alarm" ? "⏰ " : "") + "Onward test", body: "If you can see this, this channel works.", tag: "test" }, "");
    return J({ error: r[ch] || "" });
  }
  if (p === "/api/import-tally" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    let u;
    try { u = new URL(String(b.url)); } catch (e) { return J({ error: "That doesn't look like a web address." }, 400); }
    if (u.protocol !== "https:") return J({ error: "The address must start with https://" }, 400);
    const res = await fetch(u.origin + "/api/state", { headers: { "x-sync-key": String(b.key || "") } }).catch(() => null);
    if (!res) return J({ error: "Could not reach the old app." }, 502);
    if (res.status === 401) return J({ error: "The old app rejected that sync key." }, 400);
    const d = await res.json().catch(() => null);
    if (!d || !d.data) return J({ error: "The old app has no synced data. Use the paste option instead." }, 400);
    return J({ data: d.data });
  }
  return J({ error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/") || url.pathname === "/act") {
        if (env.DB) await init(env);
        if (url.pathname === "/act") return env.APP_KEY && env.DB ? handleAct(req, env, url) : page("<p>Not configured.</p>");
        return await api(req, env, url);
      }
    } catch (e) {
      console.log("error", e && e.stack || e);
      return J({ error: "server error: " + String(e && e.message || e) }, 500);
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};
export { tick };
