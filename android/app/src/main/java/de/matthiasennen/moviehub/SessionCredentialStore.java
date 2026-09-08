package de.matthiasennen.moviehub;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** App-process-only SMB credentials. They are never written to disk. */
final class SessionCredentialStore {
    private static final Map<String, SmbCredentials> CREDENTIALS = new ConcurrentHashMap<>();

    private SessionCredentialStore() { }

    static SmbCredentials load(String endpoint) {
        return CREDENTIALS.get(endpoint);
    }

    static void save(String endpoint, SmbCredentials credentials) {
        if (endpoint == null || credentials == null) return;
        CREDENTIALS.put(endpoint, credentials);
    }

    static void remove(String endpoint) {
        if (endpoint != null) CREDENTIALS.remove(endpoint);
    }

    static void clearAll() {
        CREDENTIALS.clear();
    }
}
