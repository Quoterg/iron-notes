package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.PlatesSettings
import io.github.quoterg.ironnotes.core.toolsCleanPlates
import io.github.quoterg.ironnotes.core.toolsDefaultPlates
import io.github.quoterg.ironnotes.core.toolsLimits
import io.github.quoterg.ironnotes.core.toolsOrm
import io.github.quoterg.ironnotes.core.toolsPlates
import io.github.quoterg.ironnotes.core.toolsWarmup
import io.github.quoterg.ironnotes.core.wToUser
import kotlinx.coroutines.delay

private val TABS = listOf("orm", "plates", "warmup")

/** Accepts "82", "82.5", "82,5"; anything else is NaN (Tools.tsx `parse`). */
private fun parseStrict(v: String): Double =
    if (Regex("^\\d+([.,]\\d+)?$").matches(v.trim())) v.trim().replace(',', '.').toDouble() else Double.NaN

/**
 * The calculators (Tools.tsx): estimated 1RM with a % table, plates per side, warm-up sets — in the user's
 * unit; the bar and plate sizes are saved per unit in the settings. `weight` (kg) and `reps` prefill.
 */
@Composable
fun ToolsScreen(state: AppState, weight: Double?, initReps: Double?) {
    val st = state.settings
    val limits = remember { toolsLimits() }
    val unit = unitLabel(st.unit)
    var tab by remember { mutableStateOf(if (weight != null && weight > 0) "plates" else "orm") }
    var w by remember { mutableStateOf(if (weight != null && weight > 0) num(wToUser(weight, st.unit), 2) else "") }
    // 1RM estimates are meaningful up to ~15 reps (the rep-max table's range): a longer set isn't prefilled.
    var reps by remember { mutableStateOf(if (initReps != null && initReps >= 1 && initReps <= 15) Math.round(initReps).toString() else "5") }
    val saved = st.plates
    val cfg = if (saved != null && saved.unit == st.unit) saved.bar to saved.sizes
    else toolsDefaultPlates(st.unit).let { it.bar to it.sizes }
    val target = parseStrict(w)
    val tooHeavy = target > limits.maxTarget
    val ok = target.isFinite() && target > 0 && !tooHeavy

    Sheet(state.t("tools"), { state.back() }, state.t("back")) {
        Column(
            Modifier.weight(1f).fillMaxWidth().imePadding().verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 120.dp),
        ) {
            Chips(Modifier.padding(bottom = 12.dp)) {
                for (k in TABS) Chip(state.t("tool_$k"), k == tab, { tab = k })
            }
            Card {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Txt("${state.t("weight")} ($unit)", Modifier.padding(bottom = 4.dp), muted = true, small = true)
                        Field(w, { w = it }, state.t("weight"), Modifier.fillMaxWidth(), number = true)
                    }
                    if (tab == "orm") {
                        Column(Modifier.weight(1f)) {
                            Txt(state.t("repsCol"), Modifier.padding(bottom = 4.dp), muted = true, small = true)
                            Field(reps, { reps = it }, state.t("repsCol"), Modifier.fillMaxWidth(), number = true)
                        }
                    }
                }
            }
            if (tooHeavy) Txt(state.t("tooHeavy", "max" to "${num(limits.maxTarget)} $unit"), Modifier.padding(bottom = 12.dp), color = LocalPalette.current.over)
            if (ok && tab == "orm") OrmView(state, target, Math.round(parseStrict(reps).let { if (it.isNaN()) 0.0 else it }).toInt(), unit)
            if (ok && tab == "plates") PlatesView(state, target, cfg.first, cfg.second, unit)
            if (ok && tab == "warmup") WarmupView(state, target, cfg.first, cfg.second, unit)
            if (tab != "orm") PlateSettingsView(state, cfg.first, cfg.second)
        }
    }
}

@Composable
private fun OrmView(state: AppState, weight: Double, reps: Int, unit: String) {
    if (reps < 1) return
    val r = remember(weight, reps, state.settings.formula) { toolsOrm(weight, reps.toDouble(), state.settings.formula) }
    val i = state.i18n
    Card {
        Txt(state.t("est1rm"), muted = true, small = true)
        Txt("${i.dnum(r.orm, 1)} $unit", bold = true, size = 34.sp)
    }
    Card {
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
            Txt(state.t("repsCol"), Modifier.weight(1f), muted = true, small = true)
            Txt("%", Modifier.weight(1f), muted = true, small = true)
            Txt(state.t("weightCol"), Modifier.weight(1.4f), muted = true, small = true)
        }
        for (row in r.rows) {
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                Txt(num(row.reps), Modifier.weight(1f))
                Txt("${num(row.pct)} %", Modifier.weight(1f))
                Txt("${i.dnum(row.weight, 1)} $unit", Modifier.weight(1.4f))
            }
        }
    }
}

@Composable
private fun PlatesView(state: AppState, target: Double, bar: Double, sizes: List<Double>, unit: String) {
    val r = remember(target, bar, sizes) { toolsPlates(target, bar, sizes) }
    val p = LocalPalette.current
    val heaviest = maxOf(sizes.maxOrNull() ?: 1.0, 1.0)
    val i = state.i18n
    Card {
        Heading(state.t("perSide"), Modifier.padding(bottom = 8.dp))
        if (r.plates.isNotEmpty()) {
            Row(
                Modifier.semantics { contentDescription = "${state.t("perSide")}: ${r.plates.joinToString(", ") { num(it) }}" },
                horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
            ) {
                for (pl in r.plates) {
                    Box(
                        Modifier.widthIn(min = 30.dp).height((28 + minOf(1.0, pl / heaviest) * 52).dp)
                            .clip(RoundedCornerShape(6.dp)).background(p.active, RoundedCornerShape(6.dp)).padding(horizontal = 4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Txt(i.dnum(pl), size = 12.sp, color = p.activeText, align = TextAlign.Center, bold = true)
                    }
                }
            }
        } else {
            Txt(state.t("barOnly"), muted = true)
        }
        Txt(
            "${state.t("barWeight")}: ${i.dnum(bar)} $unit" + if (r.rest > 0) " · " + state.t("cantLoad", "w" to "${i.dnum(r.rest)} $unit") else "",
            Modifier.padding(top = 8.dp), muted = true, small = true,
        )
    }
}

@Composable
private fun WarmupView(state: AppState, target: Double, bar: Double, sizes: List<Double>, unit: String) {
    val sets = remember(target, bar, sizes) { toolsWarmup(target, bar, sizes) }
    val i = state.i18n
    Card {
        Heading(state.t("warmupSets"), Modifier.padding(bottom = 8.dp))
        if (target <= bar) Txt(state.t("belowBar"), Modifier.padding(bottom = 6.dp), muted = true, small = true)
        sets.forEachIndexed { n, s -> Txt("${n + 1}.  ${i.dnum(s.weight)} $unit × ${num(s.reps)}", Modifier.padding(vertical = 2.dp)) }
        Txt("${sets.size + 1}.  ${i.dnum(target)} $unit — ${state.t("workingSet")}", Modifier.padding(vertical = 2.dp), bold = true)
    }
}

/** Bar and plate sizes, saved for the current unit: plates as chips (tap removes), added one at a time. */
@Composable
private fun PlateSettingsView(state: AppState, bar: Double, sizes: List<Double>) {
    val st = state.settings
    val limits = remember { toolsLimits() }
    var open by remember { mutableStateOf(false) }
    var b by remember(bar) { mutableStateOf(num(bar, 2)) }
    var add by remember { mutableStateOf("") }
    val unit = unitLabel(st.unit)

    fun save(nb: Double, ns: List<Double>): Boolean {
        val clean = toolsCleanPlates(nb, ns) ?: return false
        state.putSettings(st.copy(plates = PlatesSettings(st.unit, clean.bar, clean.sizes)))
        return true
    }
    // The bar is saved a moment after typing stops (the web saves on blur).
    LaunchedEffect(b) {
        val nb = parseStrict(b)
        if (nb.isNaN() || nb == bar) return@LaunchedEffect
        delay(700)
        save(nb, sizes)
    }
    val newPlate = parseStrict(add)
    val canAdd = newPlate.isFinite() && newPlate >= limits.minPlate && newPlate <= limits.maxPlate && newPlate !in sizes && sizes.size < limits.maxSizes.toInt()

    Card {
        LinkBtn(state.t("plateSettings"), { open = !open }, Modifier.fillMaxWidth())
        if (open) {
            Labeled("${state.t("barWeight")} ($unit)", b, { b = it }, number = true)
            Txt("${state.t("plateSizes")} ($unit)", Modifier.padding(bottom = 6.dp), muted = true, small = true)
            Chips(Modifier.padding(bottom = 12.dp)) {
                for (pl in sizes) {
                    Chip(
                        "${state.i18n.dnum(pl)} ×", false,
                        { if (sizes.size > 1) save(parseStrict(b).let { if (it.isNaN()) bar else it }, sizes.filter { it != pl }) },
                        Modifier.semantics { contentDescription = "${state.t("removePlate")} ${num(pl)}" },
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Txt(state.t("addPlate"), Modifier.padding(bottom = 4.dp), muted = true, small = true)
                    Field(add, { add = it }, state.t("addPlate"), Modifier.fillMaxWidth(), number = true)
                }
                Btn("+", {
                    if (canAdd && save(parseStrict(b).let { if (it.isNaN()) bar else it }, sizes + newPlate)) add = ""
                }, enabled = canAdd, label = state.t("addPlate"))
            }
        }
    }
}
