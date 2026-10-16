# YouTube Data API – Recherche und erste Adapterbewertung

**MovieHub · Issue #388 · 16.10.2026**  
**Ergebnisstatus:** G0 – Dokumentations-/Internetrecherche; **kein** authentifizierter API-Abruf, **kein** Datenpilot, **kein** Wiedergabe- oder Fire-TV-Gerätetest, **keine** Code-/Secret-/Cloud-Änderung.  
**Entscheidungsbedarf:** später G1 (begrenzter nichtproduktiver API-Pilot) und danach gegebenenfalls separate Produktivfreigabe G2.

## G1 – erster authentifizierter API-Lauf erfolgreich (16.10.2026)

**Tatsächlicher Nachweis:** [GitHub Actions Run 38873598607](https://github.com/matthias-ennen/movie-hub/actions/runs/38873598607), manuell ausgelöst auf `main`, wurde erfolgreich abgeschlossen (Start 08:25:33 UTC / 10:25:33 Europe/Berlin, Abschluss 08:25:57 UTC). [Job 116883253037](https://github.com/matthias-ennen/movie-hub/actions/runs/38873598607) hat sämtliche Schritte erfolgreich durchlaufen: Workload Identity, `gcloud`-Einrichtung, isolierte Script-Syntax, `node scripts/youtube-api-smoke.mjs`, Abschluss. Der Job meldet ausdrücklich `Read-only YouTube API smoke abgeschlossen`. Da der Scriptpfad die ersten sechs offiziellen Abfragen nur nach Erfolg aller Abfragen vollständig beendet, ist **die technische Lesbarkeit des Secret-Werts, der API-Key und die grundsätzliche Abrufbarkeit der beiden Quellen bestätigt**. Es sind **keine** produktiven MovieHub-Daten verändert worden.

**Abgrenzung:** Dieser erste Lauf schrieb seinen Inhalt ausschließlich als **GitHub-Actions-Job-Zusammenfassung** (`GITHUB_STEP_SUMMARY`), nicht in die herunterladbaren Artefakte oder den regulären Job-Log. Die Verbindung zum GitHub-Repository bestätigt den grünen Lauf und die Log-Erfolgsmeldung, **kann die Job-Zusammenfassung aber nicht direkt auslesen**. Deshalb sind konkrete Playlistgrößen, Titel, tatsächliche Netto-ID-Zahlen oder regional gesperrte Videos derzeit **noch nicht belegbar**; kein geratenes Ergebnis. Technische Abrufbarkeit ist auch **kein Lizenz-/Gratis-/Vollfilm-/DE-Playback-Nachweis**.

**Verbesserung in Vorbereitung:** Die isolierte Probe wird zusätzlich denselben **bereinigten öffentlichen Metadatenbericht** in die normalen GitHub-Logs schreiben und als `artifacts/youtube-api-g1/report.md` für 14 Tage in ein GitHub-Actions-Artefakt aufnehmen. API-Key, URL-Schlüsselparameter, rohe Fehlerantworten, TMDB-/Nutzerinhalte und Secrets sind ausdrücklich nicht Bestandteil. Die folgende erneute Ausführung ist separat manuell auszulösen; CI/Bereitstellung ersetzen keine zweite, echte Datenauswertung.

**Gates:** G0 Dokumentationsrecherche abgeschlossen; **G1 Grundfunktion der YouTube-API nachgewiesen**; erste quantitative Inhaltsauswertung ausstehend; G2/Produktivadapter weiterhin nicht freigegeben.

## G1-Testwerkzeug – nach Secret-Freigabe vorbereitet (16.10.2026)

**Nutzerbestätigung:** Das Secret `YOUTUBE_API_KEY` ist angelegt, und dem bestehenden Workload-Identity-Dienstkonto wurde am **einzelnen Secret** nach Rückmeldung des Nutzers die Rolle `Secret Manager Secret Accessor` zugewiesen. Tatsächliche Berechtigung, aktive Secret-Version und API-Key-Gültigkeit werden **erst durch den realen GitHub-Test nachgewiesen**.

**Implementierung ausschließlich als Diagnosewerkzeug:**

- Workflow `.github/workflows/youtube-api-g1-readonly.yml` mit **nur `workflow_dispatch`**, nur auf `main`. Kein Zeitplan, kein Trigger durch Pull Requests oder Pushes.
- Nutzt ausschließlich vorhandene GitHub-OIDC-/Workload-Identity-Konfiguration `github-movie-hub-deploy@movie-hub-62459.iam.gserviceaccount.com`; **keine** neue Service-Account-Schlüsseldatei und keine GitHub-Secret-Kopie des API-Keys.
- `scripts/youtube-api-smoke.mjs`: liest `YOUTUBE_API_KEY` aus Google Cloud Secret Manager **nur im Prozessspeicher**, sendet ihn als `x-goog-api-key`-Header (nicht URL), loggt weder den Schlüssel noch Rohfehlerkörper.
- Durchführt **maximal sechs** dokumentierte YouTube-Leseabfragen: `channels.list` für CiNENET/Netzkino (1), `playlists.list` für beide (2), `playlistItems.list` je Publisher (2; jeweils höchstens 12 Einträge), `videos.list` gemeinsam (1). Die konkrete CiNENET-Playlist ist `PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`; Netzkino nutzt die API-bestätigte Upload-Playlist. **Keine weiteren Seiten und kein 100–200-Video-Import in dieser ersten Berechtigungsprobe.**
- Bericht ausschließlich als **GitHub-Actions-Jobzusammenfassung**: API-Playlist-Länge, Abrufzahlen, Video-ID-Treffer und öffentliche Stichprobentitel/Laufzeiten/technische DE-Regionssignale. Keine TMDB-IDs, keine Rechte-/Kostenfreigabe, kein Playbackversprechen.
- `tests/youtube-api-smoke.test.js` prüft ohne echte Keys/API-Abfragen Status-/Regionsbehandlung, sichere Schlüsselübergabe, Fehlermeldung und Ausgabe.
- **Kein** Daten-/Firebase-Schreibzugriff, kein MovieHub-Badge, keine neue Katalog-/Cloud-Funktion und kein Live-Deploy durch diesen Workflow.

**Ausführung, erst wenn Workflow auf `main` verfügbar:** GitHub → Actions → **YouTube API G1 Read-only Smoke** → **Run workflow** → Branch `main` → Start. Anschließend Schritt-/Job-Zusammenfassung in GitHub auswerten; Link zum Lauf in #388 nachtragen. **Nicht** das bestehende **Deploy Firebase**-Workflow starten.

**Sicherheitsaspekt bei Veröffentlichung:** Ein normaler Commit auf `main` löst den vorhandenen `Deploy Firebase`-Workflow aus, der nicht Teil dieser isolierten Probe sein soll. Zunächst eigenständigen PR samt Test-CI prüfen; Veröffentlichung des Diagnoseschritts möglichst ohne automatisches Deploy (z. B. nach grüner PR-CI mit **`[skip ci]`** im finalen Merge-Commit). GitHub verweist darauf, dass das Commit-Wort nur Push-/PR-Workflows überspringt, nicht den späteren `workflow_dispatch`-Test: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs . Vor einer Überspringung sicherstellen, dass Branchschutz/Required-Checks weiterhin erfüllbar sind.

## G1-Zugangsprüfung und konkretisierte Datenprobe – 16.10.2026

**Auftrag:** Nach Freigabe von G0 mit dem geplanten echten API-Test für CiNENET und Netzkino fortfahren. **Ergebnis:** Quellenidentität und API-Aufrufplan konkretisiert; **authentifizierter Abruf derzeit nicht ausgeführt, weil kein verwendbarer YouTube-API-Zugang über die verbundenen Werkzeuge vorliegt.** Die verbundenen GitHub-Werkzeuge ermöglichen die Einsicht in Repository-Dateien, aber keinen Abruf aus Google Cloud Console/Secret Manager und kein Auslesen eines bestehenden API-Schlüssels. Ob im Google-Cloud-Projekt `movie-hub-62459` bereits die YouTube Data API aktiviert oder ein Key eingerichtet ist, **konnte daher weder bestätigt noch ausgeschlossen werden**. Ein direkter Abruf über den hier verfügbaren Webzugang wurde technisch nicht bereitgestellt; das ist **keine** gemessene YouTube-API-Fehlerantwort und kein Nachweis eines 403/fehlgeschlagenen Schlüssels.

### Neu konkret verifizierte Publisher-Playlist

- **Herausgeber/Primärquelle:** [UCM.ONE – „Silvester 2025“ bei CiNENET Deutschland](https://ucm.one/de/silvester-2025-playlist-bei-cinenet-deutschland/), publiziert 28.12.2025.
- **Offizieller von UCM.ONE verlinkter YouTube-Pfad:** https://www.youtube.com/playlist?list=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD
- **Playlist-ID:** `PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`.
- **Publisher-Kanal:** CiNENET Deutschland `UClyuw-OWE6taGFv0reZI6eQ`; diese ID ist durch weitere UCM-/Verbraucherreferenzen als Kanal der Filmreihe belegbar.
- **Beispiele laut Publishertext (nicht per API bestätigt):** „Die Uhr des Grauens“, „Wollen Sie mit mir tanzen?“, „Josie – Gefährliche Begegnung“, „Milano Kaliber 9“, „Viking Blood“. Die Publisherseite enthält weitere Titel.
- **Wichtig:** Die Playlist vom Jahreswechsel ist ein **verifizierter Einstieg zur technischen Datenprobe**, aber **ihre heutige Zahl und regionale Abrufbarkeit wurden nicht gemessen**. Sie könnte deutlich unter 100–200 Items liegen. Daher zunächst deren tatsächliche Länge über die API prüfen, danach für das größere Sample weitere ausdrücklich vom Publisher gepflegte Playlists oder dessen offizielle Upload-Playlist einbeziehen.

### Exakte geplante Leseaufrufe (keine Anfragen ausgeführt)

1. **Kanalidentität/Uploadliste:** `GET https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=UClyuw-OWE6taGFv0reZI6eQ`. Benötigt einen gültigen API-Key; liefert bei Erfolg insbesondere `contentDetails.relatedPlaylists.uploads`.
2. **Direkt verlinkte Playlist prüfen:** `GET https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`. `itemCount`, Owner und öffentlichen Status erfassen.
3. **Playlist-IDs lesen:** `GET https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD` und über `nextPageToken` seitenweise fortsetzen.
4. **Video-Metadaten anreichern:** `GET https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=<kommagetrennte Video-IDs>`, maximal 50 IDs je Batch. Fehlende/entfernte Videos, Besitzerkanal-ID, Laufzeit, Sprache und Region als getrennte Spalten auswerten.
5. **Falls die Publisher-Playlist zu klein ist:** weitere auf dem Kanal selbst gepflegte, öffentlich zugängliche Playlists oder die über Schritt 1 gelieferte Upload-Playlist sequenziell lesen, bis höchstens 200 unterschiedliche Video-IDs gesammelt wurden; **keine** Suche/Community-Playlist zum Auffüllen ungeprüfter Quellen.
6. **Netzkino Kontrollstichprobe:** dieselbe Sequenz mit Channel-ID `UCGkHFrwE8KEuOHPVsIOskAg` und einer dann tatsächlich per API bestätigten eigenen Playlist/Uploads; Vergleiche mit dem bereits im MovieHub-Katalog enthaltenen Netzkino-Angebot.

**Sichere Authentifizierung:** Für öffentliche Daten ist laut Google ein API-Key ausreichend, kein YouTube-OAuth-Login zum Publisherkanal. API-Key nur aus sicherer Umgebung verwenden, z. B. als Umgebungsvariable in geschütztem Prüflauf oder Secret Manager; bei Requests bevorzugt `x-goog-api-key`-Header verwenden und Schlüssel/Antworten mit Geheimnissen nie in GitHub-Kommentare, Repository oder ungeschützte Logs schreiben. Vor Installation neuen Infrastrukturzugang/Secret-Handling gesondert abstimmen. Dokumentation: https://developers.google.com/youtube/v3/getting-started und https://developers.google.com/youtube/v3/quickstart/java .

### G1-Status-Tabelle

| Prüfschritt | Status | Beleg/Grenze |
| --- | --- | --- |
| Publisher-Identität CiNENET | **Publisherbeleg vorhanden** | UCM.ONE (eigene Filmkanäle/AVOD-Angebot) |
| Konkrete Video-Playlist-ID | **Publisherbeleg vorhanden** | `PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD` |
| API-Methodik und Kontingentkosten | **Dokumentation geprüft** | Offizielle Google Data-API-Dokumente |
| Projekt-API-Aktivierung und Schlüssel | **Ungeprüft / Zugang fehlt in dieser Sitzung** | Kein Google-Cloud-/Secret-Manager-Zugriff |
| Echte Playlist-/Video-API-Antwort | **Nicht durchgeführt** | Nicht behaupten, dass 50/100/200 Videos abgerufen wurden |
| Tatsächliche Anzahl CiNENET-/Netzkino-Videos | **Unbekannt** | Erst aus `itemCount` / tatsächlichen `items` ermitteln |
| TMDB-Matchquote und Filmanteil | **Unbekannt** | Erst nach G1-Sample berechnen |
| DE-Wiedergabe / Rechte / Fire-TV-Absprung | **Nicht getestet** | API-Metadaten allein genügen nicht |

**Weiteres Vorgehen bei Freischaltung:** genau die sechs Schritte durchführen, mit niedrigem Abrufbudget und ohne Live-Import; anschließend erst echte statistische Befunde und unklare Daten im Issue #388 berichten. Keine App- oder Adapterimplementierung durch diese Zugangsprüfung.

## 1. Zusammenfassung

Die **offizielle YouTube Data API v3** eignet sich grundsätzlich, bekannte öffentliche Filmplaylists oder Uploadlisten verifizierter Publisher automatisiert zu inventarisieren, Video-IDs mit Metadaten nachzuladen und diese **als Kandidaten** konservativ gegen TMDB abzugleichen. Die API liefert aber **keinen im dokumentierten Methodenbestand bestätigten** vollständigen Feed des deutschen kostenlosen YouTube-Primetime-Katalogs und **kein verlässliches allgemeines Einzelvideo-Feld für FREE/ADS/RENT/BUY oder territoriale Verwertungsrechte**.

**Praktische Empfehlung:** mit einer **Publisher-Whitelist** (zuerst **CiNENET Deutschland**, daneben **Netzkino** als unabhängiger Kontrollfall) und einem 100–200-Video-Dry-run beginnen. Die Publisher-Angaben zu lizenzierten AVOD-Filmen sind gute Quellenhinweise, **keine pauschale Rechte-/DE-/Abspielgarantie für jedes Video**. Der zuvor gesammelte internationale Community-Playlistkatalog bleibt allenfalls ein späterer Stresstest, nicht Startpunkt für den Produktivkatalog.

## 2. API-Matrix

| Methode | Abrufbare Daten | Grenzen und Einsatz in MovieHub |
| --- | --- | --- |
| `channels.list` | Kanal-ID, Bezeichnung/Beschreibung, Upload-Playlist-ID über `contentDetails.relatedPlaylists.uploads`; weitere Kanalmetadaten | Verifizierbaren Publisher-Kanal als Quelle inventarisieren; keine eigene Prüfung des Rechtsumfangs |
| `playlists.list` | Playlist-ID, Titel, Beschreibung, Kanal und `contentDetails.itemCount` | Quellen identifizieren, Umfang vorab schätzen; Playlist kann Trailer/Clips/Mischformen enthalten |
| `playlistItems.list` | Pro Playlist Seite für Seite Video-ID (`snippet.resourceId.videoId`), Titel, Beschreibung, Position, Upload-Referenzen und Page Tokens | **0–50 Items je Seite**, `nextPageToken` bis Ende; kostengünstig, nur erreichbare Playlist; Kanaluploads über deren Upload-Playlist |
| `videos.list` | Batchweise Video-ID, Titel, Beschreibung, Channel-ID, Veröffentlichungsdatum, Thumbnail-URLs, Sprache, Laufzeit (ISO 8601), Regionseinschränkung, `licensedContent`, `privacyStatus`, `embeddable`, ggf. Alterseinstufungen, `madeForKids` und weitere Statusfelder | **bis 50 IDs pro Batch**; Laufzeit = Filterhilfe, kein Vollfilmbeweis; regionales Feld = Hilfsevidenz, kein vollständiger Test echter DE-Abspielbarkeit |
| `search.list` | Suche nach `q`, `type=video`, `regionCode=DE`, `relevanceLanguage=de`, `videoDuration=long` (>20 Min.), `videoType=movie`, `videoEmbeddable` u. a. | **Entdeckung**, kein vollständiger Katalog. `videoType=movie` bedeutet **nicht** „kostenloser Primetime-Vollfilm“. Bei `channelId + type=video` ohne Content-Owner-Spezialfilter auf max. 500 Ergebnisse begrenzt: für vollständige Kanalerfassung Upload-Playlist statt Search verwenden |
| `i18nLanguages.list`, `i18nRegions.list`, `videoCategories.list` | unterstützte Sprach-/Regions-/Kategorieverzeichnisse | Hilfsdaten, nicht zwingend für Pilot |

### 2.1 Wichtige tatsächliche Felder

**Quellenidentität:** `playlistId`, `videoId`, `channelId`, tatsächliche Besitzerkanal-ID (`videoOwnerChannelId`, soweit vorhanden), Playlist-Position. Ein Playlistbetreiber ist nicht automatisch der Uploader/Rechteinhaber.

**Kandidatenerkennung:** `snippet.title`, `description`, `publishedAt`, `defaultLanguage`, `defaultAudioLanguage`, `contentDetails.duration`, ggf. lokalisierte Texte. Veröffentlichungsdatum eines YouTube-Uploads ist **nicht** das Erscheinungsjahr des Films.

**Technische Sichtbarkeit:** `privacyStatus`, `regionRestriction.allowed/blocked`, `embeddable`, `contentRating`. Keine der Eigenschaften garantiert für jeden realen Nutzer zu jeder Zeit unbeschränkte Wiedergabe; `embeddable=true` kann auch wegen Rechteansprüchen scheitern.

**Lizenzindikator:** `licensedContent` bedeutet laut Google, dass ein Upload einem YouTube-Content-Partner zugeordnet und vom Partner beansprucht wurde; es bestätigt **nicht**, dass für MovieHub eine eigenständige Download-/Nutzungs-/Unterlizenz besteht. Das Metadatenfeld `status.license` (Standard-/Creative-Commons-Lizenz) ist ebenfalls **keine** automatische Freigabe, ein fremdes Werk selbst zu verbreiten.

**Nicht bestätigt als öffentliches Standardfeld:** verbindliche Zuordnung YouTube-Video ↔ TMDB-ID, Kinofilm als vollständige Werkfassung, exakter DE-Preisstatus `FREE/ADS/RENT/BUY`, DE-Verwertungslizenz oder planbares Verfügbarkeitsende.

## 3. API-Kontingente – am 15.10.2026 geänderte offizielle Dokumentation

**Aktueller Stand 16.10.2026:** Die Google-Dokumentation nennt für **`search.list` einen eigenen Standard-Bucket von 100 Aufrufen täglich**, pro Aufruf **1 Einheit**. Für alle anderen üblichen Data-API-Endpunkte zusammen beträgt das dokumentierte Standardkontingent **10.000 Einheiten täglich**; `playlistItems.list`, `videos.list`, `channels.list`, `playlists.list` jeweils **1 Einheit pro Abruf**. `videos.insert` hat ebenfalls einen separaten Bucket, für uns irrelevant. Diese Werte können pro Cloud-Projekt angepasst werden; echte Quotas beim API-Key-Projekt prüfen.

**WICHTIG:** Frühere Tabellen/Artikel können `search.list = 100 Einheiten` angeben. Für diese Untersuchung gilt die aktuelle offizielle Quota-Tabelle mit Update **15.10.2026**, die **100 tägliche Suchaufrufe à 1 Einheit** festhält. Nicht den alten Suchkostenwert in Berechnungen übernehmen.

### Rechenbeispiele, **nicht ausgeführt**

- **200 Einträge aus bekannter Playlist:** vier `playlistItems.list`-Seiten (50/Seite) plus vier `videos.list`-Batches = **8 Einheiten**, ohne Quellenermittlung, Fehler und Wiederholungen. Zusätzliche `channels.list`-/`playlists.list`-Prüfungen jeweils 1 Einheit.
- **1.000 Einträge:** 20 Playlist-Seiten + 20 Videodetail-Batches = **40 Einheiten** unter denselben Idealannahmen.
- Suchvorgänge müssen wegen des **separaten 100-pro-Tag-Limits** sparsam eingesetzt werden. Bekanntes Quelleninventar direkt über Playlists statt tägliche `search.list`-Abfragen überwachen.

**Belege:**  
- https://developers.google.com/youtube/data/determine_quota_cost  
- https://developers.google.com/youtube/data/getting-started  
- https://developers.google.com/youtube/data/reference/rest/v3/search/list

## 4. Zwei getrennte Filmeintrittspfade

### 4.1 Kostenloser offizieller YouTube-Primetime-Katalog

YouTube bestätigt in der Hilfe, dass kostenlose werbeunterstützte Primetime-Filme **in Deutschland** existieren und `youtube.com/movies` den Nutzerkatalog zeigt. Gleichzeitig bietet YouTube auch Leih- und Kaufangebote. Aus den dokumentierten Data-API-Methoden wurde **kein spezieller maschinenlesbarer Komplettfeed** identifiziert, der ausschließlich alle deutschen `FREE/ADS`-Primetime-Filme oder die Einzelpreise ausgibt. Weder `regionCode=DE` noch `videoType=movie` ersetzt diese Angebotsklassifizierung.

**Status:** interessantes Fernziel, **vorerst No-Go für automatischen vollständigen Primetime-Katalog ohne dokumentierten Zugriff**. Keine HTML-/Player-/Internal-API-Extraktion als Ersatz.

Belege:  
https://support.google.com/youtube/answer/16618963?hl=de  
https://support.google.com/youtube/answer/9674101?hl=de  
https://developers.google.com/youtube/data/reference/rest/v3/search/list

### 4.2 Öffentliche Filmkanäle und ihre Playlists

Für bekannte seriöse Publisherkanäle sind Kanal-/Playlist-/Videoabfragen dokumentiert. Die API lässt sich so als Datenquelle für **Kandidaten** einsetzen. Publisheridentität und Lizenzbehauptung müssen unabhängig verifiziert werden, insbesondere bei Playlists mit Videos fremder Uploader.

**Empfohlener erster Quellenkandidat: [CiNENET Deutschland](https://www.youtube.com/channel/UClyuw-OWE6taGFv0reZI6eQ)**, Channel-ID `UClyuw-OWE6taGFv0reZI6eQ`. Kanal nennt den Betreiber **UCM.ONE GmbH** und beschreibt seine Filme als lizenziert und kostenlos. [UCM.ONE beschreibt den CiNENET-Vertrieb über YouTube und weitere Plattformen ausdrücklich als AVOD-Angebot](https://ucm.one/de/cinenet/). Für die Analyse besonders interessant: anderer Rechteinhaber/Publisher als das bereits in MovieHub angezeigte Netzkino.

**Zweiter Kandidat / Kontrollfall: [Netzkino](https://www.youtube.com/channel/UCGkHFrwE8KEuOHPVsIOskAg)**, Channel-ID `UCGkHFrwE8KEuOHPVsIOskAg`, Betreiber laut verifiziertem Kanal **PLAION PICTURES GmbH**, beschreibt ganze lizenzierte Filme als werbefinanziertes Angebot. MovieHub hat Netzkino bereits als Anbieter; **YouTube darf deshalb keine künstlichen neuen Filmtitel oder doppelte Anbieterwahrheit erzeugen**, sondern allenfalls einen belegten zusätzlichen Playbackweg zum selben TMDB-Titel.

**Weitere vorhandene Issue-Kandidaten:** DEFA Filmwelt, Movies Select, große kuratierte Community-Playlist. Erst nach gesonderter Source-/Publisherprüfung einbeziehen; Community-Playlist nicht als verifizierten Rechtekatalog behandeln.

## 5. Verbindliche Plattform-/Compliance-Grenzen

Aus den offiziellen YouTube API Services Developer Policies und den Required Minimum Functionality-Regeln ergeben sich mindestens diese Prüfpflichten:

1. **Keine audiovisuelle Extraktion:** YouTube-Videos nicht ohne vorherige schriftliche Genehmigung herunterladen, spiegeln, puffern, in eigenen MovieHub-Player remuxen oder als direkte Stream-URL extrahieren. YouTube-App bzw. regelkonformer YouTube-Player verwenden.
2. **Kein Scraping/undokumentierte APIs:** YouTube-Weboberflächen und interne Player-APIs sind kein Ersatz für den dokumentierten Datenzugang.
3. **API-Daten nur kontrolliert vorhalten:** Für nicht autorisierte API-Daten (öffentlich abgefragte Fremdkanal-/Video-Metadaten) gilt im Regelfall **spätestens nach 30 Kalendertagen löschen oder erneuern**. Änderungs-/Löschsignale frühzeitig reflektieren. Das ist ein wichtiges Design-Gate für inkrementelle Snapshot-Aktualisierung.
4. **YouTube-Attribution:** Quelle YouTube an den dargestellten YouTube-Daten/Resultaten gemäß Branding-Regeln kenntlich machen. Fremde Quellen-/YouTube-Daten nicht täuschend vermischen.
5. **Wiedergabeintegrität:** Ads nicht unterdrücken; YouTube-Playerfunktionen nicht verdecken oder verändern; keine Umgehung von Alters-, Region-, DRM- oder Loginregeln. Bei eingebettetem Player zusätzlich Referer und weitere Mindestfunktionen prüfen; `madeForKids`-/Datenschutzvorgaben beachten.
6. **Separater rechtlicher Review:** Es ist zu klären, ob Aggregation, TMDB-Matching und Anzeige als MovieHub-Verfügbarkeit im geplanten Umfang mit den aktuellen API-Policies sowie Publisherrechten vereinbar sind. Die Recherche ist **keine juristische Freigabe** und ersetzt Issue #112 nicht.
7. **Keine Schlüssel im Client/Repo:** Öffentliche Daten für den späteren Adapter serverseitig über einen entsprechend begrenzten API-Key abrufen; Schlüsselhaltung und Quota-Budget nach bestehender Projektarchitektur prüfen.

Belege:  
https://developers.google.com/youtube/terms/developer-policies  
https://developers.google.com/youtube/terms/required-minimum-functionality  
https://developers.google.com/youtube/terms/branding-guidelines

## 6. Geplanter nichtproduktiver G1-Datenpilot – erst nach Freigabe

### 6.1 Methodische Reihenfolge

1. Cloud-Projekt/YouTube-API-Aktivierung, Schlüsselablage, tatsächliche Quota, erlaubte Nutzung **lesen und prüfen**, keine produktive Veränderung.
2. **CiNENET-Kanal-ID** über `channels.list(part=snippet,contentDetails, id=...)` lesen; Upload-Playlist-ID und ggf. explizite Filmplaylists über `playlists.list` feststellen.
3. Eine tatsächlich bestehende freigegebene Filmplaylist bevorzugen; andernfalls Channel-Uploads nur als **ungefiltertes Kandidatenset** behandeln. **100–200 Einträge** mit `playlistItems.list(part=snippet,contentDetails,maxResults=50,playlistId=...)` lesen.
4. Zurückgegebene `videoId`s mit `videos.list(part=snippet,contentDetails,status,id=<CSV der IDs>)` in Batches anreichern. Fehler, fehlende Videos, Quota-Auslastung, Regionssignale dokumentieren; nicht in die produktive App schreiben.
5. Film-/Trailer-/Serien-/Clip-Kandidaten anhand Titel, Originalfilmlaufzeit und Publisher getrennt klassifizieren. Mögliche TMDB-Matches nur bei ausreichender Evidenz übernehmen; unklare Kandidaten offen lassen.
6. **Individuelle deutsche Wiedergabeproben** kontrolliert in der YouTube-App/Weboberfläche, danach auf realem Smartphone/Fire TV; keine Vorwegnahme tatsächlicher Nutzerabnahme.
7. **G1-Ergebnisbericht:** abgerufene Playlist-Videos, bereinigte IDs, volle Filme, eindeutig/uneindeutig/nicht gematcht, durch DE-Probe gültige Angebote, funktionierende Video-ID-Sprünge, kosten-/regionsbedingte Ausfälle, API-Kosten und rechtliche Risiken.
8. Nur nach Nutzerentscheidung **G2** eine kleine produktive Adapterumsetzung planen.

### 6.2 Erforderliche Soll-/Ist-Abgrenzungen

- **Kann:** Kanal/Playlist/Video-Metadaten via dokumentierter API abrufen; bekannte Video-IDs stabil referenzieren.
- **Nicht belegt:** vollständige deutsche Free-Primetime-Bestandsabfrage, verlässliche aktuelle Gratis-Preisart je Video, automatisches Erkennen vollständig lizenzierter Filmwerke, zwingend funktionierender Fire-TV-Absprung.
- **Erst im Pilot bestimmbar:** Treffer-/Fehlerraten, DE-Abspielbarkeit, Matchabdeckung, Full-Movie-Qualität, tatsächlicher Quota-Verbrauch und Aktualisierungsausfälle.

### 6.3 Architektur-Zielbild bei möglicher späterer Umsetzung

`Publisher/Kanal + Playlist → YouTube Data API → evidenzierte Video-ID/Kandidat → konservativer TMDB-Abgleich → bestehender kanonischer Titel → getrennte Quelle/Provider/YouTube-PlaybackRoute → validierter Snapshot`.

TMDB bleibt die kanonische Titel- und Posterbasis. `YouTube` bezeichnet die Wiedergabeplattform; der lizensierende Anbieter/Publisher wird nicht automatisch durch das Plattformbranding ersetzt. Den Viewer nur zu einem tatsächlich zum Titel gehörenden Video schicken, mit sicherem Fallback, ohne Netzwerkanfrage pro Poster. Unter Vorbehalt der Plattform- und Copyright-Prüfung.

## 7. Ergebnis / Entscheidungsvorschlag

**G0: Informationsrecherche abgeschlossen, technische Eignung für einen begrenzten offiziellen Playlist-/Kanal-API-Pilot plausibel.**  
**G1: Noch nicht durchgeführt.**  
**G2/G3/G4: Weder freigegeben noch begonnen.**

**Empfehlung für die nächste Sitzung:** CiNENET als erste Quelle und Netzkino als Kontrollkanal in einer begrenzten offiziellen API-Stichprobe prüfen. Zunächst Quota/API-Key-Berechtigung und exakte Filmplaylist ermitteln; falls der Zugriff nicht sicher bereitsteht, keine erfundenen Zahlen melden. Noch keine UI, Firestore-Daten, Badges, Playback-App oder Nightly verändern.

## 8. Offizielle Quellen (Stand 16.10.2026)

- API-Methoden: https://developers.google.com/youtube/data/reference/rest/v3/channels/list
- Playlist-Methoden: https://developers.google.com/youtube/data/reference/rest/v3/playlists/list
- Playlist-Items: https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list
- Videos: https://developers.google.com/youtube/data/reference/rest/v3/videos und https://developers.google.com/youtube/data/reference/rest/v3/videos/list
- Suche: https://developers.google.com/youtube/data/reference/rest/v3/search/list
- Kontingente (aktualisiert 15.10.2026): https://developers.google.com/youtube/data/determine_quota_cost
- API-Überblick: https://developers.google.com/youtube/data/getting-started
- Kostenlose Filme in DE: https://support.google.com/youtube/answer/16618963?hl=de
- Filme leihen/kaufen: https://support.google.com/youtube/answer/9674101?hl=de
- API-Richtlinien: https://developers.google.com/youtube/terms/developer-policies
- Wiedergabepflichten: https://developers.google.com/youtube/terms/required-minimum-functionality
- UCM.ONE/CiNENET: https://ucm.one/de/cinenet/
- CiNENET-Kanal: https://www.youtube.com/channel/UClyuw-OWE6taGFv0reZI6eQ
- Netzkino-Kanal: https://www.youtube.com/channel/UCGkHFrwE8KEuOHPVsIOskAg
