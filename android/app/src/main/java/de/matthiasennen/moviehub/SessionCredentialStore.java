package de.matthiasennen.moviehub;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Process-local credentials for the explicit "current app session" mode. */
final class SessionCredentialStore {
    private static final Map<String, SmbCredentials> CREDENTIALS = new ConcurrentHashMap<>();

    private SessionCredentialStore() { }

    static SmbCredentials load(String endpointKey) { return CREDENTIALS.get(endpointKey); }
    static void save(String endpointKey, SmbCredentials credentials) {
        if (credentials != null) CREDENTIALS.put(endpointKey, credentials);
    }
    static void remove(String endpointKey) { CREDENTIALS.remove(endpointKey); }
    static void clear() { CREDENTIALS.clear(); }
}
