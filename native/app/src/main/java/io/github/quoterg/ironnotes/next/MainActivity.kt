package io.github.quoterg.ironnotes.next

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val scope = rememberCoroutineScope()
            val state = remember { AppState(this, scope) }
            // The database opens off the main thread after the first frame (the window background and
            // the bars show at once).
            LaunchedEffect(Unit) { state.start() }
            val night = state.theme.night
            // The bars' icon colours follow the chosen theme (Auto: the system's).
            LaunchedEffect(night) {
                when (night) {
                    null -> enableEdgeToEdge()
                    true -> enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
                    false -> enableEdgeToEdge(SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT), SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT))
                }
            }
            // A language change redraws everything (strings are read at composition).
            IronTheme(night) { key(state.settings.lang) { App(state) } }
        }
    }
}
