package de.matthiasennen.moviehub;

import android.view.KeyEvent;

/** Maps physical Fire TV transport keys without changing the official player UI. */
final class TrailerRemoteInput {
    private TrailerRemoteInput() {}

    static String transportCommand(int key) {
        switch (key) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "toggle";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "pause";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "forward";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "rewind";
            default: return null;
        }
    }

    static int webNavigationKey(int key) {
        return key == KeyEvent.KEYCODE_DPAD_CENTER ? KeyEvent.KEYCODE_ENTER : key;
    }
}
