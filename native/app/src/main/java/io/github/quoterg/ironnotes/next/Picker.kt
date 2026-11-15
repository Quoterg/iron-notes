package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.Category
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.Routine
import io.github.quoterg.ironnotes.core.RoutineDay
import java.text.Normalizer
import java.util.Locale

/** muscles.ts `fold`: accents removed, lower case. */
private fun fold(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase()

private class SearchEntry(val e: Exercise, val name: String, val tier1: String, val sec: String)

/** One row of the lazy list. */
private sealed interface Item {
    val key: String

    data class Title(val text: String) : Item { override val key get() = "t:$text" }
    data class Ex(val e: Exercise, val showCat: Boolean, val section: String) : Item { override val key get() = "$section:${e.id}" }
    data class Workout(val r: Routine, val d: RoutineDay) : Item { override val key get() = "w:${d.id}" }
    data class Cat(val c: Category, val count: Int) : Item { override val key get() = "c:${c.id}" }
    data class Back(val c: Category) : Item { override val key get() = "back" }
    data class Empty(val text: String) : Item { override val key get() = "empty" }
}

/** Add exercise (Picker.tsx, add mode): search, favourites, categories, then the exercises of one. */
@Composable
fun PickerScreen(state: AppState, date: String, manage: Boolean = false) {
    var q by rememberSaveable { mutableStateOf("") }
    var cat by rememberSaveable { mutableStateOf<String?>(null) }
    val exercises = state.exercises
    // Saved workouts are offered when logging a day (not when managing).
    val logging = !manage
    var recent by remember { mutableStateOf<List<String>>(emptyList()) }
    LaunchedEffect(manage) {
        if (!manage) state.run({ it.recentExerciseIds(8u) }) { recent = it }
        if (logging && RoutineStore.list == null) RoutineStore.load(state)
    }
    val workouts = if (logging) RoutineStore.list.orEmpty().flatMap { r -> r.days.filter { it.items.isNotEmpty() }.map { Item.Workout(r, it) } } else emptyList()
    val lang = state.i18n.lang
    val accent = LocalPalette.current.accent
    val shownName = { e: Exercise -> state.i18n.shown("exercises", e.name) }

    // Built once per library / language change; a keystroke only matches.
    val index = remember(exercises, state.categories, lang) {
        val cats = state.categories.associateBy { it.id }
        fun labels(ms: List<Any>) = fold(ms.joinToString(" ") { state.t("mu_$it") })
        exercises.map { e ->
            val shown = shownName(e)
            val name = fold(if (shown != e.name) "${e.name} $shown" else e.name)
            val c = cats[e.categoryId]
            val catText = c?.let { fold("${it.name} ${state.i18n.shown("categories", it.name)}") } ?: ""
            val m = e.muscles
            SearchEntry(e, name, "$name $catText ${if (m != null) labels(m.primary) else ""}", if (m != null) labels(m.secondary) else "")
        }
    }
    val sorted = remember(state.categories) { state.categories.sortedBy { it.order } }
    val collator = remember(lang) { java.text.Collator.getInstance(if (lang == "sv") Locale("sv", "SE") else Locale.getDefault()) }

    val query = fold(q.trim())
    val selected = cat?.let { state.catById[it] }
    val items: List<Item> = when {
        query.isNotEmpty() -> {
            val words = query.split(Regex("\\s+")).filter { it.isNotEmpty() }
            val hits = index.mapNotNull { x ->
                when {
                    words.all { x.name.contains(it) } -> 0 to x.e
                    words.all { x.tier1.contains(it) } -> 1 to x.e
                    x.sec.isNotEmpty() && words.all { "${x.tier1} ${x.sec}".contains(it) } -> 2 to x.e
                    else -> null
                }
            }.sortedBy { it.first }.map { Item.Ex(it.second, true, "s") }
            val wHits = workouts.filter { w -> val f = fold("${w.d.name} ${w.r.name}"); words.all { f.contains(it) } }
            (wHits + hits).ifEmpty { listOf(Item.Empty(state.t("noMatches"))) }
        }
        selected != null -> {
            val list = exercises.filter { it.categoryId == selected.id }.map { it to shownName(it) }
                .sortedWith { a, b -> collator.compare(a.second, b.second) }
            listOf<Item>(Item.Back(selected)) + list.map { Item.Ex(it.first, false, "e") }
        }
        else -> {
            val counts = exercises.groupingBy { it.categoryId }.eachCount()
            val favs = exercises.filter { it.favorite == true }
            val recents = recent.mapNotNull { id -> state.exById[id]?.takeIf { it.favorite != true } }
            buildList {
                // The first search (nothing recent, no favourites or workouts yet): say how to find one (Q4).
                if (workouts.isEmpty() && favs.isEmpty() && recents.isEmpty()) add(Item.Empty(state.t("pickerHint")))
                if (workouts.isNotEmpty()) {
                    add(Item.Title(state.t("workoutsSection")))
                    addAll(workouts)
                }
                if (favs.isNotEmpty()) {
                    add(Item.Title(state.t("favourites")))
                    favs.forEach { add(Item.Ex(it, true, "f")) }
                }
                if (recents.isNotEmpty()) {
                    add(Item.Title(state.t("recent")))
                    recents.forEach { add(Item.Ex(it, true, "r")) }
                }
                if (favs.isNotEmpty() || recents.isNotEmpty() || workouts.isNotEmpty()) add(Item.Title(state.t("categories")))
                sorted.forEach { add(Item.Cat(it, counts[it.id] ?: 0)) }
            }
        }
    }

    Sheet(state.t(if (manage) "manageExercises" else "addExercise"), { state.back() }, state.t("back")) {
        Field(q, { q = it }, state.t("searchExercises"), Modifier.fillMaxWidth().padding(16.dp, 12.dp), placeholder = state.t("searchExercises") + "…")
        LazyColumn(Modifier.fillMaxWidth().navigationBarsPadding(), contentPadding = PaddingValues(bottom = 96.dp)) {
            items(items, key = { it.key }) { item ->
                when (item) {
                    is Item.Title -> Txt(
                        item.text.uppercase(), Modifier.padding(16.dp, 16.dp, 16.dp, 4.dp).semantics { heading() },
                        muted = true, size = 13.sp,
                    )
                    is Item.Empty -> Txt(item.text, Modifier.padding(16.dp), muted = true)
                    is Item.Back -> Row(
                        Modifier.fillMaxWidth().heightIn(min = 44.dp)
                            .clickable(role = Role.Button) { cat = null }.padding(16.dp, 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Txt("‹", color = accent)
                        Dot(item.c.color)
                        Txt(state.i18n.shown("categories", item.c.name), color = accent, bold = true)
                    }
                    is Item.Cat -> Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            .clickable(role = Role.Button) { cat = item.c.id }.padding(16.dp, 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Dot(item.c.color)
                        Txt(state.i18n.shown("categories", item.c.name), Modifier.weight(1f))
                        Txt(item.count.toString(), muted = true, small = true)
                    }
                    is Item.Workout -> Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            .clickable(role = Role.Button) {
                                val name = item.d.name
                                state.run({ it.logRoutineDay(item.r.id, item.d.id, date) }) {
                                    state.back()
                                    state.loadDay(date)
                                    state.showToast(state.t("workoutAdded", "name" to name))
                                }
                            }
                            .semantics { contentDescription = "${state.t("addWorkout")}: ${item.d.name}" }
                            .padding(16.dp, 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Txt(buildString { append(item.d.name); append(" · "); append(item.r.name) }, Modifier.weight(1f))
                        Txt(state.tn("oneExercise", "nExercises", item.d.items.size), muted = true, small = true)
                    }
                    is Item.Ex -> Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            Modifier.weight(1f).heightIn(min = 48.dp)
                            .clickable(role = Role.Button) {
                                if (manage) {
                                    state.open(Screen.EditExercise(item.e.id, null))
                                } else {
                                    // The web replaces the picker with the exercise's screen.
                                    state.back()
                                    state.open(Screen.Exercise(item.e.id, date))
                                }
                            }.padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (item.showCat) Dot(state.catById[item.e.categoryId]?.color)
                            Txt(shownName(item.e), Modifier.weight(1f))
                        }
                        val fav = item.e.favorite == true
                        Txt(
                            if (fav) "★" else "☆",
                            Modifier.heightIn(min = 48.dp).widthIn(min = 48.dp)
                                .toggleable(fav, role = Role.Checkbox) {
                                    state.run({ it.putExercise(item.e.copy(favorite = !fav)) }) { state.reloadLibrary() }
                                }
                                .semantics { contentDescription = state.t("favourite") }
                                .wrapContentSize(Alignment.Center),
                            color = if (fav) accent else null,
                        )
                    }
                }
            }
            item(key = "new") {
                Actions(Modifier.padding(horizontal = 16.dp)) {
                    Btn(
                        "+ ${state.t("newExercise")}",
                        { state.open(Screen.EditExercise(null, selected?.id, if (manage) null else date)) },
                        kind = BtnKind.PRIMARY,
                    )
                    if (manage && query.isEmpty()) {
                        Btn(
                            if (selected != null) state.t("editCategory") else "+ ${state.t("newCategory")}",
                            { state.open(Screen.Category(selected?.id)) },
                        )
                    }
                }
            }
        }
    }
}
