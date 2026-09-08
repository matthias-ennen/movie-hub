package de.matthiasennen.moviehub;

import android.app.Application;
import android.media.MediaPlayer;

/** Plays the Movie Hub brand jingle once when the Android app process starts. */
public final class MovieHubApplication extends Application {
    private MediaPlayer startupJingle;

    @Override
    public void onCreate() {
        super.onCreate();
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
            // The jingle is optional; app startup must never fail because of audio.
        }
        startupJingle = null;
    }
}
