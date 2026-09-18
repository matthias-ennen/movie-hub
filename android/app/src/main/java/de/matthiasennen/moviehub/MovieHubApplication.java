package de.matthiasennen.moviehub;

import android.app.Activity;
import android.app.Application;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

/** Starts Movie Hub's one-shot native startup branding and jingle per app process. */
public final class MovieHubApplication extends Application {
    private static final long STARTUP_JINGLE_DELAY_MS = 1_000L;

    private MediaPlayer startupJingle;

    @Override
    public void onCreate() {
        super.onCreate();
        StartupIntroOverlay.register(this);
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                installMainWebViewSupport(activity);
            }

            @Override
            public void onActivityStarted(Activity activity) {
                installMainWebViewSupport(activity);
            }

            @Override
            public void onActivityResumed(Activity activity) {
                installMainWebViewSupport(activity);
            }

            @Override public void onActivityPaused(Activity activity) { }
            @Override public void onActivityStopped(Activity activity) { }
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) { }
            @Override public void onActivityDestroyed(Activity activity) { }
        });
        new Handler(Looper.getMainLooper()).postDelayed(
                this::playStartupJingle,
                STARTUP_JINGLE_DELAY_MS);
    }

    private void installMainWebViewSupport(Activity activity) {
        if (!(activity instanceof MainActivity)) return;
        View root = activity.getWindow() == null ? null : activity.getWindow().getDecorView();
        installMainWebViewSupportRecursive(activity, root);
    }

    private void installMainWebViewSupportRecursive(Activity activity, View view) {
        if (view instanceof WebView) {
            WebView webView = (WebView) view;
            webView.setWebChromeClient(new WebChromeClient());
            webView.addJavascriptInterface(
                    new HeroTrailerLaunchBridge((MainActivity) activity),
                    "MovieHubTrailer");
            return;
        }
        if (!(view instanceof ViewGroup)) return;
        ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index += 1) {
            installMainWebViewSupportRecursive(activity, group.getChildAt(index));
        }
    }

    private void playStartupJingle() {
        try {
            startupJingle = MediaPlayer.create(this, R.raw.start);
            if (startupJingle == null) return;
            startupJingle.setOnCompletionListener(player -> releaseStartupJingle());
            startupJingle.setOnErrorListener((player, what, extra) -> {
                releaseStartupJingle();
                return true;
            });
            startupJingle.start();
        } catch (RuntimeException ignored) {
            releaseStartupJingle();
        }
    }

    private void releaseStartupJingle() {
        if (startupJingle == null) return;
        try {
            startupJingle.release();
        } catch (RuntimeException ignored) {
            // Startup branding is optional; the app must never fail because of audio.
        }
        startupJingle = null;
    }
}
