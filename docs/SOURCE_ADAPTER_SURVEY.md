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
| Joyn | Live-TV + Mediathek/VOD | linear und zeitunabhängig | free, teils Registrierung/Plus | ja | Live-TV-/Mediathek-/Webziel; technische App-Ziele separat zu prüfen | beweist, dass Provider nicht auf reines EPG reduziert werden darf |
| ARD/ZDF | offizielle Sender-/Mediathekquellen | linear + einzelne Live-Events + VOD | überwiegend free, Rechte/Geo möglich | ja | offizielles Live-/Web-/Mediathekziel | offizielle Quelle kann zugleich EPG, Live und VOD liefern |
| Pluto/FAST | FAST linear + AVOD | linear + On-Demand | free/ads | virtuelle Channels | Web/App-Ziel; technische Details später prüfen | free/ads muss unabhängig vom Zeitmodell sein |
| TMDB Watch Providers | Verfügbarkeitsaggregat | überwiegend zeitunabhängig | flatrate/free/ads/rent/buy | nein | TMDB-Link, keine vollständigen Content-Deep-Links | Monetarisierung ist eigene Dimension; Quelle ≠ Provider ≠ Playback |

## 2. Konsequenzen

### 2.1 Titel bleibt kanonisch

Öffentliche Film-/Serienmetadaten werden weiterhin ausschließlich über die
kanonische Movie-Hub-Titelidentität referenziert:

- `mediaType`
- `tmdbId`

Adapter dürfen keine konkurrierenden öffentlichen Titelstammsätze erzeugen.

### 2.2 Verfügbarkeit und Senderereignis sind zwei verschiedene Objekte

**Availability** beantwortet:

> Unter welchen Bedingungen kann dieser Titel bei einem Provider genutzt werden?

Beispiele:
- Netflix / flatrate
- Pluto TV / ads
- offizieller Sender / free
- Store / rent
- Movie Hub / own

**BroadcastEvent** beantwortet:

> Wann läuft dieser Titel auf welchem linearen Channel?

Beispiele:
- ProSieben, 26.09.2026 20:15–22:10
- ZDF, 27.09.2026 22:15–23:45

Ein BroadcastEvent kann mehrere PlaybackRoutes besitzen, z. B. Waipu und Joyn.

### 2.3 Quelle, Provider und Wiedergabeziel dürfen nicht gleichgesetzt werden

Beispiel:

- Quelle: ein EPG-Datenfeed
- Channel: ProSieben
- Provider: Waipu
- PlaybackRoute: konkreter Waipu-Programmlink

Eine zweite Quelle kann dasselbe BroadcastEvent erkennen und zusätzlich einen
Joyn-Wiedergabeweg liefern, ohne einen zweiten Filmdatensatz oder ein zweites
Senderereignis zu erzeugen.

## 3. Vertragsentwurf V1 – fachliche Kernobjekte

### SourceEnvelope

- `contractVersion`
- `sourceId`
- `sourceGenerationId`
- `fetchedAt`
- `expiresAt?`
- `sourceStatus`
- `sourceCoverage?`
- `records[]`

### TitleRef

- `mediaType`
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
- `startAt`
- `endAt`
- abgeleiteter Status: upcoming/live/expired
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

## 4. Regeln für Merge und Deduplizierung

1. Titel werden ausschließlich über `mediaType + tmdbId` zusammengeführt.
2. Zeitunabhängige Availability und BroadcastEvent bleiben getrennt.
3. Ein BroadcastEvent wird nach normalisiertem Channel + Start/Ende + TitleRef
   zusammengeführt; Toleranzen werden erst nach realen Datenproben festgelegt.
4. Mehrere Quellen dürfen dasselbe Event bestätigen.
5. Mehrere Provider dürfen demselben Event eigene PlaybackRoutes hinzufügen.
6. Eine Quelle darf Daten einer anderen Quelle weder löschen noch ungültig machen.
7. Eine fehlerhafte neue Generation ersetzt nicht den letzten gültigen Stand
   derselben Quelle.
8. Zeitablauf ist unabhängig vom Quellenstatus: abgelaufene Events bleiben nicht
   unbegrenzt sichtbar, nur weil eine Quelle ausfällt.
9. `free/ads/flatrate/rent/buy` ist eine Zugangsart, nicht der Quellentyp.
10. `providerId` beschreibt den Nutzungsweg, `sourceId` die Herkunft der
    Information.

## 5. Noch offene technische Untersuchungen vor endgültigem V1-Vertrag

- tatsächliche aktuelle Waipu-Artefakte und deren Felder vollständig inventarisieren;
- Joyn: stabile strukturierte EPG-/Senderdatenquelle und belastbare sendergenaue
  App-/Webziele ermitteln;
- ARD/ZDF: maschinenlesbare offizielle Programm-/Live-Strukturen und stabile IDs prüfen;
- Pluto/FAST: verfügbare strukturierte Guide-/Katalogdaten und stabile Content-/Channel-IDs prüfen;
- bestehende Movie-Hub-Nutzung von TMDB Watch Providers im Code lokalisieren und
  gegen das Availability-Modell prüfen;
- Toleranzregeln für identische BroadcastEvents erst aus realen Beispielen ableiten;
- Rechts-/Nutzungsbedingungen pro Quelle bleiben eigenes Gate (#112).

## 6. Übergabe

Wenn diese offenen Punkte ausreichend belegt sind, wird der V1-Vertrag in #330
festgeschrieben. #331 bildet anschließend Waipu vollständig darauf ab. #332
beweist Mehrquellen-Merge und Fehlerisolation, bevor #280 Joyn produktiv
implementiert.
