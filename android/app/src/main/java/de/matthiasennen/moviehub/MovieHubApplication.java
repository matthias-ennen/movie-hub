package de.matthiasennen.moviehub;

import android.app.Application;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;

/** Starts Movie Hub's one-shot native startup branding and jingle per app process. */
public final class MovieHubApplication extends Application {
    private static final long STARTUP_JINGLE_DELAY_MS = 1_000L;

    private MediaPlayer startupJingle;

    @Override
    public void onCreate() {
        super.onCreate();
        StartupIntroOverlay.register(this);
        new Handler(Looper.getMainLooper()).postDelayed(
                this::playStartupJingle,
                STARTUP_JINGLE_DELAY_MS);
    }

    private void playStartupJingle() {
        try {
            startupJingle = MediaPlayer.create(this, R.raw.start);
            if (startupJingle == null) {
                return;
            }
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
        if (startupJingle == null) {
            return;
        }
        try {
            startupJingle.release();
        } catch (RuntimeException ignored) {
            // Startup branding is optional; the app must never fail because of audio.
        }
        startupJingle = null;
    }
}
