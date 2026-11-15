package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The first-run card: today's empty log, until closed or anything was ever logged (both set `seen`). */
class FirstRunTest {
    @Test fun onlyOnTodaysEmptyLogUntilSeen() {
        assertTrue(showSetup(seen = false, isToday = true, dayEmpty = true))
        assertFalse(showSetup(seen = true, isToday = true, dayEmpty = true)) // closed, or history exists
        assertFalse(showSetup(seen = false, isToday = false, dayEmpty = true)) // another day
        assertFalse(showSetup(seen = false, isToday = true, dayEmpty = false))
    }
}
