package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Iron Log's two looks, from src/styles.css: Daylight (day) and Hologram (night). */
@Immutable
data class Palette(
    val bg: Color,
    val card: Color,
    val cardBorder: Color,
    val text: Color,
    val muted: Color,
    val line: Color,
    val accent: Color,
    val accentText: Color,
)

val Daylight = Palette(
    bg = Color(0xFFEEF1F8),
    card = Color(0x9EFFFFFF),
    cardBorder = Color(0xF2FFFFFF),
    text = Color(0xFF18202E),
    muted = Color(0xFF4F596B),
    line = Color(0x1A18202E),
    accent = Color(0xFF0B6E63),
    accentText = Color(0xFFFFFFFF),
)

val Hologram = Palette(
    bg = Color(0xFF050912),
    card = Color(0x0DFFFFFF),
    cardBorder = Color(0x387AF7E1),
    text = Color(0xFFE6FFFA),
    muted = Color(0xFF93BAB3),
    line = Color(0x17FFFFFF),
    accent = Color(0xFF7AF7E1),
    accentText = Color(0xFF04121A),
)

val LocalPalette = staticCompositionLocalOf { Hologram }

/** Auto theme for now (follows the system); Day/Night settings come with N8. */
@Composable
fun IronTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalPalette provides if (isSystemInDarkTheme()) Hologram else Daylight, content = content)
}
