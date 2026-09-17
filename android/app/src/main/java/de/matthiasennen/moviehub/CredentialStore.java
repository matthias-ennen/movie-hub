package de.matthiasennen.moviehub;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores SMB credentials only on this device, encrypted with Android Keystore. */
final class CredentialStore {
    private static final String PREFERENCES = "movie_hub_smb_credentials";
    private static final String KEY_ALIAS = "movie_hub_smb_credentials_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private final SharedPreferences preferences;

    CredentialStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    SmbCredentials load(String endpoint) {
        return loadWithoutRemovingOnFailure(endpoint, true);
    }

    /**
     * Migrates one or more legacy endpoint aliases to the canonical endpoint.
     * Identical credentials are safe to collapse. Conflicting legacy credentials are preserved
     * and deliberately not guessed; the user can then re-enter the correct credentials once.
     */
    boolean migrateAliases(String canonicalEndpoint, List<String> legacyEndpoints) {
        if (loadWithoutRemovingOnFailure(canonicalEndpoint, false) != null) return true;

        SmbCredentials candidate = null;
        boolean foundAny = false;
        for (String legacyEndpoint : legacyEndpoints) {
            if (legacyEndpoint == null || legacyEndpoint.equals(canonicalEndpoint)) continue;
            SmbCredentials legacy = loadWithoutRemovingOnFailure(legacyEndpoint, false);
            if (legacy == null) continue;
            foundAny = true;
            if (candidate == null) {
                candidate = legacy;
            } else if (!sameCredentials(candidate, legacy)) {
                // Preserve all legacy values. We cannot know which conflicting set is valid.
                return false;
            }
        }

        if (!foundAny || candidate == null) return true;
        if (!save(canonicalEndpoint, candidate)) return false;

        // Only remove aliases after the canonical encrypted copy was written successfully.
        for (String legacyEndpoint : legacyEndpoints) {
            if (legacyEndpoint != null && !legacyEndpoint.equals(canonicalEndpoint)) {
                remove(legacyEndpoint);
            }
        }
        return true;
    }

    boolean save(String endpoint, SmbCredentials credentials) {
        try {
            JSONObject json = new JSONObject();
            json.put("username", credentials.getUsername());
            json.put("password", credentials.getPassword());
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(json.toString().getBytes(StandardCharsets.UTF_8));
            String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            return preferences.edit().putString(preferenceKey(endpoint), value).commit();
        } catch (Exception ignored) {
            return false;
        }
    }

    void remove(String endpoint) {
        preferences.edit().remove(preferenceKey(endpoint)).apply();
    }

    private SmbCredentials loadWithoutRemovingOnFailure(String endpoint, boolean removeCorrupt) {
        String value = preferences.getString(preferenceKey(endpoint), null);
        if (value == null) return null;
        try {
            String[] parts = value.split(":", 2);
            if (parts.length != 2) return null;
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(),
                    new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            byte[] clear = cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP));
            JSONObject json = new JSONObject(new String(clear, StandardCharsets.UTF_8));
            return new SmbCredentials(json.optString("username"), json.optString("password"));
        } catch (Exception ignored) {
            if (removeCorrupt) remove(endpoint);
            return null;
        }
    }

    private boolean sameCredentials(SmbCredentials left, SmbCredentials right) {
        return left.getUsername().equals(right.getUsername())
                && left.getPassword().equals(right.getPassword());
    }

    private String preferenceKey(String endpoint) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(endpoint.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(digest, Base64.NO_WRAP | Base64.URL_SAFE);
        } catch (Exception impossible) {
            throw new IllegalStateException(impossible);
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
