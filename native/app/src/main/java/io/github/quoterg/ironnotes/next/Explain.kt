package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog

/** The terms the app explains on a tap (Q2b): a title key and a text key. */
enum class Topic(val title: String, val text: String) {
    EFF("effTitle", "explainEff"),
    RECORD("record", "explainRecord"),
    E1RM("est1rm", "explainE1rm"),
    RIR("rir", "explainRir"),
}

/** A small "?" that explains a term (44 dp to touch, 22 dp to see). */
@Composable
fun InfoBtn(state: AppState, topic: Topic, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    Box(
        modifier.size(44.dp).clickable(role = Role.Button) { state.explaining = topic }
            .semantics { contentDescription = "${state.t(topic.title)}: ${state.t("explain")}" },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(22.dp).border(1.dp, p.accent, CircleShape), contentAlignment = Alignment.Center) {
            Txt("?", size = 13.sp, bold = true, color = p.accent)
        }
    }
}

/** Makes something (a badge, a trophy) explain its term when tapped. */
fun Modifier.explains(state: AppState, topic: Topic): Modifier =
    clickable(role = Role.Button) { state.explaining = topic }

/**
 * The explanation in a dialog window (compose-ui, not Material): it dims the screen, keeps TalkBack inside
 * (review of #61), and closes on OK, Back or a tap outside.
 */
@Composable
fun ExplainOverlay(state: AppState) {
    val topic = state.explaining ?: return
    val p = LocalPalette.current
    Dialog(onDismissRequest = { state.explaining = null }) {
        // An opaque panel (not the glass card), so nothing behind shows through the text.
        val shape = androidx.compose.foundation.shape.RoundedCornerShape(18.dp)
        androidx.compose.foundation.layout.Column(
            Modifier.widthIn(max = 480.dp).background(p.bg, shape).border(1.dp, p.cardBorder, shape).padding(16.dp),
        ) {
            Heading(state.t(topic.title), Modifier.padding(bottom = 8.dp))
            Txt(state.t(topic.text))
            Actions { Btn(state.t("ok"), { state.explaining = null }, kind = BtnKind.PRIMARY) }
        }
    }
}
