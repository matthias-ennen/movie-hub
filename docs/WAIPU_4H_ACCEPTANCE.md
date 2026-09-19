# Waipu-Live #4H – Stabilitäts- und Geräteabnahme

Stand: 19. September 2026

## Ziel und aktuelle Grenze

#4H schließt den technischen Waipu-Live-Ausbau nicht durch weitere Funktionen,
sondern durch belastbare Langzeitmessung, Geräteabnahme und ein getrenntes
Release-/Rechte-Gate ab. Die App-Oberfläche aus #4F/#4G ist veröffentlicht;
für die Geräteabnahme wird ein ausdrücklich als Testbestand gekennzeichneter
7-Sender-/14-Tage-Katalog ausgeliefert. Langzeitmessung und #112 blockieren
diesen Funktionstest nicht; sie bleiben Bedingungen für den späteren
regelmäßigen beziehungsweise erweiterten öffentlichen Betrieb.

## Begrenzter Testbestand vom 19.09.2026

- [x] `releaseChannel: test` im Statusindex;
- [x] sieben Pilotsender und 14-Tage-Horizont;
- [x] 107 eindeutig zugeordnete Titel und 1.018 Ausstrahlungen;
- [x] 1.297 Programmdetails verarbeitet;
- [x] ein upstream entfallenes Detail sicher ausgeschlossen;
- [x] 229 lokal nicht eindeutige Programme nicht geraten und nicht angezeigt;
- [x] keine direkten Waipu-Massenabrufe aus Smartphone, Tablet oder Fire TV.

## Automatisierter Betrieb der sieben Pilotsender

- [x] Waipu in den vorhandenen täglichen TMDB-/Firebase-Lauf integriert;
- [x] feste Workflow-Concurrency verhindert parallele produktive Importe;
- [x] Checkpoint, Grid-/Detailcache und Matchentscheidungen zwischen Läufen persistent;
- [x] letzter gültiger Firebase-Katalog wird vor dem Refresh validiert restauriert;
- [x] neue Generation ersetzt den Rückfallstand nur nach vollständiger Validierung;
- [x] 403/429 und technische Fehler behalten den letzten gültigen Katalog online;
- [x] fehlgeschlagener Waipu-Refresh wird nach dem Fallback sichtbar als Workflowfehler gemeldet;
- [ ] erster manueller End-to-End-Lauf des neuen GitHub-Workflows erfolgreich;

## Langzeitstabilität der 7-Sender-Stufe

| UTC-Tag | Ergebnis | Requests | Retries | 403/429 | Circuit |
| --- | --- | ---: | ---: | --- | --- |
| 18.09.2026 | vollständig | 275 im Abschlusslauf | 0 | keine | geschlossen |
| 19.09.2026 | vollständig | 44 | 0 | keine | geschlossen |

Aktueller Stand: **2/7**. Erst fünf weitere vollständige Läufe an fünf
verschiedenen UTC-Tagen dürfen die 7-Sender-Stufe freigeben. Mehrere Läufe am
selben UTC-Tag zählen technisch nur einmal.

Nach 7/7 erfolgt keine automatische Hochstufung. Parallelität 2 oder die
20-Sender-Stufe benötigen anschließend eine eigene bewusste Entscheidung.

## Automatisierte technische Prüfpunkte

- [x] genau eine aktive Waipu-Anfrage;
- [x] globaler Startabstand von mindestens 500 ms plus Jitter;
- [x] persistenter Checkpoint und ETag-/Cache-Wiederverwendung;
- [x] neue äußere Tagesfenster statt vollständigem Neuabruf;
- [x] sofortiger Stopp und persistenter Circuit bei 403;
- [x] `Retry-After` beziehungsweise Sperrzeit bei 429;
- [x] begrenzte Wiederholungen bei Netzfehlern und 5xx;
- [x] höchstens ein gezählter Stabilitätslauf je UTC-Tag;
- [x] keine automatische Stufen- oder Parallelitätserhöhung;
- [ ] 7/7 zeitlich getrennte stabile Läufe;
- [ ] Rollback/letzten gültigen Katalog mit finaler Veröffentlichungskette prüfen.

## Manuelle Geräteabnahme durch Matthias

Diese Punkte werden nicht durch CI oder Codex abgehakt. Sie werden erst nach
einer tatsächlichen Prüfung auf dem jeweiligen Gerät im GitHub-Issue bestätigt.

### Smartphone

- [ ] Reiter **TV** erscheint in der Hauptnavigation und bleibt auf schmalem
  Bildschirm vollständig bedienbar;
- [ ] Tagesreihen, Poster, Uhrzeit und Sender sind lesbar;
- [ ] Titelkarte öffnet die richtige Film-/Seriendetailseite;
- [ ] Sender lassen sich ausschließlich in den Einstellungen ausblenden;
- [ ] ausgeblendete Sender verschwinden nach der Rückkehr zum TV-Reiter;
- [ ] Neustart übernimmt dieselbe kontoweite Auswahl.

### Tablet

- [ ] Navigation und Tagesreihen nutzen den zusätzlichen Platz sinnvoll;
- [ ] horizontales Scrollen und Detailöffnung funktionieren;
- [ ] kontoweite Senderauswahl entspricht Smartphone und Fire TV;
- [ ] keine sichtbaren Layoutsprünge beim Laden der Senderdateien.

### Fire TV

- [ ] **TV** ist per D-Pad aus der Hauptnavigation erreichbar;
- [ ] Fokus bleibt in langen Tagesreihen sichtbar und ohne Sackgasse;
- [ ] Lazy Loading und Zeilenvirtualisierung bleiben bei schneller Navigation stabil;
- [ ] Uhrzeit, Sender und höchstens drei Anbieter-Badges überlagern sich nicht;
- [ ] Zurück-Navigation aus Detailseite und TV-Reiter ist korrekt;
- [ ] Sender-Schalter in den Einstellungen sind vollständig per D-Pad bedienbar;
- [ ] keine Abstürze oder auffällige Verzögerungen bei mehreren Tagesreihen.

## Gate für den regelmäßigen beziehungsweise erweiterten öffentlichen Betrieb

- [ ] Attribution, Nutzungsbedingungen und zulässiger Veröffentlichungsumfang
  der abgeleiteten Waipu-EPG-Daten in #112 klären;
- [ ] bestätigen, dass lineare Ausstrahlung nie als Waiputhek/VOD bezeichnet wird;
- [ ] bestätigen, dass der öffentliche Senderstamm keine persönliche
  Tarifverfügbarkeit behauptet;
- [ ] erst danach automatisiert, dauerhaft oder über die sieben Pilotsender
  hinaus ausliefern.

Bis alle drei Bereiche abgeschlossen sind, bleibt GitHub-Issue #4 offen.
