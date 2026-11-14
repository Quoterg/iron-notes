package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertEquals
import org.junit.Test

class StatsRangeTest {
    @Test fun fromNeverPassesTo() {
        assertEquals("2026-11-01", pickFrom("2026-11-01", "2026-11-10"))
        assertEquals("2026-11-10", pickFrom("2026-11-12", "2026-11-10"))
    }

    @Test fun toIsClampedBetweenFromAndToday() {
        assertEquals("2026-11-05", pickTo("2026-11-05", "2026-11-01", "2026-11-14"))
        assertEquals("2026-11-14", pickTo("2026-12-01", "2026-11-01", "2026-11-14"))
        assertEquals("2026-11-01", pickTo("2026-10-01", "2026-11-01", "2026-11-14"))
    }
}
