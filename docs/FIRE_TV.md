# Fire TV / Android

## Phase 3.1 wrapper

The Android application is a deliberately thin WebView shell for the Firebase-hosted Movie Hub app:

- App name: **Movie Hub**
- Package ID: `de.matthiasennen.moviehub`
- Orientation: landscape
- Minimum Android version: Android 6.0 (API 23)
- Target: Fire TV Stick 4K and Android devices
- Start URL: `https://movie-hub-62459.web.app/`
- Network: the Movie-Hub start page and authentication hosts stay HTTPS-only; user-managed video URLs may additionally use HTTP inside the home network. An in-app retry screen is shown if the start page cannot be reached.

The `Android APK` GitHub Actions workflow always creates a sideloadable debug APK artifact. Once the repository secrets `MOVIE_HUB_KEYSTORE_BASE64` and `MOVIE_HUB_KEYSTORE_PASSWORD` are configured, it additionally creates a **signed release APK**. Install this release APK on Fire TV; future signed release builds use the same package ID, signing key and an automatically increasing version code, so Fire OS accepts them as updates.

## Sideload test

After the workflow succeeds, download `movie-hub-fire-tv-release-apk`, extract `app-release.apk`, and install it with the chosen sideload method. Use the debug artifact only until release signing is configured.

## Phase 3.2 WebView session and lifecycle

The WebView keeps Firebase's browser-local login session, cookies and web storage enabled. It saves and restores its page state across a normal Android recreation and pauses/resumes cleanly when the app moves into the background or foreground.

The Android Back button first calls the hosted Movie Hub UI: it closes an open detail view, profile menu or subpage just like the browser UI. The Android shell uses AndroidX's backward-compatible Back dispatcher on current phones, Fire TV and older Android versions alike. At Movie Hub's root it opens Movie Hub's own confirmation dialog with **Abbrechen** (the initially focused safe choice) and **Schließen**; it automatically follows the active profile theme. Only **Schließen** ends the Android task; another Back press on the dialog acts as **Abbrechen**. A native Android dialog is used only as a reliable fallback while Movie Hub is loading or unavailable.

`MovieHubNative` is intentionally a narrow native bridge. It exposes the platform, app version, the explicit user-confirmed app close action, opening a user-managed HTTP(S) media link and an allow-listed provider launch; it never exposes credentials, Firebase data, storage or unrestricted WebView navigation. Movie-Hub video URLs play in the hosted detail view and therefore depend on the codecs available in Android WebView/Fire OS; MP4 with H.264/AAC is the compatibility baseline.

## Phase 5.2 SMB-/FRITZ!NAS preflight

The shared media editor additionally accepts credential-free `smb://server/share/path/video` addresses and converts unambiguous UNC paths. In a normal browser these entries show a clear native-app requirement. In the current Android/Fire-TV shell, a dedicated bridge method opens an unexported full-screen Media3 player.

The first technical candidate uses SMBJ for SMB2/3 random-access reads and supplies those bytes to Media3 through a custom data source, enabling pause, resume and seeking without copying the complete file to device storage. Username and password are requested by the native player. If the user chooses to remember them, they are AES-GCM encrypted with a non-exportable Android Keystore key and stored only on that device, scoped to server and share.

This library/player combination remains a preflight candidate until it has streamed a real FRITZ!NAS reference file on Fire TV and the remote-control/error scenarios in issue #62 have been verified.

## Phase 4.3 provider launch chain

Provider buttons pass only the provider ID, title and the already validated HTTPS fallback to Android. The native shell accepts Netflix, Prime Video, Disney+, YouTube and waipu.tv and verifies that the fallback domain matches the provider before doing anything.

For each allow-listed provider, Android tries in this order:

1. open the provider's title/search HTTPS destination in a known installed Android/Fire-TV package;
2. send a standard Android search intent with the title;
3. open the provider's Leanback or normal launcher activity;
4. open the existing HTTPS destination without a package restriction.

Unsupported package names, missing apps and rejected intents are treated as normal fallbacks. The real result per provider is recorded on Fire TV in issue #50 because providers do not publish one stable title-level deep-link contract for every Fire OS generation.
