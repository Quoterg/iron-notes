package io.github.quoterg.ironnotes.next

import java.io.ByteArrayOutputStream
import java.io.InputStream

/** Real backups are a few MB; anything this big is not one (and would run a low-end phone out of memory). */
const val MAX_BACKUP_BYTES = 64 * 1024 * 1024

/** Reads [input] as UTF-8 text, or null as soon as it passes [max] bytes (without holding more than that). */
fun readTextCapped(input: InputStream, max: Int = MAX_BACKUP_BYTES): String? {
    val out = ByteArrayOutputStream()
    val buf = ByteArray(64 * 1024)
    var total = 0L
    while (true) {
        val n = input.read(buf)
        if (n < 0) break
        total += n
        if (total > max) return null
        out.write(buf, 0, n)
    }
    return out.toString(Charsets.UTF_8.name())
}
