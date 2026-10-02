# Movie Hub – Release/R8-Vertrag
#
# JavaScript ruft diese Methoden über WebView.addJavascriptInterface() anhand
# ihres Methodennamens auf. R8 darf die Klassen intern optimieren/umbenennen,
# aber die mit @JavascriptInterface markierten Member müssen inklusive ihrer
# Runtime-Annotation und Namen erhalten bleiben.

-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault

-keepclassmembers,allowoptimization class * {
    @android.webkit.JavascriptInterface <methods>;
}
