package cn.cyrene2008.nameroller

import android.os.Bundle
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun setContentView(view: View?) {
    if (view !is WebView) {
      super.setContentView(view)
      return
    }

    // Wry installs the WebView directly via setContentView. Inset its native
    // container so the WebView's measured bounds (including fixed-position
    // HTML) stay clear of the system chrome on every WebView provider.
    val container = object : FrameLayout(this) {
      override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        ViewCompat.requestApplyInsets(this)
      }
    }
    ViewCompat.setOnApplyWindowInsetsListener(container) { frame, insets ->
      val safe = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      frame.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      WindowInsetsCompat.CONSUMED
    }
    container.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
    super.setContentView(container)
  }
}
