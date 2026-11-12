package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.DistUnit
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.Metric
import io.github.quoterg.ironnotes.core.MetricKind
import io.github.quoterg.ironnotes.core.Point
import io.github.quoterg.ironnotes.core.Range
import io.github.quoterg.ironnotes.core.dToUser
import io.github.quoterg.ironnotes.core.fmtTime
import io.github.quoterg.ironnotes.core.metricKind
import io.github.quoterg.ironnotes.core.metricsFor
import io.github.quoterg.ironnotes.core.niceScale
import io.github.quoterg.ironnotes.core.wToUser
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

// The exercise screen's Graph tab: ExerciseProgress.tsx `Graph` + LineChart.tsx on a Canvas.

private const val KM_PER_MI = 1.609344
private const val MAX_DOTS = 120
private const val DAY = 86_400_000L

private val RANGES = listOf(Range.M1 to "r_1m", Range.M3 to "r_3m", Range.M6 to "r_6m", Range.Y1 to "r_1y", Range.ALL to "r_all")

/** Metric.MAX_WEIGHT -> "maxWeight" (the web's `m_<key>` strings). */
private fun metricKey(m: Metric): String {
    val parts = m.name.lowercase().split('_')
    return parts.first() + parts.drop(1).joinToString("") { it.replaceFirstChar(Char::uppercase) }
}

private fun dayMs(d: String): Long = epochDay(d) * DAY


/** LineChart.tsx `decimate`: beyond MAX_DOTS keep the min and max point per x-bucket. */
private fun decimate(v: DoubleArray): IntArray {
    if (v.size <= MAX_DOTS) return IntArray(v.size) { it }
    val buckets = MAX_DOTS / 2
    val size = v.size.toDouble() / buckets
    val keep = ArrayList<Int>(MAX_DOTS)
    for (b in 0 until buckets) {
        val start = Math.floor(b * size).toInt()
        val end = minOf(v.size, Math.floor((b + 1) * size).toInt())
        var lo = start
        var hi = start
        for (i in start until end) {
            if (v[i] < v[lo]) lo = i
            if (v[i] > v[hi]) hi = i
        }
        if (lo < hi) { keep.add(lo); keep.add(hi) } else if (lo > hi) { keep.add(hi); keep.add(lo) } else keep.add(lo)
    }
    return keep.toIntArray()
}

/** Everything the canvas draws, computed once per (data, size). */
private class ChartModel(
    val xs: FloatArray,
    val ys: FloatArray,
    val dots: IntArray,
    val path: Path,
    val gridY: FloatArray,
    val tickLabels: List<TextLayoutResult>,
    val firstLabel: TextLayoutResult,
    val lastLabel: TextLayoutResult,
    val left: Float,
    val right: Float,
    val top: Float,
    val bottom: Float,
)

@Composable
fun GraphTab(state: AppState, ex: Exercise) {
    val s = state.settings
    val metrics = remember(ex.kind) { metricsFor(ex.kind) }
    var metricName by rememberSaveable(ex.id) { mutableStateOf<String?>(null) }
    var rangeName by rememberSaveable(ex.id) { mutableStateOf(Range.M3.name) }
    val metric = metricName?.let { n -> metrics.firstOrNull { it.name == n } } ?: metrics.firstOrNull()
    val range = Range.valueOf(rangeName)
    val latest = remember { Latest() }
    var raw by remember(ex.id) { mutableStateOf<List<Point>>(emptyList()) }
    var loaded by remember(ex.id) { mutableStateOf(false) }
    var active by remember(ex.id, metric, range) { mutableStateOf<Int?>(null) }

    LaunchedEffect(ex.id, metric, range) {
        val m = metric ?: return@LaunchedEffect
        val id = latest.next()
        raw = emptyList()
        loaded = false
        state.run({ it.exerciseSeries(ex.id, m, range, today()) }) {
            if (latest.isLatest(id)) { raw = it; loaded = true }
        }
    }

    val m = metric
    val kind = if (m != null) metricKind(m) else MetricKind.REPS
    val paceMi = s.dist == DistUnit.MI
    val unit = when (kind) {
        MetricKind.WEIGHT -> unitLabel(s.unit)
        MetricKind.DISTANCE -> distLabel(s.dist)
        MetricKind.PACE -> "/" + if (paceMi) "mi" else "km"
        else -> ""
    }
    val title = if (m == null) "" else state.t("m_" + metricKey(m)) + if (unit.isNotEmpty()) " ($unit)" else ""
    // Stored units -> display units (as the web's `conv`), so the axis shows round numbers in kg/lb, km/mi.
    val points = remember(raw, kind, s.unit, s.dist) {
        raw.map { pt ->
            val v = when (kind) {
                MetricKind.WEIGHT -> wToUser(pt.value, s.unit)
                MetricKind.DISTANCE -> dToUser(pt.value, s.dist)
                MetricKind.PACE -> if (paceMi) pt.value * KM_PER_MI else pt.value
                else -> pt.value
            }
            Point(pt.date, v)
        }
    }
    val i18n = state.i18n
    val fmt: (Double) -> String = remember(kind, i18n) {
        { v ->
            when (kind) {
                MetricKind.WEIGHT -> i18n.dnum(v, 1)
                MetricKind.DISTANCE -> i18n.dnum(v, 2)
                MetricKind.TIME, MetricKind.PACE -> fmtTime(v)
                else -> i18n.dnum(v, 0)
            }
        }
    }
    val timeAxis = kind == MetricKind.TIME || kind == MetricKind.PACE

    Card {
        if (metrics.size > 1) {
            Txt(state.t("metric"), muted = true, small = true)
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (mm in metrics) {
                    Chip(state.t("m_" + metricKey(mm)), mm == m, { metricName = mm.name }, Modifier.semantics { selected = mm == m })
                }
            }
        }
        Txt(state.t("range"), muted = true, small = true)
        Row(Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((r, key) in RANGES) {
                Chip(state.t(key), r == range, { rangeName = r.name }, Modifier.semantics { selected = r == range })
            }
        }
        if (points.size >= 2) {
            GraphChart(state, title, points, fmt, timeAxis, active) { active = it }
        } else if (loaded || m == null) {
            Txt(state.t("notEnoughData"), muted = true, align = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp))
        }
    }
}

@Composable
private fun GraphChart(
    state: AppState,
    title: String,
    points: List<Point>,
    fmt: (Double) -> String,
    timeAxis: Boolean,
    active: Int?,
    onActive: (Int?) -> Unit,
) {
    val p = LocalPalette.current
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    var size by remember { mutableStateOf(IntSize.Zero) }
    val lang = state.i18n.lang
    val locale = remember(lang) { if (lang == "sv") Locale("sv", "SE") else Locale.getDefault() }
    val shortFmt = remember(locale) { SimpleDateFormat("d MMM", locale).apply { timeZone = TimeZone.getTimeZone("UTC") } }
    val longFmt = remember(locale) { SimpleDateFormat("d MMM yyyy", locale).apply { timeZone = TimeZone.getTimeZone("UTC") } }
    val axisStyle = remember(p.muted) { TextStyle(color = p.muted, fontSize = 10.sp, fontFeatureSettings = "tnum") }

    val model = remember(points, size, axisStyle, timeAxis, density.density, locale, fmt) {
        if (size.width == 0 || size.height == 0) null
        else buildModel(points, size, density.density, timeAxis, fmt, measurer, axisStyle, shortFmt, longFmt)
    }

    val last = points.last()
    val summary = "$title: ${points.size} ${state.t("workoutsCount")}, ${fmt(last.value)} (${longFmt.format(dayMs(last.date))})."
    val dotR = with(density) { 3.5.dp.toPx() }
    val onR = with(density) { 6.dp.toPx() }
    val strokeW = with(density) { 2.dp.toPx() }
    val hair = with(density) { 1.dp.toPx() }
    val gap = with(density) { 6.dp.toPx() }

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
                    onActive(nearest(xs, down.position.x))
                    while (true) {
                        val ev = awaitPointerEvent(PointerEventPass.Main)
                        val c = ev.changes.firstOrNull() ?: break
                        if (!c.pressed) break
                        onActive(nearest(xs, c.position.x))
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
            if (a != null && a < md.xs.size) {
                drawLine(p.muted, Offset(md.xs[a], md.top), Offset(md.xs[a], md.bottom), hair)
            }
            drawPath(md.path, p.accent, style = Stroke(strokeW, cap = StrokeCap.Round, join = StrokeJoin.Round))
            for (i in md.dots) {
                val r = if (i == a) onR else dotR
                drawCircle(p.bg, r + hair, Offset(md.xs[i], md.ys[i]))
                drawCircle(p.accent, r, Offset(md.xs[i], md.ys[i]))
            }
            if (a != null && a < md.xs.size && md.dots.indexOf(a) < 0) {
                drawCircle(p.bg, onR + hair, Offset(md.xs[a], md.ys[a]))
                drawCircle(p.accent, onR, Offset(md.xs[a], md.ys[a]))
            }
        }
    }
    val sel = active?.let { points.getOrNull(it) }
    Box(Modifier.fillMaxWidth().padding(vertical = 4.dp).height(36.dp)) {
        if (sel != null) Txt("${fmt(sel.value)} · ${longFmt.format(dayMs(sel.date))}", bold = true, small = true)
        else Txt(state.t("chartHint"), muted = true, small = true)
    }
}

/** Nearest point by x: binary search (points are sorted by date). */
private fun nearest(xs: FloatArray, px: Float): Int {
    var a = 0
    var b = xs.size - 1
    while (a < b) {
        val mid = (a + b) ushr 1
        if (xs[mid] < px) a = mid + 1 else b = mid
    }
    return if (a > 0 && px - xs[a - 1] < xs[a] - px) a - 1 else a
}

private fun buildModel(
    points: List<Point>,
    size: IntSize,
    d: Float,
    timeAxis: Boolean,
    fmt: (Double) -> String,
    measurer: TextMeasurer,
    style: TextStyle,
    shortFmt: SimpleDateFormat,
    longFmt: SimpleDateFormat,
): ChartModel {
    val n = points.size
    val vals = DoubleArray(n) { points[it].value }
    val t0 = dayMs(points[0].date)
    val t1 = maxOf(dayMs(points[n - 1].date), t0 + DAY)
    val sc = niceScale(vals.min(), vals.max(), timeAxis)
    val span = if (sc.hi - sc.lo == 0.0) 1.0 else sc.hi - sc.lo
    val left = 40 * d
    val right = size.width - 12 * d
    val top = 10 * d
    val bottom = size.height - 22 * d
    val xs = FloatArray(n) { (left + (dayMs(points[it].date) - t0).toDouble() / (t1 - t0) * (right - left)).toFloat() }
    val ys = FloatArray(n) { (top + (1 - (vals[it] - sc.lo) / span) * (bottom - top)).toFloat() }
    val dots = decimate(vals)
    val path = Path()
    for ((k, i) in dots.withIndex()) if (k == 0) path.moveTo(xs[i], ys[i]) else path.lineTo(xs[i], ys[i])
    val gridY = FloatArray(sc.ticks.size) { (top + (1 - (sc.ticks[it] - sc.lo) / span) * (bottom - top)).toFloat() }
    val labels = sc.ticks.map { measurer.measure(fmt(it), style) }
    val f = if (t1 - t0 > 300 * DAY) longFmt else shortFmt
    return ChartModel(
        xs, ys, dots, path, gridY, labels,
        measurer.measure(f.format(t0), style), measurer.measure(f.format(dayMs(points[n - 1].date)), style),
        left, right, top, bottom,
    )
}
