package de.matthiasennen.moviehub;

/** Provider-specific ordering for generic title destinations. */
final class ProviderLaunchPolicy {
    private ProviderLaunchPolicy() { }

    static boolean triesTextSearchFirst(String providerId) {
        if (providerId == null) return false;
        switch (providerId) {
            case "netflix":
            case "prime":
            case "disney":
            case "youtube":
            case "waipu":
                // Prefer a provider-internal search entry point for every
                // supported provider. Apps that do not consume ACTION_SEARCH
                // fall back to their validated HTTPS destination, then their
                // normal launcher activity and finally the browser.
                return true;
            default:
                return false;
        }
    }
}
