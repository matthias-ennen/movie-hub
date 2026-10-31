# Fundamenthärtung #703 – Start, TV-Laufzeit und Navigation

Stand: 31.10.2026. Die gemeinsame Rendering-Nachbesserung baut auf #705
(`00317dfbf8a6afee8fb92a253cb03260c15b2fc5`) und der Erstrunde #704 auf. Sie ersetzt den
vorherigen Zwischenstand dieses Dokuments; die Historie bleibt im Git-Verlauf.
#703 und der ergänzende Navigations-Messauftrag #386 bleiben für die reale
Fire-TV-Abnahme offen.

## Startreihenfolge und Fehlerfälle

1. Der öffentliche Katalog beginnt bereits parallel zur Anmeldung und
   Profilauswahl. Ein geteilter Request und ein fünf Minuten gültiger Cache
   vermeiden doppelte Downloads; es werden keine persönlichen Daten vorgezogen.
2. Profil, Darstellung und Anbieterauswahl bestimmen die erste Home-Ansicht.
   Home meldet Bereitschaft erst nach der anfänglichen Katalogaufbereitung,
   den wesentlichen Einstellungen und dem vorhandenen Hero-/Reihen-Handshake.
3. Erst danach beginnen Live-Verfügbarkeit, optionale YouTube-Ergänzungen,
   verifizierte YouTube-Laufzeitdaten und die verschobenen Metadatenreparaturen.
   Reparaturen laufen höchstens zu zweit; maximal 20 Aufträge warten.
4. TV bleibt lazy und Hero-first: Senderverzeichnisse, Index und genau der
   gewählte Tag folgen auf den Hero. Die 14-Tage-Summary lädt bei ihrer Auswahl.

Der öffentliche Katalog hat drei Versuche mit jeweils sieben Sekunden inklusive
Body-Verarbeitung und 0,5/1 Sekunde Abstand: höchstens 22,5 Sekunden Netzwerkbudget.
Das ist keine Garantie für die gesamte Startdauer: Profil-/Renderarbeit und
Gerätelast sind zusätzliche Faktoren. Ein erschöpfter Katalogpfad zeigt einen
sichtbaren Fehlerhinweis und den lokalen Ersatzkatalog, soweit die gewählten
Anbieter ihn zulassen; Navigation und native Bereitschaft funktionieren weiter.
Die Anmeldung erhält nach zwölf Sekunden einen Fehlerzustand, Profil-Lesezugriffe
und der erste Anbieter-Snapshot nach acht Sekunden. Spätere gültige Anmeldung
beziehungsweise Anbieter-Snapshots dürfen sich erholen.

TV-Hero, Index, Tage, Summary, Live-Index und Senderverzeichnisse verwenden
abbrechbare, auf zehn Sekunden begrenzte JSON-Requests. Fehler lösen keine
statusgetriebene Endlosschleife aus. Eine bestehende gültige Ansicht bleibt bei
einem fehlgeschlagenen Hintergrundrefresh sichtbar. Manuelles erneutes Öffnen
oder der nächste geplante Refresh kann erneut laden. Die nativen fünf Sekunden
Mindestintro und der vorhandene 30-Sekunden-Watchdog bleiben unverändert.

## Zeitmodell und inkrementelle Aufbereitung

- Eine gemeinsame Deadline-Uhr verwaltet einen aktiven Timer. Nur fällige
  Abonnenten erhalten einen neuen Snapshot; gleichzeitige Übergänge verwenden
  denselben Zeitwert. Im Hintergrund pausiert der Timer, bei Rückkehr wird
  nachgezogen. Doppelte Foreground-Ereignisse werden zusammengefasst.
- Tagesprogramm und Hero berücksichtigen ihre Sendezeiten. Die 14-Tage-Summary
  registriert eigene Optionen auch ohne geladenen Tag. Ihre bestehende
  Ein-Stunden-BALD-Regel und die Zwei-Stunden-Regel des Tagesprogramms bleiben
  fachlich unverändert.
- Die Heute-Auswahl folgt der nächsten TV-Tagesgrenze um 06:00 Europe/Berlin,
  auch über Sommer-/Winterzeit. Eine bewusst gewählte gültige Zukunftsauswahl
  bleibt erhalten. Ungültig gewordene Tage werden kontrolliert ersetzt.
- Aktive TV-/Live-Ressourcen werden nach fünf Minuten, nach mindestens
  30 Sekunden seit dem letzten Refresh auch bei Foreground-Rückkehr, erneuert.
  Index, Hero und Summary haben begrenzte Cachegültigkeit. Tages-Shards bleiben
  auf drei Generation/Tag-Schlüssel begrenzt.
- Ein Tages-Shard muss zur angeforderten Indexgeneration passen. Bei Wechsel
  gibt es genau einen frischen Index und einen erneuten Tagesabruf. Ein weiterer
  Konflikt beendet den Versuch. Ein abweichender Hero wird einmal je
  Generationspaar abgeglichen; die separat publizierte Summary besitzt bewusst
  keinen Gleichheitszwang zu diesen Generationen.
- Unveränderte Live-Einträge, Karten und Reihen behalten ihre Referenzen.
  Sendezeit-/Genreklassifikation wird wiederverwendet. Reine Flagwechsel können
  Karten in den bestehenden Reihen ersetzen, ohne erneut zu sortieren.
- Große Karten-/Live-Merges und Präsentationsschritte geben den Hauptthread
  kooperativ frei. Das Zielbudget beträgt acht Millisekunden, geprüft nach je
  16 Einträgen; ein einzelner teurer Schritt oder GC kann es überschreiten.
  Ergebnisse werden vollständig übernommen; abgebrochene oder überholte Arbeit
  wird nicht angezeigt. Profil-/Anbieterwechsel bekommen einen eigenen Scope.

Die initiale Sortierung, Reihenbildung, JSON-Verarbeitung, React-Commits und
Bilddecodes sind damit nicht pauschal kostenfrei oder vollständig ausgelagert.
Ein Worker wurde nicht eingeführt: zunächst greifen Cache, inkrementelle Updates
und kooperative Verarbeitung. Ein Geräte-Trace kann weiteren Bedarf belegen.

## Navigation, Bilder und Kontogrenzen

Poster und Reihen sind memoisiert. Fokusanker speichern Titel- und Reihen-ID
sowie einen Nachbarindex. Einfügungen erhalten den fokussierten Titel und seine
horizontale Position; entfernte Titel/Reihen erhalten einen erreichbaren
Nachfolger. Detailrückkehr kann den Anker auch nach einem Zeitwechsel oder
Virtualisierung wiederherstellen. Änderungen stehlen keinen Fokus von anderen
Bedienelementen. Scroll-/Fokusimpulse erweitern Poster höchstens einmal pro Frame.
TV und Verlauf verwenden jetzt wie Standardreihen ein anfängliches 12er-Fenster
und 12er-Erweiterungen; die fachlichen Obergrenzen 150/100/50 bleiben erhalten.
Vertikaler Overscan ist eine Reihe. Neue virtuelle Reihen werden einzeln über
Frames zugelassen; D-Pad und Fokuswiederherstellung können weiter nachladen.

Eine gemeinsame Bildzulassung begrenzt echte Poster-, Hero- und Detailbilder
einschließlich spekulativem Vorladen auf zwei aktive Lade-/Decode-Aufträge.
Poster erhalten ihre Quelle erst in Viewportnähe (120 px) oder bei Fokus.
Hero/Details haben Vorrang vor wartenden Postern und können spekulative Aufträge
verdrängen. Der Slot bleibt bis nach `decode()` belegt; ein aktiver Auftrag läuft
höchstens zehn Sekunden. Detailvorbereitung behält ihr kürzeres 1,5-s-Budget.
Unmount/Quellwechsel entfernt wartende Aufträge und bricht aktive Transporte
bestmöglich ab; späte Decode-Ergebnisse werden ignoriert. Das ist keine harte
Obergrenze für den internen Browser-/GPU-Bildcache oder alle Bilder der App.

Das spekulative Posterfenster behält zusätzlich höchstens zwei angemeldete und
24 wartende Bilder, acht Reihenbesitzer und 256 erfolgreiche Cacheeinträge.
Hero-Vorladen merkt höchstens 64 erfolgreiche Quellen. Fehlgeschlagene Bilder
gelten nicht als erfolgreich vorgeladen. Die Suche nutzt denselben progressiven
12er-Grid-Aufbau und setzt das Fenster bei neuem Suchtext zurück.
D-Pad-Geometrie wird innerhalb eines Navigationsschritts wiederverwendet.

Identische Einstellungen erzeugen keine neuen Auswahllisten. Persönliche
Bibliotheksdaten werden nur für den tatsächlich geladenen Konto-/Profil-Scope
freigegeben; verspätete Rollbacks dürfen den neuen Scope nicht verändern.
Metadaten-Reparaturen prüfen die Kontoidentität vor Übernahme und Speicherung;
wartende Arbeit wird beim Kontowechsel/Unmount geleert.

## Nachweise und Grenzen

- Anlass der Nachbesserung: gemeldeter zuverlässiger Fire-TV-Abbruch kurz nach
  TV-Hero/Fokus. Ohne Gerätelog ist weder ein Speicherabbruch noch ein nativer
  Crash als Ursache bewiesen. Im Browser reproduziert: anfänglich 90 Karten
  (3 × 30) und ein veraltetes `no-hero`-Signal, das trotz später vorhandenem,
  noch ladendem Hero bereits Poster freigab. Beide Mechanismen existierten
  bereits vor #705; keine daraus abgeleitete Behauptung einer neuen Regression.
- Hero-Freigabe wird jetzt am aktuellen Hero und dessen Datenbereitschaft
  entschieden. Es wird kein frühes Leersignal zwischengespeichert. Der bestehende
  1,6-s-Bild-Fallback beginnt erst nach Datenbereitschaft; defekte oder ausbleibende
  Bilder dürfen die Seite weiterhin nicht dauerhaft blockieren.
- Produktionsbuild und vollständige Anwendungstests; endgültige Prüfergebnisse
  stehen zusätzlich in der zugehörigen Pull-Request- und Issue-Dokumentation.
- `npm run test:startup:browser`: echte App, Hero, Reihen und native Bereitschaft
  mit synthetischen Kontodiensten. Verspätete, hängende und fehlerhafte optionale
  Ergänzung; verzögerte Anbietereinstellungen; fehlender Hauptkatalog;
  ausbleibende Anmeldung. Keine produktiven Konten oder Dienste.
- `npm run test:runtime:browser`: echte TV-Lade-/Zeit-/Modelllogik mit reduzierter
  Testansicht; HTTP-503 ohne Request-Schleife, Summary-Zeitwechsel ohne Tagesdaten,
  Tageszeitwechsel, überholte Tagesantworten und 06:00-Wechsel. Reale
  Poster-/Reihen-/D-Pad-Komponenten prüfen ID-Erhalt, Nachbarfokus, Detailanker,
  verschwundene Reihen und lange Posterfenster.
- `npm run test:rendering:browser`: echter TV-Feature-/View-/Hero-/Reihen-/Posterpfad
  mit 200 synthetischen Titeln und echter App-CSS; verzögertes Hero-JSON und Bild,
  Tag erst nach Hero, erste 12 Karten, höchstens zwei tatsächliche gleichzeitige
  Bildrequests, Hero-Fokus. Zusätzlich derselbe gemeinsame Seitenrahmen für alle
  fünf Seitenkennungen, echte Suche sowie Bildquellwechsel/Unmount mit verspäteten
  Antworten. Kontodienste und Netzwerk sind synthetisch; kein Fire-TV-Emulator.
- Unit-Tests prüfen Modellparität, Abbruch, Referenzerhalt, DST, Hintergrund/
  Foreground, rückwärts verstellte Uhr, Generationskonflikte, Ressourcenlimits,
  Transport-Timeouts und öffentlichen Preload mit unabhängigem Abbruch.
- Lokaler Vergleich mit #704: 3.000 synthetische Ausstrahlungen, fünf Messungen
  nach drei Aufwärmrunden, unveränderte Inhalte bei fortschreitender Uhr.
  Median 65,9 ms vorher gegenüber 7,4 ms jetzt, inklusive kooperativer Wartezeit.
  Vorher 0/3.000 Karten und 0/6 Reihen wiederverwendet; jetzt 3.000/3.000 und 6/6,
  bei vollständig identischem Modellinhalt. Initialaufbereitung 137 ms inklusive
  Freigaben; längster gemessener Kartenvorbereitungsschritt 16,9 ms. Diese
  Rechner-/Fixturewerte ersetzen keine Fire-TV-Messung oder Gerätegarantie.
- Lokal Node 24: `NODE_OPTIONS=--test-reporter=tap npm run test:unit`, weil ältere
  Wrapper das TAP-Ausgabeformat prüfen. CI verwendet Node 22; keine Lockerung
  dieser Assertions oder Änderung der bestehenden Produktionsworkflows.

## Diagnose und Geräteabnahme

```js
window.__movieHubPerformance.snapshot()
```

| Ereignis | Bedeutung |
|---|---|
| `startup:home-ready` | Web-Inhalt bereit; nicht Ende des nativen Intros |
| `catalog:youtube-companion:start/ready` | optionale Nachladephase |
| `runtime:clock` | Deadline-/Foreground-Aktualisierung |
| `runtime:work` | Eintragszahl, aktive Arbeitszeit, längster Teilabschnitt, Freigaben |
| `live:catalog-merge:ready` | vollständige asynchrone Live-Aufbereitung |
| `tv:view-model:ready` | Runtime-Schedule nach Datenabruf |
| `tv:rows-model:ready`, `tv:summary-rows:ready` | vollständige asynchrone Reihenaufbereitung |
| `tv:rows-committed`, `tv:rows-frame` | React-Commit und zwei folgende Frames |
| `poster:batch`, `poster:prefetch` | Posterfenster und begrenzte Bildwarteschlange |
| `rows:admit`, `images:budget` | schrittweise Reihenfreigabe und gemeinsame Bildlast |
| `navigation:focus`, `navigation:frame` | D-Pad-Arbeit und Weg zum nächsten Frame |
| `main-thread:long-task` | Long-Task-Dauer, falls unterstützt |

Asynchrone Modelldauern enthalten Wartezeiten zwischen Arbeitsabschnitten;
`runtime:work` misst nur die abgeteilte Kartenarbeit und nicht nachfolgende
Sortierung, Commit oder Bilddecode. Der Ring enthält maximal 200 Ereignisse,
keine Nutzer-/Titelobjekte und keine serverseitige Diagnoseübertragung.

Die neue native APK speichert bei `onRenderProcessGone` genau den letzten
Renderer-Ausfall lokal: Zeitpunkt, `didCrash`, Rendererpriorität, WebView-Version,
Android-API und APK-Build. **Über diese App → Laufzeitdiagnose** zeigt Laufzeit und
letzten Ausfall; Logcat verwendet `web_renderer_gone`. Ein vom System beendeter
Renderer ist damit von `didCrash=true` unterscheidbar, aber noch kein Beweis für
eine konkrete Speicherursache. Gesamte Prozessabbrüche/ANRs ohne diesen Callback
brauchen weiterhin Gerätelogs. Alte APKs bleiben mit der Web-Korrektur kompatibel;
die neue Diagnose setzt die neue APK voraus.

Für die reale Endabnahme Web-Build unter **Über diese App → Web-Oberfläche**
festhalten; vollständig schließen und neu öffnen. Kalt-/Warmstart, alle Seiten,
Profil-/Anbieterwechsel, schwaches Netz, Standby/Rückkehr und mindestens zehn
Minuten horizontale/vertikale TV-Navigation mit BALD-/Start-/Ende-Übergängen
prüfen. Auf Fokus, Scrollposition und Detailrückkehr achten. Bei verbleibendem
Freeze Diagnose mit Geräte-Trace korrelieren; JSON-/Sortier-, Render-/Bild- oder
GPU-Kosten danach gezielt bearbeiten. #703/#386 werden nicht ohne diese Abnahme
als vollständig erledigt oder absolut optimiert bezeichnet.
