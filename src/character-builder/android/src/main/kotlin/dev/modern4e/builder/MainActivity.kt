package dev.modern4e.builder

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Native shell consuming the common core directly. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val fixture = smokeFixture()
            MaterialTheme {
                Surface {
                    Column(Modifier.padding(24.dp)) {
                        Text("Modern 4e Character Builder", style = MaterialTheme.typography.headlineMedium)
                        Text(fixture.message)
                        Text(fixture.fixtureId)
                        Text("Foundation preview. Character creation is not available yet.")
                    }
                }
            }
        }
    }
}
