# Android / Fire TV lifecycle notes

This note records the lifecycle contract enforced by `MainActivity`.

## WebView renderer loss

`WebViewClient.onRenderProcessGone()` marks the current renderer as permanently unusable. Movie Hub then:

- cancels startup timeout/retry work;
- clears pending native trailer-result delivery;
- shows the native/offline recovery surface;
- never calls WebView lifecycle, JavaScript, focus, state-save or visibility operations on that dead renderer again;
- recreates the Activity when the user chooses **Erneut versuchen**.

A normal startup/network failure is different: the renderer is still healthy and is intentionally kept behind the opaque error surface so a slow page can recover.

## Pause / resume

A healthy WebView receives `onPause()/pauseTimers()` and `onResume()/resumeTimers()`. A renderer-gone WebView is skipped. Pending trailer result delivery resumes only for a healthy renderer.

## Back handling

When the hosted UI is alive, JavaScript gets first chance to close detail/menu/subpages and to show the themed exit dialog. If the renderer is unavailable or the offline surface is active, Android uses the native exit confirmation directly.

## Main-thread audit

The bridge itself performs only small validation/state operations synchronously. Android UI work is posted to the UI thread. TMDB network and credential reads are delegated by `TmdbCatalogSyncCoordinator` to its executor. SMB file I/O runs in the native player/data-source path rather than in the bridge call.
