package io.github.quoterg.ironnotes.next

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.DayData
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.WorkoutSet

/** The log's reorder / superset modes (Log.tsx state), shared by the exercise cards and the tools bar. */
class DayToolsState {
    var reordering by mutableStateOf(false)
    var grouping by mutableStateOf(false)
    var picked by mutableStateOf<Set<String>>(emptySet())

    fun reset() {
        reordering = false
        grouping = false
        picked = emptySet()
    }
}

/** share.ts `workoutText`: title, comment, then each exercise with its sets. */
fun workoutText(state: AppState, title: String, groups: List<Pair<Exercise, List<WorkoutSet>>>, comment: String): String {
    val lines = arrayListOf(title)
    if (comment.isNotEmpty()) lines.add(comment)
    for ((ex, sets) in groups) {
        lines.add("")
        lines.add(state.i18n.shown("exercises", ex.name))
        for (s in sets) {
            val note = s.comment.orEmpty()
            lines.add("  " + state.i18n.setText(s, ex.kind, state.settings, ex.load ?: LoadType.TOTAL) + if (note.isNotEmpty()) " ($note)" else "")
        }
    }
    return lines.joinToString("\n")
}

/**
 * The day's workout tools under the log (DayTools.tsx): save as workout, copy, reorder, superset,
 * share (the Android share sheet) and delete (undoable).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DayTools(state: AppState, day: DayData, groups: List<Pair<Exercise, List<WorkoutSet>>>, tools: DayToolsState) {
    val date = day.date
    val context = LocalContext.current
    var confirmDelete by remember(date) { mutableStateOf(false) }

    if (tools.grouping && tools.picked.size >= 2) {
        Btn(
            state.t("makeSuperset", "n" to tools.picked.size),
            {
                val ids = tools.picked.toList()
                state.run({ it.groupExercises(date, ids) }) {
                    tools.picked = emptySet()
                    tools.grouping = false
                    state.loadDay(date)
                }
            },
            Modifier.fillMaxWidth().padding(bottom = 8.dp),
            kind = BtnKind.PRIMARY,
        )
    }
    if (confirmDelete) {
        Card {
            Txt(state.t("deleteWorkoutQ", "n" to day.sets.size))
            Actions {
                Btn(state.t("deleteWorkout"), {
                    confirmDelete = false
                    tools.reset()
                    state.run({ it.deleteWorkout(date) }) { deleted ->
                        state.loadDay(date)
                        state.showToast(state.t("workoutDeleted"), state.t("undo")) {
                            state.run({ it.putSets(deleted) }) { state.loadDay(date) }
                        }
                    }
                }, kind = BtnKind.DANGER)
                Btn(state.t("cancel"), { confirmDelete = false })
            }
        }
    }
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Chip(state.t("saveAsWorkout"), false, { state.open(Screen.SaveWorkout(date)) })
        Chip(state.t("copyWorkout"), false, { state.open(Screen.Copy(date)) })
        if (groups.size > 1 && !tools.grouping) {
            Chip(
                if (tools.reordering) state.t("done") else state.t("reorder"), tools.reordering,
                { tools.reordering = !tools.reordering },
                Modifier.semantics { stateDescription = if (tools.reordering) "on" else "off" },
            )
        }
        if (groups.size > 1 && !tools.reordering) {
            Chip(
                if (tools.grouping) state.t("done") else state.t("superset"), tools.grouping,
                { tools.grouping = !tools.grouping; tools.picked = emptySet() },
                Modifier.semantics { stateDescription = if (tools.grouping) "on" else "off" },
            )
        }
        Chip(state.t("share"), false, {
            val text = workoutText(state, state.i18n.dayLabel(date), groups, day.comment.orEmpty())
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            context.startActivity(Intent.createChooser(send, state.t("share")))
        })
        Chip(state.t("deleteWorkout"), false, { confirmDelete = true })
    }
}
