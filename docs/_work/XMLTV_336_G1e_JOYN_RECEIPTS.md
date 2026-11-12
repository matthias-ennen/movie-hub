# MovieHub #336 – G1e Teil 2b-2: Joyn-Originaltitel- und Matcherquittung

**Stand 12.11.2026:** Bewusst isolierte Quittungserzeugung, keine Änderung an produktiven Joyn-/Waipu-/XMLTV-Matcherschleifen, Nightly, Firebase, APP oder AIR-Livestream-Zielen.

## Echte Ausgangslage

G1e-2a hat im tatsächlichen Nachtlauf-Artefakt 23.785 Joyn-BroadcastEvents mit der Originaltitelangabe `extensions.joyn.rawTitle` gefunden. Im Gegensatz zu Waipu ist der ursprüngliche Joyn-Programmtitel damit auch im SourceAdapter-Vertrag verfügbar, **jedoch noch kein Beleg für die Identität des TMDB-Werks**.

Der bestehende `matchJoynProgram` v5 liefert `status`, eine `match`-Identität mit Titel-Score/Margin und seine Entscheidungssignale, aber **kein eigenes `checkedAt`**. Der `JoynMatchCache` speichert den originalen `checkedAt` zwar bereits, die bisherige `get()`-Methode gibt aber nur die Diagnostik zurück. Ein erneutes Match-Cache-Hit darf nicht als neue Prüfung ausgegeben werden.

## Implementiert

`JoynMatchCache.getWithProvenance(candidate, localCandidates)` ist eine opt-in Lesemethode, die die bestehenden TTL-/Fehler-/Kandidatenprüfungen über `get()` genau einmal benutzt und zusätzlich den **gespeicherten ursprünglichen Zeitpunkt** und die Herkunft `origin: 'cache'` zurückliefert. Die schon produktiv verwendete `get()`-Signatur und ihr unveränderter Rückgabewert bleiben erhalten.

`scripts/epg-g1e-joyn-match-receipt.mjs` exportiert die ausschließlich freiwillig aufzurufende `buildJoynApprovedEpgReceipt`-Funktion:

- Echte **positive** `matchJoynProgram`-v5-Entscheidung mit `status: matched`, gültiger TMDB-ID und exakt matchendem Filmtitel (**Score 100 und Margin ≥15**). Unklare, mehrdeutige und fuzzy Matches werden für die gemeinsame Wiederverwendung ausgeschlossen, bleiben aber im **Joyn-Adapter selbst** unverändert nutzbar.
- Originaltitel stammt aus `sourceCandidate.title`, muss mit `broadcastEvent.extensions.joyn.rawTitle` identisch sein; externe Originalprogramm-ID `joynProgramId`, Sendezeiten, kanonischer Sender, Medientyp, TMDB-ID und eventuelle Jahre/Staffeln müssen zur bestehenden G1e-Evidenzprüfung passen.
- Produktionsjahr wird **nur** aus dem Joyn-Kandidaten und niemals ersatzweise aus einem TMDB-Jahr übernommen. Bei widersprüchlichen Produktionsjahren (mehr als ±1 Jahr) wird keine gemeinsame Quittung erstellt.
- **Frisch gematchte** Entscheidung: Nur der außerhalb dieser Funktion beim wirklichen Matcher-Lauf erfasste `matchCheckedAt` darf verwendet werden. **Cache-Hit:** Nur die `getWithProvenance()`-Quittung mit der unveränderten `checkedAt`-Zeit, keine Überschreibung mit einem neuen Datum.
- Die vorhandene G1e-Brücke `validatedSharedEpgEvidence` validiert SourceRef mit Zeit, Quellprogramm-ID und TMDB-Werkidentität. Alte Cacheentscheidungen aus früheren Quellgenerationen erhalten **keinen** aktuellen gemeinsamen Index-Beleg.
- Positive Belege enthalten **keine** Joyn-PlaybackRoutes, Provider-Verfügbarkeit oder erfundene AIR-Links.

`tests/epg-g1e-joyn-match-receipt.test.js` verwendet **den tatsächlich vorhandenen** `matchJoynProgram`, `JoynMatchCache`, `mapJoynCandidateToBroadcastEvent` und den gemeinsamen `SharedEpgIdentityIndex`, um frische Quellenquittungen, alternde Caches, Episode-/Jahr-/Titelkonflikte, Time/TMDB-ID-Fälschungen und Link-Isolation zu prüfen.

## Nächstes Gate G1e Teil 2c

1. Bestätigte Waipu-/Joyn-Belege nur in einer **eigens gestarteten, nicht-produktiven Replay-Generation** direkt nach einer erfolgreichen Quellgeneration erfassen; echter `matchCheckedAt` aus Matcher-Ausführung, nicht aus dem Quell- oder Firebase-Zeitstempel. Von früheren Matcher-Caches dürfen veraltete Belege nicht wiederbelebt werden.
2. Eine separate neutrale Vergleichsdatei bauen, die dieselben realen Programmkandidaten mit **identischen eigenen Adapter-Caches und verfügbaren lokalen TMDB-Kandidaten** ohne/mit gemeinsamem Index durchführt; tatsächlich ausgeführte `TMDB /search`-Aufrufe differenzieren.
3. Zweifelhafte identische TMDB-Filme bei unterschiedlichen Originaltiteln, abweichenden EPG-Zeitfenstern, Regionalsendern und Serienepisoden gezielt **nicht** zusammenführen. Ein bestehender Quelladapter darf bei Index-Störungen nicht von anderen Quellen abhängig sein.
4. Noch keine produktive Anwendung des gemeinsamen Index, keine automatischen Sender-Livestreams und kein Firebase-/Nightly-/Fire-TV-Umbau vor gesonderter Abnahme.

**Qualitätsprinzip:** Die gemeinsame Infrastruktur übernimmt ausschließlich ausdrücklich belegte positive Werkidentitäten. Alles andere bleibt bei den unabhängigen Originalmatchern.
