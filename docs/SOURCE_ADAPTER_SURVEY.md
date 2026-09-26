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


## 10. Capability- und Extension-Modell

Der Adaptervertrag wird bewusst dreistufig geführt:

### Core

Der Core enthält nur Begriffe, die Movie Hub quellenübergreifend fachlich verstehen muss:

- TitleRef
- Availability
- BroadcastEvent
- PlaybackRoute
- SourceRef
- SourceEnvelope

### Capabilities

Capabilities sind optionale, normalisierte Zusatzfähigkeiten. Sie sind **nicht verpflichtend für jede Quelle**.

Erste Capability-Kandidaten:

- `replay`
  - available
  - availableUntil?
- `recording`
  - available
- `subtitles`
  - available
  - languages?
- `audioDescription`
  - available
  - languages?
- `videoQuality`
  - maxResolution?
  - hdr?
- `availabilityExpiry`
  - expiresAt
- `onDemandRelation`
  - providerId
  - target?
- `episodeRelation`
  - seasonNumber?
  - episodeNumber?
  - episodeTitle?
- `regionalRestriction`
  - regions?
- `catchupWindow`
  - startsAt?
  - endsAt?

Capabilities werden erst dann standardisiert, wenn ihre Bedeutung stabil genug ist.
Eine Quelle darf nur die Capabilities angeben, die sie tatsächlich belegen kann.

### Extensions

`extensions` ist ein namespacierter Bereich für quellspezifische Zusatzinformationen.

Beispiele:

```json
{
  "extensions": {
    "waipu": {
      "programId": "123",
      "seriesId": "456",
      "recordingRestrictions": {}
    }
  }
}
```

oder:

```json
{
  "extensions": {
    "joyn": {
      "contentId": "...",
      "channelSlug": "..."
    }
  }
}
```

Regeln:

1. Namespace entspricht der Quelle oder einem klar definierten Integrationsbereich.
2. Extensions dürfen den Core nicht überschreiben.
3. App-Kernlogik darf nicht direkt von beliebigen Extension-Feldern abhängen.
4. Entsteht aus einem Extension-Feld ein allgemeines Produktfeature, wird es in einer späteren Contract-Version als Capability normalisiert.
5. Rohdaten werden nicht unbegrenzt gespiegelt; nur stabile, nützliche und zulässig speicherbare Zusatzdaten werden erhalten.

## 11. Capability Discovery pro Quelle

Bei jeder neuen Quelle wird zusätzlich zur Kompatibilitätsanalyse eine Mehrwertanalyse durchgeführt:

- Welche Informationen liefert die Quelle zusätzlich zum Core?
- Welche davon sind fachlich belastbar?
- Welche davon können unmittelbar als bestehende Capability normalisiert werden?
- Welche bleiben zunächst als Extension erhalten?
- Welche sollten aus Datenschutz-, Rechte-, Größen- oder Stabilitätsgründen bewusst verworfen werden?
- Welche neuen Produktideen könnten daraus entstehen?

Damit wird jede neue Quelle nicht nur als Datenlieferant, sondern auch als möglicher Funktionsgeber für Movie Hub betrachtet.


## 12. Regel zur Hochstufung von Extensions zu Capabilities

Ein quellspezifisches Feld wird nicht sofort Teil des gemeinsamen Vertrags. Die
Hochstufung erfolgt erst, wenn mindestens eine der folgenden Bedingungen erfüllt
ist:

1. **Quellenübergreifende Wiederholung**
   - mindestens zwei unabhängige Quellen liefern fachlich dieselbe Information.

2. **Eigenständiger Produktmehrwert**
   - Movie Hub kann daraus eine verständliche, quellenunabhängige Funktion bauen,
     z. B. „Replay verfügbar“, „Untertitel“, „läuft in 4K“, „noch 5 Tage verfügbar“.

3. **Stabile Semantik**
   - Bedeutung und Lebenszyklus des Feldes sind klar genug, dass es nicht nur
     eine technische Eigenheit einer Quelle beschreibt.

4. **Belastbare Qualität**
   - die Quelle liefert die Information reproduzierbar und nicht nur zufällig
     oder in einzelnen Sonderfällen.

5. **Sichere Speicherung und Nutzung**
   - Datenschutz, Rechte, Datenmenge und Aktualisierungsstrategie sind geklärt.

Bis dahin bleibt die Information unter einem namespacierten `extensions`-
Bereich erhalten.

### Beispiel Waipu

Bereits heute vorhandene Rohinformationen können unter `extensions.waipu`
erhalten werden, z. B.:

- `programId`
- `seriesId`
- rohe Wiedergabe-/Aufnahmeeinschränkungen aus Programmdetails

Staffel, Folge und Episodentitel sind dagegen bereits allgemein genug und werden
im Core/Capability-Modell normalisiert.

### Beispiel zweite Quelle

Liefert etwa Joyn oder ein offizieller Sender zusätzlich eine belastbare
Catch-up-/Mediathek-Gültigkeit, kann diese Information zunächst unter der
jeweiligen Extension erhalten werden. Sobald sich daraus eine stabile
quellenübergreifende Bedeutung ergibt, wird sie als `replay`,
`catchupWindow` oder `availabilityExpiry` normalisiert.

### Migrationsregel

Eine Hochstufung darf alte Daten nicht unlesbar machen:

- neue Contract-Version kann die Capability ergänzen;
- der Adapter normalisiert neue Generationen in die Capability;
- bestehende Extension-Daten bleiben während einer Übergangsphase lesbar;
- UI konsumiert nur die normalisierte Capability, sobald diese als stabil gilt.


## 13. Konkreter Informationsverlust im heutigen Waipu-Pfad

Die Bestandsanalyse bestätigt einen realen Fall, der das Capability-/Extension-
Prinzip rechtfertigt:

- die dokumentierten Waipu-Grid-/Programmdaten enthalten zusätzliche
  Wiedergabe-/Aufnahmeeinschränkungen;
- `scripts/waipu-program-classifier.mjs::normalizeWaipuProgram()` übernimmt
  derzeit nur die für Klassifikation, TMDB-Matching und Episodenbezug
  benötigten Felder;
- zusätzliche Restriktions-/Funktionsinformationen werden auf diesem Weg heute
  nicht in den veröffentlichten Movie-Hub-Datensatz weitergereicht.

Das ist **kein Fehler des bisherigen Waipu-Pakets**, weil diese Informationen
für dessen damaligen Funktionsumfang nicht benötigt wurden. Für die allgemeine
Quellenplattform gilt künftig jedoch:

1. bekannte, potenziell nützliche Quellinformationen werden bewusst klassifiziert;
2. sie werden entweder
   - in den Core,
   - in eine standardisierte Capability,
   - in eine namespacierte Extension
   - oder bewusst in eine dokumentierte Verwerfung
   eingeordnet;
3. ein Feld darf nicht stillschweigend allein deshalb verschwinden, weil das
   aktuelle UI es noch nicht verwendet.

Für #331 bedeutet das konkret: Beim Waipu-Mapping werden vorhandene zusätzliche
Programm-/Gridinformationen erneut gegen diesen Katalog geprüft. Aufnahme-,
Replay- oder Wiedergabeeinschränkungen werden nur dann als allgemeine Capability
veröffentlicht, wenn ihre Semantik belastbar ist; andernfalls bleiben sie
zunächst unter `extensions.waipu`.


## 14. Field Discovery und Schema-Drift

Neben Core/Capabilities/Extensions erhält die Plattform eine kontrollierte
Feldbeobachtung.

### Warum

Eine externe Quelle kann:

- neue Felder ergänzen;
- bekannte Felder entfernen;
- Datentypen ändern;
- bisher uninteressante Felder plötzlich fachlich relevant machen.

Movie Hub soll solche Änderungen erkennen, ohne automatisch sämtliche Rohdaten
zu speichern oder jedes unbekannte Feld produktiv durchzureichen.

### Policy-Zustände

- `core`
- `capability`
- `extension`
- `review`
- `reject`
- `deprecated`

Neue Felder starten grundsätzlich als `review`.

### Bericht

Der gemeinsame Reporter unterscheidet:

- **INFO** – bekannte oder bewusst abgelehnte Felder;
- **REVIEW** – neue/unentschiedene Felder;
- **BREAKING** – bekannte relevante Felder fehlen oder ändern ihre Struktur.

Schema-Snapshots enthalten standardmäßig nur Feldpfad und beobachtete
Datentypen. Damit bleibt die Beobachtung klein und unabhängig vom
Client-Datenmodell.

### Erste Waipu-Policy

`src/sources/policies/waipuFieldPolicy.js` klassifiziert bereits bekannte
Waipu-Felder. Aufnahme- und Wiedergabeeinschränkungen bleiben zunächst
`review`; sie werden erst nach fachlicher Prüfung Capability oder Extension.

### Spätere Admin-App

Der Bericht ist absichtlich maschinenlesbar aufgebaut. Eine spätere
Movie-Hub-Admin-App kann daraus ohne Änderung des Adaptervertrags eine Ansicht
für neue Felder, Entscheidungen, Schemaänderungen und Quellgesundheit bauen.


## 15. Upstream-Schema vs. interner Cache-Vertrag

Die reale Waipu-Implementierung zeigt eine wichtige technische Grenze:

- `WaipuPublicApiClient` liest die externe JSON-Antwort;
- anschließend wird sie sofort durch `normalizeStations`, `normalizeGrid`,
  `normalizeProgram` usw. auf den heutigen internen Mindestvertrag reduziert;
- erst dieser normalisierte Wert wird im `WaipuEpgCache` gespeichert.

Ein Field-Discovery-Bericht, der nur den Cache betrachtet, kann deshalb **keine
neuen externen Felder erkennen**, die der bestehende Normalizer bereits entfernt.

### Entscheidung

Die Schema-Beobachtung erfolgt zusätzlich **vor der Normalisierung**:

`HTTP JSON → diagnostische Schema-Beobachtung → bestehende Normalisierung → Cache`

Dabei gelten harte Grenzen:

- Rohantworten werden nicht pauschal persistiert;
- die Beobachtung darf nur Schema-/Feldinformationen ableiten;
- ein Fehler im Reporter darf den produktiven Datenpfad niemals abbrechen;
- Normalisierung und bestehende Sicherheitsprüfungen bleiben unverändert;
- Cache-Schema und Upstream-Schema werden getrennt berichtet.

### Erste technische Umsetzung

`WaipuPublicApiClient` unterstützt jetzt einen optionalen
`observeRawSchema(body, context)`-Hook. Der Hook wird nach sicherem JSON-Parsing,
aber vor dem bestehenden Normalizer ausgeführt. Fehler des Hooks werden
absichtlich abgefangen.

Damit können spätere Läufe melden:

- neues Upstream-Feld, obwohl der bestehende Cache es noch nicht kennt;
- geänderte Struktur eines bekannten Quellfeldes;
- gleichzeitig Änderungen am bereits normalisierten internen Cache-Vertrag.

Diese Trennung ist notwendig, damit Movie Hub sowohl externe Chancen als auch
interne Breaking Changes erkennen kann.


## 16. Erste bestätigte Feldentscheidungen

Stand 26.09.2026:

| Quelle/Feld | Entscheidung | Begründung |
|---|---|---|
| Waipu `recordingRestrictions` | `extension:waipu` | potenziell nützlich, Semantik noch nicht stabil genug für gemeinsame Recording-Capability |
| Waipu `playbackRestrictions` | `extension:waipu` | potenziell nützlich für Replay/Playback, zunächst quellspezifisch erhalten |
| TMDB `display_priority` | `extension:tmdb` | Quelle darf ihre Reihenfolgeinformation behalten; Movie Hub übernimmt sie nicht automatisch als Sortierregel |
| TMDB `logo_path` | `reject` | Movie Hub kontrolliert Providerdarstellung selbst; zusätzlicher Bild-/Abhängigkeitswert derzeit nicht gerechtfertigt |
| TMDB `flatrate/free/ads/rent/buy` | Availability-Core | unmittelbare fachliche Bedeutung für Verfügbarkeit |
| unbekannte neue Felder | `review` | niemals automatisch produktiv übernehmen |

Diese Entscheidungen sind in den Field-Policies und zugehörigen Tests umgesetzt.

## 17. V1-Stabilitätsstand von #330

### Bereits stabil genug

- Titelidentität: `mediaType + tmdbId`
- getrennte Objekte für Availability und BroadcastEvent
- getrennte Provider-/PlaybackRoute-Modellierung
- mehrere Provider-Routen je BroadcastEvent
- SourceRef/Provenienz und Zeitbezug
- AccessTypes `flatrate/free/ads/rent/buy/own`
- optionale Capabilities
- namespacierte Extensions
- Field-Policy mit `core/capability/extension/review/reject/deprecated`
- Schema-Drift-Stufen `INFO/REVIEW/BREAKING`
- Upstream-Beobachtung vor Normalisierung
- fail-safe Diagnosepfad
- getrennte Client-Projektion als Architekturprinzip

### Noch offen vor Abschluss #330

- reale Waipu-Rohantworten über mehrere Endpunkttypen gegen die Policy laufen lassen;
- tatsächliche Feldformen aus Stations-, Grid- und Programmdaten als Snapshot festhalten;
- TMDB-Watch-Provider-Pfad in einem realen Bericht gegen aktuelle DE-Antwort testen;
- entscheiden, welche Source-Schema-Berichte dauerhaft als CI-/Nachtlauf-Artefakt aufbewahrt werden;
- V1-Schema/Testfixture als expliziten Freeze markieren;
- bestehende Tests/Build im GitHub-CI-Kontext vollständig grün bestätigen.

Erst danach wird #330 abgeschlossen und #331 darf die produktive Waipu-Abbildung auf den gemeinsamen Vertrag beginnen.
