package de.matthiasennen.moviehub;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;
import java.util.UUID;

/** Credential-free, device-local definition of one SMB network drive. */
final class NetworkDrive {
    private final String id;
    private final String label;
    private final String host;
    private final int port;
    private final String share;
    private final String baseFolder;

    NetworkDrive(String id, String label, String host, int port, String share, String baseFolder) {
        this.id = id == null || id.trim().isEmpty() ? UUID.randomUUID().toString() : id;
        this.label = requireText(label, "Bitte eine Bezeichnung eingeben.");
        this.host = normalizeHost(host);
        if (port < 1 || port > 65535) {
            throw new IllegalArgumentException("Der Port muss zwischen 1 und 65535 liegen.");
        }
        this.port = port;
        this.share = normalizePathPart(share, "Bitte einen Freigabenamen eingeben.");
        this.baseFolder = normalizeBaseFolder(baseFolder);
    }

    static NetworkDrive fromJson(JSONObject json) throws JSONException {
        return new NetworkDrive(
                json.getString("id"),
                json.getString("label"),
                json.getString("host"),
                json.optInt("port", 445),
                json.getString("share"),
                json.optString("baseFolder", ""));
    }

    JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("id", id);
        json.put("label", label);
        json.put("host", host);
        json.put("port", port);
        json.put("share", share);
        json.put("baseFolder", baseFolder);
        return json;
    }

    String getId() { return id; }
    String getLabel() { return label; }
    String getHost() { return host; }
    int getPort() { return port; }
    String getShare() { return share; }
    String getBaseFolder() { return baseFolder; }
    String getCredentialKey() { return host + ":" + port + "/" + share; }

    String getDisplayEndpoint() {
        String portPart = port == 445 ? "" : ":" + port;
        String folderPart = baseFolder.isEmpty() ? "" : "/" + baseFolder.replace('\\', '/');
        return host + portPart + "/" + share + folderPart;
    }

    private static String requireText(String value, String error) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) throw new IllegalArgumentException(error);
        return normalized;
    }

    private static String normalizeHost(String value) {
        String normalized = requireText(value, "Bitte einen Server oder eine IP-Adresse eingeben.")
                .toLowerCase(Locale.ROOT);
        if (normalized.contains("://") || normalized.contains("/") || normalized.contains("\\")
                || normalized.contains("@") || normalized.contains("?") || normalized.contains("#")) {
            throw new IllegalArgumentException("Bitte nur Servernamen oder IP-Adresse eingeben.");
        }
        return normalized;
    }

    private static String normalizePathPart(String value, String error) {
        String normalized = requireText(value, error);
        if (normalized.contains("/") || normalized.contains("\\") || normalized.equals(".")
                || normalized.equals("..") || normalized.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Der Freigabename ist ungültig.");
        }
        return normalized;
    }

    private static String normalizeBaseFolder(String value) {
        String normalized = value == null ? "" : value.trim().replace('/', '\\');
        while (normalized.startsWith("\\")) normalized = normalized.substring(1);
        while (normalized.endsWith("\\")) normalized = normalized.substring(0, normalized.length() - 1);
        if (normalized.isEmpty()) return "";
        for (String part : normalized.split("\\\\")) {
            if (part.isEmpty() || part.equals(".") || part.equals("..") || part.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("Der Basisordner ist ungültig.");
            }
        }
        return normalized;
    }
}
