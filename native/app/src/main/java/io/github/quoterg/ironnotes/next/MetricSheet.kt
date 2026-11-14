package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.BodyMetricEntry
import io.github.quoterg.ironnotes.core.MetricDetail
import io.github.quoterg.ironnotes.core.addDays
import io.github.quoterg.ironnotes.core.niceScale
import java.text.SimpleDateFormat
import java.util.Locale

private const val PAGE = 30
private const val DAY = 86_400_000L

/** One body measure (MetricSheet.tsx): add an entry, its graph (with a 7-entry trend for body weight), its entries. */
@Composable
fun MetricScreen(state: AppState, id: String?) {
    var detail by remember(id) { mutableStateOf<MetricDetail?>(null) }
    var missing by remember(id) { mutableStateOf(false) }
    var value by rememberSaveable(id) { mutableStateOf("") }
    var day by rememberSaveable(id) { mutableStateOf(today()) }
    var shown by rememberSaveable(id) { mutableStateOf(PAGE) }
    var renaming by rememberSaveable(id) { mutableStateOf(false) }
    var name by rememberSaveable(id) { mutableStateOf("") }
    var confirmDelete by rememberSaveable(id) { mutableStateOf(false) }

    fun reload() {
        if (id == null) return
        state.run({ it.metricDetail(id) }) { if (it == null) missing = true else detail = it }
    }
    // Settings may change under us (kg ↔ lb): the numbers are read again when coming back.
    LaunchedEffect(id, state.settings.unit) { reload() }

    val d = detail
    val m = d?.metric
    val title = if (m != null) state.i18n.shown("metrics", m.name) else state.t("body")
    if (missing) {
        LaunchedEffect(Unit) { state.back() }
    }

    Sheet(title, { state.back() }, state.t("back")) {
        SheetBody {
            if (d == null || m == null) {
                if (!missing) Txt(state.t("loading"), muted = true)
                return@SheetBody
            }
            val unit = d.unit
            val today = today()
            // Strict: "12abc" or "1,234.5" isn't a value.
            val trimmed = value.trim()
            val parsed = if (Regex("^\\d+([.,]\\d+)?$").matches(trimmed)) trimmed.replace(',', '.').toDouble() else null
            val valid = parsed != null && day <= today
            val last = d.values.lastOrNull()

            fun save() {
                val v = parsed ?: return
                state.run({ it.addBodyEntry(m.id, day, v) }) {
                    value = ""
                    reload()
                }
            }

            Card {
                Txt(if (unit.isNotEmpty()) "${state.t("value")} ($unit)" else state.t("value"), muted = true, small = true, modifier = Modifier.padding(bottom = 4.dp))
                Field(value, { value = it }, state.t("value"), Modifier.fillMaxWidth(), number = true)
                if (value.isEmpty() && last != null) Txt(state.i18n.dnum(last, 1), muted = true, small = true, modifier = Modifier.padding(top = 4.dp))
                Txt(state.t("dateCol"), muted = true, small = true, modifier = Modifier.padding(top = 10.dp, bottom = 4.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconBtn("‹", state.t("prevDay"), { day = addDays(day, -1) })
                    Box(Modifier.weight(1f).heightIn(min = 44.dp), contentAlignment = Alignment.Center) {
                        Txt(state.i18n.dayLabel(day), bold = true)
                    }
                    IconBtn("›", state.t("nextDay"), { day = addDays(day, 1) }, enabled = day < today)
                }
                Btn(state.t("save"), { save() }, Modifier.fillMaxWidth().padding(top = 12.dp), kind = BtnKind.PRIMARY, enabled = valid)
            }

            if (d.values.size >= 2) {
                Card {
                    val chartTitle = if (unit.isNotEmpty()) "${title} ($unit)" else title
                    BodyChart(state, chartTitle, d.entries.map { it.date }, d.values, d.trend)
                }
            }

            if (d.entries.isNotEmpty()) {
                Card(padding = 0.dp) {
                    d.entries.asReversed().take(shown).forEach { e ->
                        val label = state.i18n.dayLabel(e.date)
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Txt(label, Modifier.weight(1f), bold = true)
                            val uv = d.values[d.entries.indexOf(e)]
                            Txt(bodyText(state, uv, unit), bold = true)
                            IconBtn("✕", "${state.t("delete")}: $label", { removeEntry(state, e, ::reload) }, small = true)
                        }
                    }
                }
            }
            if (shown < d.entries.size) {
                Btn(state.t("showMore"), { shown += PAGE }, Modifier.fillMaxWidth().padding(bottom = 12.dp))
            }

            if (renaming) {
                Txt(state.t("name"), muted = true, small = true, modifier = Modifier.padding(bottom = 4.dp))
                Field(name, { name = it }, state.t("name"), Modifier.fillMaxWidth())
                Actions {
                    Btn(state.t("save"), {
                        val n = name.trim()
                        renaming = false
                        if (n.isNotEmpty()) state.run({ it.renameMetric(m.id, n) }) { reload(); BodyStore.load(state) }
                    }, kind = BtnKind.PRIMARY)
                    Btn(state.t("cancel"), { renaming = false })
                }
            } else if (confirmDelete) {
                ConfirmCard(state, state.t("deleteMeasureQ", "n" to d.entries.size), state.t("deleteMeasure"), {
                    state.run({ it.deleteMetric(m.id) }) {
                        BodyStore.load(state)
                        state.back()
                    }
                }, { confirmDelete = false })
            } else {
                Actions {
                    Btn(state.t("rename"), { name = m.name; renaming = true })
                    IconBtn("↑", state.t("moveUp"), { state.run({ it.moveMetric(m.id, -1) }) { BodyStore.load(state) } })
                    IconBtn("↓", state.t("moveDown"), { state.run({ it.moveMetric(m.id, 1) }) { BodyStore.load(state) } })
                }
                Actions {
                    Btn(state.t("deleteMeasure"), { confirmDelete = true }, kind = BtnKind.DANGER)
                }
            }
        }
    }
}

/** Deletes an entry (an earlier one of the same date shows again) with an undo toast. */
private fun removeEntry(state: AppState, e: BodyMetricEntry, reload: () -> Unit) {
    state.run({ it.deleteEntry(e.id) }) {
        reload()
        state.showToast(state.t("entryDeleted"), state.t("undo")) {
            state.run({ it.putEntry(e) }) { reload() }
        }
    }
}

private fun dayMs(d: String): Long = epochDay(d) * DAY

/** Everything the canvas draws, computed once per (data, size). */
private class BodyChartModel(
    val xs: FloatArray,
    val ys: FloatArray,
    val trendYs: FloatArray?,
    val gridY: FloatArray,
    val tickLabels: List<TextLayoutResult>,
    val firstLabel: TextLayoutResult,
    val lastLabel: TextLayoutResult,
    val left: Float,
    val right: Float,
    val top: Float,
    val bottom: Float,
)

/** LineChart.tsx for a body measure: a line with dots and (body weight) a 7-entry trend line; touch to read a value. */
@Composable
private fun BodyChart(state: AppState, title: String, dates: List<String>, values: List<Double>, trend: List<Double>) {
    val p = LocalPalette.current
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    var size by remember { mutableStateOf(IntSize.Zero) }
    var active by remember(dates, values) { mutableStateOf<Int?>(null) }
    val lang = state.i18n.lang
    val locale = remember(lang) { if (lang == "sv") Locale("sv", "SE") else Locale.getDefault() }
    val tz = remember { java.util.TimeZone.getTimeZone("UTC") }
    val shortFmt = remember(locale) { SimpleDateFormat("d MMM", locale).apply { timeZone = tz } }
    val longFmt = remember(locale) { SimpleDateFormat("d MMM yyyy", locale).apply { timeZone = tz } }
    val axisStyle = remember(p.muted) { TextStyle(color = p.muted, fontSize = 10.sp, fontFeatureSettings = "tnum") }
    val fmt: (Double) -> String = { state.i18n.dnum(it, 1) }
    val pointColor = chartPoint(p)
    val trendColor = chartTrend(p)

    val model = remember(dates, values, trend, size, density.density, locale, lang) {
        if (size.width == 0 || size.height == 0) null else {
            val d = density.density
            val n = values.size
            val all = if (trend.isEmpty()) values else values + trend
            val sc = niceScale(all.min(), all.max(), false)
            val span = if (sc.hi - sc.lo == 0.0) 1.0 else sc.hi - sc.lo
            val t0 = dayMs(dates.first())
            val t1 = maxOf(dayMs(dates.last()), t0 + DAY)
            val left = 40 * d
            val right = size.width - 12 * d
            val top = 10 * d
            val bottom = size.height - 22 * d
            fun y(v: Double) = (top + (1 - (v - sc.lo) / span) * (bottom - top)).toFloat()
            val f = if (t1 - t0 > 300 * DAY) longFmt else shortFmt
            BodyChartModel(
                FloatArray(n) { (left + (dayMs(dates[it]) - t0).toDouble() / (t1 - t0) * (right - left)).toFloat() },
                FloatArray(n) { y(values[it]) },
                if (trend.isEmpty()) null else FloatArray(n) { y(trend[it]) },
                FloatArray(sc.ticks.size) { y(sc.ticks[it]) },
                sc.ticks.map { measurer.measure(fmt(it), axisStyle) },
                measurer.measure(f.format(t0), axisStyle), measurer.measure(f.format(dayMs(dates.last())), axisStyle),
                left, right, top, bottom,
            )
        }
    }

    val summary = "$title: ${values.size} ${state.t("entriesCount")}, ${fmt(values.last())} (${longFmt.format(dayMs(dates.last()))})."
    val dotR = with(density) { 3.5.dp.toPx() }
    val onR = with(density) { 6.dp.toPx() }
    val strokeW = with(density) { 2.dp.toPx() }
    val hair = with(density) { 1.dp.toPx() }
    val gap = with(density) { 6.dp.toPx() }

    Txt(title, bold = true, small = true, modifier = Modifier.padding(bottom = 4.dp))
    Box(
        Modifier
            .fillMaxWidth()
            .height(180.dp)
            .semantics { contentDescription = summary }
            .onSizeChanged { size = it }
            .clipToBounds()
            .pointerInput(model) {
                val xs = model?.xs ?: return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    active = nearestX(xs, down.position.x)
                    while (true) {
                        val ev = awaitPointerEvent(PointerEventPass.Main)
                        val c = ev.changes.firstOrNull() ?: break
                        if (!c.pressed) break
                        active = nearestX(xs, c.position.x)
                    }
                }
            },
    ) {
        Canvas(Modifier.fillMaxWidth().height(180.dp)) {
            val md = model ?: return@Canvas
            for (k in md.gridY.indices) {
                val y = md.gridY[k]
                drawLine(p.line, Offset(md.left, y), Offset(md.right, y), hair)
                val tl = md.tickLabels[k]
                drawText(tl, topLeft = Offset(md.left - gap - tl.size.width, y - tl.size.height / 2f))
            }
            val ly = this.size.height - md.lastLabel.size.height.toFloat()
            drawText(md.firstLabel, topLeft = Offset(md.left, ly))
            drawText(md.lastLabel, topLeft = Offset(md.right - md.lastLabel.size.width, ly))
            val a = active
            if (a != null && a < md.xs.size) drawLine(p.muted, Offset(md.xs[a], md.top), Offset(md.xs[a], md.bottom), hair)
            val line = Path()
            for (i in md.xs.indices) if (i == 0) line.moveTo(md.xs[i], md.ys[i]) else line.lineTo(md.xs[i], md.ys[i])
            drawPath(line, pointColor, style = Stroke(strokeW, cap = StrokeCap.Round, join = StrokeJoin.Round))
            md.trendYs?.let { ty ->
                val tp = Path()
                for (i in md.xs.indices) if (i == 0) tp.moveTo(md.xs[i], ty[i]) else tp.lineTo(md.xs[i], ty[i])
                drawPath(tp, trendColor, style = Stroke(strokeW, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            // Dots only while they stay readable (a long history is just the line).
            if (md.xs.size <= 120) {
                for (i in md.xs.indices) {
                    val r = if (i == a) onR else dotR
                    drawCircle(p.bg, r + hair, Offset(md.xs[i], md.ys[i]))
                    drawCircle(pointColor, r, Offset(md.xs[i], md.ys[i]))
                }
            } else if (a != null && a < md.xs.size) {
                drawCircle(p.bg, onR + hair, Offset(md.xs[a], md.ys[a]))
                drawCircle(pointColor, onR, Offset(md.xs[a], md.ys[a]))
            }
        }
    }
    val sel = active?.takeIf { it < values.size }
    Box(Modifier.fillMaxWidth().padding(vertical = 4.dp).heightIn(min = 36.dp)) {
        if (sel != null) {
            val t = trend.getOrNull(sel)
            val extra = if (t != null) " · ${state.t("trend")} ${fmt(t)}" else ""
            Txt("${fmt(values[sel])} · ${longFmt.format(dayMs(dates[sel]))}$extra", bold = true, small = true)
        } else {
            Txt(state.t("chartHint"), muted = true, small = true)
        }
    }
    if (trend.isNotEmpty()) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Txt("● ${state.t("entriesCount")}", small = true, color = pointColor)
            Txt("● ${state.t("trend")}", small = true, color = trendColor)
        }
    }
}

/** Nearest point by x: binary search (points are sorted by date). */
private fun nearestX(xs: FloatArray, px: Float): Int {
    var a = 0
    var b = xs.size - 1
    while (a < b) {
        val mid = (a + b) ushr 1
        if (xs[mid] < px) a = mid + 1 else b = mid
    }
    return if (a > 0 && px - xs[a - 1] < xs[a] - px) a - 1 else a
}
