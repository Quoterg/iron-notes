package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LatestTest {
    @Test
    fun onlyTheNewestRequestIsLatest() {
        val l = Latest()
        val a = l.next()
        assertTrue(l.isLatest(a))
        val b = l.next()
        assertFalse(l.isLatest(a))
        assertTrue(l.isLatest(b))
    }

    @Test
    fun idsAreDistinct() {
        val l = Latest()
        assertTrue(l.next() != l.next())
    }
}
