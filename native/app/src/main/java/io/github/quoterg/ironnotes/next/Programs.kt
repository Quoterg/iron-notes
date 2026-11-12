package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.ProgramSettings
import io.github.quoterg.ironnotes.core.ProgramTemplate
import java.util.Locale

private val NAME = mapOf("dorian4" to "tplDorian", "lyleGbr" to "tplLyle")
private val HINT = mapOf("dorian4" to "tplDorianHint", "lyleGbr" to "tplLyleHint")

/**
 * Programs: start a ready-made one (Dorian 4-day split, Lyle's upper/lower), or pick one of your routines
 * as the program and the weekdays you train. The workouts rotate; a missed day moves the rest along.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProgramsScreen(state: AppState) {
    LaunchedEffect(Unit) { RoutineStore.load(state) }
    var templates by remember { mutableStateOf<List<ProgramTemplate>>(emptyList()) }
    LaunchedEffect(Unit) { state.run({ it.programTemplates() }) { templates = it } }
    var confirm by remember { mutableStateOf<ProgramTemplate?>(null) }
    val st = state.settings
    val p = st.program
    val routines = RoutineStore.list ?: emptyList()

    fun start(tpl: ProgramTemplate) {
        confirm = null
        val name = state.t(NAME[tpl.id] ?: tpl.id)
        state.run({ it.startProgram(tpl.id, name, today()) }) { built ->
            RoutineStore.put(built.routine)
            // The core stored the routine and set mode / program / cycle: re-read and re-apply the settings.
            state.run({ it.settings() }) { s -> state.putSettings(s) }
            state.showToast(
                if (built.missing.isEmpty()) state.t("programStarted", "name" to name)
                else state.t("programStartedMissing", "name" to name, "n" to built.missing.size, "list" to built.missing.joinToString(", ")),
            )
        }
    }

    // Weekdays in the calendar's order (0 = Sunday).
    val order = remember(st.weekStart) { List(7) { (it + st.weekStart.toInt()) % 7 } }
    val locale = if (state.i18n.lang == "sv") Locale("sv", "SE") else Locale.getDefault()
    val dayName = { wd: Int ->
        // 2023-01-01 was a Sunday: that week's day `wd` named in the language's locale.
        java.text.SimpleDateFormat("EEE", locale).format(parseIso(io.github.quoterg.ironnotes.core.addDays("2023-01-01", wd)).time)
    }
    val days = p?.weekdays?.map { it.toInt() } ?: emptyList()

    Sheet(state.t("programs"), { state.back() }, state.t("back")) {
        SheetBody {
            Card {
                Heading(state.t("readyToStart"))
                templates.forEach { tpl ->
                    val title = state.t(NAME[tpl.id] ?: tpl.id)
                    Heading(title, Modifier.padding(top = 12.dp))
                    Txt(state.t(HINT[tpl.id] ?: tpl.id), muted = true, small = true)
                    Txt(tpl.dayNames.joinToString(" · ") { state.t(it) }, Modifier.padding(top = 4.dp), muted = true, small = true)
                    if (confirm?.id == tpl.id) {
                        ConfirmCard(state, state.t("replaceProgramQ"), "${state.t("startProgram")}: $title", { start(tpl) }, { confirm = null })
                    } else {
                        Actions {
                            Btn("${state.t("startProgram")}: $title", { if (p != null) confirm = tpl else start(tpl) })
                        }
                    }
                }
            }
            Card {
                Heading(state.t("yourProgram"))
                Txt(state.t("program"), Modifier.padding(top = 8.dp, bottom = 4.dp), muted = true, small = true)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip(state.t("programNone"), p == null, { state.putSettings(st.copy(program = null)) })
                    routines.forEach { r ->
                        Chip(r.name, p?.routineId == r.id, {
                            state.putSettings(
                                st.copy(program = ProgramSettings(r.id, if (p?.routineId == r.id) p.lastDayId else null, p?.weekdays)),
                            )
                        })
                    }
                }
                Txt(state.t("programHint"), Modifier.padding(top = 8.dp), muted = true, small = true)
                if (p != null) {
                    Txt(state.t("trainingDays"), Modifier.padding(top = 12.dp, bottom = 4.dp), muted = true, small = true)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        order.forEach { wd ->
                            val on = wd in days
                            Chip(dayName(wd), on, {
                                val next = (if (on) days - wd else days + wd).sorted().map { it.toByte() }.toByteArray()
                                state.putSettings(st.copy(program = p.copy(weekdays = next)))
                            })
                        }
                    }
                }
            }
        }
    }
}
