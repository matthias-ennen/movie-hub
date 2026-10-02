# Android WebView security policy

Movie Hub uses a hosted HTTPS React UI inside a native Android/Fire-TV WebView. The shell deliberately keeps the WebView policy in `MovieHubWebViewPolicy` rather than spreading security-sensitive settings across `MainActivity`.

## Top-level navigation

The WebView accepts top-level navigation only to:

- `https://movie-hub-62459.web.app`
- `https://movie-hub-62459.firebaseapp.com`

Provider links and user links are opened explicitly through native intents and their dedicated allow-list/validation paths. They are not silently promoted to trusted top-level WebView pages.

## Cookies

First-party cookies remain enabled. Third-party cookies are disabled.

Movie Hub currently uses Firebase email/password authentication with browser-local persistence. It does not use a cross-site OAuth popup/iframe flow inside the WebView, so third-party cookies are not part of the current product contract.

## Cleartext and mixed content

Two permissive-looking settings remain intentionally enabled:

- manifest `android:usesCleartextTraffic="true"`;
- WebView `MIXED_CONTENT_COMPATIBILITY_MODE`.

They exist for one product feature: users can attach their own HTTP video URL, including arbitrary hosts or IP addresses on a home network, and play that video inside Movie Hub.

Because those destinations are user-defined, Android's domain-based network security configuration cannot enumerate them in advance. Restricting cleartext to a fixed domain list would therefore break valid local-media entries.

This exception does **not** widen top-level WebView navigation, which remains HTTPS-only and host-restricted.

A future way to remove both exceptions would be to move all HTTP media playback out of the hosted WebView and into a native player path. That is a product/architecture change and is intentionally not part of this hardening block.
