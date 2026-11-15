# #336 G3 – station-specific AIR playback preparation

Status 2026-11-15: six official station web destinations reviewed. Device verification and publishing are **not** complete. Nothing is activated by this change. The independent G2w private staging run remains required; EPG coverage and matching are not established by the route checks.

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

1. Finish G2w private XMLTV staging and compare source health, title matches, shared-cache reuse and overlap/deduplication. No publication yet.
2. Prepare a separate **private** MovieHub device-QA build with the six candidate routes, using the existing native bridge (WEB_LINK, channel scope, exact URL). Do not enable production providers or add them to the public catalog for the test.
3. Exercise each link on Android and Fire TV. Record exact target, canonical station, device, UTC check time and outcome. Confirm the correct channel opens, navigation back to MovieHub works, no generic provider landing page substitutes for the channel, and access/tier requirements are represented honestly. A browser-only visit is not acceptance; login/subscription requirements are not bypassed. A future programme is not on demand; check actual live behaviour during a currently airing slot.
4. Only two matching successful **in-MovieHub** device receipts may enable a station. Record into `XMLTV_AIR_DEVICE_APPROVALS` with stationId, target, device ('android' or 'fire-tv'), checkedAt, viaMovieHub: true and result: 'exact-channel-confirmed'. Failed routes stay disabled.
5. Add explicit staged publishing and device UI acceptance before production rollout. The independent `XMLTV_AIR_PUBLISH_ENABLED` flag remains false until release approval; adding device receipts alone does not publish. Verify AIR badge and exact channel action, retained Waipu/Joyn links and title/episode time associations; check settings and normal nightly pipeline.

For now, the approval array is deliberately empty and the native policy only accepts the six exact station URLs. Native and JS automated tests cover the exact target boundary and refuse cross-station substitutions; they do not replace real device checks.
