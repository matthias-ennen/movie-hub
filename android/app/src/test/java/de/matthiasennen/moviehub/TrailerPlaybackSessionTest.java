package de.matthiasennen.moviehub;

import org.junit.Test;
import static org.junit.Assert.*;

public final class TrailerPlaybackSessionTest {
    @Test public void startupBufferIsNotCountedAsRebuffer() {
        TrailerPlaybackSession session = new TrailerPlaybackSession(100);
        assertTrue(session.isWaiting());
        assertTrue(session.updateState(TrailerPlaybackSession.BUFFERING, 200));
        assertEquals(0, session.rebufferCount());
        assertTrue(session.isWaiting());
        session.updateState(TrailerPlaybackSession.PLAYING, 1200);
        assertEquals(1100, session.startupMs());
        assertFalse(session.isWaiting());
    }

    @Test public void duplicateBufferingDoesNotResetOrDoubleCountStalls() {
        TrailerPlaybackSession session = new TrailerPlaybackSession(0);
        session.updateState(TrailerPlaybackSession.PLAYING, 1000);
        session.updateState(TrailerPlaybackSession.BUFFERING, 5000);
        assertTrue(session.isWaiting());
        assertFalse(session.updateState(TrailerPlaybackSession.BUFFERING, 6000));
        assertEquals(1, session.rebufferCount());
        assertEquals(2000, session.rebufferMs(7000));
        session.updateState(TrailerPlaybackSession.PLAYING, 7500);
        session.updateState(TrailerPlaybackSession.BUFFERING, 8000);
        session.updateState(TrailerPlaybackSession.PAUSED, 9000);
        assertEquals(2, session.rebufferCount());
        assertEquals(3500, session.rebufferMs(15000));
        assertFalse(session.isWaiting());
    }

    @Test public void manualStartAfterAutoplayBlockHasNoIdleTimeout() {
        TrailerPlaybackSession session = new TrailerPlaybackSession(0);
        session.updateState(TrailerPlaybackSession.CUED, 50);
        session.autoplayBlocked();
        assertFalse(session.isWaiting());
        session.updateState(TrailerPlaybackSession.BUFFERING, 1000);
        assertTrue(session.isWaiting());
        session.updateState(TrailerPlaybackSession.PLAYING, 2000);
        assertFalse(session.isWaiting());
        session.updateState(TrailerPlaybackSession.ENDED, 5000);
        assertFalse(session.isWaiting());
    }
}
