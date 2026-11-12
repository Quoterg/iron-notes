package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.WorkoutSet
import io.github.quoterg.ironnotes.core.addDays
import java.text.SimpleDateFormat

/** How far back one page of the list reaches, and the furthest it goes. */
private const val PAGE_DAYS = 90
private const val MAX_DAYS = 3650

/** A past day with sets: exercise ids in logged order with their sets. */
private class PastDay(val date: String, val groups: List<Pair<String, List<WorkoutSet>>>)

/** Copy a previous workout (all of it, or some of its exercises) into `date` (CopySheet.tsx). */
@Composable
fun CopyScreen(state: AppState, date: String) {
    var range by remember { mutableStateOf(PAGE_DAYS) }
    var days by remember { mutableStateOf<List<PastDay>?>(null) }
    var open by remember { mutableStateOf<String?>(null) }
    var skip by remember { mutableStateOf<Set<String>>(emptySet()) }
    val exById = state.exById
    val catById = state.catById

    LaunchedEffect(range, date) {
        state.run({ it.setsBetween(addDays(date, -range), addDays(date, -1)) }) { sets ->
            // A routine's planned, never done sets aren't a workout to copy.
            val byDate = HashMap<String, LinkedHashMap<String, MutableList<WorkoutSet>>>()
            for (s in sets.sortedWith(compareBy({ it.date }, { it.order }))) {
                if (s.date == date || s.planned == true || !exById.containsKey(s.exerciseId)) continue
                byDate.getOrPut(s.date) { LinkedHashMap() }.getOrPut(s.exerciseId) { ArrayList() }.add(s)
            }
            days = byDate.keys.sortedDescending().map { d -> PastDay(d, byDate.getValue(d).map { it.key to it.value }) }
        }
    }

    val fmt = remember(state.i18n.lang) { SimpleDateFormat("EEE d MMM yyyy", state.locale()) }

    Sheet(state.t("copyWorkout"), { state.back() }, state.t("back")) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
            val list = days
            if (list == null) Txt(state.t("loading"), Modifier.fillMaxWidth(), muted = true, align = TextAlign.Center)
            else if (list.isEmpty() && range >= MAX_DAYS) Txt(state.t("nothingToCopy"), Modifier.fillMaxWidth(), muted = true, align = TextAlign.Center)
            if (list != null) for (day in list) {
                val isOpen = open == day.date
                Card {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 44.dp)
                            .clickable(role = Role.Button) { open = if (isOpen) null else day.date; skip = emptySet() }
                            .semantics { stateDescription = if (isOpen) "expanded" else "collapsed" },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Txt(fmt.format(parseIso(day.date).time), Modifier.weight(1f).semantics { heading() }, bold = true, size = 17.sp)
                        Txt("${day.groups.size} ${state.t("exercises").lowercase()}", muted = true, small = true)
                    }
                    if (!isOpen) {
                        Txt(day.groups.joinToString(", ") { state.i18n.shown("exercises", exById.getValue(it.first).name) }, Modifier.padding(top = 4.dp), muted = true, small = true)
                    } else {
                        for ((id, sets) in day.groups) {
                            val ex = exById.getValue(id)
                            val on = id !in skip
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 44.dp)
                                    .clickable(role = Role.Checkbox) { skip = if (on) skip + id else skip - id }
                                    .semantics { stateDescription = if (on) "checked" else "unchecked" },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Txt(if (on) "☑" else "☐", size = 22.sp)
                                Dot(catById[ex.categoryId]?.color)
                                Txt("${state.i18n.shown("exercises", ex.name)} · ${sets.size} ${state.t("sets")}", Modifier.weight(1f))
                            }
                        }
                        val chosen = day.groups.filter { it.first !in skip }
                        Btn(
                            state.t("copyHere"),
                            {
                                state.run({ it.copySets(chosen.flatMap { g -> g.second.map { s -> s.id } }, date) }) {
                                    state.loadDay(date)
                                    state.showToast(state.t("copied"))
                                    state.back()
                                }
                            },
                            Modifier.fillMaxWidth().padding(top = 8.dp),
                            kind = BtnKind.PRIMARY,
                            enabled = chosen.isNotEmpty(),
                        )
                    }
                }
            }
            if (list != null && range < MAX_DAYS) {
                Btn(state.t("showMore"), { range += PAGE_DAYS }, Modifier.fillMaxWidth())
            }
        }
    }
}
