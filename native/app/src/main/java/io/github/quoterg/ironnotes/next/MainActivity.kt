package io.github.quoterg.ironnotes.next

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { IronTheme { Preview() } }
    }
}

@Composable
private fun Preview() {
    val p = LocalPalette.current
    Column(
        Modifier
            .fillMaxSize()
            .background(p.bg)
            .safeDrawingPadding()
            .padding(16.dp),
    ) {
        BasicText(stringResource(R.string.app_name), style = TextStyle(color = p.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold))
        Spacer(Modifier.height(16.dp))
        val shape = RoundedCornerShape(18.dp)
        Column(
            Modifier
                .fillMaxWidth()
                .background(p.card, shape)
                .border(1.dp, p.cardBorder, shape)
                .padding(16.dp),
        ) {
            BasicText(stringResource(R.string.preview_title), style = TextStyle(color = p.accent, fontSize = 16.sp, fontWeight = FontWeight.SemiBold))
            Spacer(Modifier.height(8.dp))
            BasicText(stringResource(R.string.preview_body), style = TextStyle(color = p.muted, fontSize = 15.sp, lineHeight = 21.sp))
        }
    }
}
