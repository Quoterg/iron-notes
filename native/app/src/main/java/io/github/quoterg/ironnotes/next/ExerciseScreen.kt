package io.github.quoterg.ironnotes.next

import androidx.compose.runtime.Composable

/** Log sets of one exercise (ExerciseScreen.tsx, Track tab) — N3, in progress. */
@Composable
fun ExerciseScreen(state: AppState, id: String, date: String) {
    Sheet(state.exById[id]?.name ?: "", { state.back() }, state.t("back")) {}
}
