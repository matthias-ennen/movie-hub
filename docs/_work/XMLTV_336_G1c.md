# MovieHub #336 – G1c: reale XMLTV-Titelqualität, Kategorie-/Episodensignale, Matcher-Stichprobe

**Status:** technischer, **ausschließlich lesender** Quellenprobe-PR, keine Nightly-/Firebase-/App-Integration.

## Anlass und Ziel

Nach den in `main` gemergten G0 (#758), G1a (#759) und G1b (#760) ist die Senderidentität bei sechs Hauptsendern technisch gesichert. G0 hat in einem einzelnen Live-Snapshot bei Das Erste, ZDF, RTL, ProSieben, SAT.1 und VOX 120/120 Stunden Sendezeit gefunden. G1c muss nun anhand **realer** XMLTV-Programmtitel messen, welche Kategorien, Beschreibungen, Episodennummern und übereinstimmende Programmpläne vorliegen. Ein lückenloser Zeitplan ist **noch keine korrekte Filmtitel-/TMDB-Zuordnung**.

## Eingeschränkte Live-Stichprobe

`scripts/xmltv-g1c-quality-probe.mjs` bezieht genau die bereits im G0-Probelauf erlaubten drei DE-XMLTV-Feeds von EPGSHARE01, FreeEPG und IPTV-EPG.org. Ein Fehlschlag einer Quelle darf die anderen Messungen nicht verhindern. Die G0-Downloadgrenzen gelten unverändert (60 MiB übertragen, 300 MiB unkomprimiert, 40 s Timeout/Quelle, feste URL-Allowlist). Keine externen TMDB-API-Aufrufe, keine weiteren Domains.

Der G1a-Parser besitzt deshalb den optionalen Diagnosemodus `mappedOnly: true`: Er liest zwar die ganze Datei, materialisiert aber nur Programme der sechs **exakt** freigegebenen Quelle+Sender-IDs. Andere, regionale und unbekannte Sender bleiben außerhalb der Stichprobe. Für jeden Lieferanten werden ausschließlich Programme mit einem Schnitt zum nächsten rollierenden **120-Stunden-Zeitfenster** analysiert; maximal 1.800 Programme gehen in die lokale Matchvorschau. Die Einschränkung und eventuelle Sample-Abschneidung werden ausdrücklich gemeldet.

### Bericht

- Gesamte XMLTV-Programme, exakt gemappte Programme und ignorierte fremde Sender.
- Anzahl und Verteilung der aktuell wirklich im 120-Stunden-Fenster enthaltenen Programme je Sender.
- Der Anteil mit eindeutiger XMLTV-Film-/Serien-Kategorie, `description`, `sub-title`, gültiger `xmltv_ns`-Episode und explizitem Zeitzonen-Offset; häufigste Kategoriebegriffe.
- Die **bereits bestehende** `inferXmltvMediaType`-Klassifikation und `matchJoynProgram`-Qualitätsentscheidung aus G1b, keine zweite Matcherlogik.
- Kontrolle identischer Programmpläne mehrerer Quellen über Hashwerte aus kanonischer Sender-ID, Start-/Endzeit und normalisiertem Titel; **keine rohen Filmtitel im Ergebnisbericht**.
- **Eigene Kennzahl „historische lokale Referenz-Treffer“:** Der im Repository eingecheckte Waipu-Live-Titelkatalog vom 19.09.2026 enthält lediglich 107 Einträge; es sind **nicht sämtliche TMDB-Titel**. Die hier gemessene Trefferquote ist deshalb **nicht** die spätere vollständige TMDB-Erkennungsquote. Fehlende Referenzeinträge dürfen nicht als EPG-Fehler interpretiert werden.

### Ausführung

Das neue `.github/workflows/xmltv-g1c-quality.yml` startet **nur** im gezielten #336-Branch-PR oder auf manuelle Anforderung, niemals zeitgesteuert. Es schreibt ein zusammenfassendes JSON-Artefakt unter `artifacts/xmltv-g1c-quality/report.json` und eine GitHub-Step-Summary, jeweils ohne vollständige geschützte Programmlisten oder Provider-Links. Der Workflow benötigt keine Firebase-Schlüssel und führt keinen Deploy aus.

### Go/No-Go vor G2

1. Echtes Artefakt aus dem G1c-Run prüfen; keine angenommenen Resultate aus älteren G0-Programmen ableiten.
2. Kategorie-/Folgensignal je Quellfamilie unterscheiden. EPGSHARE01 kann für Episoden informativer sein als der DE-Block; dies muss mit echtem G1c-Bericht beurteilt werden.
3. Bei fehlender `movie`-/`series`-Typisierung nicht blind die TMDB-Typen raten. Bei gleichnamigen Werken ohne Jahr/Beschreibung/Fassung keine automatische Gewissheit vortäuschen.
4. G1c nur als **technischen Qualitätsnachweis** übernehmen. G2 erfordert gesonderte geprüfte Produktionsquelle, Cache/Frische-/Ausfallregeln und eventuell eine detailliertere TMDB-Matching-Strategie.
5. `AIR`-Sender-Badges werden erst mit gemeinsam bestätigten und auf Android/Fire TV getesteten festen Livestream-Absprüngen freigegeben. TMDB-Mediathek-Badges bleiben separat.

**Hinweis:** Auch ein technisch funktionierender Community-EPG-Feed ist keine automatische Gewähr für Dauerverfügbarkeit oder eine freie Produktions-Wiederverwendungserlaubnis.
