package de.matthiasennen.moviehub;

import android.content.Context;
import android.webkit.WebView;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Executes personal TMDB reads outside the WebView and returns only sanitized
 * catalog JSON. API token and session ID never cross the JavaScript bridge.
 */
final class TmdbCatalogSyncCoordinator {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean IN_FLIGHT = new AtomicBoolean(false);

    private TmdbCatalogSyncCoordinator() {}

    static void request(Context context, WebView webView) {
        if (!IN_FLIGHT.compareAndSet(false, true)) {
            deliver(webView, errorPayload("Eine TMDB-Synchronisierung läuft bereits."));
            return;
        }

        Context appContext = context.getApplicationContext();
        EXECUTOR.submit(() -> {
            JSONObject result;
            try {
                TmdbCredentialStore.Credentials credentials =
                        new TmdbCredentialStore(appContext).load();
                if (!credentials.hasApiToken() || !credentials.hasSession()) {
                    result = errorPayload(
                            "Verbinde unter Einstellungen zuerst den persönlichen TMDB-Zugang vollständig.");
                } else {
                    result = TmdbApiClient.fetchPersonalCatalog(
                            credentials.getApiReadAccessToken(), credentials.getSessionId());
                    result.put("ok", true);
                    result.put("syncedAt", isoNow());
                }
            } catch (TmdbApiClient.TmdbException error) {
                result = errorPayload(error.getMessage() == null
                        ? "TMDB-Synchronisierung fehlgeschlagen."
                        : error.getMessage());
            } catch (Exception error) {
                result = errorPayload("Der persönliche TMDB-Katalog konnte nicht synchronisiert werden.");
            } finally {
                IN_FLIGHT.set(false);
            }
            deliver(webView, result);
        });
    }

    private static JSONObject errorPayload(String message) {
        JSONObject result = new JSONObject();
        try {
            result.put("ok", false);
            result.put("error", message);
        } catch (Exception ignored) {}
        return result;
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static void deliver(WebView webView, JSONObject payload) {
        if (webView == null) return;
        final String safeJsonString = JSONObject.quote(payload.toString());
        webView.post(() -> webView.evaluateJavascript(
                "typeof window.__movieHubTmdbSyncResult === 'function'"
                        + " ? window.__movieHubTmdbSyncResult(" + safeJsonString + ") : null",
                null));
    }
}
