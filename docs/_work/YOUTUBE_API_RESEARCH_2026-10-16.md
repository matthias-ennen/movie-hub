# YouTube Data API – Recherche und erste Adapterbewertung

**MovieHub · Issue #388 · 16.10.2026**  
**Ergebnisstatus:** G0 – Dokumentations-/Internetrecherche; **kein** authentifizierter API-Abruf, **kein** Datenpilot, **kein** Wiedergabe- oder Fire-TV-Gerätetest, **keine** Code-/Secret-/Cloud-Änderung.  
**Entscheidungsbedarf:** später G1 (begrenzter nichtproduktiver API-Pilot) und danach gegebenenfalls separate Produktivfreigabe G2.

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
