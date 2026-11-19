package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Button;
import android.widget.LinearLayout;
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
    public static final String EXTRA_REQUEST_ID = "movie_hub_trailer_request_id";
    public static final String EXTRA_OUTCOME = "movie_hub_trailer_outcome";

    private static final String OUTCOME_COMPLETED = "completed";
    private static final String OUTCOME_DISMISSED = "dismissed";
    private static final String OUTCOME_ERROR = "error";

    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{6,20}$");
    private static final float SWIPE_CLOSE_SCREEN_FRACTION = 0.25f;
    private static final float SWIPE_HORIZONTAL_DOMINANCE = 1.4f;
    private static final String LOG_TAG = "MovieHubTrailer";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable waitTimeout;

    private WebView playerWebView;
    private TextView statusView;
    private LinearLayout statusPanel;
    private Button closeButton;
    private TrailerPlaybackSession playback;
    private boolean ready;
    private boolean startRequested;
    private boolean failed;
    private boolean closing;
    private boolean resumed;
    private float touchStartX;
    private float touchStartY;
    private boolean touchTracking;
    private PlayerCrtTransition crtTransition;
    private String requestId = "";
    private String outcome = OUTCOME_DISMISSED;
    private boolean resultDelivered;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String rawVideoId = getIntent().getStringExtra(EXTRA_VIDEO_ID);
        String videoId = rawVideoId == null ? "" : rawVideoId.trim();
        boolean soundEnabled = getIntent().getBooleanExtra(EXTRA_SOUND_ENABLED, false);
        String rawRequestId = getIntent().getStringExtra(EXTRA_REQUEST_ID);
        requestId = rawRequestId == null ? "" : rawRequestId;

        createContent();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                requestClose();
            }
        });

        if (!VIDEO_ID.matcher(videoId).matches()) {
            showFailure("Der Trailer-Link ist ungültig.");
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
        playerWebView.setFocusable(true);
        playerWebView.setFocusableInTouchMode(true);
        playerWebView.setOnFocusChangeListener((view, hasFocus) -> {
            if (hasFocus) focusYouTubeFrame();
        });
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
                    showFailure("Der Trailer konnte nicht geladen werden. Bitte erneut versuchen.");
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                destroyPlayerWebView();
                showFailure("Der Videoplayer wurde beendet. Bitte erneut versuchen.");
                return true;
            }
        });
        playerWebView.addJavascriptInterface(new TrailerEvents(), "MovieHubTrailerEvents");
        playerWebView.setOnTouchListener((view, event) -> handlePlayerTouch(event));
        root.addView(playerWebView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // The official iframe owns its controls and buffering UI. This native panel
        // is only shown INSTEAD of the player in a terminal error state.
        statusPanel = new LinearLayout(this);
        statusPanel.setOrientation(LinearLayout.VERTICAL);
        statusPanel.setGravity(android.view.Gravity.CENTER);
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
        statusPanel.addView(statusView);
        closeButton = new Button(this);
        closeButton.setText("Schließen");
        closeButton.setOnClickListener(view -> requestClose());
        statusPanel.addView(closeButton);
        root.addView(statusPanel, statusParams);
        statusPanel.setVisibility(View.GONE);

        crtTransition = PlayerCrtTransition.install(this, root, this::finishImmediately);
        playerWebView.requestFocus();
    }

    /** The WebView and the iframe are two different focus scopes. Do not reset an
     * already-focused frame: its own selected control must remain selected. */
    private void focusYouTubeFrame() {
        if (canHandleEvents() && ready && resumed && playerWebView.hasFocus()) {
            playerWebView.evaluateJavascript("mhFocus()", null);
        }
    }

    private void restorePlayerFocus() {
        if (!canHandleEvents() || !ready || !resumed) return;
        if (!playerWebView.hasFocus()) playerWebView.requestFocus();
        else focusYouTubeFrame();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!canHandleEvents() || !ready || !resumed) return super.dispatchKeyEvent(event);
        int key = event.getKeyCode();
        String command = TrailerRemoteInput.transportCommand(key);
        if (command != null && (event.getAction() == KeyEvent.ACTION_DOWN
                || event.getAction() == KeyEvent.ACTION_UP)) {
            // Consume down and up to avoid double actions in the YouTube iframe.
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                // OK always toggles playback, even if YouTube moved focus to another control.
                if (key == KeyEvent.KEYCODE_DPAD_CENTER) restorePlayerFocus();
                playerWebView.evaluateJavascript("mhRemote('" + command + "')", null);
            }
            return true;
        }
        if (PlayerRemoteWakeState.isNavigationKey(key)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                restorePlayerFocus();
            }
        }
        return super.dispatchKeyEvent(event);
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
        if (closing || failed || playerWebView == null) return;
        playback = new TrailerPlaybackSession(SystemClock.elapsedRealtime());
        updateWaitTimeout();
        String html = buildPlayerHtml(videoId, soundEnabled);
        playerWebView.loadDataWithBaseURL(
                "https://movie-hub-62459.web.app/",
                html,
                "text/html",
                "UTF-8",
                null);
    }

    static String buildPlayerHtml(String videoId, boolean soundEnabled) {
        String soundLiteral = soundEnabled ? "true" : "false";
        return "<!doctype html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'>"
                + "<style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:#000;}"
                + "iframe{width:100%!important;height:100%!important;border:0;}</style></head>"
                + "<body><div id='player' style='display:grid;place-items:center;color:white;font:18px sans-serif'>Trailer wird geladen …</div><script>"
                + "const wantSound=" + soundLiteral + ";let p=null;let startIssued=false;"
                + "function mhError(c){try{MovieHubTrailerEvents.error(String(c));}catch(e){}}"
                + "function mhStart(){try{if(!p||startIssued)return;startIssued=true;if(wantSound){p.unMute();p.setVolume(100);}else{p.mute();}p.playVideo();}catch(e){mhError('play');}}"
                + "function mhPause(){try{if(p&&startIssued)p.pauseVideo();}catch(e){}}"
                + "function mhFocus(){try{if(p){const f=p.getIframe();if(f&&document.activeElement!==f){f.focus();}}}catch(e){}}"
                + "function mhRemote(c){try{if(!p||!startIssued)return;"
                + "if(c==='toggle'){const s=p.getPlayerState();if(s===1||s===3){p.pauseVideo();}else{p.playVideo();}}"
                + "else if(c==='play'){p.playVideo();}else if(c==='pause'){p.pauseVideo();}"
                + "else if(c==='forward'||c==='rewind'){const t=p.getCurrentTime(),d=p.getDuration();"
                + "if(Number.isFinite(t)&&Number.isFinite(d)&&d>0){p.seekTo(Math.max(0,Math.min(d,t+(c==='forward'?10:-10))),true);}}"
                + "}catch(e){}}"
                + "function mhState(e){let fraction=-1,position=-1;try{fraction=e.target.getVideoLoadedFraction();position=e.target.getCurrentTime();}catch(x){}try{MovieHubTrailerEvents.stateChanged(e.data,Number.isFinite(fraction)?fraction:-1,Number.isFinite(position)?position:-1);}catch(x){}}"
                + "window.onYouTubeIframeAPIReady=function(){p=new YT.Player('player',{videoId:'" + videoId + "',"
                + "playerVars:{autoplay:0,controls:1,disablekb:0,fs:1,iv_load_policy:3,playsinline:1,rel:0,origin:'https://movie-hub-62459.web.app'},"
                + "events:{onReady:function(e){try{MovieHubTrailerEvents.ready();}catch(x){}},"
                + "onStateChange:mhState,"
                + "onError:function(e){mhError(e&&e.data!=null?e.data:'youtube');},"
                + "onAutoplayBlocked:function(){try{MovieHubTrailerEvents.autoplayBlocked();}catch(x){}}}});};"
                + "const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';"
                + "s.onerror=function(){mhError('iframe-api');};document.head.appendChild(s);"
                + "</script></body></html>";
    }

    private final class TrailerEvents {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                if (!canHandleEvents() || ready) return;
                ready = true;
                Log.i(LOG_TAG, "iframe ready; waiting for actual playback");
                restorePlayerFocus();
                maybeStartPlayback();
            });
        }

        @JavascriptInterface
        public void stateChanged(int state, double loadedFraction, double positionSeconds) {
            runOnUiThread(() -> {
                if (!canHandleEvents() || !playback.updateState(state, SystemClock.elapsedRealtime())) return;
                Log.i(LOG_TAG, "state=" + state + " loadedFraction=" + loadedFraction
                        + " positionSeconds=" + positionSeconds + " startupMs=" + playback.startupMs());
                updateWaitTimeout();
                if (state == TrailerPlaybackSession.ENDED) {
                    outcome = OUTCOME_COMPLETED;
                    requestClose();
                }
            });
        }

        @JavascriptInterface
        public void autoplayBlocked() {
            runOnUiThread(() -> {
                if (!canHandleEvents()) return;
                playback.autoplayBlocked();
                updateWaitTimeout();
                // Keep YouTube's Play button available; do not silently change the sound preference.
                Log.i(LOG_TAG, "autoplay blocked; manual start available");
                restorePlayerFocus();
            });
        }

        @JavascriptInterface
        public void error(String code) {
            runOnUiThread(() -> {
                if (!canHandleEvents()) return;
                String safeCode = code != null && code.matches("[a-z0-9-]{1,20}") ? code : "youtube";
                showFailure("Der YouTube-Trailer konnte nicht abgespielt werden. Fehler: " + safeCode);
            });
        }
    }

    private boolean canHandleEvents() {
        return !closing && !failed && playback != null && playerWebView != null;
    }

    private void maybeStartPlayback() {
        if (!canHandleEvents() || !resumed || !ready || startRequested) return;
        startRequested = true;
        playerWebView.evaluateJavascript("mhStart()", null);
    }

    private void updateWaitTimeout() {
        if (!canHandleEvents() || !resumed || !playback.isWaiting()) {
            clearWaitTimeout();
            return;
        }
        if (waitTimeout != null) return;
        waitTimeout = () -> {
            waitTimeout = null;
            if (canHandleEvents() && resumed && playback.isWaiting()) {
                showFailure("Der Trailer lädt zu lange. Bitte die Verbindung prüfen und erneut versuchen.");
            }
        };
        handler.postDelayed(waitTimeout, TrailerPlaybackSession.WAIT_TIMEOUT_MS);
    }

    private void clearWaitTimeout() {
        if (waitTimeout != null) handler.removeCallbacks(waitTimeout);
        waitTimeout = null;
    }

    private void logSummary() {
        if (playback == null) return;
        long now = SystemClock.elapsedRealtime();
        playback.finishRebuffer(now);
        Log.i(LOG_TAG, "outcome=" + outcome + " startupMs=" + playback.startupMs()
                + " rebufferCount=" + playback.rebufferCount() + " rebufferMs=" + playback.rebufferMs(now));
    }

    private void showFailure(String message) {
        if (closing || failed) return;
        failed = true;
        outcome = OUTCOME_ERROR;
        clearWaitTimeout();
        if (playerWebView != null) {
            playerWebView.evaluateJavascript("try{mhPause();}catch(e){}", null);
            playerWebView.stopLoading();
            playerWebView.loadUrl("about:blank");
            playerWebView.setVisibility(View.GONE);
        }
        statusView.setText(message);
        statusPanel.setVisibility(View.VISIBLE);
        closeButton.requestFocus();
    }

    private void requestClose() {
        if (closing) return;
        closing = true;
        clearWaitTimeout();
        logSummary();
        if (playerWebView != null) {
            playerWebView.evaluateJavascript(
                    "try{mhPause();}catch(e){}",
                    null);
        }
        if (crtTransition == null) {
            finishImmediately();
            return;
        }
        crtTransition.requestClose();
    }

    private void finishImmediately() {
        if (resultDelivered) return;
        resultDelivered = true;
        Intent result = new Intent();
        result.putExtra(EXTRA_REQUEST_ID, requestId);
        result.putExtra(EXTRA_OUTCOME, outcome);
        setResult(RESULT_OK, result);
        super.finish();
        overridePendingTransition(0, 0);
    }

    @Override
    protected void onPause() {
        resumed = false;
        clearWaitTimeout();
        if (playerWebView != null) {
            if (startRequested) playerWebView.evaluateJavascript("try{mhPause();}catch(e){}", null);
            playerWebView.onPause();
            playerWebView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (playerWebView != null) {
            playerWebView.onResume();
            playerWebView.resumeTimers();
        }
        maybeStartPlayback();
        restorePlayerFocus();
        updateWaitTimeout();
        hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        closing = true;
        clearWaitTimeout();
        if (crtTransition != null) crtTransition.destroy();
        destroyPlayerWebView();
        super.onDestroy();
    }

    private void destroyPlayerWebView() {
        if (playerWebView == null) return;
        WebView view = playerWebView;
        playerWebView = null;
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.removeJavascriptInterface("MovieHubTrailerEvents");
        view.setWebChromeClient(null);
        view.setWebViewClient(null);
        view.destroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
            restorePlayerFocus();
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
}
