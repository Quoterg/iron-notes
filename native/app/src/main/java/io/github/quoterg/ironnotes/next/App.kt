package io.github.quoterg.ironnotes.next

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.addDays
import kotlin.math.abs

/** The app (app.tsx): top bar, the tab's content, the tab bar; stacked screens over them; the toast. */
@Composable
fun App(state: AppState) {
    val p = LocalPalette.current
    BackHandler(enabled = state.stack.isNotEmpty()) { state.back() }
    // Registered after the stack's handler, so it wins: Back dismisses the restore confirm first.
    BackHandler(enabled = state.incomingBackup != null) { state.incomingBackup = null }
    val timer = RestTimer.get(LocalContext.current)
    // A running timer gets its own strip at the bottom: the content ends above it, so the pill never covers
    // the set just logged or the day's buttons. Not while the keyboard is up (the pill is under it then).
    // Read through derivedStateOf: App recomposes only when the keyboard goes up or down, not on every
    // frame of its animation (review of #59).
    val ime = WindowInsets.ime
    val density = LocalDensity.current
    val imeUp by remember(ime, density) { derivedStateOf { ime.getBottom(density) > 0 } }
    val docked = timer.endsAt != 0L && !imeUp
    val onStack = state.stack.isNotEmpty()
    Box(Modifier.fillMaxSize().background(p.bg).glow(p)) {
        if (state.ready) {
            Column(Modifier.fillMaxSize()) {
                TopBar(state)
                Box(Modifier.weight(1f).fillMaxWidth().reserve(docked, TAB_TIMER_SPACE), contentAlignment = Alignment.TopCenter) {
                    TabContent(state)
                }
            }
            TabBar(state, Modifier.align(Alignment.BottomCenter))
            // Only the top screen is composed. The ones under it are not kept alive (cheap on a slow phone);
            // their remembered-saveable state (the picker's search and category) is held per stack position
            // and restored when going back, and dropped once the screen is popped.
            StackTop(state, docked)
            // Above the sheets, under the toast; draws nothing without a running timer. Over the tabs it
            // sits above the tab bar; over a stacked screen (no tab bar) at the bottom.
            RestTimerBar(state, timer, Modifier.align(Alignment.BottomCenter), bottom = if (onStack) STACK_TIMER_GAP else TAB_TIMER_GAP)
        }
        // A backup handed over from the web app ("Move to the Android app"): ask before replacing this app's data.
        if (state.incomingBackup != null) {
            // Swallows every touch, so nothing under it (logging a set, the tabs) can be used while the
            // "replaces the data in this app" question is up.
            Box(
                Modifier.fillMaxSize().background(p.bg.copy(alpha = 0.92f))
                    .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } } }
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                ConfirmCard(state, state.t("moveIncomingQ"), state.t("importBackup"), { state.restoreIncoming() }, { state.incomingBackup = null })
            }
        }
        state.toast?.let { ToastView(state, it, Modifier.align(Alignment.BottomCenter)) }
    }
}

// The rest-timer pill (RestTimerBar) is TIMER_PILL tall; over the tabs it sits TAB_TIMER_GAP above the
// navigation bar (clear of the tab bar), over a stacked screen STACK_TIMER_GAP. While it runs, the
// content ends 8 dp above it.
private val TIMER_PILL = 56.dp
private val TAB_TIMER_GAP = 86.dp
private val STACK_TIMER_GAP = 8.dp
private val TAB_TIMER_SPACE = TAB_TIMER_GAP + TIMER_PILL + 8.dp
private val STACK_TIMER_SPACE = STACK_TIMER_GAP + TIMER_PILL + 8.dp

/** Keeps `space` (above the navigation bar) free at the bottom while `on`. */
private fun Modifier.reserve(on: Boolean, space: Dp) = if (on) navigationBarsPadding().padding(bottom = space) else this

/** The top stacked screen, with its saveable state kept while other screens are opened over it. */
@Composable
private fun StackTop(state: AppState, docked: Boolean) {
    val holder = rememberSaveableStateHolder()
    val keys = state.stack.mapIndexed { i, screen -> "$i:$screen" }
    val known = remember { HashSet<String>() }
    SideEffect {
        known.filter { it !in keys }.forEach { holder.removeState(it); known.remove(it) }
        known.addAll(keys)
    }
    val top = state.stack.lastOrNull() ?: return
    holder.SaveableStateProvider(keys.last()) {
        // Opaque to the bottom, so the tab bar doesn't show through the timer's strip.
        Box(Modifier.fillMaxSize().background(LocalPalette.current.bg)) {
            Box(Modifier.fillMaxSize().reserve(docked, STACK_TIMER_SPACE)) { ScreenView(state, top) }
        }
    }
}

/** The background glows (styles.css `--glow`). */
private fun Modifier.glow(p: Palette) = drawBehind {
    drawRect(Brush.radialGradient(listOf(p.glowA, Color.Transparent), center = Offset(0f, size.height * 0.18f), radius = size.width * 0.9f))
    drawRect(Brush.radialGradient(listOf(p.glowB, Color.Transparent), center = Offset(size.width, size.height * 0.6f), radius = size.width * 0.9f))
}

@Composable
private fun TopBar(state: AppState) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().background(p.bar).statusBarsPadding()) {
        Box(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 16.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
            if (state.tab == Tab.LOG) DateNav(state) else Txt(state.t(state.tab.key), Modifier.semantics { heading() }, bold = true, size = 21.sp)
        }
        Box(Modifier.fillMaxWidth().heightIn(min = 1.dp).background(p.line))
    }
}

@Composable
private fun DateNav(state: AppState) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        IconBtn("‹", state.t("prevDay"), { state.loadDay(addDays(state.date, -1)) })
        Box(
            Modifier.widthIn(min = 140.dp).heightIn(min = 44.dp).clickable(role = Role.Button) { state.loadDay(today()) }.padding(horizontal = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Txt(state.i18n.dayLabel(state.date), bold = true, size = 17.sp)
        }
        IconBtn("›", state.t("nextDay"), { state.loadDay(addDays(state.date, 1)) })
    }
}

@Composable
private fun TabContent(state: AppState) {
    when (state.tab) {
        Tab.LOG -> {
            var dx = 0f
            Column(
                Modifier
                    .fillMaxSize()
                    .widthIn(max = 640.dp)
                    // Swipe left/right to change day (app.tsx swipeStart/swipeEnd: > 70 px, mostly sideways).
                    .pointerInput(state.date) {
                        detectHorizontalDragGestures(
                            onDragStart = { dx = 0f },
                            onDragEnd = { if (abs(dx) > 70.dp.toPx()) state.loadDay(addDays(state.date, if (dx < 0) 1 else -1)) },
                        ) { _, d -> dx += d }
                    }
                    .verticalScroll(rememberScrollState())
                    .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 160.dp),
            ) {
                DayLog(state)
            }
        }
        Tab.CALENDAR -> CalendarTab(state)
        Tab.ROUTINES -> RoutinesTab(state)
        Tab.BODY -> BodyTab(state)
        Tab.SETTINGS -> SettingsTab(state)
        // Later milestones (N7/N8 body & settings).
        else -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Txt("—", muted = true)
        }
    }
}

@Composable
private fun TabBar(state: AppState, modifier: Modifier) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(24.dp)
    Row(
        modifier
            .navigationBarsPadding()
            .padding(start = 12.dp, end = 12.dp, bottom = 10.dp)
            .widthIn(max = 616.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(p.nav, shape)
            .border(1.dp, p.cardBorder, shape)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (tab in Tab.entries) {
            val active = state.tab == tab
            val tabShape = RoundedCornerShape(20.dp)
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 52.dp)
                    .clip(tabShape)
                    .background(if (active) p.active else Color.Transparent, tabShape)
                    .clickable(role = Role.Tab) { state.tab = tab }
                    .semantics { selected = active }
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                // Long names ("Inställningar") shrink to fit on one line instead of breaking mid-word
                // (hyphenation patterns aren't available on every Android version).
                androidx.compose.foundation.text.BasicText(
                    state.t(tab.key),
                    style = androidx.compose.ui.text.TextStyle(
                        color = if (active) p.activeText else p.muted,
                        fontWeight = if (active) androidx.compose.ui.text.font.FontWeight.SemiBold else androidx.compose.ui.text.font.FontWeight.Normal,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    ),
                    maxLines = 1,
                    autoSize = androidx.compose.foundation.text.TextAutoSize.StepBased(minFontSize = 9.sp, maxFontSize = 13.sp),
                )
            }
        }
    }
}

@Composable
private fun ScreenView(state: AppState, screen: Screen) {
    when (screen) {
        is Screen.Pick -> PickerScreen(state, screen.date)
        is Screen.Exercise -> ExerciseScreen(state, screen.id, screen.date)
        is Screen.Comment -> CommentScreen(state, screen.date)
        is Screen.Copy -> CopyScreen(state, screen.date)
        is Screen.SaveWorkout -> SaveWorkoutScreen(state, screen.date)
        is Screen.Routine -> RoutineScreen(state, screen.id)
        is Screen.RoutineDay -> RoutineDayScreen(state, screen.routineId, screen.dayId)
        Screen.Programs -> ProgramsScreen(state)
        Screen.Muscles -> MusclesScreen(state)
        Screen.Analysis -> AnalysisScreen(state)
        Screen.Review -> ReviewScreen(state)
        is Screen.Metric -> MetricScreen(state, screen.id)
        is Screen.EditExercise -> ExerciseEditorScreen(state, screen.id, screen.categoryId, screen.date)
        is Screen.Category -> CategoryEditorScreen(state, screen.id)
        Screen.ManageExercises -> PickerScreen(state, today(), manage = true)
        is Screen.Tools -> ToolsScreen(state, screen.weight, screen.reps)
        is Screen.Summary -> SummaryScreen(state, screen.date)
    }
}

@Composable
private fun ToastView(state: AppState, toast: Toast, modifier: Modifier) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier
            .navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, bottom = 150.dp)
            .clip(shape)
            .background(p.primary, shape)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Txt(toast.text, bold = true, color = p.primaryText)
        if (toast.actionLabel != null && toast.action != null) {
            Box(Modifier.clickable(role = Role.Button) { state.dismissToast(); toast.action.invoke() }.padding(4.dp)) {
                Txt(toast.actionLabel, bold = true, color = p.primaryText)
            }
        }
    }
}
