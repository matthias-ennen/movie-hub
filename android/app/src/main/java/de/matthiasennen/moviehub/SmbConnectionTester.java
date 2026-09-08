package de.matthiasennen.moviehub;

import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.Share;

import java.util.Locale;

/** Performs one short SMB2/3 login/share check without keeping a background session open. */
final class SmbConnectionTester {
    static final class Result {
        final boolean successful;
        final String message;

        Result(boolean successful, String message) {
            this.successful = successful;
            this.message = message;
        }
    }

    private SmbConnectionTester() { }

    static Result test(SmbConnection target, SmbCredentials credentials) {
        SMBClient client = null;
        Connection connection = null;
        Share share = null;
        try {
            client = new SMBClient();
            connection = client.connect(target.getHost(), target.getPort());
            Session session = connection.authenticate(new AuthenticationContext(
                    credentials.getUsername(), credentials.getPasswordChars(), ""));
            share = session.connectShare(target.getShare());
            if (!(share instanceof DiskShare)) {
                return new Result(false, "Die Freigabe ist keine Dateifreigabe.");
            }
            return new Result(true, "Erreichbar und Anmeldung erfolgreich");
        } catch (Exception error) {
            return new Result(false, readableError(error));
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
            return "Anmeldung fehlgeschlagen – Benutzername oder Kennwort prüfen";
        }
        if (message.contains("UNKNOWNHOST") || message.contains("CONNECT")
                || message.contains("TIMEOUT") || message.contains("UNREACHABLE")) {
            return "Nicht erreichbar – Heimnetz, Server und Festplatte prüfen";
        }
        return "Verbindung fehlgeschlagen – Server, Freigabe und Anmeldung prüfen";
    }

    private static void closeQuietly(AutoCloseable value) {
        if (value == null) return;
        try {
            value.close();
        } catch (Exception ignored) {
            // A failed network close must not hide the connection result.
        }
    }
}
