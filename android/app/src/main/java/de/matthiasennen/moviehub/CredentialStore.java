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
            remove(endpoint);
            return null;
        }
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
