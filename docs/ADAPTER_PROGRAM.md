# Movie Hub – Adapterprogramm und Quellen-Ausbau

**Stand:** 16.10.2026  
**Status:** Verbindliche Priorisierung und erste Analyse; **keine Implementierungs- oder Produktivfreigabe**.  
**Leit-Issue:** [#271 – Modulare Quellenplattform](https://github.com/matthias-ennen/movie-hub/issues/271).  
**Nächster Einzelauftrag:** [#388 – YouTube-Quellenadapter](https://github.com/matthias-ennen/movie-hub/issues/388).

## 1. Projektübergabe und Entscheidung

Matthias hat am **16.10.2026** das Gesamtpaket **Mitteilungen** als abgeschlossen erklärt; **#314 und #385** sind danach mit `completed` geschlossen worden. Die Teilpakete **#380–#384** sind ebenfalls geschlossen und zuvor fachlich abgenommen. Zusätzliche Meldungsfamilien sind Ideen für später, **keine aktuelle Aufgabe**. Die in #385 mit dokumentierten TV-/Provider-Korrekturen wurden technisch veröffentlicht; daraus wird keine undokumentierte weitere visuelle Geräteabnahme abgeleitet.

**Neue Hauptstrecke:** Quellenfundament durch unabhängige Adapter ausbauen. **YouTube kommt zuerst**, danach DVB-I und Prime Video als separat freizugebende Pakete. Das Ziel ist eine robuste, breitere Film-/Serienverfügbarkeit und konkrete Wiedergabewege – nicht eine Sammlung unkontrollierter URLs.

## 2. Priorität und Schnitt der Arbeitspakete

| Reihenfolge | Issue | Inhalt | Aktuelle Phase | Freigabegrenze |
| --- | --- | --- | --- | --- |
| 1 | [#388 YouTube](https://github.com/matthias-ennen/movie-hub/issues/388) | Vollständige legale Filme aus zulässigen Playlists/Publisher-Quellen, TMDB-Matching, genaue Video-Route | **Analyse und kleiner nichtproduktiver Datenpilot** | Kein Import in produktiven Movie-Hub-Katalog vor Daten-, Recht-, Match- und Geräteprüfung |
| 2 | [#336 DVB-I](https://github.com/matthias-ennen/movie-hub/issues/336) | Deutsche Service-Liste, EPG, Live-Playback-Signalisierung | Quellen- und Zugangsrecherche | Kein produktiver Adapter ohne nachgewiesenen erlaubten, verlässlichen Produktionszugang |
| 3 | [#391 Prime Video](https://github.com/matthias-ennen/movie-hub/issues/391) | Titelgenaue GTI-/Content-ID, Fire-TV-Absprung | IDs und offiziell unterstützte Wege validieren | Kein automatischer Import, solange keine tragfähige ID-Quelle/Zuordnung besteht |
| später | neue Teilissues unter #271 | offizielle Free-TV-, Mediathek- und FAST-Quellen | Kandidatensuche | Jede Quelle eigener Go/No-Go-Prozess |

Die Reihenfolge ist eine **Arbeitspriorität**, keine Zusage, alle drei Adapter produktiv integrieren zu können. Ein No-Go beendet einen Pilot sauber, ohne die Quellenarchitektur zu verbiegen.

## 3. Unveränderliche Architektur- und Qualitätsregeln

1. **Titelidentität:** `Medientyp + TMDB-ID` ist kanonisch. YouTube-Video-ID, DVB-I-Service-/Event-ID und Prime-GTI werden **separat als Quellen-/Playback-IDs** verwaltet.
2. **Neutrale Datenstrecke:** unabhängiger Adapter → Quellenevidenz und SourceEnvelope → konservatives Titelmatching → normalisierte Verfügbarkeit/PlaybackRoute → validierte, atomare Veröffentlichung → bestehender Movie-Hub-Lesepfad.
3. **Kein zweiter Metadatenstamm:** Filme/Serien bekommen keine parallelen Titel, nur zusätzliche nachgewiesene Angebote, ggf. mit Gültigkeitsfenster und Quelle.
4. **Provenienz:** Herkunft, abgefragte Generation, Zeitpunkt, Gültigkeit, DE-Eignung, Matching-Sicherheit und Ablehnungsgrund diagnostizierbar halten; unklare Werte nicht erfinden.
5. **Anbieter versus Wiedergabe:** Der tatsächliche Anbieter bleibt erkennbar. Die Route führt zum **exakten** Film bzw. zur richtigen Ausstrahlung; ein bloßer allgemeiner Anbieterstart darf nicht als „direkt abspielbar“ ausgegeben werden.
6. **Fehlerisolation:** Ausfall, Fehlzuordnung, Quota-Problem oder abgeschnittene Antwort eines Adapters dürfen andere Quellen sowie den letzten gültigen veröffentlichten Datenstand nicht zerstören. Ablauf/Entzug einzelner Angebote kontrolliert behandeln.
7. **Leistung und Sicherheit:** keine neuen Netzwerkaufrufe pro Poster, kein Scraping/DRM-Bypass, keine öffentlichen Secrets, keine ungesicherte Massenerfassung. Bestehenden inkrementellen Nachtlauf und Test-/Diagnosepfad möglichst wiederverwenden.
8. **Produktgrenze:** `FLAT`, `FREE`, `ADS`, `RENT`, `BUY`, `AIR` strikt nach belegtem Angebots-/Sendekontext; keine Vermischung oder automatisch erfundenen Labels.

## 4. Erstes Paket #388 – YouTube: bestätigte Recherche

**Quellenstand der folgenden Angaben: 16.10.2026.** Die folgenden Ergebnisse beruhen auf den offiziellen veröffentlichten Dokumentationen und dem bereits angelegten Issue #388; **es gab noch keinen authentifizierten YouTube-API-Abruf und keinen realen Fire-TV-Wiedergabetest dieses Adapters**.

### 4.1 Bestätigter Einstieg

- YouTube bietet laut offizieller Hilfe **kostenlose werbeunterstützte Primetime-Filme in Deutschland**; der Nutzerkatalog ist unter `youtube.com/movies` sichtbar. Das allein belegt **keinen** öffentlich dokumentierten vollständigen Datenfeed für exakt diese `FREE/ADS`-Teilmenge.
- `playlistItems.list` der offiziellen YouTube Data API kann eine **bekannte öffentliche Playlist** mit maximal **50 Elementen je Seite** über `nextPageToken` lesen; laut Referenz **1 Quota-Einheit pro Aufruf**.
- `videos.list` kann bekannte Video-IDs gesammelt prüfen, ebenfalls mit **1 Quota-Einheit je Aufruf**. Metadaten: Kanal, Titel, Beschreibung, Laufzeit, Regionsblockaden/-freigaben, Privacy-/Einbettungsstatus.
- Eine öffentliche Playlist oder ein öffentliches Video ist **kein Nachweis**, dass es sich um einen legal vollständig angebotenen Kinofilm, um DE-Verfügbarkeit oder um ein kostenloses Angebot handelt. `licensedContent` allein ist ebenfalls kein eindeutiger Nutzungsrechtsnachweis.
- Die YouTube-API-Richtlinien untersagen **Scraping**. Ein vermeintlicher Katalog-Endpoint oder eine inoffizielle Player-URL wird **nicht** zur produktiven Datenquelle gemacht.

**Offizielle Referenzen:**
- [Kostenlose Primetime-Filme (YouTube-Hilfe)](https://support.google.com/youtube/answer/16618963?hl=de)
- [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [videos – Datenschema](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Pflichtfunktionen bei Wiedergabe](https://developers.google.com/youtube/terms/required-minimum-functionality)

### 4.2 Zu trennende Quellenklassen

**A. Offizieller Primetime-Filmkatalog:** hoher Produktnutzen, aber derzeit **kein verifizierter maschinenlesbarer DE-FREE/ADS-Gesamtkatalog**. Separates Zugangsgate, nicht durch Web-Scraping ersetzen.

**B. Öffentliche Playlists:** reguläre API-Pagination technisch möglich. Die Playlist ist nur ein *Kandidatenset*. Publisher-Vertrauenswürdigkeit, Rechtehinweise, DE-Verfügbarkeit, Vollfilm-Status und Matching müssen einzeln geprüft werden.

**C. Offizielle Rechteinhaber-/Filmkanäle:** potenziell geeignetere Evidenz als beliebige Nutzeruploads. Qualität und länderspezifische Rechte dennoch gesondert prüfen.

**Vorhandener Testkandidat aus #388:** eine große kuratierte kostenlose Film-Playlist (`PL30RAv-0lkxHdTcoGGgx5L6eXIHnnrEHC`); **keine durch uns bestätigte aktuelle DE-Abspielbarkeit und keine pauschale Lizenzfreigabe**.

### 4.3 Nichtproduktiver YouTube-Pilot – vorgeschlagener Prüfablauf

1. **Zugangscheck:** YouTube Data API im passenden Projekt/Konto zulässig verfügbar? API-Key nur serverseitig in Secret Manager, Quota/Conditions, Nutzungsbedingungen, Branding und Datenschutzhinweise prüfen. Kein Key nötig für die reine Konzeptphase.
2. **Kleine Stichprobe:** ca. **100–200 Videos** aus **einer** benannten öffentlichen Playlist oder geprüften Rechteinhaberquelle nur per offizieller API lesen. Keine Produktivpublikation und keine Aufnahme fragwürdiger Quellen in den öffentlichen Index.
3. **Normalisierung:** Video-ID, Playlist/Kanal, vollständiger Originaltitel, Sprache, Laufzeit, Link, Regionseinschränkung, Abrufzeitpunkt, Status, Quellengeneration. Trailer, Clips, unvollständige Filme und Dubletten früh aussondern.
4. **Konservatives TMDB-Matching:** Medientyp/Filmtitel, Jahr, Laufzeit und ggf. Originalsprache vergleichen. Eindeutige IDs übernehmen, unsichere Treffer in Reviewliste. Kein Zwangs-Match und keine neuen TMDB-Titeldubletten.
5. **Verfügbarkeit getrennt prüfen:** Zugriff aus Deutschland, tatsächlicher ganzer Film, Nachweis zulässiger Quelle, Kosten-/Werbeart. **Nur** belegte `FREE`/`ADS`-Eigenschaften publizieren; `YouTube` als Plattform allein rechtfertigt kein `FREE`.
6. **Playback-Pilot:** Route zur **exakten Video-ID** auf Android-Smartphone und realem Fire TV testen; offizielle YouTube-App/Webziel statt Direktstream-Extraktion. Vorsicht bei Einbettungs-, Alters-, Login- und Regionalbeschränkungen.
7. **Dry-run-Bericht:** Roh-Einträge, Vollfilm-Kandidaten, eindeutige Matches, uneindeutige/abgelehnte Matches, DE-verfügbare und verifizierte Angebote, funktionierende exakte Absprünge, API-Kosten, Datenalter, entfernte Videos und Fehlerraten. Keine persönlichen Daten erfassen.
8. **Go/No-Go:** Erst nach Belegen und Nutzerfreigabe begrenzte produktive Einführung unter vorhandener SourceEnvelope-/PlaybackRoute-Strecke planen. Geräteabnahme getrennt von CI und Datenprüfung.

**Offene Knackpunkte:** Wird ein belastbarer Filmkatalog mit **nachgewiesenen legalen DE-Vollfilmen** geliefert? Ist DE-Verfügbarkeit reproduzierbar überprüfbar, statt aus Metadaten abgeleitet? Reicht die Matching-Qualität? Bleiben Video-Links stabil? Werden Filmwiedergabe und native App auf Fire TV korrekt geöffnet? Wie lassen sich entfernte Filme auslaufen, ohne letzte gültige Snapshots zu verlieren?

## 5. Weitere Adapter – erste Abgrenzung (noch keine Vollanalyse)

### DVB-I – #336 / Priorität 2

**Bekannte Vorarbeit im Repo:** deutscher Service-List-/Registry-Zugang, Parser, Content Guide/EPG, Region, Bearer-/Playback-Signalisierung und SourceEnvelope-Probe als Pilot planbar. Ob ein **zugelassener stabiler deutscher Produktionszugang aktuell** verfügbar ist, ist **nicht durch diesen Plan bestätigt**. Nächster Schritt: Primärquelle/Zugangsstatus anhand aktueller Plattform- und DVB-Dokumentation prüfen; Referenz/experimentell/Pilot/Produktion strikt trennen. Keine experimentelle Liste als Produktionswahrheit.

### Prime Video – #391 / Priorität 3

**Bekannte Vorarbeit im Repo:** Auf Fire TV wurde für einen Referenztitel ein `app.primevideo.com/detail?gti=...`-basierter titelspezifischer Absprung getestet. Das ist ein **beobachteter Deep-Link-Test**, kein Beleg für eine offizielle allgemeine Prime-Katalog-/GTI-Schnittstelle. Nächster Schritt: offizielle/erlaubte Quellen für titelgenaue GTI und deutsches Angebot untersuchen; GTI getrennt von TMDB halten. Keine automatisierte GTI-Generierung aus Titeln behaupten und keine unbestätigten universellen Links veröffentlichen.

### Weitere Free-TV-/FAST-/Mediathekquellen

Erst kandidatenweise prüfen: dokumentierter Zugang, verlässliche Quellen-IDs, deutscher Katalog und Rechte, Timing/Region, direkte App-/Web-Routen, Quellenfrische, Betriebskosten. Pro Quelle eigenes Issue nach Priorisierungsentscheidung.

## 6. Abnahmegates pro Adapter (einheitlich)

- **G0 – Analyse:** API-/Quellenzugang, zulässige Nutzung, eindeutiges Produktziel, Datenfelder, bekannte Lücken dokumentiert.
- **G1 – Datenprobe:** begrenzter Dry-run, Quellendaten und Feldabdeckung gemessen, Match-Fehler dokumentiert. Noch keine produktiven Badge-/Katalogeffekte.
- **G2 – Integrationsentscheidung:** Nutzer entscheidet über konkreten Produktivumfang und akzeptiert verbleibende Risiken. Kein Automatismus nach positivem Pilot.
- **G3 – Umsetzung:** kleiner Adapter an bestehendem gemeinsamen Daten-/Playbackvertrag; dedupliziert, fehlerisoliert, Budget/Frische/Tests.
- **G4 – Veröffentlichung und Geräteabnahme:** CI/APK/Deploy technisch verifiziert; reales Smartphone/Fire-TV-Verhalten und Angebotswahrheit vom Nutzer getrennt abgenommen. Erst dann Einzelissue schließen.

## 7. Sofort nächste Arbeitsschritte

1. **#388 beginnen – nur Analyse / API-Zugang / Quellenauswahl / Prüfstichprobe vorbereiten**. Zunächst vorhandene Verträge, Import-Schnittstellen und #388-Befunde lesen; keine produktiven Änderungen.
2. Pilotfragen und Ergebnisse im **YouTube-Issue #388** fortschreiben; Querschnittsentscheidungen in **#271** und diesem Dokument.
3. Nach einem belastbaren YouTube-Dry-run **G0/G1-Bericht mit konkreten Zahlen und Go/No-Go-Vorschlag** präsentieren und vor Implementierung ausdrückliche Freigabe einholen.
4. Danach #336 und #391 in derselben Gate-Systematik analysieren; keine parallelen unfertigen Adapter-Baustellen eröffnen.

**Nicht Teil dieser Planungsrunde:** App-Code, Live-Import, Firestore-Schemaänderung, neue Secrets, API-Keys, produktiver Scheduler, bestehende Mitteilungspakete, Fire-TV-Installer #458 oder Fire-TV-Feintuning #386.
