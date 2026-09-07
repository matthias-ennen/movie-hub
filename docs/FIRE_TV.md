# Fire TV / Android

## Phase 3.1 wrapper

The Android application is a deliberately thin WebView shell for the Firebase-hosted Movie Hub app:

- App name: **Movie Hub**
- Package ID: `de.matthiasennen.moviehub`
- Orientation: landscape
- Minimum Android version: Android 6.0 (API 23)
- Target: Fire TV Stick 4K and Android devices
- Start URL: `https://movie-hub-62459.web.app/`
- Network: HTTPS only; an in-app retry screen is shown if the start page cannot be reached.

The `Android APK` GitHub Actions workflow always creates a sideloadable debug APK artifact. Once the repository secrets `MOVIE_HUB_KEYSTORE_BASE64` and `MOVIE_HUB_KEYSTORE_PASSWORD` are configured, it additionally creates a **signed release APK**. Install this release APK on Fire TV; future signed release builds use the same package ID, signing key and an automatically increasing version code, so Fire OS accepts them as updates.

## Sideload test

After the workflow succeeds, download `movie-hub-fire-tv-release-apk`, extract `app-release.apk`, and install it with the chosen sideload method. Use the debug artifact only until release signing is configured.

## Phase 3.2 WebView session and lifecycle

The WebView keeps Firebase's browser-local login session, cookies and web storage enabled. It saves and restores its page state across a normal Android recreation and pauses/resumes cleanly when the app moves into the background or foreground.

The Android Back button first calls the hosted Movie Hub UI: it closes an open detail view, profile menu or subpage just like the browser UI. The Android shell uses AndroidX's backward-compatible Back dispatcher on current phones, Fire TV and older Android versions alike. At Movie Hub's root it opens a native confirmation dialog with **Abbrechen** (the initially focused safe choice) and **Schließen**. Only **Schließen** ends the Android task; another Back press on the dialog acts as **Abbrechen**.

`MovieHubNative` is intentionally a narrow native bridge. It exposes the platform, app version and the explicit user-confirmed app close action; it never exposes credentials, Firebase data, storage or provider deep links. The next phase covers remote-control testing on the actual Fire TV Stick.
