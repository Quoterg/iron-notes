package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.ReviewChange
import io.github.quoterg.ironnotes.core.ReviewData
import io.github.quoterg.ironnotes.core.ReviewSpan
import io.github.quoterg.ironnotes.core.TrainingMode

// The cycle / block review (Review.tsx): strength per exercise over the period, effective reps per
// muscle per week with the readiness answers, and swaps for stalled, weaker or joint-flagged exercises
// (one tap in the program's routine when the exercise is in it).

/** The span choices: 0 = this cycle (Lyle), else the last n weeks. */
private fun spanOf(n: Int): ReviewSpan = if (n == 0) ReviewSpan.Cycle else ReviewSpan.Weeks(n.toUInt())

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReviewScreen(state: AppState) {
    val st = state.settings
    val cycle = if (st.mode == TrainingMode.LYLE) st.cycle else null
    var span by remember { mutableIntStateOf(if (cycle != null) 0 else 6) }
    var data by remember { mutableStateOf<ReviewData?>(null) }
    val req = remember { Latest() }
    var version by remember { mutableIntStateOf(0) }
    LaunchedEffect(span, st.mode, st.formula, st.cycle, version) {
        val rid = req.next()
        state.run({ it.reviewData(spanOf(span), today()) }) { if (req.isLatest(rid)) data = it }
    }
    // The cycle's week today (cycle.ts / lyle.ts `cycleWeek`): 1 = its first week, 0 before it starts.
    val week = cycle?.let { c -> daysBetween(c.start, today()).let { d -> if (d < 0) 0 else (d / 7 + 1).toInt() } } ?: 0

    Sheet(state.t("review"), { state.back() }, state.t("back")) {
        SheetBody {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 12.dp)) {
                val spans = if (cycle != null) listOf(0, 4, 6, 8) else listOf(4, 6, 8)
                spans.forEach { n -> Chip(if (n == 0) state.t("thisCycle") else state.t("weeksN", "n" to n), n == span, { span = n }) }
            }
            if (span == 0 && cycle != null) {
                val text = if (week > cycle.weeks) state.t("cycleDone")
                else state.t("cycleWeek", "n" to week, "N" to cycle.weeks.toInt(), "phase" to state.t(if (week <= 2) "runUp" else "push"))
                Txt(text, Modifier.padding(bottom = 8.dp), muted = true, small = true)
            }
            val d = data
            if (d == null) {
                Txt(state.t("loading"), Modifier.fillMaxWidth(), muted = true)
            } else if (d.changes.isEmpty()) {
                Txt(state.t("noWorkoutsInPeriod"), Modifier.fillMaxWidth(), muted = true)
            } else {
                Card {
                    Heading(state.t("strength"))
                    Txt(state.t("strengthHint"), Modifier.padding(bottom = 4.dp), muted = true, small = true)
                    d.changes.forEach { c ->
                        val ex = state.exById[c.exerciseId] ?: return@forEach
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            androidx.compose.foundation.layout.Column {
                                Txt(state.i18n.shown("exercises", ex.name), bold = true)
                                ChangeLine(state, c)
                            }
                        }
                    }
                }
                if (d.muscles.isNotEmpty()) {
                    Card {
                        Heading(state.t("effPerMuscle"))
                        val top = d.muscles.first().total
                        d.muscles.forEach { m ->
                            val perWeek = Math.round(m.total / d.muscleWeeks).toInt()
                            val sore = if (m.stillSore > 0u) " · " + state.t("stillSoreN", "n" to m.stillSore.toInt(), "of" to (m.fresh + m.bitSore + m.stillSore).toInt()) else ""
                            MuscleBarRow(state, m.muscle, if (top > 0) m.total / top else 0.0, perWeek, m.sessions.toInt(), sore)
                        }
                    }
                }
                if (d.swaps.isNotEmpty()) {
                    Card {
                        Heading(state.t("toSwap"))
                        Txt(state.t("toSwapHint"), Modifier.padding(bottom = 4.dp), muted = true, small = true)
                        d.swaps.forEach { sw ->
                            val ex = state.exById[sw.exerciseId] ?: return@forEach
                            val why = state.t(when (sw.why) { "joint" -> "jointPain"; "weaker" -> "trendWeaker"; else -> "trendStalled" })
                            Row(Modifier.padding(top = 10.dp)) {
                                Txt(state.i18n.shown("exercises", ex.name), bold = true)
                                Txt(" · $why", muted = true, small = true, modifier = Modifier.padding(top = 2.dp))
                            }
                            if (sw.alternatives.isEmpty()) {
                                Txt(state.t("noAlternatives"), Modifier.padding(top = 6.dp), muted = true, small = true)
                            } else {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                                    sw.alternatives.forEach { a ->
                                        val name = state.i18n.shown("exercises", a.name)
                                        if (sw.inProgram && d.hasProgram) {
                                            Chip(state.t("swapInProgram", "name" to name), false, {
                                                state.run({ it.swapInProgram(ex.id, a.id) }) { done ->
                                                    if (done) {
                                                        RoutineStore.load(state)
                                                        state.showToast(state.t("swapped", "from" to state.i18n.shown("exercises", ex.name), "to" to name))
                                                        version++
                                                    }
                                                }
                                            })
                                        } else {
                                            Chip(name, false, { state.open(Screen.Exercise(a.id, today())) })
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** "100 kg → 110 kg  +10 %  · 4 workouts", or reps when body weight alone. */
@Composable
private fun ChangeLine(state: AppState, c: ReviewChange) {
    val st = state.settings
    val p = LocalPalette.current
    val text = if (c.isLoad) "${state.i18n.weight(c.first, st)} → ${state.i18n.weight(c.last, st)}"
    else "${Math.round(c.first)} → ${Math.round(c.last)} ${state.t("reps").lowercase()}"
    val ch = c.change
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Txt(text, muted = true, small = true)
        if (ch != null) {
            if (Math.abs(ch) < 0.0005) Txt("±0 %", small = true, bold = true)
            else Txt((if (ch > 0) "+" else "−") + state.i18n.dnum(Math.abs(ch) * 100, 1) + " %", small = true, bold = true, color = if (ch > 0) p.accent else p.over)
        }
        Txt("· ${c.sessions} ${state.t("workoutsCount")}", muted = true, small = true)
    }
}
