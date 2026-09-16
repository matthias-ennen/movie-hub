package de.matthiasennen.moviehub;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fault-tolerant personal TMDB catalog sync.
 *
 * The account/session lookup remains fatal. The six personal list sections are
 * fetched independently and atomically: only a completely loaded section is
 * merged into the outgoing catalog. Temporary network/429/5xx failures get one
 * retry. Failed sections are reported to the WebView so Firestore can preserve
 * their previous membership state instead of interpreting the failure as an
 * empty list.
 */
final class TmdbResilientCatalogSync {
    private static final String API_BASE = "https://api.themoviedb.org/3";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 15_000;
    private static final int MAX_ATTEMPTS = 2;
    private static final long DEFAULT_RETRY_DELAY_MS = 600L;
    private static final long MAX_RETRY_DELAY_MS = 10_000L;

    private static final SectionSpec[] SECTIONS = new SectionSpec[] {
            new SectionSpec("favorite_movies", "Favoriten Filme", "movie", "favorite/movies", "favorite"),
            new SectionSpec("favorite_tv", "Favoriten Serien", "tv", "favorite/tv", "favorite"),
            new SectionSpec("watchlist_movies", "Watchlist Filme", "movie", "watchlist/movies", "watchlist"),
            new SectionSpec("watchlist_tv", "Watchlist Serien", "tv", "watchlist/tv", "watchlist"),
            new SectionSpec("rated_movies", "Bewertungen Filme", "movie", "rated/movies", "rated"),
            new SectionSpec("rated_tv", "Bewertungen Serien", "tv", "rated/tv", "rated")
    };

    private TmdbResilientCatalogSync() {}

    static JSONObject fetchPersonalCatalog(String apiReadAccessToken, String sessionId)
            throws TmdbApiClient.TmdbException {
        String encodedSession = encode(sessionId);
        JSONObject account;
        try {
            account = requestWithRetry(
                    "/account?session_id=" + encodedSession,
                    apiReadAccessToken).payload;
        } catch (SyncException error) {
            throw asTmdbException(error);
        }

        long accountId = account.optLong("id", 0);
        if (accountId <= 0) {
            throw new TmdbApiClient.TmdbException(
                    TmdbApiClient.ErrorKind.RESPONSE,
                    0,
                    "TMDB hat keine gültige Account-ID geliefert.");
        }

        Map<Integer, String> movieGenres = fetchGenreNamesBestEffort(apiReadAccessToken, "movie");
        Map<Integer, String> tvGenres = fetchGenreNamesBestEffort(apiReadAccessToken, "tv");
        LinkedHashMap<String, JSONObject> titles = new LinkedHashMap<>();
        JSONArray sectionStatuses = new JSONArray();
        int successfulSections = 0;

        for (SectionSpec section : SECTIONS) {
            Map<Integer, String> genres = "movie".equals(section.mediaType) ? movieGenres : tvGenres;
            SectionOutcome outcome = fetchSection(
                    apiReadAccessToken,
                    encodedSession,
                    accountId,
                    section,
                    genres);
            sectionStatuses.put(outcome.toJson());
            if (!outcome.ok) continue;
            successfulSections++;
            mergeCompletedSection(titles, outcome.titles, section.membership);
        }

        JSONArray resultTitles = new JSONArray();
        int favoriteCount = 0;
        int watchlistCount = 0;
        int ratedCount = 0;
        for (JSONObject title : titles.values()) {
            if (title.optBoolean("favorite")) favoriteCount++;
            if (title.optBoolean("watchlist")) watchlistCount++;
            if (title.optBoolean("rated")) ratedCount++;
            enrichTitleBestEffort(apiReadAccessToken, title);
            resultTitles.put(title);
        }

        try {
            JSONObject safeAccount = new JSONObject();
            safeAccount.put("id", accountId);
            safeAccount.put("username", account.optString("username"));
            safeAccount.put("name", account.optString("name"));

            JSONObject counts = new JSONObject();
            counts.put("favorite", favoriteCount);
            counts.put("watchlist", watchlistCount);
            counts.put("rated", ratedCount);
            counts.put("total", titles.size());

            JSONObject result = new JSONObject();
            result.put("account", safeAccount);
            result.put("counts", counts);
            result.put("titles", resultTitles);
            result.put("sections", sectionStatuses);
            result.put("successfulSections", successfulSections);
            result.put("totalSections", SECTIONS.length);
            result.put("partial", successfulSections < SECTIONS.length);
            return result;
        } catch (Exception error) {
            throw new TmdbApiClient.TmdbException(
                    TmdbApiClient.ErrorKind.RESPONSE,
                    0,
                    "Der persönliche TMDB-Katalog konnte nicht aufbereitet werden.");
        }
    }

    private static SectionOutcome fetchSection(
            String apiReadAccessToken,
            String encodedSession,
            long accountId,
            SectionSpec section,
            Map<Integer, String> genreNames) {
        LinkedHashMap<String, JSONObject> sectionTitles = new LinkedHashMap<>();
        int page = 1;
        int order = 0;
        int totalPages;
        boolean retried = false;

        try {
            do {
                String path = "/account/" + accountId + "/" + section.endpoint
                        + "?language=de-DE&page=" + page
                        + "&sort_by=created_at.desc&session_id=" + encodedSession;
                Response response = requestWithRetry(path, apiReadAccessToken);
                retried = retried || response.attempts > 1;
                JSONArray results = response.payload.optJSONArray("results");
                if (results != null) {
                    for (int index = 0; index < results.length(); index++) {
                        JSONObject raw = results.optJSONObject(index);
                        if (raw == null || raw.optLong("id", 0) <= 0) continue;
                        order++;
                        String key = section.mediaType + ":" + raw.optLong("id");
                        JSONObject normalized = sectionTitles.get(key);
                        if (normalized == null) {
                            normalized = normalizeListTitle(raw, section.mediaType, genreNames);
                            sectionTitles.put(key, normalized);
                        }
                        normalized.put(section.membership, true);
                        normalized.put(section.membership + "Order", order);
                        if ("rated".equals(section.membership)) {
                            double ratingValue = extractRatingValue(raw.opt("rating"));
                            if (ratingValue > 0) normalized.put("ratingValue", ratingValue);
                        }
                    }
                }
                totalPages = Math.max(1, response.payload.optInt("total_pages", 1));
                page++;
            } while (page <= totalPages);
            return SectionOutcome.success(section, sectionTitles, order, retried);
        } catch (Exception error) {
            return SectionOutcome.failure(section, error, retried);
        }
    }

    private static void mergeCompletedSection(
            LinkedHashMap<String, JSONObject> target,
            LinkedHashMap<String, JSONObject> sectionTitles,
            String membership) {
        for (Map.Entry<String, JSONObject> entry : sectionTitles.entrySet()) {
            JSONObject incoming = entry.getValue();
            JSONObject current = target.get(entry.getKey());
            if (current == null) {
                target.put(entry.getKey(), incoming);
                continue;
            }
            try {
                current.put(membership, true);
                current.put(membership + "Order", incoming.optInt(membership + "Order", 0));
                if ("rated".equals(membership) && incoming.has("ratingValue")) {
                    current.put("ratingValue", incoming.optDouble("ratingValue"));
                }
                // A later successful list can improve a weak list title without
                // changing memberships already collected from earlier sections.
                if (current.optString("title").trim().isEmpty()
                        && !incoming.optString("title").trim().isEmpty()) {
                    current.put("title", incoming.optString("title"));
                }
                if (current.optString("originalTitle").trim().isEmpty()
                        && !incoming.optString("originalTitle").trim().isEmpty()) {
                    current.put("originalTitle", incoming.optString("originalTitle"));
                }
            } catch (Exception ignored) {}
        }
    }

    private static JSONObject normalizeListTitle(
            JSONObject raw,
            String mediaType,
            Map<Integer, String> genreNames) throws Exception {
        boolean movie = "movie".equals(mediaType);
        long tmdbId = raw.optLong("id");
        String title = movie ? raw.optString("title") : raw.optString("name");
        String originalTitle = movie
                ? raw.optString("original_title")
                : raw.optString("original_name");
        String releaseDate = movie
                ? raw.optString("release_date")
                : raw.optString("first_air_date");

        JSONArray names = new JSONArray();
        JSONArray ids = raw.optJSONArray("genre_ids");
        if (ids != null) {
            for (int index = 0; index < ids.length(); index++) {
                String name = genreNames.get(ids.optInt(index));
                if (name != null && !name.isEmpty()) names.put(name);
            }
        }

        JSONObject result = new JSONObject();
        result.put("tmdbId", tmdbId);
        result.put("mediaType", mediaType);
        result.put("title", title.isEmpty() ? originalTitle : title);
        result.put("originalTitle", originalTitle);
        result.put("description", raw.optString("overview"));
        result.put("releaseDate", releaseDate);
        result.put("posterPath", raw.optString("poster_path", null));
        result.put("backdropPath", raw.optString("backdrop_path", null));
        result.put("originalLanguage", raw.optString("original_language", null));
        result.put("voteAverage", raw.optDouble("vote_average", 0));
        result.put("voteCount", raw.optLong("vote_count", 0));
        result.put("genreNames", names);
        result.put("favorite", false);
        result.put("watchlist", false);
        result.put("rated", false);
        return result;
    }

    private static double extractRatingValue(Object rawRating) {
        final double ratingValue;
        if (rawRating instanceof Number) {
            ratingValue = ((Number) rawRating).doubleValue();
        } else if (rawRating instanceof JSONObject) {
            ratingValue = ((JSONObject) rawRating).optDouble("value", 0);
        } else {
            return 0;
        }
        return Double.isFinite(ratingValue) && ratingValue > 0 ? ratingValue : 0;
    }

    private static Map<Integer, String> fetchGenreNamesBestEffort(
            String apiReadAccessToken,
            String mediaType) {
        Map<Integer, String> names = new HashMap<>();
        try {
            Response response = requestWithRetry(
                    "/genre/" + mediaType + "/list?language=de-DE",
                    apiReadAccessToken);
            JSONArray genres = response.payload.optJSONArray("genres");
            if (genres != null) {
                for (int index = 0; index < genres.length(); index++) {
                    JSONObject genre = genres.optJSONObject(index);
                    if (genre != null && genre.optInt("id") > 0) {
                        names.put(genre.optInt("id"), genre.optString("name"));
                    }
                }
            }
        } catch (Exception ignored) {
            // Genre labels enrich the catalog but are not a membership source.
        }
        return names;
    }

    private static void enrichTitleBestEffort(String apiReadAccessToken, JSONObject title) {
        try {
            JSONObject detail = TmdbApiClient.fetchTitleMetadata(
                    apiReadAccessToken,
                    title.optString("mediaType"),
                    title.optLong("tmdbId"));
            Iterator<String> keys = detail.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if ("favorite".equals(key)
                        || "watchlist".equals(key)
                        || "rated".equals(key)
                        || "ratingValue".equals(key)
                        || "favoriteOrder".equals(key)
                        || "watchlistOrder".equals(key)
                        || "ratedOrder".equals(key)
                        || "ratingOrder".equals(key)) {
                    continue;
                }
                title.put(key, detail.opt(key));
            }
        } catch (Exception ignored) {
            // Full metadata is optional for the personal list sync. The list
            // snapshot remains valid and can be hydrated later by Movie Hub.
        }
    }

    static boolean isTransient(int statusCode, boolean networkFailure) {
        return networkFailure || statusCode == 429 || statusCode >= 500;
    }

    private static Response requestWithRetry(String path, String apiReadAccessToken)
            throws SyncException {
        SyncException lastError = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return new Response(request(path, apiReadAccessToken), attempt);
            } catch (SyncException error) {
                lastError = error;
                if (attempt >= MAX_ATTEMPTS || !isTransient(error.statusCode, error.networkFailure)) {
                    throw error;
                }
                long delay = error.retryAfterMs > 0 ? error.retryAfterMs : DEFAULT_RETRY_DELAY_MS;
                delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(0L, delay));
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw error;
                }
            }
        }
        throw lastError == null
                ? new SyncException(0, false, true, 0, "TMDB-Anfrage fehlgeschlagen.")
                : lastError;
    }

    private static JSONObject request(String path, String apiReadAccessToken) throws SyncException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(API_BASE + path).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiReadAccessToken);

            int statusCode = connection.getResponseCode();
            InputStream stream = statusCode >= 200 && statusCode < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String responseText = stream == null ? "" : readFully(stream);
            if (statusCode < 200 || statusCode >= 300) {
                String statusMessage = safeStatusMessage(responseText);
                int tmdbStatusCode = safeTmdbStatusCode(responseText);
                String message = statusMessage.isEmpty()
                        ? "TMDB hat die Anfrage abgelehnt."
                        : statusMessage;
                if (tmdbStatusCode > 0) message = "TMDB-Status " + tmdbStatusCode + ": " + message;
                boolean authentication = statusCode == 401 || statusCode == 403;
                throw new SyncException(
                        statusCode,
                        authentication,
                        false,
                        retryAfterMillis(connection.getHeaderField("Retry-After")),
                        message);
            }
            return responseText.isEmpty() ? new JSONObject() : new JSONObject(responseText);
        } catch (SyncException error) {
            throw error;
        } catch (IOException error) {
            throw new SyncException(
                    0,
                    false,
                    true,
                    0,
                    "TMDB ist über die aktuelle Internetverbindung nicht erreichbar.");
        } catch (Exception error) {
            throw new SyncException(
                    0,
                    false,
                    false,
                    0,
                    "Die Antwort von TMDB konnte nicht verarbeitet werden.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static long retryAfterMillis(String value) {
        if (value == null || value.trim().isEmpty()) return 0;
        try {
            long seconds = Long.parseLong(value.trim());
            return Math.max(0L, seconds * 1_000L);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static String encode(String value) throws TmdbApiClient.TmdbException {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (Exception impossible) {
            throw new TmdbApiClient.TmdbException(
                    TmdbApiClient.ErrorKind.RESPONSE,
                    0,
                    "Die TMDB-Session konnte nicht verarbeitet werden.");
        }
    }

    private static TmdbApiClient.TmdbException asTmdbException(SyncException error) {
        TmdbApiClient.ErrorKind kind;
        if (error.authentication) kind = TmdbApiClient.ErrorKind.AUTHENTICATION;
        else if (error.networkFailure) kind = TmdbApiClient.ErrorKind.NETWORK;
        else if (error.statusCode >= 500) kind = TmdbApiClient.ErrorKind.SERVICE;
        else kind = TmdbApiClient.ErrorKind.RESPONSE;
        return new TmdbApiClient.TmdbException(kind, error.statusCode, error.getMessage());
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
            return message.length() > 180 ? message.substring(0, 180) : message;
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

    private static final class SectionSpec {
        final String id;
        final String label;
        final String mediaType;
        final String endpoint;
        final String membership;

        SectionSpec(String id, String label, String mediaType, String endpoint, String membership) {
            this.id = id;
            this.label = label;
            this.mediaType = mediaType;
            this.endpoint = endpoint;
            this.membership = membership;
        }
    }

    private static final class SectionOutcome {
        final SectionSpec section;
        final boolean ok;
        final LinkedHashMap<String, JSONObject> titles;
        final int count;
        final boolean retried;
        final String error;

        private SectionOutcome(
                SectionSpec section,
                boolean ok,
                LinkedHashMap<String, JSONObject> titles,
                int count,
                boolean retried,
                String error) {
            this.section = section;
            this.ok = ok;
            this.titles = titles;
            this.count = count;
            this.retried = retried;
            this.error = error;
        }

        static SectionOutcome success(
                SectionSpec section,
                LinkedHashMap<String, JSONObject> titles,
                int count,
                boolean retried) {
            return new SectionOutcome(section, true, titles, count, retried, null);
        }

        static SectionOutcome failure(SectionSpec section, Exception error, boolean retried) {
            String message = error.getMessage();
            if (message == null || message.trim().isEmpty()) message = "TMDB-Anfrage fehlgeschlagen.";
            if (error instanceof SyncException) {
                SyncException syncError = (SyncException) error;
                if (syncError.statusCode > 0) message = "HTTP " + syncError.statusCode + " · " + message;
            }
            if (message.length() > 220) message = message.substring(0, 220);
            return new SectionOutcome(section, false, new LinkedHashMap<>(), 0, retried, message);
        }

        JSONObject toJson() {
            JSONObject result = new JSONObject();
            try {
                result.put("id", section.id);
                result.put("label", section.label);
                result.put("mediaType", section.mediaType);
                result.put("membership", section.membership);
                result.put("ok", ok);
                result.put("count", ok ? count : JSONObject.NULL);
                result.put("retried", retried);
                result.put("preserved", !ok);
                if (!ok) result.put("error", error);
            } catch (Exception ignored) {}
            return result;
        }
    }

    private static final class Response {
        final JSONObject payload;
        final int attempts;

        Response(JSONObject payload, int attempts) {
            this.payload = payload;
            this.attempts = attempts;
        }
    }

    private static final class SyncException extends Exception {
        final int statusCode;
        final boolean authentication;
        final boolean networkFailure;
        final long retryAfterMs;

        SyncException(
                int statusCode,
                boolean authentication,
                boolean networkFailure,
                long retryAfterMs,
                String message) {
            super(message);
            this.statusCode = statusCode;
            this.authentication = authentication;
            this.networkFailure = networkFailure;
            this.retryAfterMs = retryAfterMs;
        }
    }
}
