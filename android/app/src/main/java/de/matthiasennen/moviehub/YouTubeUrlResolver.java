package de.matthiasennen.moviehub;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

/** Converts supported public YouTube video URLs into a stable watch URL. */
final class YouTubeUrlResolver {
    private static final Pattern VIDEO_ID = Pattern.compile("[A-Za-z0-9_-]{11}");

    private YouTubeUrlResolver() { }

    static String canonicalWatchUrl(String rawUrl) {
        if (rawUrl == null) return null;

        final URI uri;
        try {
            uri = URI.create(rawUrl.trim());
        } catch (IllegalArgumentException ignored) {
            return null;
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null
                || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
            return null;
        }

        String normalizedHost = host.toLowerCase(Locale.ROOT);
        String videoId = null;
        if ("youtu.be".equals(normalizedHost)) {
            videoId = firstPathSegment(uri.getPath());
        } else if (isDomainOrSubdomain(normalizedHost, "youtube.com")
                && "/watch".equals(uri.getPath())) {
            videoId = queryParameter(uri.getRawQuery(), "v");
        }

        if (videoId == null || !VIDEO_ID.matcher(videoId).matches()) return null;
        return "https://www.youtube.com/watch?v=" + videoId;
    }

    private static String firstPathSegment(String path) {
        if (path == null || path.length() <= 1) return null;
        int nextSlash = path.indexOf('/', 1);
        String segment = nextSlash < 0 ? path.substring(1) : path.substring(1, nextSlash);
        return decode(segment);
    }

    private static String queryParameter(String rawQuery, String expectedName) {
        if (rawQuery == null) return null;
        for (String pair : rawQuery.split("&")) {
            int separator = pair.indexOf('=');
            String rawName = separator < 0 ? pair : pair.substring(0, separator);
            if (!expectedName.equals(decode(rawName))) continue;
            return decode(separator < 0 ? "" : pair.substring(separator + 1));
        }
        return null;
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8.name());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isDomainOrSubdomain(String host, String domain) {
        return domain.equals(host) || host.endsWith("." + domain);
    }
}
