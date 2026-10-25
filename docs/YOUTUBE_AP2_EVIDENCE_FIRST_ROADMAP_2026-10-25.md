# Movie Hub / YouTube AP2 – Evidenz zuerst, dann kontrollierte Automatisierung

**Strategische Selbstprüfung:** 25. Oktober 2026  
**Status:** Entscheidungsvorschlag für Issue #388 und Quellenprogramm #271, **keine neue Produktivfreigabe**.  
**Diese Datei ist eine Plan-/Gate-Revision, keine Bestätigung von Filmangeboten, Lizenzen, Endgeräte-Playback oder Quota-Freigaben.**

## 1. Was wir bewusst korrigieren

Die bisherigen Bibliotheken/QA sind wertvoll: der 10-Suchen-PT-Tag-Reservierungsledger (#607), GCS-CAS-Fortschrittscursor (#608), die Offline-Vorschau (#609), der Sperrmechanismus gegen unbudgetierte Suchen (#610) und der erste tatsächlich erfolgreiche globale Known-ID-`videos.list`-Recheck (#611/#612). Die öffentliche Warteschlange umfasst im zuletzt gemessenen Snapshot **3.023** unterschiedliche DE-MovieHub-YouTube-Badges, davon haben **30** globale VIDEO-ID-Kandidaten. **2.993** haben noch keine global gecachten Kandidaten. Das ist **kein** bestätigter Katalog mit YouTube-Playback.

Der erfolgreiche Real-Run [#40186125071](https://github.com/matthias-ennen/movie-hub/actions/runs/40186125071) untersuchte **30 Filmidentitäten/199 VIDEO-ID-Kandidaten** durch **5 `videos.list`-Batch-Requests** und **62 TMDB-GETs**; **0 `search.list`**, rechnerisch **60 wiederholte `search.list`-Aufrufe gespart**. Matchergruppen: 21 Single-Video-Review, 3 Multiple-Editions-Review, 6 unresolved/weak. **0 unabhängig in DE verifizierte konkrete Angebote und 0 freigegebene direkte Playbacks.**

**Korrektur:** Die Abdeckung von 2.993 Suchhypothesen ist **NICHT** das kritische Fertigstellungskriterium des Adapters. Die derzeitigen 2 `search.list`-Calls je bisher unbekanntem Titel entsprechen bei 10 Calls/Tag rund 599 reinen Discovery-Tagen; das ist kein sinnvoller Release-Pfad ohne nachgewiesenen Conversion-Nutzen. Zuerst Qualität, gültige Quelle und Gerätebeweis, dann Reichweite.

## 2. Primärer Erfolgsmaßstab und End-to-End-Gates

**Ein vollständiges vertikales Beispiel** bedeutet: zulässige Quelle → echte Video-ID → eindeutige kanonische `movie:TMDB-ID` und Filmfassung → konkret belegtes deutsches Angebots-/Tarifmodell → DE-Wiedergabe auf **echtem Android und echtem Fire TV** (bzw. transparent dokumentierte Gerätegrenze) → zulässiger YouTube-App-/Web-Fallback → fachlich freigegebene, mit Ablauf versehene `SourceEnvelope`/`PlaybackRoute` → automatisches Erneuern UND Entfernen bei Unverfügbarkeit.

Nur echte unabhängige Beobachtungen und Freigaben dürfen die Schritte abschließen. Titel-/Laufzeit-Score, TMDB-Provider-Badge, `regionRestriction`, `embeddable`, ein Publisher-Kanalname oder funktionierender API-Response genügen **einzeln und zusammen nicht** als Beweis für Tarif, Werkfassung, Rechte oder tatsächliche DE-Gerätewiedergabe.

**MVP-Erfolgskriterium:** Zielgröße zunächst **drei bis fünf unterschiedlich gelagerte, individuell abgenommene Filmrouten** aus nachweisbar vertrauenswürdigen Quellen – bevorzugt mindestens ein deutsches kostenloses/werbefinanziertes Angebot, und Rent/Buy nur wenn real separat verifizierbar. Dies ist ein vorgeschlagenes Gate, keine bereits erteilte Nutzungsfreigabe. Wenn null von fünf Erstfällen eine vollständige End-to-End-Abnahme bestehen, breite Discovery pausieren und die Angebotsstrategie neu bewerten. Drei erfolgreiche Fälle reichen nicht für die automatische Publisher- oder Sortimentsfreigabe.

## 3. Neue Arbeitsreihenfolge mit Stop/Go-Entscheidungen

| Gate | Nächster Schritt | Abnahmebeleg | Bei Fehlschlag |
| --- | --- | --- | --- |
| **G0 – Datenrechte/API-Policy** | YouTube-API-Developer-Policies III.E.2 (Owner-übergreifende Aggregation), API-Daten-Frische/Löschung, Attribution und TMDB/JustWatch-Lizenz; Datenfluss YouTube → MovieHub formal prüfen; bei Unklarheit Google-API-Compliance-Anfrage und ggf. Rechtsprüfung | Klar dokumentierter zulässiger Scope für interne QA **und** öffentliche Links/Verfügbarkeiten; gesonderte Produktivfreigabe in #388/#112 | **Keine** zentralen Playbacks oder breites Veröffentlichen aus API-Daten; auf verlinkte externe YouTube-Suche als nicht verifiziertes Fallback begrenzen |
| **G1 – erste überprüfbare Filmangebote** | Die bestehende dreifache manuelle Akzeptanz-Checkliste und die 21 Single-Candidate-Reviews priorisieren; Quelle/Publisher, komplette Werkfassung, Tarif in Deutschland und echte Geräte prüfen | Mind. 3–5 dokumentierte End-to-End-Fälle mit Datum/Region/Login/Gerät, Negativfällen und menschlicher Freigabe | Keine weitere breite TMDB-first Discovery; Quelle wechseln oder Adapterumfang reduzieren |
| **G2 – ein sicherer veröffentlichbarer vertikaler Slice** | NUR separat freigegebene Einzelfälle in kanonische `SourceEnvelope` mit exakter `PlaybackRoute`, Provenienz und `validUntil` bringen; Nullpfad/Revocation testen; Fallback behalten | Ein belegtes Filmwerk vom bestätigten Video bis zum richtigen Klick; API-/Publisher-Einschränkung und Play-Back verifiziert; Revocation tatsächlich getestet | Kein produktiver Badge/Direktlink, nur interner QA-Kandidat |
| **G3 – günstige Quellakquise vor Volltextsuche** | Zuerst zulässige, vertrauenswürdige Publisher-/Playlist-Feeds (z. B. DEFA-Filmwelt nach separater Rechte-/API-Prüfung, weitere Kanalinhaber nur nach Evidenz), `playlistItems.list`/Uploads-Feed, `videos.list`, konservativer Film-ID-Abgleich; keine Scrapes, keine geratenen FREE/ADS/RENT/BUY-Tarife | Messbare Zahl *neuer wirklich abnahmefähiger* Angebote je API-Aufruf und Quelle; keine mehrfachen Deduplikationen/andere Owner fälschlich verschmolzen | Source wechseln; keine hohe Suchbudgetverteilung für schlechte Treffer |
| **G4 – kontrollierter Delta-/Nightly-Betrieb** | Den bestehenden globalen bekannten VIDEO-ID-Cron behalten; bei >100 gecachten Film-IDs **rotierende Seiten mit persistentem Cursor**, Prioritäten für bestätigte Routen, Verfall/Unavailable und Monitoring/Alarm; Daten maximal entsprechend geltenden API-Speicherfristen halten | Mehrere erfolgreiche echte planmäßige Runs, Aktualisierung/Entfernung und private Audit-History, keine ungedeckten Angebote | Route fail-closed ausblenden, Quelle quarantänisieren, kein stiller Weiterbetrieb |
| **G5 – begrenzte Vollkatalog-Suche und Release-Gate** | Suchliste nur **nach G0/G1/G2-Beweis** kontrolliert erweitern: frische projektweite Quota-Kontrolle, konkrete atomare GCS-Tagesreservierung **vor** Suchaufrufen, sofortiger HTTP-429-Stopp, langlebiger authentifizierter QA-Cursor, manuelle/technische Release-Gates | Messbar bessere Freigabequote je Suchaufruf, echtes Budget/429-Abbruchverhalten, Android + Fire TV, Datenschutz und CI/Firebase-Nachtest grün | `search.list` bleibt durch #610 gesperrt, bestehende bestätigte Routen weiter nur nach eigener Pflege |

**Hinweis:** Das ist eine **priorisierte Gate-Liste** statt einer linearen Fertigstellungs-Checkliste. G0/G1 können parallel dokumentiert werden; G2-Veröffentlichung erfordert positive G0- und G1-Entscheidungen. Der erste 5-Film-Probelauf braucht **keine** automatisierte TMDB-first-Suche über alle 2.993 offenen Filme. Die bisher sechs Arbeitspakete bleiben fachlich relevant, ihr Reihenfolge-/Go-Live-Kriterium ist geändert.

## 4. Alternative Discovery und Kostenwahrheit

1. **Provider-/Publisher-first statt breiter TMDB-first-Suche.** Zulässige, öffentlich dokumentierte Film-Playlists/Uploads autorisierter Publisher sind erwartbar präziser als massenhaft `q=Filmname`; Film- und Tarifprüfung bleibt obligatorisch. Ein YouTube-Publisher ist kein automatisch genehmigter API-Content-Owner-Feed.
2. **Bekannte VIDEO-ID schlägt erneute Suche.** `videos.list` und `playlistItems.list` kosten laut offizieller API-Tabelle je einen Aufruf aus dem allgemeinen Quota-Bucket; `search.list` unterliegt zusätzlich einem eigenen 100-Aufrufe/Tag-Bucket für dieses Projekt, Reset Mitternacht Pacific Time. Google-Dokumentation von 100 ist eine Limitkonfiguration, **keine Anzeige der aktuell freien Aufrufe**.
3. **Geschützter Bestand ≠ unbegrenzt haltbar.** YouTube Developer Policies schränken das Aufbewahren nicht autorisierter API-Daten i. d. R. auf max. 30 Kalendertage ein (danach löschen oder aktualisieren). Persistente Identitäts-/Erkenntnisdaten und direkt gespeicherte YouTube-API-Metadaten sind getrennt zu inventarisieren; keine pauschale Behauptung, beliebige `videoId`-Kandidaten dürften unbegrenzt gelagert werden. 7-Tage-Artefakte sind unabhängig von der API-Policy-Retention.
4. **Publisher-first ist nicht Policy-Freigabe.** Aggregation über unterschiedliche Content-Owner und Display zusammen mit TMDB-Daten anhand offizieller Policies fachlich abklären. Bei unklarem Scope eine YouTube API Compliance Audit/Anfrage durchführen statt automatisiert weiter zu skalieren.
5. **Ein 100% grüner CI/Firebase-Build ist kein Filmnachweis.** Ein lebendiger deutscher Google-Account und Gerätebeleg einschließlich Fire TV dürfen nicht simuliert oder aus HTTP-200-Telemetrie abgeleitet werden.

## 5. Messung (statt Fortschritts-Balken nach Codezeilen)

- **Verified DE routes / audited candidates:** Aktuell `0 / 199` VIDEO-Kandidaten im letzten Live-Metadatenrefresh; die 199 sind nicht 199 Filmangebote.
- **Film-MVP mit vollständiger Android + Fire-TV-Abnahme:** `0 / vorgeschlagenen 3–5`.
- **Quelle/Policy bereit für zentrale Veröffentlichung:** `No-Go`, #112 und YouTube-API-Datenaggregation offen.
- **Known-ID-Refresh:** `1` erfolgreicher echter Live-Main-Run, täglich geplant; weitere Cron-Läufe noch zu beobachten.
- **Netto-Kandidatenbeschaffung:** `2.993` aktuell nicht gecachte öffentliche Badge-Filme; **keine** Fertigstellungs-KPI bis ein positives Offer-/Playback-Gate gezeigt ist.
- **Suchbudget:** Projektkonfiguration `search.list 100/Tag`; verbleibende Tagesaufrufe **unbekannt**; aktuell `0` autorisierte neue Suchen.

### Explizite Entscheidung

**Jetzt keinen umfangreichen TMDB-first-Autobootstrap und keine produktiven YouTube-Routen aktivieren.** Zuerst G0/erste G1-Evidenz aus schon bekannten Quellen und Geräten. Nach ersten wirklich geprüften DE-Filmangeboten einen kleinen Source-first-Pilot kontrolliert erweitern. Falls die Eignung oder rechtliche Zulässigkeit nicht nachweisbar ist, ehrlich bei `YouTube Suche öffnen` bzw. einem rein redaktionellen Fallback bleiben, statt einen unbewiesenen Anbieterbestand zu behaupten.

### Quellen und Nachweise

- [YouTube API Developer Policies, insbesondere III.E.2 und III.E.4](https://developers.google.com/youtube/terms/developer-policies)
- [Google Compliance Guide](https://developers.google.com/youtube/terms/developer-policies-guide)
- [YouTube API Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Offizielle Hilfe: kostenlose Primetime-Filme in DE](https://support.google.com/youtube/answer/16618963?hl=de)
- [DEFA-Stiftung: Filmwelt auf YouTube](https://www.defa-stiftung.de/filme/filme-sehen/online/)
- [Real-Run #40186125071](https://github.com/matthias-ennen/movie-hub/actions/runs/40186125071), [Issue #388](https://github.com/matthias-ennen/movie-hub/issues/388), [Compliance #112](https://github.com/matthias-ennen/movie-hub/issues/112)

**Kein YouTube-API-Request, keine GCS-Reservierung, kein Publisher-Onboarding, keine automatische Suchfreigabe und kein neuer Direktlink werden durch dieses Dokument ausgelöst.**
