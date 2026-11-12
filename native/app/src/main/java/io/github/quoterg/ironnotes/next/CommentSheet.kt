package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** The workout comment of a day (CommentSheet.tsx). */
@Composable
fun CommentScreen(state: AppState, date: String) {
    var text by remember(date) { mutableStateOf<String?>(null) }
    LaunchedEffect(date) {
        val d = state.day
        if (d?.date == date) {
            text = d.comment.orEmpty()
        } else {
            state.run({ it.day(date) }) { text = it.comment.orEmpty() }
        }
    }
    fun save(value: String) = state.run({ core -> core.putComment(date, value) }) {
        state.loadDay(state.date)
        state.back()
    }

    Sheet("${state.t("workoutComment")} · ${state.i18n.dayLabel(date)}", { state.back() }, state.t("back")) {
        Column(Modifier.padding(16.dp)) {
            Txt(state.t("comment"), muted = true, small = true, modifier = Modifier.padding(bottom = 6.dp))
            Field(text.orEmpty(), { if (text != null) text = it }, state.t("comment"), Modifier.fillMaxWidth(), singleLine = false, minLines = 4)
            Actions {
                Btn(state.t("save"), { save(text.orEmpty()) }, kind = BtnKind.PRIMARY, enabled = text != null)
                if (!text.isNullOrEmpty()) Btn(state.t("delete"), { save("") }, kind = BtnKind.DANGER)
            }
        }
    }
}
