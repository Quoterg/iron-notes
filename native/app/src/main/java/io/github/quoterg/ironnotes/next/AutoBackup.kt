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

    /** The automatic backups to delete: names of ours beyond the newest [keep] (the date sorts them). Pure. */
    fun toPrune(names: List<String>, keep: Int = KEEP): List<String> =
        names.filter { it.startsWith(PREFIX) && it.endsWith(".json") }.sortedDescending().drop(keep)

    /** Writes today's automatic backup if due. Off the main thread. True when one was written. */
    fun runIfDue(ctx: Context, now: Long = System.currentTimeMillis()): Boolean {
        val tree = folder(ctx) ?: return false
        if (!due(true, lastAt(ctx), now)) return false
        return runCatching {
            val stamp = backupStamp(java.util.Date(now))
            write(ctx, tree, "$PREFIX${stamp.take(10)}.json", Core.get(ctx).exportBackupJson(stamp))
            markBackedUp(ctx, now)
            prune(ctx, tree)
            true
        }.getOrElse { android.util.Log.w("IronNotes", "auto backup failed", it); false }
    }

    /** Writes now, whatever the time since the last one (Settings → Back up now). Throws on failure. */
    fun backupNow(ctx: Context) {
        val tree = folder(ctx) ?: error("no folder")
        val now = System.currentTimeMillis()
        val stamp = backupStamp(java.util.Date(now))
        write(ctx, tree, "$PREFIX${stamp.take(10)}.json", Core.get(ctx).exportBackupJson(stamp))
        markBackedUp(ctx, now)
        prune(ctx, tree)
    }

    /**
     * The data as it is now, saved before a restore replaces it: in the app's storage (for "Undo the last
     * restore") and in the folder if one is chosen. Throws if it can't be saved — then don't restore.
     */
    fun saveSafetyCopy(ctx: Context) {
        val stamp = backupStamp()
        val json = Core.get(ctx).exportBackupJson(stamp)
        File(ctx.filesDir, SAFETY_FILE).writeText(json, Charsets.UTF_8)
        prefs(ctx).edit().putLong(SAFETY_AT, System.currentTimeMillis()).apply()
        folder(ctx)?.let { tree -> runCatching { write(ctx, tree, "iron-notes-before-restore-${stamp.take(10)}.json", json) } }
    }

    /** When the safety copy was saved, ms; 0 = there is none. */
    fun safetyAt(ctx: Context): Long = if (File(ctx.filesDir, SAFETY_FILE).exists()) prefs(ctx).getLong(SAFETY_AT, 0L) else 0L

    fun safetyCopy(ctx: Context): String? = File(ctx.filesDir, SAFETY_FILE).takeIf { it.exists() }?.readText(Charsets.UTF_8)

    fun dropSafetyCopy(ctx: Context) {
        File(ctx.filesDir, SAFETY_FILE).delete()
        prefs(ctx).edit().remove(SAFETY_AT).apply()
    }

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

    /** Writes `name` in the folder, over a file of that name if there is one. */
    private fun write(ctx: Context, tree: Uri, name: String, json: String) {
        val existing = children(ctx, tree).firstOrNull { it.first == name }?.second
        val target = existing ?: DocumentsContract.createDocument(
            ctx.contentResolver,
            DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)),
            "application/json", name,
        ) ?: error("can't create $name")
        (ctx.contentResolver.openOutputStream(target, "wt") ?: error("no output")).use { it.write(json.toByteArray(Charsets.UTF_8)) }
    }

    private fun prune(ctx: Context, tree: Uri) {
        val kids = children(ctx, tree)
        val gone = toPrune(kids.map { it.first }).toHashSet()
        for ((name, uri) in kids) if (name in gone) runCatching { DocumentsContract.deleteDocument(ctx.contentResolver, uri) }
    }
}
