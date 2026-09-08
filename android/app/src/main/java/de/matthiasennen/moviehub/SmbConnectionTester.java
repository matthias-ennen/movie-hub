package de.matthiasennen.moviehub;

import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.Share;

import java.util.Locale;

/** Short-lived SMB2/3 connection check used by the network-drive settings UI. */
final class SmbConnectionTester {
    private SmbConnectionTester() { }

    static Result test(NetworkDrive drive, SmbCredentials credentials) {
        SMBClient client = null;
        Connection connection = null;
        Share share = null;
        try {
            client = new SMBClient();
            connection = client.connect(drive.getHost(), drive.getPort());
            Session session = connection.authenticate(new AuthenticationContext(
                    credentials.getUsername(), credentials.getPasswordChars(), ""));
            share = session.connectShare(drive.getShare());
            if (!(share instanceof DiskShare)) {
                return Result.failure("Die Freigabe ist keine Dateifreigabe.");
            }
            if (!drive.getBaseFolder().isEmpty()
                    && !((DiskShare) share).folderExists(drive.getBaseFolder())) {
                return Result.failure("Der Basisordner wurde nicht gefunden.");
            }
            return Result.success("Erreichbar und erfolgreich angemeldet");
        } catch (Throwable error) {
            return Result.failure(readableError(error));
        } finally {
            closeQuietly(share);
            closeQuietly(connection);
            closeQuietly(client);
        }
    }

    private static String readableError(Throwable error) {
        StringBuilder details = new StringBuilder();
        Throwable current = error;
        while (current != null && details.length() < 1200) {
            if (current.getMessage() != null) details.append(' ').append(current.getMessage());
            current = current.getCause();
        }
        String message = details.toString().toUpperCase(Locale.ROOT);
        if (message.contains("LOGON_FAILURE") || message.contains("ACCESS_DENIED")
                || message.contains("AUTHENTICAT")) {
            return "Anmeldung fehlgeschlagen – Benutzername oder Kennwort prüfen.";
        }
        if (message.contains("BAD_NETWORK_NAME") || message.contains("SHARE")) {
            return "Die SMB-Freigabe wurde nicht gefunden.";
        }
        if (message.contains("UNKNOWNHOST") || message.contains("CONNECT")
                || message.contains("TIMEOUT") || message.contains("UNREACHABLE")) {
            return "Server nicht erreichbar – Heimnetz und Server prüfen.";
        }
        return "Verbindung fehlgeschlagen – Server, Freigabe und Zugangsdaten prüfen.";
    }

    private static void closeQuietly(AutoCloseable closeable) {
        if (closeable == null) return;
        try { closeable.close(); } catch (Exception ignored) { }
    }

    static final class Result {
        private final boolean success;
        private final String message;

        private Result(boolean success, String message) {
            this.success = success;
            this.message = message;
        }

        static Result success(String message) { return new Result(true, message); }
        static Result failure(String message) { return new Result(false, message); }
        boolean isSuccess() { return success; }
        String getMessage() { return message; }
    }
}
