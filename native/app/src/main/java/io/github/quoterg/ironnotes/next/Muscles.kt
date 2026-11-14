package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.MuscleDrill
import io.github.quoterg.ironnotes.core.MuscleId
import io.github.quoterg.ironnotes.core.MuscleRow
import io.github.quoterg.ironnotes.core.MuscleStatus
import io.github.quoterg.ironnotes.core.MuscleSuggestion
import io.github.quoterg.ironnotes.core.MuscleWeekState
import io.github.quoterg.ironnotes.core.MusclesOverview
import java.text.Collator
import java.util.Locale

/** JS `Math.round` for display. */
internal fun jsRound(x: Double): Int = Math.floor(x + 0.5).toInt()

/**
 * Muscles (Muscles.tsx): effective reps per muscle group this week (a body map and bars, each main
 * session against the mode's goal) and the last 8 weeks; tap a muscle for what trained it and what
 * could train it today.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MusclesScreen(state: AppState) {
    val st = state.settings
    var data by remember { mutableStateOf<MusclesOverview?>(null) }
    var sel by remember { mutableStateOf<MuscleId?>(null) }
    val today = remember { today() }
    // Another mode / week start / formula, or changed sets (the day reloads), recounts.
    val latest = remember { Latest() }
    LaunchedEffect(st.mode, st.weekStart, st.formula, state.day) {
        val id = latest.next()
        state.run({ it.musclesOverview(today) }) { if (latest.isLatest(id)) data = it }
    }

    Sheet(state.t("muscles"), { state.back() }, state.t("back")) {
        SheetBody {
            val d = data
            val goal = d?.goal
            Txt(
                if (goal != null) state.t("musclesGoal", "goal" to goal.label) else state.t("musclesNoGoal"),
                Modifier.padding(bottom = 12.dp), muted = true, small = true,
            )
            if (d == null) {
                Txt(state.t("loading"), Modifier.fillMaxWidth(), muted = true, align = TextAlign.Center)
                return@SheetBody
            }
            val p = LocalPalette.current
            val byMuscle = d.rows.associateBy { it.muscle }
            val trained = d.rows.filter { it.trained }
            fun toggle(m: MuscleId) { sel = if (sel == m) null else m }
            val locale = if (state.i18n.lang == "sv") Locale("sv", "SE") else Locale.getDefault()
            val dayName = { date: String -> java.text.SimpleDateFormat("EEE", locale).format(parseIso(date).time) }

            Card {
                Heading(state.t("thisWeek"))
                BodyMap(
                    state,
                    stateOf = { byMuscle[it]?.state ?: MuscleWeekState.NOTHING },
                    label = { m ->
                        val r = byMuscle[m]
                        val word = when (r?.state) {
                            MuscleWeekState.UNDER -> state.t("mmUnder")
                            MuscleWeekState.IN -> state.t("mmIn")
                            MuscleWeekState.OVER -> state.t("mmOver")
                            else -> ""
                        }
                        "${state.t(muscleKey(m))}: ${jsRound(r?.total ?: 0.0)}" + if (word.isNotEmpty()) ", $word" else ""
                    },
                    selected = sel,
                    onSelect = ::toggle,
                )
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    if (goal != null) {
                        Key(p.muted.copy(alpha = 0.75f), state.t("mmUnder"))
                        Key(p.accent, state.t("mmIn"))
                        Key(p.over, state.t("mmOver"))
                    } else {
                        Key(p.accent, state.t("mmTrained"))
                    }
                }
                sel?.let { m -> d.drills.firstOrNull { it.muscle == m }?.let { Drill(state, it) } }
                if (trained.isEmpty()) Txt(state.t("musclesEmpty"), Modifier.fillMaxWidth().padding(vertical = 8.dp), muted = true, align = TextAlign.Center)
                for (r in trained) {
                    val total = jsRound(r.total)
                    val on = sel == r.muscle
                    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                Modifier.width(110.dp).height(36.dp).clickable(role = Role.Button) { toggle(r.muscle) }
                                    .semantics { selected = on },
                                contentAlignment = Alignment.CenterStart,
                            ) {
                                Txt(state.t(muscleKey(r.muscle)), bold = on, color = if (on) p.accent else null)
                            }
                            Box(Modifier.weight(1f).height(10.dp).clip(RoundedCornerShape(5.dp)).background(p.active)) {
                                Box(
                                    Modifier.fillMaxHeight().fillMaxWidth((total / d.scale).toFloat().coerceIn(0.001f, 1f))
                                        .clip(RoundedCornerShape(5.dp)).background(p.accent),
                                )
                            }
                            Txt("$total", Modifier.width(40.dp), align = TextAlign.End)
                        }
                        if (r.sessions.isNotEmpty()) {
                            FlowRow(Modifier.padding(start = 118.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                for (x in r.sessions) {
                                    val c = when (x.status) {
                                        MuscleStatus.IN -> p.accent
                                        MuscleStatus.OVER -> p.over
                                        else -> p.muted
                                    }
                                    Txt("${dayName(x.date)} ${jsRound(x.n)}", small = true, color = c)
                                }
                            }
                        }
                    }
                }
            }
            if (trained.isNotEmpty()) {
                Card {
                    Heading(state.t("lastWeeks", "n" to d.weekStarts.size))
                    for (r in trained) History(state, r)
                }
            }
        }
    }
}

/** `.mm-key`: a legend swatch with its word. */
@Composable
private fun Key(color: Color, text: String) {
    Box(Modifier.padding(start = 10.dp, end = 4.dp).width(10.dp).height(10.dp).clip(RoundedCornerShape(3.dp)).background(color))
    Txt(text, muted = true, small = true)
}

/** One muscle's last weeks as small bars (`.mu-hist`). */
@Composable
private fun History(state: AppState, r: MuscleRow) {
    val p = LocalPalette.current
    val max = maxOf(1.0, r.history.maxOrNull() ?: 0.0)
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp)
            .semantics { contentDescription = "${state.t(muscleKey(r.muscle))}: ${r.history.joinToString(", ") { jsRound(it).toString() }}" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Txt(state.t(muscleKey(r.muscle)), Modifier.width(110.dp))
        Row(Modifier.weight(1f).height(24.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Bottom) {
            for (v in r.history) {
                val frac = (maxOf(4.0, v / max * 100) / 100).toFloat()
                Box(
                    Modifier.weight(1f).fillMaxHeight(frac).clip(RoundedCornerShape(2.dp))
                        .background(if (v > 0) p.accent.copy(alpha = 0.8f) else p.muted.copy(alpha = 0.3f)),
                )
            }
        }
    }
}

/** A muscle's week: the exercises that trained it, and exercises to train it today (favourites first). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Drill(state: AppState, d: MuscleDrill) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(12.dp)
    val locale = if (state.i18n.lang == "sv") Locale("sv", "SE") else Locale.getDefault()
    val train = remember(d, state.i18n.lang) {
        val collator = Collator.getInstance(locale)
        val cmp = Comparator<Pair<MuscleSuggestion, String>> { a, b ->
            if (a.first.favorite != b.first.favorite) (if (a.first.favorite) -1 else 1) else collator.compare(a.second, b.second)
        }
        d.suggestions.map { it to state.i18n.shown("exercises", it.name) }.sortedWith(cmp).take(4)
    }
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 12.dp).clip(shape).background(p.inner, shape).padding(horizontal = 12.dp, vertical = 10.dp)) {
        Txt("${state.t(muscleKey(d.muscle))} · ${jsRound(d.total)} ${state.t("effShortWord")}", bold = true)
        if (d.contributions.isEmpty()) {
            Txt(state.t("notTrainedThisWeek"), Modifier.padding(top = 6.dp), muted = true, small = true)
        } else {
            for (c in d.contributions) {
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Txt(state.i18n.shown("exercises", c.name), Modifier.weight(1f))
                    Txt("${jsRound(c.n)}" + if (c.direct) "" else " (${state.t("ms_secondary")})", muted = true, small = true)
                }
            }
        }
        if (train.isNotEmpty()) {
            Txt(state.t("trainToday"), Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((s, shown) in train) Chip(shown, false, { state.open(Screen.Exercise(s.exerciseId, today())) })
            }
        }
    }
}
