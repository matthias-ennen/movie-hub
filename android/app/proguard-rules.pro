# Movie Hub's hosted JavaScript calls these bridge methods by their
# Java method names. R8 must not remove or rename them.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}


# SMBJ pulls optional desktop-JVM integrations that are not used by Movie Hub:
# - javax.el is only used by mbassador expression filtering.
# - org.ietf.jgss is only used by SMBJ Kerberos/SPNEGO authentication.
# Movie Hub authenticates SMB with username/password via AuthenticationContext.
-dontwarn javax.el.**
-dontwarn org.ietf.jgss.**
