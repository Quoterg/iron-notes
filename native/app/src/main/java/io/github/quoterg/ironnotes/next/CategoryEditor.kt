package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.categoryColors
import io.github.quoterg.ironnotes.core.newId

/** Create or edit a category (CategoryEditor.tsx): name, default rest, colour. Only an empty category can be deleted. */
@Composable
fun CategoryEditorScreen(state: AppState, id: String?) {
    val p = LocalPalette.current
    val old = remember(id) { id?.let { i -> state.categories.firstOrNull { it.id == i } } }
    val colors = remember { categoryColors() }
    var name by remember(id) { mutableStateOf(old?.name ?: "") }
    var color by remember(id) { mutableStateOf(old?.color ?: colors[state.categories.size % colors.size]) }
    var rest by remember(id) { mutableStateOf(old?.rest?.let { num(it) } ?: "") }
    var error by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    val inUse = id != null && state.exercises.any { it.categoryId == id }

    fun save() {
        val n = name.trim()
        if (n.isEmpty()) { error = state.t("nameRequired"); return }
        val order = old?.order ?: ((state.categories.maxOfOrNull { it.order } ?: -1.0).coerceAtLeast(-1.0) + 1)
        val r = rest.trim().takeWhile { it.isDigit() }.toIntOrNull()
        val c = io.github.quoterg.ironnotes.core.Category(id = id ?: newId(), name = n, color = color, order = order, rest = if (r != null && r > 0) r.toDouble() else null)
        state.run({ it.putCategory(c) }) {
            state.reloadLibrary()
            state.back()
        }
    }

    fun remove() {
        if (id == null || inUse) return
        state.run({ it.deleteCategory(id) }) {
            state.reloadLibrary()
            // The picker under this screen may be showing the deleted category.
            state.back()
        }
    }

    Sheet(state.t(if (id != null) "editCategory" else "newCategory"), { state.back() }, state.t("back")) {
        Column(
            Modifier.weight(1f).fillMaxWidth().imePadding().verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 120.dp),
        ) {
            Labeled(state.t("name"), name, { name = it; error = "" })
            if (error.isNotEmpty()) Txt(error, Modifier.padding(bottom = 12.dp), color = p.over)
            Labeled(state.t("categoryRest"), rest, { rest = it }, number = true, hint = num(state.settings.rest))
            Txt(state.t("colour"), Modifier.padding(bottom = 6.dp), muted = true, small = true)
            // Swatches in rows of five.
            for (row in colors.chunked(5)) {
                androidx.compose.foundation.layout.Row(Modifier.padding(bottom = 8.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
                    for (c in row) {
                        val on = c == color
                        Box(
                            Modifier.size(44.dp).clip(CircleShape).background(parseColor(c) ?: Color.Gray, CircleShape)
                                .border(if (on) 3.dp else 1.dp, if (on) p.text else p.cardBorder, CircleShape)
                                .clickable(role = Role.RadioButton) { color = c }
                                .semantics { contentDescription = c; selected = on; role = Role.RadioButton },
                        )
                    }
                }
            }
            if (confirmDelete) {
                Card(Modifier.padding(top = 8.dp)) {
                    Txt(state.t("deleteCategoryQ"))
                    Actions {
                        Btn(state.t("delete"), { confirmDelete = false; remove() }, kind = BtnKind.DANGER)
                        Btn(state.t("cancel"), { confirmDelete = false })
                    }
                }
            }
            Actions {
                Btn(state.t("save"), { save() }, kind = BtnKind.PRIMARY)
                if (id != null) Btn(state.t("delete"), { confirmDelete = true }, kind = BtnKind.DANGER, enabled = !inUse)
            }
            if (inUse) Txt(state.t("categoryInUse"), muted = true, small = true)
        }
    }
}
