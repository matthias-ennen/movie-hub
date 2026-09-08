package de.matthiasennen.moviehub;

import android.app.Application;
import android.media.MediaPlayer;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/** Plays the Movie Hub brand jingle once when the Android app process starts. */
public final class MovieHubApplication extends Application {
    private static final String[] JINGLE_ASSET_PARTS = {
            "jingle/movie_hub_jingle_00.b64",
            "jingle/movie_hub_jingle_01.b64",
            "jingle/movie_hub_jingle_02.b64",
            "jingle/movie_hub_jingle_03.b64",
            "jingle/movie_hub_jingle_04.b64"
    };

    private MediaPlayer startupJingle;

    @Override
    public void onCreate() {
        super.onCreate();
        playStartupJingle();
    }

    private void playStartupJingle() {
        try {
            File audioFile = ensureJingleFile();
            startupJingle = new MediaPlayer();
            startupJingle.setDataSource(audioFile.getAbsolutePath());
            startupJingle.setOnPreparedListener(MediaPlayer::start);
            startupJingle.setOnCompletionListener(player -> releaseStartupJingle());
            startupJingle.setOnErrorListener((player, what, extra) -> {
                releaseStartupJingle();
                return true;
            });
            startupJingle.prepareAsync();
        } catch (IOException | RuntimeException ignored) {
            releaseStartupJingle();
        }
    }

    private File ensureJingleFile() throws IOException {
        File audioFile = new File(getCacheDir(), "movie_hub_startup_jingle.mp3");
        if (audioFile.exists() && audioFile.length() > 0) {
            return audioFile;
        }

        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        for (String assetPart : JINGLE_ASSET_PARTS) {
            try (InputStream in = getAssets().open(assetPart)) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    encoded.write(buffer, 0, read);
                }
            }
        }

        byte[] audio = Base64.decode(encoded.toByteArray(), Base64.DEFAULT);
        try (FileOutputStream out = new FileOutputStream(audioFile)) {
            out.write(audio);
        }
        return audioFile;
    }

    private void releaseStartupJingle() {
        if (startupJingle == null) {
            return;
        }
        try {
            startupJingle.release();
        } catch (RuntimeException ignored) {
            // The optional jingle must never be able to break app startup.
        }
        startupJingle = null;
    }
}
