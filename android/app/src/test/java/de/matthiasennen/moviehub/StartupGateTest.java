package de.matthiasennen.moviehub;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StartupGateTest {
    @Test
    public void readyBeforeMinimumWaitsForMinimum() {
        StartupGate gate = new StartupGate();

        assertFalse(gate.onContentReady());
        assertTrue(gate.onMinimumElapsed());
        assertFalse(gate.onMaximumElapsed());
    }

    @Test
    public void readyAfterMinimumStartsImmediately() {
        StartupGate gate = new StartupGate();

        assertFalse(gate.onMinimumElapsed());
        assertTrue(gate.onContentReady());
        assertFalse(gate.onContentReady());
    }

    @Test
    public void maximumAlwaysReleasesAnUnreadyStartup() {
        StartupGate gate = new StartupGate();

        assertTrue(gate.onMaximumElapsed());
        assertFalse(gate.onMinimumElapsed());
        assertFalse(gate.onContentReady());
    }
}
