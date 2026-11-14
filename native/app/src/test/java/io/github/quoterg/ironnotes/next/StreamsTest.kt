package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream

class StreamsTest {
    @Test fun readsSmallText() {
        assertEquals("{\"å\":1}", readTextCapped(ByteArrayInputStream("{\"å\":1}".toByteArray()), 100))
    }

    @Test fun exactlyAtTheCapIsRead() {
        assertEquals("x".repeat(100), readTextCapped(ByteArrayInputStream(ByteArray(100) { 'x'.code.toByte() }), 100))
    }

    @Test fun overTheCapIsNullWithoutReadingItAll() {
        // An endless stream: must stop shortly after the cap instead of running out of memory.
        var served = 0L
        val endless = object : InputStream() {
            override fun read(): Int { served++; return 'x'.code }
            override fun read(b: ByteArray, off: Int, len: Int): Int { b.fill('x'.code.toByte(), off, off + len); served += len; return len }
        }
        assertNull(readTextCapped(endless, 1_000_000))
        assert(served < 1_000_000 + 128 * 1024) { "read $served bytes" }
    }
}
