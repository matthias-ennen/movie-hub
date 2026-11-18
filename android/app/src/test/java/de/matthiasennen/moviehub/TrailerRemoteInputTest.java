package de.matthiasennen.moviehub;

import android.view.KeyEvent;
import org.junit.Test;
import static org.junit.Assert.*;

public final class TrailerRemoteInputTest {
    @Test public void mapsFireTvOkAndPhysicalTransportKeys() {
        assertEquals("toggle", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_DPAD_CENTER));
        assertEquals("toggle", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));
        assertEquals("play", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_PLAY));
        assertEquals("pause", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_PAUSE));
        assertEquals("forward", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD));
        assertEquals("rewind", TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_MEDIA_REWIND));
    }

    @Test public void keepsBackArrowsAndEnterOutsideDirectPlaybackTransport() {
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_BACK));
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_DPAD_LEFT));
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_DPAD_RIGHT));
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_DPAD_UP));
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_DPAD_DOWN));
        assertNull(TrailerRemoteInput.transportCommand(KeyEvent.KEYCODE_ENTER));
    }
}
