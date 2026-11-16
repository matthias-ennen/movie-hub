package de.matthiasennen.moviehub;

import android.view.KeyEvent;
import java.util.HashSet;
import java.util.Set;

/** Consumes the entire key press that wakes hidden player controls, including repeats/up. */
final class PlayerRemoteWakeState {
    private final Set<Integer> wakeKeys = new HashSet<>();

    boolean consumeNavigation(int key, int action, boolean controlsHidden) {
        if (action == KeyEvent.ACTION_UP) return wakeKeys.remove(key);
        if (action != KeyEvent.ACTION_DOWN) return false;
        if (wakeKeys.contains(key)) return true;
        if (!controlsHidden) return false;
        wakeKeys.add(key);
        return true;
    }

    void clear() {
        wakeKeys.clear();
    }

    static boolean isNavigationKey(int key) {
        return key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN
                || key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT
                || key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER
                || key == KeyEvent.KEYCODE_NUMPAD_ENTER;
    }

    static boolean isMediaKey(int key) {
        return key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || key == KeyEvent.KEYCODE_MEDIA_PLAY
                || key == KeyEvent.KEYCODE_MEDIA_PAUSE || key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
                || key == KeyEvent.KEYCODE_MEDIA_REWIND || key == KeyEvent.KEYCODE_MEDIA_NEXT
                || key == KeyEvent.KEYCODE_MEDIA_PREVIOUS;
    }
}
