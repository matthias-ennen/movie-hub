package de.matthiasennen.moviehub;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/** Device-local description of one SMB server/share without credentials. */
final class SmbConnection {
    private final String name;
    private final String host;
    private final int port;
    private final String share;
    private final String basePath;
    private final boolean persistentCredentials;
    private final boolean enabled;

    SmbConnection(String name, String host, int port, String share, String basePath,
                  boolean persistentCredentials, boolean enabled) {
        String normalizedHost = host == null ? "" : host.trim().toLowerCase(Locale.ROOT);
        String normalizedShare = share == null ? "" : share.trim();
        if (normalizedHost.isEmpty() || normalizedHost.contains("/")
                || normalizedHost.contains("\\") || normalizedHost.contains("@")) {
            throw new IllegalArgumentException("Bitte einen gültigen Servernamen eingeben.");
        }
        if (port < 1 || port > 65535) {
            throw new IllegalArgumentException("Der Port muss zwischen 1 und 65535 liegen.");
        }
        if (normalizedShare.isEmpty() || normalizedShare.contains("/")
                || normalizedShare.contains("\\")) {
            throw new IllegalArgumentException("Bitte einen gültigen Freigabenamen eingeben.");
        }

        this.host = normalizedHost;
        this.port = port;
        this.share = normalizedShare;
        this.name = name == null || name.trim().isEmpty()
                ? normalizedHost + "/" + normalizedShare
                : name.trim();
        this.basePath = normalizeBasePath(basePath);
        this.persistentCredentials = persistentCredentials;
        this.enabled = enabled;
    }

    static SmbConnection fromJson(JSONObject json) throws JSONException {
        return new SmbConnection(
                json.optString("name"),
                json.getString("host"),
                json.optInt("port", 445),
                json.getString("share"),
                json.optString("basePath"),
                json.optBoolean("persistentCredentials", true),
                json.optBoolean("enabled", true));
    }

    JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("name", name);
        json.put("host", host);
        json.put("port", port);
        json.put("share", share);
        json.put("basePath", basePath);
        json.put("persistentCredentials", persistentCredentials);
        json.put("enabled", enabled);
        return json;
    }

    SmbConnection withEnabled(boolean value) {
        return new SmbConnection(name, host, port, share, basePath,
                persistentCredentials, value);
    }

    SmbConnection withCredentialMode(boolean persistent) {
        return new SmbConnection(name, host, port, share, basePath, persistent, enabled);
    }

    String getName() { return name; }
    String getHost() { return host; }
    int getPort() { return port; }
    String getShare() { return share; }
    String getBasePath() { return basePath; }
    boolean usesPersistentCredentials() { return persistentCredentials; }
    boolean isEnabled() { return enabled; }
    String getEndpointKey() { return host + ":" + port + "/" + share; }
    String getDisplayEndpoint() {
        return host + (port == 445 ? "" : ":" + port) + "/" + share;
    }

    private static String normalizeBasePath(String value) {
        if (value == null) return "";
        String result = value.trim().replace('\\', '/');
        while (result.startsWith("/")) result = result.substring(1);
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        if (result.contains("../") || result.equals("..") || result.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Der Basisordner ist ungültig.");
        }
        return result;
    }
}
