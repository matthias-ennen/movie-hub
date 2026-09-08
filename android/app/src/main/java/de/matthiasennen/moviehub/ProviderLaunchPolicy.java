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
                return true;
            default:
                // YouTube's HTTPS results URL is verified on Fire TV. waipu.tv
                // now also uses an official app.waipu.tv destination first
                // (waiputhek for VOD, sender page for future live entries).
                return false;
        }
    }
}
