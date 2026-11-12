package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertEquals
import org.junit.Test

class DatesTest {
    @Test
    fun epochDays() {
        assertEquals(0L, epochDay("1970-01-01"))
        assertEquals(-1L, epochDay("1969-12-31"))
        assertEquals(19_723L, epochDay("2024-01-01"))
        assertEquals(60L, daysBetween("2024-01-01", "2024-03-01")) // leap February
        assertEquals(-7L, daysBetween("2026-11-12", "2026-11-05"))
    }

    @Test
    fun weekdaysLikeJsGetDay() {
        assertEquals(4, weekdayOf("1970-01-01")) // Thursday
        assertEquals(0, weekdayOf("2023-01-01")) // Sunday
        assertEquals(4, weekdayOf("2026-11-12")) // Thursday
        assertEquals(3, weekdayOf("1969-12-31")) // Wednesday, before the epoch
    }
}
