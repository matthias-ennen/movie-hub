package de.matthiasennen.moviehub;

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;

import java.util.regex.Pattern;

/** Narrow JavaScript bridge that only opens Movie Hub's native full-screen trailer player. */
public final class HeroTrailerLaunchBridge {
    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{6,20}$");
    private final Activity activity;

    public HeroTrailerLaunchBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void playHeroTrailer(String rawVideoId, String rawTitle, boolean soundEnabled) {
        final String videoId = rawVideoId == null ? "" : rawVideoId.trim();
        if (!VIDEO_ID.matcher(videoId).matches()) return;

        final String title = rawTitle == null || rawTitle.trim().isEmpty()
                ? "Trailer"
                : rawTitle.trim();

        activity.runOnUiThread(() -> {
            Intent intent = new Intent(activity, TrailerPlayerActivity.class);
            intent.putExtra(TrailerPlayerActivity.EXTRA_VIDEO_ID, videoId);
            intent.putExtra(TrailerPlayerActivity.EXTRA_TITLE, title);
            intent.putExtra(TrailerPlayerActivity.EXTRA_SOUND_ENABLED, soundEnabled);
            activity.startActivity(intent);
        });
    }
}
