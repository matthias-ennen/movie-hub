# MovieHub #336 – G1e-2d: kontrollierter TMDB-HTTP-Transportvergleich

## Ergänzung: Pilotfreigabe nicht durch leere oder künstliche A/B-Läufe (PR #777)

Das isolierte `safeToConsiderFurtherPilot`-Gate verlangt jetzt **alle**
folgenden Bedingungen gleichzeitig: mindestens ein Originalmatcher-Replay-Eintrag,
mindestens einen vom eingebauten `SharedEpgIdentityIndex` angenommenen
positiven Quellbeleg, eine tatsächlich beobachtete Wiederverwendung aus diesem
Index, **keine** Abweichung der TMDB-Werkidentitäten und **keinen zusätzlichen**
TMDB-HTTP-Transport im Indexarm. Ein manuell übergebener Index-Stub darf weiter
Fallback-/Fehlertests bedienen, aber **niemals** die Pilotfreigabe auslösen.
Unbestätigte Quellbelege, Nullfälle und Mehrverkehr fallen sicher durch.

Die neuen aggregierten Prüfwerte
`nonEmptyReplay`, `verifiedPositiveEvidenceRecords`,
`observedTrustedReuse`, `transportRequestsNonIncreasing` und
`measuredReplayHttpReduction` unterscheiden verlässliche Testabdeckung
von einer echten HTTP-Einsparung. **0 gegen 0 HTTP-Aufrufe** kann bei
korrekter Identität zwar qualitätsseitig zulässig sein, beweist aber **keine
Einsparung**. Ein positives Testdelta (auch mit HTTP-Stub) bleibt ausschließlich
ein Replay-Ergebnis; Produktionsersparnis ist stets `null`.
Der private echte A/B-Pilot mit frisch bestätigten Original-EPG-Quittungen und
identischen unabhängig geklonten Originalcaches ist weiterhin **nicht** gestartet.

---

**Stand 12.11.2026: nur Testinfrastruktur, noch keine reale Nightly-Ersparnis.** Kein Einbau in produktive Adapter und kein Feature-Flag zum automatischen Überspringen von TMDB-Anfragen.

## Wieso nicht einfach 10.481 identische Ausstrahlungen als Einsparung zählen?

G1e-2a bestätigte in echten Quellen 10.481 gleichzeitige Waipu-/Joyn-Ausstrahlungen mit derselben TMDB-Werk-ID. Joyn hatte aber im selben Nightly bereits 48.750 eigene Matcher-Cache-Treffer und eigene TMDB-Such-Response-Caches. Dieselben 10.481 Sendungen hätten daher oftmals **überhaupt keine neuen HTTP-Anfragen** verursacht. Ein A/B-Vergleich muss auf Transportebene messen und die echten unabhängigen Adapter-Caches mit berücksichtigen.

## Isolierter A/B-Vertrag

`scripts/epg-g1e-compare-tmdb-transport.mjs` exportiert `compareOptionalSharedEpgIndexAb({ inputs, createSession, approvedEvidence, sharedIndex, now })`. Nur ein separat aufrufender Test- oder Dry-Run-Controller darf die Funktion starten.

1. `createSession('baseline')` und `createSession('indexed')` erzeugen **zwei unterschiedliche Originaladapter-Matcher-Instanzen**, deren ursprüngliche lokale Match-/Response-Caches und Einstellungen identisch sind. Jede Session muss ihre **tatsächlich initialisierten** Matcher- und TMDB-Antwort-Caches als eigenständige, rein datenorientierte Kopie unter `initialCacheState: { matchDecisions, tmdbResponses }` bereitstellen. **Der A/B-Prüfer selbst** berechnet daraus nach kanonischer JSON-Schlüsselordnung einen SHA-256-Fingerabdruck; eine frei vom Aufrufer behauptete Fingerabdruck-Zeichenfolge ist **kein** Gültigkeitsbeleg. Gemeinsam referenzierte mutable Cacheobjekte, unterschiedliche Snapshot-Inhalte, unbeschränkte/unserialisierbare Daten oder unterschiedliche HTTP-Ausgangszähler führen zum **Abbruch**, statt einen scheinbaren A/B-Vergleich zu erzeugen. Die tatsächlichen Matcher-Instanzen müssen diese übergebenen Cache-Snapshots auch wirklich verwenden.
2. Bei beiden Varianten werden exakt **dieselben Programmkandidaten in derselben Reihenfolge** verarbeitet. In der Baseline läuft immer der **unveränderte Originalmatcher**. Nur im Index-Versuch darf `matchWithOptionalSharedEpgIndex` einen wirklich positiv belegten TMDB-Treffer wiederverwenden. Bei Miss, widersprüchlicher Ausstrahlung oder Indexausfall springt **derselbe unabhängige Originalmatcher** ein.
3. `startedTmdbHttpRequests()` liefert den **wirklich am TMDB-Transport gestarteten Request-Zähler**, z. B. `WaipuTmdbSearchClient.requestsStarted`. Er zählt Netzwerkversuche, nicht Match-Cache-Hits, Titel oder theoretische Suchfälle. Eine echte Einsparung wird nur als **Differenz zweier im Replay gemessener Zähler** ausgewiesen.
4. Die TMDB-Werkidentität jedes Ergebnisses im Indexversuch wird **gegen die unabhängig ermittelte Baseline** geprüft. Eine falsch übernommene TMDB-ID oder abweichender Medientyp setzt `safeToConsiderFurtherPilot=false`; der A/B-Lauf kann dadurch **niemals** zum Beweis fehlerfreier Zuordnungen werden. Die reale Produktionsersparnis steht in jedem Bericht auf `measuredProductionSavings: null`, bis ein anderer geprüfter Realversuch sie ausdrücklich ermittelt.
5. Die Ausgabe enthält nur Zähler, Sicherheitsfreigaben und Grenzen, **keine** EPG-Titel, TMDB-IDs, privaten Quellinhalte, API-Tokens oder Wiedergabelinks.

## Regressionstests mit echtem Waipu-TMDB-Matcher

`tests/epg-g1e-compare-tmdb-transport.test.js` benutzt den vorhandenen `matchWaipuProgram` und den vorhandenen `WaipuTmdbSearchClient` mit einem deterministischen **HTTP-Teststub**. Es prüft:
- Bei zwei unabgedeckten Titeln: Baseline 2 tatsächlich gestartete Test-HTTP-Requests, Indexarm 1, beide TMDB-Identitäten übereinstimmend. Dies sind **simulierte HTTP-Testanfragen**, keine reale Nightly-Reduktion.
- Wenn der unabhängige Waipu-Cache einen Treffer bereits liefert: beide Seiten 0 HTTP-Requests, auch wenn der gemeinsame Index denselben Film kennt. **Keine fiktive Einsparung.**
- Bei Indexausfall oder Cache-Miss: beide Seiten verwenden den normalen Matcher, keine zusätzliche Abhängigkeit.
- Bei falscher gemeinsam wiederverwendeter TMDB-ID: `identityMismatches > 0`, Sicherheitsfreigabe negativ, keine angebliche Produktionsersparnis.
- Bei falsch konfigurierten nicht unabhängigen Matcher-Sessions, unterschiedlichen Cache-Inhalten, **gefälschten identischen Fingerabdruck-Labels**, gemeinsam genutzten Cacheobjekten, negativen oder manipulierten HTTP-Zählern wird der Vergleich abgebrochen. Unterschiedliche JSON-Schlüsselreihenfolge allein erzeugt dagegen keine Scheindifferenz.

## Weiteres G1e-Gate

Der Aufbau ist eine **reproduzierbare Testmechanik**. Eine aussagekräftige Zahl für den echten Nachtlauf braucht erst:

- Reale **vorab bestätigte** Quittungen aus den neuen, opt-in Waipu- und Joyn-Capture-Hooks, mit Originalprogramm-ID, SourceRef und ungeändertem Matcher-Zeitstempel;
- zwei **unabhängig initialisierte** identische Adapter-Cache-Snapshots und denselben Quelldatenstand für baseline/indexed;
- eine kontrollierte, begrenzte Laufumgebung mit realem TMDB-HTTP-Transportzähler und dokumentiertem Rate-Limit/Retry-Verhalten;
- eine Qualitätskontrolle der Original-Matcher-Identitäten und insbesondere der Serienepisoden. G2/Produktivaktivierung nur nach wiederholter fehlerfreier Abnahme.

**Bis dahin keine Live-Änderung an Nightly, Firebase, Waipu, Joyn, XMLTV oder der MovieHub-App.**
