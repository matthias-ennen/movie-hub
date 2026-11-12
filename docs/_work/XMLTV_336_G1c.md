# MovieHub #336 – G1c: reale XMLTV-Titelqualität, Kategorie-/Episodensignale, Matcher-Stichprobe

**Status:** technischer, **ausschließlich lesender** Quellenprobe-PR, keine Nightly-/Firebase-/App-Integration.

## Echt gemessene Ergebnisse – 11.11.2026

**Live-Bericht:** [GitHub Actions G1c #43094482884](https://github.com/matthias-ennen/movie-hub/actions/runs/43094482884), erfolgreich (Original-JSON-Artefakt), 11.11.2026 ca. 21:14 Uhr Europe/Berlin. Sechs explizit gemappte Hauptsender, nach vorn rollendes 120h-Fenster; lokaler Referenzkatalog **nur 107 historische, nicht vollständige TMDB-Titel**.

| Beobachtung | EPGSHARE01 | FreeEPG | IPTV-EPG.org |
|---|---:|---:|---:|
| Sendungen im 120h-Fenster, 6 Sender | 560 | 854 | 854 |
| Mit Beschreibung | 560 | 854 | 854 |
| Mit `sub-title` | 317 | 0 | 0 |
| Mit 4-stelligem XMLTV-Jahr | 514 | 0 | 851 |
| `episode-num`-Felder insgesamt | 224 | 0 | 540 |
| Davon sicher als `SxxEyy` erkannt | 2 | 0 | **391** |
| Als Film/Serie klassifiziert | 179 (2 Filme, 177 Serien) | 73 (Serien) | **391 Serien** |
| Exakter, lokal referenzierter Matcher-Treffer (nur 107 Titel!) | 118 | 54 | **181** |

**Interpretation:** Eine akzeptierte lokale Titelentscheidung ist ein **Sendungsereignis**, keine einzigartige TMDB-Titelidentität und kein Beleg einer echten TMDB-Gesamt-Matchquote. Noch können im 5-Tage-Fenster 463/854 IPTV-EPG.org-Programme nicht sicher als Film/Serie klassifiziert werden; viele davon sind Nachrichten, Shows oder Genres wie `Krimi`/`Drama`, die Film **oder** Serie sein können. Dies ist **kein EPG-Feed-Ausfall**.

**Episodensyntax:** In der IPTV-Datei haben 540 Sendungen ein `episode-num` ohne explizites `system`; 391 davon enthalten ein eindeutig interpretierbares `SxxEyy`, 149 weitere sind weiterhin unklar. EPGSHARE01 führt 224 `onscreen`-Labels, davon nur 2 in diesem eindeutigen Format; 222 bleiben ungeparst. G1c erweitert den XMLTV-Parser **ausschließlich für dieses eindeutige Format**. Bisherige echte XMLTV_NS-Angaben werden unverändert korrekt dekodiert. Staffel-/Folgennummern werden nicht aus `Folge 15`, Quotenangaben oder geratenen Zeichenfolgen konstruiert.

**Herkunft und Priorität:** Der Grund-Sendeplan von FreeEPG und IPTV-EPG.org stimmt bei den sechs geprüften Sendern anhand aller 854 Sender-/Start-/End-/Titel-Fingerprints exakt überein, die Zusatzmetadaten **nicht**. EPGSHARE01 teilt 333 der 560 Programme mit beiden anderen, ist also abweichende Basis und reicht kürzer (ca. 3,2 Tage). **Technischer G1c-Favorit ist IPTV-EPG.org** wegen der Kombination aus 5-Tage-Horizont und Zusatzmetadaten, mit EPGSHARE01 als kürzerem unabhängigerem Kandidaten. **Keine Langzeitgarantie, keine Produktionsfreigabe**.

**Qualitätsschranke:** Bei einem exakt gleichen Filmtitel mit stark widersprüchlicher 4-stelliger Jahresangabe akzeptiert der lokale Matcher keinen stillschweigenden Werk-Treffer. Der G1c-Read-only-Probelauf speichert keine vollständigen Programmtitellisten und veröffentlicht keine AIR-Links.

---



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
