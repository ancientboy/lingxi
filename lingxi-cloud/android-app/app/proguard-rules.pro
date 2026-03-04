# Add project specific ProGuard rules here.

# 保留 WebView 接口
-keep class com.lingxi.app.WebAppInterface {
    *;
}

# 保留 @JavascriptInterface 注解
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 保留 WebView 相关类
-keep class android.webkit.* {
    *;
}

# 保留 WebChromeClient 和 WebViewClient
-keep class * extends android.webkit.WebChromeClient { *; }
-keep class * extends android.webkit.WebViewClient { *; }

# 保留 Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# 保留枚举
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# 保留夜间模式兼容性
-keep class android.support.v7.appcompat.** { *; }

# 保留 Gson
-keep class com.google.gson.** { *; }

# 保留 JSON
-keep class org.json.** { *; }
