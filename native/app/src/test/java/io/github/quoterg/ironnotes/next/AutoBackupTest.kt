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
    }
}
