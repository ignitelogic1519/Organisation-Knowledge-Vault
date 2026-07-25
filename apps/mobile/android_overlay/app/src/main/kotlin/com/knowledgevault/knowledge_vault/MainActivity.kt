package com.knowledgevault.knowledge_vault

import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.webkit.WebView
import io.flutter.embedding.android.FlutterActivity

/**
 * Kotlin Android host for the Flutter shell. The WebView itself is driven by
 * flutter_inappwebview (also Kotlin under the hood); here we only enable remote
 * WebView inspection when the build is debuggable, so `chrome://inspect` can be
 * used during development without touching release builds.
 */
class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (debuggable) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }
}
