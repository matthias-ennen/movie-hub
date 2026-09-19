# Öffentlicher Waipu-Datenvertrag und Importstrategie

Stand: 18. September 2026

## Status und Zweck

Arbeitspaket #4B ist technisch abgeschlossen. Die ohne Anmeldung erreichbaren
Waipu-Endpunkte liefern einen reproduzierbaren 14-Tage-EPG-Datenbestand mit
ausreichenden Film-, Serien- und Programmdetailfeldern. Dieses Dokument ist die
technische Grundlage für #4C bis #4H.

Der öffentliche Basisweg benötigt kein Waipu-Konto, kein Passwort, keine
Geräteanmeldung und keine Access- oder Refresh-Token. Er umfasst ausschließlich
Senderkonfiguration, lineares EPG und Programmdetails. Waiputhek/VOD,
Live-Streaming, Aufnahmen, Replay, Tuner- und DRM-Funktionen bleiben
ausgeschlossen.

Die öffentliche Erreichbarkeit ist keine Stabilitäts-, Nutzungs- oder
Weiterveröffentlichungszusage. Öffentliche Auslieferung bleibt bis zur
API-/Rechte-/Attributionsprüfung und zum Compliance-Gate #112 gesperrt.

## Freigegebene Read-only-Endpunkte

- `https://web-proxy.waipu.tv/station-config`
- `https://epg-cache.waipu.tv/api/grid/info`
- `https://epg-cache.waipu.tv/api/grid/{stationId}/{utcSlot}`
- `https://epg-cache.waipu.tv/api/programs/{programId}`

Movie Hub erlaubt nur HTTPS und `GET`. Andere Hosts, Pfade, Query-Parameter,
Redirects, Methoden, Authorization-Header und Cookies werden blockiert. Der
Importer verwendet einen ehrlichen, stabilen User-Agent.

## Beobachteter Datenvertrag

### Senderstamm

Der Senderstamm enthielt am 18. September 2026 insgesamt 398 Einträge. Die
gemessenen Einträge lieferten insbesondere Sender-ID, Anzeigename,
Logo-Template und verfügbare Streamqualitäten. Der Senderstamm beweist nicht,
dass ein Sender in einem persönlichen Waipu-Paket freigeschaltet ist.

### Grid

Das EPG ist in sechs UTC-Slots je Tag aufgeteilt: `00`, `04`, `08`, `12`, `16`
und `20` Uhr. Ein Slot umfasst vier Stunden und kann an seinen Grenzen einzelne
überlappende Programme enthalten. Veröffentlichte 14-Tage-Daten werden deshalb
zusätzlich nach Programmstart auf den exakten Zielzeitraum gefiltert.

Beobachtete Grid-Felder:

- Programm-ID;
- Start- und Endzeit;
- Titel und Episodentitel;
- Hauptgenre;
- Vorschaubild;
- Serien-ID;
- Aufnahme-/Wiedergabeeinschränkungen.

### Programmdetail

Beobachtete Detailfelder:

- Titel und Originaltitel;
- Kurz- und Langbeschreibung;
- Haupt- und Untergenres;
- Produktionsjahr und Produktionsländer;
- Staffel, Folge und Episodentitel;
- Bilder;
- Altersfreigabe;
- weitere strukturierte Produktions- und Einschränkungsfelder.

## Cache- und HTTP-Verhalten

- Senderstamm: `Cache-Control: max-age=300`, `ETag`, `Last-Modified`;
- Grid und Programmdetail: `Cache-Control: max-age=600,
  stale-while-revalidate=600`, `ETag`;
- bedingte Sender- und Grid-Abrufe lieferten `304 Not Modified`;
- erfolgreiche Antworten enthielten keine veröffentlichten
  `RateLimit-*`-, `X-RateLimit-*`- oder `Retry-After`-Grenzen.

Ein `304` spart Übertragungsvolumen, aber keinen Request. Abgeschlossene Slots
werden deshalb nach ihrer letzten erfolgreichen Validierung eingefroren und
nicht erneut angefragt. ETags werden für Senderstamm und noch veränderliche
Zukunftsslots verwendet.

## Kontrollierte technische Nachweise

### Kleine Vertragsprobe

Die automatisierte Vertragsprobe bleibt absichtlich klein und konservativ:

- genau eine Anfrage gleichzeitig;
- Standardpause 1.000 ms plus bis zu 250 ms Jitter;
- höchstens 20 Requests;
- drei repräsentative Senderklassen;
- je ein Grid-Fenster für Tag 0, 7 und 14;
- höchstens zwei Programmdetails;
- ETag-/304-Prüfung für Senderstamm und Grid.

Der gemessene Lauf verwendete 15 Requests. Er bestätigte 398 Sender, 9/9
Grid-Fenster, 71 Programme, 2/2 Details, 13 Antworten mit HTTP 200 und zwei
Antworten mit HTTP 304. Es trat kein 403, 429 oder 5xx auf.

### Vollständiger Sieben-Sender-/14-Tage-Nachweis

Geprüfter UTC-Zeitraum: 18. September 2026 00:00 bis 2. Oktober 2026 00:00,
Ende exklusiv. Für Das Erste, ZDF, RTL, SAT.1, ProSieben, VOX und Kabel Eins
wurden alle sechs Vier-Stunden-Slots an 14 Kalendertagen gelesen.

| Sender | Grid-Slots | eindeutige Programme | Film-Kandidaten | Serien-Kandidaten |
| --- | ---: | ---: | ---: | ---: |
| Das Erste | 84/84 | 496 | 17 | 99 |
| ZDF | 84/84 | 452 | 12 | 131 |
| RTL | 84/84 | 322 | 0 | 140 |
| SAT.1 | 84/84 | 309 | 15 | 119 |
| ProSieben | 84/84 | 486 | 11 | 331 |
| VOX | 84/84 | 356 | 6 | 159 |
| Kabel Eins | 84/84 | 353 | 22 | 238 |
| **Gesamt** | **588/588** | **2.774** | **83** | **1.217** |

Alle Slots waren nicht leer und jeder Sender lieferte Programme an allen 14
Tagen. Bei RTL war im konkreten Zeitraum kein Eintrag mit Hauptgenre `Filme`
vorhanden; das ist ein Programminhaltsergebnis und kein Schemafehler.

Es wurden 13 reale Programmdetails geprüft: sechs Filme und sieben Serien.
Alle 13 enthielten Titel, Originaltitel, Langbeschreibung, Haupt-/Untergenres,
Produktionsjahr, Produktionsländer, Bilder und Altersfreigabe. Neun enthielten
zusätzlich eine Kurzbeschreibung. Alle sieben Serienbeispiele enthielten
Staffel- und Folgennummer.

Die ersten 170 Grid-Abrufe liefen seriell mit mindestens 1.000 ms Pause plus
Jitter. Danach wurde kontrolliert auf 500 ms plus Jitter reduziert; es blieb
bei einer Anfrage gleichzeitig. Der gesamte Lauf blieb ohne 403, 429, 5xx und
Schemaabbruch. Dies belegt die 500-ms-Stufe für den Pilotumfang, ist aber keine
Zusage für unbegrenzte Last oder dauerhafte Verfügbarkeit.

## Film-/Serienklassifikation und TMDB-Zuordnung

`genre = Filme` und `genre = Serien` erlauben eine direkte Vorfilterung.
Nachrichten, Sport, Magazine, Teleshopping und andere Hauptgenres werden vor
dem Detailabruf ausgeschlossen. Waipus Kategorie `Serien` umfasst jedoch auch
Gerichtsshows, Doku-Soaps und Dokutainment. Sie ist deshalb kein ausreichender
Beweis für eine sichtbare fiktionale TMDB-Serie.

Der reale Abgleich der 13 Detailbeispiele fand zehn Titel bereits eindeutig im
aktuellen Movie-Hub-Suchindex, unter anderem:

| Waipu-Titel | TMDB-Typ und ID |
| --- | --- |
| The Man from Toronto | Film 667739 |
| Jurassic World: Das gefallene Königreich | Film 351286 |
| Venom: Let There Be Carnage | Film 580489 |
| Godzilla (2014) | Film 124905 |
| Midway – Für die Freiheit | Film 522162 |
| Mankells Wallander / Wallander | Serie 7263 |
| Auckland Detectives / The Gulf | Serie 92957 |
| Richter Alexander Hold | Serie 88971 |
| CSI: New York / CSI: NY | Serie 2458 |
| Rosins Restaurants | Serie 62642 |

Der Matcher arbeitet zweistufig:

1. vorhandenen Movie-Hub-Katalog und Suchindex verwenden;
2. nur offene Film-/Serienkandidaten gedrosselt über die TMDB-Suche auflösen.

Filme werden nur gegen TMDB-Filme, Serien nur gegen TMDB-Serien gesucht.
Titel und Originaltitel sind Hauptsignale. Bei Filmen sind Jahr und Land starke
Zusatzsignale. Bei Serien ist das Waipu-Produktionsjahr nur ein schwaches
Signal, weil es häufig das Jahr der konkreten Episode und nicht das
Erstausstrahlungsjahr der Serie bezeichnet. Staffel, Folge und Episodentitel
dienen als Plausibilisierung.

Ein Treffer wird nur oberhalb eines Mindestwerts und mit ausreichendem Abstand
zum zweitbesten Kandidaten übernommen. Mehrdeutige, ungeeignete oder nicht
gefundene Programme bleiben unsichtbar. Die kanonische Identität lautet
`Medientyp + TMDB-ID`.

## Requestkosten

Die folgende Matrix enthält nur Grid-Requests für exakt 14 Kalendertage.
Programmdetails kommen nach der Film-/Serienvorfilterung hinzu, werden aber je
Programm-ID dedupliziert und persistent gecacht.

| Sender | Erstbestand: 14 Tage × 6 Slots | ein neuer äußerer Tag | zwei Tage nachholen |
| ---: | ---: | ---: | ---: |
| 5 | 420 | 30 | 60 |
| 7 | 588 | 42 | 84 |
| 20 | 1.680 | 120 | 240 |
| 50 | 4.200 | 300 | 600 |
| 398 | 33.432 | 2.388 | 4.776 |

Der vollständige 398-Sender-Erstaufbau wird nicht als kurzer Einzellauf
behandelt. Er arbeitet checkpoint-basiert über mehrere Wartungsfenster. Im
Normalbetrieb entsteht täglich nur der neue äußere Tag. Selbst ein
Zwei-Tage-Nachlauf kann bei niedriger Last bequem über ein zweistündiges
Wartungsfenster verteilt werden.

## Umgesetzter #4C-Unterbau und adaptive Produktionsstrategie für #4D

#4C stellt den tokenfreien Read-only-Client, defensive Normalisierung und
den schema-versionierten, atomar geschriebenen Dateicache bereit. Abgeschlossene
Slots werden ohne Folgeabruf eingefroren; Zukunftsslots nutzen ETag beziehungsweise
Last-Modified. Programmdetails werden persistent und pro ID dedupliziert.

### Gemeinsame Schutzgrenzen

- genau ein zentraler Importjob;
- CI-/Scheduler-Single-Flight: keine überlappenden produktiven Läufe;
- globaler Starttakt statt unabhängiger Bursts je Worker;
- harte Budgets je Lauf und Ausbaustufe;
- persistente Checkpoints nach Sender und Slot;
- Programmdetails je Programm-ID deduplizieren;
- letzter gültiger Katalog bleibt bei jedem Fehler online;
- keine IP-Rotation, Proxy-Wechsel oder Header-Tarnung.

### Stufe A – belegter Startwert

- höchstens eine aktive Anfrage;
- global 500 bis 650 ms Mindestabstand inklusive Jitter;
- zunächst 7, danach 20 und 50 Sender;
- jede Ausbaustufe muss sieben geplante Läufe ohne 403, 429, auffällige
  Fehlerquote oder Schemaabbruch bestehen.

Diese Stufe entspricht der erfolgreich gemessenen Belastungsordnung. Der kleine
Vertragsprüfer bleibt unabhängig davon bei seinem konservativen 1.000-ms-
Standard.

### Stufe B – optionale Beschleunigung

Erst nach sieben stabilen geplanten Läufen einer Ausbaustufe darf der Importer
auf höchstens zwei gleichzeitig aktive Anfragen hochgestuft werden. Auch dann
gilt ein globaler Startabstand von mindestens 350 bis 500 ms plus Jitter. Die
zweite Verbindung gleicht hauptsächlich Antwortlatenz aus; sie darf keinen
unkontrollierten Burst erzeugen.

Die Hochstufung ist eine eigene, messbare Freigabe. 403, 429, steigende
Fehlerquote, auffällige Latenz oder Schemaänderungen setzen sie zurück.

### Rollierende Aktualisierung

1. Fehlende Sender-/Slot-Kombinationen aus dem Checkpoint bestimmen.
2. Initialen 14-Tage-Bestand stufenweise aufbauen.
3. Danach täglich sechs neue äußere Slots je freigegebenem Sender ergänzen.
4. Nach einem ausgefallenen Lauf nur die fehlenden ein oder zwei Tage
   nachholen, nicht den Gesamtbestand neu laden.
5. Abgeschlossene Vergangenheit einfrieren.
6. Noch veränderliche nahe Zukunft mit ETag und festem Budget kontrolliert
   erneut validieren.
7. Detaildaten nur für neue, eindeutige Film-/Serienkandidaten laden.
8. TMDB-Zuordnungen und negative Entscheidungen versioniert wiederverwenden.
9. Neue Generation im Staging vollständig prüfen und erst dann atomar
   veröffentlichen.

Eine geplante Ausführung darf ihre Requests über bis zu zwei Stunden verteilen.
Dadurch bleibt die Last gleichmäßig, während der tägliche äußere Horizont und
ein möglicher Zwei-Tage-Nachlauf rechtzeitig fertig werden. Die App selbst
erzeugt niemals EPG-Massenrequests.

## Abbruch- und Fehlerverhalten

- `403`: Lauf sofort abbrechen und automatische Folgeausführung deaktivieren,
  bis die Ursache manuell geprüft wurde;
- `429`: `Retry-After` respektieren; ohne Header Lauf sofort abbrechen und
  frühestens im nächsten geplanten Wartungsfenster fortsetzen;
- Timeout/`5xx`: im späteren Produktionsimport höchstens drei Wiederholungen
  mit exponentiellem Backoff und Jitter; danach letzten gültigen Stand behalten;
- ungültiges JSON, Größenlimit oder Schemaänderung: Fail-Closed, nichts
  veröffentlichen;
- Requestbudget erreicht: Checkpoint speichern und im nächsten geplanten Lauf
  fortsetzen.

Die kleine Vertragsprobe verwendet bei `5xx` weiterhin bewusst keinen
Live-Retry; ihre Fehlerpfade werden mit lokalen Fixtures geprüft.

## Geplante Artefakte

- `waipu-live/index.json`: Schema-Version, Datenstand, Horizont, Zähler und
  Importstatus;
- `waipu-live/stations.json`: bereinigte Sender-IDs, Namen und Logos;
- `waipu-live/titles.json`: TMDB-Zuordnung und nächste Ausstrahlung für Badge
  und Detailansicht;
- `waipu-live/stations/{stationId}.json`: chronologische Film-/Serien-
  ausstrahlungen für die TV-Registerkarte.

Die App lädt für Badge und Detailansicht nur die kompakte Titelübersicht. Im
TV-Reiter lädt sie zusätzlich Index, Senderverzeichnis und ausschließlich die
Dateien der in den kontoweiten Einstellungen aktiven Sender; diese Dateien
werden clientseitig gecacht. Alle Sender sind standardmäßig aktiv, die
TV-Seite selbst enthält keine Senderauswahl. Abgelaufene Ausstrahlungen werden
zusätzlich beim Lesen über `stopTime <= now` ausgeblendet.

## Lokale Vertragsprüfung

```bash
npm run test:waipu:public
```

Der kleine kontrollierte Live-Lauf bleibt eine separate bewusste Aktion:

```bash
npm run waipu:probe
```

Der Adapter- und Cache-Unterbau ist in #4C implementiert. Der produktive,
checkpoint-basierte und budgetierte Import folgt getrennt in #4D.
