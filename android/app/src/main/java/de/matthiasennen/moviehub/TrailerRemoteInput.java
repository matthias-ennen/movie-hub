package de.matthiasennen.moviehub;

import android.view.KeyEvent;

/** Maps Fire TV OK and transport keys without changing the official YouTube UI. */
final class TrailerRemoteInput {
    private TrailerRemoteInput() {}

    static String transportCommand(int key) {
        switch (key) {
            // Fire TV OK must work regardless of which YouTube control owns iframe focus.
            case KeyEvent.KEYCODE_DPAD_CENTER: return "toggle";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "toggle";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "pause";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "forward";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "rewind";
            default: return null;
        }
    }
}
