package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.ExerciseType
import io.github.quoterg.ironnotes.core.LoadType
import io.github.quoterg.ironnotes.core.MuscleId
import io.github.quoterg.ironnotes.core.Muscles
import io.github.quoterg.ironnotes.core.TrainingMode
import io.github.quoterg.ironnotes.core.cycleMuscle
import io.github.quoterg.ironnotes.core.cycleWeekOf
import io.github.quoterg.ironnotes.core.defaultIncrement
import io.github.quoterg.ironnotes.core.defaultMusclesFor
import io.github.quoterg.ironnotes.core.newId
import io.github.quoterg.ironnotes.core.platesToStore
import io.github.quoterg.ironnotes.core.repBottomDefault
import io.github.quoterg.ironnotes.core.repTopDefault
import io.github.quoterg.ironnotes.core.usesPlatesForName

/** A labelled drop-down made of foundation parts: the field shows the choice, a tap lists the options. */
@Composable
internal fun Choice(label: String, value: String, options: List<Pair<String, String>>, onPick: (String) -> Unit, enabled: Boolean = true) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(12.dp)
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Txt(label, Modifier.padding(bottom = 4.dp), muted = true, small = true)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(shape).background(p.inner, shape).border(1.dp, p.line, shape)
                .clickable(enabled = enabled, role = Role.DropdownList) { open = !open }
                .padding(horizontal = 12.dp, vertical = 10.dp)
                .semantics { contentDescription = label },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Txt(options.firstOrNull { it.first == value }?.second ?: value, Modifier.weight(1f), muted = !enabled)
            if (enabled) Txt(if (open) "▴" else "▾", muted = true)
        }
        if (open) {
            Column(Modifier.fillMaxWidth().padding(top = 4.dp).clip(shape).background(p.card, shape).border(1.dp, p.cardBorder, shape)) {
                for ((key, text) in options) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(role = Role.Button) { open = false; onPick(key) }.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Txt(text, Modifier.weight(1f), bold = key == value, color = if (key == value) p.accent else null)
                    }
                }
            }
        }
    }
}

/** A text input with its label above (the web's `label > input`). */
@Composable
internal fun Labeled(label: String, value: String, onChange: (String) -> Unit, number: Boolean = false, hint: String? = null, minLines: Int = 1) {
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Txt(label, Modifier.padding(bottom = 4.dp), muted = true, small = true)
        Field(value, onChange, label, Modifier.fillMaxWidth(), number = number, singleLine = minLines == 1, minLines = minLines)
        if (hint != null) Txt(hint, Modifier.padding(top = 2.dp), muted = true, small = true)
    }
}

/** JS `parseInt(s, 10)`: leading digits, else null. */
private fun parseInt(s: String): Int? = s.trim().takeWhile { it.isDigit() }.toIntOrNull()

private val LOAD_TYPES = listOf(LoadType.TOTAL, LoadType.PER_HAND, LoadType.BODYWEIGHT, LoadType.ASSISTED)

private fun loadKey(l: LoadType) = when (l) {
    LoadType.TOTAL -> "load_total"
    LoadType.PER_HAND -> "load_perHand"
    LoadType.BODYWEIGHT -> "load_bodyweight"
    LoadType.ASSISTED -> "load_assisted"
}

private fun stateKey(ms: Muscles?, id: MuscleId) = when {
    ms?.primary?.contains(id) == true -> "primary"
    ms?.secondary?.contains(id) == true -> "secondary"
    else -> "none"
}

/**
 * Create or edit an exercise (ExerciseEditor.tsx): name, category, type, load, weight step, rep range,
 * plates, rest, muscles (tap cycles none → primary → secondary), notes, favourite; delete with its sets.
 */
@Composable
fun ExerciseEditorScreen(state: AppState, id: String?, categoryId: String?, date: String?) {
    val old = remember(id) { id?.let { i -> state.exercises.firstOrNull { it.id == i } } }
    val st = state.settings
    var name by remember(id) { mutableStateOf(old?.name ?: "") }
    var cat by remember(id) { mutableStateOf(old?.categoryId ?: categoryId ?: state.categories.firstOrNull()?.id ?: "") }
    var type by remember(id) { mutableStateOf(old?.kind ?: ExerciseType.WEIGHT_REPS) }
    var increment by remember(id) { mutableStateOf(old?.increment?.let { num(it) } ?: "") }
    var load by remember(id) { mutableStateOf(old?.load ?: LoadType.TOTAL) }
    // null until the box is touched: the default then follows the (possibly new) name.
    var plates by remember(id) { mutableStateOf(old?.plates) }
    var rest by remember(id) { mutableStateOf(old?.rest?.let { num(it) } ?: "") }
    var repTop by remember(id) { mutableStateOf(old?.repTop?.let { num(it) } ?: "") }
    var repBottom by remember(id) { mutableStateOf(old?.repBottom?.let { num(it) } ?: "") }
    var notes by remember(id) { mutableStateOf(old?.notes ?: "") }
    var favorite by remember(id) { mutableStateOf(old?.favorite == true) }
    // Edited muscles; until then an existing exercise keeps its own, a new one gets its name's defaults.
    var muscles by remember(id) { mutableStateOf<Muscles?>(null) }
    var used by remember(id) { mutableStateOf(0) }
    var error by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

    LaunchedEffect(id) {
        if (id != null) state.run({ it.countSetsOf(id) }) { used = it.toInt() }
    }
    val shownMuscles = muscles ?: if (old != null) old.muscles else defaultMusclesFor(name)
    val effType = if (used > 0 && old != null) old.kind else type
    val fields = fieldsOf(effType)
    val hasWeight = Field.WEIGHT in fields
    val hasReps = Field.REPS in fields
    val cyc = if (st.mode == TrainingMode.LYLE) st.cycle else null
    val midCycle = cyc != null && cycleWeekOf(cyc.start, today()) <= cyc.weeks

    fun save() {
        val n = name.trim().replace(Regex("\\s+"), " ")
        if (n.isEmpty()) { error = state.t("nameRequired"); return }
        if (state.exercises.any { it.id != id && it.name.lowercase() == n.lowercase() }) { error = state.t("nameTaken"); return }
        val inc = parse(increment)
        val base = effType
        val loadedType = if (base == ExerciseType.REPS && (load == LoadType.BODYWEIGHT || load == LoadType.ASSISTED)) ExerciseType.WEIGHT_REPS else base
        val weighted = Field.WEIGHT in fieldsOf(loadedType)
        val top = parseInt(repTop)
        val bottom = parseInt(repBottom)
        val r = parseInt(rest)
        val exId = id ?: newId()
        val ex = (old ?: Exercise(
            id = exId, name = n, categoryId = cat, kind = loadedType, notes = null, increment = null, repTop = null,
            repBottom = null, joint = null, load = null, plates = null, rest = null, favorite = null, muscles = null,
        )).copy(
            id = exId,
            name = n,
            categoryId = cat,
            kind = loadedType,
            notes = notes.trim().ifEmpty { null },
            muscles = shownMuscles,
            increment = if (inc != null && inc > 0) inc else null,
            load = if (weighted && load != LoadType.TOTAL) load else null,
            // Stored only when it differs from the default for the name.
            plates = if (weighted && load == LoadType.TOTAL) platesToStore(plates, n) else null,
            rest = if (r != null && r > 0) r.toDouble() else null,
            repTop = if (top != null && top > 0) minOf(top, 100).toDouble() else null,
            repBottom = if (bottom != null && bottom > 0) minOf(bottom, 100).toDouble() else null,
            favorite = if (favorite) true else null,
        )
        saving = true
        state.run({ it.putExercise(ex) }, { saving = false }) {
            state.reloadLibrary()
            // A new exercise from "Add exercise" goes straight to logging it.
            if (id == null && date != null) {
                val s = state.stack
                if (s.getOrNull(s.size - 2) is Screen.Pick) state.back()
                state.back()
                state.open(Screen.Exercise(ex.id, date))
            } else {
                state.back()
            }
        }
    }

    fun remove() {
        if (id == null) return
        state.run({ it.deleteExercise(id) }) {
            state.reloadLibrary()
            state.loadDay(state.date)
            // Close this editor and the exercise's own screen under it, if any.
            var n = 1
            while (n < state.stack.size && (state.stack[state.stack.size - 1 - n] as? Screen.Exercise)?.id == id) n++
            repeat(n) { state.back() }
        }
    }

    Sheet(state.t(if (id != null) "editExercise" else "newExercise"), { state.back() }, state.t("back")) {
        Column(
            Modifier.weight(1f).fillMaxWidth().imePadding().verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 120.dp),
        ) {
            Labeled(state.t("name"), name, { name = it; error = "" })
            if (error.isNotEmpty()) Txt(error, Modifier.padding(bottom = 12.dp), color = LocalPalette.current.over)
            Choice(
                state.t("category"), cat,
                state.categories.map { it.id to state.i18n.shown("categories", it.name) },
                { cat = it },
            )
            Choice(
                state.t("type"), typeKey(effType),
                ExerciseType.entries.map { typeKey(it) to state.i18n.typeName(typeKey(it)) },
                { k -> ExerciseType.entries.firstOrNull { typeKey(it) == k }?.let { type = it } },
                enabled = used == 0,
            )
            if (used > 0) Txt(state.t("typeLocked"), Modifier.padding(bottom = 12.dp), muted = true, small = true)
            if (hasWeight || effType == ExerciseType.REPS) {
                Choice(
                    state.t("loadType"), load.name,
                    LOAD_TYPES.filter { effType != ExerciseType.REPS || it == LoadType.TOTAL || it == LoadType.BODYWEIGHT || it == LoadType.ASSISTED }
                        .map { it.name to state.t(loadKey(it)) },
                    { k -> LOAD_TYPES.firstOrNull { it.name == k }?.let { load = it } },
                )
            }
            if (hasWeight) {
                Labeled(
                    "${state.t("increment")} (${unitLabel(st.unit)})", increment, { increment = it }, number = true,
                    hint = state.i18n.dnum(defaultIncrement(st.unit)),
                )
            }
            if (hasReps) {
                Labeled(state.t("repTop"), repTop, { repTop = it }, number = true, hint = num(repTopDefault()))
                if (midCycle) Txt(state.t("rangeMidCycle"), Modifier.padding(bottom = 12.dp), muted = true, small = true)
                Labeled(state.t("repBottom"), repBottom, { repBottom = it }, number = true, hint = num(repBottomDefault(parseInt(repTop)?.takeIf { it > 0 }?.toDouble())))
            }
            if (hasWeight && load == LoadType.TOTAL) {
                val on = plates ?: usesPlatesForName(name)
                Chip(state.t("usesPlates"), on, { plates = !on }, Modifier.padding(bottom = 12.dp).semantics { contentDescription = state.t("usesPlates") + if (on) " ✓" else "" })
            }
            Labeled(state.t("restTime"), rest, { rest = it }, number = true, hint = num((state.catById[cat]?.rest ?: st.rest)))
            Txt(state.t("muscles"), Modifier.padding(bottom = 2.dp), muted = true, small = true)
            Txt(state.t("musclesHint"), Modifier.padding(bottom = 6.dp), muted = true, small = true)
            Chips(Modifier.padding(bottom = 12.dp)) {
                for (m in MuscleId.entries) {
                    val s = stateKey(shownMuscles, m)
                    val label = state.t(muscleKey(m))
                    Chip(
                        when (s) { "primary" -> "● $label"; "secondary" -> "○ $label"; else -> label },
                        s != "none", { muscles = cycleMuscle(shownMuscles, m) },
                        Modifier.semantics { contentDescription = "$label: ${state.t("ms_$s")}" },
                    )
                }
            }
            Chip(state.t("favourite"), favorite, { favorite = !favorite }, Modifier.padding(bottom = 12.dp))
            Labeled(state.t("notes"), notes, { notes = it }, minLines = 3)
            if (confirmDelete) {
                Card {
                    Txt(if (used > 0) state.t("deleteExerciseSetsQ", "n" to used) else state.t("deleteExerciseQ"))
                    Actions {
                        Btn(state.t("delete"), { confirmDelete = false; remove() }, kind = BtnKind.DANGER)
                        Btn(state.t("cancel"), { confirmDelete = false })
                    }
                }
            }
            Actions {
                Btn(state.t("save"), { save() }, kind = BtnKind.PRIMARY, enabled = !saving)
                if (id != null) Btn(state.t("delete"), { confirmDelete = true }, kind = BtnKind.DANGER)
            }
        }
    }
}
