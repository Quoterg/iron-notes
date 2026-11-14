package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.quoterg.ironnotes.core.DayMusclesData
import io.github.quoterg.ironnotes.core.MuscleStatus

/**
 * Effective reps per muscle on the day log (DayMuscles.tsx): main sessions against the mode's goal
 * ("Chest 22/20"), smaller direct work as extra ("Triceps +8 extra"). Tapping opens the Muscles screen.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DayMuscles(state: AppState, date: String) {
    var data by remember(date) { mutableStateOf<DayMusclesData?>(null) }
    // Changed sets reload the day; another mode or formula recounts.
    val latest = remember { Latest() }
    LaunchedEffect(date, state.day, state.settings.mode, state.settings.formula) {
        val id = latest.next()
        state.run({ it.dayMuscles(date) }) { if (latest.isLatest(id)) data = it }
    }
    val d = data ?: return
    if (d.rows.isEmpty()) return
    val p = LocalPalette.current
    val approx = if (d.estimated) "≈" else ""
    FlowRow(
        Modifier.fillMaxWidth().padding(bottom = 12.dp)
            .clickable(role = Role.Button) { state.open(Screen.Muscles) }
            .semantics { contentDescription = state.t("muscles") },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        for (r in d.rows) {
            val name = state.t(muscleKey(r.muscle))
            val text: String
            val color: androidx.compose.ui.graphics.Color
            val border: androidx.compose.ui.graphics.Color
            if (!r.main) {
                text = state.t("muExtra", "muscle" to name, "n" to approx + jsRound(r.direct))
                color = p.muted
                border = p.cardBorder
            } else {
                text = "$name $approx${jsRound(r.direct + r.indirect)}" + (d.goal?.let { "/${it.label}" } ?: "")
                when (r.status) {
                    MuscleStatus.IN -> { color = p.accent; border = p.accent }
                    MuscleStatus.OVER -> { color = p.over; border = p.cardBorder }
                    MuscleStatus.UNDER -> { color = p.muted; border = p.cardBorder }
                    null -> { color = p.text; border = p.cardBorder }
                }
            }
            Box(Modifier.border(1.dp, border, CircleShape).padding(horizontal = 10.dp, vertical = 4.dp)) {
                Txt(text, size = 13.sp, color = color)
            }
        }
    }
}
