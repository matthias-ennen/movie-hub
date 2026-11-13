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
| **G1c – Metadaten/Echtqualität** | Erste echte Messung in `main`; Wiederholungsnachweis offen | 120h auf sechs Sendern; unterschiedliche Metadatenqualität; Quelle/IPTV+FreeEPG zeigte identische 854 Basisprogramme |
| **G1d – geteilter Identitätsindex** | Optionales Modul in `main`, **deaktiviert** | Darf nur genehmigte positive Belege liefern, alle Adapter behalten eigenen Matcher |
| **G1e – Original-Joyn-A/B-Quittungen** | Abgegrenzt, nicht produktiv freigegeben | Private Read-only-Audits technisch erfolgreich; keine neue vollständig abgeschlossene Originalgeneration mit freigegebenen Quittungen; Einsparung `null`; kein HTTP-Go |
| **G1f – Quellenabdeckung/Familien/Gesundheit** | In Umsetzung, weiterhin read-only | Exaktes Vereinen der realen EPG-Zeitintervalle pro Sender über 120h, echte Lücken, Quellenfrische, getrennte Inhaltsfamilien. **Zwei Hosts sind nicht automatisch zwei unabhängige Quellen** |
| **G2 – Staging mit Ausfall-Fallback** | **Nicht begonnen/freigegeben** | Mehrere Tage erneut messen; echten mehrquelligen Cache und Last-known-good sicher testen; keine Cross-Feed-/TMDB-Falschzuordnung |
| **G3 – Sender-AIR-Routen** | **Einzelabnahme offen** | Senderweise echte Links festlegen, Kanal- statt Sendungswiedergabe erklären, Android/Fire-TV-Tests |
| **G4 – produktive Freigabe** | **Gesperrt** | Quellen-/Nutzungsrecht, Genauigkeit, Defektverhalten, Nightly/Hosting-Rollback und Nutzerabnahme |

## G1f: Warum wir gerade hier weiterarbeiten

Der bestätigte G1c-Messwert von **854** identischen Basis-Sendeereignissen bei **FreeEPG und IPTV-EPG.org** macht diese zwei Hosts für die sechs überprüften Sender zunächst zu **einer Inhaltsfamilie**. Als unabhängigerer Kandidat existiert EPGSHARE01, dessen gemessene Vorschau bisher aber nur etwa 3,2 Tage betrug. Die frühere Gleichsetzung von „zwei Downloads“ mit „zwei robuste EPG-Quellen“ wäre deshalb ein Abnahmefehler.

Die G1f-Prüfung arbeitet **nur mit bereits geparsten Kandidaten** und sechs ausdrücklich freigegebenen Sender-IDs. Sie zählt die tatsächliche Vereinigungsmenge belegter Sendezeitintervalle im nächsten 120h-Fenster; eine hohe Programmzahl ohne lückenlose Stunden ist **kein** 5-Tage-Beweis. Sie unterscheidet bewusst drei Signale:
1. mindestens **eine** vollständig 120h deckende Primärquelle;
2. eine zusätzliche **unabhängige** frische Inhaltsfamilie mit tatsächlich vorhandenen zukünftigen Programmen (darf kürzer sein);
3. die strengere, nur optional zusätzliche Resilienzlage: zwei unabhängige Familien mit jeweils vollen 120h.

Ein einzelner gesunder G1f-Snapshot ist **noch kein** Nachweis mehrtägiger Zuverlässigkeit, kein Rechte- oder Produktions-Go und kein konkreter Freigabebeschluss. Die Familieneinstufung basiert auf der bislang gemessenen Inhaltsidentität und muss bei geänderten Feeds überprüft werden. Die Berichte führen ausschließlich numerische Stationsabdeckung und freigegebene Quellen-IDs, keine Sendungstitel.

## Nächste zwei technisch sinnvolle Arbeiten nach G1f

**Erstens** G1c/G1f read-only über unterschiedliche Tage wiederholen, um Veränderung, reale Lücken, Quellfrische und die tatsächliche Unabhängigkeit zu prüfen; nie bloß ältere Messungen als neue ausgeben. **Zweitens** einen isolierten Last-known-good-/Failover-Test für mindestens zwei Quellfamilien einführen, der bei zeitweise leerem Feed **nicht** ohne Altersprüfung alte Programmdaten oder ungeprüfte TMDB-Identitäten publiziert. G2 erst nach den entsprechenden Gates planen.

**G1e-Wächter:** Die 126 offline gecachten Original-Joyn-Matcher-Versuche aus #805 lieferten keinen neuen sicheren Match, die einzige Laufzeitnachprüfung ebenfalls nicht. Ohne neue, vertrauenswürdige Originalquell-Metadaten oder eine ausdrücklich freigegebene harte Mikroprobe dort **keine** weitere Folge von immer feineren Mehrdeutigkeitszählungen ansetzen.

**Stopregel:** Kein „grüner Workflow“ ist ein Produktions-Go. Ein Gate wird nur mit reproduzierbarem Quelldatennachweis und eigener Abnahme geschlossen. Die Aufgabe ist erst erfüllt, wenn nutzbare XMLTV-Programme und echte AIR-Routen auf den Geräten funktionieren – nicht bereits, wenn ein interner Matcher-Test grün wird.
