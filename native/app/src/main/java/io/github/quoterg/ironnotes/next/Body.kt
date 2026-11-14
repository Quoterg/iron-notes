package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.BodyKind
import io.github.quoterg.ironnotes.core.MetricSummary
import java.text.SimpleDateFormat
import java.util.Locale

/** The measures as loaded (the web's `metrics` / `latest` signals): shared by the Body tab and measure screens. */
object BodyStore {
    var list by mutableStateOf<List<MetricSummary>?>(null)

    fun load(state: AppState) {
        state.run({ it.bodyOverview() }) { list = it }
    }
}

private val KINDS = listOf(BodyKind.WEIGHT, BodyKind.PERCENT, BodyKind.LENGTH, BodyKind.NUMBER)

internal fun kindKey(k: BodyKind) = "kind_" + k.name.lowercase()

/** "d MMM" in the language's format (Body.tsx `shortDate`). */
internal fun shortDate(state: AppState, d: String): String =
    SimpleDateFormat("d MMM", if (state.i18n.lang == "sv") Locale("sv", "SE") else Locale.getDefault()).format(parseIso(d).time)

/** The Body tab (Body.tsx): every measure with its latest value and the change since the entry before; add a measure. */
@Composable
fun BodyTab(state: AppState) {
    var name by rememberSaveable { mutableStateOf("") }
    var kindName by rememberSaveable { mutableStateOf(BodyKind.LENGTH.name) }
    val kind = BodyKind.valueOf(kindName)
    // Reload when coming back from a measure's screen (entries, renames, deletes).
    LaunchedEffect(state.stack.size) { BodyStore.load(state) }
    val list = BodyStore.list

    fun create() {
        val n = name.trim()
        if (n.isEmpty()) return
        state.run({ it.addMetric(n, kind) }) {
            name = ""
            BodyStore.load(state)
            state.open(Screen.Metric(it.id))
        }
    }

    Column(
        Modifier.fillMaxWidth().widthIn(max = 640.dp).verticalScroll(rememberScrollState()).imePadding()
            .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp),
    ) {
        if (list == null) Txt(state.t("loading"), Modifier.fillMaxWidth().padding(16.dp), muted = true, align = TextAlign.Center)
        else if (list.isNotEmpty()) Card(padding = 0.dp) {
            list.forEach { row ->
                val m = row.metric
                val label = state.i18n.shown("metrics", m.name)
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button) { state.open(Screen.Metric(m.id)) }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Txt(label, Modifier.weight(1f), bold = true)
                    val v = row.value
                    if (v != null) {
                        val change = row.change
                        Row(verticalAlignment = Alignment.Bottom) {
                            Txt(bodyText(state, v, row.unit), bold = true)
                            if (change != null && change != 0.0) {
                                Txt(" " + (if (change > 0) "+" else "−") + state.i18n.dnum(Math.abs(change), 1), small = true, bold = true, color = chartColor(change > 0))
                            }
                            Txt(" · " + shortDate(state, row.date!!), small = true, muted = true)
                        }
                    } else {
                        Txt(state.t("noEntries"), small = true, muted = true)
                    }
                }
            }
        }

        Card {
            Heading(state.t("newMeasure"), Modifier.padding(bottom = 8.dp))
            Txt(state.t("name"), muted = true, small = true, modifier = Modifier.padding(bottom = 4.dp))
            Field(name, { name = it }, state.t("name"), Modifier.fillMaxWidth())
            Txt(state.t("measureKind"), muted = true, small = true, modifier = Modifier.padding(top = 10.dp, bottom = 4.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (k in KINDS) Chip(state.t(kindKey(k)), k == kind, { kindName = k.name })
            }
            Btn("+ ${state.t("newMeasure")}", { create() }, Modifier.fillMaxWidth().padding(top = 12.dp), kind = BtnKind.PRIMARY, enabled = name.isNotBlank())
        }
    }
}

/** "82.4 kg" with a decimal comma in Swedish; "3" for a plain number. */
internal fun bodyText(state: AppState, userValue: Double, unit: String): String =
    state.i18n.dnum(userValue, 1) + if (unit.isEmpty()) "" else " $unit"

/** `.delta.up` / `.delta.down` (neutral: up or down is not good or bad by itself). */
@Composable
internal fun chartColor(up: Boolean) = if (up) chartPoint(LocalPalette.current) else chartTrend(LocalPalette.current)

internal fun chartPoint(p: Palette) = if (p.dark) androidx.compose.ui.graphics.Color(0xFFB78CFF) else androidx.compose.ui.graphics.Color(0xFF7B5CFF)
internal fun chartTrend(p: Palette) = if (p.dark) androidx.compose.ui.graphics.Color(0xFF2BFFCF) else androidx.compose.ui.graphics.Color(0xFF0F9C7D)
