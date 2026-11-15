package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertEquals
import org.junit.Test

/** Starter names in Swedish: categories and measures are translated (lower-case keys), exercises stay English. */
class ShownNameTest {
    private val i18n = I18n(
        en = mapOf("oneSet" to "1 set", "nSets" to "{n} sets"),
        sv = mapOf("oneSet" to "1 set", "nSets" to "{n} set"),
        enTypes = emptyMap(), svTypes = emptyMap(),
        svNames = mapOf(
            "exercises" to mapOf("overhead press" to "Militärpress"),
            "categories" to mapOf("chest" to "Bröst"),
            "metrics" to mapOf("body weight" to "Kroppsvikt"),
        ),
    )

    @Test fun swedishCategoriesAndMeasuresEnglishExercises() {
        i18n.lang = "sv"
        assertEquals("Bröst", i18n.shown("categories", "Chest"))
        assertEquals("Kroppsvikt", i18n.shown("metrics", "Body weight"))
        assertEquals("Overhead Press", i18n.shown("exercises", "Overhead Press"))
        assertEquals("My own", i18n.shown("categories", "My own"))
        i18n.lang = "en"
        assertEquals("Chest", i18n.shown("categories", "Chest"))
    }

    @Test fun countsUseTheSingularForOne() {
        i18n.lang = "en"
        assertEquals("1 set", i18n.tn("oneSet", "nSets", 1))
        assertEquals("2 sets", i18n.tn("oneSet", "nSets", 2))
        i18n.lang = "sv"
        assertEquals("2 set", i18n.tn("oneSet", "nSets", 2))
    }
}
