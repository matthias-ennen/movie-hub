package de.matthiasennen.moviehub;

/** Tracks official IFrame API state transitions, without any video or account identifiers. */
final class TrailerPlaybackSession {
    static final int UNSTARTED = -1;
    static final int ENDED = 0;
    static final int PLAYING = 1;
    static final int PAUSED = 2;
    static final int BUFFERING = 3;
    static final int CUED = 5;
    static final long WAIT_TIMEOUT_MS = 30_000L;

    private final long startedAt;
    private int state = UNSTARTED;
    private long firstPlayingAt = -1;
    private long rebufferStartedAt = -1;
    private long rebufferTotalMs;
    private int rebufferCount;
    private boolean manualStart;

    TrailerPlaybackSession(long startedAt) {
        this.startedAt = startedAt;
    }

    boolean updateState(int next, long now) {
        if (next == state) return false;
        if (next != UNSTARTED && next != ENDED && next != PLAYING && next != PAUSED
                && next != BUFFERING && next != CUED) return false;
        finishRebuffer(now);
        state = next;
        if (next == PLAYING) {
            if (firstPlayingAt < 0) firstPlayingAt = now;
            manualStart = false;
        } else if (next == BUFFERING) {
            manualStart = false;
            if (firstPlayingAt >= 0) {
                rebufferStartedAt = now;
                rebufferCount++;
            }
        }
        return true;
    }

    void autoplayBlocked() { if (firstPlayingAt < 0) manualStart = true; }

    boolean isWaiting() {
        // A user can initiate playback using the unobscured official player after a block.
        return !manualStart && (state == BUFFERING || (firstPlayingAt < 0
                && (state == UNSTARTED || state == CUED)));
    }

    long startupMs() { return firstPlayingAt < 0 ? -1 : firstPlayingAt - startedAt; }
    int rebufferCount() { return rebufferCount; }
    long rebufferMs(long now) {
        return rebufferTotalMs + (rebufferStartedAt < 0 ? 0 : Math.max(0, now - rebufferStartedAt));
    }

    void finishRebuffer(long now) {
        if (rebufferStartedAt >= 0) {
            rebufferTotalMs += Math.max(0, now - rebufferStartedAt);
            rebufferStartedAt = -1;
        }
    }
}
