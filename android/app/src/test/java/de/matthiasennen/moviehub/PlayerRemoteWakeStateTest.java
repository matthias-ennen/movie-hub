package de.matthiasennen.moviehub;

import android.view.KeyEvent;
import org.junit.Test;
import static org.junit.Assert.*;

public final class PlayerRemoteWakeStateTest {
    @Test public void wakeConsumesDownRepeatsAndUpEvenAfterControlsAppear() {
        PlayerRemoteWakeState wake = new PlayerRemoteWakeState();
        int key = KeyEvent.KEYCODE_DPAD_CENTER;
        assertTrue(wake.consumeNavigation(key, KeyEvent.ACTION_DOWN, true));
        assertTrue(wake.consumeNavigation(key, KeyEvent.ACTION_DOWN, false));
        assertTrue(wake.consumeNavigation(key, KeyEvent.ACTION_UP, false));
        assertFalse(wake.consumeNavigation(key, KeyEvent.ACTION_DOWN, false));
        assertFalse(wake.consumeNavigation(key, KeyEvent.ACTION_UP, false));
    }

    @Test public void anotherNavigationKeyIsNotSwallowed() {
        PlayerRemoteWakeState wake = new PlayerRemoteWakeState();
        assertTrue(wake.consumeNavigation(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_DOWN, true));
        assertFalse(wake.consumeNavigation(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_DOWN, false));
        assertFalse(wake.consumeNavigation(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_UP, false));
        wake.clear();
        assertFalse(wake.consumeNavigation(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_UP, false));
    }

    @Test public void navigationAndMediaKeysStaySeparateFromBackAndVolume() {
        assertTrue(PlayerRemoteWakeState.isNavigationKey(KeyEvent.KEYCODE_DPAD_CENTER));
        assertTrue(PlayerRemoteWakeState.isNavigationKey(KeyEvent.KEYCODE_ENTER));
        assertTrue(PlayerRemoteWakeState.isMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));
        assertTrue(PlayerRemoteWakeState.isMediaKey(KeyEvent.KEYCODE_MEDIA_REWIND));
        assertFalse(PlayerRemoteWakeState.isNavigationKey(KeyEvent.KEYCODE_BACK));
        assertFalse(PlayerRemoteWakeState.isMediaKey(KeyEvent.KEYCODE_VOLUME_UP));
        assertFalse(PlayerRemoteWakeState.isNavigationKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));
    }
}
