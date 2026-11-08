# #484 – Cinematic seasonal artwork import (2026-11-08)

Nine independent original wallpaper/corner pairs, 18 WebP files. All are locally verified from the user-approved MovieHub source archive; no collage crops or generated status images were included.

- Wallpapers: RGB, 1600 × 900 px. Corners: RGBA, 1152 × 864 px, real transparency (alpha min=0 max=255).
- Each source file is < 1,500,000 bytes; Git blob SHA verified to match the local WebP source byte-for-byte before tree creation.
- Runtime switch: `src/theme/seasonalMediaManifest.js` opts in all nine seasons, independently from discovery/content seasons. Legacy SVG fallback remains for any season removed from that list.
- CI gate: `node scripts/audit-seasonal-artwork.mjs` and `npm test`/build.
- Hosting readback: `scripts/verify-seasonal-atmosphere-publication.mjs` checks all 18 deployed originals for exact byte identity, MIME and absence of SPA fallback.
- Device acceptance still requires manual Android smartphone/tablet and Fire TV visual + focus/performance checks after deployment. A successful CI build does not prove on-device rendering.

## Exact imported assets

| Asset | Bytes | SHA-256 | Git blob SHA-1 |
|---|---:|---|---|
| `public/seasonal-atmosphere/christmas-corner.webp` | 683814 | `1aac0a75afac5b1bf82c4a4ef8fda409b5ad0eb7868037270b126699d15e1c14` | `eb2922e31d85674aea836f1e78511fafa35170c3` |
| `public/seasonal-atmosphere/christmas-wallpaper.webp` | 151424 | `320e07cae4462e70cb4f7c67f01bbfa0dacf489c122165ebfb28738a8d591ec3` | `28db1a66070a02aa45fe4784d712e197a70bc280` |
| `public/seasonal-atmosphere/classic-corner.webp` | 305334 | `ce65f2430a694dbbf404c4c5986020db71700f54a67d467af5cfc4ec00045a39` | `b008b992a4c2ef0564a9e27dade661714133032c` |
| `public/seasonal-atmosphere/classic-wallpaper.webp` | 243728 | `4f2246219d626101bcee5d8dd385c307c0b60efdcb3f1a140c47f18fc06ad03b` | `855f0342c44f29076d411f149a38b0305d3bdadd` |
| `public/seasonal-atmosphere/easter-corner.webp` | 253352 | `b91bfaff0f49153cf2fca2db70d6044c0db0e0f795d0e09378bb018c86b18281` | `0972275ab735888ddaeeba3dd555b27d93f1503d` |
| `public/seasonal-atmosphere/easter-wallpaper.webp` | 459724 | `5526ffc8151de38302d3604b0a53e266c272cdd88a97a0c79efed83d6358e793` | `e5243beb2b0ec90c1191a1d37e54e4dee49ed82b` |
| `public/seasonal-atmosphere/filmfestival-corner.webp` | 186712 | `1966ce723c3395cc518e9987d354bfae6f680bd335079b1012600c155f3c18d6` | `b2738e6e057277aabfed63e79f598ea15241abc9` |
| `public/seasonal-atmosphere/filmfestival-wallpaper.webp` | 363980 | `30e03902b63d1e98de464c0c61ba021a517e1c6c5491c7437f9390112d5548e2` | `3fe6b5c6fbc37d29a7f7400f10aa3053604a781b` |
| `public/seasonal-atmosphere/halloween-corner.webp` | 466358 | `8a443576a8790bfc1840d450c4516e38b6a5d3b3ab8a5b48e8c2fde382998b21` | `ea1d12f8a6672ec8b785143c2afa1882e67d0cc5` |
| `public/seasonal-atmosphere/halloween-wallpaper.webp` | 82642 | `9631d5ad3af159cb80394a6e4e4d921901ebbf9edfb816e2d8cca139d91942e3` | `503acd53f98543df3b35c10db443fbe648d10b92` |
| `public/seasonal-atmosphere/hollywood-corner.webp` | 216944 | `a003abcf09575e6eecf155910343dd9d14b7fab60bf3c3ff460bbf1160058a25` | `fb07d63b2270c9f48a84fc111b3dc0de64a5d3cf` |
| `public/seasonal-atmosphere/hollywood-wallpaper.webp` | 354260 | `879c84b8bd84a9e114bba4a98e7636b37b5522b79ba8d36b7fba26035f162700` | `4e09437e9496d3ec826e26654913b22ca06c3e31` |
| `public/seasonal-atmosphere/newyear-corner.webp` | 334284 | `391358f1341d2cf5c8d8dc2100e9e020aa0606ef3a05c4b87ab7fb700f919968` | `1c93f6a91d802578b8279306c8ac74c104913a18` |
| `public/seasonal-atmosphere/newyear-wallpaper.webp` | 503740 | `f4c581ca350064ac759423a42efad53e312d3407e729854d3166480402a844f3` | `db76a901ef780959f8d6014e69adf9b0a56272cd` |
| `public/seasonal-atmosphere/pentecost-corner.webp` | 281156 | `0c981f3e98031b1d9834f2ee1c37e15de64b248d0b7e1bb9b4198f99d38a308b` | `c192244bf2cf71789de0a651e4d086dfbce98458` |
| `public/seasonal-atmosphere/pentecost-wallpaper.webp` | 513368 | `e97150cde7d6fe8c6c4161bb745d19a32fc6e6db47993644d253092bc3320a42` | `56831b2059888ee673d1577eaa2b3b6fdd56d168` |
| `public/seasonal-atmosphere/summer-cinema-corner.webp` | 175790 | `7be8aed3c7eb776b81c5c98fa3b3c7e6aa0c41b73d8f259ce562376a89d0d638` | `709a7b453a7592fa78db34427bbf1bfe7bbd7597` |
| `public/seasonal-atmosphere/summer-cinema-wallpaper.webp` | 429816 | `9037056b758c7102e28dc6d911471e2d0c9a7d470acf4acfbf4b1dad7428de68` | `3f079cc16779b87a2a496a43acdff41ce7543bd6` |

## Rollback

Revert this PR or remove affected IDs from `CINEMATIC_MEDIA_READY`; the original SVG assets have not been deleted. Validate resulting manifest through the artwork audit before redeploy.
