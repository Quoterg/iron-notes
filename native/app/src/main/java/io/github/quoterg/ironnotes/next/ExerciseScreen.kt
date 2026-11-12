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
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import io.github.quoterg.ironnotes.core.ExerciseGuide
import io.github.quoterg.ironnotes.core.ExerciseLog
import io.github.quoterg.ironnotes.core.PlatesHint
import io.github.quoterg.ironnotes.core.SetEffort
import io.github.quoterg.ironnotes.core.TrainingMode
import io.github.quoterg.ironnotes.core.WarmupHint
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.Settings
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
internal class Form {
    var weight by mutableStateOf("")
    var reps by mutableStateOf("")
    var distance by mutableStateOf("")
    var min by mutableStateOf("")
    var sec by mutableStateOf("")
    var comment by mutableStateOf("")
    /** Lyle mode: "" (not given) or "0"…"5" (5 = 5+). */
    var rir by mutableStateOf("")
    /** Dorian HIT: reps after failure. */
    var after by mutableStateOf("")
    var warmup by mutableStateOf(false)

    /** `own`: the set itself is being edited (its comment too); otherwise it only seeds the next set. */
    fun load(s: WorkoutSet, st: Settings, own: Boolean) {
        weight = s.weight?.let { num(wToUser(it, st.unit)) } ?: ""
        reps = s.reps?.let { num(it) } ?: ""
        distance = s.distance?.let { num(dToUser(it, st.dist), 3) } ?: ""
        // Round the total first, then split: 119.6 s is 2:00, not 1:60.
        val total = s.time?.let { Math.round(it) }
        min = total?.let { (it / 60).toString() } ?: ""
        sec = total?.let { (it % 60).toString() } ?: ""
        if (own) comment = s.comment ?: ""
        // RIR carries over to the next set (remembered per exercise); after-failure reps and warm-up don't.
        rir = s.rir?.takeIf { s.warmup != true }?.let { num(minOf(it, MAX_RIR.toDouble())) } ?: ""
        after = if (own && (s.after ?: 0.0) > 0) num(s.after!!) else ""
        warmup = (own || s.planned == true) && s.warmup == true
    }

    /** Only into empty fields: on a slow phone the user may have typed before the history arrived. */
    fun fillEmpty(s: WorkoutSet, st: Settings, withRir: Boolean = false) {
        val before = listOf(weight, reps, distance, min, sec)
        val seed = Form().also { it.load(s, st, false) }
        if (before[0].isBlank()) weight = seed.weight
        if (before[1].isBlank()) reps = seed.reps
        if (before[2].isBlank()) distance = seed.distance
        if (before[3].isBlank()) min = seed.min
        if (before[4].isBlank()) sec = seed.sec
        if (withRir && rir.isBlank()) rir = seed.rir
    }

    fun clear() { weight = ""; reps = ""; distance = ""; min = ""; sec = ""; comment = ""; rir = ""; after = ""; warmup = false }
    fun snapshot() = listOf(weight, reps, distance, min, sec, rir, after, warmup.toString())
    fun restore(v: List<String>) {
        weight = v[0]; reps = v[1]; distance = v[2]; min = v[3]; sec = v[4]
        rir = v.getOrElse(5) { "" }; after = v.getOrElse(6) { "" }; warmup = v.getOrNull(7) == "true"
    }
}

/** The set values a form holds (stored units), as ExerciseScreen.tsx `fromForm`. */
internal class Values(val weight: Double?, val reps: Double?, val distance: Double?, val time: Double?)

/** Accepts "82,5" as well as "82.5". Empty or invalid → null. */
internal fun parse(v: String): Double? =
    v.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }

/** Null if a field the type needs is missing, or nothing is above zero (0 kg × 10 is fine, 0 × 0 isn't a set). */
internal fun fromForm(f: Form, ex: Exercise, st: Settings): Values? {
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
    var tab by rememberSaveable(id) { mutableStateOf("track") }
    // The training-mode guide (targets, readiness, effort badges …) is read beside the log; a slower,
    // older answer never replaces a newer one.
    var guide by remember(id, date) { mutableStateOf<ExerciseGuide?>(null) }
    var guideDone by remember(id, date) { mutableStateOf(false) }
    val guideReq = remember(id, date) { Latest() }
    var sore by remember(id, date) { mutableStateOf<Int?>(null) }
    var warmups by remember(id, date) { mutableStateOf<List<WarmupHint>>(emptyList()) }
    val warmReq = remember(id, date) { Latest() }
    var plates by remember(id, date) { mutableStateOf<PlatesHint?>(null) }
    val platesReq = remember(id, date) { Latest() }

    fun reloadGuide() {
        val rid = guideReq.next()
        state.run({ it.exerciseGuide(id, date) }, { guideDone = true }) { g ->
            if (guideReq.isLatest(rid)) { guide = g; guideDone = true }
        }
    }

    /** Reads the log (and the guide) again, after every write. */
    fun reload(then: (ExerciseLog) -> Unit = {}) {
        reloadGuide()
        state.run({ it.exerciseLog(id, date) }) { l ->
            log = l
            then(l)
        }
    }
    LaunchedEffect(id, date) { reload() }

    val st = state.settings
    val fields = ex?.let { fieldsOf(it.kind) } ?: emptyList()
    val hasReps = Field.REPS in fields
    val dorian = st.mode == TrainingMode.DORIAN && hasReps
    val lyle = st.mode == TrainingMode.LYLE && hasReps
    val current = log
    val todays = current?.sets ?: emptyList()
    val selected = sel?.let { s -> todays.firstOrNull { it.id == s } }
    val done = workingDone(todays)
    val dTarget = if (dorian) guide?.dorianTargets?.getOrNull(done) else null
    val lTarget = if (lyle) guide?.lyleTarget else null

    // Start from the target (Dorian: this working set's; Lyle: the exercise's), else the last set logged
    // (today, else last time), like a paper log. Runs once, when the log and the guide have arrived.
    LaunchedEffect(current, guideDone, ex != null) {
        if (filled || current == null || !guideDone || ex == null) return@LaunchedEffect
        filled = true
        val last = current.sets.firstOrNull { it.planned == true }
            ?: dTarget?.let { seedOf(it, id, date) }
            // Lyle mode: the target's reps, and RIR is never prefilled (it is the progression signal).
            ?: lTarget?.takeIf { current.sets.none { it.planned != true } }
                ?.let { (it.prev ?: blankSet(id, date)).copy(weight = it.weight, reps = it.reps, rir = null) }
            ?: current.sets.lastOrNull() ?: current.previous.firstOrNull()
        last?.let { form.fillEmpty(it, st, withRir = !lyle) }
    }

    // Warm-ups before the first working set of a Dorian exercise, and plates for the target weight.
    val warmKg = dTarget?.weight?.takeIf { dorian && done == 0 && selected == null && it > 0 }
    LaunchedEffect(id, warmKg) {
        val kg = warmKg
        if (kg == null) { warmups = emptyList(); return@LaunchedEffect }
        val rid = warmReq.next()
        state.run({ it.warmupsFor(id, kg) }) { if (warmReq.isLatest(rid)) warmups = distinctWarmups(it) }
    }
    val plateKg = if (guide?.showsPlates == true && selected == null) (dTarget ?: lTarget)?.weight else null
    LaunchedEffect(id, plateKg) {
        val kg = plateKg
        if (kg == null) { plates = null; return@LaunchedEffect }
        val rid = platesReq.next()
        state.run({ it.platesFor(id, kg) }) { if (platesReq.isLatest(rid)) plates = it }
    }

    if (ex == null) {
        Sheet("", { state.back() }, state.t("back")) {}
        return
    }
    val load = ex.load ?: LoadType.TOTAL
    val cat = state.categories.firstOrNull { it.id == ex.categoryId }
    val light = dorian && guide?.light == true
    val asking = guide?.askReadiness == true && st.mode != TrainingMode.STANDARD
    val eff = remember(guide) { guide?.effort?.associateBy { it.setId } ?: emptyMap() }
    val records = remember(current) { current?.records?.toHashSet() ?: HashSet() }
    // Validity is recomputed only when a field (or the exercise/settings) changes, not on every recomposition.
    val values by remember(ex, st) { derivedStateOf { fromForm(form, ex, st) } }
    var saving by remember(id, date) { mutableStateOf(false) }

    fun afterWrite() {
        state.loadDay(state.date)
    }

    fun save() {
        if (saving) return
        val v = values ?: return
        val l = current ?: return
        val comment = form.comment.trim().ifEmpty { null }
        // The mode's effort (RIR, reps after failure, warm-up); null = leave the set's as it is.
        val effort = effortOf(form, hasReps, st.mode, light)
        fun WorkoutSet.withEffort() = if (effort == null) this else copy(warmup = effort.warmup, rir = effort.rir, after = effort.after, deload = effort.deload)
        val now = System.currentTimeMillis().toDouble()
        if (selected != null) {
            var s = selected.copy(weight = v.weight, reps = v.reps, distance = v.distance, time = v.time, comment = comment).withEffort()
            // Editing a planned set means it was done.
            if (selected.planned == true) s = s.copy(planned = null, done = true, at = selected.at ?: now)
            saving = true
            state.run({ it.putSet(s) }, { saving = false }) {
                saving = false
                sel = null
                form.comment = ""
                showComment = false
                reload { afterWrite() }
            }
            return
        }
        // Readiness is saved with the muscle's first set of the day.
        val readiness = if (asking) sore?.toDouble() else null
        val planned = l.sets.firstOrNull { it.planned == true }
        // A routine's next planned set is filled in (and done); otherwise a new set.
        val s = (
            planned?.copy(weight = v.weight, reps = v.reps, distance = v.distance, time = v.time, comment = comment, planned = null, done = true, sore = readiness, at = now)
                ?: WorkoutSet(
                    id = newId(), date = date, exerciseId = id, order = nextOrder(),
                    weight = v.weight, reps = v.reps, distance = v.distance, time = v.time,
                    comment = comment, group = null, done = if (st.markDone) true else null, planned = null,
                    rir = null, after = null, warmup = null, deload = null, sore = readiness, at = now,
                )
            ).withEffort()
        // A record only counts as "new" when it beats earlier sets (the first ever set always holds one).
        val hadOthers = l.sets.isNotEmpty() || l.previous.isNotEmpty()
        // Dorian HIT: after a working set the form moves on to the next set's target (a reverse pyramid's
        // back-off set is lighter); reps after failure never carry over.
        val next = if (dorian && s.warmup != true) guide?.dorianTargets?.getOrNull(done + 1) else null
        saving = true
        state.run({ it.putSet(s) }, { saving = false }) {
            saving = false
            if (next != null) form.load(seedOf(next, id, date), st, false)
            else { form.after = ""; if (lyle) form.rir = "" }
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
            form.load(s, state.settings, true)
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
            val mu = ex.muscles
            if (mu != null && mu.primary.size + mu.secondary.size > 0) {
                val primary = mu.primary.joinToString(", ") { state.t(muscleKey(it)) }
                val secondary = if (mu.secondary.isEmpty()) "" else
                    "${if (mu.primary.isNotEmpty()) " " else ""}(+ ${mu.secondary.joinToString(", ") { state.t(muscleKey(it)) }})"
                Txt(primary + secondary, Modifier.padding(top = 4.dp), muted = true, small = true)
            }
            if (!ex.notes.isNullOrBlank()) Txt(ex.notes!!, Modifier.padding(top = 4.dp), muted = true, small = true)
            if (dorian) guide?.let { Column(Modifier.padding(top = 8.dp)) { TooSoon(state, it) } }

            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("track", "history", "graph", "records").forEach { k ->
                    Chip(
                        state.t(k), tab == k, { tab = k },
                        Modifier.weight(1f).semantics { this.selected = tab == k },
                    )
                }
            }

            when (tab) {
                "history" -> HistoryTab(state, ex)
                "graph" -> GraphTab(state, ex)
                "records" -> RecordsTab(state, ex)
            }

            if (tab == "track") {
                val g = guide
                Column(Modifier.padding(top = 12.dp)) {
                    if (g != null && asking && selected == null) Readiness(state, ex, g, dorian, date, sore) { sore = it }
                    FeedbackCard(state, ex, date, (dorian || lyle) && selected == null, current)
                    if (dorian || lyle) {
                        JointRow(
                            state, ex,
                            onToggle = {
                                state.run({ it.putExercise(ex.copy(joint = if (ex.joint == true) null else true)) }) {
                                    state.reloadLibrary()
                                    reloadGuide()
                                }
                            },
                            onSwap = { next -> state.stack[state.stack.lastIndex] = Screen.Exercise(next, date) },
                        )
                    }
                    val cycle = st.cycle
                    if (g != null && lyle && selected == null && cycle != null && (lTarget?.week ?: 0.0) > cycle.weeks) {
                        Hint { Txt(state.t("cycleDone"), small = true) }
                    }
                    val shown = plates
                    if (plateKg != null && shown != null) PlatesLine(state, shown)
                    if (g != null && selected == null) {
                        if (lTarget != null) LyleTarget(state, lTarget, cycle?.weeks?.toInt(), g.gapDays)
                        if (dTarget != null) DorianTarget(state, ex, dTarget, done + 1, g.gapDays)
                        if (warmKg != null) WarmupChips(state, warmups) { form.pickWarmup(it, st) }
                    }
                }
                Track(
                    state, ex, form, fields, load, values != null && !saving, selected != null, showComment, { showComment = true },
                    ::save, ::clearOrDelete,
                    onWorking = { w ->
                        // Back to working sets after warm-ups: the form takes the set's target again.
                        if (!w && form.warmup && dTarget != null && selected == null) {
                            val c = form.comment
                            form.load(seedOf(dTarget, id, date), st, false)
                            form.comment = c
                        }
                        form.warmup = w
                    },
                )
            }

            if (tab == "track" && current != null) {
                if (todays.isNotEmpty()) {
                    Card(Modifier.padding(top = 12.dp), padding = 8.dp) {
                        val total = guide?.effectiveToday ?: 0.0
                        if (hasReps && total > 0) {
                            Txt(state.t("effToday", "n" to state.i18n.dnum(total)), Modifier.padding(start = 4.dp, bottom = 4.dp), muted = true, small = true)
                        }
                        todays.forEachIndexed { i, s ->
                            SetRow(state, ex, load, i + 1, s, sel == s.id, s.id in records, if (hasReps) effortText(state, s) else "", if (hasReps) eff[s.id] else null) { select(s) }
                        }
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
                            PrevRow(state, ex, load, s, s.id in records, if (hasReps) effortText(state, s) else "") {
                                // Copies the set into the form to log it again; what was typed comes back with Undo.
                                // As a seed: a warm-up copies as a working set, and Lyle mode never prefills RIR.
                                val before = form.snapshot()
                                sel = null
                                form.load(s, state.settings, false)
                                if (lyle) form.rir = ""
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
    save: () -> Unit, clearOrDelete: () -> Unit, onWorking: (Boolean) -> Unit,
) {
    val st = state.settings
    val hasReps = Field.REPS in fields
    Card(Modifier.padding(top = 2.dp)) {
        if (Field.WEIGHT in fields) {
            val unit = unitLabel(st.unit)
            Stepper("${state.t(weightLabelKey(load))} ($unit)", form.weight, { form.weight = it }, ex.increment ?: defaultIncrement(st.unit))
        }
        if (Field.REPS in fields) Stepper(state.t("reps"), form.reps, { form.reps = it }, 1.0, integer = true)
        if (Field.DISTANCE in fields) {
            Stepper("${state.t("distance")} (${distLabel(st.dist)})", form.distance, { form.distance = it }, if (st.dist == DistUnit.M) 100.0 else 0.1)
        }
        if (Field.TIME in fields) TimeField(state, form)
        if (hasReps && st.mode == TrainingMode.DORIAN) {
            Chips(Modifier.padding(bottom = 10.dp)) {
                listOf(false, true).forEach { w ->
                    Chip(state.t(if (w) "warmup" else "working"), form.warmup == w, { onWorking(w) }, Modifier.semantics { this.selected = form.warmup == w })
                }
            }
            if (!form.warmup) Stepper(state.t("afterFailure"), form.after, { form.after = it }, 1.0, integer = true)
        }
        if (hasReps && st.mode == TrainingMode.LYLE) RirChips(state, form)
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
private fun SetRow(
    state: AppState, ex: Exercise, load: LoadType, n: Int, s: WorkoutSet, selected: Boolean, record: Boolean,
    effort: String, effective: SetEffort?, onClick: () -> Unit,
) {
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
            Txt(state.i18n.setText(s, ex.kind, state.settings, load) + effort, bold = true, color = fg)
            if (!s.comment.isNullOrEmpty()) Txt(s.comment!!, small = true, color = if (selected) p.activeText else p.muted)
        }
        if (effective != null) EffBadge(state, effective)
        if (record) Trophy(state.t("record"))
    }
}

/** One of last time's sets: tap to copy it into the form. */
@Composable
private fun PrevRow(state: AppState, ex: Exercise, load: LoadType, s: WorkoutSet, record: Boolean, effort: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Txt(state.i18n.setText(s, ex.kind, state.settings, load) + effort, size = 15.sp)
            if (!s.comment.isNullOrEmpty()) Txt(s.comment!!, small = true, muted = true)
        }
        if (record) Trophy(state.t("record"))
    }
}

/** "Thu 12 Nov 2026" (with the weekday) or "12 Nov 2026", in the language's format. */
private fun longDate(d: String, lang: String, short: Boolean = false): String =
    SimpleDateFormat(if (short) "d MMM yyyy" else "EEE d MMM yyyy", if (lang == "sv") Locale("sv", "SE") else Locale.getDefault()).format(parseIso(d).time)
