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
    Box(Modifier.fillMaxSize().background(p.bg).glow(p)) {
        if (state.ready) {
            Column(Modifier.fillMaxSize()) {
                TopBar(state)
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                    TabContent(state)
                }
            }
            TabBar(state, Modifier.align(Alignment.BottomCenter))
            // Only the top screen is composed. The ones under it are not kept alive (cheap on a slow phone);
            // their remembered-saveable state (the picker's search and category) is held per stack position
            // and restored when going back, and dropped once the screen is popped.
            StackTop(state)
            // Above the sheets, under the toast; draws nothing without a running timer.
            RestTimerBar(state, RestTimer.get(LocalContext.current), Modifier.align(Alignment.BottomCenter))
        }
        state.toast?.let { ToastView(state, it, Modifier.align(Alignment.BottomCenter)) }
    }
}

/** The top stacked screen, with its saveable state kept while other screens are opened over it. */
@Composable
private fun StackTop(state: AppState) {
    val holder = rememberSaveableStateHolder()
    val keys = state.stack.mapIndexed { i, screen -> "$i:$screen" }
    val known = remember { HashSet<String>() }
    SideEffect {
        known.filter { it !in keys }.forEach { holder.removeState(it); known.remove(it) }
        known.addAll(keys)
    }
    val top = state.stack.lastOrNull() ?: return
    holder.SaveableStateProvider(keys.last()) {
        Box(Modifier.fillMaxSize()) { ScreenView(state, top) }
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
                Txt(state.t(tab.key), size = 13.sp, bold = active, color = if (active) p.activeText else p.muted, maxLines = 2)
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
