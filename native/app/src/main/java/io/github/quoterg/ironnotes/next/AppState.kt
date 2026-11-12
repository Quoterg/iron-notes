package io.github.quoterg.ironnotes.next

import android.content.Context
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.github.quoterg.ironnotes.core.Category
import io.github.quoterg.ironnotes.core.DayData
import io.github.quoterg.ironnotes.core.Exercise
import io.github.quoterg.ironnotes.core.IronCore
import io.github.quoterg.ironnotes.core.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The bottom tabs (app.tsx TABS). */
enum class Tab(val key: String) { LOG("log"), CALENDAR("calendar"), ROUTINES("routines"), BODY("body"), SETTINGS("settings") }

/** A screen stacked over the tabs (nav.ts `Screen`); more kinds arrive with later milestones. */
sealed interface Screen {
    /** Add an exercise to `date` (the picker: categories → exercises, search). */
    data class Pick(val date: String) : Screen
    /** Log sets of one exercise on one day. */
    data class Exercise(val id: String, val date: String) : Screen
    /** The day's workout comment. */
    data class Comment(val date: String) : Screen
}

class Toast(val text: String, val actionLabel: String? = null, val action: (() -> Unit)? = null)

/**
 * The app's state (state.ts): settings, the exercise library, the shown day and its sets, the screen
 * stack and the toast. Reads and writes go to the Rust core on Dispatchers.IO; Compose state is only
 * changed on the main thread. Screens call `run { core -> … }` for writes and then reload what changed.
 */
class AppState(context: Context, val scope: CoroutineScope) {
    private val app = context.applicationContext
    val i18n: I18n = I18n.load(app)

    var ready by mutableStateOf(false); private set
    var settings by mutableStateOf(defaultSettings()); private set
    var categories by mutableStateOf<List<Category>>(emptyList()); private set
    var exercises by mutableStateOf<List<Exercise>>(emptyList()); private set

    // Lookups rebuilt only when the lists change (they are read for every row on every recomposition).
    val exById: Map<String, Exercise> by derivedStateOf { exercises.associateBy { it.id } }
    val catById: Map<String, Category> by derivedStateOf { categories.associateBy { it.id } }

    var tab by mutableStateOf(Tab.LOG)
    var date by mutableStateOf(today()); private set
    /** The shown day's data once loaded (null while another day loads: show nothing, as the web does). */
    var day by mutableStateOf<DayData?>(null); private set

    val stack = mutableStateListOf<Screen>()
    var toast by mutableStateOf<Toast?>(null); private set
    private var toastJob: Job? = null

    private fun core(): IronCore = Core.get(app)

    /** Opens the database, loads settings, the library and today. */
    fun start() = scope.launch {
        val (s, lib) = withContext(Dispatchers.IO) { core().settings() to core().library() }
        applySettings(s)
        categories = lib.categories.sortedBy { it.order }
        exercises = lib.exercises
        ready = true
        loadDay(date)
    }

    private fun applySettings(s: Settings) {
        settings = s
        i18n.lang = s.lang?.name?.lowercase() ?: I18n.detect()
        i18n.gymEnglish = s.gymEnglish == true
    }

    fun loadDay(d: String) = scope.launch {
        date = d
        if (day?.date != d) day = null
        val data = withContext(Dispatchers.IO) { core().day(d) }
        if (date == d) day = data
    }

    fun reloadLibrary() = scope.launch {
        val lib = withContext(Dispatchers.IO) { core().library() }
        categories = lib.categories.sortedBy { it.order }
        exercises = lib.exercises
    }

    fun putSettings(s: Settings) = scope.launch {
        withContext(Dispatchers.IO) { core().putSettings(s) }
        applySettings(s)
    }

    /** A write (or read) on the core, off the main thread; then `after` on the main thread. Errors → toast. */
    fun <T> run(work: (IronCore) -> T, onError: () -> Unit = {}, after: (T) -> Unit = {}) = scope.launch {
        try {
            val r = withContext(Dispatchers.IO) { work(core()) }
            after(r)
        } catch (e: Exception) {
            onError()
            showToast(e.message ?: e.toString())
        }
    }

    fun open(screen: Screen) {
        stack.add(screen)
    }

    /** Back: the top screen, else false (the system closes the app). */
    fun back(): Boolean {
        if (stack.isEmpty()) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    fun showToast(text: String, actionLabel: String? = null, action: (() -> Unit)? = null) {
        toastJob?.cancel()
        toast = Toast(text, actionLabel, action)
        toastJob = scope.launch {
            delay(if (action != null) 5000 else 2500)
            toast = null
        }
    }

    fun dismissToast() {
        toastJob?.cancel()
        toast = null
    }

    fun t(key: String, vararg vars: Pair<String, Any>) = i18n.t(key, *vars)
}

/** model.ts DEFAULT_SETTINGS (the core's `Settings::default()`). */
fun defaultSettings() = Settings(
    mode = io.github.quoterg.ironnotes.core.TrainingMode.STANDARD,
    unit = io.github.quoterg.ironnotes.core.WeightUnit.KG,
    dist = io.github.quoterg.ironnotes.core.DistUnit.KM,
    rest = 90.0,
    autoTimer = true,
    timerSound = true,
    markDone = false,
    formula = io.github.quoterg.ironnotes.core.Formula.EPLEY,
    weekStart = 1u,
    keepScreenOn = false,
    plates = null, cycle = null, light = null, program = null, diet = null,
    restNotify = null, roundPlates = null, gymEnglish = null, lang = null,
)
