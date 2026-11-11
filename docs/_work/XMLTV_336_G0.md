# XMLTV Multi-Source EPG – G0-Pilot (#336)

Status: 11.11.2026 – zunächst read-only Quellendiagnose, keine Produktivintegration.

## Echte Live-Messung – 11.11.2026

Der isolierte G0-Workflow wurde tatsächlich erfolgreich ausgeführt, ohne eine Produktionsveröffentlichung: [Originalrun 43082266491](https://github.com/matthias-ennen/movie-hub/actions/runs/43082266491) (JSON-Artefakt mit den originalen Zählern und anonymen Programm-Fingerprints).

| Feed | Kanäle mit EPG | Zukunftsausstrahlungen (Stand 19:50 CET, gerundet) | Episodennummern | Besondere Beobachtung |
|---|---:|---:|---:|---|
| EPGSHARE01 | 251 | 22.439 | 8.859 (gesamtes XML) | für große Sender 4–5 **berührte Kalendertage**, jedoch keine 5 vollständigen Zukunftstage bestätigt |
| FreeEPG | 692 | 81.142 | 0 (gesamtes XML) | 38 MiB große Antwort, trotz `.gz`-Dateiname unkomprimiertes XML; viele regionale bzw. alternative Sender-IDs |
| IPTV-EPG.org | 438 | 64.435 | 23.405 (gesamtes XML) | `DE - Sendername`-Varianten; anfänglicher einfacher Sendername-Abgleich erfasste diese nicht automatisch |

### Präzise Zukunftsreichweite – bestätigter Folgelauf

[Originalrun 43082648593](https://github.com/matthias-ennen/movie-hub/actions/runs/43082648593) mit messbarer **Restreichweite in Stunden ab Probezeitpunkt** (11.11.2026, 19:58 CET).

| Sender | EPGSHARE01 (direkter Sender) | FreeEPG numerischer Sender | DE-Senderblock FreeEPG/IPTV-EPG.org |
|---|---:|---:|---:|
| Das Erste | 77,3 h | 69 h | 124,0 h |
| ZDF | 77,2 h | 69 h | 125,3 h |
| RTL | 77,1 h | 69 h | 124,0 h |
| ProSieben | 80,2 h | 69 h | 125,0 h |
| Sat.1 | 78,3 h | 69 h | 124,4 h |
| VOX | 77,5 h | 69 h | 124,5 h |

**Schlussfolgerung:** **Erstmals realer Nachweis eines mehr als 120 Stunden in die Zukunft reichenden EPG-Horizonts** für die sechs wichtigen Sender im eindeutig bezeichneten `DE - ...`-Block. Dies ist noch kein vollständiger Beleg lückenloser Sendeminuten oder dauerhaft stabiler Daten. Die `DE - ...`-Sender entsprechen Namens-/ID-Kandidaten, deren endgültiges kanonisches Mapping separat geprüft wird. Dieser Block ist bei FreeEPG und IPTV-EPG.org identisch und deshalb **eine** Inhaltsfamilie, nicht zwei echte unabhängige Planungsquellen. EPGSHARE01 ist als kürzerer **Fallback** geeignet, sofern er über wiederholte Tests stabil bleibt.

**Wichtiger Unabhängigkeitsbefund:** Die Programm-Fingerprints der Sender `ZDF.de`, `DasErste.de`, `RTL.de`, `ProSieben.de`, `SAT1.de` und `VOX.de` aus dem `DE - ...`-Block sind bei **FreeEPG und IPTV-EPG.org identisch**. Das zeigt, dass diese Feeds für diese Sender **dieselben Programmpläne** ausliefern. Zwei Hosts sind deshalb **keine zwei unabhängigen Inhaltsquellen**. EPGSHARE01 hat abweichende Fingerprints und ist ein wichtiger separater Vergleichskandidat. Herkunft/Langzeitstabilität der zugrunde liegenden Grabber sind weiterhin ungeklärt.

**Messkorrektur:** Der Probelauf hatte zunächst Kalenderdaten gezählt, die auch nur von einer einzigen Sendung berührt sein können. Das beweist **kein** fünf Tage vorausreichendes EPG. Das Skript misst deshalb inzwischen die **reale restliche Zukunftsreichweite in Stunden je Sender** und zeigt mögliche Sendernamen nur als prüfpflichtige Alias-Kandidaten. Der neue Originalreport #43082648593 enthält die korrigierten Stundenwerte; damit ist ein fünf Tage in die Zukunft reichender Horizont für den DE-Senderblock belegt, die Lückenfreiheit und dauerhafte Verfügbarkeit bleiben separat zu prüfen.

**Betriebsstatus:** Kein Produktivadapter, keine TV-App-Anzeige, keine Streamingroute eingerichtet, keine Daten in Firebase publiziert. Keine belastbare Langzeitgarantie durch einen einzelnen Probelauf.

---

## Fachlich verbindliche Vorgaben

- **5 Tage** tatsächliche, fortlaufende EPG-Vorschau für wesentliche deutsche Sender sind ausreichend; **7 Tage** bevorzugt; **14 Tage** willkommen, aber keine Bedingung.
- Mehrere XMLTV-Quellen liefern EPG-Ereignisse. Quellendaten werden **nicht** unmittelbar zu bestätigten Streamingangeboten.
- **Jeder Sender kann eine eigene senderbezogene AIR-Anbieteraktion erhalten**, wenn MovieHub einen **manuell kuratierten und gerätegetesteten Senderlink** kennt. Diese Links werden mit dem Nutzer später Sender für Sender festgelegt. Kein aus XMLTV generierter Ziel-URL.
- Der bestehende gemeinsame SourceEnvelope- / BroadcastEvent- und PlaybackRoute-Vertrag bleibt maßgeblich; Waipu und Joyn dürfen nicht verschlechtert werden.
- Sender ohne validierten Wiedergabelink behalten EPG-Daten, erhalten aber keinen toten Klick-Button.

## Fachliche Identitäten – nicht vermischen

| Ebene | Beispiel | Aufgabe |
|---|---|---|
| XMLTV-Quelle | epgshare01 | Lieferant der Programmdaten, mit eigenem Fehler-/Frischezustand |
| XMLTV-Senderkennung | zdf.de, ZDF_HD o.ä. | Nur quellspezifische ID; nicht blind ein kanonischer Sender |
| Kanonischer Sender | ZDF | Eine gemeinsame Senderidentität über verschiedene Feeds |
| Ausstrahlung | ZDF, 20:15, Titel/Start/Ende | Zeitlich gebundene Programminformation |
| PlaybackRoute | WEB_LINK + channel | Manuell geprüfter aktueller Sender-/Live-Absprung |
| Anbieteraktion | ZDF + AIR | Anzeige **für diese Ausstrahlung**; nicht mit TMDB-VOD-Angeboten verwechseln |

Bei Mehrfachquellen werden quellspezifische IDs auf **einen zentralen Sender** gemappt, aber nur über bestätigte Zuordnung. Eine Ausstrahlung, die Waipu, Joyn und XMLTV kennen, bleibt ein kanonisches Ereignis und kann unterschiedliche eigene PlaybackRoutes haben. Ein fixes `scope=channel`-Ziel öffnet den **aktuellen Sender**, nicht automatisch die gerade auf MovieHub ausgewählte zukünftige Sendung. Das muss für die Nutzerin bzw. den Nutzer erkennbar sein.

### UI-Integrationshinweis

Der bestehende React-Code (`src/components/detail/DetailLiveProviderAction.jsx`, `src/providers/providerOfferLabels.js`, `src/providers/providerPlaybackLaunch.js`) beherrscht bereits AIR-Badges und `WEB_LINK + channel`-Routen. `ProviderBadge` und das globale `providers`-Verzeichnis setzen bislang registrierte Provider-IDs voraus. Deshalb senderbezogene AIR-Aktionen als **separaten kanonischen Station-Live-Kanal** konzipieren und nicht jede XMLTV-ID zu einem globalen TMDB-Streamingprovider machen. Vor UI-Codeänderungen Senderlogo, Fokus/D-Pad, Providerfilter und API-Datenstruktur gezielt testen.

## G0: isolierte, manuelle Realfeed-Probe

Ein Skript `scripts/probe-xmltv-feeds.mjs` und der **manuell auslösbare und für den #336-PR isoliert automatisch geprüfte** Workflow `.github/workflows/xmltv-source-probe.yml` vergleichen aktuell drei vorausgewählte DE-Feeds. Erlaubt sind genau:

- EPGSHARE01: `https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz`
- FreeEPG.de: `https://free-epg.de/api/epg/de.xml.gz`
- IPTV-EPG.org: `https://iptv-epg.org/files/epg-de.xml.gz`

**Schutz:** Eine Anfrage je Quelle, sequenziell, 40-Sekunden-Timeout, maximal 60 MiB heruntergeladen und 300 MiB entpackt, XML-SAX-Verarbeitung ohne externe Entitäten, keine geheimen Zugangsdaten, keine Veröffentlichungen, keine TMDB-/Firebase-Calls, keine Änderung am zentralen Nightly. Fehler je Quelle werden einzeln im Bericht erfasst. Drei konkrete URL-Adressen sind eine Allowlist und können nicht per Argument auf beliebige Ziele umgestellt werden.

**Ausgabe:** `artifacts/xmltv-source-probe/report.json` mit HTTP-/Laufzeitstatus, Größen, Änderungsheader (soweit geliefert), Zahl der Sender mit echten Programmen, Gesamtereignissen, ungültigen Daten und vorhandenen Beschreibung-/Folgenfeldern. Für Das Erste, ZDF, RTL, ProSieben, Sat.1 und VOX werden reale Vorschautage ab heute und ab morgen sowie das letzte Ereignisende separat ausgewiesen. Nicht eindeutig zuerkannte Namensvarianten erscheinen **nur als mögliche Alias-Kandidaten**, nicht als bestätigte Senderzuordnung. Dies sind **Diagnose-Aliaszuordnungen**, noch keine endgültige kuratierte Sender-ID-Mappingtabelle. Titel, Beschreibungen und Einzelereignis-IDs werden nicht im Report veröffentlicht.

**Interpretation:** Anzahl Sender mit Programm ist nicht Zahl gelisteter Sender; fünf aufeinanderfolgende Kalendertage mit irgendeiner Programmmeldung sind nicht automatisch fünf *vollständige* Tage. Bei interessanten Quellen müssen später zusätzlich zeitliche Lücken pro Sender, Stichproben, Datenalter, Verfügbarkeit über mehrere Läufe und Serienfolgenpräzision gemessen werden. Betrieb/Erlaubnis und Offline-/Ausfallkonzept danach separat einordnen.

### Abnahme-Reihenfolge

1. PR-CI / Offline-Tests erfolgreich (XML-Zeiten, Dateigrenzen, Parser-Sicherheit, getrennte Quellfehler).
2. Den isolierten G0-Probelauf aus PR-CI oder später manuell starten; originales JSON-Artefakt auswerten. **Ein erfolgreicher Test ist keine langfristige Stabilitätsgarantie.**
3. Unabhängige Haupt-/Ersatzquelle anhand wiederholter, zeitlich getrennter Proben auswählen.
4. Isolierten XMLTV-Parser/Normalizer, kanonisches Sender-ID-Mapping, Cache und deduplizierte BroadcastEvents konzipieren und testen.
5. Konkrete Senderziele im Dialog abstimmen, pro Android/Fire TV verifizieren. Erst dann Sender-AIR-Badges implementieren.
6. Kontrollierter Integrationslauf, Diff gegen Waipu/Joyn, technische und Geräteabnahme, danach erst Nightly-/Firebase-Freigabe.

**Status dieser PR:** nur G0-Instrumentierung. Die aktuelle Feed-Erreichbarkeit und der >120-h-Horizont sind nachgewiesen; **noch keine** produktive Adapterfunktion, Kontinuitäts- oder Geräteabnahme.
