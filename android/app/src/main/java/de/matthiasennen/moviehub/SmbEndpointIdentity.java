package de.matthiasennen.moviehub;

import java.util.Locale;

/** Canonical, credential-free identity for one logical SMB server/share. */
final class SmbEndpointIdentity {
    private SmbEndpointIdentity() {}

    static String key(String host, String share) {
        String normalizedHost = normalizeHost(host);
        String normalizedShare = normalizeShare(share);
        if (normalizedHost.isEmpty() || normalizedShare.isEmpty()) {
            throw new IllegalArgumentException("Server und Freigabe müssen angegeben werden.");
        }
        return normalizedHost + "/" + normalizedShare;
    }

    static boolean same(String leftHost, String leftShare, String rightHost, String rightShare) {
        return key(leftHost, leftShare).equals(key(rightHost, rightShare));
    }

    private static String normalizeHost(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeShare(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
