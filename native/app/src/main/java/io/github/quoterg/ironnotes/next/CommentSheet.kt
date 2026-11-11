package io.github.quoterg.ironnotes.next

import androidx.compose.runtime.Composable

/** The workout comment (CommentSheet.tsx) — N3, in progress. */
@Composable
fun CommentScreen(state: AppState, date: String) {
    Sheet(state.t("workoutComment"), { state.back() }, state.t("back")) {}
}
