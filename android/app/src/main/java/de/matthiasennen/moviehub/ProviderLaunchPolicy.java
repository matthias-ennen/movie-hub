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
                // These apps have been observed to accept an HTTPS destination
                // without necessarily applying its search query. Prefer the
                // platform search intent first and retain the HTTPS URL as the
                // next fallback when the installed app ignores ACTION_SEARCH.
                return true;
            default:
                // waipu.tv uses an official app.waipu.tv destination first
                // (waiputhek for VOD, sender page for future live entries).
                return false;
        }
    }
}
