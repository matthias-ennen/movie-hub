package de.matthiasennen.moviehub;

/** Pure state machine for the native cold-start overlay. */
final class StartupGate {
    private boolean minimumElapsed;
    private boolean contentReady;
    private boolean shutdownStarted;

    boolean onMinimumElapsed() {
        minimumElapsed = true;
        return startIfReady();
    }

    boolean onContentReady() {
        contentReady = true;
        return startIfReady();
    }

    boolean onMaximumElapsed() {
        if (shutdownStarted) return false;
        shutdownStarted = true;
        return true;
    }

    private boolean startIfReady() {
        if (shutdownStarted || !minimumElapsed || !contentReady) return false;
        shutdownStarted = true;
        return true;
    }
}
