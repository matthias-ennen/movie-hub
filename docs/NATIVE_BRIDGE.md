# Native JavaScript Bridge Contract

Movie Hub exposes three deliberately narrow WebView bridges. This document is the contract between the hosted React UI and the Android/Fire-TV shell.

## Contract version

`MovieHubNative.getBridgeContractVersion()` currently returns **1**.

The contract version changes only when an incompatible bridge change is introduced. Adding a backward-compatible method does not require a version bump.

## MovieHubNative

Registered by `MainActivity` as `window.MovieHubNative`.

Methods exposed with `@JavascriptInterface`:

- `getPlatform()`
- `getPlatformLabel()`
- `getAppVersion()`
- `getAppBuild()`
- `getBridgeContractVersion()`
- `getHeroSequenceContractVersion()`
- `notifyStartupReady()`
- `closeApp()`
- `openNetworkSettings()`
- `openTmdbSettings()`
- `requestTmdbCatalogSync()`
- `requestTmdbTitleMetadata(mediaType, tmdbId, requestId)`
- `clearSessionSmbCredentials()`
- `openProjectUrl(url)`
- `openExternalUrl(url)`
- `openProvider(providerId, title, fallbackUrl)`
- `openProviderRoute(providerId, title, mode, scope, targetUrl, fallbackUrl)`
- `openProviderExact(providerId, title, exactUrl, fallbackUrl)`
- `openMediaUrl(url)`
- `playSmbMedia(label, url)`

## MovieHubCrypto

Registered as `window.MovieHubCrypto` and implemented by `PersonalDataCryptoBridge`.

Methods:

- `isAvailable()`
- `encrypt(purpose, clearText)`
- `decrypt(purpose, envelopeJson)`

The bridge never exposes the underlying key material to JavaScript.

## MovieHubTrailer

Registered as `window.MovieHubTrailer` and implemented by `HeroTrailerLaunchBridge`.

Methods:

- `playHeroTrailer(videoId, title, soundEnabled)`
- `playHeroTrailerWithResult(videoId, title, soundEnabled, requestId)`
- `acknowledgeHeroTrailerResult(requestId)`

The bridge validates YouTube video IDs and request IDs before launching the native player.

## Threading and lifecycle rules

- WebView bridge methods may be invoked from a WebView bridge thread; every Android UI action must be handed to the UI thread explicitly.
- Network, TMDB, SMB and other blocking work must not be moved onto the UI thread.
- Native activities may be opened only from a validated user-triggered route.
- The WebView renderer may disappear; stale callbacks must not assume a live WebView.
- `onPause()` pauses WebView timers; `onResume()` restores them and resumes pending trailer-result delivery.
- Session-only SMB credentials are cleared when the app is explicitly closed.

## R8 requirement

Release builds use R8. All methods annotated with `@JavascriptInterface` must keep their runtime annotation and JavaScript-visible method name. The release ProGuard rules enforce this contract.
