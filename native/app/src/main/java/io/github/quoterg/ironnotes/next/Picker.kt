package io.github.quoterg.ironnotes.next

import androidx.compose.runtime.Composable

/** Add exercise (Picker.tsx) — N3, in progress. */
@Composable
fun PickerScreen(state: AppState, date: String) {
    Sheet(state.t("addExercise"), { state.back() }, state.t("back")) {}
}
