package de.matthiasennen.moviehub;

/** Provider-specific ordering for generic title destinations. */
final class ProviderLaunchPolicy {
    private ProviderLaunchPolicy() { }

    static boolean supportsPlaybackMode(String mode) {
        return "APP_DEEP_LINK".equals(mode) || "WEB_LINK".equals(mode);
    }

    static boolean supportsPlaybackScope(String scope) {
        return scope == null || scope.isEmpty()
                || "program".equals(scope)
                || "channel".equals(scope)
                || "title".equals(scope)
                || "provider".equals(scope);
    }

    static boolean forcesProviderPackage(String mode) {
        return "APP_DEEP_LINK".equals(mode);
    }

    static boolean preservesExactTarget(String scope) {
        return "program".equals(scope) || "channel".equals(scope);
    }

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
