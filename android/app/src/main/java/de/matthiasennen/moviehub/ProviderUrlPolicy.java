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

        // Linear station identities are bound to one exact reviewed URL.
        if (providerId != null && providerId.startsWith("air-")) {
            String exact = airStationTarget(providerId);
            return exact != null && exact.equals(rawUrl);
        }

        String host = uri.getHost().toLowerCase(Locale.ROOT);
        for (String domain : domainsFor(providerId)) {
            if (domain.equals(host) || host.endsWith("." + domain)) return true;
        }
        return false;
    }

    /** The exact shared target for the production launcher and the private device QA. */
    static String airStationTarget(String providerId) {
        if (providerId == null) return null;
        switch (providerId) {
            case "air-ard": return "https://www.ardmediathek.de/live/Y3JpZDovL2Rhc2Vyc3RlLmRlL2xpdmUvY2xpcC9hYmNhMDdhMy0zNDc2LTQ4NTEtYjE2Mi1mZGU4ZjY0NmQ0YzQ";
            case "air-zdf": return "https://www.zdf.de/live-tv/zdf-live-beitrag-100";
            case "air-rtl": return "https://plus.rtl.de/rtlde-rtl";
            case "air-pro7": return "https://www.joyn.de/live-tv/prosieben";
            case "air-sat1": return "https://www.joyn.de/live-tv/sat1";
            case "air-vox": return "https://plus.rtl.de/rtlde-vox";
            case "air-arte": return "https://www.ardmediathek.de/live/arte-deutsch/Y3JpZDovL2FydGUuZGUvTGl2ZXN0cmVhbS1BUlRF";
            case "air-3sat": return "https://www.zdf.de/live-tv/3sat-live-beitrag-100";
            case "air-zdfneo": return "https://www.zdf.de/live-tv/zdfneo-live-beitrag-100";
            case "air-zdfinfo": return "https://www.zdf.de/live-tv/zdfinfo-live-beitrag-100";
            case "air-einsfestival": return "https://www.ardmediathek.de/live/one/Y3JpZDovL3dkci5kZS9CZWl0cmFnLTFlNjA0YWFlLTViODctNGMzNC04ZDhmLTg4OWI1ZjE2ZDU3Mw";
            case "air-kabeleins": return "https://www.joyn.de/live-tv/kabel-eins";
            case "air-rtl2": return "https://plus.rtl.de/rtlde-rtlzwei";
            case "air-superrtl": return "https://plus.rtl.de/rtlde-super-rtl";
            case "air-tele5": return "https://www.joyn.de/live-tv/tele-5";
            case "air-prosieben_maxx": return "https://www.joyn.de/live-tv/prosieben-maxx";
            case "air-sat1gold": return "https://www.joyn.de/live-tv/sat1-gold";
            case "air-rtlnitro": return "https://plus.rtl.de/rtlde-nitro";
            default: return null;
        }
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
