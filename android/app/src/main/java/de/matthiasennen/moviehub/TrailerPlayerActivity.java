package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;

import java.util.regex.Pattern;

/** Full-screen Movie-Hub trailer player using YouTube's official iframe player as the primary content. */
public final class TrailerPlayerActivity extends ComponentActivity {
    public static final String EXTRA_VIDEO_ID = "movie_hub_trailer_video_id";
    public static final String EXTRA_TITLE = "movie_hub_trailer_title";
    public static final String EXTRA_SOUND_ENABLED = "movie_hub_trailer_sound_enabled";

    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{6,20}$");
    private static final int MOVIE_HUB_BLUE = Color.rgb(141, 167, 255);
    private static final long CHROME_HIDE_DELAY_MS = 5_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView playerWebView;
    private TextView titleView;
    private TextView statusView;
    private Button closeButton;
    private Runnable hideChromeRunnable;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String rawVideoId = getIntent().getStringExtra(EXTRA_VIDEO_ID);
        String videoId = rawVideoId == null ? "" : rawVideoId.trim();
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        boolean soundEnabled = getIntent().getBooleanExtra(EXTRA_SOUND_ENABLED, false);

        createContent(title);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });

        if (!VIDEO_ID.matcher(videoId).matches()) {
            showStatus("Der Trailer-Link ist ungültig.");
            return;
        }

        startYouTubePlayer(videoId, soundEnabled);
    }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    private void createContent(String rawTitle) {
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
        playerWebView.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) showChromeTemporarily();
            return false;
        });
        playerWebView.setOnKeyListener((view, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN) showChromeTemporarily();
            return false;
        });
        root.addView(playerWebView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        titleView = new TextView(this);
        String title = rawTitle == null || rawTitle.trim().isEmpty() ? "Trailer" : rawTitle.trim();
        SpannableString titleText = new SpannableString("Movie Hub · " + title);
        titleText.setSpan(new ForegroundColorSpan(MOVIE_HUB_BLUE), 6, 9,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        titleView.setText(titleText);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(18);
        titleView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        titleView.setPadding(dp(22), dp(14), dp(22), dp(14));
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.START);
        root.addView(titleView, titleParams);

        closeButton = new Button(this);
        closeButton.setText("");
        closeButton.setAllCaps(false);
        closeButton.setGravity(Gravity.CENTER);
        closeButton.setMinWidth(0);
        closeButton.setMinHeight(0);
        closeButton.setPadding(0, 0, 0, 0);
        closeButton.setForeground(new CloseXDrawable(dp(4), dp(12)));
        closeButton.setBackground(makeCloseBackground(false));
        closeButton.setOnFocusChangeListener((view, focused) -> {
            view.setBackground(makeCloseBackground(focused));
            if (focused) showChromeTemporarily();
        });
        closeButton.setOnClickListener(view -> finish());
        closeButton.setContentDescription("Player schließen");
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
                dp(48), dp(48), Gravity.TOP | Gravity.END);
        closeParams.setMargins(dp(12), dp(12), dp(18), dp(12));
        root.addView(closeButton, closeParams);

        statusView = new TextView(this);
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(18);
        statusView.setGravity(Gravity.CENTER);
        statusView.setBackgroundColor(Color.argb(190, 9, 10, 16));
        statusView.setPadding(dp(24), dp(18), dp(24), dp(18));
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER);
        statusParams.setMargins(dp(48), 0, dp(48), 0);
        root.addView(statusView, statusParams);
        statusView.setVisibility(View.GONE);

        setContentView(root);
        showChromeTemporarily();
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
            runOnUiThread(() -> finish());
        }

        @JavascriptInterface
        public void error(String code) {
            runOnUiThread(() -> showStatus("Der YouTube-Trailer konnte nicht abgespielt werden. Fehler: " + code));
        }
    }

    private GradientDrawable makeCloseBackground(boolean focused) {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(Color.TRANSPARENT);
        if (focused) background.setStroke(dp(3), Color.WHITE);
        return background;
    }

    private void showChromeTemporarily() {
        if (titleView != null) titleView.setVisibility(View.VISIBLE);
        if (closeButton != null) closeButton.setVisibility(View.VISIBLE);
        if (hideChromeRunnable != null) handler.removeCallbacks(hideChromeRunnable);
        hideChromeRunnable = () -> {
            if (closeButton != null && closeButton.hasFocus()) return;
            if (titleView != null) titleView.setVisibility(View.GONE);
            if (closeButton != null) closeButton.setVisibility(View.GONE);
        };
        handler.postDelayed(hideChromeRunnable, CHROME_HIDE_DELAY_MS);
    }

    private void showStatus(String message) {
        statusView.setText(message);
        statusView.setVisibility(View.VISIBLE);
        showChromeTemporarily();
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
        if (hideChromeRunnable != null) handler.removeCallbacks(hideChromeRunnable);
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

    private static final class CloseXDrawable extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int inset;

        CloseXDrawable(float strokeWidth, int inset) {
            this.inset = inset;
            paint.setColor(Color.WHITE);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(strokeWidth);
            paint.setStrokeCap(Paint.Cap.ROUND);
        }

        @Override
        public void draw(Canvas canvas) {
            Rect bounds = getBounds();
            float left = bounds.left + inset;
            float top = bounds.top + inset;
            float right = bounds.right - inset;
            float bottom = bounds.bottom - inset;
            canvas.drawLine(left, top, right, bottom, paint);
            canvas.drawLine(right, top, left, bottom, paint);
        }

        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
        @Override public void setColorFilter(@Nullable android.graphics.ColorFilter colorFilter) { paint.setColorFilter(colorFilter); }
        @Override @SuppressWarnings("deprecation") public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
