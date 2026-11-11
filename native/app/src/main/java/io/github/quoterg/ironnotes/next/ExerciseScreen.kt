package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.ExerciseLog
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.WorkoutSet
import io.github.quoterg.ironnotes.core.dFromUser
import io.github.quoterg.ironnotes.core.dToUser
import io.github.quoterg.ironnotes.core.defaultIncrement
import io.github.quoterg.ironnotes.core.fmtTime
import io.github.quoterg.ironnotes.core.newId
import io.github.quoterg.ironnotes.core.nextOrder
import io.github.quoterg.ironnotes.core.wFromUser
import io.github.quoterg.ironnotes.core.wToUser
import io.github.quoterg.ironnotes.core.DistUnit
import java.text.SimpleDateFormat
import java.util.Locale

/** The Track tab's inputs as typed (ExerciseScreen.tsx `Form`), in the user's units. */
private class Form {
    var weight by mutableStateOf("")
    var reps by mutableStateOf("")
    var distance by mutableStateOf("")
    var min by mutableStateOf("")
    var sec by mutableStateOf("")
    var comment by mutableStateOf("")

    /** `own`: the set itself is being edited (its comment too); otherwise it only seeds the next set. */
    fun load(s: WorkoutSet, state: AppState, own: Boolean) {
        val st = state.settings
        weight = s.weight?.let { num(wToUser(it, st.unit)) } ?: ""
        reps = s.reps?.let { num(it) } ?: ""
        distance = s.distance?.let { num(dToUser(it, st.dist), 3) } ?: ""
        min = s.time?.let { Math.floor(it / 60).toLong().toString() } ?: ""
        sec = s.time?.let { Math.round(it % 60).toString() } ?: ""
        if (own) comment = s.comment ?: ""
    }

    /** Only into empty fields: on a slow phone the user may have typed before the history arrived. */
    fun fillEmpty(s: WorkoutSet, state: AppState) {
        val before = listOf(weight, reps, distance, min, sec)
        val seed = Form().also { it.load(s, state, false) }
        if (before[0].isBlank()) weight = seed.weight
        if (before[1].isBlank()) reps = seed.reps
        if (before[2].isBlank()) distance = seed.distance
        if (before[3].isBlank()) min = seed.min
        if (before[4].isBlank()) sec = seed.sec
    }

    fun clear() { weight = ""; reps = ""; distance = ""; min = ""; sec = ""; comment = "" }
    fun snapshot() = listOf(weight, reps, distance, min, sec)
    fun restore(v: List<String>) { weight = v[0]; reps = v[1]; distance = v[2]; min = v[3]; sec = v[4] }
}

/** The set values a form holds (stored units), as ExerciseScreen.tsx `fromForm`. */
private class Values(val weight: Double?, val reps: Double?, val distance: Double?, val time: Double?)

/** Accepts "82,5" as well as "82.5". Empty or invalid → null. */
private fun parse(v: String): Double? =
    v.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }

/** Null if a field the type needs is missing, or nothing is above zero (0 kg × 10 is fine, 0 × 0 isn't a set). */
private fun fromForm(f: Form, ex: Exercise, state: AppState): Values? {
    val st = state.settings
    var weight: Double? = null
    var reps: Double? = null
    var distance: Double? = null
    var time: Double? = null
    for (field in fieldsOf(ex.kind)) {
        // Body weight + load: an empty weight is body weight alone.
        if (field == Field.WEIGHT && f.weight.isBlank() && ex.load == LoadType.BODYWEIGHT) continue
        if (field == Field.TIME) {
            if (f.min.isEmpty() && f.sec.isEmpty()) return null
            time = Math.round((parse(f.min) ?: 0.0) * 60 + (parse(f.sec) ?: 0.0)).toDouble()
        } else {
            val v = parse(
                when (field) { Field.WEIGHT -> f.weight; Field.REPS -> f.reps; else -> f.distance },
            ) ?: return null
            // Rounded so lb/mi entries don't store float noise (61.235 kg, not 61.23496…).
            when (field) {
                Field.WEIGHT -> weight = roundTo(wFromUser(v, st.unit), 3)
                Field.DISTANCE -> distance = roundTo(dFromUser(v, st.dist), 4)
                else -> reps = Math.round(v).toDouble()
            }
        }
    }
    return if (listOfNotNull(weight, reps, distance, time).any { it > 0 }) Values(weight, reps, distance, time) else null
}

/** The weight field's label by load type. */
private fun weightLabelKey(load: LoadType?) = when (load) {
    LoadType.PER_HAND -> "weightPerHand"
    LoadType.BODYWEIGHT -> "addedWeight"
    LoadType.ASSISTED -> "assistance"
    else -> "weight"
}

/**
 * Log sets of one exercise on one day (ExerciseScreen.tsx, Track tab): the type's fields with −/+
 * steppers, Save/Clear (Update/Delete with a set selected), the day's sets with record marks, and last
 * time's sets. History/Graph/Records tabs come with N4: they slot in below the header as another
 * `when (tab)` branch around `Track`.
 */
@Composable
fun ExerciseScreen(state: AppState, id: String, date: String) {
    val ex = state.exercises.firstOrNull { it.id == id }
    val context = LocalContext.current
    val timer = remember { RestTimer.get(context) }
    var log by remember(id, date) { mutableStateOf<ExerciseLog?>(null) }
    val form = remember(id, date) { Form() }
    var sel by remember(id, date) { mutableStateOf<String?>(null) }
    var showComment by remember(id, date) { mutableStateOf(false) }
    var filled by remember(id, date) { mutableStateOf(false) }

    /** Reads the log again (after every write); the first arrival also seeds the form. */
    fun reload(then: (ExerciseLog) -> Unit = {}) {
        state.run({ it.exerciseLog(id, date) }) { l ->
            log = l
            if (!filled) {
                filled = true
                // Start from the last set logged (today, else last time), like a paper log.
                (l.sets.lastOrNull() ?: l.previous.firstOrNull())?.let { form.fillEmpty(it, state) }
            }
            then(l)
        }
    }
    LaunchedEffect(id, date) { reload() }

    if (ex == null) {
        Sheet("", { state.back() }, state.t("back")) {}
        return
    }
    val st = state.settings
    val load = ex.load ?: LoadType.TOTAL
    val fields = fieldsOf(ex.kind)
    val cat = state.categories.firstOrNull { it.id == ex.categoryId }
    val current = log
    val todays = current?.sets ?: emptyList()
    val selected = sel?.let { s -> todays.firstOrNull { it.id == s } }
    val records = remember(current) { current?.records?.toHashSet() ?: HashSet() }
    val values = fromForm(form, ex, state)

    fun afterWrite() {
        state.loadDay(state.date)
    }

    fun save() {
        val v = values ?: return
        val l = current ?: return
        val comment = form.comment.trim().ifEmpty { null }
        if (selected != null) {
            val s = selected.copy(weight = v.weight, reps = v.reps, distance = v.distance, time = v.time, comment = comment)
            state.run({ it.putSet(s) }) {
                sel = null
                form.comment = ""
                showComment = false
                reload { afterWrite() }
            }
            return
        }
        val s = WorkoutSet(
            id = newId(), date = date, exerciseId = id, order = nextOrder(),
            weight = v.weight, reps = v.reps, distance = v.distance, time = v.time,
            comment = comment, group = null, done = if (st.markDone) true else null, planned = null,
            rir = null, after = null, warmup = null, deload = null, sore = null,
            at = System.currentTimeMillis().toDouble(),
        )
        // A record only counts as "new" when it beats earlier sets (the first ever set always holds one).
        val hadOthers = l.sets.isNotEmpty() || l.previous.isNotEmpty()
        state.run({ it.putSet(s) }) {
            form.comment = ""
            showComment = false
            reload { nl ->
                afterWrite()
                if (hadOthers && s.id in nl.records) state.showToast(state.t("newRecord"))
            }
            if (st.autoTimer) timer.start(restFor(ex, cat, st), state)
        }
    }

    fun clearOrDelete() {
        if (selected == null) { form.clear(); showComment = false; return }
        state.run({ it.deleteSet(selected.id) }) {
            sel = null
            form.comment = ""
            showComment = false
            reload { afterWrite() }
        }
    }

    fun select(s: WorkoutSet) {
        if (sel == s.id) {
            sel = null
            form.comment = ""
            showComment = false
        } else {
            sel = s.id
            form.load(s, state, true)
            showComment = !s.comment.isNullOrEmpty()
        }
    }

    Sheet(
        state.i18n.shown("exercises", ex.name), { state.back() }, state.t("back"),
        actions = { IconBtn("⏱", state.t("startTimer"), { timer.start(restFor(ex, cat, st), state) }, small = true) },
    ) {
        Column(
            Modifier.weight(1f).fillMaxWidth().imePadding().verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 160.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Dot(cat?.color)
                val catText = cat?.let { state.i18n.shown("categories", it.name) } ?: ""
                Txt(if (date != today()) "$catText · ${longDate(date, state.i18n.lang)}" else catText, muted = true, small = true)
            }
            if (!ex.notes.isNullOrBlank()) Txt(ex.notes!!, Modifier.padding(top = 4.dp), muted = true, small = true)

            Track(state, ex, form, fields, load, values != null, selected != null, showComment, { showComment = true }, ::save, ::clearOrDelete)

            if (current != null) {
                if (todays.isNotEmpty()) {
                    Card(Modifier.padding(top = 12.dp), padding = 8.dp) {
                        todays.forEachIndexed { i, s -> SetRow(state, ex, load, i + 1, s, sel == s.id, s.id in records) { select(s) } }
                    }
                } else {
                    Txt(state.t("noSetsYet"), Modifier.fillMaxWidth().padding(vertical = 12.dp), muted = true, align = TextAlign.Center)
                }
                if (current.previous.isNotEmpty()) {
                    Card(Modifier.padding(top = 4.dp)) {
                        Txt(
                            "${state.t("lastTime")} · ${longDate(current.previous[0].date, state.i18n.lang, true)}",
                            Modifier.padding(bottom = 4.dp), muted = true, small = true, bold = true,
                        )
                        current.previous.forEach { s ->
                            PrevRow(state, ex, load, s, s.id in records) {
                                // Copies the set into the form to log it again; what was typed comes back with Undo.
                                val before = form.snapshot()
                                sel = null
                                form.load(s, state, false)
                                state.showToast(state.t("setCopied"), state.t("undo")) { form.restore(before) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The input card: fields, comment, Save/Clear. */
@Composable
private fun Track(
    state: AppState, ex: Exercise, form: Form, fields: List<Field>, load: LoadType,
    canSave: Boolean, editing: Boolean, showComment: Boolean, openComment: () -> Unit,
    save: () -> Unit, clearOrDelete: () -> Unit,
) {
    val st = state.settings
    Card(Modifier.padding(top = 12.dp)) {
        if (Field.WEIGHT in fields) {
            val unit = unitLabel(st.unit)
            Stepper("${state.t(weightLabelKey(load))} ($unit)", form.weight, { form.weight = it }, ex.increment ?: defaultIncrement(st.unit))
        }
        if (Field.REPS in fields) Stepper(state.t("reps"), form.reps, { form.reps = it }, 1.0, integer = true)
        if (Field.DISTANCE in fields) {
            Stepper("${state.t("distance")} (${distLabel(st.dist)})", form.distance, { form.distance = it }, if (st.dist == DistUnit.M) 100.0 else 0.1)
        }
        if (Field.TIME in fields) TimeField(state, form)
        if (showComment) {
            Column(Modifier.padding(bottom = 8.dp)) {
                Txt(state.t("setComment"), muted = true, small = true, modifier = Modifier.padding(bottom = 4.dp))
                Field(form.comment, { form.comment = it }, state.t("setComment"), Modifier.fillMaxWidth())
            }
        } else {
            LinkBtn("+ ${state.t("addComment")}", openComment)
        }
        Actions {
            Btn(state.t(if (editing) "update" else "save"), save, kind = BtnKind.PRIMARY, enabled = canSave)
            Btn(state.t(if (editing) "delete" else "clear"), clearOrDelete, kind = if (editing) BtnKind.DANGER else BtnKind.NORMAL)
        }
    }
}

/** A labelled number input with −/+ buttons (ExerciseScreen.tsx `Stepper`). */
@Composable
private fun Stepper(label: String, value: String, onChange: (String) -> Unit, step: Double, integer: Boolean = false) {
    fun bump(dir: Int) {
        val next = maxOf(0.0, (parse(value) ?: 0.0) + dir * step)
        onChange(if (integer) Math.round(next).toString() else num(next, 3))
    }
    Column(Modifier.padding(bottom = 10.dp)) {
        Txt(label, Modifier.padding(bottom = 4.dp), muted = true, small = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBtn("−", "$label −${num(step, 3)}", { bump(-1) })
            Field(value, onChange, label, Modifier.weight(1f), number = true)
            IconBtn("+", "$label +${num(step, 3)}", { bump(1) })
        }
    }
}

/** Minutes and seconds, with ±15 s buttons (ExerciseScreen.tsx `TimeField`). */
@Composable
private fun TimeField(state: AppState, form: Form) {
    val time = state.t("time")
    fun bump(d: Int) {
        val total = maxOf(0.0, (parse(form.min) ?: 0.0) * 60 + (parse(form.sec) ?: 0.0) + d)
        form.min = Math.floor(total / 60).toLong().toString()
        form.sec = Math.round(total % 60).toString()
    }
    val total = (parse(form.min) ?: 0.0) * 60 + (parse(form.sec) ?: 0.0)
    Column(Modifier.padding(bottom = 10.dp)) {
        Txt(if (total > 0) "$time (${fmtTime(total)})" else time, Modifier.padding(bottom = 4.dp), muted = true, small = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBtn("−", "$time −15 s", { bump(-15) })
            Field(form.min, { form.min = it }, "$time (${state.t("min")})", Modifier.weight(1f), number = true)
            Txt(":", bold = true, size = 22.sp)
            Field(form.sec, { form.sec = it }, "$time (${state.t("sec")})", Modifier.weight(1f), number = true)
            IconBtn("+", "$time +15 s", { bump(15) })
        }
    }
}

/** One of today's sets (`.set-row`): number, text, comment, record mark; the selected one is highlighted. */
@Composable
private fun SetRow(state: AppState, ex: Exercise, load: LoadType, n: Int, s: WorkoutSet, selected: Boolean, record: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(12.dp)
    val fg = if (selected) p.activeText else p.text
    Row(
        Modifier.fillMaxWidth().background(if (selected) p.active else androidx.compose.ui.graphics.Color.Transparent, shape)
            .semantics { this.selected = selected }
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Txt(n.toString(), Modifier.padding(start = 4.dp), color = if (selected) p.activeText else p.muted)
        Column(Modifier.weight(1f)) {
            Txt(state.i18n.setText(s, ex.kind, state.settings, load), bold = true, color = fg)
            if (!s.comment.isNullOrEmpty()) Txt(s.comment!!, small = true, color = if (selected) p.activeText else p.muted)
        }
        if (record) Trophy(state.t("newRecord"))
    }
}

/** One of last time's sets: tap to copy it into the form. */
@Composable
private fun PrevRow(state: AppState, ex: Exercise, load: LoadType, s: WorkoutSet, record: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Txt(state.i18n.setText(s, ex.kind, state.settings, load), size = 15.sp)
            if (!s.comment.isNullOrEmpty()) Txt(s.comment!!, small = true, muted = true)
        }
        if (record) Trophy(state.t("newRecord"))
    }
}

/** "Thu 12 Nov 2026" (with the weekday) or "12 Nov 2026", in the language's format. */
private fun longDate(d: String, lang: String, short: Boolean = false): String =
    SimpleDateFormat(if (short) "d MMM yyyy" else "EEE d MMM yyyy", if (lang == "sv") Locale("sv", "SE") else Locale.getDefault()).format(parseIso(d).time)
