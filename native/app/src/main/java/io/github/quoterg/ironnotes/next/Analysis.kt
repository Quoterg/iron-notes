package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.MuscleId
import io.github.quoterg.ironnotes.core.StatsPeriod
import io.github.quoterg.ironnotes.core.StatsSummary
import io.github.quoterg.ironnotes.core.TrainingMode
import io.github.quoterg.ironnotes.core.fmtTime
import io.github.quoterg.ironnotes.core.addDays
import io.github.quoterg.ironnotes.core.wToUser
import java.text.SimpleDateFormat

// Statistics (Analysis.tsx): totals, workouts per week, categories, effective reps per muscle, top
// exercises for a period. One call to the core; bars are drawn with Box / Canvas.

private val PERIODS = listOf(
    StatsPeriod.WEEK to "p_week", StatsPeriod.MONTH to "p_month", StatsPeriod.MONTHS3 to "p_3m",
    StatsPeriod.YEAR to "p_year", StatsPeriod.ALL to "p_all", StatsPeriod.CUSTOM to "p_custom",
)

/** Analysis.tsx: a new "from" can't be after "to". */
internal fun pickFrom(picked: String, to: String): String = if (picked > to) to else picked

/** Analysis.tsx: a new "to" is at most today and not before "from". */
internal fun pickTo(picked: String, from: String, today: String): String = maxOf(minOf(picked, today), from)

/** A button showing a date that opens the framework's DatePickerDialog (min/max inclusive; "" = open). */
@Composable
private fun DateField(label: String, value: String, min: String, max: String, onPick: (String) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val c = parseIso(value)
    Column(modifier) {
        Txt(label, muted = true, small = true)
        Btn(value, {
            val dlg = android.app.DatePickerDialog(
                ctx,
                { _, y, m, d -> onPick(isoDate(java.util.Calendar.getInstance().apply { clear(); set(y, m, d) })) },
                c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH), c.get(java.util.Calendar.DAY_OF_MONTH),
            )
            if (min.isNotEmpty()) dlg.datePicker.minDate = parseIso(min).timeInMillis
            if (max.isNotEmpty()) dlg.datePicker.maxDate = parseIso(max).timeInMillis + 86_399_000L
            dlg.show()
        }, Modifier.fillMaxWidth())
    }
}
private const val TOP = 10

/** The web's `mu_<id>` string key of a muscle (FRONT_DELTS → mu_frontDelts). */
internal fun muscleStringKey(m: MuscleId): String {
    val parts = m.name.lowercase().split('_')
    return "mu_" + parts.first() + parts.drop(1).joinToString("") { it.replaceFirstChar(Char::uppercase) }
}

/** A horizontal bar: `fraction` of the width filled. */
@Composable
internal fun StatBar(fraction: Double, modifier: Modifier = Modifier, color: Color? = null) {
    val p = LocalPalette.current
    Box(modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(p.line, CircleShape)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0.0, 1.0).toFloat()).height(8.dp).background(color ?: p.accent, CircleShape))
    }
}

/** Effective reps per muscle: name, bar, per-week number and main sessions (shared by Statistics and the review). */
@Composable
internal fun MuscleBarRow(state: AppState, muscle: MuscleId, fraction: Double, perWeek: Int, sessions: Int, extra: String = "") {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Txt(state.t(muscleStringKey(muscle)))
            Txt(perWeek.toString(), bold = true)
        }
        StatBar(fraction, Modifier.padding(vertical = 3.dp))
        val sess = if (sessions == 1) state.t("mainSession1") else state.t("mainSessions", "n" to sessions)
        Txt(state.t("effPerWeek", "n" to perWeek) + " · " + sess + extra, muted = true, small = true)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AnalysisScreen(state: AppState) {
    val st = state.settings
    var period by remember { mutableStateOf(StatsPeriod.MONTH) }
    val now = today()
    var from by remember { mutableStateOf(addDays(now, -29)) }
    var to by remember { mutableStateOf(now) }
    var by by remember { mutableStateOf("sets") }
    var sum by remember { mutableStateOf<StatsSummary?>(null) }
    val req = remember { Latest() }
    LaunchedEffect(period, if (period == StatsPeriod.CUSTOM) from else "", if (period == StatsPeriod.CUSTOM) to else "", st.formula, st.mode, st.weekStart) {
        val rid = req.next()
        sum = null
        state.run({ it.statsSummary(period, today(), from, to) }) { if (req.isLatest(rid)) sum = it }
    }

    Sheet(state.t("analysis"), { state.back() }, state.t("back")) {
        SheetBody {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 12.dp)) {
                PERIODS.forEach { (p, key) -> Chip(state.t(key), p == period, { period = p }) }
            }
            if (period == StatsPeriod.CUSTOM) {
                Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DateField(state.t("from"), from, "", to, { from = pickFrom(it, to) }, Modifier.weight(1f))
                    DateField(state.t("to"), to, from, now, { to = pickTo(it, from, now) }, Modifier.weight(1f))
                }
            }
            val s = sum
            if (s == null) {
                Txt(state.t("loading"), Modifier.fillMaxWidth(), muted = true)
            } else if (s.workouts == 0u) {
                Txt(state.t("noWorkoutsInPeriod"), Modifier.fillMaxWidth(), muted = true)
            } else {
                Totals(state, s)
                if (s.weeks.size > 1) {
                    Card {
                        Heading(state.t("workoutsPerWeek"))
                        WeekBars(state, s)
                    }
                }
                Card {
                    Heading(state.t("categories"))
                    Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Chip(state.t("statSets"), by == "sets", { by = "sets" })
                        Chip(state.t("statVolume"), by == "volume", { by = "volume" })
                    }
                    val cats = s.categories.sortedByDescending { if (by == "sets") it.sets.toDouble() else it.volume }.filter { (if (by == "sets") it.sets.toDouble() else it.volume) > 0 }
                    val max = cats.maxOfOrNull { if (by == "sets") it.sets.toDouble() else it.volume } ?: 1.0
                    cats.forEach { c ->
                        val cat = state.catById[c.categoryId]
                        val v = if (by == "sets") c.sets.toDouble() else c.volume
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Txt(cat?.let { state.i18n.shown("categories", it.name) } ?: "–")
                                Txt(if (by == "sets") c.sets.toString() else state.i18n.weight(c.volume, st), bold = true)
                            }
                            StatBar(v / max, Modifier.padding(top = 3.dp), parseColor(cat?.color))
                        }
                    }
                }
                if (s.muscles.isNotEmpty()) {
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Heading(state.t("effPerMuscle"), Modifier.weight(1f))
                            InfoBtn(state, Topic.EFF)
                        }
                        Txt(state.t("effPerMuscleHint", "weeks" to state.i18n.dnum(s.muscleWeeks, 1)), Modifier.padding(bottom = 4.dp), muted = true, small = true)
                        val top = s.muscles.first().total
                        s.muscles.forEach { m ->
                            MuscleBarRow(state, m.muscle, if (top > 0) m.total / top else 0.0, Math.round(m.total / s.muscleWeeks).toInt(), m.sessions.toInt())
                        }
                        Actions { Btn(state.t("muscles"), { state.open(Screen.Muscles) }, Modifier.fillMaxWidth()) }
                    }
                }
                Card {
                    Heading(state.t("topExercises"))
                    s.exercises.take(TOP).forEach { e ->
                        val ex = state.exById[e.exerciseId] ?: return@forEach
                        val first = e.firstOrm
                        val last = e.lastOrm
                        val change = if (first != null && last != null && first > 0 && last != first) (last / first - 1) * 100 else null
                        Row(
                            Modifier.fillMaxWidth().clickable(role = Role.Button) { state.open(Screen.Exercise(e.exerciseId, today())) }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Dot(state.catById[ex.categoryId]?.color)
                            Column(Modifier.weight(1f)) {
                                Txt(state.i18n.shown("exercises", ex.name), bold = true)
                                val orm = if (last != null) " · ${state.t("est1rm")} ${state.i18n.dnum(wToUser(last, st.unit), 1)} ${unitLabel(st.unit)}" else ""
                                Txt("${e.workouts} × · ${state.tn("oneSet", "nSets", e.sets.toInt())}$orm", muted = true, small = true)
                                if (change != null) {
                                    val up = change > 0
                                    Txt((if (up) "+" else "−") + state.i18n.dnum(Math.abs(change), 1) + " %", small = true, bold = true, color = if (up) LocalPalette.current.accent else LocalPalette.current.over)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Totals(state: AppState, s: StatsSummary) {
    val st = state.settings
    val tiles = buildList {
        add(state.t("statWorkouts") to s.workouts.toString())
        add(state.t("statSets") to s.sets.toString())
        add(state.t("repsCol") to s.reps.toString())
        add(state.t("statVolume") to state.i18n.weight(s.volume, st))
        if (s.effectiveTotal > 0) add(state.t("statEffective") to (if (st.mode == TrainingMode.STANDARD) "≈" else "") + Math.round(s.effectiveTotal))
        if (s.time > 0) add(state.t("time") to fmtTime(s.time))
        if (s.distance > 0) add(state.t("distance") to state.i18n.distance(s.distance, st))
    }
    tiles.chunked(2).forEach { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            row.forEach { (label, value) ->
                Box(Modifier.weight(1f)) {
                    Card {
                        Txt(value, bold = true, size = 22.sp)
                        Txt(label, muted = true, small = true)
                    }
                }
            }
            if (row.size == 1) Box(Modifier.weight(1f))
        }
    }
}

/** Workout days per week as bars (Canvas), with the first and last week's date under them. */
@Composable
private fun WeekBars(state: AppState, s: StatsSummary) {
    val p = LocalPalette.current
    val weeks = s.weeks
    val max = (weeks.maxOf { it.workouts }.toInt()).coerceAtLeast(1)
    val total = weeks.sumOf { it.workouts.toInt() }
    val avg = state.i18n.dnum(total.toDouble() / weeks.size, 1)
    val fmt = remember(state.i18n.lang) { SimpleDateFormat("d MMM", state.locale()) }
    Canvas(
        Modifier.fillMaxWidth().height(100.dp).padding(top = 8.dp).semantics { contentDescription = "${state.t("workoutsPerWeek")}: $avg ${state.t("perWeekAvg")}" },
    ) {
        val bw = size.width / weeks.size
        val base = size.height
        weeks.forEachIndexed { i, w ->
            val h = size.height * w.workouts.toInt() / max
            drawRoundRect(p.accent, Offset(i * bw + bw * 0.15f, base - h), Size((bw * 0.7f).coerceAtLeast(1f), h), CornerRadius(minOf(6f, bw * 0.2f)))
        }
        drawLine(p.line, Offset(0f, base), Offset(size.width, base), 2f)
    }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Txt(fmt.format(parseIso(weeks.first().start).time), muted = true, small = true)
        Txt("$avg ${state.t("perWeekAvg")}", muted = true, small = true)
        Txt(fmt.format(parseIso(weeks.last().start).time), muted = true, small = true)
    }
}
