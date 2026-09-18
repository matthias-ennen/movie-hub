package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;

import java.util.regex.Pattern;

/** Full-screen trailer player using YouTube's official iframe player as the primary content. */
public final class TrailerPlayerActivity extends ComponentActivity {
    public static final String EXTRA_VIDEO_ID = "movie_hub_trailer_video_id";
    public static final String EXTRA_TITLE = "movie_hub_trailer_title";
    public static final String EXTRA_SOUND_ENABLED = "movie_hub_trailer_sound_enabled";

    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{6,20}$");
    private static final float SWIPE_CLOSE_SCREEN_FRACTION = 0.25f;
    private static final float SWIPE_HORIZONTAL_DOMINANCE = 1.4f;

    private WebView playerWebView;
    private TextView statusView;
    private float touchStartX;
    private float touchStartY;
    private boolean touchTracking;
    private PlayerCrtTransition crtTransition;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String rawVideoId = getIntent().getStringExtra(EXTRA_VIDEO_ID);
        String videoId = rawVideoId == null ? "" : rawVideoId.trim();
        boolean soundEnabled = getIntent().getBooleanExtra(EXTRA_SOUND_ENABLED, false);

        createContent();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                requestClose();
            }
        });

        if (!VIDEO_ID.matcher(videoId).matches()) {
            showStatus("Der Trailer-Link ist ungültig.");
            return;
        }

        crtTransition.runWhenVisible(() -> startYouTubePlayer(videoId, soundEnabled));
    }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    private void createContent() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerWebView = new WebView(this);
        playerWebView.setBackgroundColor(Color.BLACK);
        playerWebView.getSettings().setJavaScriptEnabled(true);
        playerWebView.getSettings().setDomStorageEnabled(true);
        playerWebView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        playerWebView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        playerWebView.getSettings().setSupportMultipleWindows(false);
        playerWebView.setWebChromeClient(new WebChromeClient());
        playerWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showStatus("Der Trailer konnte nicht geladen werden.");
                }
            }
        });
        playerWebView.addJavascriptInterface(new TrailerEvents(), "MovieHubTrailerEvents");
        playerWebView.setOnTouchListener((view, event) -> handlePlayerTouch(event));
        root.addView(playerWebView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // Nur während Laden/Fehler sichtbar. Sobald YouTube bereit ist, bleibt
        // ausschließlich der YouTube-Player mit seinen eigenen Controls sichtbar.
        statusView = new TextView(this);
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(18);
        statusView.setGravity(android.view.Gravity.CENTER);
        statusView.setBackgroundColor(Color.argb(190, 9, 10, 16));
        statusView.setPadding(dp(24), dp(18), dp(24), dp(18));
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                android.view.Gravity.CENTER);
        statusParams.setMargins(dp(48), 0, dp(48), 0);
        root.addView(statusView, statusParams);
        statusView.setVisibility(View.GONE);

        crtTransition = PlayerCrtTransition.install(this, root, this::finishImmediately);
    }

    private boolean handlePlayerTouch(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                touchStartX = event.getX();
                touchStartY = event.getY();
                touchTracking = true;
                return false;

            case MotionEvent.ACTION_CANCEL:
                touchTracking = false;
                return false;

            case MotionEvent.ACTION_UP:
                if (!touchTracking) return false;
                touchTracking = false;

                float deltaX = event.getX() - touchStartX;
                float deltaY = event.getY() - touchStartY;
                float horizontal = Math.abs(deltaX);
                float vertical = Math.abs(deltaY);
                float width = playerWebView == null ? 0f : playerWebView.getWidth();
                float threshold = Math.max(dp(120), width * SWIPE_CLOSE_SCREEN_FRACTION);

                if (horizontal >= threshold
                        && horizontal > vertical * SWIPE_HORIZONTAL_DOMINANCE) {
                    requestClose();
                    return true;
                }
                return false;

            default:
                return false;
        }
    }

    private void startYouTubePlayer(String videoId, boolean soundEnabled) {
        showStatus("Trailer wird geladen …");
        String html = buildPlayerHtml(videoId, soundEnabled);
        playerWebView.loadDataWithBaseURL(
                "https://movie-hub-62459.web.app/",
                html,
                "text/html",
                "UTF-8",
                null);
    }

    private String buildPlayerHtml(String videoId, boolean soundEnabled) {
        String soundLiteral = soundEnabled ? "true" : "false";
        return "<!doctype html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'>"
                + "<style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:#000;}"
                + "iframe{width:100%!important;height:100%!important;border:0;}</style></head>"
                + "<body><div id='player'></div><script>"
                + "const wantSound=" + soundLiteral + ";let p=null;let fallbackTried=false;"
                + "function mhError(c){try{MovieHubTrailerEvents.error(String(c));}catch(e){}}"
                + "function tryPlay(){try{if(!p)return;if(wantSound){p.unMute();p.setVolume(100);}else{p.mute();}p.playVideo();}catch(e){mhError('play');}}"
                + "window.onYouTubeIframeAPIReady=function(){p=new YT.Player('player',{videoId:'" + videoId + "',"
                + "playerVars:{autoplay:1,controls:1,disablekb:0,fs:1,iv_load_policy:3,playsinline:1,rel:0,origin:'https://movie-hub-62459.web.app'},"
                + "events:{onReady:function(e){try{MovieHubTrailerEvents.ready();}catch(x){}tryPlay();},"
                + "onStateChange:function(e){if(e.data===YT.PlayerState.ENDED){try{MovieHubTrailerEvents.ended();}catch(x){}}},"
                + "onError:function(e){mhError(e&&e.data!=null?e.data:'youtube');},"
                + "onAutoplayBlocked:function(){if(fallbackTried)return;fallbackTried=true;try{p.mute();p.playVideo();}catch(e){mhError('autoplay');}}}});};"
                + "const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';"
                + "s.onerror=function(){mhError('iframe-api');};document.head.appendChild(s);"
                + "</script></body></html>";
    }

    private final class TrailerEvents {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> statusView.setVisibility(View.GONE));
        }

        @JavascriptInterface
        public void ended() {
            runOnUiThread(() -> requestClose());
        }

        @JavascriptInterface
        public void error(String code) {
            runOnUiThread(() -> showStatus(
                    "Der YouTube-Trailer konnte nicht abgespielt werden. Fehler: " + code));
        }
    }

    private void showStatus(String message) {
        statusView.setText(message);
        statusView.setVisibility(View.VISIBLE);
    }

    private void requestClose() {
        if (playerWebView != null) {
            playerWebView.evaluateJavascript(
                    "try{if(p)p.pauseVideo();}catch(e){}",
                    null);
        }
        if (crtTransition == null) {
            finishImmediately();
            return;
        }
        crtTransition.requestClose();
    }

    private void finishImmediately() {
        super.finish();
        overridePendingTransition(0, 0);
    }

    @Override
    protected void onPause() {
        if (playerWebView != null) {
            playerWebView.onPause();
            playerWebView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (playerWebView != null) {
            playerWebView.onResume();
            playerWebView.resumeTimers();
        }
        hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        if (crtTransition != null) crtTransition.destroy();
        if (playerWebView != null) {
            playerWebView.loadUrl("about:blank");
            playerWebView.removeJavascriptInterface("MovieHubTrailerEvents");
            playerWebView.setWebChromeClient(null);
            playerWebView.setWebViewClient(null);
            playerWebView.destroy();
            playerWebView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
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
}
