package de.matthiasennen.moviehub;

import android.view.KeyEvent;
import org.junit.Test;
import static org.junit.Assert.*;

public final class TrailerRemoteInputTest {
    @Test public void mapsPhysicalTransportKeys() {
        assertEquals("toggle", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));
        assertEquals("play", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_PLAY));
        assertEquals("pause", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_PAUSE));
        assertEquals("forward", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD));
        assertEquals("rewind", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_REWIND));
    }

    @Test public void keepsNavigationSeparateFromTransport() {
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_BACK));
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_DPAD_CENTER));
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_DPAD_LEFT));
        assertEquals(KeyEvent.KEYCODE_ENTER, TrailerRemoteInput.webNavigationKey(KeyEvent.KEYCODE_DPAD_CENTER));
        assertEquals(KeyEvent.KEYCODE_DPAD_LEFT, TrailerRemoteInput.webNavigationKey(KeyEvent.KEYCODE_DPAD_LEFT));
        assertEquals(KeyEvent.KEYCODE_DPAD_RIGHT, TrailerRemoteInput.webNavigationKey(KeyEvent.KEYCODE_DPAD_RIGHT));
    }
}
