package io.github.quoterg.ironnotes.next

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.github.quoterg.ironnotes.core.CycleSettings
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.ExerciseFeedback
import io.github.quoterg.ironnotes.core.LightSettings

// The feedback card of the logging screen (Feedback.tsx): when an exercise got weaker or stalled, the
// cause-first advice from the core's `exerciseFeedback`, with one tap where the mode has a lever. The
// body-weight hint (`needBodyWeight`) comes from the same read.

/**
 * The card (`advice`: Dorian / Lyle and no set selected) and the body-weight hint. It reads again when the
 * exercise, the day, the settings (the action writes them) or `version` (the day's log, after every write)
 * change; a slower, older answer never replaces a newer one.
 */
@Composable
internal fun FeedbackCard(state: AppState, ex: Exercise, date: String, advice: Boolean, version: Any?) {
    var fb by remember(ex.id, date) { mutableStateOf<ExerciseFeedback?>(null) }
    val req = remember(ex.id, date) { Latest() }
    val st = state.settings
    LaunchedEffect(ex.id, date, st, version) {
        val rid = req.next()
        state.run({ it.exerciseFeedback(ex.id, date) }) { f -> if (req.isLatest(rid)) fb = f }
    }
    val f = fb ?: return
    if (advice && f.advice.isNotEmpty()) {
        Hint {
            Txt(state.t(f.advice, "n" to f.n.toInt()), small = true)
            if (f.action) {
                Btn(state.t(if (f.startCycle) "startCycle" else "startLight"), {
                    state.putSettings(
                        if (f.startCycle) st.copy(cycle = CycleSettings(start = date, weeks = st.cycle?.weeks ?: 6.0))
                        else st.copy(light = LightSettings(start = date)),
                    )
                }, small = true)
            }
        }
    }
    if (f.needsBodyWeight) Hint { Txt(state.t("needBodyWeight"), small = true) }
}
