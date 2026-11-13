# MovieHub #336 – Roter Faden: XMLTV-Multi-Source, unabhängige EPGs und senderbezogene AIR-Routen

**Verbindlicher Arbeitsstand: 13.11.2026.** Dieses Blatt ist der kurze Gesamt-Checkpoint neben dem sehr langen [Issue #336](https://github.com/matthias-ennen/movie-hub/issues/336). Es ersetzt keine technischen Testergebnisse, sondern verhindert, dass die Original-Joyn-Matcher-Diagnose das eigentliche XMLTV-Produktziel verdrängt.

## Ziel / Definition of Done

Ein **quellunabhängiger XMLTV-Multi-Source-Adapter** ergänzt Waipu und Joyn: mindestens zwei austauschbare Feedquellen, davon **mindestens eine mit tatsächlich gemessenen fünf Tagen** EPG auf den freigegebenen Sendern; sieben Tage sind besser, vierzehn optional. Nicht jede unabhängige Backupquelle muss zwingend selbst fünf Tage liefern; ihre echte Abdeckung und die Folgen bei Ausfall werden transparent gemacht. Es braucht belastbare Beobachtung an mehreren Tagen, nicht nur einen Momentbefund.

Die Quellen liefern EPG-Sendedaten. **Senderbezogene AIR-Aktionen** sind davon getrennt und erhalten nur später einzeln kuratierte, auf Android und Fire TV getestete `scope=channel`-PlaybackRoutes. Ohne freigegebene Route **kein toter Button**; eine lineare TV-Ausstrahlung ist **kein** TMDB-/JustWatch-VOD-Angebot. Alle Programme und Sender bleiben nachvollziehbar ihrer Quelle zuordenbar, identische Ausstrahlungen werden dedupliziert. Bei Fehlern darf die andere Quelle unabhängig weiterarbeiten.

Produktive Aktivierung ist erst nach Quellenqualität, Nutzungsbedingungen/Rechtebewertung für den vorgesehenen Einsatz, Cache-/Last-known-good-Sicherheit, festgelegten Sender-Routen und echter Geräteabnahme erlaubt. Bestehende Nightly-/Firebase-/App-Wege bleiben bis dahin unangetastet.

## Arbeitspakete mit eindeutigen Gates

| Paket | Stand | Nachweis / Noch offene Freigabe |
|---|---|---|
| **G0 – reale Feedprobe** | Technisch erledigte Stichprobe, Langzeit-/Rechtegate offen | Drei DE-Feeds gelesen; auf sechs Sendern IPTV-EPG.org und FreeEPG 120h, EPGSHARE01 kürzer. Datenzugang, Nutzungsbedingungen und Mehrtages-Stabilität weiter prüfen |
| **G1a – XMLTV-Sicherheit/Parser** | Baustein in `main` | Größen-/DOCTYPE-/DST- und Zeit-, Kanal-/Episoden-Parser, keine geschätzten Sender oder TMDB-IDs |
| **G1b – Sender-Mapping, Matcher, Deduplikation** | Isolierter Baustein in `main` | Sechs echte Sender-IDs, nur positive kontrollierte Matches; Merge mit Waipu/Joyn als Offline-Vorschau |
| **G1c – Metadaten/Echtqualität** | Echte Messungen 11. und 13.11.; Langzeitnachweis offen | 120h auf sechs Sendern; unterschiedliche Metadatenqualität; Quelle/IPTV+FreeEPG zeigte identische 854 Basisprogramme |
| **G1d – geteilter Identitätsindex** | Optionales Modul in `main`, **deaktiviert** | Darf nur genehmigte positive Belege liefern, alle Adapter behalten eigenen Matcher |
| **G1e – Original-Joyn-A/B-Quittungen** | Abgegrenzt, nicht produktiv freigegeben | Private Read-only-Audits technisch erfolgreich; keine neue vollständig abgeschlossene Originalgeneration mit freigegebenen Quittungen; Einsparung `null`; kein HTTP-Go |
| **G1f – Quellenabdeckung/Familien/Gesundheit** | Read-only-Echtmessung 13.11. grün; Mehrtages-Gate offen | Exaktes Vereinen der realen EPG-Zeitintervalle pro Sender über 120h, echte Lücken, Quellenfrische, getrennte Inhaltsfamilien. **Zwei Hosts sind nicht automatisch zwei unabhängige Quellen** |
| **G2 – Staging mit Ausfall-Fallback** | Isolierter Offline-LKG-Vorabtest im PR; **G2 nicht freigegeben** | Mehrere Tage erneut messen; echten mehrquelligen Cache und Last-known-good sicher testen; keine Cross-Feed-/TMDB-Falschzuordnung |
| **G3 – Sender-AIR-Routen** | **Einzelabnahme offen** | Senderweise echte Links festlegen, Kanal- statt Sendungswiedergabe erklären, Android/Fire-TV-Tests |
| **G4 – produktive Freigabe** | **Gesperrt** | Quellen-/Nutzungsrecht, Genauigkeit, Defektverhalten, Nightly/Hosting-Rollback und Nutzerabnahme |

## G1f: Warum wir gerade hier weiterarbeiten

Der bestätigte G1c-Messwert von **854** identischen Basis-Sendeereignissen bei **FreeEPG und IPTV-EPG.org** macht diese zwei Hosts für die sechs überprüften Sender zunächst zu **einer Inhaltsfamilie**. Als unabhängigerer Kandidat existiert EPGSHARE01, dessen gemessene Vorschau bisher aber nur etwa 3,2 Tage betrug. Die frühere Gleichsetzung von „zwei Downloads“ mit „zwei robuste EPG-Quellen“ wäre deshalb ein Abnahmefehler.

Die G1f-Prüfung arbeitet **nur mit bereits geparsten Kandidaten** und sechs ausdrücklich freigegebenen Sender-IDs. Sie zählt die tatsächliche Vereinigungsmenge belegter Sendezeitintervalle im nächsten 120h-Fenster; eine hohe Programmzahl ohne lückenlose Stunden ist **kein** 5-Tage-Beweis. Sie unterscheidet bewusst drei Signale:
1. mindestens **eine** vollständig 120h deckende Primärquelle;
2. eine zusätzliche **unabhängige** frische Inhaltsfamilie mit tatsächlich vorhandenen zukünftigen Programmen (darf kürzer sein);
3. die strengere, nur optional zusätzliche Resilienzlage: zwei unabhängige Familien mit jeweils vollen 120h.

Ein einzelner gesunder G1f-Snapshot ist **noch kein** Nachweis mehrtägiger Zuverlässigkeit, kein Rechte- oder Produktions-Go und kein konkreter Freigabebeschluss. Die Familieneinstufung basiert auf der bislang gemessenen Inhaltsidentität und muss bei geänderten Feeds überprüft werden. Die Berichte führen ausschließlich numerische Stationsabdeckung und freigegebene Quellen-IDs, keine Sendungstitel.


## 13.11.2026 – zweite echte G1c/G1f-Stichprobe (neue 120h-Logik)

[Read-only GitHub-Run #43433205711](https://github.com/matthias-ennen/movie-hub/actions/runs/43433205711) auf `main` / `68f7d28e` **grün**, um 13:23 UTC. Offline-Tests, echter Vergleich der drei bekannten DE-Feeds und Aggregat-Artefaktupload grün; keine TMDB-API-Suche, kein Nightly-Import oder App-Go. Aktuell gezählte Sendungen der sechs kontrollierten Sender: **IPTV-EPG.org 864**, **FreeEPG 864**, **EPGSHARE01 449**. Neue G1f-Kernaussage der Action: **mindestens eine 120h-vollständige Primär-Inhaltsfamilie**, **zwei Inhaltsfamilien mit echten Zukunftsdaten**, aber **keine zwei vollständig 120h-deckenden unabhängigen Familien**. Lokale Referenz-Titelmatches 189/55/82 sind **keine TMDB-Gesamtquote**. Das ist die zweite Stichprobe nach dem 11.11., **kein mehrtägiger Dauer-/Ausfallnachweis**. Die Quellenrechte und Produktivnutzung bleiben ungeprüft.

### Rein lokaler Last-known-good-Vorabtest (kein G2-Go)

`src/sources/xmltv/xmltvLastKnownGoodPreview.js` ist ausdrücklich **nur eine offline geprüfte Diagnose**: Aktuelle Quelle hat Vorrang; bei Fehlzustand wird ein bereits vorhandener Last-known-good-Snapshot nur bei identischer Quell-ID, Status `ok`, echtem UTC-Beobachtungszeitpunkt (höchstens 36h alt), validen explizit zonierten Sendungen und **noch vorhandener Zukunftsdeckung aller sechs Sender** berücksichtigt. Die Restdeckung wird aus den **alten Programmzeiten zum aktuellen Zeitpunkt** neu berechnet; nach 24 Stunden wird eine ursprünglich 120h-vollständige Datei daher nicht fälschlich wieder als 120h vollständig ausgegeben. Gleiche Feed-Inhaltsfamilien zählen als **ein** Fallback. Ergebnis enthält ausschließlich feste Aggregate, keine Programme, TMDB-IDs, Quittungen oder Links. `publishApproved=false` und `tmdbReuseApproved=false` sind fest. Dies ist weder ein persistierender Produktivcache noch ein aktivierter Adapter.

## Verbindlicher Abschlussvertrag: gemeinsamer TMDB-Cache und Matcher für Waipu, Joyn, XMLTV

**Dieser Strang bleibt Teil von #336 und darf nicht stillschweigend durch das XMLTV-Quellenpaket ersetzt werden.** Die G1d-Identitätsschicht ist nicht gleichbedeutend mit einem zentralen Cache für rohe TMDB-Suchantworten. Bisher besitzen Waipu/Joyn eigene Entscheidungs-/Lookup-Caches, während der gemeinsame `SharedEpgIdentityIndex` nur bestätigte **Werkidentitäten** anbieten kann. Das ist eine absichtliche Sicherheitsgrenze, aber noch **keine** fertige produktive Drei-Adapter-Integration.

- [ ] **Cache-Bestands- und Schlüsselvertrag:** Waipu-, Joyn- und XMLTV-Matcher dokumentieren, welche TMDB-Response-/Entscheidungskeys, TTLs, Werk-/Staffel-/Folgen-Evidenz und Quellenfelder sie verwenden. Geteilte Antwortcaches nur bei semantisch identischen TMDB-Request-Parametern (inkl. Medienart, Sprache, Jahr, Region, Alias/Query); keine Vermischung von Antwortcache, bestätigter Werkidentität und EPG-Quellenbeleg.
- [ ] **Originale und Provenienz:** Jede zum Shared-Index zugelassene positive Entscheidung trägt belegte Original-Sendungstitel, unveränderte kanonische Sender-/Sendezeit, Quell-IDs, Matcher-/Version, eindeutige TMDB-Werk-/Episoden-ID und Gesundheitsstatus. Niemals den TMDB-Titel als angeblichen Original-EPG-Titel erfinden; unbekannte Daten und Konflikte bleiben `miss`/`conflict`.
- [ ] **Drei separat überprüfte Adapterhooks:** XMLTV-, Waipu- und Joyn-Lookup hinter zunächst ausgeschaltetem Feature-Flag. Positiver fremder Quellbeleg darf nur bei exakter Kompatibilität den Originalmatcher entlasten; sonst originaler Adaptermatch und seine lokalen Caches. XMLTV-Quellenfehler dürfen nicht Waipu/Joyn blockieren und umgekehrt.
- [ ] **Snapshot-Betrieb:** Nur ein koordinierter Writer nach gesunden vollständigen Quellengenerationen; atomare Versionierung, TTL, Größenlimits, konkurrierende Nightly-Läufe, Stale-/Korruptions-/Ausfallschutz und Rollback testen. Keine unbewiesenen temporären Daten oder ungeprüften EPG-Identitäten als produktiven Shared-Index veröffentlichen.
- [ ] **Echte Effizienz- und Qualitätsbelege:** identische Baseline- und Shared-Index-Arme mit **gleichen Ausgangscaches**; reale gestartete TMDB-HTTP-Versuche (nicht nur Treffer oder Titel) und Werk-/Episode-/Sendeereignis-Identitäten vergleichen. Fehlzuordnungen 0, Konflikte/Fallbacks dokumentieren, an mehreren Daten-/Adaptergenerationen nachprüfen. Aktuell: `measuredProductionSavings=null`.
- [ ] **Gestaffelte Produktionsabnahme:** Nach Rechten/Quellen- und G2-Gates kontrolliert aktivieren, Nightly-/Firebase-Messung samt Kosten/Fehler-/Frischemetriken und Rückfallgrenzen; keine defekten Senderlinks. G3-AIR-Abnahme auf Android und Fire TV bleibt unabhängig davon erforderlich.

**Stopregel für diesen Strang:** Erst wenn alle drei Adapter nachweislich korrekt und effizient mit dem gemeinsamen Cache-/Identitätsvertrag arbeiten und das Fallback geprüft ist, gilt die Cache-/Matcherarbeit als fertig. Ein grüner synthetischer Test oder eine unveränderte `null`-Einsparungszahl ist **kein** Abschluss.

## Nächste zwei technisch sinnvolle Arbeiten nach G1f

**Erstens** G1c/G1f read-only über unterschiedliche Tage wiederholen, um Veränderung, reale Lücken, Quellfrische und die tatsächliche Unabhängigkeit zu prüfen; nie bloß ältere Messungen als neue ausgeben. **Zweitens** einen isolierten Last-known-good-/Failover-Test für mindestens zwei Quellfamilien einführen, der bei zeitweise leerem Feed **nicht** ohne Altersprüfung alte Programmdaten oder ungeprüfte TMDB-Identitäten publiziert. G2 erst nach den entsprechenden Gates planen.

**G1e-Wächter:** Die 126 offline gecachten Original-Joyn-Matcher-Versuche aus #805 lieferten keinen neuen sicheren Match, die einzige Laufzeitnachprüfung ebenfalls nicht. Ohne neue, vertrauenswürdige Originalquell-Metadaten oder eine ausdrücklich freigegebene harte Mikroprobe dort **keine** weitere Folge von immer feineren Mehrdeutigkeitszählungen ansetzen.

**Stopregel:** Kein „grüner Workflow“ ist ein Produktions-Go. Ein Gate wird nur mit reproduzierbarem Quelldatennachweis und eigener Abnahme geschlossen. Die Aufgabe ist erst erfüllt, wenn nutzbare XMLTV-Programme und echte AIR-Routen auf den Geräten funktionieren – nicht bereits, wenn ein interner Matcher-Test grün wird.
