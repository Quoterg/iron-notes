package io.github.quoterg.ironnotes.next

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import io.github.quoterg.ironnotes.core.DayData
import io.github.quoterg.ironnotes.core.Summary
import io.github.quoterg.ironnotes.core.WorkoutSet
import io.github.quoterg.ironnotes.core.fmtDuration
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Shares the summary image: its own provider class, so it can't collide with other file providers. */
class ShareFileProvider : FileProvider()

/** The device zone's offset at noon of `date`, in minutes east of UTC (the core has no time zones). */
internal fun tzOffsetMin(date: String): Int =
    TimeZone.getDefault().getOffset(epochDay(date) * 86_400_000L + 43_200_000L) / 60_000

/** Everything the summary screen shows, read once. */
private class SummaryData(val day: DayData, val summary: Summary)

/** A day's summary: stats, goals met, exercises; shared as text or as an image (Summary.tsx). */
@Composable
fun SummaryScreen(state: AppState, date: String) {
    val context = LocalContext.current
    val pal = LocalPalette.current
    val colors = CardColors(pal.bg.toArgb(), pal.text.toArgb(), pal.muted.toArgb(), pal.accent.toArgb())
    var data by remember(date) { mutableStateOf<SummaryData?>(null) }
    // Read once when the screen opens (it's on top of the log: no edits while it's open).
    LaunchedEffect(date) {
        state.run({ core -> SummaryData(core.day(date), core.workoutSummary(date, tzOffsetMin(date))) }) { data = it }
    }
    val st = state.settings
    val i = state.i18n
    val loaded = data
    val sets = remember(loaded, state.exById) {
        loaded?.day?.sets.orEmpty().filter { it.planned != true && it.exerciseId in state.exById }.sortedBy { it.order }
    }
    val groups = remember(sets) {
        sets.map { it.exerciseId }.distinct().map { id -> state.exById.getValue(id) to sets.filter { it.exerciseId == id } }
    }
    val title = longDateTitle(date, i.lang)

    val stats: List<Pair<String, String>> = loaded?.summary?.let { d ->
        listOfNotNull(
            d.duration?.let { state.t("duration") to fmtDuration(it) },
            state.t("statSets") to d.sets.toString(),
            if (d.volume > 0) state.t("statVolume") to i.weight(d.volume, st) else null,
            if (d.effective > 0) state.t("statEffective") to num(d.effective, 0) else null,
            if (d.records > 0u) state.t("records") to d.records.toString() else null,
        )
    }.orEmpty()
    val goals = loaded?.summary?.goalsMet.orEmpty().map { "${state.t(muscleKey(it.muscle))} ${num(it.n, 0)}" }
    /** "Bench press — 3 sets · 100 kg × 8" per exercise. */
    val lines = groups.map { (ex, ss) ->
        val best = ss.filter { it.weight != null }.sortedWith(compareByDescending<WorkoutSet> { it.weight }.thenByDescending { it.reps ?: 0.0 }).firstOrNull()
        "${i.shown("exercises", ex.name)} — ${state.tn("oneSet", "nSets", ss.size)}" +
            if (best != null && best.weight!! > 0) " · ${i.weight(best.weight!!, st)} × ${best.reps?.let { num(it) } ?: "–"}" else ""
    }

    fun shareText() {
        val head = listOf(stats.joinToString(" · ") { "${it.first}: ${it.second}" }, if (goals.isNotEmpty()) "${state.t("goalsMet")}: ${goals.joinToString(", ")}" else "").filter { it.isNotEmpty() }
        val body = workoutText(state, title, groups, loaded?.day?.comment.orEmpty()).lines().toMutableList()
        body.addAll(1, head)
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body.joinToString("\n") + "\n\n— Iron Notes")
        context.startActivity(Intent.createChooser(send, state.t("shareText")))
    }

    fun shareImage() {
        val goalLine = if (goals.isNotEmpty()) "${state.t("goalsMet")}: ${goals.joinToString(", ")}" else ""
        state.scope.launch {
            try {
                // Drawing a 1080×1350 card and compressing it takes a moment on old phones: off the main thread.
                val uri = withContext(Dispatchers.IO) {
                    val dir = File(context.cacheDir, "share").apply { mkdirs() }
                    dir.listFiles()?.forEach { it.delete() } // only the latest shared card is kept
                    val file = File(dir, "iron-notes-$date.png")
                    val bmp = drawCard(colors, title, stats, goalLine, lines)
                    file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    bmp.recycle()
                    FileProvider.getUriForFile(context, context.packageName + ".share", file)
                }
                val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                context.startActivity(Intent.createChooser(send, state.t("shareImage")).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (e: Exception) {
                state.showToast(state.t("shareFailed"))
            }
        }
    }

    Sheet(state.t("summary"), { state.back() }, state.t("back")) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 120.dp),
        ) {
            Txt(title, Modifier.padding(bottom = 12.dp), muted = true, small = true)
            when {
                loaded == null -> Txt(state.t("loading"), Modifier.fillMaxWidth(), muted = true)
                sets.isEmpty() -> Txt(state.t("emptyDay"), Modifier.fillMaxWidth(), muted = true)
                else -> {
                    for (pair in stats.chunked(2)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            for ((k, v) in pair) Card(Modifier.weight(1f)) {
                                Txt(v, bold = true, size = 24.sp)
                                Txt(k, muted = true, small = true)
                            }
                            if (pair.size == 1) Box(Modifier.weight(1f))
                        }
                    }
                    if (goals.isNotEmpty()) {
                        Card {
                            Heading(state.t("goalsMet"), Modifier.padding(bottom = 8.dp))
                            Chips { goals.forEach { Pill(it) } }
                        }
                    }
                    Card {
                        Heading(state.t("exercises"), Modifier.padding(bottom = 8.dp))
                        lines.forEach { Txt(it, Modifier.padding(vertical = 3.dp)) }
                        val cats = groups.map { it.first.categoryId }.distinct().mapNotNull { state.catById[it]?.let { c -> i.shown("categories", c.name) } }
                        if (cats.isNotEmpty()) Txt(cats.joinToString(" · "), Modifier.padding(top = 6.dp), muted = true, small = true)
                    }
                    Actions {
                        Btn(state.t("shareText"), { shareText() })
                        Btn(state.t("shareImage"), { shareImage() }, kind = BtnKind.PRIMARY)
                    }
                }
            }
        }
    }
}

@Composable
private fun Pill(text: String) {
    val p = LocalPalette.current
    Box(Modifier.clip(CircleShape).background(p.card, CircleShape).border(1.dp, p.accent, CircleShape).padding(horizontal = 12.dp, vertical = 6.dp)) {
        Txt(text, size = 15.sp, color = p.accent)
    }
}

private fun longDateTitle(d: String, lang: String): String =
    SimpleDateFormat("EEEE d MMMM yyyy", if (lang == "sv") Locale("sv", "SE") else Locale.getDefault()).format(parseIso(d).time)

/** The colours the card is drawn with (the theme's, as the web reads its CSS variables). */
private class CardColors(val bg: Int, val text: Int, val muted: Int, val accent: Int)

/** The summary card as a PNG bitmap (1080 × 1350, a common share size), drawn with Android's Canvas. */
private fun drawCard(c: CardColors, title: String, stats: List<Pair<String, String>>, goals: String, lines: List<String>): Bitmap {
    val w = 1080
    val h = 1350
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    canvas.drawColor(c.bg)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    fun font(px: Float, bold: Boolean = false, color: Int) {
        paint.textSize = px
        paint.color = color
        paint.typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
    }
    font(40f, true, c.accent)
    canvas.drawText("Iron Notes", 72f, 110f, paint)
    font(34f, false, c.muted)
    canvas.drawText(title, 72f, 165f, paint)
    // Stats in two columns.
    stats.forEachIndexed { i, (k, v) ->
        val x = 72f + (i % 2) * 480f
        val y = 280f + (i / 2) * 150f
        font(72f, true, c.text)
        canvas.drawText(v, x, y, paint)
        font(30f, false, c.muted)
        canvas.drawText(k, x, y + 46f, paint)
    }
    var y = 280f + ((stats.size + 1) / 2) * 150f + 20f
    val maxW = w - 144f
    fun wrap(s: String, px: Float, color: Int, bold: Boolean = false) {
        font(px, bold, color)
        fun fit(word: String): String {
            if (paint.measureText(word) <= maxW) return word
            var cut = word
            while (cut.length > 1 && paint.measureText("$cut…") > maxW) cut = cut.dropLast(1)
            return "$cut…"
        }
        var line = ""
        for (word in s.split(' ').map(::fit)) {
            val next = if (line.isNotEmpty()) "$line $word" else word
            if (paint.measureText(next) > maxW && line.isNotEmpty()) {
                canvas.drawText(line, 72f, y, paint)
                y += px * 1.35f
                line = word
            } else line = next
        }
        if (line.isNotEmpty()) {
            canvas.drawText(line, 72f, y, paint)
            y += px * 1.35f
        }
    }
    if (goals.isNotEmpty()) {
        wrap(goals, 34f, c.accent, true)
        y += 20f
    }
    for (l in lines.take(9)) {
        if (y > h - 80) break
        wrap(l, 32f, c.text)
    }
    if (lines.size > 9) wrap("+ ${lines.size - 9}", 30f, c.muted)
    return bmp
}
