# Life Dashboard

A minimalist personal dashboard that installs on your phone like an app. It has:

- **Today**: top 3, schedule, due tasks, habits, focus timer, deadlines and upcoming important dates
- **Calendar**: month view, your Google Calendar events, local events, important dates with day-before reminders
- **Plan**: tasks (with quick-add shortcuts), edit projects (brief → delivery stages, deadlines) and habits with streaks
- **Notes**: searchable, pinnable, autosaving
- **Insights**: charts for day score and rating, mood and energy, tasks, focus, score breakdown, best weekdays, habit heatmap, sleep vs. rating, blockers, tags and focus by project
- **Evening check-in**: 14 quick questions, then feedback on what went well, where you lacked, and what to try tomorrow
- **Morning plan**: an intention plus your top 3 tasks

All data stays on your devices. When Google is connected, it also syncs between phone and computer through a hidden app file in your Google Drive. Nobody else can see it, and it doesn't appear in your Drive file list.

Quick-add shortcuts: `tomorrow`, `fri`, `next week` · `!1` high priority · `#client` tag · `@14:30` time.

---

## 1. Put it on GitHub Pages

The upload works the same way as your other web app: these are plain files, with no build step.

1. Create a new repository on GitHub, e.g. `life-dashboard`.
2. Upload everything in this folder (`index.html`, `manifest.webmanifest`, `sw.js`, and the `css`, `js` and `icons` folders).
3. In the repository, go to **Settings → Pages → Branch: main / root → Save**.
4. After a minute the app is live at `https://<your-username>.github.io/life-dashboard/`.

## 2. Install it on your phone

- **iPhone (Safari):** open the link → Share → **Add to Home Screen**. Always open it from the home-screen icon. iOS only allows notifications for web apps opened that way (iOS 16.4+).
- **Android (Chrome):** open the link → ⋮ → **Install app**.

Then open **Settings (gear) → Notifications → Send test notification** and allow notifications.

## 3. Connect Google Calendar (once, about 10 minutes)

1. Go to <https://console.cloud.google.com/> and create a project, e.g. "Life Dashboard".
2. **APIs & Services → Library**: enable **Google Calendar API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform"):
   - User type **External**, fill in an app name and your email.
   - Scopes: you can skip this step.
   - **Test users / Audience**: add your own Google account.
   - Leave it in **Testing**, which is fine for personal use. (In Testing mode Google may ask you to re-approve every 7 days. Publishing the app removes that, but Google then shows an "unverified app" warning, which is safe to accept for your own app.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://<your-username>.github.io`
   - Authorized redirect URIs: `https://<your-username>.github.io/life-dashboard/` (copy the exact value shown in the app's Settings, including the trailing slash)
5. Copy the **Client ID** (`…apps.googleusercontent.com`), paste it into the app under **Settings → OAuth Client ID**, tap **Save**, then **Connect Google**.

Do this once on each device (phone and computer). After that, your data syncs automatically.

### About sign-in and notifications
- Google browser sign-ins last **1 hour**. When it expires, a "Reconnect Google" button appears at the top. One tap usually brings you straight back. You can also turn on **Reconnect automatically on launch** in Settings.
- GitHub Pages can't run a server, so the app can't push notifications on its own while it is fully closed. To get around this:
  - **Events you create here are saved to Google Calendar with reminders**, and the Google Calendar app on your phone delivers those reminders even when this app is closed. Install the Google Calendar app and allow its notifications.
  - **Important dates** get an extra reminder the day before.
  - Morning brief, evening check-in, task-time and project-deadline reminders come from this app while it's open or in the background. If one was missed in the last 2 hours, it fires when you open the app.

## Updating the app
Edit files and upload them to the repository again. The app picks up new files the next time it opens online. If you change file names, also update the list in `sw.js` and bump `CACHE` (e.g. `life-dashboard-v2`).

## Backups
Settings → **Export backup** downloads everything as JSON. **Import** restores it.

## Run locally (optional)
```
cd ~/Desktop/life-dashboard && python3 -m http.server 8765
```
Then open http://localhost:8765. To use Google sign-in locally, add `http://localhost:8765` as a JavaScript origin and `http://localhost:8765/` as a redirect URI in the OAuth client.
