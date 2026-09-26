# Quellen-Voranalyse für die Movie-Hub-Adapterplattform

Stand: 26. September 2026

Diese Voranalyse gehört zu #330/#271. Sie soll verhindern, dass der gemeinsame
Adaptervertrag lediglich den vorhandenen Waipu-Pfad abstrahiert. Untersucht
werden bewusst unterschiedliche Quellentypen. Die Analyse ist keine Freigabe
zur produktiven Nutzung einer Quelle und ersetzt nicht das Compliance-Gate #112.

## 1. Quellenmatrix

| Referenz | Grundtyp | Zeitmodell | Zugang/Monetarisierung | Sender/Channel | Wiedergabeziel | Bedeutung für den Vertrag |
|---|---|---|---|---|---|---|
| Waipu | linearer TV-/EPG-Anbieter | Start/Ende, upcoming/live/expired | abhängig von Waipu/Tarif | ja | Programm-/Sender-Deep-Link | Referenz für konkrete Ausstrahlung + Providerziel |
| Joyn | Live-TV + Mediathek/VOD | linear und zeitunabhängig | free/werbefinanziert, teils Registrierung/Plus | ja | Live-TV-/Mediathek-/Webziel; technische App-Ziele separat zu prüfen | beweist, dass Provider nicht auf reines EPG reduziert werden darf |
| ARD/ZDF | offizielle Sender-/Mediathekquellen | linear + einzelne Live-Events + VOD | überwiegend free, Rechte/Geo möglich | ja | offizielles Live-/Web-/Mediathekziel | offizielle Quelle kann zugleich EPG, Live und VOD liefern |
| Pluto/FAST | FAST linear + AVOD | linear + On-Demand | free/ads | virtuelle Channels | Web/App-Ziel; technische Details separat prüfen | free/ads muss unabhängig vom Zeitmodell sein |
| TMDB Watch Providers | Verfügbarkeitsaggregat | überwiegend zeitunabhängig | flatrate/free/ads/rent/buy | nein | TMDB-Link, keine vollständigen Content-Deep-Links | Monetarisierung ist eigene Dimension; Quelle ≠ Provider ≠ Playback |

## 2. Verifizierter Ist-Zustand im Movie-Hub-Repository

### 2.1 Waipu-Datenweg

Der produktive Waipu-Pfad besteht bereits aus mehreren sauber trennbaren Stufen:

1. **Quellabruf und Cache**
   - öffentliche Read-only-Endpunkte für Senderstamm, Grid und Programmdetail;
   - persistenter Cache, ETag/Last-Modified, Checkpoints und Single-Flight;
   - Requestbudgets, Pacing, Circuit Breaker und letzter gültiger Stand.

2. **Klassifikation und TMDB-Matching**
   - Film-/Serienvorfilterung aus Grid/Programmdetail;
   - lokale Kandidaten aus Movie-Hub-Katalog/Suchindex;
   - nur offene Fälle über TMDB-Suche;
   - Fail-Closed bei schwachen oder mehrdeutigen Treffern;
   - kanonische Identität `Medientyp + TMDB-ID`.

3. **Veröffentlichung**
   - `waipu-live/index.json`
   - `waipu-live/stations.json`
   - `waipu-live/titles.json`
   - `waipu-live/days/{YYYY-MM-DD}.json`
   - `waipu-live/stations/{stationId}.json`

4. **Client-Normalisierung**
   - `src/waipu/waipuLiveCatalog.js` verbindet Titel über
     `type + tmdbId` und ergänzt `providerIds: ['waipu']`;
   - Ausstrahlungen enthalten aktuell insbesondere
     `programId`, `seriesId`, `stationId`, `stationName`,
     `startTime`, `stopTime`, Episodenangaben und Bild;
   - abgelaufene Ausstrahlungen werden beim Lesen ausgefiltert.

5. **TV-Ansicht**
   - `src/waipu/waipuTvCatalog.js` liest Index/Sender und je nach Ansicht
     Tages- oder Sendershards;
   - Tages- und Senderdaten werden clientseitig normalisiert und zeitlich
     gefiltert.

**Konsequenz:** Der künftige Adapter darf Quellabruf, Matching,
Veröffentlichung und Client-Lesemodell nicht wieder zu einem monolithischen
Baustein zusammenziehen. Der gemeinsame Vertrag liegt zwischen diesen Stufen.

### 2.2 TMDB-Watch-Provider-Pfad

Movie Hub hat bereits einen wertvollen Teil des späteren Availability-Modells:

- `src/services/tmdb.js` kennt die TMDB-Angebotstypen
  `flatrate`, `free`, `ads`, `rent`, `buy`;
- `normalizeTmdbWatchProviders()` reduziert die regionale DE-Antwort auf
  bekannte Movie-Hub-Provider;
- pro Provider bleibt bereits eine Liste `offerTypes[]` erhalten;
- zusätzlich bleiben die TMDB-Provider-ID und der von TMDB gelieferte
  `watchProviderLink` erhalten;
- `toMovieHubTitle()` kann `providerOffers` am Titel führen, erzeugt für
  bestehende UI-/Filterpfade aber weiterhin auch die flache Liste
  `providerIds`.

Der Provider-Registry sind bereits u. a. Joyn, Pluto TV, ARD, ZDF, arte,
Netzkino und waipu.tv bekannt. Waipu ist dort bewusst `source: special`,
während die anderen genannten Plattformen derzeit überwiegend über TMDB
zugeordnet werden.

**Konsequenz:** Das Fundament soll `providerIds` nicht abrupt ersetzen.
`Availability[]` wird die reichere kanonische Ebene; `providerIds` kann
vorerst als rückwärtskompatibel abgeleitete Sicht bestehen bleiben.

## 3. Aktuelle externe Quellenbefunde

### TMDB / JustWatch

Die offizielle TMDB-API dokumentiert für Watch Providers genau die
Monetarisierungstypen `flatrate`, `free`, `ads`, `rent` und `buy`.
TMDB weist ausdrücklich darauf hin, dass die Daten aus der Partnerschaft mit
JustWatch stammen, keine vollständigen Deep Links darstellen und bei Nutzung
eine JustWatch-Attribution erforderlich ist.

Damit ist TMDB ein **Availability-Aggregat**, nicht der Wiedergabeadapter selbst.

### Joyn

Joyn beschreibt sein deutsches Angebot aktuell als Kombination aus kostenlosem
Live-TV und Abrufinhalten. Live-TV kann laut eigener Hilfe ohne Anmeldung
genutzt werden; für Sendermediatheken kann Registrierung erforderlich sein.
Joyn-Seiten besitzen senderbezogene Programmvorschauen und Live-TV-Einstiege.

Für #330 reicht dieser Befund als Schema-Nachweis. Eine stabile maschinenlesbare
EPG-Quelle sowie konkrete sendergenaue App-/Webziele werden erst in der
technischen Joyn-Vertiefung bzw. #280 als belastbar bestätigt.

### ARD

Die ARD stellt Sender-Livestreams in der ARD Mediathek bereit. Gleichzeitig
existiert eine ARD-Programmpresse-API für automatisierte Programmdaten; diese
erfordert registrierten Zugang und Basic Authentication. Das ARD Developer
Portal weist die Core API der ARD Mediathek aktuell als intern aus.

**Konsequenz:** „Offizieller Stream vorhanden“ und „offene strukturierte
Programmdaten verfügbar“ sind zwei getrennte Fähigkeiten und müssen im
Adapterstatus separat modelliert werden.

### ZDF

ZDF bündelt 24/7-Livestreams, Programmübersicht, zusätzliche Event-Livestreams
und Abrufinhalte im Streamingportal. 24/7-Livestreams der Senderfamilie sind
für Deutschland vorgesehen; einzelne Events können andere Rechtegebiete haben.

**Konsequenz:** Georechte und konkrete Gültigkeit gehören an
PlaybackRoute/Availability und nicht an den kanonischen Titel.

### Pluto / FAST

Pluto beschreibt sich selbst als kostenloses, werbefinanziertes Angebot mit
Live-TV-Channels und On-Demand-Filmen/-Serien. Öffentliche Drittanbieter-
Implementierungen zeigen technisch getrennte Channel-/Guide-/Timeline- und
VOD-Strukturen sowie sessionbasierte Wiedergabewege.

Diese technischen Drittanbieterbefunde sind **keine Freigabe zur Übernahme
interner Pluto-Endpunkte**. Sie belegen für #330 lediglich, dass ein
FAST-Adapter gleichzeitig lineare Events und zeitunabhängige AVOD-Verfügbarkeit
liefern kann.

## 4. Fachliche Trennung

Der gemeinsame Vertrag darf folgende Dinge nicht vermischen:

- **Titelidentität:** `Medientyp + TMDB-ID`
- **Quelle:** woher die Information stammt
- **Provider/Plattform:** wo der Nutzer sehen kann
- **Sender/Channel:** lineare Ausstrahlungsinstanz
- **Verfügbarkeit:** unter welchen Bedingungen ein Titel angeboten wird
- **Senderereignis:** konkrete zeitgebundene Ausstrahlung
- **Wiedergabeziel:** App-, Web- oder zulässiger Stream-/Resolver-Pfad
- **Monetarisierung/Zugang:** `flatrate`, `free`, `ads`, `rent`, `buy`, `own`
- **Zeitstatus:** dauerhaft/zeitunabhängig, kommend, live, abgelaufen
- **Qualität/Frische:** fetchedAt, expiresAt, Quelle gesund/gestört, Match-Sicherheit

## 5. Vertragsentwurf V1

### SourceEnvelope

- `contractVersion`
- `sourceId`
- `sourceGenerationId`
- `generatedAt`
- `fetchedAt`
- `expiresAt?`
- `sourceStatus`: `healthy | degraded | failed | stale`
- `sourceCoverage?`
- `records[]`

### TitleRef

- `mediaType`: `movie | series`
- `tmdbId`

### Availability

- `availabilityId`
- `titleRef`
- `providerId`
- `region`
- `accessType`: `flatrate | free | ads | rent | buy | own`
- `validFrom?`
- `validUntil?`
- `playbackRoutes[]`
- `sourceRefs[]`
- `matchConfidence?`
- `matchReason?`

### BroadcastEvent

- `eventId`
- `titleRef`
- `channelId`
- `channelName`
- `startAt`
- `endAt`
- abgeleiteter Status: `upcoming | live | expired`
- `episode?`
- `playbackRoutes[]`
- `sourceRefs[]`
- `matchConfidence?`
- `matchReason?`

### PlaybackRoute

- `providerId`
- `mode`: `APP_DEEP_LINK | WEB_LINK | DIRECT_STREAM | RESOLVER`
- `target`
- `requiresAuth?`
- `requiresSubscription?`
- `adSupported?`
- `geoRegion?`
- `drm?`
- `verifiedAt?`

### SourceRef

- `sourceId`
- `externalId?`
- `observedAt`
- `expiresAt?`

## 6. Rückwärtskompatibilität

Für die Migration gilt:

- bestehende `providerIds[]` bleiben zunächst erhalten;
- sie werden künftig aus `Availability[]` und gegebenenfalls
  `BroadcastEvent.playbackRoutes[]` abgeleitet;
- `waipuLive.airings[]` kann während #331 als Legacy-Lesesicht bestehen;
- bestehende Waipu-Deep-Links aus #259 bleiben unverändert nutzbar;
- UI und Fire-TV-Verhalten dürfen durch die interne Migration nicht
  vorzeitig verändert werden.

## 7. Regeln für Merge und Deduplizierung

1. Titel werden ausschließlich über `mediaType + tmdbId` zusammengeführt.
2. Zeitunabhängige Availability und BroadcastEvent bleiben getrennt.
3. Ein BroadcastEvent wird nach normalisiertem Channel + Start/Ende + TitleRef
   zusammengeführt; Toleranzen werden erst nach realen Mehrquellenproben
   festgelegt.
4. Mehrere Quellen dürfen dasselbe Event bestätigen.
5. Mehrere Provider dürfen demselben Event eigene PlaybackRoutes hinzufügen.
6. Eine Quelle darf Daten einer anderen Quelle weder löschen noch ungültig
   machen.
7. Eine fehlerhafte neue Generation ersetzt nicht den letzten gültigen Stand
   derselben Quelle.
8. Zeitablauf ist unabhängig vom Quellenstatus: abgelaufene Events bleiben
   nicht unbegrenzt sichtbar, nur weil eine Quelle ausfällt.
9. `free/ads/flatrate/rent/buy` ist eine Zugangsart, nicht der Quellentyp.
10. `providerId` beschreibt den Nutzungsweg, `sourceId` die Herkunft der
    Information.
11. Unterschiedliche Quellen dürfen dieselbe Availability bestätigen; dabei
    bleiben Herkunft und Aktualität je SourceRef nachvollziehbar.
12. Ein PlaybackRoute-Ziel wird niemals allein aus einem Provider-Namen
    konstruiert; es muss aus einer verifizierten Route oder einem definierten
    sicheren Fallback stammen.

## 8. Offene technische Untersuchungen vor endgültigem V1-Vertrag

- reale Waipu-Ausgabefelder aus Index, Titles, Days und Stations vollständig
  gegen die V1-Felder mappen;
- Joyn: stabile strukturierte EPG-/Senderdatenquelle und belastbare
  sendergenaue App-/Webziele ermitteln;
- ARD/ZDF: nutzbare offizielle Programm-/Live-Strukturen und stabile IDs unter
  ihren jeweiligen Zugangsbedingungen prüfen;
- Pluto/FAST: keine internen Endpunkte übernehmen, bevor Stabilität,
  Nutzungsbedingungen und erlaubte Verwendung geklärt sind;
- vorhandene TMDB-`providerOffers` Ende-zu-Ende durch Katalog/Client verfolgen,
  damit keine Monetarisierungsinformation beim Build verloren geht;
- Toleranzregeln für identische BroadcastEvents erst aus realen Beispielen
  ableiten;
- Rechts-/Nutzungsbedingungen pro Quelle bleiben eigenes Gate (#112).

## 9. Übergabe

#330 ist erst bereit für den Abschluss, wenn die offenen Punkte ausreichend
belegt und der V1-Vertrag als eigenes versioniertes Schema/Testfixture
festgeschrieben sind. #331 bildet anschließend Waipu vollständig darauf ab.
#332 beweist Mehrquellen-Merge und Fehlerisolation, bevor #280 Joyn produktiv
implementiert.
