package de.matthiasennen.moviehub;

import android.app.Application;
import android.media.MediaPlayer;

/** Starts Movie Hub's one-shot native startup branding and jingle per app process. */
public final class MovieHubApplication extends Application {
    private MediaPlayer startupJingle;

    @Override
    public void onCreate() {
        super.onCreate();
        StartupIntroOverlay.register(this);
        playStartupJingle();
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
