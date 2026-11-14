package io.github.quoterg.ironnotes.next

import io.github.quoterg.ironnotes.core.LightSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Date

class SettingsTest {
    @Test
    fun cycleWeeks() {
        assertEquals(0, cycleWeek("2026-11-10", "2026-11-09"))
        assertEquals(1, cycleWeek("2026-11-10", "2026-11-10"))
        assertEquals(1, cycleWeek("2026-11-10", "2026-11-16"))
        assertEquals(2, cycleWeek("2026-11-10", "2026-11-17"))
    }

    @Test
    fun lightWeek() {
        val l = LightSettings("2026-11-10")
        assertTrue(inLight(l, "2026-11-10"))
        assertTrue(inLight(l, "2026-11-16"))
        assertFalse(inLight(l, "2026-11-17"))
        assertFalse(inLight(null, "2026-11-10"))
        assertEquals("2026-11-16", lightEnd(l))
    }

    @Test
    fun backupNames() {
        assertEquals("2026-11-14T09:05:03.007Z", backupStamp(Date(1_794_647_103_007L)))
        assertEquals("iron-notes-2026-11-14.json", backupFileName("2026-11-14T09:05:03.007Z"))
    }

    @Test
    fun plateInput() {
        assertEquals(1.25, parsePlate("1,25")!!, 0.0)
        assertEquals(20.0, parsePlate(" 20 ")!!, 0.0)
        assertNull(parsePlate(""))
        assertNull(parsePlate("abc"))
    }
}
