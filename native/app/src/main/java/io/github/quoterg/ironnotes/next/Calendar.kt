package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.invisibleToUser
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.CalendarMonth
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/** Up to this many category dots per day (Calendar.tsx MAX_DOTS). */
private const val MAX_DOTS = 4

private fun addMonths(month: String, n: Int): String {
    val (y, m) = month.split("-").map { it.toInt() }
    val c = Calendar.getInstance().apply { clear(); set(y, m - 1 + n, 1) }
    return isoDate(c).substring(0, 7)
}

internal fun AppState.locale(): Locale = if (i18n.lang == "sv") Locale("sv", "SE") else Locale.getDefault()

/** The Calendar tab (Calendar.tsx): a month of workouts, a dot per category trained; tap a day to open it in the log. */
@Composable
fun CalendarTab(state: AppState) {
    val p = LocalPalette.current
    val current = today()
    var month by remember { mutableStateOf(state.date.substring(0, 7)) }
    var data by remember { mutableStateOf<CalendarMonth?>(null) }
    val weekStart = state.settings.weekStart
    // Reload when the month, the week start or the shown day's sets change (edits made in the log).
    LaunchedEffect(month, weekStart, state.day) {
        state.run({ it.calendarMonth(month, weekStart) }) { data = it }
    }
    val cal = data?.takeIf { it.month == month }
    val loc = state.locale()
    val title = remember(month, loc) { SimpleDateFormat("LLLL yyyy", loc).format(parseIso("$month-01").time) }
    val cats = remember(cal) { cal?.days?.associate { it.date to it.categoryIds } ?: emptyMap() }
    val catById = state.catById

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 160.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconBtn("‹", state.t("prevMonth"), { month = addMonths(month, -1) })
            Txt(title, Modifier.weight(1f).semantics { heading(); liveRegion = LiveRegionMode.Polite }, bold = true, size = 18.sp, align = TextAlign.Center)
            IconBtn("›", state.t("nextMonth"), { month = addMonths(month, 1) })
        }
        Card(padding = 8.dp) {
            val grid = cal?.grid.orEmpty()
            if (grid.size >= 7) {
                val dayFmt = remember(loc) { SimpleDateFormat("EEEE d MMMM", loc) }
                val wdFmt = remember(loc) { SimpleDateFormat("EEEEE", loc) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (d in grid.take(7)) {
                        Txt(
                            if (d.isEmpty()) "" else wdFmt.format(parseIso(d).time),
                            Modifier.weight(1f).semantics { invisibleToUser() },
                            muted = true, size = 12.sp, align = TextAlign.Center,
                        )
                    }
                }
                for (row in grid.chunked(7)) {
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        for (d in row) {
                            if (d.isEmpty()) {
                                Box(Modifier.weight(1f))
                                continue
                            }
                            val dayCats = cats[d].orEmpty()
                            val isCur = d == state.date
                            val shape = RoundedCornerShape(12.dp)
                            val bg = when {
                                isCur -> p.active
                                dayCats.isNotEmpty() -> p.inner
                                else -> Color.Transparent
                            }
                            val names = dayCats.mapNotNull { catById[it]?.name?.let { n -> state.i18n.shown("categories", n) } }.joinToString(", ")
                            val label = dayFmt.format(parseIso(d).time).let { if (names.isEmpty()) it else "$it: $names" }
                            Column(
                                Modifier
                                    .weight(1f)
                                    .heightIn(min = 46.dp)
                                    .alpha(if (d.substring(0, 7) != month) 0.35f else 1f)
                                    .clip(shape)
                                    .background(bg, shape)
                                    .border(1.dp, if (d == current) p.accent else Color.Transparent, shape)
                                    .clickable(role = Role.Button) {
                                        state.loadDay(d)
                                        state.tab = Tab.LOG
                                    }
                                    .semantics { contentDescription = label }
                                    .padding(vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Txt(d.substring(8).toInt().toString(), bold = isCur, size = 15.sp, color = if (isCur) p.activeText else p.text)
                                Row(Modifier.heightIn(min = 10.dp).padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                    for (c in dayCats.take(MAX_DOTS)) Dot(catById[c]?.color)
                                }
                            }
                        }
                    }
                }
            } else {
                Box(Modifier.heightIn(min = 240.dp))
            }
        }
        Txt(
            if (cal != null) "${cal.workouts} ${state.t("workoutsInMonth")}" else state.t("loading"),
            Modifier.fillMaxWidth(), muted = true, small = true, align = TextAlign.Center,
        )
        if (month != current.substring(0, 7)) {
            Actions { Btn(state.t("thisMonth"), { month = current.substring(0, 7) }) }
        }
    }
}
