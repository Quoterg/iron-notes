package io.github.quoterg.ironnotes.next

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.background
import io.github.quoterg.ironnotes.core.CoreException
import io.github.quoterg.ironnotes.core.CycleSettings
import io.github.quoterg.ironnotes.core.Diet
import io.github.quoterg.ironnotes.core.DistUnit
import io.github.quoterg.ironnotes.core.Formula
import io.github.quoterg.ironnotes.core.Lang
import io.github.quoterg.ironnotes.core.LightSettings
import io.github.quoterg.ironnotes.core.PlatesSettings
import io.github.quoterg.ironnotes.core.Settings
import io.github.quoterg.ironnotes.core.TrainingMode
import io.github.quoterg.ironnotes.core.WeightUnit
import io.github.quoterg.ironnotes.core.addDays
import io.github.quoterg.ironnotes.core.cleanPlateSizes
import io.github.quoterg.ironnotes.core.defaultPlateSet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Theme.ts `ThemeChoice`: Auto follows the phone, Day is "Daylight", Night is "Hologram". Kept per device. */
enum class ThemeChoice(val night: Boolean?) {
    AUTO(null), DAY(false), NIGHT(true);

    companion object {
        private const val FILE = "iron-notes-prefs"
        private const val KEY = "iron-notes-theme"

        @SuppressLint("UseKtx")
        fun load(context: Context): ThemeChoice =
            try {
                when (context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)) {
                    "day" -> DAY
                    "night" -> NIGHT
                    else -> AUTO
                }
            } catch (_: Exception) {
                AUTO
            }

        @SuppressLint("UseKtx")
        fun save(context: Context, c: ThemeChoice) {
            val e = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            if (c == AUTO) e.remove(KEY) else e.putString(KEY, c.name.lowercase())
            e.apply()
        }
    }
}

// ---- Pure helpers (unit-tested) ----

/** lyle.ts `CYCLE_WEEKS`, `DEFAULT_CYCLE`, `RUN_UP.length`. */
val CYCLE_WEEKS = listOf(6, 8)
const val DEFAULT_CYCLE = 6
private const val RUN_UP_WEEKS = 2

/** lyle.ts `cycleWeek`: the cycle's week that `date` is in (1 = the first); 0 before it starts. */
fun cycleWeek(start: String, date: String): Int {
    val days = daysBetween(start, date)
    return if (days < 0) 0 else (days / 7).toInt() + 1
}

/** cycle.ts `LIGHT_DAYS`. */
const val LIGHT_DAYS = 7

/** cycle.ts `inLight`. */
fun inLight(light: LightSettings?, date: String): Boolean =
    light != null && date >= light.start && date < addDays(light.start, LIGHT_DAYS)

/** cycle.ts `lightEnd`: the last day of a lighter week. */
fun lightEnd(light: LightSettings): String = addDays(light.start, LIGHT_DAYS - 1)

/** The ISO time stamp of a backup (JS `toISOString`: UTC, milliseconds). */
fun backupStamp(now: Date = Date()): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(now)

/** The backup file's name (`iron-notes-<date>.json`, the date of the stamp). */
fun backupFileName(stamp: String): String = "iron-notes-${stamp.take(10)}.json"

/** A number typed into a plate field: a decimal comma is accepted. */
fun parsePlate(text: String): Double? = text.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() }

// ---- Screen ----

@Composable
private fun <T> Choice(label: String, options: List<Pair<T, String>>, value: T, onPick: (T) -> Unit, hideLabel: Boolean = false) {
    if (!hideLabel) Txt(label, Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
    FlowRow(
        Modifier.padding(vertical = if (hideLabel) 4.dp else 0.dp).semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (v, l) -> Chip(l, v == value, { onPick(v) }) }
    }
}

@Composable
private fun Check(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(6.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).toggleable(checked, role = Role.Checkbox, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(24.dp).clip(shape).background(if (checked) p.primary else p.inner, shape).border(1.dp, if (checked) p.primary else p.line, shape),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) Txt("✓", color = p.primaryText, bold = true, size = 16.sp)
        }
        Txt(label, Modifier.weight(1f))
    }
}

/** The Settings tab (Settings.tsx). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsTab(state: AppState) {
    val s = state.settings
    val ctx = LocalContext.current
    Column2 {
        UnitsCard(state, s)
        Card {
            Heading(state.t("appearance"))
            Choice(
                state.t("appearance"),
                listOf(ThemeChoice.AUTO to state.t("themeAuto"), ThemeChoice.DAY to state.t("themeDay"), ThemeChoice.NIGHT to state.t("themeNight")),
                state.theme, { state.chooseTheme(it) }, hideLabel = true,
            )
        }
        TimerCard(state, s)
        LanguageCard(state, s)
        ModeCard(state, s)
        LoggingCard(state, s)
        BackupCard(state, ctx)
        Card {
            Heading(state.t("about"))
            Txt(state.t("aboutText"), muted = true, small = true)
        }
    }
}

@Composable
private fun Column2(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 640.dp).fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp, 12.dp, 16.dp, 160.dp),
            content = content,
        )
    }
}

@Composable
private fun UnitsCard(state: AppState, s: Settings) {
    Card {
        Heading(state.t("units"))
        Choice(state.t("weightUnit"), listOf(WeightUnit.KG to "kg", WeightUnit.LB to "lb"), s.unit, { state.putSettings(s.copy(unit = it)) })
        Choice(state.t("distanceUnit"), listOf(DistUnit.KM to "km", DistUnit.MI to "mi", DistUnit.M to "m"), s.dist, { state.putSettings(s.copy(dist = it)) })
    }
}

@Composable
private fun TimerCard(state: AppState, s: Settings) {
    var rest by remember(s.rest) { mutableStateOf(num(s.rest, 0)) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) state.putSettings(state.settings.copy(restNotify = true)) else state.showToast(state.t("notifyDenied"))
    }
    val ctx = LocalContext.current
    Card {
        Heading(state.t("timer"))
        Txt(state.t("defaultRest"), Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
        Field(rest, {
            rest = it.filter(Char::isDigit)
            rest.toIntOrNull()?.takeIf { v -> v > 0 }?.let { v -> state.putSettings(s.copy(rest = v.toDouble())) }
        }, state.t("defaultRest"), Modifier.widthIn(min = 120.dp), number = true)
        Check(state.t("autoTimer"), s.autoTimer) { state.putSettings(s.copy(autoTimer = it)) }
        Check(state.t("timerSound"), s.timerSound) { state.putSettings(s.copy(timerSound = it)) }
        // The rest timer's own default (RestTimer.start) is on unless switched off.
        Check(state.t("restNotify"), s.restNotify != false) { on ->
            val granted = Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
            // Asked only when turned on, from the tap; refused -> stays off and says so.
            if (on && !granted) launcher.launch(Manifest.permission.POST_NOTIFICATIONS) else state.putSettings(s.copy(restNotify = on))
        }
    }
}

@Composable
private fun LanguageCard(state: AppState, s: Settings) {
    Card {
        Heading(state.t("language"))
        Choice(
            state.t("language"),
            listOf<Pair<Lang?, String>>(null to state.t("langAuto"), Lang.EN to "English", Lang.SV to "Svenska"),
            s.lang, { state.putSettings(s.copy(lang = it)) }, hideLabel = true,
        )
        if (state.i18n.lang == "sv") {
            Check(state.t("gymEnglish"), s.gymEnglish == true) { state.putSettings(s.copy(gymEnglish = it)) }
            Txt(state.t("gymEnglishHint"), muted = true, small = true)
        }
    }
}

@Composable
private fun ModeCard(state: AppState, s: Settings) {
    Card {
        Heading(state.t("trainingMode"))
        Choice(
            state.t("trainingMode"),
            listOf(TrainingMode.STANDARD to state.t("modeStandard"), TrainingMode.DORIAN to state.t("modeDorian"), TrainingMode.LYLE to state.t("modeLyle")),
            s.mode, { state.putSettings(s.copy(mode = it)) }, hideLabel = true,
        )
        Txt(
            state.t(when (s.mode) { TrainingMode.DORIAN -> "modeDorianHint"; TrainingMode.LYLE -> "modeLyleHint"; else -> "modeStandardHint" }),
            Modifier.padding(vertical = 4.dp), muted = true, small = true,
        )
        if (s.mode != TrainingMode.STANDARD) {
            Choice(
                state.t("dietPhase"),
                listOf(Diet.BUILD to state.t("dietBuild"), Diet.MAINTAIN to state.t("dietMaintain"), Diet.CUT to state.t("dietCut")),
                s.diet ?: Diet.MAINTAIN, { state.putSettings(s.copy(diet = it)) },
            )
        }
        if (s.mode == TrainingMode.LYLE) CycleBlock(state, s)
        if (s.mode == TrainingMode.DORIAN) LightBlock(state, s)
        Btn(state.t("programs"), { state.open(Screen.Programs) }, Modifier.fillMaxWidth().padding(top = 8.dp))
        if (s.mode != TrainingMode.STANDARD) {
            Btn(state.t(if (s.mode == TrainingMode.LYLE) "reviewCycle" else "reviewWeeks"), { state.open(Screen.Review) }, Modifier.fillMaxWidth().padding(top = 8.dp))
        }
        Btn(state.t("muscles"), { state.open(Screen.Muscles) }, Modifier.fillMaxWidth().padding(top = 8.dp))
    }
}

/** Lyle mode's cycle: week n of N, its length, and starting the next one. */
@Composable
private fun CycleBlock(state: AppState, s: Settings) {
    val c = s.cycle
    val today = today()
    val week = if (c != null) cycleWeek(c.start, today) else 0
    var ask by remember { mutableStateOf(false) }
    val weeks = c?.weeks?.toInt() ?: 0
    fun start() {
        ask = false
        state.putSettings(s.copy(cycle = CycleSettings(today, (c?.weeks ?: DEFAULT_CYCLE.toDouble()))))
    }
    Txt(
        "${state.t("cycle")}: " + when {
            c == null -> state.t("cycleNone")
            week > weeks -> state.t("cycleDone")
            else -> state.t("cycleWeek", "n" to week, "N" to weeks, "phase" to state.t(if (week <= RUN_UP_WEEKS) "runUp" else "push"))
        },
        Modifier.padding(top = 8.dp), small = true,
    )
    if (c != null) {
        // Changeable mid-cycle: the start stays, only the push weeks get longer or shorter.
        Choice(
            state.t("cycleLength"), CYCLE_WEEKS.map { it to state.t("weeksN", "n" to it) }, weeks,
            { state.putSettings(s.copy(cycle = CycleSettings(c.start, it.toDouble()))) },
        )
    }
    if (ask) {
        ConfirmCard(state, state.t("startCycleQ", "n" to week, "N" to weeks), state.t("startCycle"), ::start, { ask = false })
    } else {
        Btn(state.t("startCycle"), { if (c != null && week <= weeks) ask = true else start() }, Modifier.fillMaxWidth().padding(top = 8.dp))
    }
}

/** Dorian HIT's lighter week: one week ~10 % lighter and short of failure. */
@Composable
private fun LightBlock(state: AppState, s: Settings) {
    val l = s.light
    val today = today()
    val on = inLight(l, today)
    val locale = if (state.i18n.lang == "sv") Locale("sv", "SE") else Locale.getDefault()
    Txt(
        if (on) state.t("lightUntil", "date" to SimpleDateFormat("EEE d MMM", locale).format(parseIso(lightEnd(l!!)).time)) else state.t("lightHint"),
        Modifier.padding(top = 8.dp), muted = true, small = true,
    )
    Btn(
        state.t(if (on) "endLight" else "startLight"),
        { state.putSettings(s.copy(light = if (on) null else LightSettings(today))) },
        Modifier.fillMaxWidth().padding(top = 8.dp),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LoggingCard(state: AppState, s: Settings) {
    var platesOpen by remember { mutableStateOf(false) }
    Card {
        Heading(state.t("logging"))
        Check(state.t("markDone"), s.markDone) { state.putSettings(s.copy(markDone = it)) }
        Check(state.t("keepScreenOn"), s.keepScreenOn) { state.putSettings(s.copy(keepScreenOn = it)) }
        Check(state.t("roundPlates"), s.roundPlates == true) { state.putSettings(s.copy(roundPlates = it)) }
        Choice(state.t("weekStart"), listOf(1 to state.t("monday"), 0 to state.t("sunday")), s.weekStart.toInt(), { state.putSettings(s.copy(weekStart = it.toUByte())) })
        Choice(state.t("formula"), listOf(Formula.EPLEY to "Epley", Formula.BRZYCKI to "Brzycki"), s.formula, { state.putSettings(s.copy(formula = it)) })
        Btn(state.t("manageExercises"), { state.open(Screen.ManageExercises) }, Modifier.fillMaxWidth().padding(top = 8.dp))
        Btn(state.t("tools"), { state.open(Screen.Tools(null, null)) }, Modifier.fillMaxWidth().padding(top = 8.dp))
        LinkBtn(state.t("plateSettings"), { platesOpen = !platesOpen }, Modifier.fillMaxWidth())
        if (platesOpen) PlatesEditor(state, s)
    }
}

/** Bar and plate sizes, saved for the current unit: plates as chips (x removes), added one at a time. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlatesEditor(state: AppState, s: Settings) {
    val cfg = s.plates?.takeIf { it.unit == s.unit } ?: defaultPlateSet(s.unit)
    var bar by remember(s.unit, cfg.bar) { mutableStateOf(num(cfg.bar)) }
    var add by remember { mutableStateOf("") }
    val unit = unitLabel(s.unit)
    fun save(b: Double, sizes: List<Double>): Boolean {
        val clean = cleanPlateSizes(b, sizes) ?: return false
        state.putSettings(s.copy(plates = PlatesSettings(s.unit, b, clean)))
        return true
    }
    val barValue = parsePlate(bar)
    val newPlate = parsePlate(add)
    val canAdd = newPlate != null && newPlate !in cfg.sizes && cleanPlateSizes(barValue ?: cfg.bar, cfg.sizes + newPlate) != null
    Txt("${state.t("barWeight")} ($unit)", Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
    Field(bar, {
        bar = it
        parsePlate(it)?.let { b -> save(b, cfg.sizes) }
    }, state.t("barWeight"), Modifier.widthIn(min = 120.dp), number = true)
    Txt("${state.t("plateSizes")} ($unit)", Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        cfg.sizes.forEach { p ->
            Box(Modifier.semantics { contentDescription = "${state.t("removePlate")} ${num(p)}" }) {
                Chip("${num(p)} ×", false, { if (cfg.sizes.size > 1) save(barValue ?: cfg.bar, cfg.sizes - p) })
            }
        }
    }
    Txt(state.t("addPlate"), Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Field(add, { add = it }, state.t("addPlate"), Modifier.widthIn(min = 120.dp), number = true)
        Btn("+", { if (canAdd && save(barValue ?: cfg.bar, cfg.sizes + newPlate!!)) add = "" }, enabled = canAdd, label = state.t("addPlate"))
    }
}

/** Backup: export/restore through the system file picker (Storage Access Framework). */
@Composable
private fun BackupCard(state: AppState, ctx: Context) {
    var restoreText by remember { mutableStateOf<String?>(null) }
    var stamp by remember { mutableStateOf("") }
    // Delete all: 0 idle, 1 first confirm, 2 backup written and asking again.
    var wipeStep by remember { mutableIntStateOf(0) }

    val wipeSaver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) {
            wipeStep = 0
            return@rememberLauncherForActivityResult
        }
        state.scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val json = Core.get(ctx).exportBackupJson(stamp)
                    (ctx.contentResolver.openOutputStream(uri, "wt") ?: error("no output")).use { it.write(json.toByteArray(Charsets.UTF_8)) }
                }
                wipeStep = 2
            } catch (e: Exception) {
                wipeStep = 0
                state.showToast(e.message ?: e.toString())
            }
        }
    }

    fun wipe() {
        wipeStep = 0
        state.scope.launch {
            try {
                withContext(Dispatchers.IO) { Core.get(ctx).deleteAll() }
            } catch (e: Exception) {
                state.showToast(e.message ?: e.toString())
                return@launch
            }
            RoutineStore.load(state)
            BodyStore.load(state)
            state.start()
            state.showToast(state.t("deletedAll"))
        }
    }

    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        state.run({ core ->
            val json = core.exportBackupJson(stamp)
            (ctx.contentResolver.openOutputStream(uri, "wt") ?: error("no output")).use { it.write(json.toByteArray(Charsets.UTF_8)) }
        })
    }
    val opener = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        state.run({ ctx.contentResolver.openInputStream(uri)?.use { readTextCapped(it) } ?: error(state.t("notBackup")) }) { restoreText = it }
    }

    fun restore(json: String) {
        restoreText = null
        state.scope.launch {
            try {
                withContext(Dispatchers.IO) { Core.get(ctx).importBackupJson(json) }
            } catch (e: CoreException.InvalidBackup) {
                state.showToast(state.t("notBackup"))
                return@launch
            } catch (e: Exception) {
                state.showToast(e.message ?: e.toString())
                return@launch
            }
            // Everything on screen was read before: load settings, the library and the day again.
            RoutineStore.load(state)
            BodyStore.load(state)
            state.start()
            state.showToast(state.t("restored"))
        }
    }

    Card {
        Heading(state.t("yourData"))
        Txt(state.t("storedOnDevice"), muted = true, small = true)
        Actions {
            Btn(state.t("exportBackup"), {
                stamp = backupStamp()
                saver.launch(backupFileName(stamp))
            })
            Btn(state.t("importBackup"), { opener.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) })
        }
        restoreText?.let { json -> ConfirmCard(state, state.t("importQ"), state.t("importBackup"), { restore(json) }, { restoreText = null }) }
        ImportSection(state)
        when (wipeStep) {
            0 -> Btn(state.t("deleteAll"), { wipeStep = 1 }, Modifier.fillMaxWidth().padding(top = 8.dp), kind = BtnKind.DANGER)
            1 -> ConfirmCard(state, state.t("deleteAllQ"), state.t("deleteAll"), {
                stamp = backupStamp()
                wipeSaver.launch(backupFileName(stamp))
            }, { wipeStep = 0 })
            else -> ConfirmCard(state, state.t("deleteAllAfterBackup"), state.t("deleteAll"), { wipe() }, { wipeStep = 0 })
        }
    }
}
