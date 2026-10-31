# Fundamenthärtung #703 – erste Testrunde

Stand 31.10.2026. Grundlage: `6eeefa801c6d10d15404b3c42015cc6d6bd35987`.
Dieses Dokument beschreibt eine erste begrenzte Umsetzung, nicht die Endabnahme
des gesamten Arbeitspakets. #386 bleibt der ergänzende Navigations-Messauftrag.

## Verhalten

- Home wartet nur auf den Hauptkatalog. Die optionale
  `/youtube-curated-new-films.json` startet nach dem Home-Ready-Signal.
  Ein späteres gültiges Ergebnis wird mit den bisherigen Validierungs- und
  Deduplizierungsregeln ergänzt. Ein Fehler verändert den fertigen Katalog nicht.
- Requests für Hauptkatalog und Ergänzung werden nach zehn Sekunden inklusive
  Body-Verarbeitung abgebrochen. Der Hauptkatalog behält seine vorhandenen
  Wiederholungen; Unmount bricht den aktiven Request ab. Der native 30-s-Watchdog
  kann weiterhin vor dem Ende sämtlicher Netzwerk-Wiederholungen greifen.
- `Intl.DateTimeFormat` wird pro Locale/Optionen wiederverwendet, mit maximal
  16 Cacheeinträgen. Kein Datum, Zeitzonenoffset oder Sommerzeit-Ergebnis wird
  gecacht. Dies entlastet Tagesleiste, Prime Time, Nachtprogramm und Live-Labels.
- `TvFeature` berechnet keinen zweiten ungenutzten Hero im Tagesreihenmodell.
  Der sichtbare Hero verwendet weiterhin seinen eigenen Runtime-Snapshot.
- Die fünf Sekunden Mindesthaltezeit des nativen Intros bleiben unverändert.

## Nachweise

- Produktionsbuild erfolgreich.
- 300 Testdateien / 1.959 Anwendungstests bestanden, einschließlich Timeout,
  Abbruch, Wiederholung, Zeitzonen, Sommer-/Winterzeit, Prime-Time-Grenzen,
  identischen Reihen bei ausgelassener Hero-Berechnung und Diagnostik.
- Lokal Node v24.22.1 mit `NODE_OPTIONS=--test-reporter=tap`: Einige ältere
  YouTube-Wrapper prüfen ausdrücklich das TAP-Ausgabeformat. Ohne diese reine
  Runner-Einstellung meldet Node 24 vierzehn Format-Assertions, obwohl die
  jeweiligen Kindprozesse erfolgreich sind. Produktcode/Assertions unverändert;
  reguläre CI verwendet weiterhin Node 22.
- `npm run test:startup:browser` prüft die echte App-/Hero-/Reihen-Darstellung
  mit synthetischen Kontodiensten: verspätete Ergänzung, hängender Request und
  HTTP 503. In allen Fällen erscheint Home vor der optionalen Antwort, Navigation
  zu Filme funktioniert, und ein späterer gültiger Titel erscheint ohne einen
  zweiten nativen Startup-Handshake. Keine produktiven Dienste oder Konten.
- Der isolierte Vergleich mit dem Ausgangsmodell liefert bei 1.000 und 3.000
  synthetischen Ausstrahlungen identische vollständige Modelle. Mit
  `includeHero: false` bleiben alle Perioden, Reihen und Airing-Flags identisch.
  Laufzeiten sind Rechner-/Fixturewerte; sie ersetzen keine Fire-TV-Messung.

## Diagnose auf einem angeschlossenen Testgerät

In der WebView-Konsole nach dem gewünschten Start-/TV-Vorgang:

```js
window.__movieHubPerformance.snapshot()
```

Relevante Ereignisse:

| Ereignis | Bedeutung |
|---|---|
| `startup:home-ready` | Web-Inhalt bereit; nicht gleich Ende des nativen Intros |
| `catalog:youtube-companion:start/ready` | optionale Nachladephase / Fehlerausgang |
| `live:time-transition` | globale Live-Aktualisierung |
| `live:catalog-merge:ready` | Dauer des öffentlichen Live-Katalog-Merges |
| `tv:time-transition` | TV-Sendezeitübergang und Verspätung des Timers |
| `tv:view-model:ready` | bestehender Runtime-Schedule-Aufbau nach Datenabruf |
| `tv:rows-model:ready` | tatsächlich wiederholte Tages-/Reihenberechnung |
| `tv:summary-rows:ready` | 14-Tage-Reihenberechnung |
| `tv:rows-committed` | React-Effekt nach dem Commit |
| `tv:rows-frame` | zwei weitere Animationsframes; kein Bilddecode-Nachweis |
| `main-thread:long-task` | numerische Long-Task-Dauer, falls vom Browser unterstützt |

Der Ring enthält maximal 200 Ereignisse. Browser-Marks werden pro Ereignisname
ersetzt. Es werden keine Nutzer-/Titelobjekte oder Long-Task-Attributionsdaten
gespeichert und keine Diagnosewerte an einen Server gesendet.

## Noch offene Geräteabnahme / Folgerunden

1. Exakte APK-/Web-Build-Kombination festhalten; Web-Veröffentlichung ist nötig,
   weil die APK die gehostete Oberfläche lädt.
2. Kalt-/Warmstart und Home/Filme/Serien/Meine Inhalte/TV prüfen.
3. TV mindestens zehn Minuten horizontal und vertikal bedienen, insbesondere
   über BALD-/Start-/Ende-Übergänge hinweg. Auf abgelaufene fokussierte Titel,
   neue Sendungen und unveränderte Fokus-/Scrollposition achten.
4. Bei verbleibendem Freeze Diagnose und Geräte-Trace korrelieren. Danach
   gemeinsame Zeitsteuerung, inkrementelle Reihen, 14-Tage-Uhr, Resume/
   Tageswechsel und Poster-/D-Pad-/Bildkosten gezielt bearbeiten.

Die erste Runde führt noch keine gemeinsame Uhr, Worker oder neue
Virtualisierung ein und erklärt #703/#386 nicht als abgeschlossen.
