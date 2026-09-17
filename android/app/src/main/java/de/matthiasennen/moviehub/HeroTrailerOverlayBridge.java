package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Outline;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Native YouTube overlay for Hero trailers.
 *
 * YouTube requires Android WebView embeds to carry a real HTTP Referer/client
 * identity. Loading a tiny wrapper with loadDataWithBaseURL() supplies that
 * identity while keeping the player visually inside Movie Hub's Hero artwork.
 */
final class HeroTrailerOverlayBridge {
    private static final String JS_INTERFACE = "MovieHubHeroTrailer";
    private static final String PLAYER_EVENTS_INTERFACE = "MovieHubHeroTrailerEvents";
    private static final String MOVIE_HUB_BASE_URL = "https://movie-hub-62459.web.app/";
    private static final Map<WebView, HeroTrailerOverlayBridge> INSTALLED =
            Collections.synchronizedMap(new WeakHashMap<>());

    private final Activity activity;
    private final WebView hostWebView;

    private WebView playerWebView;
    private String activeToken;

    static void install(Activity activity, WebView hostWebView) {
        if (activity == null || hostWebView == null) return;
        synchronized (INSTALLED) {
            if (INSTALLED.containsKey(hostWebView)) return;
            HeroTrailerOverlayBridge bridge = new HeroTrailerOverlayBridge(activity, hostWebView);
            hostWebView.addJavascriptInterface(bridge, JS_INTERFACE);
            INSTALLED.put(hostWebView, bridge);
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
        if (!isValidToken(token) || !isValidVideoId(videoId) || viewportWidthCss <= 0) return;
        activity.runOnUiThread(() -> createOnUiThread(
                token, videoId, leftCss, topCss, widthCss, heightCss, radiusCss, viewportWidthCss));
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
            destroyPlayer();
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createOnUiThread(String token, String videoId,
                                  double leftCss, double topCss,
                                  double widthCss, double heightCss,
                                  double radiusCss, double viewportWidthCss) {
        destroyPlayer();

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
        player.setWebViewClient(new WebViewClient());
        player.addJavascriptInterface(new PlayerEvents(token), PLAYER_EVENTS_INTERFACE);

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
        root.addView(player, params);
        player.bringToFront();

        activeToken = token;
        playerWebView = player;
        player.loadDataWithBaseURL(
                MOVIE_HUB_BASE_URL,
                buildPlayerHtml(videoId),
                "text/html",
                "UTF-8",
                null);
    }

    private String buildPlayerHtml(String videoId) {
        String safeVideoId = JSONObject.quote(videoId);
        return "<!doctype html><html><head>"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1\">"
                + "<style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:#000}iframe{width:100%!important;height:100%!important;border:0}</style>"
                + "</head><body><div id=\"player\"></div>"
                + "<script src=\"https://www.youtube.com/iframe_api\"></script><script>"
                + "let player=null;"
                + "window.onYouTubeIframeAPIReady=function(){"
                + "player=new YT.Player('player',{videoId:" + safeVideoId + ",playerVars:{autoplay:0,mute:1,controls:0,disablekb:1,fs:0,iv_load_policy:3,playsinline:1,rel:0,origin:'https://movie-hub-62459.web.app'},events:{"
                + "onReady:function(e){try{e.target.mute();e.target.setVolume(100);}catch(_){}MovieHubHeroTrailerEvents.ready();},"
                + "onStateChange:function(e){if(e.data===YT.PlayerState.PLAYING){let muted=true;try{muted=e.target.isMuted();}catch(_){}MovieHubHeroTrailerEvents.playing(muted);}else if(e.data===YT.PlayerState.ENDED){MovieHubHeroTrailerEvents.ended();}},"
                + "onError:function(e){MovieHubHeroTrailerEvents.error(String(e&&e.data!=null?e.data:'?'));},"
                + "onAutoplayBlocked:function(){MovieHubHeroTrailerEvents.error('autoplay-blocked');}"
                + "}});};"
                + "window.movieHubPlay=function(){try{player&&player.playVideo();}catch(_){}};"
                + "window.movieHubSetMuted=function(m){try{if(!player)return;if(m){player.mute();}else{player.unMute();player.setVolume(100);player.playVideo();}}catch(_){}};"
                + "</script></body></html>";
    }

    private final class PlayerEvents {
        private final String token;

        PlayerEvents(String token) {
            this.token = token;
        }

        @JavascriptInterface
        public void ready() {
            activity.runOnUiThread(() -> notifyHost(token, "ready", true, ""));
        }

        @JavascriptInterface
        public void playing(boolean muted) {
            activity.runOnUiThread(() -> {
                if (!matches(token) || playerWebView == null) return;
                playerWebView.setAlpha(1f);
                notifyHost(token, "playing", muted, "");
            });
        }

        @JavascriptInterface
        public void ended() {
            activity.runOnUiThread(() -> {
                if (!matches(token)) return;
                notifyHost(token, "ended", true, "");
                destroyPlayer();
            });
        }

        @JavascriptInterface
        public void error(String code) {
            activity.runOnUiThread(() -> {
                if (!matches(token)) return;
                notifyHost(token, "error", true, code == null ? "?" : code);
                destroyPlayer();
            });
        }
    }

    private void notifyHost(String token, String type, boolean muted, String detail) {
        if (hostWebView == null) return;
        String script = "window.__movieHubNativeHeroTrailerEvent && window.__movieHubNativeHeroTrailerEvent("
                + JSONObject.quote(token) + ","
                + JSONObject.quote(type) + ","
                + (muted ? "true" : "false") + ","
                + JSONObject.quote(detail == null ? "" : detail) + ")";
        hostWebView.evaluateJavascript(script, null);
    }

    private void destroyPlayer() {
        if (playerWebView != null) {
            try {
                ViewGroup parent = (ViewGroup) playerWebView.getParent();
                if (parent != null) parent.removeView(playerWebView);
            } catch (RuntimeException ignored) {
                // Overlay teardown must never affect Movie Hub itself.
            }
            playerWebView.removeJavascriptInterface(PLAYER_EVENTS_INTERFACE);
            playerWebView.stopLoading();
            playerWebView.loadUrl("about:blank");
            playerWebView.destroy();
            playerWebView = null;
        }
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
