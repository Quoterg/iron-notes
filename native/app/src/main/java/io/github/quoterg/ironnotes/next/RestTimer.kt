package io.github.quoterg.ironnotes.next

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.Category
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.Settings
import io.github.quoterg.ironnotes.core.fmtTime
import kotlinx.coroutines.delay

/** timer.ts `restFor`: the exercise's own rest, else its category's, else the setting (seconds). */
fun restFor(ex: Exercise?, cat: Category?, settings: Settings): Double = ex?.rest ?: cat?.rest ?: settings.rest

/**
 * The rest timer (timer.ts): one at a time, counted from a stored end time (`SystemClock.elapsedRealtime`,
 * so it stays right when the phone sleeps). An exact alarm posts a notification when it ends, which works
 * with the screen off; the bar (RestTimerBar) only ticks while it is on screen. The timer is also kept in
 * SharedPreferences (end as wall-clock time, which survives a reboot) so it comes back after the process
 * was killed; `get` restores it.
 */
@SuppressLint("UseKtx") // no core-ktx dependency
class RestTimer private constructor(context: Context) {
    private val app = context.applicationContext

    /** End time on the elapsedRealtime clock (ms); 0 when no timer runs. */
    var endsAt by mutableLongStateOf(0L); private set

    /** Set when the notification permission should be asked for (Android 13+, once); the bar clears it. */
    var askPermission by mutableStateOf(false)

    private var title = ""
    private var channelName = ""
    private var sound = true

    /** Starts (or restarts) the timer. `notify` = the notification at the end (needs permission on 13+). */
    fun start(seconds: Double, state: AppState, sound: Boolean = state.settings.timerSound, notify: Boolean = state.settings.restNotify != false) {
        title = state.t("restOver")
        channelName = state.t("restOver")
        if (Build.VERSION.SDK_INT >= 26) createChannel(app, sound, channelName)
        this.sound = sound
        clearNotification()
        endsAt = SystemClock.elapsedRealtime() + (seconds * 1000).toLong()
        if (notify) {
            schedule()
            persist()
            if (Build.VERSION.SDK_INT >= 33 && !granted() && !app.prefs().getBoolean(ASKED, false)) {
                app.prefs().edit().putBoolean(ASKED, true).apply()
                askPermission = true
            }
        } else {
            cancelAlarm()
            persist()
        }
    }

    fun add(seconds: Int) {
        if (endsAt == 0L) return
        val now = SystemClock.elapsedRealtime()
        endsAt = maxOf(now + 1000, endsAt + seconds * 1000L)
        if (alarmSet) schedule()
        persist()
    }

    /** The user stops it: no alarm, no notification. */
    fun stop() {
        cancelAlarm()
        clearNotification()
        endsAt = 0
        forget()
    }

    /** "Rest over" has been shown long enough: the bar goes, a posted notification stays. */
    fun dismissBar() {
        endsAt = 0
        forget()
    }

    private var alarmSet = false

    // After the properties above: initialisers run in order.
    init {
        restore()
    }

    private fun granted() = Build.VERSION.SDK_INT < 33 ||
        app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun alarmIntent(flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(
            app, 1,
            Intent(app, RestAlarmReceiver::class.java).putExtra("title", title).putExtra("channel", channelName).putExtra("sound", sound),
            flags or PendingIntent.FLAG_IMMUTABLE,
        )

    /** The end as wall-clock time (ms): what is stored, since elapsedRealtime restarts at boot. */
    private fun endWall() = System.currentTimeMillis() + (endsAt - SystemClock.elapsedRealtime())

    private fun schedule() {
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        val pi = alarmIntent(PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, endsAt, pi)
        else {
            // No exact-alarm permission (Android 14+ doesn't grant it by default): an alarm clock is exact,
            // needs no permission and passes Doze. It shows the system's alarm icon while it waits.
            val open = app.packageManager.getLaunchIntentForPackage(app.packageName)
                ?.let { PendingIntent.getActivity(app, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
            if (open != null) am.setAlarmClock(AlarmManager.AlarmClockInfo(endWall(), open), pi)
            else am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, endsAt, pi)
        }
        alarmSet = true
    }

    private fun persist() {
        app.prefs().edit()
            .putLong(END_WALL, endWall()).putBoolean(SOUND, sound).putBoolean(ALARM, alarmSet)
            .putString(TITLE, title).putString(CHANNEL, channelName).apply()
    }

    private fun forget() {
        app.prefs().edit().remove(END_WALL).remove(SOUND).remove(ALARM).remove(TITLE).remove(CHANNEL).apply()
    }

    /** Brings back a timer stored before the process died; drops one that is long over or implausibly far off. */
    private fun restore() {
        val p = app.prefs()
        val endWall = p.getLong(END_WALL, 0L)
        if (endWall == 0L) return
        val left = endWall - System.currentTimeMillis()
        title = p.getString(TITLE, "") ?: ""
        channelName = p.getString(CHANNEL, "") ?: ""
        sound = p.getBoolean(SOUND, true)
        alarmSet = p.getBoolean(ALARM, false)
        if (left < -OVER_SHOWN_MS || left > MAX_AHEAD_MS) {
            cancelAlarm()
            forget()
            return
        }
        endsAt = SystemClock.elapsedRealtime() + left
    }

    private fun cancelAlarm() {
        alarmSet = false
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        alarmIntent(PendingIntent.FLAG_UPDATE_CURRENT)?.let { am.cancel(it); it.cancel() }
    }

    private fun clearNotification() {
        app.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
    }

    companion object {
        private const val ASKED = "askedNotifications"
        private const val END_WALL = "endWall"
        private const val SOUND = "sound"
        private const val ALARM = "alarm"
        private const val TITLE = "title"
        private const val CHANNEL = "channel"
        /** The bar shows "Rest over" this long (RestTimerBar), so a timer ended longer ago isn't restored. */
        private const val OVER_SHOWN_MS = 5000L
        private const val MAX_AHEAD_MS = 3_600_000L
        const val NOTIFICATION_ID = 7001
        @SuppressLint("StaticFieldLeak") // holds the application context only
        @Volatile private var instance: RestTimer? = null

        /** The app's one timer. */
        fun get(context: Context): RestTimer =
            instance ?: synchronized(this) { instance ?: RestTimer(context).also { instance = it } }

        private fun Context.prefs() = getSharedPreferences("rest-timer", Context.MODE_PRIVATE)
    }
}

private val VIBRATION = longArrayOf(0, 250, 120, 250)

/**
 * Creates the channel (or updates an existing one's name: creating again with the same id does that, the
 * rest of a channel stays as the user set it). A channel's sound can't change afterwards: one with sound,
 * one without. Returns its id.
 */
@androidx.annotation.RequiresApi(26)
private fun createChannel(context: Context, sound: Boolean, name: String): String {
    val id = if (sound) "rest" else "rest_quiet"
    val channel = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH)
    channel.enableVibration(true)
    channel.vibrationPattern = VIBRATION
    if (!sound) channel.setSound(null, null)
    context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    return id
}

/** Posts "Rest over" when the alarm fires (also with the screen off). Tapping it opens the app. */
class RestAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val title = intent.getStringExtra("title") ?: return
        val sound = intent.getBooleanExtra("sound", true)
        val vibration = VIBRATION
        val builder: Notification.Builder
        if (Build.VERSION.SDK_INT >= 26) {
            // A channel's sound can't change afterwards: one with sound, one without.
            val id = createChannel(context, sound, intent.getStringExtra("channel") ?: title)
            builder = Notification.Builder(context, id)
        } else {
            @Suppress("DEPRECATION")
            builder = Notification.Builder(context).setVibrate(vibration).setPriority(Notification.PRIORITY_HIGH)
            @Suppress("DEPRECATION")
            if (sound) builder.setDefaults(Notification.DEFAULT_SOUND)
        }
        val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
        builder
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setCategory(Notification.CATEGORY_ALARM)
            .setAutoCancel(true)
        if (open != null) builder.setContentIntent(PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        nm.notify(RestTimer.NOTIFICATION_ID, builder.build())
    }
}

/**
 * RestTimer.tsx: the running timer as a pill (time left or "Rest over", −15, +15, stop). Shows nothing
 * when no timer runs, and ticks (once a second, on the second) only while shown. Also asks for the
 * notification permission the first time a timer starts (Android 13+).
 */
@Composable
fun RestTimerBar(state: AppState, timer: RestTimer, modifier: Modifier = Modifier) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (!ok) state.showToast(state.t("notifyDenied"))
    }
    LaunchedEffect(timer.askPermission) {
        if (timer.askPermission) {
            timer.askPermission = false
            if (Build.VERSION.SDK_INT >= 33) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    val endsAt = timer.endsAt
    if (endsAt == 0L) return
    var left by remember(endsAt) { mutableIntStateOf(secondsLeft(endsAt)) }
    LaunchedEffect(endsAt) {
        while (true) {
            val r = endsAt - SystemClock.elapsedRealtime()
            left = secondsLeft(endsAt)
            if (left <= -5) { timer.dismissBar(); break }
            // Sleep until the displayed second changes.
            delay(maxOf(20L, r - (left - 1) * 1000L + 1))
        }
    }
    val p = LocalPalette.current
    val over = left <= 0
    val fg = if (over) Color(0xFF1A1200) else p.primaryText
    val bg = if (over) p.gold else p.primary
    Row(
        modifier
            .navigationBarsPadding()
            .padding(bottom = 86.dp)
            .background(bg, CircleShape)
            .padding(start = 16.dp, top = 6.dp, end = 6.dp, bottom = 6.dp)
            .semantics { liveRegion = if (over) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Txt(if (over) state.t("restOver") else fmtTime(left.toDouble()), Modifier.defaultMinSize(minWidth = 52.dp).padding(end = 6.dp), bold = true, size = 18.sp, color = fg)
        if (!over) {
            TimerButton("−15", "−15 s", fg) { timer.add(-15) }
            TimerButton("+15", "+15 s", fg) { timer.add(15) }
        }
        TimerButton("✕", state.t("stopTimer"), fg) { timer.stop() }
    }
}

private fun secondsLeft(endsAt: Long): Int = Math.floorDiv(endsAt - SystemClock.elapsedRealtime() + 999, 1000L).toInt()

@Composable
private fun TimerButton(text: String, label: String, fg: Color, onClick: () -> Unit) {
    Box(
        Modifier
            .padding(start = 6.dp)
            .defaultMinSize(minWidth = 44.dp, minHeight = 44.dp)
            .background(Color(0x24000000), CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Txt(text, bold = true, size = 15.sp, color = fg)
    }
}
