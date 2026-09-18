package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.app.AlertDialog;
import android.app.SearchManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import org.json.JSONObject;

/**
 * Thin Fire TV/Android shell. Movie Hub itself stays deployed on Firebase, so
 * catalog and UI updates do not require installing a new APK.
 */
public final class MainActivity extends ComponentActivity {
    private static final String APP_URL = "https://movie-hub-62459.web.app/";
    private static final String MOVIE_HUB_HOST = "movie-hub-62459.web.app";
    private static final String FIREBASE_AUTH_HOST = "movie-hub-62459.firebaseapp.com";
    private static final long STARTUP_TIMEOUT_MS = 12_000L;
    private static final String STARTUP_FOCUS_READY_EVENT = "moviehub:startup-focus-ready";
    private static final long HERO_TRAILER_RESULT_RETRY_MS = 400L;
    private static final int HERO_TRAILER_RESULT_MAX_ATTEMPTS = 20;

    private FrameLayout container;
    private WebView webView;
    private View loadingView;
    private View offlineView;
    private Button retryButton;
    private AlertDialog exitDialog;
    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private final Handler heroTrailerResultHandler = new Handler(Looper.getMainLooper());
    private Runnable startupTimeout;
    private Runnable heroTrailerResultRetry;
    private boolean startupFailureVisible;
    private boolean activityResumed;
    private String pendingHeroTrailerRequestId;
    private String pendingHeroTrailerOutcome;
    private int heroTrailerResultAttempts;
    private ActivityResultLauncher<Intent> heroTrailerLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        heroTrailerLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> handleHeroTrailerResult(result.getResultCode(), result.getData()));
        hideSystemUi();
        createContent();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadMovieHub();
        } else {
            hideLoadingView();
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBackNavigation();
            }
        });
    }

    void launchHeroTrailer(
            String videoId,
            String title,
            boolean soundEnabled,
            String requestId) {
        Intent intent = new Intent(this, TrailerPlayerActivity.class);
        intent.putExtra(TrailerPlayerActivity.EXTRA_VIDEO_ID, videoId);
        intent.putExtra(TrailerPlayerActivity.EXTRA_TITLE, title);
        intent.putExtra(TrailerPlayerActivity.EXTRA_SOUND_ENABLED, soundEnabled);
        intent.putExtra(TrailerPlayerActivity.EXTRA_REQUEST_ID, requestId);
        heroTrailerLauncher.launch(intent);
    }

    private void handleHeroTrailerResult(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null || webView == null) return;

        String requestId = data.getStringExtra(TrailerPlayerActivity.EXTRA_REQUEST_ID);
        String outcome = data.getStringExtra(TrailerPlayerActivity.EXTRA_OUTCOME);
        if (requestId == null || requestId.isEmpty() || outcome == null || outcome.isEmpty()) return;

        pendingHeroTrailerRequestId = requestId;
        pendingHeroTrailerOutcome = outcome;
        heroTrailerResultAttempts = 0;
        schedulePendingHeroTrailerResult(0L);
    }

    void acknowledgeHeroTrailerResult(String requestId) {
        runOnUiThread(() -> {
            if (!requestId.equals(pendingHeroTrailerRequestId)) return;
            clearPendingHeroTrailerResult();
        });
    }

    private void schedulePendingHeroTrailerResult(long delayMs) {
        if (!activityResumed || pendingHeroTrailerRequestId == null || webView == null) return;
        if (heroTrailerResultRetry != null) {
            heroTrailerResultHandler.removeCallbacks(heroTrailerResultRetry);
        }
        heroTrailerResultRetry = this::deliverPendingHeroTrailerResult;
        heroTrailerResultHandler.postDelayed(heroTrailerResultRetry, delayMs);
    }

    private void deliverPendingHeroTrailerResult() {
        heroTrailerResultRetry = null;
        if (!activityResumed || pendingHeroTrailerRequestId == null || webView == null) return;

        if (heroTrailerResultAttempts >= HERO_TRAILER_RESULT_MAX_ATTEMPTS) {
            clearPendingHeroTrailerResult();
            return;
        }

        String requestId = pendingHeroTrailerRequestId;
        String outcome = pendingHeroTrailerOutcome;
        heroTrailerResultAttempts += 1;
        String script = "window.dispatchEvent(new CustomEvent('moviehub:hero-trailer-result',"
                + "{detail:{requestId:" + JSONObject.quote(requestId)
                + ",outcome:" + JSONObject.quote(outcome) + "}}));";
        webView.evaluateJavascript(script, ignored -> {
            if (requestId.equals(pendingHeroTrailerRequestId)) {
                schedulePendingHeroTrailerResult(HERO_TRAILER_RESULT_RETRY_MS);
            }
        });
    }

    private void clearPendingHeroTrailerResult() {
        if (heroTrailerResultRetry != null) {
            heroTrailerResultHandler.removeCallbacks(heroTrailerResultRetry);
            heroTrailerResultRetry = null;
        }
        pendingHeroTrailerRequestId = null;
        pendingHeroTrailerOutcome = null;
        heroTrailerResultAttempts = 0;
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
        webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        // User-managed home-network video URLs may use plain HTTP. The top-level
        // WebView remains locked to Movie Hub's HTTPS hosts below.
        webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new NativeBridge(), "MovieHubNative");
        webView.addJavascriptInterface(new PersonalDataCryptoBridge(), "MovieHubCrypto");
        webView.setWebViewClient(new MovieHubWebViewClient());
        container.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        loadingView = createLoadingView();
        loadingView.setVisibility(View.GONE);
        container.addView(loadingView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        offlineView = createOfflineView();
        offlineView.setVisibility(View.GONE);
        container.addView(offlineView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(container);
    }

    private View createLoadingView() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(48), dp(48), dp(48), dp(48));
        content.setBackgroundColor(Color.rgb(9, 10, 16));

        TextView title = new TextView(this);
        title.setText("Movie Hub wird geladen …");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        content.addView(title);

        TextView hint = new TextView(this);
        hint.setText("Einen Moment bitte.");
        hint.setTextColor(Color.rgb(190, 195, 210));
        hint.setTextSize(16);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(10);
        content.addView(hint, hintParams);
        return content;
    }

    private View createOfflineView() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(48), dp(48), dp(48), dp(48));
        content.setBackgroundColor(Color.rgb(9, 10, 16));

        TextView title = new TextView(this);
        title.setText("Movie Hub konnte nicht vollständig geladen werden");
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);
        content.addView(title);

        TextView hint = new TextView(this);
        hint.setText("Bitte prüfe deine Internetverbindung und versuche es erneut.");
        hint.setTextColor(Color.rgb(190, 195, 210));
        hint.setTextSize(17);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(14);
        content.addView(hint, hintParams);

        retryButton = new Button(this);
        retryButton.setText("Erneut versuchen");
        retryButton.setAllCaps(false);
        retryButton.setOnClickListener(view -> loadMovieHub());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonParams.topMargin = dp(28);
        content.addView(retryButton, buttonParams);
        return content;
    }

    private void loadMovieHub() {
        startMovieHubLoad();
    }

    private void startMovieHubLoad() {
        cancelStartupTimeout();
        startupFailureVisible = false;
        offlineView.setVisibility(View.GONE);
        loadingView.setVisibility(View.VISIBLE);
        loadingView.bringToFront();
        webView.setVisibility(View.VISIBLE);
        webView.stopLoading();

        // Keep normal WebView caching for hash-versioned assets, but force the
        // HTML entry point to be a fresh request for every cold start/retry.
        String startupUrl = APP_URL
                + "?shell=" + getInstalledVersionCode()
                + "&startup=" + System.currentTimeMillis();
        webView.loadUrl(startupUrl);
        scheduleStartupTimeout();
    }

    private void scheduleStartupTimeout() {
        cancelStartupTimeout();
        startupTimeout = () -> handleStartupFailure();
        startupHandler.postDelayed(startupTimeout, STARTUP_TIMEOUT_MS);
    }

    private void cancelStartupTimeout() {
        if (startupTimeout != null) {
            startupHandler.removeCallbacks(startupTimeout);
            startupTimeout = null;
        }
    }

    private void hideLoadingView() {
        if (loadingView != null) {
            loadingView.setVisibility(View.GONE);
        }
    }

    private void showOfflineView() {
        cancelStartupTimeout();
        startupFailureVisible = true;
        hideLoadingView();
        webView.setVisibility(View.GONE);
        offlineView.setVisibility(View.VISIBLE);
        offlineView.bringToFront();
        retryButton.requestFocus();
    }

    private void handleStartupFailure() {
        showOfflineView();
        StartupIntroOverlay.notifyStartupFailed(this);
    }

    void showStartupFailureAfterIntro() {
        showOfflineView();
    }

    void restoreStartupFocus() {
        if (offlineView.getVisibility() == View.VISIBLE) {
            retryButton.requestFocus();
        } else if (webView.getVisibility() == View.VISIBLE) {
            webView.requestFocus();
            String script = "window.__movieHubStartupFocusReady=true;"
                    + "window.dispatchEvent(new Event('" + STARTUP_FOCUS_READY_EVENT + "'));";
            webView.post(() -> webView.evaluateJavascript(script, null));
        }
    }

    private void showHostedUiReady() {
        if (startupFailureVisible) return;
        String currentUrl = webView.getUrl();
        if (currentUrl == null) return;
        Uri currentUri = Uri.parse(currentUrl);
        if (!MOVIE_HUB_HOST.equalsIgnoreCase(currentUri.getHost())
                || !"https".equalsIgnoreCase(currentUri.getScheme())) {
            return;
        }
        cancelStartupTimeout();
        offlineView.setVisibility(View.GONE);
        hideLoadingView();
        webView.setVisibility(View.VISIBLE);
        StartupIntroOverlay.notifyStartupReady(this);
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
        activityResumed = false;
        webView.onPause();
        webView.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityResumed = true;
        webView.onResume();
        webView.resumeTimers();
        hideSystemUi();
        schedulePendingHeroTrailerResult(HERO_TRAILER_RESULT_RETRY_MS);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        cancelStartupTimeout();
        clearPendingHeroTrailerResult();
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
        public String getPlatformLabel() {
            return "Amazon".equalsIgnoreCase(Build.MANUFACTURER) ? "Fire TV" : "Android";
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
        public String getAppBuild() {
            return Integer.toString(getInstalledVersionCode());
        }

        @JavascriptInterface
        public int getHeroSequenceContractVersion() {
            return 1;
        }

        @JavascriptInterface
        public void notifyStartupReady() {
            runOnUiThread(() -> showHostedUiReady());
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

        /** Loads one sanitized title with the encrypted device-local TMDB API token. */
        @JavascriptInterface
        public void requestTmdbTitleMetadata(String mediaType, String tmdbId, String requestId) {
            TmdbCatalogSyncCoordinator.requestTitle(
                    MainActivity.this, webView, mediaType, tmdbId, requestId);
        }

        @JavascriptInterface
        public void clearSessionSmbCredentials() {
            SessionCredentialStore.clear();
        }

        @JavascriptInterface
        public void openProjectUrl(String rawUrl) {
            final Uri uri;
            try {
                uri = Uri.parse(rawUrl);
            } catch (Exception ignored) {
                return;
            }

            if (!isAllowedProjectUrl(uri)) {
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
            if (!isTrustedMovieHubUrl(uri.getScheme(), uri.getHost())) {
                return;
            }

            if (MOVIE_HUB_HOST.equalsIgnoreCase(uri.getHost())) {
                // The page itself reports presentation readiness only after
                // the real Home Hero and the initial row layout are mounted.
                return;
            } else {
                cancelStartupTimeout();
                hideLoadingView();
                offlineView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request,
                                    WebResourceError error) {
            if (request.isForMainFrame()) {
                handleStartupFailure();
            }
        }
    }

    private boolean isTrustedMovieHubUrl(String scheme, String host) {
        return "https".equalsIgnoreCase(scheme)
                && (MOVIE_HUB_HOST.equalsIgnoreCase(host) || FIREBASE_AUTH_HOST.equalsIgnoreCase(host));
    }

    private boolean isAllowedProjectUrl(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !"github.com".equalsIgnoreCase(uri.getHost())) {
            return false;
        }

        String path = uri.getPath();
        return path != null && ("/matthias-ennen/movie-hub".equals(path)
                || path.startsWith("/matthias-ennen/movie-hub/"));
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
                        "com.amazon.firebat",
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
                return new String[] {
                        "de.exaring.waipu.firetv.live",
                        "de.exaring.waipu.firetv",
                        "de.exaring.waipu"
                };
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
