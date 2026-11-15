package io.github.quoterg.ironnotes.next

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoBackupTest {
    private val min = 60_000L

    @Test fun dueOnlyWithAFolderAndAfterTheGap() {
        val now = 1_800_000_000_000L
        assertFalse(AutoBackup.due(false, 0, now))
        assertTrue(AutoBackup.due(true, 0, now)) // never backed up
        assertFalse(AutoBackup.due(true, now - 10 * min, now))
        assertTrue(AutoBackup.due(true, now - 31 * min, now))
        assertTrue(AutoBackup.due(true, now + 60 * min, now)) // the clock went back: write again
    }

    @Test fun folderLabels() {
        val ext = "com.android.externalstorage.documents"
        assertEquals("Phone storage", AutoBackup.folderLabel(ext, "primary:", "0", "Phone storage"))
        assertEquals("Phone storage/Download/Iron", AutoBackup.folderLabel(ext, "primary:Download/Iron", "Iron", "Phone storage"))
        assertEquals("Backups", AutoBackup.folderLabel("com.google.android.apps.docs.storage", "acc=1;doc=xyz", "Backups", "Phone storage"))
    }

    @Test fun keepsTheNewestSevenOfOurFilesOnly() {
        val ours = (1..9).map { "iron-notes-auto-2026-11-0$it.json" }
        val names = ours + listOf("iron-notes-2026-11-01.json", "iron-notes-before-restore-2026-11-01.json", "notes.txt")
        assertEquals(listOf("iron-notes-auto-2026-11-02.json", "iron-notes-auto-2026-11-01.json"), AutoBackup.toPrune(names))
        assertEquals(emptyList<String>(), AutoBackup.toPrune(ours.take(7)))
        // Leftovers of ours (a cut-off temporary file, a provider's duplicate) go too.
        assertEquals(
            listOf("iron-notes-auto-2026-11-09.json.tmp", "iron-notes-auto-2026-11-09 (1).json"),
            AutoBackup.toPrune(ours.takeLast(3) + listOf("iron-notes-auto-2026-11-09.json.tmp", "iron-notes-auto-2026-11-09 (1).json")),
        )
    }

    @Test fun theDayFileIsNamedByTheLocalDate() {
        val lateEvening = 1_794_870_000_000L // 2026-11-16 23:00 UTC: already the 17th in Stockholm
        assertEquals("iron-notes-auto-2026-11-16.json", AutoBackup.dayFileName(lateEvening, java.util.TimeZone.getTimeZone("UTC")))
        assertEquals("iron-notes-auto-2026-11-17.json", AutoBackup.dayFileName(lateEvening, java.util.TimeZone.getTimeZone("Europe/Stockholm")))
    }

    @Test fun twoRestoresKeepTheOriginalAsPrev() {
        val dir = java.nio.file.Files.createTempDirectory("safety").toFile()
        fun tmp(text: String) = java.io.File(dir, "before-restore.json.tmp").apply { writeText(text) }
        AutoBackup.rotateSafety(dir, tmp("original"))
        AutoBackup.rotateSafety(dir, tmp("after A"))
        assertEquals("after A", java.io.File(dir, "before-restore.json").readText())
        assertEquals("original", java.io.File(dir, "before-restore.json.prev").readText())
        // A refused restore: the temporary copy goes, nothing else changes.
        val refused = tmp("half")
        AutoBackup.discardSafety(refused)
        assertFalse(refused.exists())
        assertEquals("after A", java.io.File(dir, "before-restore.json").readText())
        dir.deleteRecursively()
    }
}
