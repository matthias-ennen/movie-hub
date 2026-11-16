# #336 G3 – station-specific AIR playback preparation

Status 2026-11-15: six official station web destinations reviewed. Android link check: all six successful (user reported 15.11.2026). Fire TV final acceptance of the finished regular MovieHub app and publishing are **not** complete. Nothing is activated by this change. The independent G2w private staging run remains required; EPG coverage and matching are not established by the route checks.

| Canonical station | Separate AIR provider | Exact official destination | Access |
| --- | --- | --- | --- |
| Das Erste | `air-ard` | [Sender](https://www.ardmediathek.de/live/Y3JpZDovL2Rhc2Vyc3RlLmRlL2xpdmUvY2xpcC9hYmNhMDdhMy0zNDc2LTQ4NTEtYjE2Mi1mZGU4ZjY0NmQ0YzQ) | No login/subscription expected |
| ZDF | `air-zdf` | [Sender](https://www.zdf.de/live-tv/zdf-live-beitrag-100) | No login/subscription expected |
| RTL | `air-rtl` | [Sender](https://plus.rtl.de/rtlde-rtl) | RTL+ login and subscription |
| ProSieben | `air-pro7` | [Sender](https://www.joyn.de/live-tv/prosieben) | Joyn registration |
| SAT.1 | `air-sat1` | [Sender](https://www.joyn.de/live-tv/sat1) | Joyn registration |
| VOX | `air-vox` | [Sender](https://plus.rtl.de/rtlde-vox) | RTL+ login and subscription |

The RTL+ destinations are specific station pages, not guaranteed one-click autoplay. Do not call the route program-specific or on-demand. No inferred links, generic provider home pages, streams or guessed app intents. The canonical XMLTV input station and exact source provenance must agree. Each provider is distinct from VOD; it may appear only as AIR for live broadcasts.

## Device acceptance and release sequence

1. Finish the private G2w/G3c staging: source health, cache reuse, match and real TMDB catalog availability. No publication yet.
2. Android test APK: Matthias reported all six exact destinations working on 15.11.2026. Each Android receipt is bound to its exact literal URL. No Fire TV receipt is inferred.
3. As explicitly requested, do NOT require another separate preliminary Fire TV test APK. Complete the normal MovieHub integration, including reliable publication, provider settings, correct AIR cards, exact channel destinations and coexistence with Waipu/Joyn.
4. Android-confirmed routes can be privately rehearsed before publishing. The independent `XMLTV_AIR_PUBLISH_ENABLED` flag remains false until the explicit release decision; receipts alone publish nothing.
5. Fire TV is the final actual-app acceptance, after the integrated normal MovieHub app is ready. Verify correct station launch, Back navigation, episode/time context and access requirements. Record the actual result. A negative or conflicting receipt blocks that exact station; no untested Fire TV success is claimed, and no generic-link substitution is allowed.
6. Do not mark the work package fully accepted before the final actual-device test and normal Nightly operation.

### Isolated device-test APK (G3a, Android test completed)

- Build type `airQa`, application ID `de.matthiasennen.moviehub.airqa`, launcher label **Movie Hub AIR Test**. It installs alongside the existing MovieHub APK and cannot replace its data, profile or settings. No hosted catalog or account access.
- Download and extract the `movie-hub-air-device-test-apk` artifact from the Android APK PR run for the G3a branch, or manually build it using Android APK workflow input `build_air_qa=true`. The ordinary CI/Android builds remain intact and no Nightly launch is needed.
- Open the test APK, select each station, confirm correct live channel (including account/subscription prompt where applicable), and return with Back. A system intent accepted is not evidence of correct playback; note failures and device type, and do not approve a sender until its actual result is confirmed. The same native dispatcher validates these six exact URLs for the real MovieHub app; actual TV-card UI/publishing still requires separate staged acceptance.


## #838 A3: twelve additional device-test destinations (16.11.2026)

The private real 18-station rehearsal passed ([run 43884914711](https://github.com/matthias-ennen/movie-hub/actions/runs/43884914711)): 7,672 input programmes, 1,061 exact local matches, 670 deduplicated airings (231 original + 439 expansion). There are no device approvals for the expansion yet. The isolated AIR test APK now contains **only the twelve additional destinations**; existing six do not need to be repeated. Native target allowlist accepts exact reviewed URLs only. Production JS registry remains six; no new provider activation. Required: actual Android result per exact station, including access/redirect behaviour; Fire TV final integrated app test.

| Station | Candidate provider ID | Official target | Expected access (verify on device) |
|---|---|---|---|
| ARTE | `air-arte` | [Live page](https://www.ardmediathek.de/live/arte-deutsch/Y3JpZDovL2FydGUuZGUvTGl2ZXN0cmVhbS1BUlRF) | Public |
| 3sat | `air-3sat` | [Live page](https://www.zdf.de/live-tv/3sat-live-beitrag-100) | Public |
| ZDFneo | `air-zdfneo` | [Live page](https://www.zdf.de/live-tv/zdfneo-live-beitrag-100) | Public |
| ZDFinfo | `air-zdfinfo` | [Live page](https://www.zdf.de/live-tv/zdfinfo-live-beitrag-100) | Public |
| ONE | `air-einsfestival` | [Live page](https://www.ardmediathek.de/live/one/Y3JpZDovL3dkci5kZS9CZWl0cmFnLTFlNjA0YWFlLTViODctNGMzNC04ZDhmLTg4OWI1ZjE2ZDU3Mw) | Public |
| Kabel Eins | `air-kabeleins` | [Live page](https://www.joyn.de/live-tv/kabel-eins) | Joyn login may be required |
| RTLZWEI | `air-rtl2` | [Live page](https://plus.rtl.de/rtlde-rtlzwei) | RTL+ login/subscription |
| SUPER RTL | `air-superrtl` | [Live page](https://plus.rtl.de/rtlde-super-rtl) | RTL+ login/subscription |
| TELE 5 | `air-tele5` | [Live page](https://www.joyn.de/live-tv/tele-5) | Joyn login may be required |
| ProSieben MAXX | `air-prosieben_maxx` | [Live page](https://www.joyn.de/live-tv/prosieben-maxx) | Joyn login may be required |
| SAT.1 GOLD | `air-sat1gold` | [Live page](https://www.joyn.de/live-tv/sat1-gold) | Joyn login may be required |
| NITRO | `air-rtlnitro` | [Live page](https://plus.rtl.de/rtlde-nitro) | RTL+ login/subscription |

SUPER RTL especially: confirm the selected actual live station, not a generic RTL+ overview or TOGGO PLUS. Do not store a positive receipt if the wrong channel opens. The two zero-match stations ARTE and ZDFinfo remain in the import review; a device test does not establish matching quality.
