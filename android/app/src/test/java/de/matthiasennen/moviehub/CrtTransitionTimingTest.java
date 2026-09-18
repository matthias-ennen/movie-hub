package de.matthiasennen.moviehub;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class CrtTransitionTimingTest {
    @Test
    public void switchOnAndSwitchOffShareTheExistingStartupTiming() {
        assertEquals(
                CrtTransitionAnimator.PANEL_TRANSITION_MS
                        + CrtTransitionAnimator.LINE_TRANSITION_MS,
                CrtTransitionAnimator.TOTAL_TRANSITION_MS);
        assertEquals(1_000L, CrtTransitionAnimator.TOTAL_TRANSITION_MS);
        assertTrue(CrtTransitionAnimator.TOTAL_TRANSITION_MS
                < StartupIntroOverlay.MIN_LOGO_HOLD_MS);
    }
}
