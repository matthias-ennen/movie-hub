# MovieHub #336 – G2j: geschützte Integrationsstufe XMLTV → lokales TMDB-Matching → TV-Merge

**Stand 14.11.2026. Technischer Baustein, keine Produktivaktivierung.** [Technischer Gesamtplan](XMLTV_336_ROTER_FADEN.md), späteres eigenständiges [Quellenreview #825](https://github.com/matthias-ennen/movie-hub/issues/825).

## Was jetzt tatsächlich verbunden wird

`scripts/xmltv-g2j-private-integration-preview.mjs` verbindet erstmals dieselben im Repository vorhandenen Bausteine **in einer gemeinsamen privaten, rein speicherinternen Aufrufkette**:

1. **G2d/G2i-Originalprüfung:** `replayXmltvPrivateLkg()` validiert jede einzelne private G2c-Quellengeneration vollständig: Quelle/ID, Sender-Mapping, Zeitfenster, Frische (36h), Provenienz, generationsübergreifende zeitliche Reihenfolge, Status/Gates. Ungültiges wird niemals an den Matcher geleitet.
2. **Senderentscheidung:** Je Originalquelle und jedem der bisher sechs überprüften Sender wird genau der numerisch geprüfte G2d-Modus `current`, `last-known-good` oder `unavailable` übernommen. Ein kurzer aktueller Horizont bleibt bestehen; das ältere LKG wird **nur für Sender ohne gültige aktuelle Zukunftsdeckung** herangezogen. Es ergänzt nicht unsichtbar ältere Programme nach dem Ende einer kurzen aktuellen Vorschau.
3. **Lokales Matching:** Die wirklich ausgewählten Programme laufen in kontrollierten Batches von maximal 2.000 über `matchXmltvLocalCandidates()` mit dem bestehenden `matchJoynProgram` und einem **ausdrücklich lokal bereitgestellten Kandidatenresolver**. Keine neue TMDB-HTTP-Suche, keine angenommene Identität bei unklarer Medienart, Titeldopplung oder Jahreskonflikt.
4. **Gemeinsamer TV-Merge:** Ausschließlich positive lokale Matches gehen rein im Speicher zu `mergeConfirmedXmltvAirings(waipuAirings, joynAirings, xmltvEvents)` und damit der bereits etablierten `mergeTvAirings`-Logik. Zeitlich gleichwertige Quellen werden vereint, unterschiedliche Sendungen bleiben getrennt. XMLTV fügt keinerlei Provider-Badge oder AIR-Route hinzu.
5. **Anonymisierte QA-Ausgabe:** Nur Sender-/Quellzähler, lokale Matchquote und numerische Baseline-/Mergegrößen werden zurückgegeben. **Weder Originaltitel noch externe Original-IDs, Sendungs-/Programmdaten oder Playbacklinks** werden aus dieser Stufe exportiert. Es gibt kein Schreiben in GCS, Firebase, App, CI-Artefakte oder Nightly. `publishApproved` bleibt `false`.

**Budget:** Ein privater Testaufruf erlaubt höchstens 20.000 ausgewählte Programme und höchstens 50.000 bereits existierende Waipu- bzw. Joyn-Ausstrahlungen pro Adapter. Diese Grenze gilt nur für den neuen Offline-QA-Integrationsaufruf, **nicht** als Quell- oder Vorschau-Abbruchregel in einer späteren produktiven Architektur. Bei Überschreiten: vollständiger Abbruch ohne Teilergebnis oder Veröffentlichung.

## Test- und Abnahmekriterien

`npx vitest run tests/xmltv-g2j-private-integration-preview.test.js`

- Zwei Tage frischer ZDF-EPG, fünf Tage gültiger älterer Stand derselben Quelle, vollständiges Sender-LKG nur für zuvor fehlende ARD – der kurze aktuelle ZDF-Stand bleibt unangetastet.
- EPGSHARE01 und FreeEPG als unabhängige Inhaltsfamilien; FreeEPG/IPTV-EPG.org dürfen nicht doppelt als Backup gelten.
- Gleiche Sendezeit und identische TMDB-ID aus Waipu/Joyn/XMLTV vereinen; gespeicherte Alt-Provider-/Routen nicht erfinden oder als neu veröffentlichen.
- Ein gültiger einzelner 2-Tage-Feed wird akzeptiert; beschädigte/abgelaufene/quellenfremde oder chronologisch ungültige LKG-Daten liefern keine positiven Einträge.
- Fehlende verifizierbare Medienart bleibt ein **unmatched**-Fall.
- Der Ergebnisbericht enthält selbst bei privaten Testtiteln ausschließlich anonyme Zahlwerte; bei Budgetüberschreitung kein Teilergebnis.
- Erst bei grüner CI/Android und isolierten Tests in `main` übernehmen. Keine automatische Aktivierung.

## Nächste echte Integrationsstufen

Aus dieser **privaten** Kette müssen danach ein sauber versionierter privater Originalquellen-Checkpoint über getrennte Läufe, ausfallsichere Quellenkoordination, produktiver Waipu-/Joyn-/XMLTV-TMDB-Datenfluss, gerätegeprüfte AIR-Routen und eine vollständige Nightly-/App-/Firebase-Cutover-Probe entstehen. Kurze EPG-Horizonte sind dabei zulässig. Das gesonderte später fällige Review bleibt als eigenes #825 getrennt.
