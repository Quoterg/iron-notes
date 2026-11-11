package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.BestField
import io.github.quoterg.ironnotes.core.DistUnit
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.ExerciseProgress
import io.github.quoterg.ironnotes.core.ExerciseType
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.Settings
import io.github.quoterg.ironnotes.core.fmtTime
import io.github.quoterg.ironnotes.core.wToUser
import java.text.SimpleDateFormat
import java.util.Locale

private const val PAGE = 20
private const val KM_PER_MI = 1.609344

private fun dateText(d: String, lang: String, weekday: Boolean): String =
    SimpleDateFormat(if (weekday) "EEE d MMM yyyy" else "d MMM yyyy", if (lang == "sv") Locale("sv", "SE") else Locale.getDefault())
        .format(parseIso(d).time)

/** Loads the exercise's progress; it reloads when the day's data changes (a save on Track). */
@Composable
private fun rememberProgress(state: AppState, ex: Exercise): ExerciseProgress? {
    var progress by remember(ex.id) { mutableStateOf<ExerciseProgress?>(null) }
    LaunchedEffect(ex.id, state.day) { state.run({ it.exerciseProgress(ex.id) }) { progress = it } }
    return progress
}

/** ExerciseProgress.tsx `History`: logged days, newest first; tap a day to open the exercise there. */
@Composable
fun HistoryTab(state: AppState, ex: Exercise) {
    val progress = rememberProgress(state, ex) ?: return
    var shown by remember(ex.id) { mutableIntStateOf(PAGE) }
    val load = ex.load ?: LoadType.TOTAL
    val records = remember(progress) { progress.records.toHashSet() }
    val list = progress.workouts
    if (list.isEmpty()) {
        Txt(state.t("noHistory"), Modifier.fillMaxWidth().padding(vertical = 12.dp), muted = true, align = TextAlign.Center)
        return
    }
    list.take(shown).forEach { w ->
        val label = dateText(w.date, state.i18n.lang, true)
        Card(Modifier.padding(top = 12.dp), padding = 8.dp) {
            Txt(
                label,
                Modifier.fillMaxWidth()
                    .semantics { contentDescription = "${state.t("openDay")}: $label" }
                    .clickable(role = Role.Button) { state.open(Screen.Exercise(ex.id, w.date)) }
                    .padding(horizontal = 8.dp, vertical = 12.dp),
                bold = true, size = 17.sp,
            )
            w.sets.forEach { s ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        Txt(state.i18n.setText(s, ex.kind, state.settings, load), size = 15.sp)
                        if (!s.comment.isNullOrEmpty()) Txt(s.comment!!, small = true, muted = true)
                    }
                    if (s.id in records) Trophy(state.t("newRecord"))
                }
            }
        }
    }
    if (shown < list.size) {
        Btn("${state.t("showMore")} (${list.size - shown})", { shown += PAGE }, Modifier.fillMaxWidth().padding(top = 12.dp))
    }
}

/** Seconds per km → per the user's distance unit, formatted "m:ss /km". */
private fun paceText(secPerKm: Double, s: Settings): String {
    val mi = s.dist == DistUnit.MI
    return "${fmtTime(if (mi) secPerKm * KM_PER_MI else secPerKm)} /${if (mi) "mi" else "km"}"
}

private fun bestText(state: AppState, field: BestField, v: Double): String {
    val s = state.settings
    return when (field) {
        BestField.WEIGHT -> state.i18n.weight(v, s)
        BestField.DISTANCE -> state.i18n.distance(v, s)
        BestField.TIME -> fmtTime(v)
        BestField.PACE -> paceText(v, s)
        BestField.REPS -> num(v)
    }
}

/** ExerciseProgress.tsx `Records`: best e1RM, rep maxes 1–15 and the best value per field. */
@Composable
fun RecordsTab(state: AppState, ex: Exercise) {
    val progress = rememberProgress(state, ex) ?: return
    val st = state.settings
    val lang = state.i18n.lang
    if (progress.bests.isEmpty()) {
        Txt(state.t("noRecords"), Modifier.fillMaxWidth().padding(vertical = 12.dp), muted = true, align = TextAlign.Center)
        return
    }
    val strength = ex.kind == ExerciseType.WEIGHT_REPS
    val orm = if (strength) progress.bestOrm else null
    if (orm != null) {
        Card(Modifier.padding(top = 12.dp)) {
            Txt(state.t("est1rm"), muted = true, small = true, bold = true)
            Txt("${state.i18n.dnum(wToUser(orm.value, st.unit), 1)} ${unitLabel(st.unit)}", Modifier.padding(vertical = 4.dp), bold = true, size = 32.sp)
            Txt(
                "${state.i18n.setText(orm.set, ex.kind, st)} · ${dateText(orm.set.date, lang, false)}",
                muted = true, small = true,
            )
        }
    }
    val table = if (strength) progress.repMaxes.filter { it.set != null } else emptyList()
    if (table.isNotEmpty()) {
        Card(Modifier.padding(top = 12.dp)) {
            Heading(state.t("repMaxes"))
            Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Txt(state.t("repsCol"), Modifier.weight(0.6f), muted = true, small = true, bold = true)
                Txt(state.t("weightCol"), Modifier.weight(1.4f), muted = true, small = true, bold = true)
                Txt(state.t("dateCol"), Modifier.weight(1.2f), muted = true, small = true, bold = true)
            }
            table.forEach { rm ->
                val set = rm.set!!
                val reps = rm.reps
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Txt(num(reps), Modifier.weight(0.6f))
                    Row(Modifier.weight(1.4f)) {
                        Txt(state.i18n.weight(set.weight ?: 0.0, st))
                        if ((set.reps ?: 0.0) > reps) Txt(" × ${num(set.reps ?: 0.0)}", muted = true)
                    }
                    Txt(dateText(set.date, lang, false), Modifier.weight(1.2f), size = 15.sp)
                }
            }
        }
    }
    Card(Modifier.padding(top = 12.dp)) {
        Heading(state.t("bestValues"))
        progress.bests.forEach { b ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Txt(state.t("b_${b.field.name.lowercase()}"), Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End) {
                    Txt(bestText(state, b.field, b.value), bold = true)
                    Txt(dateText(b.set.date, lang, false), muted = true, small = true)
                }
            }
        }
    }
}
