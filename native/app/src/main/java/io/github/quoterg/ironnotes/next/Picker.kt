package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.Category
import io.github.quoterg.ironnotes.core.Exercise
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
    data class Cat(val c: Category, val count: Int) : Item { override val key get() = "c:${c.id}" }
    data class Back(val c: Category) : Item { override val key get() = "back" }
    data class Empty(val text: String) : Item { override val key get() = "empty" }
}

/** Add exercise (Picker.tsx, add mode): search, favourites, categories, then the exercises of one. */
@Composable
fun PickerScreen(state: AppState, date: String) {
    var q by rememberSaveable { mutableStateOf("") }
    var cat by rememberSaveable { mutableStateOf<String?>(null) }
    val exercises = state.exercises
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
            hits.ifEmpty { listOf(Item.Empty(state.t("noMatches"))) }
        }
        selected != null -> {
            val list = exercises.filter { it.categoryId == selected.id }.map { it to shownName(it) }
                .sortedWith { a, b -> collator.compare(a.second, b.second) }
            listOf<Item>(Item.Back(selected)) + list.map { Item.Ex(it.first, false, "e") }
        }
        else -> {
            val counts = exercises.groupingBy { it.categoryId }.eachCount()
            val favs = exercises.filter { it.favorite == true }
            buildList {
                if (favs.isNotEmpty()) {
                    add(Item.Title(state.t("favourites")))
                    favs.forEach { add(Item.Ex(it, true, "f")) }
                    add(Item.Title(state.t("categories")))
                }
                sorted.forEach { add(Item.Cat(it, counts[it.id] ?: 0)) }
            }
        }
    }

    Sheet(state.t("addExercise"), { state.back() }, state.t("back")) {
        Field(q, { q = it }, state.t("searchExercises"), Modifier.fillMaxWidth().padding(16.dp, 12.dp))
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
                    is Item.Ex -> Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            .clickable(role = Role.Button) {
                                // The web replaces the picker with the exercise's screen.
                                state.back()
                                state.open(Screen.Exercise(item.e.id, date))
                            }.padding(16.dp, 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (item.showCat) Dot(state.catById[item.e.categoryId]?.color)
                        Txt(shownName(item.e), Modifier.weight(1f))
                    }
                }
            }
        }
    }
}
