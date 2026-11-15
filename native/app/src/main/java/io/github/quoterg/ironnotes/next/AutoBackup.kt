package io.github.quoterg.ironnotes.next

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import java.io.File

/**
 * Automatic backups (Q5) to a folder the user picks with the system folder picker (Storage Access Framework:
 * a persisted grant, no storage permission). The data only changes while the app is used, so a backup is
 * written when the app goes to the background, at most every [MIN_GAP_MS]: one file per day
 * (`iron-notes-auto-<date>.json`, rewritten during that day), the newest [KEEP] kept.
 *
 * Also the restore safety copy: the data as it was before a restore, in the app's own storage (and in the
 * folder, if one is chosen), so "Undo the last restore" can put it back.
 */
@SuppressLint("UseKtx") // no core-ktx dependency
object AutoBackup {
    private const val PREFS = "auto-backup"
    private const val FOLDER = "folder"
    private const val LAST_AT = "lastAt"
    private const val SAFETY_AT = "safetyAt"
    private const val FAILED_AT = "failedAt"
    const val PREFIX = "iron-notes-auto-"
    const val KEEP = 7
    private const val MIN_GAP_MS = 30 * 60 * 1000L
    private const val SAFETY_FILE = "before-restore.json"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun folder(ctx: Context): Uri? = prefs(ctx).getString(FOLDER, null)?.let(Uri::parse)

    /** When the last backup (automatic or exported) was written, ms; 0 = never. */
    fun lastAt(ctx: Context): Long = prefs(ctx).getLong(LAST_AT, 0L)

    fun markBackedUp(ctx: Context, at: Long = System.currentTimeMillis()) {
        prefs(ctx).edit().putLong(LAST_AT, at).apply()
    }

    /** Keeps the folder the user picked (and its read/write grant across restarts). */
    fun setFolder(ctx: Context, tree: Uri) {
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        ctx.contentResolver.takePersistableUriPermission(tree, flags)
        prefs(ctx).edit().putString(FOLDER, tree.toString()).apply()
    }

    fun clearFolder(ctx: Context) {
        val tree = folder(ctx)
        if (tree != null) runCatching {
            ctx.contentResolver.releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        prefs(ctx).edit().remove(FOLDER).apply()
    }

    /**
     * How the folder is shown: on the phone's own storage its path ("Phone storage/Download" — the provider's
     * display name there is the volume's, e.g. "0"), elsewhere (Drive, …) the name the picker shows.
     */
    fun folderLabel(authority: String?, docId: String, displayName: String?, phoneStorage: String): String {
        if (authority == "com.android.externalstorage.documents" && docId.contains(':')) {
            val path = docId.substringAfter(':').trim('/')
            return if (path.isEmpty()) phoneStorage else "$phoneStorage/$path"
        }
        return displayName ?: docId
    }

    fun folderName(ctx: Context, tree: Uri, phoneStorage: String): String =
        folderLabel(tree.authority, DocumentsContract.getTreeDocumentId(tree), displayName(ctx, tree), phoneStorage)

    /** The folder's name as the file picker shows it. */
    private fun displayName(ctx: Context, tree: Uri): String? = runCatching {
        val doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        ctx.contentResolver.query(doc, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull()

    /** Whether an automatic backup is due (a folder is set and the last one is old enough). Pure, for tests. */
    fun due(hasFolder: Boolean, lastAt: Long, now: Long): Boolean = hasFolder && (lastAt == 0L || now - lastAt >= MIN_GAP_MS || now < lastAt)

    /**
     * The automatic backups to delete: ours beyond the newest [keep] (the date sorts them), and any leftover of
     * ours that isn't a finished backup (a `.tmp`, a provider's `name (1).json`). Pure.
     */
    fun toPrune(names: List<String>, keep: Int = KEEP): List<String> {
        val ours = names.filter { it.startsWith(PREFIX) }
        val good = ours.filter { Regex("""${PREFIX}\d{4}-\d{2}-\d{2}\.json""").matches(it) }
        return good.sortedDescending().drop(keep) + (ours - good.toSet())
    }

    /** The day file's name, by the phone's local date (the stamp inside stays UTC, as exports). Pure. */
    fun dayFileName(now: Long, zone: java.util.TimeZone = java.util.TimeZone.getDefault()): String =
        PREFIX + java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT).apply { timeZone = zone }.format(java.util.Date(now)) + ".json"

    // One writer at a time: onStop threads and Back up now never write the same file together.
    private val lock = Any()

    /** Writes today's automatic backup if due. Off the main thread. True when one was written. */
    fun runIfDue(ctx: Context, now: Long = System.currentTimeMillis()): Boolean = synchronized(lock) {
        val tree = folder(ctx) ?: return false
        if (!due(true, lastAt(ctx), now)) return false // checked again inside the lock
        runCatching {
            writeBackup(ctx, tree, now)
            true
        }.getOrElse {
            android.util.Log.w("IronNotes", "auto backup failed", it)
            prefs(ctx).edit().putLong(FAILED_AT, now).apply()
            false
        }
    }

    /** Writes now, whatever the time since the last one (Settings → Back up now). Throws on failure. */
    fun backupNow(ctx: Context) = synchronized(lock) {
        writeBackup(ctx, folder(ctx) ?: error("no folder"), System.currentTimeMillis())
    }

    private fun writeBackup(ctx: Context, tree: Uri, now: Long) {
        val json = Core.get(ctx).exportBackupJson(backupStamp(java.util.Date(now)))
        val kids = children(ctx, tree) // one listing for the write and the pruning (slow on cloud folders)
        write(ctx, tree, kids, dayFileName(now), json)
        markBackedUp(ctx, now)
        prefs(ctx).edit().remove(FAILED_AT).apply()
        val gone = toPrune(kids.map { it.first } + dayFileName(now)).toHashSet()
        for ((name, uri) in kids) if (name in gone) runCatching { DocumentsContract.deleteDocument(ctx.contentResolver, uri) }
    }

    /** When the last automatic backup failed (folder gone, access revoked …), ms; 0 = the last one worked. */
    fun failedAt(ctx: Context): Long = prefs(ctx).getLong(FAILED_AT, 0L)

    /**
     * Step 1 of a restore: the data as it is now, into a temporary file in the app's storage. Throws if it can't
     * be saved — then don't restore. The safety copy itself only changes once the restore worked ([commitSafety]),
     * so a failed or refused restore never replaces it.
     */
    fun prepareSafety(ctx: Context): File {
        val tmp = File(ctx.filesDir, "$SAFETY_FILE.tmp")
        tmp.writeText(Core.get(ctx).exportBackupJson(backupStamp()), Charsets.UTF_8)
        return tmp
    }

    /** Step 2, after the restore worked: the new safety copy, the one before it kept as `prev`; a copy in the folder. */
    fun commitSafety(ctx: Context, tmp: File) {
        rotateSafety(ctx.filesDir, tmp)
        val now = System.currentTimeMillis()
        prefs(ctx).edit().putLong(SAFETY_AT, now).apply()
        folder(ctx)?.let { tree ->
            // The time in the name: two restores on one day keep both copies.
            val name = "iron-notes-before-restore-" + java.text.SimpleDateFormat("yyyy-MM-dd-HHmm", java.util.Locale.ROOT).format(java.util.Date(now)) + ".json"
            runCatching { synchronized(lock) { write(ctx, tree, children(ctx, tree), name, File(ctx.filesDir, SAFETY_FILE).readText(Charsets.UTF_8)) } }
        }
    }

    /** The copy of the current data couldn't be saved, so nothing was restored. */
    class SafetyFailed(cause: Throwable) : Exception(cause)

    /**
     * A restore with its safety copy (off the main thread): the current data saved aside, the backup imported,
     * then the copy kept — or, if the import refuses the file or fails, the copy dropped and the old safety copy
     * left as it was. Throws [SafetyFailed] (nothing restored) or the import's error.
     */
    fun restoreWithSafety(ctx: Context, json: String) {
        val tmp = try { prepareSafety(ctx) } catch (e: Exception) { throw SafetyFailed(e) }
        try {
            Core.get(ctx).importBackupJson(json)
        } catch (e: Exception) {
            discardSafety(tmp)
            throw e
        }
        commitSafety(ctx, tmp)
    }

    /** A restore that didn't happen: the temporary copy goes, the safety copy stays as it was. */
    fun discardSafety(tmp: File) {
        tmp.delete()
    }

    /** `current` → `prev`, `tmp` → `current` (plain files; unit-tested). */
    fun rotateSafety(dir: File, tmp: File) {
        val current = File(dir, SAFETY_FILE)
        val prev = File(dir, "$SAFETY_FILE.prev")
        if (current.exists()) {
            prev.delete()
            current.renameTo(prev)
        }
        if (!tmp.renameTo(current)) error("can't keep the safety copy")
    }

    /** When the safety copy was saved, ms; 0 = there is none. */
    fun safetyAt(ctx: Context): Long = if (File(ctx.filesDir, SAFETY_FILE).exists()) prefs(ctx).getLong(SAFETY_AT, 0L) else 0L

    fun safetyCopy(ctx: Context): String? = File(ctx.filesDir, SAFETY_FILE).takeIf { it.exists() }?.readText(Charsets.UTF_8)


    // ---- The folder (DocumentsContract, no androidx.documentfile) ----

    private fun children(ctx: Context, tree: Uri): List<Pair<String, Uri>> {
        val parent = DocumentsContract.getTreeDocumentId(tree)
        val list = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parent)
        val cols = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME)
        val out = ArrayList<Pair<String, Uri>>()
        ctx.contentResolver.query(list, cols, null, null, null)?.use { c ->
            while (c.moveToNext()) out.add(c.getString(1) to DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0)))
        }
        return out
    }

    /**
     * Writes `name` in the folder (`kids`: its listing). A new file first, as `<name>.tmp`, renamed over the old one
     * only once it is complete — so a process killed mid-write (onStop is when Android does it) never leaves a cut-off
     * newest backup. A provider that can't rename gets the old file rewritten in place instead.
     */
    private fun write(ctx: Context, tree: Uri, kids: List<Pair<String, Uri>>, name: String, json: String) {
        val resolver = ctx.contentResolver
        val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        val existing = kids.firstOrNull { it.first == name }?.second
        val bytes = json.toByteArray(Charsets.UTF_8)
        if (existing == null) {
            val doc = DocumentsContract.createDocument(resolver, parent, "application/json", name) ?: error("can't create $name")
            (resolver.openOutputStream(doc, "wt") ?: error("no output")).use { it.write(bytes) }
            return
        }
        val tmp = DocumentsContract.createDocument(resolver, parent, "application/octet-stream", "$name.tmp") ?: error("can't create $name.tmp")
        (resolver.openOutputStream(tmp, "wt") ?: error("no output")).use { it.write(bytes) }
        val renamed = runCatching {
            DocumentsContract.deleteDocument(resolver, existing)
            DocumentsContract.renameDocument(resolver, tmp, name)
        }.getOrNull()
        if (renamed == null) {
            // No rename here (or the old one was already gone): write the file itself, then drop the temporary one.
            val doc = runCatching { DocumentsContract.createDocument(resolver, parent, "application/json", name) }.getOrNull() ?: existing
            (resolver.openOutputStream(doc, "wt") ?: error("no output")).use { it.write(bytes) }
            runCatching { DocumentsContract.deleteDocument(resolver, tmp) }
        }
    }
}
