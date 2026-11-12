package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Save the shown day as a reusable workout (sets × reps, no weights) into a folder (a routine). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SaveWorkoutScreen(state: AppState, date: String) {
    LaunchedEffect(Unit) { if (RoutineStore.list == null) RoutineStore.load(state) }
    val list = RoutineStore.list
    var name by rememberSaveable { mutableStateOf("") }
    // null = a new "My workouts" folder; the first existing folder is preselected once they are known.
    var folder by rememberSaveable { mutableStateOf<String?>(null) }
    var chosen by rememberSaveable { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    LaunchedEffect(list) {
        if (!chosen && list != null) {
            folder = list.firstOrNull()?.id
            chosen = true
        }
    }
    val count = remember(state.day, state.exById) {
        state.day?.takeIf { it.date == date }?.sets?.filter { state.exById.containsKey(it.exerciseId) }?.map { it.exerciseId }?.toSet()?.size ?: 0
    }

    Sheet(state.t("saveAsWorkout"), { state.back() }, state.t("back")) {
        SheetBody {
            Txt(if (count > 0) state.t("saveWorkoutHint", "n" to count) else state.t("nothingToSave"), muted = true, small = true)
            Txt(state.t("workoutName"), Modifier.padding(top = 12.dp, bottom = 4.dp), muted = true, small = true)
            Field(name, { name = it }, state.t("workoutName"), Modifier.fillMaxWidth())
            Txt(state.t("folder"), Modifier.padding(top = 12.dp, bottom = 4.dp), muted = true, small = true)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                (list ?: emptyList()).forEach { r -> Chip(r.name, folder == r.id, { folder = r.id }) }
                Chip(state.t("newFolderMyWorkouts"), folder == null, { folder = null })
            }
            Btn(
                state.t("save"),
                {
                    val n = name.trim()
                    if (n.isNotEmpty() && count > 0 && chosen && !saving) {
                        saving = true
                        val target = folder
                        state.run({ it.saveWorkout(date, n, target, state.t("myWorkouts")) }, onError = { saving = false }) { routine ->
                            RoutineStore.put(routine)
                            state.showToast(state.t("workoutSaved", "name" to n))
                            state.back()
                        }
                    }
                },
                Modifier.fillMaxWidth().padding(top = 16.dp),
                kind = BtnKind.PRIMARY,
                enabled = name.isNotBlank() && chosen && count > 0 && !saving,
            )
        }
    }
}
