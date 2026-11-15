package de.matthiasennen.moviehub;

/** A sender route is never a generic search, title route or arbitrary URL. */
final class AirStationRoutePolicy {
    private AirStationRoutePolicy() { }

    static boolean isAllowed(String providerId, String mode, String scope,
                             String target, String fallback) {
        return providerId != null && providerId.startsWith("air-")
                && "WEB_LINK".equals(mode) && "channel".equals(scope)
                && ProviderUrlPolicy.isAllowed(providerId, target)
                && target.equals(fallback);
    }
}
