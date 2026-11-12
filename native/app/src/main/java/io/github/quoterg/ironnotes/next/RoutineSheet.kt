package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.Routine
import io.github.quoterg.ironnotes.core.RoutineDay
import io.github.quoterg.ironnotes.core.newId

/** A routine: rename it, add/remove/reorder days, open a day, or log a day into the shown date. */
@Composable
fun RoutineScreen(state: AppState, id: String?) {
    LaunchedEffect(Unit) { if (RoutineStore.list == null) RoutineStore.load(state) }
    val list = RoutineStore.list
    val r = if (id == null) null else list?.firstOrNull { it.id == id }
    var renaming by remember { mutableStateOf(id == null) }
    var name by remember(r?.id) { mutableStateOf(r?.name ?: "") }
    var confirmDelete by remember { mutableStateOf(false) }
    val title = r?.name ?: state.t("routines")

    Sheet(title, { state.back() }, state.t("back")) {
        SheetBody {
            if (id == null) {
                // A new routine from this screen.
                Field(name, { name = it }, state.t("routineName"), Modifier.fillMaxWidth())
                Actions {
                    Btn(state.t("save"), {
                        val n = name.trim()
                        if (n.isNotEmpty()) {
                            val order = ((list ?: emptyList()).maxOfOrNull { it.order } ?: -1.0) + 1
                            val nid = newId()
                            RoutineStore.save(state, Routine(nid, n, order, listOf(RoutineDay(newId(), state.t("dayN", "n" to 1), emptyList()))))
                            state.back()
                            state.open(Screen.Routine(nid))
                        }
                    }, kind = BtnKind.PRIMARY, enabled = name.isNotBlank())
                }
                return@SheetBody
            }
            if (r == null) {
                if (list == null) Txt(state.t("loading"), muted = true)
                return@SheetBody
            }
            fun save(next: Routine) = RoutineStore.save(state, next)

            if (renaming) {
                Txt(state.t("routineName"), muted = true, small = true)
                Field(name, { name = it }, state.t("routineName"), Modifier.fillMaxWidth())
                Actions {
                    Btn(state.t("save"), {
                        if (name.isNotBlank()) save(r.copy(name = name.trim()))
                        renaming = false
                    }, kind = BtnKind.PRIMARY)
                }
            } else {
                LinkBtn(state.t("rename"), { renaming = true })
            }

            r.days.forEachIndexed { i, d ->
                val names = d.items.mapNotNull { state.exById[it.exerciseId] }.joinToString(", ") { state.i18n.shown("exercises", it.name) }
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            Modifier.weight(1f).heightIn(min = 44.dp)
                                .clickable(role = Role.Button) { state.open(Screen.RoutineDay(r.id, d.id)) },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Txt(d.name, Modifier.semantics { heading() }, bold = true, size = 17.sp)
                        }
                        if (r.days.size > 1) {
                            IconBtn("↑", "${state.t("moveUp")}: ${d.name}", {
                                save(r.copy(days = r.days.toMutableList().also { java.util.Collections.swap(it, i, i - 1) }))
                            }, small = true, enabled = i > 0)
                            IconBtn("↓", "${state.t("moveDown")}: ${d.name}", {
                                save(r.copy(days = r.days.toMutableList().also { java.util.Collections.swap(it, i, i + 1) }))
                            }, small = true, enabled = i < r.days.size - 1)
                        }
                    }
                    Txt(if (d.items.isEmpty()) state.t("emptyRoutineDay") else names, muted = true, small = true)
                    if (d.items.isNotEmpty()) {
                        Btn(
                            state.t("logTo", "day" to state.i18n.dayLabel(state.date)),
                            { logRoutineDay(state, r.id, d.id) },
                            Modifier.fillMaxWidth().padding(top = 8.dp),
                            kind = BtnKind.PRIMARY,
                        )
                    }
                }
            }

            if (confirmDelete) {
                ConfirmCard(state, state.t("deleteRoutineQ"), state.t("deleteRoutine"), {
                    RoutineStore.remove(state, r.id)
                    state.back()
                }, { confirmDelete = false })
            } else {
                Actions {
                    Btn("+ ${state.t("addDay")}", {
                        save(r.copy(days = r.days + RoutineDay(newId(), state.t("dayN", "n" to r.days.size + 1), emptyList())))
                    })
                    Btn(state.t("deleteRoutine"), { confirmDelete = true }, kind = BtnKind.DANGER)
                }
            }
        }
    }
}

/** Logs a routine day into the shown date, then closes every screen back to the log (as the web does). */
internal fun logRoutineDay(state: AppState, routineId: String, dayId: String) {
    val date = state.date
    state.run({ it.logRoutineDay(routineId, dayId, date) }) {
        state.tab = Tab.LOG
        state.stack.clear()
        state.loadDay(date)
        state.showToast(state.t("routineLogged"))
    }
}
