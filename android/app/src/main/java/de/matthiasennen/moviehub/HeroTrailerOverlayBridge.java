package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Outline;
import android.net.http.SslError;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/** Native YouTube overlay for Hero trailers with an already-running player WebView. */
final class HeroTrailerOverlayBridge {
    private static final String JS_INTERFACE = "MovieHubHeroTrailer";
    private static final String PLAYER_EVENTS_INTERFACE = "MovieHubHeroTrailerEvents";
    private static final String PLAYER_PAGE_URL = "https://movie-hub-62459.web.app/hero-player.html";
    private static final long PREPARE_DELAY_MS = 1200L;
    private static final Map<WebView, HeroTrailerOverlayBridge> INSTALLED =
            Collections.synchronizedMap(new WeakHashMap<>());

    private final Activity activity;
    private final WebView hostWebView;
    private WebView playerWebView;
    private String activeToken;
    private String pendingVideoId;
    private boolean playerPageReady;

    static void install(Activity activity, WebView hostWebView) {
        if (activity == null || hostWebView == null) return;
        synchronized (INSTALLED) {
            if (INSTALLED.containsKey(hostWebView)) return;
            HeroTrailerOverlayBridge bridge = new HeroTrailerOverlayBridge(activity, hostWebView);
            hostWebView.addJavascriptInterface(bridge, JS_INTERFACE);
            INSTALLED.put(hostWebView, bridge);
            hostWebView.postDelayed(bridge::preparePlayerWebView, PREPARE_DELAY_MS);
        }
    }

    private HeroTrailerOverlayBridge(Activity activity, WebView hostWebView) {
        this.activity = activity;
        this.hostWebView = hostWebView;
    }

    @JavascriptInterface
    public void create(String token, String videoId,
                       double leftCss, double topCss,
                       double widthCss, double heightCss,
                       double radiusCss, double viewportWidthCss) {
        if (!isValidToken(token) || !isValidVideoId(videoId) || viewportWidthCss <= 0) {
            activity.runOnUiThread(() -> notifyHost(token, "diagnostic", true,
                    "Bridge-Aufruf verworfen: ungültige Parameter"));
            return;
        }
        activity.runOnUiThread(() -> {
            activeToken = token;
            pendingVideoId = videoId;
            notifyHost(token, "diagnostic", true, "Bridge create() erreicht");
            try {
                createOnUiThread(token, videoId, leftCss, topCss, widthCss, heightCss,
                        radiusCss, viewportWidthCss);
            } catch (Throwable error) {
                String name = error.getClass().getSimpleName();
                String message = error.getMessage();
                notifyHost(token, "diagnostic", true,
                        "Native Ausnahme " + name
                                + (message == null || message.isEmpty() ? "" : " · " + message));
                detachPlayer();
            }
        });
    }

    @JavascriptInterface
    public void play(String token) {
        activity.runOnUiThread(() -> {
            if (!matches(token) || playerWebView == null) return;
            playerWebView.evaluateJavascript("window.movieHubPlay && window.movieHubPlay()", null);
        });
    }

    @JavascriptInterface
    public void setMuted(String token, boolean muted) {
        activity.runOnUiThread(() -> {
            if (!matches(token) || playerWebView == null) return;
            playerWebView.evaluateJavascript(
                    "window.movieHubSetMuted && window.movieHubSetMuted(" + (muted ? "true" : "false") + ")",
                    null);
        });
    }

    @JavascriptInterface
    public void destroy(String token) {
        activity.runOnUiThread(() -> {
            if (!matches(token)) return;
            detachPlayer();
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void preparePlayerWebView() {
        if (activity.isFinishing() || activity.isDestroyed() || playerWebView != null) return;
        try {
            View rootView = activity.findViewById(android.R.id.content);
            if (!(rootView instanceof ViewGroup)) return;

            WebView player = new WebView(activity);
            player.setBackgroundColor(Color.TRANSPARENT);
            player.setAlpha(0f);
            player.setFocusable(false);
            player.setFocusableInTouchMode(false);
            player.setClickable(false);
            player.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

            WebSettings settings = player.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            cookies.setAcceptThirdPartyCookies(player, true);

            player.setWebChromeClient(new WebChromeClient());
            player.setWebViewClient(new DiagnosticWebViewClient());
            player.addJavascriptInterface(new PlayerEvents(), PLAYER_EVENTS_INTERFACE);

            FrameLayout.LayoutParams preloadParams = new FrameLayout.LayoutParams(1, 1);
            preloadParams.leftMargin = 0;
            preloadParams.topMargin = 0;
            ((ViewGroup) rootView).addView(player, preloadParams);
            playerWebView = player;
            playerPageReady = false;

            // Load the fixed player document once. Hero changes only inject a video id afterwards.
            player.post(() -> {
                try {
                    player.loadUrl(PLAYER_PAGE_URL);
                } catch (Throwable ignored) {
                    playerPageReady = false;
                }
            });
        } catch (Throwable ignored) {
            playerWebView = null;
            playerPageReady = false;
        }
    }

    private void createOnUiThread(String token, String videoId,
                                  double leftCss, double topCss,
                                  double widthCss, double heightCss,
                                  double radiusCss, double viewportWidthCss) {
        activeToken = token;
        pendingVideoId = videoId;
        notifyHost(token, "diagnostic", true, "UI-Thread erreicht");

        View rootView = activity.findViewById(android.R.id.content);
        if (!(rootView instanceof ViewGroup) || hostWebView.getWidth() <= 0) {
            notifyHost(token, "error", true, "native-layout");
            return;
        }

        ViewGroup root = (ViewGroup) rootView;
        double scale = hostWebView.getWidth() / viewportWidthCss;
        int[] hostLocation = new int[2];
        int[] rootLocation = new int[2];
        hostWebView.getLocationOnScreen(hostLocation);
        root.getLocationOnScreen(rootLocation);

        int leftPx = (hostLocation[0] - rootLocation[0]) + (int) Math.round(leftCss * scale);
        int topPx = (hostLocation[1] - rootLocation[1]) + (int) Math.round(topCss * scale);
        int widthPx = Math.max(1, (int) Math.round(widthCss * scale));
        int heightPx = Math.max(1, (int) Math.round(heightCss * scale));
        float radiusPx = (float) Math.max(0, radiusCss * scale);
        notifyHost(token, "diagnostic", true,
                "Layout geprüft · " + widthPx + "×" + heightPx + " @ " + leftPx + "," + topPx);

        if (playerWebView == null) {
            notifyHost(token, "diagnostic", true, "Vorbereiteter WebView fehlt");
            notifyHost(token, "error", true, "native-webview-not-prepared");
            hostWebView.postDelayed(this::preparePlayerWebView, PREPARE_DELAY_MS);
            return;
        }

        WebView player = playerWebView;
        notifyHost(token, "diagnostic", true, "Vorbereiteter WebView übernommen");
        player.setAlpha(0f);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            player.setClipToOutline(true);
            player.setOutlineProvider(new ViewOutlineProvider() {
                @Override
                public void getOutline(View view, Outline outline) {
                    outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radiusPx);
                }
            });
        }

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(widthPx, heightPx);
        params.leftMargin = leftPx;
        params.topMargin = topPx;
        player.setLayoutParams(params);
        player.bringToFront();
        notifyHost(token, "diagnostic", true, "Vorgeladener Player positioniert");

        if (playerPageReady) {
            injectPendingVideo();
        } else {
            notifyHost(token, "diagnostic", true, "Warte auf vorgeladene Player-Seite");
        }
    }

    private void injectPendingVideo() {
        if (playerWebView == null || !playerPageReady || activeToken == null || pendingVideoId == null) return;
        String token = activeToken;
        String videoId = pendingVideoId;
        pendingVideoId = null;
        notifyHost(token, "diagnostic", true, "Video-ID wird an vorgeladenen Player übergeben");
        String script = "window.movieHubLoadVideo && window.movieHubLoadVideo(" + JSONObject.quote(videoId) + ")";
        playerWebView.evaluateJavascript(script, value -> {
            if (matches(token)) {
                notifyHost(token, "diagnostic", true, "Video-ID an Player übergeben");
            }
        });
    }

    private final class DiagnosticWebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            if (url != null && url.contains("hero-player.html")) {
                playerPageReady = false;
                String token = activeToken;
                if (token != null) {
                    notifyHost(token, "diagnostic", true, "Vorgeladene Player-Seite startet");
                }
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (url == null || !url.contains("hero-player.html")) return;
            playerPageReady = true;
            String token = activeToken;
            if (token != null) {
                notifyHost(token, "diagnostic", true, "Vorgeladene Player-Seite bereit");
                injectPendingVideo();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            String token = activeToken;
            if (token == null) return;
            String host = request.getUrl() == null ? "?" : request.getUrl().getHost();
            String detail = error == null ? "?" : String.valueOf(error.getErrorCode());
            notifyHost(token, "diagnostic", true,
                    "WebView-Netzwerkfehler " + detail + " · " + host);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                        WebResourceResponse errorResponse) {
            String token = activeToken;
            if (token == null) return;
            String host = request.getUrl() == null ? "?" : request.getUrl().getHost();
            int status = errorResponse == null ? -1 : errorResponse.getStatusCode();
            notifyHost(token, "diagnostic", true, "HTTP " + status + " · " + host);
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            String token = activeToken;
            if (token != null) {
                notifyHost(token, "diagnostic", true,
                        "SSL-Fehler " + (error == null ? "?" : error.getPrimaryError()));
            }
            if (handler != null) handler.cancel();
        }
    }

    private final class PlayerEvents {
        @JavascriptInterface
        public void diagnostic(String message) {
            String token = activeToken;
            if (token == null) return;
            activity.runOnUiThread(() -> notifyHost(token, "diagnostic", true,
                    message == null ? "?" : message));
        }

        @JavascriptInterface
        public void ready() {
            String token = activeToken;
            if (token == null) return;
            activity.runOnUiThread(() -> notifyHost(token, "ready", true, ""));
        }

        @JavascriptInterface
        public void playing(boolean muted) {
            String token = activeToken;
            if (token == null) return;
            activity.runOnUiThread(() -> {
                if (!matches(token) || playerWebView == null) return;
                playerWebView.setAlpha(1f);
                notifyHost(token, "playing", muted, "");
            });
        }

        @JavascriptInterface
        public void ended() {
            String token = activeToken;
            if (token == null) return;
            activity.runOnUiThread(() -> {
                if (!matches(token)) return;
                notifyHost(token, "ended", true, "");
                detachPlayer();
            });
        }

        @JavascriptInterface
        public void error(String code) {
            String token = activeToken;
            if (token == null) return;
            activity.runOnUiThread(() -> {
                if (!matches(token)) return;
                notifyHost(token, "error", true, code == null ? "?" : code);
                detachPlayer();
            });
        }
    }

    private void notifyHost(String token, String type, boolean muted, String detail) {
        if (hostWebView == null || token == null) return;
        String script = "window.__movieHubNativeHeroTrailerEvent && window.__movieHubNativeHeroTrailerEvent("
                + JSONObject.quote(token) + ","
                + JSONObject.quote(type) + ","
                + (muted ? "true" : "false") + ","
                + JSONObject.quote(detail == null ? "" : detail) + ")";
        hostWebView.evaluateJavascript(script, null);
    }

    private void detachPlayer() {
        if (playerWebView != null) {
            playerWebView.setAlpha(0f);
            FrameLayout.LayoutParams hidden = new FrameLayout.LayoutParams(1, 1);
            hidden.leftMargin = 0;
            hidden.topMargin = 0;
            playerWebView.setLayoutParams(hidden);
        }
        pendingVideoId = null;
        activeToken = null;
    }

    private boolean matches(String token) {
        return activeToken != null && activeToken.equals(token);
    }

    private boolean isValidToken(String token) {
        return token != null && token.length() >= 4 && token.length() <= 96;
    }

    private boolean isValidVideoId(String videoId) {
        return videoId != null && videoId.matches("[A-Za-z0-9_-]{6,20}");
    }
}
