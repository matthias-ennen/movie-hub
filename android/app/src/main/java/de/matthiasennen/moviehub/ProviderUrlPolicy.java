package de.matthiasennen.moviehub;

import java.net.URI;
import java.util.Locale;

/** Device-side allow-list for account-shared exact provider URLs. */
final class ProviderUrlPolicy {
    private ProviderUrlPolicy() { }

    static boolean isAllowed(String providerId, String rawUrl) {
        final URI uri;
        try {
            uri = URI.create(rawUrl == null ? "" : rawUrl.trim());
        } catch (IllegalArgumentException ignored) {
            return false;
        }

        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null) {
            return false;
        }

        String host = uri.getHost().toLowerCase(Locale.ROOT);
        for (String domain : domainsFor(providerId)) {
            if (domain.equals(host) || host.endsWith("." + domain)) return true;
        }
        return false;
    }

    private static String[] domainsFor(String providerId) {
        if (providerId == null) return new String[0];
        switch (providerId) {
            case "netflix": return new String[] { "netflix.com" };
            case "prime": return new String[] { "primevideo.com", "amazon.de" };
            case "disney": return new String[] { "disneyplus.com" };
            case "youtube": return new String[] { "youtube.com", "youtu.be" };
            case "joyn": return new String[] { "joyn.de" };
            case "wow": return new String[] { "wowtv.de" };
            case "appletv": return new String[] { "tv.apple.com" };
            case "paramount": return new String[] { "paramountplus.com" };
            case "rtlplus": return new String[] { "plus.rtl.de" };
            case "crunchyroll": return new String[] { "crunchyroll.com" };
            case "pluto": return new String[] { "pluto.tv" };
            case "ard": return new String[] { "ardmediathek.de" };
            case "zdf": return new String[] { "zdf.de" };
            case "arte": return new String[] { "arte.tv" };
            case "netzkino": return new String[] { "netzkino.de" };
            case "magenta": return new String[] { "magentatv.de" };
            case "waipu": return new String[] { "waipu.tv" };
            default: return new String[0];
        }
    }
}
