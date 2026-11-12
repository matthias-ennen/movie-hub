# MovieHub #336 – G1e-2c: Joyn nur auf ausdrücklichen Testaufruf belegen

**Stand 12.11.2026.** Produktiver Joyn-/Waipu-/XMLTV-Import und gemeinsamer Index bleiben unverändert. Dies ist eine zusätzliche, **standardmäßig deaktivierte** Belegerfassung für interne, isolierte Qualitätsprüfungen.

## Herausforderung

Joyn-Matcher v5 liefert bestätigte TMDB-Identitäten, und Joyn bewahrt den originalen EPG-Programmtitel auf. Aber der gewöhnliche Joyn-Entscheidungs-Cache kann einen Treffer aus einer älteren Generation wiederverwenden. Für einen gemeinsamen positiven Ausstrahlungsindex ist deshalb **der ursprüngliche Prüfzeitpunkt** des Treffers entscheidend. Seit PR #767 kann dieser über `JoynMatchCache.getWithProvenance()` gelesen werden, ohne die bisherigen `get()`-/Cache-Semantiken zu verändern.

## Neue Implementierung

In `runJoynAdapterDiagnostic()` gibt es einen neuen **optionalen Parameter** `onCompletedEvidence = null`. Nur im ausdrücklich aktivierten Testmodus:

1. Beim echten, **frischen** Matching wird der Zeitpunkt des fertigen Matcher-Ergebnisses als `checkedAt` festgehalten. Bei Cache-Hits wird der ursprüngliche Zeitstempel aus `getWithProvenance()` mitgeführt. Die normale Joyn-Verarbeitung nutzt weiterhin ihr bisheriges `matchCache.get()` mit identischen Resultaten und identischer Trefferzählung.
2. Nach dem Erzeugen **und erfolgreichen Publizieren** der vollständigen, als healthy bestätigten Quellgeneration wird der optionale Collector geladen und aufgerufen.
3. `collectApprovedJoynEvidence()` prüft, ob ursprüngliche `joynProgramId`, kanonischer Sender, EPG-Titel sowie exakte Start-/Endzeiten das echte BroadcastEvent mit dem originalen Matcherentscheid verbinden. Für nicht eindeutige doppelte Quellzeilen wird **kein** Treffer geraten.
4. Nur der bereits durch #767 getestete `buildJoynApprovedEpgReceipt` darf daraus einen positiven Quellbeleg machen. Er verlangt eine **exakte eindeutige Joyn-Titelzuordnung**, gültige TMDB-ID/Typ-/Jahre und unverfälschte Matcher- oder Cache-Zeit. Ältere Cacheentscheidungen werden nicht neu datiert; sie werden gegebenenfalls als shared-proof **abgelehnt**, obwohl Joyn sie selbst weiterhin verwenden darf.
5. Der frei wählbare **private** Testcallback erhält nur im Speicher `approvedEvidence` mit Original-EPG-Titeln. Diese dürfen **nicht** in die öffentliche TV-Katalog- oder GitHub-Actions-Datenpublikation fließen. Im normalen Rückgabeobjekt erscheint bei Opt-in ausschließlich `sourceEvidenceCapture` mit Status und **aggregierten Zählern**, niemals der sensitive Quellinhalt.
6. Fehler im optionalen Collector oder Callback werden abgefangen und mit `status: unavailable` dokumentiert; sie dürfen den bereits erfolgreichen ursprünglichen Joyn-Lauf nicht in einen Fehler verwandeln. **Ohne** Callback finden keine zusätzlichen Matcher-/TMDB-Aufrufe und keine dynamischen Imports statt.

## Tests

`tests/epg-g1e-joyn-evidence-capture.test.js` nutzt `matchJoynProgram`, `JoynMatchCache`, `mapJoynCandidateToBroadcastEvent` und `buildJoynSourceEnvelope` – keine erfundenen neuen Matcher. Geprüft werden die freiwillige Inaktivität, frische und alte Cacheentscheidungen, korrekte Quellkennung/Zeit, widersprüchliche Titel, duplizierte Quellprogramme, fehlende Belege, unhealthy/überlange Quelle, vollständige Ausgabeisolation sowie Fehler eines optionalen Testcallbacks.

## Noch nicht belegt

**Es wurden bislang keine TMDB-Requests durch den gemeinsamen EPG-Index nachweislich eingespart.** Der Replay gegen den echten Nightly bestätigte zwar 10.481 übereinstimmende Werk-Ausstrahlungen von Waipu/Joyn; das sind keine neuen API-Abfragen und die individuellen Matcher-Caches sparen bereits Anfragen. Das ist wichtig für das nächste Gate:

**G1e-2d:** Eine ausdrücklich gestartete private Testgeneration mit denselben Quellprogrammen und unabhängig initialisierten identischen lokalen Waipu-/Joyn-Matcher-Caches zwei Mal verarbeiten: einmal mit gemeinsamem Index deaktiviert und einmal aktiviert. Die **tatsächlich gestarteten** TMDB-HTTP-/Search-Requests vergleichen, Fehlzuordnungen und Konflikte zählen und den unabhängigen Fallback absichern. Keine produktive Aktivierung ohne wiederholte erfolgreiche Prüfung. AIR-Senderlinks weiterhin separat verifizieren; keine Annahmen aus bloßen EPG-Daten.
