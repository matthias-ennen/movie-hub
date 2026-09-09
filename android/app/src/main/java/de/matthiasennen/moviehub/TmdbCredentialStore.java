package de.matthiasennen.moviehub;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores the device-wide personal TMDB API token and session encrypted with Android Keystore. */
final class TmdbCredentialStore {
    static final class Credentials {
        private final String apiReadAccessToken;
        private final String sessionId;
        private final String username;

        Credentials(String apiReadAccessToken, String sessionId, String username) {
            this.apiReadAccessToken = normalize(apiReadAccessToken);
            this.sessionId = normalize(sessionId);
            this.username = normalize(username);
        }

        String getApiReadAccessToken() {
            return apiReadAccessToken;
        }

        String getSessionId() {
            return sessionId;
        }

        String getUsername() {
            return username;
        }

        boolean hasApiToken() {
            return !apiReadAccessToken.isEmpty();
        }

        boolean hasSession() {
            return !sessionId.isEmpty();
        }

        private static String normalize(String value) {
            return value == null ? "" : value.trim();
        }
    }

    private static final String PREFERENCES = "movie_hub_tmdb_credentials";
    private static final String PREFERENCE_VALUE = "encrypted_credentials_v1";
    private static final String KEY_ALIAS = "movie_hub_tmdb_credentials_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private final SharedPreferences preferences;

    TmdbCredentialStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    Credentials load() {
        String value = preferences.getString(PREFERENCE_VALUE, null);
        if (value == null || value.isEmpty()) {
            return new Credentials("", "", "");
        }

        try {
            String[] parts = value.split(":", 2);
            if (parts.length != 2) throw new IllegalStateException("Invalid encrypted TMDB data.");

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(),
                    new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            byte[] clear = cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP));
            JSONObject json = new JSONObject(new String(clear, StandardCharsets.UTF_8));
            return new Credentials(
                    json.optString("apiReadAccessToken"),
                    json.optString("sessionId"),
                    json.optString("username"));
        } catch (Exception ignored) {
            clearAll();
            return new Credentials("", "", "");
        }
    }

    boolean saveApiToken(String apiReadAccessToken) {
        String normalizedToken = apiReadAccessToken == null ? "" : apiReadAccessToken.trim();
        if (normalizedToken.isEmpty()) return false;

        Credentials current = load();
        boolean unchanged = normalizedToken.equals(current.getApiReadAccessToken());
        return save(new Credentials(
                normalizedToken,
                unchanged ? current.getSessionId() : "",
                unchanged ? current.getUsername() : ""));
    }

    boolean saveSession(String sessionId, String username) {
        Credentials current = load();
        if (!current.hasApiToken()) return false;
        String normalizedSession = sessionId == null ? "" : sessionId.trim();
        if (normalizedSession.isEmpty()) return false;
        return save(new Credentials(current.getApiReadAccessToken(), normalizedSession, username));
    }

    void clearSession() {
        Credentials current = load();
        if (!current.hasApiToken()) {
            clearAll();
            return;
        }
        save(new Credentials(current.getApiReadAccessToken(), "", ""));
    }

    void clearAll() {
        preferences.edit().remove(PREFERENCE_VALUE).apply();
    }

    private boolean save(Credentials credentials) {
        try {
            JSONObject json = new JSONObject();
            json.put("apiReadAccessToken", credentials.getApiReadAccessToken());
            json.put("sessionId", credentials.getSessionId());
            json.put("username", credentials.getUsername());

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(json.toString().getBytes(StandardCharsets.UTF_8));
            String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            return preferences.edit().putString(PREFERENCE_VALUE, value).commit();
        } catch (Exception ignored) {
            return false;
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey existing = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        if (existing != null) return existing;

        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
