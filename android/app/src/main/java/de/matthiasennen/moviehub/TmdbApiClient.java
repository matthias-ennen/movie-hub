package de.matthiasennen.moviehub;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Minimal native TMDB authentication client. Secrets never cross the WebView bridge. */
final class TmdbApiClient {
    private static final String API_BASE = "https://api.themoviedb.org/3";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 15_000;

    enum ErrorKind {
        AUTHENTICATION,
        ACCOUNT_LOGIN,
        NETWORK,
        SERVICE,
        RESPONSE
    }

    static final class TmdbException extends Exception {
        private final ErrorKind kind;
        private final int statusCode;

        TmdbException(ErrorKind kind, int statusCode, String message) {
            super(message);
            this.kind = kind;
            this.statusCode = statusCode;
        }

        ErrorKind getKind() {
            return kind;
        }

        int getStatusCode() {
            return statusCode;
        }
    }

    private TmdbApiClient() {}

    static void validateApiToken(String apiReadAccessToken) throws TmdbException {
        request("GET", "/configuration", apiReadAccessToken, null);
    }

    static String login(String apiReadAccessToken, String username, String password)
            throws TmdbException {
        JSONObject requestTokenResponse = request(
                "GET", "/authentication/token/new", apiReadAccessToken, null);
        String requestToken = requestTokenResponse.optString("request_token").trim();
        if (requestToken.isEmpty()) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "TMDB hat keinen gültigen Request-Token geliefert.");
        }

        JSONObject loginBody = new JSONObject();
        try {
            loginBody.put("username", username);
            loginBody.put("password", password);
            loginBody.put("request_token", requestToken);
        } catch (Exception impossible) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Die TMDB-Anmeldung konnte nicht vorbereitet werden.");
        }
        JSONObject validatedLogin = request(
                "POST", "/authentication/token/validate_with_login",
                apiReadAccessToken, loginBody);

        // Continue with the token returned by TMDB after successful validation.
        // It is normally identical to the original request token, but using the
        // response value keeps the session step tied to the token TMDB actually
        // accepted instead of assuming identity.
        String validatedRequestToken = validatedLogin.optString("request_token").trim();
        if (validatedRequestToken.isEmpty()) validatedRequestToken = requestToken;

        JSONObject sessionBody = new JSONObject();
        try {
            sessionBody.put("request_token", validatedRequestToken);
        } catch (Exception impossible) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Die TMDB-Session konnte nicht vorbereitet werden.");
        }
        JSONObject sessionResponse = request(
                "POST", "/authentication/session/new", apiReadAccessToken, sessionBody);
        String sessionId = sessionResponse.optString("session_id").trim();
        if (sessionId.isEmpty()) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "TMDB hat keine gültige Session-ID geliefert.");
        }
        return sessionId;
    }

    static void validateSession(String apiReadAccessToken, String sessionId)
            throws TmdbException {
        final String encodedSession;
        try {
            encodedSession = URLEncoder.encode(sessionId, "UTF-8");
        } catch (Exception impossible) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Die TMDB-Session konnte nicht geprüft werden.");
        }
        request("GET", "/movie/550/account_states?session_id=" + encodedSession,
                apiReadAccessToken, null);
    }

    static void deleteSession(String apiReadAccessToken, String sessionId)
            throws TmdbException {
        JSONObject body = new JSONObject();
        try {
            body.put("session_id", sessionId);
        } catch (Exception impossible) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Die TMDB-Session konnte nicht zum Trennen vorbereitet werden.");
        }
        request("DELETE", "/authentication/session", apiReadAccessToken, body);
    }

    private static JSONObject request(String method, String path, String apiReadAccessToken,
                                      JSONObject body) throws TmdbException {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(API_BASE + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiReadAccessToken);

            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(payload);
                }
            }

            int statusCode = connection.getResponseCode();
            InputStream stream = statusCode >= 200 && statusCode < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String responseText = stream == null ? "" : readFully(stream);

            if (statusCode < 200 || statusCode >= 300) {
                String statusMessage = safeStatusMessage(responseText);
                int tmdbStatusCode = safeTmdbStatusCode(responseText);
                String diagnosticMessage = statusMessage.isEmpty()
                        ? "TMDB hat die Anfrage abgelehnt."
                        : statusMessage;
                if (tmdbStatusCode > 0) {
                    diagnosticMessage = "TMDB-Status " + tmdbStatusCode + ": " + diagnosticMessage;
                }

                ErrorKind kind;
                if ("/authentication/token/validate_with_login".equals(path)
                        && (statusCode == 400 || statusCode == 401
                        || statusCode == 403 || statusCode == 422)) {
                    // Keep account-login rejections separate from application-token
                    // failures so the settings UI can show TMDB's exact safe status
                    // message instead of collapsing every 401 into a generic error.
                    kind = ErrorKind.ACCOUNT_LOGIN;
                } else if (statusCode == 401 || statusCode == 403) {
                    kind = ErrorKind.AUTHENTICATION;
                } else if (statusCode >= 500) {
                    kind = ErrorKind.SERVICE;
                } else {
                    kind = ErrorKind.RESPONSE;
                }
                throw new TmdbException(kind, statusCode, diagnosticMessage);
            }

            if (responseText.isEmpty()) return new JSONObject();
            return new JSONObject(responseText);
        } catch (TmdbException error) {
            throw error;
        } catch (IOException error) {
            throw new TmdbException(ErrorKind.NETWORK, 0,
                    "TMDB ist über die aktuelle Internetverbindung nicht erreichbar.");
        } catch (Exception error) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Die Antwort von TMDB konnte nicht verarbeitet werden.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readFully(InputStream stream) throws IOException {
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private static String safeStatusMessage(String responseText) {
        if (responseText == null || responseText.isEmpty()) return "";
        try {
            String message = new JSONObject(responseText).optString("status_message").trim();
            if (message.length() > 180) return message.substring(0, 180);
            return message;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static int safeTmdbStatusCode(String responseText) {
        if (responseText == null || responseText.isEmpty()) return 0;
        try {
            return new JSONObject(responseText).optInt("status_code", 0);
        } catch (Exception ignored) {
            return 0;
        }
    }
}
