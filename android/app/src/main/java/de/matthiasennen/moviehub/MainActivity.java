package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.app.AlertDialog;
import android.app.SearchManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

/**
 * Thin Fire TV/Android shell. Movie Hub itself stays deployed on Firebase, so
 * catalog and UI updates do not require installing a new APK.
 */
public final class MainActivity extends ComponentActivity {
    private static final String APP_URL = "https://movie-hub-62459.web.app/";
    private static final String MOVIE_HUB_HOST = "movie-hub-62459.web.app";
    private static final String FIREBASE_AUTH_HOST = "movie-hub-62459.firebaseapp.com";

    private FrameLayout container;
    private WebView webView;
    private View offlineView;
    private AlertDialog exitDialog;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        createContent();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadMovieHub();
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBackNavigation();
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createContent() {
        container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(9, 10, 16));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(9, 10, 16));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        // User-managed home-network video URLs may use plain HTTP. The top-level
        // WebView remains locked to Movie Hub's HTTPS hosts below.
        webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new NativeBridge(), "MovieHubNative");
        webView.setWebViewClient(new MovieHubWebViewClient());
        container.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        offlineView = createOfflineView();
        offlineView.setVisibility(View.GONE);
        container.addView(offlineView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(container);
    }

    private View createOfflineView() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(48), dp(48), dp(48), dp(48));
        content.setBackgroundColor(Color.rgb(9, 10, 16));

        TextView title = new TextView(this);
        title.setText("Movie Hub ist nicht erreichbar");
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);
        content.addView(title);

        TextView hint = new TextView(this);
        hint.setText("Bitte prüfe die Internetverbindung und versuche es erneut.");
        hint.setTextColor(Color.rgb(190, 195, 210));
        hint.setTextSize(17);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(14);
        content.addView(hint, hintParams);

        Button retry = new Button(this);
        retry.setText("Erneut versuchen");
        retry.setAllCaps(false);
        retry.setOnClickListener(view -> loadMovieHub());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonParams.topMargin = dp(28);
        content.addView(retry, buttonParams);
        return content;
    }

    private void loadMovieHub() {
        offlineView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        // A package update must not restore an older cached index page. The
        // hosted assets remain hash-versioned and can still use normal caching.
        webView.loadUrl(APP_URL + "?shell=" + getInstalledVersionCode());
    }

    private void showOfflineView() {
        webView.setVisibility(View.GONE);
        offlineView.setVisibility(View.VISIBLE);
        offlineView.requestFocus();
    }

    private void handleBackNavigation() {
        if (offlineView.getVisibility() == View.VISIBLE) {
            showNativeExitConfirmation();
            return;
        }

        // The hosted UI decides whether a detail view, menu or subpage needs
        // closing. At Movie Hub's root it renders its own themed confirmation
        // dialog. Android keeps a native fallback only while the page is not
        // ready (for example during loading or offline recovery).
        webView.evaluateJavascript(
                "typeof window.__movieHubNativeBack === 'function' ? window.__movieHubNativeBack() : 'confirm'",
                result -> {
                    if ("\"handled\"".equals(result)) {
                        return;
                    }
                    requestThemedExitConfirmation();
                });
    }

    private void requestThemedExitConfirmation() {
        webView.evaluateJavascript(
                "typeof window.__movieHubShowExitConfirmation === 'function' ? (window.__movieHubShowExitConfirmation(), 'shown') : 'fallback'",
                result -> {
                    if (!"\"shown\"".equals(result)) {
                        showNativeExitConfirmation();
                    }
                });
    }

    private void showNativeExitConfirmation() {
        if (isFinishing() || (exitDialog != null && exitDialog.isShowing())) {
            return;
        }

        exitDialog = new AlertDialog.Builder(this)
                .setTitle("Movie Hub schließen?")
                .setMessage("Du kannst Movie Hub jederzeit über den Startbildschirm wieder öffnen.")
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Schließen", (dialog, which) -> closeMovieHub())
                .create();
        exitDialog.setOnShowListener(dialog -> exitDialog.getButton(AlertDialog.BUTTON_NEGATIVE).requestFocus());
        exitDialog.setOnDismissListener(dialog -> exitDialog = null);
        exitDialog.show();
    }

    private void closeMovieHub() {
        SessionCredentialStore.clear();
        finishAndRemoveTask();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        webView.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.resumeTimers();
        hideSystemUi();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (exitDialog != null) {
            exitDialog.dismiss();
            exitDialog = null;
        }
        if (webView != null) {
            webView.setWebViewClient(null);
            webView.removeAllViews();
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @SuppressWarnings("deprecation")
    private int getInstalledVersionCode() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception ignored) {
            return 0;
        }
    }

    /**
     * Deliberately narrow bridge for the hosted Movie Hub page. It exposes no
     * credentials or storage. Provider launches are restricted to five known
     * provider IDs, their expected HTTPS domains and an explicit package list.
     */
    private final class NativeBridge {
        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception ignored) {
                return "unknown";
            }
        }

        @JavascriptInterface
        public void closeApp() {
            runOnUiThread(() -> closeMovieHub());
        }

        @JavascriptInterface
        public void openNetworkSettings() {
            runOnUiThread(() -> startActivity(
                    new Intent(MainActivity.this, NetworkSettingsActivity.class)));
        }

        @JavascriptInterface
        public void openTmdbSettings() {
            runOnUiThread(() -> startActivity(
                    new Intent(MainActivity.this, TmdbSettingsActivity.class)));
        }

        /** Starts a native read-only TMDB sync. Only sanitized catalog JSON is returned to JavaScript. */
        @JavascriptInterface
        public void requestTmdbCatalogSync() {
            TmdbCatalogSyncCoordinator.request(MainActivity.this, webView);
        }

        @JavascriptInterface
        public void clearSessionSmbCredentials() {
            SessionCredentialStore.clear();
        }

        @JavascriptInterface
        public void openExternalUrl(String rawUrl) {
            final Uri uri;
            try {
                uri = Uri.parse(rawUrl);
            } catch (Exception ignored) {
                return;
            }

            if (!isAllowedProviderWebsite(uri)) {
                return;
            }

            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    // No external browser is available. Movie Hub stays open.
                }
            });
        }

        /**
         * Try a provider-owned title/search destination in an installed app,
         * then the provider app itself and finally the already validated web
         * destination. Every step is user-triggered and allow-listed.
         */
        @JavascriptInterface
        public void openProvider(String providerId, String title, String rawFallbackUrl) {
            final Uri fallbackUri;
            try {
                fallbackUri = Uri.parse(rawFallbackUrl);
            } catch (Exception ignored) {
                return;
            }

            if (!isAllowedProviderDestination(providerId, fallbackUri)) {
                return;
            }

            final String safeTitle = title == null ? "" : title.trim();
            runOnUiThread(() -> launchProvider(providerId, safeTitle, fallbackUri));
        }

        /** Prefer a user-supplied provider-owned title URL and retain the
         * complete generic provider fallback chain when it cannot be opened. */
        @JavascriptInterface
        public void openProviderExact(String providerId, String title,
                                      String rawExactUrl, String rawFallbackUrl) {
            final Uri exactUri;
            final Uri fallbackUri;
            try {
                String normalizedYouTubeUrl = "youtube".equals(providerId)
                        ? YouTubeUrlResolver.canonicalWatchUrl(rawExactUrl)
                        : null;
                exactUri = Uri.parse(normalizedYouTubeUrl == null
                        ? rawExactUrl
                        : normalizedYouTubeUrl);
                fallbackUri = Uri.parse(rawFallbackUrl);
            } catch (Exception ignored) {
                return;
            }

            if (!isAllowedProviderDestination(providerId, exactUri)
                    || !isAllowedProviderDestination(providerId, fallbackUri)) {
                return;
            }

            final String safeTitle = title == null ? "" : title.trim();
            runOnUiThread(() -> launchProviderExact(providerId, safeTitle, exactUri, fallbackUri));
        }

        /** A user-created Movie-Hub media entry. HTTP(S) is required; unlike
         * provider links this intentionally is not limited to five domains. */
        @JavascriptInterface
        public void openMediaUrl(String rawUrl) {
            final Uri uri;
            try { uri = Uri.parse(rawUrl); } catch (Exception ignored) { return; }
            if (uri == null || !("https".equalsIgnoreCase(uri.getScheme())
                    || "http".equalsIgnoreCase(uri.getScheme()))) return;
            final String canonicalYouTubeUrl = YouTubeUrlResolver.canonicalWatchUrl(rawUrl);
            runOnUiThread(() -> {
                if (canonicalYouTubeUrl != null) {
                    launchYouTubeMedia(Uri.parse(canonicalYouTubeUrl), uri);
                    return;
                }
                tryStartActivity(new Intent(Intent.ACTION_VIEW, uri));
            });
        }

        /** Opens an SMB2/3 source only inside Movie Hub's native player. The
         * shared URL contains no credentials; the player obtains them from the
         * protected, device-local credential store or asks the user. */
        @JavascriptInterface
        public void playSmbMedia(String label, String rawUrl) {
            final SmbLocation location;
            try {
                location = SmbLocation.parse(rawUrl);
            } catch (IllegalArgumentException ignored) {
                return;
            }

            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, SmbPlayerActivity.class);
                intent.putExtra(SmbPlayerActivity.EXTRA_LABEL,
                        label == null ? "Netzwerkvideo" : label.trim());
                intent.putExtra(SmbPlayerActivity.EXTRA_URL, location.getUri().toString());
                startActivity(intent);
            });
        }
    }

    private final class MovieHubWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request.isForMainFrame() && !isTrustedMovieHubUrl(request.getUrl().getScheme(), request.getUrl().getHost())) {
                // Do not silently hand arbitrary URLs to the WebView. Provider
                // deep links are intentionally a later, explicit feature.
                return true;
            }
            return false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            android.net.Uri uri = android.net.Uri.parse(url);
            if (isTrustedMovieHubUrl(uri.getScheme(), uri.getHost())) {
                offlineView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request,
                                    WebResourceError error) {
            if (request.isForMainFrame()) {
                showOfflineView();
            }
        }
    }

    private boolean isTrustedMovieHubUrl(String scheme, String host) {
        return "https".equalsIgnoreCase(scheme)
                && (MOVIE_HUB_HOST.equalsIgnoreCase(host) || FIREBASE_AUTH_HOST.equalsIgnoreCase(host));
    }

    private boolean isAllowedProviderWebsite(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }

        String host = uri.getHost();
        if (host == null) return false;
        String normalizedHost = host.toLowerCase(java.util.Locale.ROOT);
        return isDomainOrSubdomain(normalizedHost, "netflix.com")
                || isDomainOrSubdomain(normalizedHost, "primevideo.com")
                || isDomainOrSubdomain(normalizedHost, "amazon.de")
                || isDomainOrSubdomain(normalizedHost, "disneyplus.com")
                || isDomainOrSubdomain(normalizedHost, "youtube.com")
                || isDomainOrSubdomain(normalizedHost, "youtu.be")
                || isDomainOrSubdomain(normalizedHost, "waipu.tv");
    }

    private boolean isAllowedProviderDestination(String providerId, Uri uri) {
        return uri != null && ProviderUrlPolicy.isAllowed(providerId, uri.toString());
    }

    private String[] getProviderPackages(String providerId) {
        switch (providerId) {
            case "netflix":
                return new String[] { "com.netflix.ninja", "com.netflix.mediaclient" };
            case "prime":
                return new String[] {
                        "com.amazon.avod",
                        "com.amazon.amazonvideo.livingroom",
                        "com.amazon.avod.thirdpartyclient"
                };
            case "disney":
                return new String[] { "com.disney.disneyplus" };
            case "youtube":
                return new String[] {
                        "com.amazon.firetv.youtube",
                        "com.google.android.youtube.tv",
                        "com.google.android.youtube"
                };
            case "waipu":
                return new String[] { "de.exaring.waipu.firetv", "de.exaring.waipu" };
            default:
                return new String[0];
        }
    }

    private void launchProvider(String providerId, String title, Uri fallbackUri) {
        String[] packages = getProviderPackages(providerId);
        boolean textSearchFirst = ProviderLaunchPolicy.triesTextSearchFirst(providerId);

        if (textSearchFirst && tryProviderTextSearch(packages, title)) return;

        for (String packageName : packages) {
            Intent deepLink = new Intent(Intent.ACTION_VIEW, fallbackUri);
            deepLink.addCategory(Intent.CATEGORY_BROWSABLE);
            deepLink.setPackage(packageName);
            if (tryStartActivity(deepLink)) return;
        }

        if (!textSearchFirst && tryProviderTextSearch(packages, title)) return;

        for (String packageName : packages) {
            Intent launch = getPackageManager().getLeanbackLaunchIntentForPackage(packageName);
            if (launch == null) {
                launch = getPackageManager().getLaunchIntentForPackage(packageName);
            }
            if (launch != null && tryStartActivity(launch)) return;
        }

        tryStartActivity(new Intent(Intent.ACTION_VIEW, fallbackUri));
    }

    private boolean tryProviderTextSearch(String[] packages, String title) {
        if (title.isEmpty()) return false;
        for (String packageName : packages) {
            Intent search = new Intent(Intent.ACTION_SEARCH);
            search.setPackage(packageName);
            search.putExtra(SearchManager.QUERY, title);
            search.putExtra(SearchManager.USER_QUERY, title);
            search.putExtra(Intent.EXTRA_TEXT, title);
            if (tryStartActivity(search)) return true;
        }
        return false;
    }

    private void launchProviderExact(String providerId, String title,
                                     Uri exactUri, Uri fallbackUri) {
        for (String packageName : getProviderPackages(providerId)) {
            Intent deepLink = new Intent(Intent.ACTION_VIEW, exactUri);
            deepLink.addCategory(Intent.CATEGORY_BROWSABLE);
            deepLink.setPackage(packageName);
            if (tryStartActivity(deepLink)) return;
        }

        launchProvider(providerId, title, fallbackUri);
    }

    private void launchYouTubeMedia(Uri canonicalUri, Uri originalUri) {
        for (String packageName : getProviderPackages("youtube")) {
            Intent deepLink = new Intent(Intent.ACTION_VIEW, canonicalUri);
            deepLink.addCategory(Intent.CATEGORY_BROWSABLE);
            deepLink.setPackage(packageName);
            if (tryStartActivity(deepLink)) return;
        }

        // Preserve the exact user-created link when no known YouTube app
        // accepts the stable watch URL.
        tryStartActivity(new Intent(Intent.ACTION_VIEW, originalUri));
    }

    private boolean tryStartActivity(Intent intent) {
        try {
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException ignored) {
            return false;
        }
    }

    private boolean isDomainOrSubdomain(String host, String domain) {
        return domain.equals(host) || host.endsWith("." + domain);
    }
}
