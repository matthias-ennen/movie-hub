# XMLTV Multi-Source EPG – G0-Pilot (#336)

Status: 11.11.2026 – zunächst read-only Quellendiagnose, keine Produktivintegration.

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

**Schutz:** Eine Anfrage je Quelle, sequenziell, 40-Sekunden-Timeout, maximal 25 MiB heruntergeladen und 160 MiB entpackt, XML-SAX-Verarbeitung ohne externe Entitäten, keine geheimen Zugangsdaten, keine Veröffentlichungen, keine TMDB-/Firebase-Calls, keine Änderung am zentralen Nightly. Fehler je Quelle werden einzeln im Bericht erfasst. Drei konkrete URL-Adressen sind eine Allowlist und können nicht per Argument auf beliebige Ziele umgestellt werden.

**Ausgabe:** `artifacts/xmltv-source-probe/report.json` mit HTTP-/Laufzeitstatus, Größen, Änderungsheader (soweit geliefert), Zahl der Sender mit echten Programmen, Gesamtereignissen, ungültigen Daten und vorhandenen Beschreibung-/Folgenfeldern. Für Das Erste, ZDF, RTL, ProSieben, Sat.1 und VOX werden reale Vorschautage ab heute und ab morgen sowie das letzte Ereignisende separat ausgewiesen. Dies sind **Diagnose-Aliaszuordnungen**, noch keine endgültige kuratierte Sender-ID-Mappingtabelle. Titel, Beschreibungen und Einzelereignis-IDs werden nicht im Report veröffentlicht.

**Interpretation:** Anzahl Sender mit Programm ist nicht Zahl gelisteter Sender; fünf aufeinanderfolgende Kalendertage mit irgendeiner Programmmeldung sind nicht automatisch fünf *vollständige* Tage. Bei interessanten Quellen müssen später zusätzlich zeitliche Lücken pro Sender, Stichproben, Datenalter, Verfügbarkeit über mehrere Läufe und Serienfolgenpräzision gemessen werden. Betrieb/Erlaubnis und Offline-/Ausfallkonzept danach separat einordnen.

### Abnahme-Reihenfolge

1. PR-CI / Offline-Tests erfolgreich (XML-Zeiten, Dateigrenzen, Parser-Sicherheit, getrennte Quellfehler).
2. Den isolierten G0-Probelauf aus PR-CI oder später manuell starten; originales JSON-Artefakt auswerten. **Ein erfolgreicher Test ist keine langfristige Stabilitätsgarantie.**
3. Unabhängige Haupt-/Ersatzquelle anhand wiederholter, zeitlich getrennter Proben auswählen.
4. Isolierten XMLTV-Parser/Normalizer, kanonisches Sender-ID-Mapping, Cache und deduplizierte BroadcastEvents konzipieren und testen.
5. Konkrete Senderziele im Dialog abstimmen, pro Android/Fire TV verifizieren. Erst dann Sender-AIR-Badges implementieren.
6. Kontrollierter Integrationslauf, Diff gegen Waipu/Joyn, technische und Geräteabnahme, danach erst Nightly-/Firebase-Freigabe.

**Status dieser PR:** nur G0-Instrumentierung. Keine bewiesene Live-Feed-Abdeckung und keine produktive Adapterfunktion.
