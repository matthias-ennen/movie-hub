package de.matthiasennen.moviehub;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

/** Shared exact AIR dispatcher used by MovieHub and the separate QA APK. */
final class AirStationLauncher {
    private AirStationLauncher() { }

    static boolean open(Activity activity, String providerId, String mode, String scope,
                        String target, String fallback) {
        if (!AirStationRoutePolicy.isAllowed(providerId, mode, scope, target, fallback)) {
            return false;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            activity.startActivity(intent);
            return true; // Intent accepted; this does NOT prove playback.
        } catch (ActivityNotFoundException | SecurityException ignored) {
            return false;
        }
    }
}
