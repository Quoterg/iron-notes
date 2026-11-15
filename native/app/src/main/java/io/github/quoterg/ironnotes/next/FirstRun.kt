package io.github.quoterg.ironnotes.next

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.quoterg.ironnotes.core.DistUnit
import io.github.quoterg.ironnotes.core.Lang
import io.github.quoterg.ironnotes.core.WeightUnit

/** The one-time setup card's hint key (AppState.seen): closed with Done, or by logging a first set. */
const val HINT_SETUP = "setup"

/**
 * Whether the first-run card shows: on today's empty log until it was closed or anything was ever logged
 * (`seen` covers both: AppState marks it when the history isn't empty, or a day with sets loads).
 */
fun showSetup(seen: Boolean, isToday: Boolean, dayEmpty: Boolean): Boolean = !seen && isToday && dayEmpty

/**
 * First run for a friend (Q4): language and units on the empty first screen, where they are needed before
 * the first set — they sit far down in Settings otherwise. Shown until Done or the first saved set; no tutorial.
 */
@Composable
fun SetupCard(state: AppState) {
    val s = state.settings
    Card(Modifier.padding(top = 4.dp)) {
        Heading(state.t("setupTitle"), Modifier.padding(bottom = 4.dp))
        Choice(
            state.t("language"),
            listOf<Pair<Lang?, String>>(null to state.t("langAuto"), Lang.EN to "English", Lang.SV to "Svenska"),
            s.lang, { state.putSettings(s.copy(lang = it)) },
        )
        Choice(state.t("weightUnit"), listOf(WeightUnit.KG to "kg", WeightUnit.LB to "lb"), s.unit, { state.putSettings(s.copy(unit = it)) })
        Choice(state.t("distanceUnit"), listOf(DistUnit.KM to "km", DistUnit.MI to "mi", DistUnit.M to "m"), s.dist, { state.putSettings(s.copy(dist = it)) })
        Txt(state.t("setupHint"), Modifier.padding(top = 4.dp), muted = true, small = true)
        Actions { Btn(state.t("done"), { state.markSeen(HINT_SETUP) }, kind = BtnKind.PRIMARY) }
    }
}
