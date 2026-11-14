package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.MuscleId
import io.github.quoterg.ironnotes.core.MuscleWeekState

/** An ellipse (centre, radii) or a rounded rectangle (corner, size) of the 200 x 190 figure box. */
private class Shape(val ellipse: Boolean, val a: Float, val b: Float, val c: Float, val d: Float)

private fun e(cx: Float, cy: Float, rx: Float, ry: Float) = Shape(true, cx, cy, rx, ry)
private fun r(x: Float, y: Float, w: Float, h: Float) = Shape(false, x, y, w, h)

// BodyMap.tsx REGIONS: two figures side by side (front at x 0-95, back at x 105-200).
private val REGIONS: List<Pair<MuscleId, List<Shape>>> = listOf(
    MuscleId.FRONT_DELTS to listOf(e(28f, 37f, 6f, 5f), e(67f, 37f, 6f, 5f)),
    MuscleId.SIDE_DELTS to listOf(e(21f, 40f, 3f, 6f), e(74f, 40f, 3f, 6f), e(126f, 40f, 3f, 6f), e(179f, 40f, 3f, 6f)),
    MuscleId.CHEST to listOf(e(40f, 46f, 8f, 6f), e(55f, 46f, 8f, 6f)),
    MuscleId.BICEPS to listOf(e(22f, 57f, 4f, 9f), e(73f, 57f, 4f, 9f)),
    MuscleId.FOREARMS to listOf(e(20f, 80f, 3.5f, 10f), e(75f, 80f, 3.5f, 10f), e(125f, 80f, 3.5f, 10f), e(180f, 80f, 3.5f, 10f)),
    MuscleId.ABS to listOf(r(41f, 55f, 13f, 30f)),
    MuscleId.QUADS to listOf(e(40f, 118f, 7f, 19f), e(55f, 118f, 7f, 19f)),
    MuscleId.CALVES to listOf(e(40f, 160f, 4.5f, 12f), e(55f, 160f, 4.5f, 12f), e(145f, 160f, 5f, 13f), e(160f, 160f, 5f, 13f)),
    MuscleId.TRAPS to listOf(e(152.5f, 34f, 13f, 5f)),
    MuscleId.REAR_DELTS to listOf(e(133f, 38f, 6f, 5f), e(172f, 38f, 6f, 5f)),
    MuscleId.LATS to listOf(e(143f, 56f, 7f, 12f), e(162f, 56f, 7f, 12f)),
    MuscleId.LOWER_BACK to listOf(r(146f, 69f, 13f, 15f)),
    MuscleId.TRICEPS to listOf(e(127f, 57f, 4f, 9f), e(178f, 57f, 4f, 9f)),
    MuscleId.GLUTES to listOf(e(145f, 95f, 8f, 8f), e(160f, 95f, 8f, 8f)),
    MuscleId.HAMSTRINGS to listOf(e(145f, 120f, 7f, 16f), e(160f, 120f, 7f, 16f)),
)

/** The invisible tap margin around a shape (the web's 7 px transparent stroke). */
private const val HIT = 3.5f

/** The muscle under a point of the figure box, if any (the closest centre when shapes overlap). */
private fun hit(x: Float, y: Float): MuscleId? {
    var best: MuscleId? = null
    var bestScore = Float.MAX_VALUE
    for ((m, shapes) in REGIONS) for (s in shapes) {
        val score = if (s.ellipse) {
            val dx = (x - s.a) / (s.c + HIT)
            val dy = (y - s.b) / (s.d + HIT)
            dx * dx + dy * dy
        } else {
            if (x in (s.a - HIT)..(s.a + s.c + HIT) && y in (s.b - HIT)..(s.b + s.d + HIT)) 0.5f else Float.MAX_VALUE
        }
        if (score <= 1f && score < bestScore) { best = m; bestScore = score }
    }
    return best
}

/** The figure's outline (head, torso, arms, legs) for one side at x offset `dx`. */
private fun DrawScope.outline(k: Float, dx: Float, color: androidx.compose.ui.graphics.Color) {
    fun rr(x: Float, y: Float, w: Float, h: Float, rad: Float) =
        drawRoundRect(color, Offset((x + dx) * k, y * k), Size(w * k, h * k), CornerRadius(rad * k))
    drawCircle(color, 10f * k, Offset((47.5f + dx) * k, 16f * k))
    rr(44f, 25f, 7f, 6f, 0f)
    rr(27f, 31f, 41f, 58f, 10f)
    rr(15f, 34f, 12f, 58f, 6f)
    rr(68f, 34f, 12f, 58f, 6f)
    rr(31f, 87f, 16f, 90f, 7f)
    rr(48f, 87f, 16f, 90f, 7f)
}

/**
 * A front and back figure (BodyMap.tsx): hand-drawn shapes, each muscle coloured by its week's state;
 * tapping a muscle selects it. `label(m)` is the accessibility text (and the screen-reader action).
 */
@Composable
fun BodyMap(
    state: AppState,
    stateOf: (MuscleId) -> MuscleWeekState,
    label: (MuscleId) -> String,
    selected: MuscleId?,
    onSelect: (MuscleId) -> Unit,
) {
    val p = LocalPalette.current
    Canvas(
        Modifier
            .widthIn(max = 420.dp)
            .fillMaxWidth()
            .aspectRatio(200f / 190f)
            .semantics {
                contentDescription = state.t("muscles")
                customActions = REGIONS.map { (m, _) -> CustomAccessibilityAction(label(m)) { onSelect(m); true } }
            }
            .pointerInput(Unit) {
                detectTapGestures { pos ->
                    val k = size.width / 200f
                    hit(pos.x / k, pos.y / k)?.let(onSelect)
                }
            },
    ) {
        val k = size.width / 200f
        val base = p.muted.copy(alpha = 0.14f)
        outline(k, 0f, base)
        outline(k, 105f, base)
        for ((m, shapes) in REGIONS) {
            val fill = when (stateOf(m)) {
                MuscleWeekState.NOTHING -> p.muted.copy(alpha = 0.3f)
                MuscleWeekState.UNDER -> p.muted.copy(alpha = 0.75f)
                MuscleWeekState.IN, MuscleWeekState.TRAINED -> p.accent
                MuscleWeekState.OVER -> p.over
            }
            for (s in shapes) {
                if (s.ellipse) {
                    val tl = Offset((s.a - s.c) * k, (s.b - s.d) * k)
                    val sz = Size(2 * s.c * k, 2 * s.d * k)
                    drawOval(fill, tl, sz)
                    if (m == selected) drawOval(p.text, tl, sz, style = Stroke(1.5f * k))
                } else {
                    val tl = Offset(s.a * k, s.b * k)
                    val sz = Size(s.c * k, s.d * k)
                    drawRoundRect(fill, tl, sz, CornerRadius(3f * k))
                    if (m == selected) drawRoundRect(p.text, tl, sz, CornerRadius(3f * k), Stroke(1.5f * k))
                }
            }
        }
    }
    Row(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Txt(state.t("figureFront"), Modifier.weight(95f), muted = true, size = 12.sp, align = TextAlign.Center)
        Txt(state.t("figureBack"), Modifier.weight(105f), muted = true, size = 12.sp, align = TextAlign.Center)
    }
}

