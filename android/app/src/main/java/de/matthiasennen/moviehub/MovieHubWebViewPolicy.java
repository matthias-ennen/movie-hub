package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * Central WebView security/runtime policy for the hosted Movie Hub UI.
 *
 * The top-level document is HTTPS-only and limited to Movie Hub/Firebase Auth.
 * Cleartext + mixed-content compatibility remain enabled solely because users
 * may attach arbitrary HTTP video URLs on their home network. Those hosts
 * cannot be enumerated safely in an Android network-security-config.
 */
final class MovieHubWebViewPolicy {
    private static final String MOVIE_HUB_HOST = "movie-hub-62459.web.app";
    private static final String FIREBASE_AUTH_HOST = "movie-hub-62459.firebaseapp.com";

    private MovieHubWebViewPolicy() {}

    @SuppressLint("SetJavaScriptEnabled")
    static void configure(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Required for explicit user-managed HTTP video URLs rendered inside
        // the HTTPS-hosted UI. Top-level navigation remains HTTPS-only below.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        // Movie Hub signs in with Firebase email/password + local persistence;
        // no cross-site sign-in iframe or provider popup requires third-party
        // cookies inside the Android/Fire-TV shell.
        cookies.setAcceptThirdPartyCookies(webView, false);
    }

    static boolean isTrustedTopLevelUrl(String scheme, String host) {
        return "https".equalsIgnoreCase(scheme)
                && (isPrimaryHost(host) || FIREBASE_AUTH_HOST.equalsIgnoreCase(host));
    }

    static boolean isPrimaryHost(String host) {
        return MOVIE_HUB_HOST.equalsIgnoreCase(host);
    }
}
