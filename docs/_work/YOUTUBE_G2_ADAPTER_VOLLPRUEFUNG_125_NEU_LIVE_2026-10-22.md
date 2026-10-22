# MovieHub G2 – Gesamtaudit YouTube-Quellenadapter und 125er-Live-Prüfplan
**Stand 22.10.2026.** Issue #388. Nutzerziel: erneut **mehr als 100 neu abgerufene Filme/Videos** über die echte YouTube-API prüfen und den **gesamten Adapter** gegen Waipu/Joyn/TMDB-Quellenarchitektur bewerten. Keine produktiven Import- oder Badge-Änderungen vor Live-Auswertung.

## Quellenwahl aktualisiert (22.10.2026)

Die 125er-Teststrecke verwendet **keine feste Netzkino-Vorgabe** mehr. Das manuelle GitHub-Workflowformular bietet `source_mode=all` (Standard: beide registrierten Kanäle), `netzkino`, `cinenet` und `custom` mit kommagetrennten Kanal-IDs (höchstens vier Quellen). Der Adapter enthält selbst keine Netzkino-spezifische TMDB- oder MovieHub-Logik.

`runYoutubeLargeAudit` löst für jedes registrierte Quell-Kanalprofil die eigene Upload-Playlist auf und verteilt die Seitenabrufe fair abwechselnd. Jede Video-ID bleibt samt Ursprungs-Channel-ID erhalten; fremde Kanal-IDs führen zum Abbruch. Die 125 **eindeutigen** Videos teilen sich ein globales API-Budget (**max. 32 YouTube-GETs, 800 TMDB-GETs, 12 Playlistseiten gesamt**) und werden ausschließlich lesend durch Matcher v1 geprüft. Der Bericht listet getrennte Kanalstatistiken und das Gesamtergebnis. Bei zu wenigen geeigneten neuen Videos wird der Test nicht als erfolgreicher 125er-Lauf gewertet.

Die nächsten Schritte sind der echte manuelle Live-Test und danach der End-to-End-Architekturabgleich. **Kein** produktiver Katalog-, Provider- oder Badge-Import wurde mit dieser Änderung aktiviert.

## Echte technische Bestandsaufnahme der bestehenden Architektur

| Komponente | Tatsächliche Implementierung (main) | Status / wichtige Grenze |
| --- | --- | --- |
| Live-Datenquelle | `scripts/youtube-api-smoke.mjs`, `scripts/youtube-adapter-live-preflight.mjs` | API-Zugang mit Google OIDC + Secret Manager funktioniert; bislang nur G1-Forschung / G2-20er-Test |
| 125er-Batch | `scripts/youtube-g2-large-live-audit.mjs` | **Neu:** 125 voneinander verschiedene, nach Screening geeignete YouTube-VIDEO-IDs, max. 12 Playlistseiten über die gewählten Kanäle verteilt, max. 32 YouTube-GET und 800 TMDB-GET, standardmäßig beide registrierten YouTube-Kanäle (Netzkino und CiNENET Deutschland) |
| Wiederholungen | `scripts/youtube-g2-prior-video-ids.mjs` | Exkludiert **100 bekannte G1-Video-IDs** (Original-Actions-Artefakt #12353497700) und **20 G2-Netzkino-IDs**; die übrigen 930 früher nur vorübergehend gesehenen IDs wurden damals nicht vollständig gespeichert. Deshalb **nicht** behaupten, weltweit/über alle alten API-Abrufe exklusiv neue IDs zu garantieren |
| YouTube Metadaten | `src/sources/adapters/youtubeContractMapper.js` | Video-/Kanal-ID, Roh-Titel, Länge, Kategorie, Datum, Sichtbarkeit und Regionssignal; Vollfilm/DE-Rechte/Tarif nicht aus Metadaten beweisbar |
| Titelaufbereitung | `scripts/youtube-g2-title-query-prep.mjs` | Darsteller-/SEO-Zusätze werden nur aus TMDB-Suchabfragen gefiltert, originaler YouTube-Quelltitel bleibt erhalten |
| TMDB-Matcher | `scripts/youtube-g1-matcher-v1.mjs` | Frozen v1 nach erfolgreichen 20er-Vergleich (13→0 ohne Kandidat, 2→16 führende Filmhypothesen); **nicht** unbemerkt ändern; Hypothesen nicht mit bestätigten Filmen verwechseln |
| Titelkatalog-Abgleich | `src/sources/youtubeTitleImportPreview.js` | Vergleich anhand `(movie/series,tmdbId)` und extern bereitgestellter realer Bestands-IDs. Aktuell **kein** tatsächlich geladener echter MovieHub-Katalog im manuellen GitHub-Lauf. Ohne diesen **nur** `catalog-status-unknown`, kein verlässlicher Neuimport-Zähler |
| Source-Adapter-Vertrag | `src/sources/adapters/youtubeContractMapper.js` und `src/sources/sourceAdapterContract.js` | YouTube-Video als kanonische `Availability`-Quelle mit TMDB-Referenz und exaktem `APP_DEEP_LINK` **erst** bei unabhängiger bestätigter Film-/Fassungs-/DE-Angebotsidentität und zulässigem Quellen-Datenweg |
| Merging | `src/sources/sourceMerge.js` | Generischer `mergeSourceGenerations`-Kern kann bestätigte YouTube-Verfügbarkeiten zusammenführen und abgelaufene Quellen entfernen; dedupliziert auf Werk+Anbieter+Region+Offer-Typ+Validity, nicht auf YouTube-Video-ID – für Mehrfachfassungen vor Produktion gesondert prüfen |
| TMDB-YouTube-Anbieter | `src/providers/providerRegistry.js`, `src/sources/adapters/tmdbWatchProviderContractMapper.js` | YouTube als TMDB/JustWatch-Anbieter bereits bekannt; diese Existenz beweist **keinen** konkreten Filmvideo-Link aus dem YouTube-Adapter |
| Badge-Modell | `src/providers/providerOfferSnapshot.js`, `src/providers/posterProviderModel.js` | Zentrale Anbieter-/Offer-Projektion existiert; **G2-Live-Adapter-Records werden noch nicht durch die produktive Badge-/Poster-/Detail-Kette veröffentlicht**. Keine eigene Parallel-Badge-Logik einbauen |
| Mobile/Fire TV | `android/.../YouTubeUrlResolver.java`, `src/providers/providerPlaybackLaunch.js` | Android kann konkrete YouTube-Watch-URLs normalisieren und an Native-App/Fallback übergeben. **Kein neuer automatischer End-to-End-Fire-TV-Gerätetest** dieser G2-Kette |
| Nightly, Import, Update/Löschung | Bestehende Waipu/Joyn-/TMDB-Workflows + Quellenmerge | **Noch KEIN** produktiver YouTube-Nightly, kein Firestore-Kataloganreicherungs-Worker, keine automatische Erstaufnahme neuer TMDB-Werke, keine bestätigte YouTube-Offer-Aktualisierung/Revocation/Rollback |

## Größerer Live-Test: nicht verhandelbare technische Regeln

- Exakt **eine** Quell-Kanal-ID `UCGkHFrwE8KEuOHPVsIOskAg` (Netzkino), **keine Suche über alle Owner**. Nur die offizielle Upload-Playlist mit `nextPageToken` und API-Metadaten, keine YouTube-Videodateien oder Umgehungen von Zugriffssperren.
- **Mindestens 125** bislang in den bekannten G1-100/G2-20-Auswahlmanifests **nicht enthaltene**, unterschiedliche **screen-geeignete** Video-IDs. Dies sind weiterhin **Kandidaten, nicht 125 unabhängig identifizierte unterschiedliche Filme**. Bei zu wenigen verfügbaren Videos **fail closed**, ehrlich melden, ohne kleinere Stichprobe als Erfolg auszugeben.
- Max. 12 Playlistseiten insgesamt, 32 YouTube-Leseanforderungen (channels, playlistItems, videos jeweils max. 50 IDs) und 800 TMDB-Leseanforderungen. Einmaliges manuelles `workflow_dispatch`, 45-min-Timeout; keine Nightly-Ausführung. 7-Tage-internes Artefakt (Markdown + JSON-QA-Fälle).
- `scoreCandidate` und `classifyVideo` aus Frozen Matcher v1 **unverändert**. Klassifikation pro ID, Anzahl führender Hypothesen, mehrdeutiger Fälle, Null-Treffer, abgesiebter Shorts, unerwarteter Serienfälle, Fehler-/Quota-Zähler. Die korrekte Filmidentität durch **unabhängige** Stichprobe (insbesondere mehrdeutig/Remakes/Sequel-Namen) prüfen, bevor Accuracy/Precision behauptet wird.
- **Keine Firestore-, Provider-, Titel-, Index-, APK-, Badge-, Nightly- oder Hosting-Schreibzugriffe**. Secrets werden weder ausgegeben noch ins Artefakt geschrieben. Bei API/Quota/Channel-Vermischungsfehlern **fail closed**.
- Fehlt ein echter gegenwärtiger MovieHub-Katalogsnapshot, kann die Importvorschau **nicht** bestehenden Titel vs. neue TMDB-Werke bestimmen. `public/catalog.json` ist nur ein leeres Fallback und dafür ausdrücklich unbrauchbar.

## Kritische Architekturpunkte nach der 125er-Live-Abnahme

1. **Quelle & Eigentümer**: Auch zwei Quellkanäle prüfen nur einen kleinen Ausschnitt der Plattform; andere Kanäle können andere Titel- und Lizenzmodelle besitzen. Channel-ID ist keine selbständige Vollfilm-/Lizenzprüfung.
2. **Werkidentität**: `review-leading-*` ist eine Rangfolge, keine unabhängige Verifikation. Kein automatischer neuer MovieHub-Katalogtitel aufgrund einer bloßen Suchhypothese.
3. **Exakter Absprung**: Eine YouTube-Watch-Video-ID muss sich als tatsächlicher deutscher Film (korrekte Fassung) öffnen lassen; Angebotstyp `free/ads/flatrate/rent/buy` unabhängig bestätigen. Keine generischen YouTube-Suchseiten als vermeintliche exakte Film-PlaybackRoute.
4. **Bestand & Datenfusion**: Beim späteren Merge nur kanonische TMDB-Werkschlüssel, zentrale `SourceEnvelope` und `Availability` verwenden. Titel- und Provider-Badge-Dopplungen, mehrere Cuts, Quellpriorität, Retention, Last-valid-Fallback, Wiederholbarkeit, und fehlgeschlagene Updates absichern.
5. **Laufzeit & Watchdog**: Pagination, Retry mit Backoff, harter quota-/time-Break, Datenherkunft/Provenienz, Löschungen verschwundener Angebote, stabile Job-Metriken und saubere Rollback-Sperren vor produktiven Nightlies.
6. **API-Regeln**: YouTube Developer Policies III.E.2 schränken das Aggregieren von API-Daten verschiedener Content Owner ein; eine private einzelne Anmeldung schafft keine automatische Ausnahme. Die formale Anfrage ist auf Nutzerwunsch zurückgestellt, nicht die geltenden Nutzungsbedingungen. Vor Multi-Owner-Produktion tatsächlichen erlaubten Datenfluss klären.
7. **Badge-Gleichheit und Fire TV**: Nach späterer G2-Live-Produktionsfreigabe müssen Poster (max. 3), Detailseite und Suche identische zentrale Anbieterreihenfolge erhalten; Native-D-Pad und Fire-TV-YouTube-App-Absprung separat testen.

## Geplante Abnahmeentscheidung

**Jetzt**: Belastungs-/Abdeckungstest, harte Sicherheits-/Schreib-Sperren und vollständigen generischen Source-Vertrag prüfen. **Danach**: 125er-Live-Artefakt wirklich lesen und numerisch auswerten, manuelle Identitäts-Stichprobe mit Ground Truth und realen MovieHub-Katalog abgleichen. **Erst später nach verifizierten DE-Angeboten und Policy-/Quellenfreigabe:** gezielte produktive Titelanreicherung, automatische Neuanlage, Badge-Veröffentlichung und Nightly.

**Nicht behaupten:** „YouTube-Adapter schon vollwertig live integriert“, „125 neue Filme in MovieHub“ oder „125 korrekte Treffer“, solange die fehlenden G2-Bestandteile nicht implementiert und geprüft sind.

Referenzen: [YouTube PlaylistItems.list](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list), [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies), Issue #388.
