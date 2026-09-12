package de.matthiasennen.moviehub;

import org.json.JSONArray;
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
import java.text.Normalizer;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** Native TMDB authentication and personal-catalog client. Secrets never cross the WebView bridge. */
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
        request("GET", "/account?session_id=" + encode(sessionId), apiReadAccessToken, null);
    }

    static JSONObject fetchPersonalCatalog(String apiReadAccessToken, String sessionId)
            throws TmdbException {
        String encodedSession = encode(sessionId);
        JSONObject account = request(
                "GET", "/account?session_id=" + encodedSession, apiReadAccessToken, null);
        long accountId = account.optLong("id", 0);
        if (accountId <= 0) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "TMDB hat keine gültige Account-ID geliefert.");
        }

        Map<Integer, String> movieGenres = fetchGenreNames(apiReadAccessToken, "movie");
        Map<Integer, String> tvGenres = fetchGenreNames(apiReadAccessToken, "tv");
        LinkedHashMap<String, JSONObject> titles = new LinkedHashMap<>();

        mergePagedList(titles, apiReadAccessToken, encodedSession, accountId,
                "movie", "favorite/movies", "favorite", movieGenres);
        mergePagedList(titles, apiReadAccessToken, encodedSession, accountId,
                "tv", "favorite/tv", "favorite", tvGenres);
        mergePagedList(titles, apiReadAccessToken, encodedSession, accountId,
                "movie", "watchlist/movies", "watchlist", movieGenres);
        mergePagedList(titles, apiReadAccessToken, encodedSession, accountId,
                "tv", "watchlist/tv", "watchlist", tvGenres);
        mergePagedList(titles, apiReadAccessToken, encodedSession, accountId,
                "movie", "rated/movies", "rated", movieGenres);
        mergePagedList(titles, apiReadAccessToken, encodedSession, accountId,
                "tv", "rated/tv", "rated", tvGenres);

        int favoriteCount = 0;
        int watchlistCount = 0;
        int ratedCount = 0;
        JSONArray resultTitles = new JSONArray();
        for (JSONObject title : titles.values()) {
            if (title.optBoolean("favorite")) favoriteCount++;
            if (title.optBoolean("watchlist")) watchlistCount++;
            if (title.optBoolean("rated")) ratedCount++;
            try {
                title.put("providerIds", fetchSupportedProviders(
                        apiReadAccessToken,
                        title.optString("mediaType"),
                        title.optLong("tmdbId")));
            } catch (Exception ignored) {
                // Provider availability enriches the catalog but must not make
                // a valid personal-list sync fail. The public catalog can still
                // supply provider data for titles it already contains.
                try { title.put("providerIds", new JSONArray()); } catch (Exception ignoredJson) {}
            }
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
            return result;
        } catch (Exception error) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Der persönliche TMDB-Katalog konnte nicht aufbereitet werden.");
        }
    }

    private static void mergePagedList(
            LinkedHashMap<String, JSONObject> target,
            String apiReadAccessToken,
            String encodedSession,
            long accountId,
            String mediaType,
            String endpoint,
            String membership,
            Map<Integer, String> genreNames) throws TmdbException {
        int page = 1;
        int order = 0;
        int totalPages;
        do {
            String path = "/account/" + accountId + "/" + endpoint
                    + "?language=de-DE&page=" + page
                    + "&sort_by=created_at.desc&session_id=" + encodedSession;
            JSONObject response = request("GET", path, apiReadAccessToken, null);
            JSONArray results = response.optJSONArray("results");
            if (results != null) {
                for (int index = 0; index < results.length(); index++) {
                    JSONObject raw = results.optJSONObject(index);
                    if (raw == null || raw.optLong("id", 0) <= 0) continue;
                    order++;
                    String key = mediaType + ":" + raw.optLong("id");
                    JSONObject normalized = target.get(key);
                    if (normalized == null) {
                        normalized = normalizeListTitle(raw, mediaType, genreNames);
                        target.put(key, normalized);
                    }
                    try {
                        normalized.put(membership, true);
                        normalized.put(membership + "Order", order);
                        if ("rated".equals(membership)) {
                            JSONObject rating = raw.optJSONObject("rating");
                            double ratingValue = rating == null ? 0 : rating.optDouble("value", 0);
                            if (ratingValue > 0) normalized.put("ratingValue", ratingValue);
                        }
                    } catch (Exception ignored) {}
                }
            }
            totalPages = Math.max(1, response.optInt("total_pages", 1));
            page++;
        } while (page <= totalPages);
    }

    private static JSONObject normalizeListTitle(
            JSONObject raw, String mediaType, Map<Integer, String> genreNames) throws TmdbException {
        try {
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
        } catch (Exception error) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Ein persönlicher TMDB-Titel konnte nicht verarbeitet werden.");
        }
    }

    private static Map<Integer, String> fetchGenreNames(String apiReadAccessToken, String mediaType)
            throws TmdbException {
        JSONObject response = request(
                "GET", "/genre/" + mediaType + "/list?language=de-DE",
                apiReadAccessToken, null);
        Map<Integer, String> names = new HashMap<>();
        JSONArray genres = response.optJSONArray("genres");
        if (genres != null) {
            for (int index = 0; index < genres.length(); index++) {
                JSONObject genre = genres.optJSONObject(index);
                if (genre != null && genre.optInt("id") > 0) {
                    names.put(genre.optInt("id"), genre.optString("name"));
                }
            }
        }
        return names;
    }

    private static JSONArray fetchSupportedProviders(
            String apiReadAccessToken, String mediaType, long tmdbId) throws TmdbException {
        JSONObject response = request(
                "GET", "/" + mediaType + "/" + tmdbId + "/watch/providers",
                apiReadAccessToken, null);
        JSONObject regions = response.optJSONObject("results");
        JSONObject de = regions == null ? null : regions.optJSONObject("DE");
        Set<String> providerIds = new LinkedHashSet<>();
        if (de != null) {
            for (String offerType : new String[] { "flatrate", "free", "ads", "rent", "buy" }) {
                JSONArray providers = de.optJSONArray(offerType);
                if (providers == null) continue;
                for (int index = 0; index < providers.length(); index++) {
                    JSONObject provider = providers.optJSONObject(index);
                    String movieHubId = provider == null
                            ? null
                            : supportedProviderId(provider.optString("provider_name"));
                    if (movieHubId != null) providerIds.add(movieHubId);
                }
            }
        }
        JSONArray result = new JSONArray();
        for (String providerId : providerIds) result.put(providerId);
        return result;
    }

    private static String supportedProviderId(String providerName) {
        String normalized = Normalizer.normalize(providerName == null ? "" : providerName,
                        Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^A-Za-z0-9]", "")
                .toLowerCase(java.util.Locale.ROOT);
        if ("netflix".equals(normalized)) return "netflix";
        if ("amazonprimevideo".equals(normalized) || "primevideo".equals(normalized)) return "prime";
        if ("disneyplus".equals(normalized)) return "disney";
        if ("youtube".equals(normalized)) return "youtube";
        if ("waiputv".equals(normalized)) return "waipu";
        return null;
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

    private static String encode(String value) throws TmdbException {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (Exception impossible) {
            throw new TmdbException(ErrorKind.RESPONSE, 0,
                    "Die TMDB-Session konnte nicht verarbeitet werden.");
        }
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
