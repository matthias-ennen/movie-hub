package de.matthiasennen.moviehub;

import android.webkit.JavascriptInterface;

import java.util.regex.Pattern;

/** Narrow JavaScript bridge that only opens Movie Hub's native full-screen trailer player. */
public final class HeroTrailerLaunchBridge {
    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{6,20}$");
    private static final Pattern REQUEST_ID = Pattern.compile("^[A-Za-z0-9._:-]{1,128}$");
    private final MainActivity activity;

    public HeroTrailerLaunchBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void playHeroTrailer(String rawVideoId, String rawTitle, boolean soundEnabled) {
        play(rawVideoId, rawTitle, soundEnabled, "");
    }

    @JavascriptInterface
    public void playHeroTrailerWithResult(
            String rawVideoId,
            String rawTitle,
            boolean soundEnabled,
            String rawRequestId) {
        play(rawVideoId, rawTitle, soundEnabled, rawRequestId);
    }

    @JavascriptInterface
    public void acknowledgeHeroTrailerResult(String rawRequestId) {
        final String requestId = rawRequestId == null ? "" : rawRequestId.trim();
        if (!REQUEST_ID.matcher(requestId).matches()) return;
        activity.acknowledgeHeroTrailerResult(requestId);
    }

    private void play(
            String rawVideoId,
            String rawTitle,
            boolean soundEnabled,
            String rawRequestId) {
        final String videoId = rawVideoId == null ? "" : rawVideoId.trim();
        if (!VIDEO_ID.matcher(videoId).matches()) return;

        final String title = rawTitle == null || rawTitle.trim().isEmpty()
                ? "Trailer"
                : rawTitle.trim();
        final String candidateRequestId = rawRequestId == null ? "" : rawRequestId.trim();
        final String requestId = REQUEST_ID.matcher(candidateRequestId).matches()
                ? candidateRequestId
                : "";

        activity.runOnUiThread(() -> activity.launchHeroTrailer(
                videoId,
                title,
                soundEnabled,
                requestId));
    }
}
