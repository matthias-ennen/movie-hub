package de.matthiasennen.moviehub;

import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Shared app-level AES-256-GCM helper for encrypted personal Firestore fields. */
final class PersonalDataCrypto {
    static final int CRYPTO_VERSION = 1;
    private static final String ALGORITHM = "A256GCM";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private PersonalDataCrypto() { }

    static boolean isAvailable() {
        return readKey() != null;
    }

    static String encrypt(String purpose, String clearText) throws Exception {
        byte[] key = requireKey();
        byte[] iv = new byte[IV_BYTES];
        RANDOM.nextBytes(iv);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(TAG_BITS, iv));
        cipher.updateAAD(normalizePurpose(purpose).getBytes(StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(
                (clearText == null ? "" : clearText).getBytes(StandardCharsets.UTF_8));

        JSONObject envelope = new JSONObject();
        envelope.put("cryptoVersion", CRYPTO_VERSION);
        envelope.put("algorithm", ALGORITHM);
        envelope.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
        envelope.put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP));
        return envelope.toString();
    }

    static String decrypt(String purpose, String envelopeJson) throws Exception {
        byte[] key = requireKey();
        JSONObject envelope = new JSONObject(envelopeJson);
        if (envelope.optInt("cryptoVersion", -1) != CRYPTO_VERSION
                || !ALGORITHM.equals(envelope.optString("algorithm"))) {
            throw new IllegalArgumentException("Unbekannte Movie-Hub-Kryptoversion.");
        }

        byte[] iv = Base64.decode(envelope.getString("iv"), Base64.DEFAULT);
        byte[] encrypted = Base64.decode(envelope.getString("ciphertext"), Base64.DEFAULT);
        if (iv.length != IV_BYTES) {
            throw new IllegalArgumentException("Ungültiger Movie-Hub-IV.");
        }

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(TAG_BITS, iv));
        cipher.updateAAD(normalizePurpose(purpose).getBytes(StandardCharsets.UTF_8));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private static byte[] requireKey() {
        byte[] key = readKey();
        if (key == null) {
            throw new IllegalStateException("Movie-Hub-Schlüssel für persönliche Daten fehlt.");
        }
        return key;
    }

    private static byte[] readKey() {
        try {
            String encoded = BuildConfig.PERSONAL_DATA_KEY_B64;
            if (encoded == null || encoded.trim().isEmpty()) return null;
            byte[] key = Base64.decode(encoded, Base64.DEFAULT);
            return key.length == 32 ? key : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String normalizePurpose(String purpose) {
        String value = purpose == null ? "" : purpose.trim();
        if (value.isEmpty()) throw new IllegalArgumentException("Verschlüsselungszweck fehlt.");
        return "movie-hub-personal-data-v1:" + value;
    }
}
