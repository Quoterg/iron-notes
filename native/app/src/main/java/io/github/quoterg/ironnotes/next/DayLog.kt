package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.DayData
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.WorkoutSet

/** groups.ts GROUP_COLORS. */
private val GROUP_COLORS = listOf(0xFF7B5CFF, 0xFFF29A38, 0xFF2BD4E0, 0xFFE05FB8, 0xFFE0C43A).map { Color(it) }

/** One exercise of the day with its sets and superset colour (null when ungrouped). */
private class Entry(val ex: Exercise, val sets: List<WorkoutSet>, val color: Color?)

/**
 * groups.ts dayOrder + groupColors: exercises in first-appearance order; a group counts only with 2+
 * exercises; colours by order of appearance.
 */
private fun buildEntries(day: DayData, exById: Map<String, Exercise>): List<Entry> {
    val bySets = LinkedHashMap<String, MutableList<WorkoutSet>>()
    val groupOf = HashMap<String, String?>()
    for (s in day.sets) {
        if (!exById.containsKey(s.exerciseId)) continue
        bySets.getOrPut(s.exerciseId) { ArrayList() }.add(s)
        if (groupOf[s.exerciseId] == null) groupOf[s.exerciseId] = s.group
    }
    val size = HashMap<String, Int>()
    for (g in groupOf.values) if (g != null) size[g] = (size[g] ?: 0) + 1
    val colors = HashMap<String, Color>()
    val out = ArrayList<Entry>()
    for ((id, sets) in bySets) {
        val g = groupOf[id]?.takeIf { (size[it] ?: 0) > 1 }
        val color = g?.let { colors.getOrPut(it) { GROUP_COLORS[colors.size % GROUP_COLORS.size] } }
        out.add(Entry(exById.getValue(id), sets, color))
    }
    return out
}

/** The day log (Log.tsx): comment, summary, one card per exercise, actions. Reorder/superset/share tools come later. */
@Composable
fun DayLog(state: AppState) {
    val day = state.day
    if (day == null) {
        Box(Modifier.heightIn(min = 120.dp))
        return
    }
    val date = day.date
    val s = state.settings
    val exById = state.exById
    val entries = remember(day, state.exercises) { buildEntries(day, exById) }
    val records = remember(day) { day.records.toHashSet() }
    val comment = day.comment.orEmpty()

    if (comment.isNotEmpty()) {
        Card(
            Modifier.clickable(role = Role.Button) { state.open(Screen.Comment(date)) }
                .semantics { contentDescription = state.t("editComment") },
        ) {
            Txt(state.t("workoutComment"), muted = true, small = true)
            Txt(comment, Modifier.padding(top = 4.dp))
        }
    }

    if (entries.isEmpty()) {
        Card {
            Txt(state.t("emptyDay"), Modifier.fillMaxWidth(), muted = true, align = TextAlign.Center)
            Actions(center = true) {
                Btn(state.t("startWorkout"), { state.open(Screen.Pick(date)) }, kind = BtnKind.PRIMARY)
            }
        }
    } else {
        val volume = if (day.volume > 0) " · ${state.i18n.weight(day.volume, s)} ${state.t("volume")}" else ""
        Txt(
            "${entries.size} ${state.t("exercises").lowercase()} · ${day.setCount} ${state.t("sets")}$volume",
            Modifier.padding(bottom = 8.dp),
            muted = true,
            small = true,
        )
        for (e in entries) {
            val ex = e.ex
            Card(borderColor = e.color) {
                if (e.color != null) Txt(state.t("superset"), color = e.color, small = true, bold = true)
                Row(
                    Modifier.fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .clickable(role = Role.Button) { state.open(Screen.Exercise(ex.id, date)) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Dot(state.catById[ex.categoryId]?.color)
                    Txt(state.i18n.shown("exercises", ex.name), Modifier.semantics { heading() }, bold = true, size = 17.sp)
                }
                Column(Modifier.padding(top = 4.dp)) {
                    for (set in e.sets) {
                        val dim = set.planned == true || (s.markDone && set.done != true)
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).alpha(if (dim) 0.55f else 1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Txt(state.i18n.setText(set, ex.kind, s, ex.load ?: LoadType.TOTAL))
                                if (set.id in records) Trophy(state.t("record"))
                            }
                            val note = set.comment.orEmpty()
                            if (note.isNotEmpty()) Txt(note, muted = true, small = true)
                        }
                    }
                }
            }
        }
    }

    Actions {
        if (entries.isNotEmpty()) {
            Btn("+ " + state.t("addExercise"), { state.open(Screen.Pick(date)) }, kind = BtnKind.PRIMARY)
        }
        if (comment.isEmpty()) Btn(state.t("comment"), { state.open(Screen.Comment(date)) })
    }
}
