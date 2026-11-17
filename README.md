# Onward

A personal tasks + calendar + habits app for phone and laptop, hosted on Cloudflare
(one Worker, one D1 database, no build step).

- **Tasks and events**: lists, tags, priorities, subtasks, repeats, quick add that
  understands "call mom tomorrow 5pm #home !high every week".
- **Calendar**: month and week views; repeating items show on every date.
- **Habits**: the tally counter, built in. Daily check-offs, times-per-day, icons with
  suggestions, tags (filter, group, and per-tag calendar), drag to reorder, multi-select
  delete, a calendar that deepens with how much of a day is done, day detail, streaks,
  tally marks, and the tap counter with saved entries. A habit done n times a day can
  have up to n reminder times.
- **Now** (Foothold, built in): one step of one task at a time. "Start with 2 minutes",
  a 60 minute dial, "Make it smaller", an "I'm stuck" helper, "Not now" with a note on
  where you left off, guess vs. tracked time, a "left today" bar and a brain dump.
  A session log, and charts of minutes focused by day, week or month, filtered by
  tasks, habits or tag.
- **AI suggestions** (Cloudflare Workers AI, free daily allowance): "Break it down for
  me" turns a task into small steps, and "Suggest" offers icons for tasks and habits.
  Only that one task's name, notes and steps are sent, and only when you tap.
- **Meaning to**: a shelf for things with no date in mind. Type "someday" in quick add.
  Today offers one a day (Today / Not today / Let it go); after a month it asks if you
  still want it. Finishing one earns bonus XP for the wait.
- **Weekly review**: what got done, habits, guess vs. tracked time, and a pass through
  the Meaning to shelf.
- **Little things**: swipe a task right to finish it or left to move it to tomorrow;
  quick add understands "25 Dec", "next month" and "at 5"; repeats can end on a date
  and single dates can be skipped; accent colours unlock as you level up; long-press
  the app icon for shortcuts, or share text to Onward from another app.
- **Reminders**: any number per item. Each one picks its own time (presets, custom
  "N minutes/hours/days/weeks before", or an exact date and time) and its own
  channels: push, alarm, Telegram, email. Optional nudging until the task is done, and
  quiet hours that hold everything except alarms until morning.
- **Game layer**: XP, levels, a day streak with freezes, three daily quests, confetti.
- **ADHD-friendly**: "Pick one for me", a "tiniest first step" field, "Just 5 min"
  focus timer, overdue tasks shown as "carried over" with one-tap "move all to today",
  a Quick wins filter, and a morning plan message.

## Deploy (about 10 minutes)

1. **GitHub**: create a new repository (for example `onward`) and upload everything
   in this folder.
2. **Database**: Cloudflare dashboard > Storage & Databases > D1 > Create database,
   name it `onward`. Copy its Database ID into `wrangler.jsonc`
   (replace `PASTE-YOUR-D1-DATABASE-ID-HERE`) and commit.
3. **Worker**: Workers & Pages > Create > Import a repository > pick the repo > Deploy.
4. **Secret**: open the new Worker > Settings > Variables and Secrets > add a secret
   named `APP_KEY`. Use a long passphrase; it is the only thing protecting your data.
5. Open the Worker's address. The tables are created automatically on first use.

From a terminal instead:

    npm install
    npx wrangler d1 create onward      # paste the id into wrangler.jsonc
    npx wrangler secret put APP_KEY
    npx wrangler deploy

## Set up each device

1. Open the address in Chrome. On Android: menu > "Add to Home screen" / "Install app".
2. Gear icon > **Sync**: type your `APP_KEY`.
3. **Notifications on this device** > "Turn on push + alarm here", then send a test.
4. **Telegram** (once): create a bot with @BotFather, paste the token, press Start in
   the bot, tap "Link my chat".
5. **Email** (once): make a free Resend account, create an API key, paste it with your
   address. Without a verified domain Resend only delivers to your own sign-up address.
6. **Bring in my Tally counter data** (once): give the old app's address and sync key.
7. **Bring in my Foothold data** (once): paste the backup copied from Foothold.

## If a reminder does not arrive

Open Settings (gear icon). The **Reminder status** card at the top shows whether the
once-a-minute reminder clock is running, which channels are set up, how many reminders
are queued, and the last few deliveries with the exact reason any of them failed.
Each channel also has a **Send a test** button.

## Honest limits

- **Alarm**: a web app cannot ring like the Clock app while it is closed. "Alarm" sends
  a notification that stays on screen until dismissed, with a long vibration and
  Done / Snooze buttons. If the app is open, it rings full-screen with sound. For
  something loud while the phone is locked, give the Onward notification channel a
  loud sound in Android settings, or add Telegram to that reminder.
- Reminders are checked once a minute, so they can arrive up to a minute late.
- Times use your device's fixed UTC offset (correct for India; no daylight saving).
- If the same record is edited on two devices while both are offline, the later edit wins.
- AI suggestions need a connection and sync turned on. They use open models, so treat
  the steps as a starting point.
- Not built yet from TickTick: Kanban, Eisenhower matrix, timeline, countdowns,
  statistics pages, sharing/collaboration, widgets, calendar subscriptions.

## Layout

    public/index.html, app.css, app.js   the app
    public/shared.js                     date/repeat/reminder logic used by app and server
    public/sw.js                         offline cache + push notifications
    src/worker.js                        sync API, reminder cron, push/Telegram/email
