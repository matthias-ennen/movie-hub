# MovieHub #336 – G1d: gemeinsamer Identitäts-/Ausstrahlungsindex als optionaler Cache

Stand 11.11.2026. **Getrenntes, isoliertes Entwicklungsmodul vor G2. Keine Aktivierung im produktiven Nightly und keine App-/Firebase-Veränderung.**

## Freigegebene Architektur

**Quellenadapter bleiben eigenständig**: Waipu, Joyn und XMLTV lesen ihre EPG-Daten, klassifizieren Programme und können ihre bisherigen lokalen Matcher und TMDB-Suchwege ohne gegenseitige Abhängigkeit weiterführen. Ein gemeinsamer Index ist **nur eine optionale, positiv bestätigte Vorab-Information**. Bei Abwesenheit, Korruption, Veraltung, Konflikt oder Nichtübereinstimmung läuft **sofort der ursprüngliche, unabhängige Matcher** des Adapters.

**Beispiel:** Waipu hat `ard` am Samstag 09:00–11:00 mit TMDB-ID 777 und eindeutigem Filmnamen bestätigt. Joyn oder XMLTV lesen dieselbe ARD-Sendung. Der Index prüft kanonischen Sender, exakten normalisierten Programmtitel, Medientyp und die bekannten Zeitüberschneidungsregeln. Nur wenn keine andere, widersprüchliche Werkidentität oder Programmbelegung für diesen Sendeplatz vorliegt, liefert er die bestätigte TMDB-ID zurück. Der Adapter kann **dann** eine neue TMDB-Anfrage überspringen; **der Index liefert niemals einen Provider-Badge, Mediathek-Verfügbarkeit oder Wiedergabelink.**

## G1d implementiert

`src/sources/sharedEpgIdentityIndex.js`
- Versioniertes, rein datenorientiertes Schema; positive Belege müssen `matchStatus: 'matched'`, `approved: true`, eine gültige positive TMDB-ID, einen kanonischen Sender, Quellenkennung, gültige Start-/Endzeit und Zeitpunkt/Matcher-Methode haben. Unbestätigte, ungültige oder >30 Tage alte Belege werden **nicht** gespeichert.
- Gleiches Ausstrahlungsfenster: **gleicher kanonischer Sender, gleicher normalisierter Titel und Typ**, maximal **5 min Startzeitunterschied** und **≥80 % Intervallüberschneidung**, wie im bestehenden `mergeTvAirings`-Vertrag. Bekannte Jahre/Staffeln/Folgen dürfen nicht widersprechen.
- Ein **anderer** Sendungstitel oder eine andere TMDB-ID am selben Sendeplatz blockiert die Wiederverwendung; **keine First-Wins-Strategie**.
- Titelübergreifende Ausstrahlungen: ohne denselben Slot nur dann Wiederverwendung, wenn **Typ, exakter Titel und explizit bekanntes Produktionsjahr** zusammenpassen und **eine einzige** positive TMDB-Identität übrig bleibt; ohne Jahr keine titelbasierte globale Wiederverwendung.
- Jeder Treffer führt die Quellbelege (z. B. `waipu`, `joyn`, `xmltv:iptv-epg-org`) auf, erzeugt aber ausdrücklich **keine** `providerIds`, `playbackRoutes`, `FREE`- oder `AIR`-Anbieteraktionen.
- `matchWithOptionalSharedEpgIndex` ist der **freiwillig aufzurufende Vorab-Hook**: `hit` → Identität für den Adapter; `miss/conflict/error/undefined` → unvermindert `matchIndependently`. Er schreibt **nicht** in den Index und publiziert keine Events.

`scripts/shared-epg-index-store.mjs`
- Optionale, atomar ausgetauschte lokale JSON-Datei, maximal 24 MiB. Bei fehlender/defekter Datei wird ein leerer Index zurückgegeben, ohne den unabhängigen Adapter zu blockieren. Beim Lesen werden Alter, Schema und Dateneinträge erneut validiert.
- **Betriebsprinzip für eine spätere Integration:** Eine einzige, koordinierte Stelle darf nach erfolgreichen vollständigen Adaptergenerationen den Snapshot schreiben. Andere Adapter lesen nur. Das vermeidet gleichzeitiges Überschreiben und verhindert, dass ein ausgefallener Adapter eine produktive Abhängigkeit erzeugt.
- Das Produktiv-Repository aktiviert diesen Store derzeit **nirgends** im Nightly; das ist absichtlich ein Integrations-Gate.

**Regressionstests:** `tests/shared-epg-identity-index.test.js` und `tests/shared-epg-index-store.test.js`. Simulieren Waipu→Joyn/XMLTV-Wiederverwendung, zeitliche Toleranzen, gleiche/abweichende Titel, widersprüchliche TMDB-IDs, Staffelkonflikte, gleichnamige Filme mit unterschiedlichen Jahren, abgelaufene Entscheidungen, kaputte Snapshots sowie unabhängigen Fallback.

## Noch keine nachgewiesene TMDB-Einsparung

Ein grüner G1d-Test beweist nur **korrekte Vorab-Wiederverwendung in kontrollierten Tests**. Er misst **noch keine** reale Einsparung im produktiven Nachtlauf. Die Waipu- und Joyn-Matcher besitzen bislang getrennte Caches (Waipu-Entscheidungsstore, Joyn-Entscheidungs-/Lookup-Cache) und bleiben unverändert. `mergeTvAirings` dedupliziert erst **nach** der TMDB-Werkidentifikation; dieser neue Index ist die geplante Ergänzung davor.

## Nächstes separates Integration-Gate G1e

1. G1c PR #762 (echte XMLTV-Titel-/Episoden-Qualitätsprobe) vollständig grün prüfen und übernehmen, falls noch nicht geschehen; er läuft unabhängig von diesem G1d-PR.
2. Nachweislich **vollständige und qualitätsgeprüfte** bestätigte Waipu-/Joyn-/XMLTV-`BroadcastEvent`-Generationen als einzige Eingänge für den gemeinsamen positiven Index aufbereiten. Keine ungeprüften XMLTV-Rohprogrammtitel als `approved` deklarieren.
3. Ein einziger Snapshot-Writer nach Abschluss der Quellengenerationen; bisherige lokale Adapter-Caches bleiben. Eine Adapterstörung führt höchstens zu weniger neuen gemeinsamen Belegen, nicht zu fremdem Adapterversagen.
4. Optionalen Vorab-Lookup **hinter einem deaktivierten Feature-Flag** zuerst für die XMLTV-G1c-Preview und anschließend getrennt für Waipu/Joyn einbauen. Bei Hit dieselbe TMDB-ID und vorhandene EPG-Metadaten erhalten; bei Fehlermeldung/Unklarheit ursprünglicher Matcher. Inkonsistente Treffer nie automatisch überschreiben.
5. Metriken im kontrollierten Dry-Run: Lookup-Hits, echte vermiedene TMDB-Requests, Konflikte, Fallbacks, Fehlzuordnungen; mindestens Wiederholung an unterschiedlichen Tagen und Vergleich mit Baseline.
6. Erst nach Prüfung weiterer Sender, Quellnutzungsbedingungen und Cache-/Freshness-/last-known-good-Strategie folgt G2 produktiver Nightly-Import. **Feste AIR-Livestream-Ziele werden weiterhin gemeinsam senderweise festgelegt und auf Android/Fire TV geprüft.**

**Status G1d:** Index- und Persistenzbausteine samt Isolationstests, **keine** produktiven Adapteränderungen. Die ursprüngliche Quellunabhängigkeit bleibt erhalten.
