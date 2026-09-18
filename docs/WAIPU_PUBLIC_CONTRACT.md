# Öffentlicher Waipu-Datenvertrag – kontrollierter Prüfstand

Stand: 18. September 2026

## Zweck

Das Arbeitspaket #4B prüft ausschließlich, ob die ohne Anmeldung erreichbaren
Waipu-Endpunkte einen reproduzierbaren technischen Datenvertrag für den späteren
Waipu-Live-Katalog liefern. Es erzeugt weder einen sichtbaren Katalog noch eine
APK und ist ausdrücklich kein Stress-, Last- oder Grenztest.

## Freigegebene Endpunkte

- `https://web-proxy.waipu.tv/station-config`
- `https://epg-cache.waipu.tv/api/grid/info`
- `https://epg-cache.waipu.tv/api/grid/{stationId}/{utcSlot}`
- `https://epg-cache.waipu.tv/api/programs/{programId}`

Der Runner blockiert andere Hosts, Pfade, Query-Parameter, unverschlüsselte
Verbindungen und alle Methoden außer `GET`. Er sendet weder Authorization- noch
Cookie-Header.

## Verbindliche Lastgrenzen

Ein normaler Prüflauf verwendet:

- genau einen seriellen Request zur Zeit;
- mindestens 1.000 Millisekunden Pause plus bis zu 250 Millisekunden Jitter;
- höchstens 20 Requests insgesamt;
- drei repräsentative Senderklassen;
- je ein Vier-Stunden-Fenster für Tag 0, 7 und 14;
- höchstens zwei Programmdetails, möglichst ein Film und eine Serie;
- je höchstens einen bedingten ETag-Wiederholungsabruf für Senderstamm und Grid.

Der erwartete Normalumfang liegt bei 15 Requests. Es werden keine parallelen
Läufe, keine Retry-Schleifen und kein vollständiger Abruf aller Sender
ausgeführt. Fehlerpfade werden ausschließlich mit lokalen Testantworten geprüft.

## Abbruchverhalten

- `403`: sofortiger Abbruch; keine automatische Fortsetzung;
- `429`: sofortiger Abbruch; `Retry-After` wird nur dokumentiert;
- `5xx`: sofortiger Abbruch ohne Live-Retry;
- Requestbudget erreicht: Abbruch vor dem nächsten Netzwerkaufruf;
- zu große, ungültige oder schemafremde Antwort: Fail-Closed-Abbruch.

IP-Rotation, Proxy-Wechsel, Header-Tarnung oder andere Umgehungsversuche sind
ausgeschlossen.

## Bericht und Datenschutz

Der Bericht enthält Zähler, Feldnamen, Schema-Hashes, Cache-Header-Fakten,
Requestkosten und die öffentlichen Stichprobensender. Programmtitel,
Program-IDs und vollständige API-Antworten werden nicht gespeichert.

Standardpfad:

`artifacts/waipu-public-contract/report.json`

## Ausführung

Zuerst werden ausschließlich die lokalen Tests ausgeführt:

```bash
npm run test:waipu:public
```

Der kontrollierte Live-Lauf ist eine separate, bewusste Aktion:

```bash
npm run waipu:probe
```

Umgebungswerte können das Requestbudget höchstens auf 20 und die Pause nur nach
oben beziehungsweise bis zur festen Untergrenze von 750 Millisekunden verändern.
Der Produktivstandard bleibt bei 1.000 Millisekunden plus Jitter.

## Requestmatrix ohne Live-Last

Die Skalierung wird rein rechnerisch bestimmt:

| Sender | Erstbestand: 16 Tage × 6 Slots | Neuer äußerer Tagesslot |
|---:|---:|---:|
| 5 | 480 | 30 |
| 20 | 1.920 | 120 |
| 50 | 4.800 | 300 |
| 398 | 38.208 | 2.388 |

Programmdetails sind darin nicht enthalten. Sie müssen später nach
Film-/Serienvorfilterung dedupliziert und persistent gecacht werden. Ein
Vollbestand wird deshalb nicht in einem Lauf aufgebaut.

## Kontrollierter Live-Nachweis vom 18. September 2026

Der einmalige Lauf wurde mit den oben festgelegten Standardgrenzen ausgeführt:

- 15 von maximal 20 Requests;
- Parallelität 1;
- 1.000 Millisekunden Mindestpause plus Jitter;
- 398 Sender im öffentlichen Senderstamm;
- Stichprobe: Das Erste, RTL und phoenix;
- 9 von 9 Grid-Fenstern für Tag 0, 7 und 14 erfolgreich;
- 71 Programme innerhalb der neun Vier-Stunden-Fenster;
- 2 von 2 ausgewählten Programmdetails erfolgreich;
- 13 Antworten mit HTTP 200 und 2 bedingte Antworten mit HTTP 304;
- rund 369 KB Antwortdaten;
- kein HTTP 403, 429 oder 5xx;
- keine Zugangsdaten, Token oder Authorization-Header.

Senderstamm und Grid bestätigten ETag/304. Der Senderstamm meldete
`max-age=300`; Grid und Grid-Info meldeten
`max-age=600, stale-while-revalidate=600`.

Der Lauf bestätigte ein Seriendetail. In der bewusst kleinen Stichprobe wurde
kein Grid-Eintrag eindeutig als Film klassifiziert, daher bleibt der
Film-Detailnachweis offen. Es wurde unmittelbar danach kein zweiter Lauf und
keine größere Stichprobe gestartet. Dieser einzelne offene Prüfpunkt wird erst
in einem späteren kontrollierten Lauf oder anhand eines gezielt bereits im EPG
gefundenen Filmkandidaten geschlossen.
