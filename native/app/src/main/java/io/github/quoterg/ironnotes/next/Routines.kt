package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.Routine
import io.github.quoterg.ironnotes.core.RoutineDay
import io.github.quoterg.ironnotes.core.newId

/**
 * The routines as loaded (the web's `routines` signal): shared by the routine screens so that going back
 * shows what was just edited. Writes update the list at once and go to the core in the background.
 */
object RoutineStore {
    var list by mutableStateOf<List<Routine>?>(null)

    fun load(state: AppState) {
        state.run({ it.routines() }) { list = it.sortedBy { r -> r.order } }
    }

    fun save(state: AppState, r: Routine) {
        val cur = list ?: emptyList()
        list = if (cur.any { it.id == r.id }) cur.map { if (it.id == r.id) r else it } else cur + r
        state.run({ it.putRoutine(r) })
    }

    fun remove(state: AppState, id: String) {
        list = list?.filter { it.id != id }
        state.run({ it.deleteRoutine(id) })
    }

    /** Replaces or adds a routine the core already stored (save_workout, start_program). */
    fun put(r: Routine) {
        val cur = list ?: emptyList()
        list = (if (cur.any { it.id == r.id }) cur.map { if (it.id == r.id) r else it } else cur + r).sortedBy { it.order }
    }
}

/** A scrolling screen body with the usual 16 dp gutter, room for the keyboard and the tab bar. */
@Composable
internal fun ColumnScope.SheetBody(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.weight(1f).fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp, 12.dp, 16.dp, 96.dp),
        content = content,
    )
}

/** An inline "are you sure" (the web's `confirm()`). */
@Composable
internal fun ConfirmCard(state: AppState, question: String, confirmLabel: String, onConfirm: () -> Unit, onCancel: () -> Unit) {
    Card(borderColor = LocalPalette.current.over) {
        Txt(question)
        Actions {
            Btn(confirmLabel, onConfirm, kind = BtnKind.DANGER)
            Btn(state.t("cancel"), onCancel)
        }
    }
}

/** The Routines tab: the user's routines; tap one to edit its days or log a day. */
@Composable
fun RoutinesTab(state: AppState) {
    var name by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { RoutineStore.load(state) }
    val list = RoutineStore.list

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp)) {
        when {
            list == null -> Txt(state.t("loading"), Modifier.fillMaxWidth().padding(16.dp), muted = true)
            list.isEmpty() -> Txt(state.t("noRoutines"), Modifier.fillMaxWidth().padding(16.dp), muted = true)
            else -> Card(padding = 0.dp) {
                list.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp)
                            .clickable(role = Role.Button) { state.open(Screen.Routine(r.id)) }
                            .padding(16.dp, 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Txt(r.name, Modifier.weight(1f), bold = true)
                        Txt("${r.days.size} ${state.t("days")}", muted = true, small = true)
                    }
                }
            }
        }
        Txt(state.t("newRoutine"), Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
        Field(name, { name = it }, state.t("routineName"), Modifier.fillMaxWidth())
        Actions {
            Btn(
                "+ ${state.t("newRoutine")}",
                {
                    val n = name.trim()
                    if (n.isNotEmpty()) {
                        val id = newId()
                        val order = ((list ?: emptyList()).maxOfOrNull { it.order } ?: -1.0) + 1
                        RoutineStore.save(state, Routine(id, n, order, listOf(RoutineDay(newId(), state.t("dayN", "n" to 1), emptyList()))))
                        name = ""
                        state.open(Screen.Routine(id))
                    }
                },
                kind = BtnKind.PRIMARY,
                enabled = name.isNotBlank(),
            )
        }
        // Programs (the web reaches them from Settings; here also one tap from the routines).
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center) {
            LinkBtn(state.t("programs"), { state.open(Screen.Programs) })
        }
    }
}
