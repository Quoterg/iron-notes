package io.github.quoterg.ironnotes.next

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
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
            IronTheme { App(state) }
        }
    }
}
