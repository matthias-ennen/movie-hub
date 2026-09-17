package de.matthiasennen.moviehub;

import android.webkit.JavascriptInterface;

/** Narrow WebView bridge exposing only personal-field encryption/decryption. */
final class PersonalDataCryptoBridge {
    @JavascriptInterface
    public boolean isAvailable() {
        return PersonalDataCrypto.isAvailable();
    }

    @JavascriptInterface
    public String encrypt(String purpose, String clearText) {
        try {
            return PersonalDataCrypto.encrypt(purpose, clearText);
        } catch (Exception error) {
            throw new IllegalStateException("Persönliche Movie-Hub-Daten konnten nicht verschlüsselt werden.", error);
        }
    }

    @JavascriptInterface
    public String decrypt(String purpose, String envelopeJson) {
        try {
            return PersonalDataCrypto.decrypt(purpose, envelopeJson);
        } catch (Exception error) {
            throw new IllegalStateException("Persönliche Movie-Hub-Daten konnten nicht entschlüsselt werden.", error);
        }
    }
}
