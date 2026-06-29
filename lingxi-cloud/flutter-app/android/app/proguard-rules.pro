# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

#保留 Flutter 引擎
-keep class io.flutter.embedding.** { *; }

# WebView (华为 EMUI WebView 兼容)
-keep class android.webkit.** { *; }
-keep class org.chromium.** { *; }

# OkHttp / Dio (网络库)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class dart.convert.** { *; }

# Dio
-keep class dio.** { *; }

# SharedPreferences
-keep class android.content.SharedPreferences { *; }

# Model 类（Dart 生成的）
-keep class com.example.lingxicloud.** { *; }
-keep class com.lume.app.** { *; }

# file_picker
-keep class com.mr.flutter.plugin.filepicker.** { *; }

# image_picker
-keep class io.flutter.plugins.imagepicker.** { *; }

# flutter_local_notifications
-keep class com.dexterous.** { *; }

# url_launcher
-keep class io.flutter.plugins.urllauncher.** { *; }

# 保留泛型签名（Dart/Flutter 反射需要）
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClass

# 保留 native 方法
-keepclasseswithmembernames class * {
    native <methods>;
}

# WebView JS 接口
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Play Core (华为设备没有 Play Store，忽略)
-dontwarn com.google.android.play.core.**
-dontwarn com.google.android.play.**
-keep class com.google.android.play.core.** { *; }
