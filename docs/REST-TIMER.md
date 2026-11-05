# Rest timer with the screen off — spike (M28)

Goal: the end of rest should reach you when the phone is in your pocket with the screen off, without a
server (Iron Notes has none) and without slowing the app.

## What a web app can do

| Option | Works? | Notes |
|---|---|---|
| Timer from a stored end time | ✅ (since M2) | A throttled page still shows the right time when you look again. |
| Beep + vibration when the page is visible | ✅ | Web Audio after the tap that started the timer. |
| **Notification from the page when rest ends while hidden** | ✅ **shipped (M28)**, opt-in | `registration.showNotification` through the service worker: shows on the lock screen and vibrates; tapping it brings the app back. Relies on the page's timer still running in the background (see below). |
| Notification Triggers (schedule a notification ahead) | ❌ | Chrome's origin trial ended; not shipped anywhere. |
| Service-worker timer | ❌ | The worker is stopped after ~30 s idle; rests are 60–300 s. |
| Push message from a server | ❌ | Needs a server and an account: against the app's rules. |
| Silent audio to keep the page alive | ❌ | Takes audio focus: it would pause the user's music in the gym. |

**The limit.** Chrome on Android keeps timers running in a hidden page for a few minutes (throttled to
about once a second), so a 1–3 minute rest normally fires on time. But Android can freeze a page whose
app went to the background (battery saver, low memory, some makers' power management); then the
notification comes only when the page runs again. This can only be checked on real phones.

## What shipped

- Settings → Rest timer → **Notify when rest is over (also with the screen off)**: asks for notification
  permission on the tap that turns it on; refused → stays off and says how to allow it.
- When rest ends and the page is hidden: a "Rest over" notification (tag `rest`, re-alerts, vibrates).
  On screen: the bar, beep and vibration as before.
- Per-category default rest (category editor): an exercise's own rest wins, then its category's, then the
  setting — e.g. legs 180 s, arms 60 s.

## If the phone test shows misses: the native fallback

The Android app is a Trusted Web Activity (Bubblewrap). It has no JavaScript bridge, but the page can open
an `intent://` link. A tiny native piece would make the alarm independent of the page:

1. A transparent `ScheduleRestActivity` (no UI) that reads the end time from the intent, schedules an
   exact alarm with `AlarmManager.setExactAndAllowWhileIdle`, and finishes at once.
2. A `BroadcastReceiver` that posts the "Rest over" notification at that time (channel with vibration).
3. The page, inside the Android app only (TWA referrer / display-mode check), opens
   `intent://rest?end=<ms>#Intent;scheme=ironnotes;package=io.github.quoterg.ironnotes;end` when the
   timer starts, and a cancel intent when it's stopped or changed.

Cost: ~100 lines of Java in `android/`, `SCHEDULE_EXACT_ALARM` / `POST_NOTIFICATIONS` permissions, a new
signed build by the owner. Worth it only if the web notification misses in practice.

## Owner test (5 minutes)

1. Settings → turn on the notification, allow it.
2. Log a set (the timer starts), lock the phone, wait for the rest time.
3. Repeat with the app in the background behind another app, and with battery saver on.

Tell me which cases missed; the native fallback then gets its own milestone.
