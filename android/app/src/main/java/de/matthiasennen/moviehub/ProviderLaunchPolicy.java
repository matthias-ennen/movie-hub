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
            case "waipu":
                return true;
            default:
                // YouTube's HTTPS results URL is verified on Fire TV and
                // therefore deliberately remains the first attempt.
                return false;
        }
    }
}
