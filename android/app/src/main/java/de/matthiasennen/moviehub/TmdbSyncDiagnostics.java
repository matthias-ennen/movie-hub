package de.matthiasennen.moviehub;

import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Replays only the TMDB requests that can abort a personal-catalog sync and
 * records a secret-free trace. Bearer token, session id, password and account
 * id are deliberately never written to Logcat or returned to the WebView.
 */
final class TmdbSyncDiagnostics {
    private static final String TAG = "MovieHubTmdbDiag";
    private static final String API_BASE = "https://api.themoviedb.org/3";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 15_000;
    private static final int MAX_PAGES_PER_LIST = 10;
    private static final long INTER_REQUEST_DELAY_MS = 75L;

    private TmdbSyncDiagnostics() {}

    static Result run(String apiReadAccessToken, String sessionId) {
        if (apiReadAccessToken == null || apiReadAccessToken.trim().isEmpty()
                || sessionId == null || sessionId.trim().isEmpty()) {
            return Result.unavailable("keine vollständigen lokalen TMDB-Zugangsdaten");
        }

        DiagnosticSession session = new DiagnosticSession(apiReadAccessToken, sessionId);
        try {
            JSONObject account = session.get("Account", "/account?session_id=" + encode(sessionId));
            long accountId = account.optLong("id", 0);
            if (accountId <= 0) {
                return Result.failure(session.requestCount,
                        "Account · gültige Account-ID fehlt");
            }

            session.get("Genres Filme", "/genre/movie/list?language=de-DE");
            session.get("Genres Serien", "/genre/tv/list?language=de-DE");

            session.getPaged(accountId, "favorite/movies", "Favoriten Filme");
            session.getPaged(accountId, "favorite/tv", "Favoriten Serien");
            session.getPaged(accountId, "watchlist/movies", "Watchlist Filme");
            session.getPaged(accountId, "watchlist/tv", "Watchlist Serien");
            session.getPaged(accountId, "rated/movies", "Bewertungen Filme");
            session.getPaged(accountId, "rated/tv", "Bewertungen Serien");

            String summary = session.requestCount + " Kernanfragen erfolgreich; "
                    + "kein HTTP 429 in der Diagnose beobachtet";
            Log.i(TAG, "DIAG OK · " + summary);
            return Result.success(summary);
        } catch (DiagnosticFailure failure) {
            Log.w(TAG, "DIAG FAIL · " + failure.summary);
            return Result.failure(session.requestCount, failure.summary);
        } catch (Exception error) {
            String summary = "Diagnose konnte nicht abgeschlossen werden: "
                    + error.getClass().getSimpleName();
            Log.w(TAG, "DIAG ERROR · " + summary);
            return Result.failure(session.requestCount, summary);
        }
    }

    private static final class DiagnosticSession {
        private final String apiReadAccessToken;
        private final String encodedSession;
        private int requestCount;

        DiagnosticSession(String apiReadAccessToken, String sessionId) {
            this.apiReadAccessToken = apiReadAccessToken;
            this.encodedSession = encode(sessionId);
        }

        JSONObject getPaged(long accountId, String endpoint, String label)
                throws DiagnosticFailure {
            JSONObject last = null;
            int page = 1;
            int totalPages;
            do {
                String path = "/account/" + accountId + "/" + endpoint
                        + "?language=de-DE&page=" + page
                        + "&sort_by=created_at.desc&session_id=" + encodedSession;
                last = get(label + " · Seite " + page, path);
                totalPages = Math.max(1, last.optInt("total_pages", 1));
                if (totalPages > MAX_PAGES_PER_LIST) {
                    Log.i(TAG, label + " · Diagnose auf " + MAX_PAGES_PER_LIST
                            + " Seiten begrenzt (TMDB meldet " + totalPages + ")");
                    totalPages = MAX_PAGES_PER_LIST;
                }
                page++;
            } while (page <= totalPages);
            return last == null ? new JSONObject() : last;
        }

        JSONObject get(String label, String path) throws DiagnosticFailure {
            requestCount++;
            int requestNumber = requestCount;
            long startedAt = System.currentTimeMillis();
            HttpURLConnection connection = null;
            try {
                URL url = new URL(API_BASE + path);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setUseCaches(false);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Authorization", "Bearer " + apiReadAccessToken);

                int httpStatus = connection.getResponseCode();
                InputStream stream = httpStatus >= 200 && httpStatus < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                String responseText = stream == null ? "" : readFully(stream);
                long elapsedMs = Math.max(0L, System.currentTimeMillis() - startedAt);
                int tmdbStatus = safeTmdbStatusCode(responseText);
                String retryAfter = safeHeader(connection, "Retry-After");
                String rateLimit = safeHeader(connection, "X-RateLimit-Limit");
                String rateRemaining = safeHeader(connection, "X-RateLimit-Remaining");
                String rateReset = safeHeader(connection, "X-RateLimit-Reset");

                String trace = "Request " + requestNumber + " · " + label
                        + " · HTTP " + httpStatus
                        + (tmdbStatus > 0 ? " · TMDB " + tmdbStatus : "")
                        + " · " + elapsedMs + " ms"
                        + headerSuffix("Retry-After", retryAfter)
                        + headerSuffix("Rate-Limit", rateLimit)
                        + headerSuffix("Remaining", rateRemaining)
                        + headerSuffix("Reset", rateReset);

                if (httpStatus >= 200 && httpStatus < 300) {
                    Log.i(TAG, trace);
                    sleepBetweenRequests();
                    return responseText.isEmpty() ? new JSONObject() : new JSONObject(responseText);
                }

                String statusMessage = safeStatusMessage(responseText);
                if (!statusMessage.isEmpty()) trace += " · " + statusMessage;
                throw new DiagnosticFailure(trace);
            } catch (DiagnosticFailure failure) {
                throw failure;
            } catch (IOException error) {
                long elapsedMs = Math.max(0L, System.currentTimeMillis() - startedAt);
                throw new DiagnosticFailure("Request " + requestNumber + " · " + label
                        + " · Netzwerkfehler · " + elapsedMs + " ms");
            } catch (Exception error) {
                long elapsedMs = Math.max(0L, System.currentTimeMillis() - startedAt);
                throw new DiagnosticFailure("Request " + requestNumber + " · " + label
                        + " · Antwort nicht verarbeitbar · " + elapsedMs + " ms");
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
    }

    static final class Result {
        private final boolean complete;
        private final int requestCount;
        private final String summary;

        private Result(boolean complete, int requestCount, String summary) {
            this.complete = complete;
            this.requestCount = requestCount;
            this.summary = summary;
        }

        static Result success(String summary) {
            return new Result(true, 0, summary);
        }

        static Result failure(int requestCount, String summary) {
            return new Result(false, requestCount, summary);
        }

        static Result unavailable(String reason) {
            return new Result(false, 0, "nicht verfügbar: " + reason);
        }

        boolean isComplete() {
            return complete;
        }

        int getRequestCount() {
            return requestCount;
        }

        String getSummary() {
            return summary;
        }
    }

    private static final class DiagnosticFailure extends Exception {
        private final String summary;

        DiagnosticFailure(String summary) {
            super(summary);
            this.summary = summary;
        }
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (Exception impossible) {
            return "";
        }
    }

    private static String safeHeader(HttpURLConnection connection, String name) {
        if (connection == null) return "";
        String value = connection.getHeaderField(name);
        return value == null ? "" : value.trim();
    }

    private static String headerSuffix(String label, String value) {
        return value == null || value.isEmpty() ? "" : " · " + label + " " + value;
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

    private static int safeTmdbStatusCode(String responseText) {
        if (responseText == null || responseText.isEmpty()) return 0;
        try {
            return new JSONObject(responseText).optInt("status_code", 0);
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static String safeStatusMessage(String responseText) {
        if (responseText == null || responseText.isEmpty()) return "";
        try {
            String message = new JSONObject(responseText).optString("status_message").trim();
            if (message.length() > 140) return message.substring(0, 140);
            return message;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static void sleepBetweenRequests() {
        try {
            Thread.sleep(INTER_REQUEST_DELAY_MS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
