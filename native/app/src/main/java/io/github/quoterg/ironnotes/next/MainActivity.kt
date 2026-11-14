package io.github.quoterg.ironnotes.next

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
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
    private var state: AppState? = null
    /** A backup that arrived before the state existed (the app was started by the share). */
    private var pending: Uri? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) pending = backupUri(intent)
        setContent {
            val scope = rememberCoroutineScope()
            val state = remember { AppState(this, scope).also { this.state = it } }
            // The database opens off the main thread after the first frame (the window background and
            // the bars show at once).
            LaunchedEffect(Unit) {
                state.start()
                pending?.let { state.receiveBackup(it) }
                pending = null
            }
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

    /** The app was already open: a backup shared to it (the web's "Move to the Android app"). */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val uri = backupUri(intent) ?: return
        state?.receiveBackup(uri) ?: run { pending = uri }
    }

    /** The file of a share (ACTION_SEND) or an open (ACTION_VIEW), if any. */
    private fun backupUri(intent: Intent?): Uri? = when (intent?.action) {
        Intent.ACTION_SEND ->
            if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
        Intent.ACTION_VIEW -> intent.data
        else -> null
    }
}
