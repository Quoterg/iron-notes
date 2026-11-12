package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// The web app's components (src/styles.css) in Compose foundation — no Material.

/** Text in the palette: body by default; `muted`, `small`, `bold`, `size`. */
@Composable
fun Txt(
    text: String,
    modifier: Modifier = Modifier,
    muted: Boolean = false,
    small: Boolean = false,
    bold: Boolean = false,
    size: TextUnit = if (small) 13.sp else 16.sp,
    color: Color? = null,
    align: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
) {
    val p = LocalPalette.current
    BasicText(
        text,
        modifier,
        style = TextStyle(
            color = color ?: if (muted) p.muted else p.text,
            fontSize = size,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
            lineHeight = size * 1.35f,
            textAlign = align ?: TextAlign.Unspecified,
        ),
        maxLines = maxLines,
    )
}

/** A section title (h2). */
@Composable
fun Heading(text: String, modifier: Modifier = Modifier) {
    Txt(text, modifier.semantics { heading() }, bold = true, size = 17.sp)
}

/** `.card`: glass panel, 18 dp radius. */
@Composable
fun Card(modifier: Modifier = Modifier, padding: Dp = 16.dp, borderColor: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp)
            .clip(shape)
            .background(p.card, shape)
            .border(1.dp, borderColor ?: p.cardBorder, shape)
            .padding(padding),
        content = content,
    )
}

enum class BtnKind { NORMAL, PRIMARY, DANGER }

/** `.btn`: 44 dp tall (36 small), 14 dp radius; primary = filled. */
@Composable
fun Btn(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.NORMAL,
    small: Boolean = false,
    enabled: Boolean = true,
    label: String? = null,
) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(14.dp)
    val (bg, fg, border) = when (kind) {
        BtnKind.PRIMARY -> Triple(p.primary, p.primaryText, p.primary)
        BtnKind.DANGER -> Triple(p.card, p.over, p.cardBorder)
        BtnKind.NORMAL -> Triple(p.card, p.text, p.cardBorder)
    }
    Box(
        modifier
            .heightIn(min = if (small) 36.dp else 44.dp)
            .alpha(if (enabled) 1f else 0.5f)
            .clip(shape)
            .background(bg, shape)
            .border(1.dp, border, shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .then(if (label != null) Modifier.semantics { contentDescription = label } else Modifier)
            .padding(horizontal = if (small) 10.dp else 14.dp, vertical = if (small) 6.dp else 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Txt(text, size = if (small) 14.sp else 16.sp, bold = kind == BtnKind.PRIMARY, color = fg, align = TextAlign.Center)
    }
}

/** `.btn.icon`: a square button with a symbol (‹ › + − ↑ ↓) and a spoken label. */
@Composable
fun IconBtn(symbol: String, label: String, onClick: () -> Unit, modifier: Modifier = Modifier, small: Boolean = false, enabled: Boolean = true) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(14.dp)
    val side = if (small) 40.dp else 44.dp
    Box(
        modifier
            .size(side)
            .alpha(if (enabled) 1f else 0.5f)
            .clip(shape)
            .background(p.card, shape)
            .border(1.dp, p.cardBorder, shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Txt(symbol, size = if (small) 18.sp else 24.sp)
    }
}

/** `.link`: accent text button. */
@Composable
fun LinkBtn(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    Box(modifier.heightIn(min = 36.dp).clickable(role = Role.Button, onClick = onClick).padding(top = 8.dp), contentAlignment = Alignment.Center) {
        Txt(text, size = 15.sp, color = p.accent)
    }
}

/** `.chip`: a pill toggle (categories, filters). */
@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    Box(
        modifier
            .heightIn(min = 36.dp)
            .clip(CircleShape)
            .background(if (selected) p.active else p.card, CircleShape)
            .border(1.dp, p.cardBorder, CircleShape)
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Txt(text, size = 15.sp, color = if (selected) p.activeText else p.text, bold = selected)
    }
}

/** `.actions`: a wrapping row of buttons with 8 dp gaps. */
@Composable
fun Actions(modifier: Modifier = Modifier, center: Boolean = false, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, if (center) Alignment.CenterHorizontally else Alignment.Start),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** An input (`input[type=text|number]`): 44 dp, inner background, 12 dp radius. */
@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    number: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(12.dp)
    BasicTextField(
        value,
        onChange,
        modifier
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(p.inner, shape)
            .border(1.dp, p.line, shape)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .semantics { contentDescription = label },
        textStyle = TextStyle(color = p.text, fontSize = 17.sp),
        cursorBrush = SolidColor(p.accent),
        singleLine = singleLine,
        minLines = minLines,
        keyboardOptions = if (number) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default,
    )
}

/** `.dot`: a category's colour. */
@Composable
fun Dot(color: String?, modifier: Modifier = Modifier) {
    Box(modifier.size(10.dp).clip(CircleShape).background(parseColor(color) ?: Color(0xFF888888)))
}

fun parseColor(hex: String?): Color? =
    hex?.takeIf { it.length == 7 && it[0] == '#' }?.substring(1)?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }

private val trophyPath = PathParser().parsePathString(
    "M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z",
).toNodes()

private val trophyIcon = ImageVector.Builder("trophy", 24.dp, 24.dp, 24f, 24f)
    .addPath(trophyPath, fill = SolidColor(Color.Black))
    .build()

/** The personal-record mark (icons.tsx `Trophy`). */
@Composable
fun Trophy(label: String, modifier: Modifier = Modifier) {
    Image(trophyIcon, label, modifier.size(18.dp), colorFilter = ColorFilter.tint(LocalPalette.current.gold))
}

/**
 * `.sheet`: a full-screen layer over the tabs with a back button and title (the web's stacked screens).
 * Back (the button, the system back gesture) pops it — handled by the app shell.
 */
@Composable
fun Sheet(title: String, onBack: () -> Unit, backLabel: String, actions: @Composable RowScope.() -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().background(p.bg)) {
        Row(
            Modifier.fillMaxWidth().background(p.bg).statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            IconBtn("‹", backLabel, onBack)
            Txt(title, Modifier.weight(1f).semantics { heading() }, bold = true, size = 19.sp, maxLines = 2)
            actions()
        }
        Box(Modifier.fillMaxWidth().background(p.line).size(height = 1.dp, width = 0.dp))
        Column(Modifier.fillMaxSize().widthIn(max = 640.dp), content = content)
    }
}
