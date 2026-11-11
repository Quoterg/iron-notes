package io.github.quoterg.ironnotes.next

import androidx.compose.runtime.Composable

/** The day log (Log.tsx) — N3, in progress. */
@Composable
fun DayLog(state: AppState) {
    Txt(state.t("emptyDay"), muted = true)
}
