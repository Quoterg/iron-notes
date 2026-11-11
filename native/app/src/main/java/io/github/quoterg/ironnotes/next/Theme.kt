package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Iron Log's two looks, from src/styles.css: Daylight (day) and Hologram (night). Names = the CSS tokens. */
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
    /** Primary buttons and the toast. */
    val primary: Color,
    val primaryText: Color,
    /** The selected tab. */
    val active: Color,
    val activeText: Color,
    /** The top bar and the tab bar. */
    val bar: Color,
    val nav: Color,
    /** Inputs. */
    val inner: Color,
    /** Danger / over target. */
    val over: Color,
    /** Record trophies. */
    val gold: Color,
    /** The two glows of the background (Hologram's mint and violet). */
    val glowA: Color,
    val glowB: Color,
    val dark: Boolean,
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
    primary = Color(0xFF18202E),
    primaryText = Color(0xFFFFFFFF),
    active = Color(0xFF18202E),
    activeText = Color(0xFFFFFFFF),
    bar = Color(0xEBEEF1F8),
    nav = Color(0xF5FFFFFF),
    inner = Color(0xB3FFFFFF),
    over = Color(0xFFC0392B),
    gold = Color(0xFFA86F00),
    glowA = Color(0x4D2BE6BE),
    glowB = Color(0x3D966EFF),
    dark = false,
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
    primary = Color(0xFF2BFFCF),
    primaryText = Color(0xFF04121A),
    active = Color(0x242BFFCF),
    activeText = Color(0xFF7AF7E1),
    bar = Color(0xEB050912),
    nav = Color(0xF70D1320),
    inner = Color(0x0AFFFFFF),
    over = Color(0xFFFF6B8A),
    gold = Color(0xFFFFD166),
    glowA = Color(0x292BFFCF),
    glowB = Color(0x338C5AFF),
    dark = true,
)

val LocalPalette = staticCompositionLocalOf { Hologram }

/** Theme setting: null = Auto (follows the system), true = Night, false = Day. */
@Composable
fun IronTheme(night: Boolean? = null, content: @Composable () -> Unit) {
    val dark = night ?: isSystemInDarkTheme()
    CompositionLocalProvider(LocalPalette provides if (dark) Hologram else Daylight, content = content)
}
