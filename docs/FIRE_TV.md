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

The `Android APK` GitHub Actions workflow creates a sideloadable debug APK artifact. It is suitable for the first device test. Stable release signing and update continuity are deliberately handled before distributing an APK beyond this test phase.

## Sideload test

After the workflow succeeds, download `movie-hub-fire-tv-debug-apk` from its Actions run, extract `app-debug.apk`, and install it with the chosen sideload method. The next phase covers WebView lifecycle, session handling, and native bridge behavior; the following phase covers remote-control testing on the actual Fire TV Stick.
