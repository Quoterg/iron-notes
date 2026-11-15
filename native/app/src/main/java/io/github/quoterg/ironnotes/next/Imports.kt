package io.github.quoterg.ironnotes.next

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import io.github.quoterg.ironnotes.core.CoreException
import io.github.quoterg.ironnotes.core.Diet
import io.github.quoterg.ironnotes.core.ImportReport
import io.github.quoterg.ironnotes.core.IronLogReport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** A file read and checked, waiting for the user's confirm (the web's `confirm()` before writing). */
private sealed interface Pending {
    val text: String
    class FitNotes(override val text: String, val report: ImportReport) : Pending
    class IronLog(override val text: String, val report: IronLogReport) : Pending
}

/** The file's text (UTF-8; a BOM stays, the importer strips it). */
private fun readText(ctx: Context, uri: Uri): String =
    (ctx.contentResolver.openInputStream(uri) ?: error("no input")).use { it.readBytes().toString(Charsets.UTF_8) }

/** `iron-notes-<date>.csv` (Settings.tsx `exportCsv`). */
fun csvFileName(date: String = today()): String = "iron-notes-$date.csv"

/** The diet phase as the Settings texts name it. */
private fun AppState.phaseName(d: Diet) = t(when (d) { Diet.CUT -> "dietCut"; Diet.BUILD -> "dietBuild"; Diet.MAINTAIN -> "dietMaintain" })

/** The confirm question for a FitNotes file (Settings.tsx `importCsv`). */
internal fun AppState.fitNotesSummary(r: ImportReport): String = t(
    "importSummary",
    "n" to r.sets.toInt(), "from" to (r.first ?: ""), "to" to (r.last ?: ""),
    "ex" to r.exercises.toInt(), "cat" to r.categories.toInt(), "dup" to r.duplicates.toInt(), "bad" to r.skipped.toInt(),
) + if (r.ironNotes) "\n\n" + t("ownCsvHint") else ""

/** The confirm question for an Iron Log backup, with the diet phase its target suggests (`importIronLogFile`). */
internal fun AppState.ironLogQuestion(r: IronLogReport): String {
    val phase = r.phase
    val phaseText = if (phase != null && r.kcal != null && r.maintenance != null) {
        " " + t("ironLogPhase", "kcal" to r.kcal!!.toInt(), "tdee" to r.maintenance!!.toInt(), "phase" to phaseName(phase))
    } else ""
    return t("ironLogQ", "n" to r.days.toInt(), "from" to (r.first ?: ""), "to" to (r.last ?: "")) + phaseText
}

/**
 * Settings → your data, second half: CSV export, FitNotes CSV import and Iron Log import. Files go
 * through the system picker (Storage Access Framework); an import is previewed, confirmed in the card
 * below the buttons, then written by the core in one transaction.
 */
@Composable
fun ImportSection(state: AppState) {
    val ctx = LocalContext.current
    var pending by remember { mutableStateOf<Pending?>(null) }

    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        state.run({ core ->
            val csv = core.exportCsv()
            (ctx.contentResolver.openOutputStream(uri, "wt") ?: error("no output")).use { it.write(csv.toByteArray(Charsets.UTF_8)) }
        })
    }

    val csvOpener = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        state.scope.launch {
            try {
                val report = withContext(Dispatchers.IO) { Core.get(ctx).let { core -> readText(ctx, uri).let { it to core.previewFitnotesCsv(it) } } }
                if (report.second.sets == 0u) state.showToast(state.t("nothingToImport", "dup" to report.second.duplicates.toInt()))
                else pending = Pending.FitNotes(report.first, report.second)
            } catch (e: CoreException.InvalidBackup) {
                state.showToast(state.t("notFitNotes"))
            } catch (e: Exception) {
                state.showToast(e.message ?: e.toString())
            }
        }
    }

    val ironLogOpener = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        state.scope.launch {
            try {
                val got = withContext(Dispatchers.IO) { Core.get(ctx).let { core -> readText(ctx, uri).let { it to core.previewIronLog(it) } } }
                if (got.second.days == 0u) state.showToast(state.t("ironLogEmpty")) else pending = Pending.IronLog(got.first, got.second)
            } catch (e: CoreException.InvalidBackup) {
                state.showToast(state.t("notIronLog"))
            } catch (e: Exception) {
                state.showToast(e.message ?: e.toString())
            }
        }
    }

    fun import(p: Pending) {
        pending = null
        state.scope.launch {
            try {
                when (p) {
                    is Pending.FitNotes -> {
                        val r = withContext(Dispatchers.IO) { Core.get(ctx).importFitnotesCsv(p.text) }
                        state.start() // the library and the shown day, read again
                        state.showToast(state.t("imported", "n" to r.sets.toInt()))
                    }
                    is Pending.IronLog -> {
                        val r = withContext(Dispatchers.IO) { Core.get(ctx).importIronLog(p.text) }
                        state.start() // the diet phase may have changed
                        BodyStore.load(state)
                        val missing = if (r.missing.isEmpty()) "" else " " + state.t("ironLogMissing", "list" to r.missing.joinToString(", "))
                        state.showToast(state.t("ironLogDone", "n" to r.added.toInt(), "dup" to r.skipped.toInt()) + missing)
                    }
                }
            } catch (e: CoreException.InvalidBackup) {
                state.showToast(state.t(if (p is Pending.IronLog) "notIronLog" else "notFitNotes"))
            } catch (e: Exception) {
                state.showToast(e.message ?: e.toString())
            }
        }
    }

    Actions {
        Btn(state.t("exportCsv"), { saver.launch(csvFileName()) })
        Btn(state.t("importFitNotes"), { csvOpener.launch(arrayOf("text/csv", "text/comma-separated-values", "*/*")) })
    }
    Txt(state.t("fitNotesHint"), muted = true, small = true)
    Actions {
        Btn(state.t("importIronLog"), { ironLogOpener.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) })
    }
    Txt(state.t("ironLogHint"), muted = true, small = true)
    when (val p = pending) {
        is Pending.FitNotes -> ConfirmCard(state, state.fitNotesSummary(p.report), state.t("importFitNotes"), { import(p) }, { pending = null })
        is Pending.IronLog -> ConfirmCard(state, state.ironLogQuestion(p.report), state.t("importIronLog"), { import(p) }, { pending = null })
        null -> {}
    }
}
