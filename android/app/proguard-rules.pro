# Movie Hub's hosted JavaScript calls these bridge methods by their
# Java method names. R8 must not remove or rename them.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
