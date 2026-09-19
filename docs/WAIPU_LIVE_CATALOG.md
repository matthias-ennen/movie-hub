# Waipu-Live-Katalog und TMDB-Zuordnung (#4E)

Stand: 19. September 2026

## Ergebnis und Grenze

Der öffentliche Waipu-EPG-Bestand kann jetzt in einen unsichtbaren,
stationsbezogenen MovieHub-Katalog übersetzt werden. Die kanonische Identität
eines Titels ist immer `Medientyp + TMDB-ID`. Ein Waipu-Titel wird nur
veröffentlicht, wenn Film beziehungsweise Serie aus Grid **und** Programmdetail
belastbar bestimmbar sind und die TMDB-Zuordnung den Mindestscore sowie den
Mindestabstand zum zweitbesten Kandidaten erfüllt.

Unklare, widersprüchliche oder nicht gefundene Einträge bleiben unsichtbar. Sie
werden weder geraten noch unter einer nur ähnlich klingenden TMDB-ID
veröffentlicht. Die erste App-Integration aus #4F ordnet den Titelindex
ausschließlich über `Medientyp + TMDB-ID` zu. #4G ergänzt daraus eine eigene
TV-Oberfläche, ohne die Katalogerzeugung oder Titelidentität zu verändern.

## Eingangsquellen

1. Der vollständige, checkpoint-fähige 14-Tage-Grid-Cache aus #4D.
2. Öffentliche Waipu-Programmdetails, unveränderlich je `programId` gecacht.
3. Zuerst der vorhandene MovieHub-Katalog und Suchindex als lokale
   TMDB-Kandidatenquelle.
4. Nur für lokal nicht eindeutig gelöste Titel die offizielle TMDB-Suche mit
   `TMDB_API_READ_TOKEN`. Fehlt der Token und bleibt mindestens ein Kandidat
   offen, wird keine neue Generation veröffentlicht.

Der Live-Nachweis der 7er-Stufe umfasst 588 Grid-Slots, 3.363 rohe
Programmeinträge und 2.774 im exakten Fenster eindeutige Programme. Darunter
wurden 83 Film- und 1.217 Serienkandidaten erkannt. Alle 13 gezielt geprüften
Programmdetails enthielten die für die Typbestimmung erforderlichen Felder; 10
der 13 Stichproben ließen sich bereits gegen den vorhandenen Suchbestand
zuordnen. Die übrigen Fälle belegen die beabsichtigte Fail-Closed-Grenze und
werden nicht automatisch geraten.

## Klassifikation

- Grid-Genres `Film`, `Filme`, `Spielfilm`, `Fernsehfilm` und `TV-Film`
  eröffnen ausschließlich einen Filmkandidaten.
- Grid-Genres `Serie` und `Serien` eröffnen ausschließlich einen
  Serienkandidaten.
- Das Programmdetail muss den Typ bestätigen. Serienstruktur wie Serien-ID,
  Staffel, Folge und Episodentitel verstärkt die Serienbestimmung.
- Ein Film-/Serienkonflikt schließt den Eintrag aus.
- Formate aus `Aktuelles`, `Dokus`, `Unterhaltung` oder `Shows` werden nicht nur
  wegen ihres Grid-Eintrags als Film oder Serie behandelt.

Reality, Dokutainment oder Gerichtsshows werden nicht pauschal ausgeschlossen:
Sie erscheinen nur dann, wenn Waipu sie ausdrücklich als Serie liefert und eine
starke, eindeutige TMDB-TV-Zuordnung existiert.

## TMDB-Matcher

Der Matcher normalisiert deutschen und originalen Titel, Satzzeichen,
Diakritika und Schreibvarianten. Er bewertet:

- Titel- beziehungsweise Originaltitelgleichheit;
- Produktionsjahr, bei Filmen wesentlich strenger als bei Serien;
- optional ein übereinstimmendes Produktionsland;
- vorhandene Serienstruktur;
- zwingend den gleichen Medientyp.

Aktuelle Schwellenwerte:

| Bedingung | Film | Serie |
|---|---:|---:|
| Mindestscore | 80 | 75 |
| Mindestabstand zum zweiten Treffer | 12 | 12 |

Mehrdeutige Treffer, Unterschreitungen und Negativbeispiele bleiben
unveröffentlicht. Positive Entscheidungen werden persistent wiederverwendet.
Negative Entscheidungen nach einer echten TMDB-Suche gelten sieben Tage und
werden danach neu geprüft; ein früheres rein lokales `kein Treffer` blockiert
keine spätere TMDB-Suche.

## Anfrageverhalten und Wiederaufnahme

Programmdetails werden einzeln und mit demselben zentralen Single-Flight-Lock
wie der Grid-Sync geladen. Der Standard bleibt bewusst moderat:

- eine aktive Waipu-Anfrage;
- 500 ms Mindestabstand plus bis zu 150 ms Jitter;
- 300 tatsächlich gestartete Requests je Lauf;
- höchstens drei Retries bei Netzfehlern oder 5xx;
- sofortiger Abbruch bei 403 oder 429.

Ein `403` öffnet einen persistenten manuellen Circuit. Ein `429` speichert
`Retry-After` beziehungsweise standardmäßig eine zweistündige Sperre. Der
Status liegt in `artifacts/waipu-live/detail-status.json`; ein bewusst geprüfter
manueller Neustart ist mit `--reset-circuit` möglich.

Bereits geladene Programmdetails kosten in Folgeläufen keinen Request. Ein Lauf
mit erreichtem Budget füllt daher nur den unveränderlichen Cache weiter; ein
unvollständiger Katalog wird dabei nie veröffentlicht. Für einen späteren
zweistündigen Zeitplan kann derselbe Befehl wiederholt ausgeführt werden. Erst
nach weiteren stabilen Beobachtungen sollte `WAIPU_DETAIL_PACE_MS` bis zum
eingebauten Minimum von 350 ms reduziert werden; Parallelität bleibt 1.

Die TMDB-Suche läuft ebenfalls seriell, standardmäßig mit 250 ms Abstand und
einem Budget von 100 Requests. Ein erschöpftes Budget bricht die Generation ab,
statt einen scheinbar vollständigen Teilbestand zu veröffentlichen.

## Ausführung

Nur vorhandene Cache-Daten prüfen und daraus publizieren:

```bash
npm run waipu:catalog
```

Fehlende öffentliche Waipu-Programmdetails kontrolliert nachladen:

```bash
WAIPU_CATALOG_LIVE=1 \
TMDB_API_READ_TOKEN=... \
npm run waipu:catalog -- --live
```

Optionale Grenzen:

```bash
WAIPU_DETAIL_REQUEST_BUDGET=300
WAIPU_DETAIL_PACE_MS=500
WAIPU_DETAIL_JITTER_MS=150
WAIPU_TMDB_REQUEST_BUDGET=100
WAIPU_TMDB_PACE_MS=250
```

Für einen bewusst begrenzten Funktionstest darf der Erzeuger ausschließlich
bereits lokal eindeutig auflösbare TMDB-Zuordnungen veröffentlichen. Offene,
mehrdeutige oder zu schwache Treffer bleiben dabei unsichtbar:

```bash
WAIPU_TEST_MODE=1 \
MOVIE_HUB_CATALOG_PATH=/path/to/catalog.json \
MOVIE_HUB_SEARCH_INDEX_PATH=/path/to/search-index.json \
WAIPU_LIVE_OUTPUT=public/waipu-live \
npm run waipu:catalog
```

Der Index kennzeichnet eine solche Generation mit `releaseChannel: "test"`.
Ohne `WAIPU_TEST_MODE=1` bleibt der strenge Produktionsmodus unverändert und
fordert für lokal ungeklärte Kandidaten weiterhin eine echte TMDB-Suche.

Im gemeinsamen täglichen Datenlauf ist `TMDB_API_READ_TOKEN` ausschließlich in
der vertrauenswürdigen GitHub-Umgebung vorhanden. Der Matcher verwendet zuerst
den frisch erzeugten Movie-Hub-Katalog und Suchindex. Nur danach fragt er für
noch offene Programme gedrosselt direkt bei TMDB an. Positive und negative
Entscheidungen werden persistent wiederverwendet; das Token gelangt weder in
die Web-App noch in die Android-App oder in die Katalogartefakte.

Die Ausgabe liegt unter `artifacts/waipu-live/current/`; Matchentscheidungen
liegen unter `artifacts/waipu-live/match-decisions.json`. Beide Pfade sind
bewusst nicht versioniert.

Vor jedem geplanten Refresh lädt `npm run waipu:restore` den letzten auf
Firebase vorhandenen und vollständig validierten Katalog. Er ist der
Rückfallstand, falls Grid-, Detail- oder TMDB-Aktualisierung fehlschlägt.

## Atomare Ausgabe

Eine Generation wird vollständig im Staging-Verzeichnis geschrieben und vor
dem Verzeichniswechsel validiert. Erst danach ersetzt sie atomar die vorige
Generation. Die Ausgabe besteht aus:

- `index.json`: Status, Horizont, Versionen, Zähler und Ausschlussmetriken;
- `stations.json`: kompakter Senderindex mit Logo-Template und verfügbaren
  Streamqualitäten, ohne ein nicht belegtes Bildformat zu erraten;
- `titles.json`: eindeutige TMDB-Titel mit allen Ausstrahlungen des aktuellen
  14-Tage-Fensters sowie der zum Erzeugungszeitpunkt nächsten Ausstrahlung;
- `stations/<stationId>.json`: zeitlich sortierte Ausstrahlungen je Sender.

Fehlende Programmdetails, fehlende Kandidatenquelle, ungültige Referenzen,
inkonsistente Zähler oder ein erschöpftes Requestbudget verhindern den
Verzeichniswechsel vollständig.

## App-Integration (#4F)

Die App lädt `/waipu-live/titles.json` unabhängig vom normalen TMDB-Katalog.
Fehlt die Datei, ist sie unvollständig oder nicht erreichbar, bleibt der
normale MovieHub-Katalog unverändert. Eine Waipu-Verfügbarkeit wird nur bei
exakter Übereinstimmung von Medientyp und TMDB-ID ergänzt. Bereits abgelaufene
Ausstrahlungen werden im Client verworfen; aus den verbleibenden Terminen rückt
der nächste automatisch nach.

Auf einer Posterkarte bleiben höchstens drei Anbieter-Badges sichtbar. Die
Reihenfolge ist fest:

1. Movie Hub, sofern für den Titel eigene Links oder Videos vorliegen;
2. waipu.tv, sofern mindestens eine aktive lineare Ausstrahlung vorliegt;
3. die übrigen Anbieter in ihrer bisherigen Reihenfolge.

Auf der Detailseite steht direkt unter der Beschreibung ein kompakter
Waipu-Abschnitt mit Datum, Uhrzeit und Sender des nächsten Termins. Weitere
Termine werden nur als Anzahl zusammengefasst. Der Waipu-Anbieterbutton öffnet
den allgemeinen Live-TV-Einstieg; Movie Hub behauptet keinen ungeprüften
titelspezifischen Deep Link. Wie bei allen Anbieterbuttons wird das Öffnen als
„gesehen“ markiert.

Für eine freigegebene Auslieferung kann der Erzeuger atomar direkt in den
Vite-Public-Bestand schreiben:

```bash
WAIPU_LIVE_OUTPUT=public/waipu-live npm run waipu:catalog
```

Die veröffentlichte Ausbaustufe umfasst die ersten 50 Einträge der offiziellen
Waipu-Senderreihenfolge. Der tägliche Workflow aktualisiert sie automatisiert;
ein fehlerhafter Teilbestand ersetzt niemals den letzten gültigen Katalog.

## TV-Registerkarte und Senderfilter (#4G)

Die Hauptnavigation enthält einen eigenen Reiter **TV**. Er lädt nach dem
kompakten Senderindex ausschließlich die Dateien der aktuell sichtbaren
Sender. Die Ladevorgänge sind auf vier gleichzeitige lokale Dateianfragen
begrenzt; geladene Senderdateien werden fünf Minuten im Client
zwischengespeichert. Das erzeugt keine zusätzlichen Waipu-Anfragen, weil die
App nur die bereits veröffentlichten Movie-Hub-Artefakte liest.

Ausstrahlungen werden in deutscher Ortszeit je Kalendertag gruppiert und
innerhalb eines Tages nach Startzeit und Sender sortiert. Jede Posterkarte
zeigt unten links Startzeit und Sender, behält rechts höchstens drei
Anbieter-Badges und öffnet dieselbe Film-/Seriendetailseite wie die übrigen
Katalogreihen. Abgelaufene Sendungen verschwinden anhand ihrer `stopTime`
automatisch. Eine Tagesreihe kann bis zu 150 zugeordnete Sendungen enthalten;
die bestehende Zeilenvirtualisierung verhindert, dass alle Reihen gleichzeitig
gerendert werden.

Auf der TV-Seite gibt es bewusst keine Senderauswahl. Alle im veröffentlichten
Senderindex vorhandenen Sender sind standardmäßig aktiv. Unter
**Einstellungen → Sichtbare TV-Sender** können sie kontoweit einzeln
ausgeblendet und mit Pfeiltasten umsortiert werden. Firestore speichert unter
`users/{uid}.waipuStationSettings` die ausgeschalteten IDs sowie die persönliche
`stationOrder` (Schema-Version 2). Neue, noch nicht in `stationOrder` enthaltene
Sender werden aktiviert am Ende der veröffentlichten Reihenfolge ergänzt.
Fehlen die öffentlichen Artefakte, bleibt die Funktion mit einem erklärenden
Leerzustand fehlertolerant.
