package com.lingxi.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.widget.Toast

class WebAppInterface(
    private val context: Context,
    private val activity: Activity
) {

    companion object {
        private const val TAG = "WebAppInterface"
    }

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    @JavascriptInterface
    fun showToast(message: String) {
        activity.runOnUiThread {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun getVersion(): String {
        return android.os.Build.VERSION.RELEASE
    }

    @JavascriptInterface
    fun getDeviceName(): String {
        return android.os.Build.MODEL
    }

    @JavascriptInterface
    fun isAndroid(): Boolean {
        return true
    }

    fun setFilePathCallback(callback: ValueCallback<Array<Uri>>?) {
        filePathCallback = callback
    }

    fun onFileChooserResult(resultCode: Int, data: Intent?) {
        Log.d(TAG, "onFileChooserResult: resultCode=$resultCode")

        if (resultCode == Activity.RESULT_OK && data != null) {
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            filePathCallback?.onReceiveValue(result)
        } else {
            filePathCallback?.onReceiveValue(null)
        }
        filePathCallback = null
    }
}
