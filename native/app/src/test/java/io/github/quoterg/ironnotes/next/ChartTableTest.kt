package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertEquals
import org.junit.Test

class ChartTableTest {
    @Test
    fun rowsAreNewestFirstAndFormatted() {
        val rows = chartTableRows(listOf("2026-11-01", "2026-11-05"), listOf(80.0, 81.5)) { "%.1f".format(it) }
        assertEquals(listOf("2026-11-05" to "81.5", "2026-11-01" to "80.0"), rows)
    }
}
