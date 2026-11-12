package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.layout.Column
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
import io.github.quoterg.ironnotes.core.RoutineDay
import io.github.quoterg.ironnotes.core.Settings
import io.github.quoterg.ironnotes.core.TrainingMode
import io.github.quoterg.ironnotes.core.addDays

private const val RUN_UP_WEEKS = 2

/** cycle.ts `phaseOn`: the cycle phase text of `date` for the mode, or null outside any cycle. */
private fun phaseText(state: AppState, st: Settings, date: String): String? {
    when (st.mode) {
        TrainingMode.DORIAN -> {
            val l = st.light ?: return null
            return if (date >= l.start && date < addDays(l.start, 7)) state.t("lightWeek") else null
        }
        TrainingMode.LYLE -> {
            val c = st.cycle ?: return null
            val days = daysBetween(c.start, date)
            val week = if (days < 0) 0 else (days / 7).toInt() + 1
            if (week < 1 || week > c.weeks) return null
            val phase = state.t(if (week <= RUN_UP_WEEKS) "runUp" else "push")
            return state.t("cycleWeek", "n" to week, "N" to c.weeks.toInt(), "phase" to phase)
        }
        else -> return null
    }
}

/** programs.ts `isTrainingDay`: no weekdays chosen means every day. */
private fun isTrainingDay(weekdays: ByteArray?, date: String): Boolean {
    if (weekdays == null || weekdays.isEmpty()) return true
    return weekdayOf(date) in weekdays.map { it.toInt() }
}

/**
 * The day's place in the cycle ("Week 2 of 6 (run-up)" or "Lighter week"), and on an empty day the
 * program's next workout, added with one tap. Draws nothing when there is neither.
 */
@Composable
fun DayPlan(state: AppState) {
    val st = state.settings
    val date = state.date
    val empty = state.day?.takeIf { it.date == date }?.sets?.isEmpty() == true
    val program = st.program
    var next by remember { mutableStateOf<RoutineDay?>(null) }

    LaunchedEffect(program?.routineId) { if (program != null && RoutineStore.list == null) RoutineStore.load(state) }
    // Re-asked when the day, the program or its progress (lastDayId moves when a day is logged) changes.
    LaunchedEffect(date, empty, program?.routineId, program?.lastDayId) {
        next = null
        if (empty && program != null) state.run({ it.nextProgramDay(date) }) { next = it }
    }

    val phase = remember(st.mode, st.cycle, st.light, date, state.i18n.lang) { phaseText(state, st, date) }
    val routine = program?.let { pr -> RoutineStore.list?.firstOrNull { it.id == pr.routineId } }
    val n = next.takeIf { empty && program != null }
    if (phase == null && n == null) return
    val rest = n != null && !isTrainingDay(program?.weekdays, date)

    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        if (phase != null) Txt(phase, Modifier.padding(bottom = 4.dp), muted = true, small = true)
        if (rest) Txt(state.t("restDay"), Modifier.padding(bottom = 4.dp), muted = true, small = true)
        if (n != null && program != null) {
            Btn(
                state.t("nextWorkout", "day" to n.name, "routine" to (routine?.name ?: "")),
                {
                    state.run({ it.logRoutineDay(program.routineId, n.id, date) }) {
                        state.loadDay(date)
                        state.showToast(state.t("routineLogged"))
                    }
                },
                Modifier.fillMaxWidth(),
                kind = if (rest) BtnKind.NORMAL else BtnKind.PRIMARY,
            )
        }
    }
}
