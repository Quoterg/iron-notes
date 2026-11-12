package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.GuideTarget
import io.github.quoterg.ironnotes.core.MuscleId
import io.github.quoterg.ironnotes.core.PlatesHint
import io.github.quoterg.ironnotes.core.TrainingMode
import io.github.quoterg.ironnotes.core.WarmupHint
import io.github.quoterg.ironnotes.core.WorkoutSet
import io.github.quoterg.ironnotes.core.wToUser

// The training-mode parts of the logging screen (ExerciseScreen.tsx): effort inputs, the target line,
// plates, warm-ups, readiness, joint pain and effective-rep badges. The numbers come from the core's
// `exerciseGuide`; this file only shows them.

/** effective.ts `MAX_RIR`: RIR above this is stored as 5 ("5+"). */
internal const val MAX_RIR = 5

/** targets.ts `DORIAN_TOP`: the default top of the rep range. */
internal const val DORIAN_TOP = 12.0

/** The effort a mode logs with a set; each field replaces the set's (null = not given). */
internal class Effort(val warmup: Boolean?, val rir: Double?, val after: Double?, val deload: Boolean?)

/**
 * ExerciseScreen.tsx `effortOf`: null when the exercise has no reps or the mode is Standard (the set's
 * effort is left as it is). Dorian: a warm-up has none; a lighter week stops short of failure (RIR 1) and
 * stays out of progression; else RIR 0 plus the reps after failure. Lyle: the chosen RIR only.
 */
internal fun effortOf(f: Form, hasReps: Boolean, mode: TrainingMode, light: Boolean): Effort? {
    if (!hasReps || mode == TrainingMode.STANDARD) return null
    if (mode == TrainingMode.DORIAN) {
        if (f.warmup) return Effort(warmup = true, rir = null, after = null, deload = null)
        if (light) return Effort(warmup = null, rir = 1.0, after = null, deload = true)
        val after = Math.floor((parse(f.after) ?: 0.0) + 0.5)
        return Effort(warmup = null, rir = 0.0, after = if (after > 0) after else null, deload = null)
    }
    val rir = parse(f.rir)
    return Effort(warmup = null, rir = rir?.let { minOf(Math.floor(it + 0.5), MAX_RIR.toDouble()) }, after = null, deload = null)
}

/** A set to seed the form from a target (`seedOf`): last time's set with the target's weight and reps. */
internal fun seedOf(tg: GuideTarget, id: String, date: String): WorkoutSet =
    (tg.prev ?: blankSet(id, date)).copy(weight = tg.weight, reps = tg.reps)

internal fun blankSet(id: String, date: String) = WorkoutSet(
    id = "", date = date, exerciseId = id, order = 0.0, weight = null, reps = null, distance = null, time = null,
    comment = null, group = null, done = null, planned = null, rir = null, after = null, warmup = null,
    deload = null, sore = null, at = null,
)

/** The i18n key of a muscle ("FRONT_DELTS" → "mu_frontDelts"). */
internal fun muscleKey(m: MuscleId): String =
    "mu_" + m.name.lowercase().split('_').mapIndexed { i, p -> if (i == 0) p else p.replaceFirstChar { it.uppercase() } }.joinToString("")

/** Working sets done today: not planned, not warm-ups, with reps. */
internal fun workingDone(todays: List<WorkoutSet>): Int =
    todays.count { it.planned != true && it.warmup != true && (it.reps ?: 0.0) > 0 }

/** Warm-up weights can coincide after rounding (a light lift): each weight once. */
internal fun distinctWarmups(l: List<WarmupHint>): List<WarmupHint> = l.distinctBy { it.weight }

/** `.hint`: a note box. */
@Composable
internal fun Hint(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier.fillMaxWidth().padding(bottom = 10.dp).background(p.card, shape).border(1.dp, p.accent, shape).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

/** The "muscle was trained N days ago" hints (Dorian). */
@Composable
internal fun TooSoon(state: AppState, guide: io.github.quoterg.ironnotes.core.ExerciseGuide) {
    guide.tooSoon.forEach { x ->
        val days = x.days.toInt()
        Hint { Txt(state.t(if (days == 1) "tooSoon1" else "tooSoon", "muscle" to state.t(muscleKey(x.muscle)), "n" to days), small = true) }
    }
}

/** Fresh / a bit sore / still sore before a muscle's first set; "still sore" suggests the next step. */
@Composable
internal fun Readiness(state: AppState, ex: Exercise, guide: io.github.quoterg.ironnotes.core.ExerciseGuide, dorian: Boolean, date: String, sore: Int?, onSore: (Int?) -> Unit) {
    val muscles = ex.muscles?.primary?.joinToString(", ") { state.t(muscleKey(it)) } ?: ""
    Column(Modifier.padding(bottom = 10.dp)) {
        Txt(state.t("recoveredQ", "muscle" to muscles), Modifier.padding(bottom = 4.dp), muted = true, small = true)
        Chips {
            listOf("fresh", "bitSore", "stillSore").forEachIndexed { i, k ->
                Chip(state.t(k), sore == i, { onSore(if (sore == i) null else i) }, Modifier.semantics { this.selected = sore == i })
            }
        }
        if (sore == 2) {
            val swap = guide.swapDay
            val program = state.settings.program
            Hint(Modifier.padding(top = 8.dp)) {
                Txt(
                    if (dorian) (if (swap != null) state.t("soreDorianSwap", "day" to swap.name) else state.t("soreDorian")) else state.t("soreLyle"),
                    small = true,
                )
                if (dorian && swap != null && program != null) {
                    Btn(state.t("logInstead", "day" to swap.name), {
                        state.run({ it.logRoutineDay(program.routineId, swap.id, date) }) {
                            state.loadDay(date)
                            state.back()
                        }
                    }, small = true)
                }
            }
        }
    }
}

/** A wrapping row of chips. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Chips(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    FlowRow(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
}

/** Joint pain flag (no weight increase), with same-muscle swap suggestions when it is on. */
@Composable
internal fun JointRow(state: AppState, ex: Exercise, onToggle: () -> Unit, onSwap: (String) -> Unit) {
    val on = ex.joint == true
    Chips(Modifier.padding(bottom = 10.dp)) {
        Chip(state.t("jointPain"), on, onToggle, Modifier.semantics { this.selected = on })
        if (on) {
            val first = ex.muscles?.primary?.firstOrNull()
            state.exercises.filter { it.id != ex.id && first != null && it.muscles?.primary?.firstOrNull() == first }.take(5).forEach { x ->
                Chip(state.t("swapTo", "name" to state.i18n.shown("exercises", x.name)), false, { onSwap(x.id) })
            }
        }
    }
}

/** The plates per side for a target weight (rounding is on for this exercise). */
@Composable
internal fun PlatesLine(state: AppState, hint: PlatesHint) {
    val text = if (hint.perSide.isEmpty()) state.t("barOnly") else hint.perSide.joinToString(" + ") { state.i18n.dnum(it, 2) }
    Txt("${state.t("perSide")}: $text", Modifier.padding(bottom = 10.dp), muted = true, small = true)
}

/** Warm-up chips for the target weight: tapping one fills the form as a warm-up. */
@Composable
internal fun WarmupChips(state: AppState, warmups: List<WarmupHint>, onPick: (WarmupHint) -> Unit) {
    if (warmups.isEmpty()) return
    val st = state.settings
    Column(Modifier.padding(bottom = 10.dp)) {
        Txt("${state.t("warmupsHint")}:", Modifier.padding(bottom = 4.dp), muted = true, small = true)
        Chips {
            warmups.forEach { w -> Chip("${state.i18n.weight(w.weight, st)} × ${num(w.reps)}", false, { onPick(w) }) }
        }
    }
}

/** Sets the form from a tapped warm-up. */
internal fun Form.pickWarmup(w: WarmupHint, st: io.github.quoterg.ironnotes.core.Settings) {
    weight = num(wToUser(w.weight, st.unit), 3)
    reps = num(w.reps)
    warmup = true
    after = ""
}

/** The Dorian target line: "Set 2 target: 80 kg × 8+" and why. */
@Composable
internal fun DorianTarget(state: AppState, ex: Exercise, tg: GuideTarget, n: Int, gapDays: Double) {
    val reps = tg.reps?.takeIf { it > 0 }
    Column(Modifier.padding(bottom = 10.dp)) {
        Txt(
            "${state.t("targetSet", "n" to n)}: ${state.i18n.weight(tg.weight, state.settings)}" +
                (reps?.let { " × ${num(it)}${if (tg.why == "light") "" else "+"}" } ?: ""),
            bold = true, small = true,
        )
        val prevReps = tg.prev?.reps?.let { num(it) } ?: ""
        val why = when (tg.why) {
            "light" -> state.t("targetLight")
            "gap" -> state.t("targetGap", "n" to num(gapDays))
            "joint" -> state.t("jointHold")
            "up" -> state.t("targetUp", "reps" to prevReps, "top" to num(ex.repTop ?: DORIAN_TOP))
            else -> if (tg.prev?.reps != null) state.t("targetBeat", "reps" to prevReps) else ""
        }
        if (why.isNotEmpty()) Txt(why, muted = true, small = true)
    }
}

/** The Lyle target line: cycle week, "Target: 80 kg × 8+" and why. */
@Composable
internal fun LyleTarget(state: AppState, tg: GuideTarget, cycleWeeks: Int?, gapDays: Double) {
    val week = tg.week.toInt()
    val runUp = tg.why.equals("runup", ignoreCase = true)
    val head = if (cycleWeeks != null && week in 1..cycleWeeks) {
        state.t("cycleWeek", "n" to week, "N" to cycleWeeks, "phase" to state.t(if (week <= 2) "runUp" else "push")) + " · "
    } else ""
    val reps = tg.reps ?: 0.0
    Column(Modifier.padding(bottom = 10.dp)) {
        Txt(
            "$head${state.t("target")}: ${state.i18n.weight(tg.weight, state.settings)} × ${num(reps)}${if (runUp || tg.why == "gap") "" else "+"}",
            bold = true, small = true,
        )
        val p = tg.prev
        val prevReps = p?.reps?.let { num(it) } ?: ""
        val why = when {
            runUp -> state.t("lyleRunUp", "rir" to if (week == 1) "2–3" else "1–2")
            tg.why == "up" -> state.t("lyleUp", "reps" to prevReps, "rir" to (p?.rir?.let { num(it) } ?: ""))
            tg.why == "grind" -> state.t("lyleGrind", "reps" to prevReps)
            tg.why == "norir" -> state.t("lyleNoRir", "reps" to prevReps)
            tg.why == "gap" -> state.t("lyleGap", "n" to num(gapDays))
            tg.why == "joint" -> state.t("jointHold")
            else -> state.t("lyleReps", "reps" to prevReps)
        }
        Txt(why, muted = true, small = true)
    }
}

/** What was logged about the effort ("Warm-up", "RIR 2", "+3", readiness), with a leading " · "; "" if none. */
internal fun effortText(state: AppState, s: WorkoutSet): String {
    val parts = listOfNotNull(
        when {
            s.warmup == true -> state.t("warmup")
            (s.rir ?: 0.0) > 0 -> state.t("rirShort", "n" to if (s.rir!! >= MAX_RIR) "5+" else num(s.rir!!))
            else -> null
        },
        s.after?.takeIf { it > 0 }?.let { "+${num(it)}" },
        s.sore?.toInt()?.let { listOf("fresh", "bitSore", "stillSore").getOrNull(it) }?.let { state.t(it) },
    )
    return if (parts.isEmpty()) "" else " · " + parts.joinToString(" ")
}

/** `.eff`: "12 eff." (≈ when estimated); muted when zero. */
@Composable
internal fun EffBadge(state: AppState, e: io.github.quoterg.ironnotes.core.SetEffort) {
    val p = LocalPalette.current
    Txt(state.t("effShort", "n" to (if (e.est) "≈" else "") + state.i18n.dnum(e.n)), size = 12.sp, color = if (e.n > 0) p.accent else p.muted)
}

/** The Lyle RIR chips (0–5+), chosen per set. */
@Composable
internal fun RirChips(state: AppState, form: Form) {
    Column(Modifier.padding(bottom = 10.dp)) {
        Txt("${state.t("rir")} (${state.t("rirHint")})", Modifier.padding(bottom = 4.dp), muted = true, small = true)
        Chips {
            listOf("0", "1", "2", "3", "4", "5").forEach { r ->
                Chip(if (r == "5") "5+" else r, form.rir == r, { form.rir = if (form.rir == r) "" else r }, Modifier.semantics { this.selected = form.rir == r })
            }
        }
    }
}
