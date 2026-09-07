package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Thin Fire TV/Android shell. Movie Hub itself stays deployed on Firebase, so
 * catalog and UI updates do not require installing a new APK.
 */
public final class MainActivity extends Activity {
    private static final String APP_URL = "https://movie-hub-62459.web.app/";
    private static final String MOVIE_HUB_HOST = "movie-hub-62459.web.app";
    private static final String FIREBASE_AUTH_HOST = "movie-hub-62459.firebaseapp.com";

    private FrameLayout container;
    private WebView webView;
    private View offlineView;
    private OnBackInvokedCallback systemBackCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        createContent();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadMovieHub();
        }
        registerSystemBackCallback();
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
        webView.loadUrl(APP_URL);
    }

    private void showOfflineView() {
        webView.setVisibility(View.GONE);
        offlineView.setVisibility(View.VISIBLE);
        offlineView.requestFocus();
    }

    @Override
    public void onBackPressed() {
        handleBackNavigation();
    }

    /**
     * Android 13+ no longer guarantees delivery to Activity.onBackPressed()
     * when predictive Back is enabled. The same handler is registered with
     * OnBackInvokedDispatcher below, while this override remains the fallback
     * for Fire OS and older Android versions.
     */
    private void handleBackNavigation() {
        if (offlineView.getVisibility() == View.VISIBLE) {
            moveTaskToBack(true);
            return;
        }

        // The hosted app gets the first chance to close its detail view, menu
        // or subpage. Falling back to WebView history keeps normal browsing
        // intact; at the root we background the app instead of unexpectedly
        // destroying the Fire-TV task.
        webView.evaluateJavascript(
                "(typeof window.__movieHubNativeBack === 'function' && window.__movieHubNativeBack()) ? 'true' : 'false'",
                result -> {
                    if ("\"true\"".equals(result)) {
                        return;
                    }
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        moveTaskToBack(true);
                    }
                });
    }

    private void registerSystemBackCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }

        systemBackCallback = this::handleBackNavigation;
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                systemBackCallback);
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && systemBackCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(systemBackCallback);
            systemBackCallback = null;
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

    /**
     * Deliberately narrow bridge for the hosted Movie Hub page. It exposes no
     * credentials, storage or provider deep links; later native features can
     * be added explicitly instead of giving the page broad device access.
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
            runOnUiThread(() -> finishAndRemoveTask());
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
}
