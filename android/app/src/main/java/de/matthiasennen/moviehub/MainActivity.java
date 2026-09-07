package de.matthiasennen.moviehub;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
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

/**
 * Thin Fire TV/Android shell. Movie Hub itself stays deployed on Firebase, so
 * catalog and UI updates do not require installing a new APK.
 */
public final class MainActivity extends Activity {
    private static final String APP_URL = "https://movie-hub-62459.web.app/";

    private FrameLayout container;
    private WebView webView;
    private View offlineView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        createContent();
        loadMovieHub();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createContent() {
        container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(9, 10, 16));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(9, 10, 16));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
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
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
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

    private final class MovieHubWebViewClient extends WebViewClient {
        @Override
        public void onReceivedError(WebView view, WebResourceRequest request,
                                    WebResourceError error) {
            if (request.isForMainFrame()) {
                showOfflineView();
            }
        }
    }
}
