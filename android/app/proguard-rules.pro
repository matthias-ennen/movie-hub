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

# SMBJ pulls optional SPNEGO/GSS and MBassador EL integration classes that are
# not present on Android. Movie Hub authenticates SMB exclusively with
# AuthenticationContext(username, password, domain) and does not use those
# optional code paths. Suppress only these known optional references.
-dontwarn org.ietf.jgss.**
-dontwarn javax.el.**
