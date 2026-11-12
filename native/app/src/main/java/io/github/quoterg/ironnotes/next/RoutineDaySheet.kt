package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.PlannedSet
import io.github.quoterg.ironnotes.core.Routine
import io.github.quoterg.ironnotes.core.RoutineDay
import io.github.quoterg.ironnotes.core.RoutineItem
import io.github.quoterg.ironnotes.core.Settings
import io.github.quoterg.ironnotes.core.dFromUser
import io.github.quoterg.ironnotes.core.dToUser
import io.github.quoterg.ironnotes.core.fmtTime
import io.github.quoterg.ironnotes.core.newId
import io.github.quoterg.ironnotes.core.wFromUser
import io.github.quoterg.ironnotes.core.wToUser
import kotlinx.coroutines.delay
import java.text.Normalizer

/** routines.ts `defaultPlan`: 3 sets of 8 (weighted) or 10 (body weight) reps, or one set for cardio/time work. */
fun defaultPlan(ex: Exercise): List<PlannedSet> {
    val f = fieldsOf(ex.kind)
    val load = ex.load ?: LoadType.TOTAL
    val weighted = Field.WEIGHT in f && load != LoadType.BODYWEIGHT && load != LoadType.ASSISTED
    return if (Field.REPS in f) List(3) { PlannedSet(null, if (weighted) 8.0 else 10.0, null, null) } else listOf(PlannedSet(null, null, null, null))
}

/** routines.ts `planSummary`: "3 × 8", "3 × 8 · 80 kg", "1 set · 5 km"; differing sets are listed one by one. */
fun I18n.planSummary(sets: List<PlannedSet>, ex: Exercise, st: Settings): String {
    if (sets.isEmpty()) return ""
    val f = fieldsOf(ex.kind)
    val p = sets[0]
    val dash = "–"
    val same = sets.all { it == p }
    if (!same) {
        val load = ex.load ?: LoadType.TOTAL
        return sets.joinToString(", ") { s ->
            if (ex.kind == io.github.quoterg.ironnotes.core.ExerciseType.WEIGHT_REPS) {
                val r = s.reps?.let { num(it) } ?: dash
                val w = s.weight
                when (load) {
                    LoadType.BODYWEIGHT -> "${t("bwShort")}${if (w != null && w != 0.0) " + ${weight(w, st)}" else ""} × $r"
                    LoadType.ASSISTED -> "${t("bwShort")}${if (w != null && w != 0.0) " − ${weight(w, st)}" else ""} × $r"
                    LoadType.PER_HAND -> "${if (w != null) weight(w, st) + t("perHandShort") else dash} × $r"
                    LoadType.TOTAL -> "${if (w != null) weight(w, st) else dash} × $r"
                }
            } else {
                f.joinToString(" · ") { k ->
                    when (k) {
                        Field.WEIGHT -> s.weight?.let { weight(it, st) } ?: dash
                        Field.REPS -> s.reps?.let { "${num(it)} reps" } ?: dash
                        Field.DISTANCE -> s.distance?.let { distance(it, st) } ?: dash
                        Field.TIME -> s.time?.let { fmtTime(it) } ?: dash
                    }
                }
            }
        }
    }
    val parts = mutableListOf(
        if (Field.REPS in f) "${sets.size} × ${p.reps?.let { num(it) } ?: dash}" else t(if (sets.size == 1) "oneSet" else "nSets", "n" to sets.size),
    )
    if (Field.WEIGHT in f && p.weight != null) parts += weight(p.weight!!, st)
    if (Field.DISTANCE in f && p.distance != null) parts += distance(p.distance!!, st)
    if (Field.TIME in f && p.time != null) parts += fmtTime(p.time!!)
    return parts.joinToString(" · ")
}

private fun parseNum(v: String): Double? = v.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it >= 0 && it.isFinite() }

private fun fold(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase()

/**
 * One routine day: its exercises with planned sets (count, reps, weight/distance/time for all sets),
 * reorder/remove them, add exercises, rename or delete the day, log it into the shown date.
 * `dayId == null`: a new day, stored with its first change.
 */
@Composable
fun RoutineDayScreen(state: AppState, routineId: String, dayId: String?) {
    LaunchedEffect(Unit) { if (RoutineStore.list == null) RoutineStore.load(state) }
    val r = RoutineStore.list?.firstOrNull { it.id == routineId }
    val newDayId = remember { newId() }
    val id = dayId ?: newDayId
    val day: RoutineDay? = r?.let { rr -> rr.days.firstOrNull { it.id == id } ?: if (dayId == null) RoutineDay(id, state.t("dayN", "n" to rr.days.size + 1), emptyList()) else null }
    var editing by rememberSaveable { mutableStateOf<String?>(null) }
    var picking by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var name by remember(day?.id, day?.name) { mutableStateOf(day?.name ?: "") }

    if (r == null || day == null) {
        Sheet(state.t("routines"), { state.back() }, state.t("back")) { SheetBody { } }
        return
    }
    val st = state.settings
    fun saveDay(next: RoutineDay) {
        val days = if (r.days.any { it.id == id }) r.days.map { if (it.id == id) next else it } else r.days + next
        RoutineStore.save(state, r.copy(days = days))
    }
    fun setItems(items: List<RoutineItem>) = saveDay(day.copy(items = items))

    if (picking) {
        ExercisePickList(state, onBack = { picking = false }) { ex ->
            picking = false
            if (day.items.none { it.exerciseId == ex.id }) {
                setItems(day.items + RoutineItem(ex.id, defaultPlan(ex), null))
                editing = ex.id
            }
        }
        return
    }

    Sheet("${r.name} · ${day.name}", { state.back() }, state.t("back")) {
        SheetBody {
            Txt(state.t("dayName"), muted = true, small = true)
            Field(name, { name = it }, state.t("dayName"), Modifier.fillMaxWidth())
            if (name.isNotBlank() && name.trim() != day.name) {
                Actions { Btn(state.t("save"), { saveDay(day.copy(name = name.trim())) }, kind = BtnKind.PRIMARY, small = true) }
            }

            if (day.items.isEmpty()) Txt(state.t("emptyRoutineDay"), Modifier.fillMaxWidth().padding(vertical = 12.dp), muted = true)
            day.items.forEachIndexed { i, item ->
                val ex = state.exById[item.exerciseId] ?: return@forEachIndexed
                val open = editing == item.exerciseId
                val exName = state.i18n.shown("exercises", ex.name)
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            Modifier.weight(1f).heightIn(min = 44.dp)
                                .clickable(role = Role.Button) { editing = if (open) null else item.exerciseId }
                                .semantics { stateDescription = if (open) "expanded" else "collapsed" },
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Dot(state.catById[ex.categoryId]?.color)
                            Txt(exName, Modifier.weight(1f).semantics { heading() }, bold = true, size = 17.sp)
                        }
                        IconBtn("↑", "${state.t("moveUp")}: $exName", {
                            setItems(day.items.toMutableList().also { java.util.Collections.swap(it, i, i - 1) })
                        }, small = true, enabled = i > 0)
                        IconBtn("↓", "${state.t("moveDown")}: $exName", {
                            setItems(day.items.toMutableList().also { java.util.Collections.swap(it, i, i + 1) })
                        }, small = true, enabled = i < day.items.size - 1)
                    }
                    Txt(remember(item.sets, ex, st, state.i18n.lang) { state.i18n.planSummary(item.sets, ex, st) }, muted = true, small = true)
                    if (open) {
                        PlanEditor(
                            state, ex, item.sets,
                            onChange = { sets -> setItems(day.items.map { if (it.exerciseId == item.exerciseId) it.copy(sets = sets) else it }) },
                            onRemove = {
                                editing = null
                                setItems(day.items.filter { it.exerciseId != item.exerciseId })
                            },
                        )
                    }
                }
            }

            if (confirmDelete) {
                ConfirmCard(state, state.t("deleteDayQ"), state.t("deleteDay"), {
                    RoutineStore.save(state, r.copy(days = r.days.filter { it.id != id }))
                    state.back()
                }, { confirmDelete = false })
            } else {
                Actions {
                    Btn("+ ${state.t("addExercise")}", { picking = true })
                    if (r.days.size > 1 && r.days.any { it.id == id }) Btn(state.t("deleteDay"), { confirmDelete = true }, kind = BtnKind.DANGER)
                }
            }
            if (day.items.isNotEmpty() && r.days.any { it.id == id }) {
                Btn(
                    state.t("logTo", "day" to state.i18n.dayLabel(state.date)),
                    { logRoutineDay(state, r.id, id) },
                    Modifier.fillMaxWidth(),
                    kind = BtnKind.PRIMARY,
                )
            }
        }
    }
}

/** Same values for every set: count, reps, weight / distance / time (whatever the type records). Saved shortly after typing. */
@Composable
private fun PlanEditor(state: AppState, ex: Exercise, sets: List<PlannedSet>, onChange: (List<PlannedSet>) -> Unit, onRemove: () -> Unit) {
    val st = state.settings
    val f = fieldsOf(ex.kind)
    val p = sets.firstOrNull()
    var count by remember { mutableStateOf((sets.size.takeIf { it > 0 } ?: 1).toString()) }
    var reps by remember { mutableStateOf(p?.reps?.let { num(it, 0) } ?: "") }
    var w by remember { mutableStateOf(p?.weight?.let { num(wToUser(it, st.unit)) } ?: "") }
    var dist by remember { mutableStateOf(p?.distance?.let { num(dToUser(it, st.dist), 3) } ?: "") }
    var min by remember { mutableStateOf(p?.time?.let { num(it / 60, 2) } ?: "") }
    var rev by remember { mutableStateOf(0) }
    var pending by remember { mutableStateOf(false) }
    fun touch() { rev++; pending = true }

    val commit by rememberUpdatedState {
        pending = false
        val n = Math.min(20, Math.max(1, Math.round(parseNum(count) ?: 1.0).toInt()))
        val one = PlannedSet(
            weight = if (Field.WEIGHT in f) parseNum(w)?.let { wFromUser(it, st.unit) } else null,
            reps = if (Field.REPS in f) parseNum(reps)?.let { Math.round(it).toDouble() } else null,
            distance = if (Field.DISTANCE in f) parseNum(dist)?.let { dFromUser(it, st.dist) } else null,
            time = if (Field.TIME in f) parseNum(min)?.let { Math.round(it * 60).toDouble() } else null,
        )
        onChange(List(n) { one.copy() })
    }
    LaunchedEffect(rev) {
        if (rev > 0) {
            delay(400)
            commit()
        }
    }
    DisposableEffect(Unit) { onDispose { if (pending) commit() } }

    @Composable
    fun labelled(label: String, value: String, onValue: (String) -> Unit) {
        androidx.compose.foundation.layout.Column(Modifier.padding(top = 8.dp)) {
            Txt(label, muted = true, small = true)
            Field(value, { onValue(it); touch() }, label, Modifier.fillMaxWidth(), number = true)
        }
    }
    labelled(state.t("setsCount"), count) { count = it }
    if (Field.REPS in f) labelled(state.t("repsPlan"), reps) { reps = it }
    if (Field.WEIGHT in f) labelled(state.t("weightPlan", "unit" to unitLabel(st.unit)), w) { w = it }
    if (Field.DISTANCE in f) labelled(state.t("distancePlan", "unit" to distLabel(st.dist)), dist) { dist = it }
    if (Field.TIME in f) labelled(state.t("timePlan"), min) { min = it }
    Actions { Btn(state.t("removeFromDay"), { pending = false; onRemove() }, kind = BtnKind.DANGER, small = true) }
}

private sealed interface PickRow {
    val key: String
    data class Head(val text: String, val color: String?) : PickRow { override val key get() = "h:$text" }
    data class Ex(val e: Exercise) : PickRow { override val key get() = "e:${e.id}" }
}

/** A plain searchable list of the library by category, to add an exercise to a routine day. */
@Composable
private fun ExercisePickList(state: AppState, onBack: () -> Unit, onPick: (Exercise) -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    val lang = state.i18n.lang
    val rows = remember(state.exercises, state.categories, lang, q) {
        val query = fold(q.trim()).split(Regex("\\s+")).filter { it.isNotEmpty() }
        val collator = java.text.Collator.getInstance(if (lang == "sv") java.util.Locale("sv", "SE") else java.util.Locale.getDefault())
        val byCat = state.exercises.groupBy { it.categoryId }
        buildList<PickRow> {
            for (c in state.categories) {
                val list = (byCat[c.id] ?: continue)
                    .map { it to state.i18n.shown("exercises", it.name) }
                    .filter { (e, shown) -> query.all { w -> fold("${e.name} $shown").contains(w) } }
                    .sortedWith { a, b -> collator.compare(a.second, b.second) }
                if (list.isEmpty()) continue
                add(PickRow.Head(state.i18n.shown("categories", c.name), c.color))
                list.forEach { add(PickRow.Ex(it.first)) }
            }
        }
    }
    Sheet(state.t("addExercise"), onBack, state.t("back")) {
        Field(q, { q = it }, state.t("searchExercises"), Modifier.fillMaxWidth().padding(16.dp, 12.dp))
        if (rows.isEmpty()) Txt(state.t("noMatches"), Modifier.padding(16.dp), muted = true)
        LazyColumn(Modifier.fillMaxWidth().navigationBarsPadding(), contentPadding = PaddingValues(bottom = 96.dp)) {
            items(rows, key = { it.key }) { row ->
                when (row) {
                    is PickRow.Head -> Row(
                        Modifier.fillMaxWidth().padding(16.dp, 16.dp, 16.dp, 4.dp).semantics { heading() },
                        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Dot(row.color)
                        Txt(row.text.uppercase(), muted = true, size = 13.sp)
                    }
                    is PickRow.Ex -> Txt(
                        state.i18n.shown("exercises", row.e.name),
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { onPick(row.e) }.padding(16.dp, 12.dp),
                    )
                }
            }
        }
    }
}
