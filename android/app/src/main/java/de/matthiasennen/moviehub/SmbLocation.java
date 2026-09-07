package de.matthiasennen.moviehub;

import android.net.Uri;

import java.util.List;
import java.util.Locale;

/** Parsed, credential-free SMB address shared by the WebView bridge and player. */
final class SmbLocation {
    private final Uri uri;
    private final String host;
    private final int port;
    private final String share;
    private final String path;

    private SmbLocation(Uri uri, String host, int port, String share, String path) {
        this.uri = uri;
        this.host = host;
        this.port = port;
        this.share = share;
        this.path = path;
    }

    static SmbLocation parse(String rawUrl) {
        if (rawUrl == null) throw new IllegalArgumentException("SMB-Adresse fehlt.");
        Uri uri = Uri.parse(rawUrl.trim());
        if (!"smb".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getHost().trim().isEmpty()) {
            throw new IllegalArgumentException("Ungültige SMB-Adresse.");
        }
        if (uri.getUserInfo() != null && !uri.getUserInfo().isEmpty()) {
            throw new IllegalArgumentException("Zugangsdaten dürfen nicht im SMB-Pfad stehen.");
        }
        if (uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("Ungültige SMB-Adresse.");
        }

        List<String> parts = uri.getPathSegments();
        if (parts.size() < 2) {
            throw new IllegalArgumentException("Freigabe oder Dateiname fehlt.");
        }
        for (String part : parts) {
            if (part.isEmpty() || ".".equals(part) || "..".equals(part)
                    || part.indexOf('\\') >= 0 || part.indexOf('/') >= 0
                    || part.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("Ungültiger SMB-Pfad.");
            }
        }

        StringBuilder path = new StringBuilder();
        for (int index = 1; index < parts.size(); index++) {
            if (path.length() > 0) path.append('\\');
            path.append(parts.get(index));
        }
        int port = uri.getPort() == -1 ? 445 : uri.getPort();
        if (port < 1 || port > 65535) throw new IllegalArgumentException("Ungültiger SMB-Port.");
        return new SmbLocation(uri, uri.getHost().toLowerCase(Locale.ROOT), port,
                parts.get(0), path.toString());
    }

    Uri getUri() { return uri; }
    String getHost() { return host; }
    int getPort() { return port; }
    String getShare() { return share; }
    String getPath() { return path; }
    String getCredentialKey() { return host + ":" + port + "/" + share; }
    String getDisplayEndpoint() { return host + "/" + share; }
}
