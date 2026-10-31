# MovieHub: kompakter Startpfad (#703)

Stand: 31.10.2026. Aufbauend auf den abgenommenen PRs #704–#706. Dieses Paket
betrifft den ersten Start bis zur bedienbaren Home-Ansicht. Nachtlaufsteuerung,
YouTube-Matching, Profile und die bestehende Intro-Dauer bleiben erhalten.

## Datenvertrag und Veröffentlichung

`npm run build` erzeugt über `prebuild` aus dem tatsächlich bereitliegenden
`public/catalog.json` die Dateien unter `public/startup/`. Der bestehende Deploy
restauriert/generiert den vollständigen Quellkatalog vor diesem Build. `predev`
erzeugt dieselbe Struktur für lokale Entwicklung. Ein Source-only-Checkout mit
explizitem leerem Fallbackkatalog darf weiterhin gebaut werden; ein ungültiger
normaler Katalog bricht den Export ab. Generierte Startdateien werden nicht in
Git eingecheckt. Die vollständige bisherige Datei bleibt für bestehende Clients
und externe Datenverbraucher verfügbar.

- `manifest.json`: Version, Generation, Zeitstempel, Titelanzahl und Listinggröße;
  HTTP `no-store`.
- `<generation>/catalog.json`: sämtliche Titel, Anbieter, Sortierung, Artwork,
  Beschreibung, Trailer, Reihen und vollständige Filter-IDs. Keine vollständigen
  Besetzungen, Staffeln, Sammlungsdetails oder Filterauswahllisten.
- `<generation>/filters.json`: globale Filterauswahl; erst im Filtereditor oder
  bei der Suche angefordert. Bereits konfigurierte Reihen filtern anhand der
  IDs und benötigen diesen Namenskatalog beim Start nicht.
- `<generation>/details-00.json` bis `details-3f.json`: vollständige Titel des
  Quellkatalogs, aufgeteilt nach TMDB-ID modulo 64; nur bei tatsächlichem Bedarf.

Die Generation ist SHA-256 über **Schema-Version und vollständigen Quellkatalog**.
Alle Generation-Dateien sind unter ihrem Inhaltsbezug langfristig cachebar.
Bei Änderungen am Projektionsvertrag die Version erhöhen. Der Client prüft
Version, Generation und Titelanzahl und übernimmt keine gemischte Generation.
Das Detailflag `detailDeferred` verhindert, dass ein Listing als vollständige
Detailansicht behandelt wird. Der Hero braucht die ausgelagerten Felder nicht;
seine benötigten Metadaten und Trailer bleiben im Listing. Vollständige Details
haben Vorrang, wenn sie später mit einer Listingprojektion zusammengeführt werden.

## Startphasen

1. Native Activity/WebView und Intro; Web-Bundles, Firebase/Auth.
2. Öffentlicher Startkatalog parallel zur Anmeldung. Nach Auth: aktives Profil,
   Theme/Experience/Reihen und Anbieterwerte; persönliche Markierungen ohne
   globale Detailanreicherung. Persönlicher TMDB-Katalog und Shared-Media-Basis
   bleiben frühe Quellen für die Darstellung.
3. Erster konsistenter Home-Aufbau. Anbieterwahl, persönliche Markierungen oder
   deren begrenzter Fehlerpfad sowie das erste Darstellungsmodell sind geklärt.
   Hero und erste progressive Reihen melden Web-ready.
4. Nativer Startfokus nach Introende; zwei Frames und 200 ms geben der sichtbaren
   Ansicht Vorrang. Erst dann werden Hintergrundquellen freigegeben.
5. Live-/YouTube-Zusatzdaten, Mitteilungen und persönliche Metadaten folgen.
   Auch optionale Hero-Metadatenreparaturen beginnen erst in dieser Phase.
   Die Verschlüsselungsprüfung startet weitere zwei Sekunden später.

Die gemeinsame Hero-Auswahl für Home/Filme/Serien bleibt konsistent. Der Hero
für „Meine Inhalte“ wird vor der ersten Home-Freigabe nicht vorsorglich berechnet;
bei direktem Aufruf steht diese Berechnung sofort zur Verfügung. Home-ID-Zugriffe
verwenden eine Map statt wiederholter linearer Suchen.

## Cache und Fehlerverhalten

IndexedDB speichert genau **eine öffentliche Listinggeneration**, keine privaten
Profil-, Titelzustands- oder Auth-Daten. Ein atomarer Datensatz enthält Katalog
und Speicherzeitpunkt. Der Speicherzugriff wartet höchstens 500 ms; fehlendes,
blockiertes oder volles IndexedDB verhindert den Start nicht.

Ein Folgestart prüft das kleine Manifest. Bei gleicher Generation entfällt der
Listingdownload. Eine neue Generation ersetzt den Cache erst nach Validierung.
Ist die Aktualisierung nicht erreichbar, darf eine validierte lokale Generation
bis sieben Tage nach Speicherung mit sichtbarem Aktualisierungshinweis dienen.
Das ist ein Rückfall für öffentliche Katalogdaten, **keine neue Offline-Zusage
für Auth, Profile, private Daten oder noch nicht geladene Detailansichten**.

Manifest: maximal 1,5 s mit vorhandenem Cache, sonst 3 s. Neuer Listingdownload:
maximal zwei Versuche zu je 7 s mit 0,5 s Pause. Ohne brauchbaren Cache existiert
für ältere Hostingstände/Rollbacks ein begrenzter 7-s-Versuch des alten Katalogs.
Auch Download- und Body-Timeouts setzen das Budget wieder frei. Ein komplett
stummer Transport wird nicht endlos abgewartet. Native Fehlerpfade bleiben.

## Persönliche Metadaten und Schutz der Nutzerdaten

Der Profilstart veröffentlicht kleine Titelzustände unabhängig von vollständigen
Metadaten. Der Home-Filter kann dadurch bereits „gesehen“, Favoriten usw. korrekt
berücksichtigen. Ein Nachladevorgang verwendet zwei Arbeiter, gruppiert Referenzen
nach Paket und veröffentlicht höchstens acht Ergebnisse pro Batch. Für Titel im
Startkatalog werden vorhandene Listingdaten verwendet. Fehlende Titel werden
nachgeladen. Account-/Profilwechsel brechen weitere Arbeit ab; verspätete
Metadaten überschreiben keine inzwischen vorgenommenen persönlichen Aktionen.
„Meine Inhalte“ zeigt beim Nachladen einen Ladezustand und kann vorhandene Reihen
bereits verwenden, statt auf die vollständige Bibliothek zu warten.

Katalog- und Suchdetails teilen ein Budget von **zwei** aktiven Downloads inklusive
JSON-Verarbeitung. Gleiche Ressourcen teilen einen Abruf, interaktive Anfragen
haben Vorrang vor wartenden Hintergrundaufgaben. Abbruch eines Verbrauchers
beendet einen geteilten Abruf erst, wenn kein anderer Verbraucher mehr wartet.
Warteschlange höchstens 64, Paketcache vier, Suchdetail-Einzelcache weiterhin 100.
Einzelne hängende Abrufe enden spätestens nach acht Sekunden. Das bestehende
separate Bildbudget von zwei bleibt bestehen.

Die Verschlüsselungsmigration bleibt vollständig: Sie prüft nach der Startfreigabe
in nach Dokument-ID sortierten Seiten von höchstens 50 Dokumenten, gibt zwischen
Dokumenten Rechenzeit ab und ist bei Kontowechsel abbrechbar. Ein früherer Erfolg
führt bewusst nicht zum dauerhaften Überspringen weiterer Prüfungen, weil ältere
Clients danach Klartext geschrieben haben könnten. Klartext wird weiterhin erst
nach erfolgreicher Verschlüsselung und Rückprüfung entfernt. Nur ein vollständig
beendeter Lauf schreibt den bisherigen versionierten Erfolgsbericht.

## Messung und Nachweise

Öffentlicher Hosting-Datensatz vom 31.10.2026, Kataloggeneration
`2026-10-31T04:54:21.331Z`, 2.270 Titel:

| Größe | Bisher | Neuer Export |
|---|---:|---:|
| Katalog-JSON | 45.801.380 Bytes | 7.188.137 Bytes |
| Gzip | 7.705.951 Bytes (gemessener HTTP-Body) | 1.714.515 Bytes (lokale Kompression) |

Ungefähr 78 % weniger komprimierte Katalogbytes. Das ist **keine gemessene
Fire-TV-Zeitersparnis und kein RAM-Messwert**. Initiale alte HTML/JS/CSS-Dateien
hatten zusammen 290.869 Gzip-Bytes. Bilder und persönliche Daten kommen hinzu.
Der tatsächliche neue Hostingtransfer wird nach Veröffentlichung separat geprüft.

Diagnostik trennt Firebase/Auth, Profil, persönliche Markierungen, Katalogdownload,
JSON-Parse, Normalisierung, Home-Modell, Web-ready, nativen Fokus und spätere
Hintergrundfreigabe. Die neue APK ergänzt `activityToReadyMs`,
`activityToVisibleMs` und `reportFullyDrawn()`. Diese Werte beginnen bei
Activity-Erstellung, nicht beim OS-Prozessstart. Die bisherige Messung
`startup_ready_ms` ab `loadMovieHub()` bleibt erhalten. Webänderungen funktionieren
mit der bestehenden APK; die ergänzten nativen Messwerte benötigen die neue APK.

Automatisierte Prüfungen umfassen Daten-/Filter-/Hero-Parität, vollständige
Details, Cache-/Generationenwechsel, Offline-Katalogrückfall, hängende Transporte,
Budget und Abbruch, persönliche Bearbeitung/Profilwechsel sowie paginierte
Verschlüsselungsprüfung. Der Browser-Starttest verwendet den echten
LibraryProvider mit synthetischem Firestore, einschließlich 100 persönlicher
Titel. Er prüft zusätzlich eine verzögerte native Fokusfreigabe und verzögerte
persönliche Zustände, echte IndexedDB-Wiederverwendung sowie Details und
Filtereditor. Die bisherigen TV-/Rendering-Prüfungen bleiben Bestandteil der CI.

Geräteabnahme: gleichen Web-/APK-Stand notieren; App vollständig beenden, mehrfach
neu starten; einmal ohne vorhandenen öffentlichen Cache und danach mit Cache.
Anschließend unmittelbar navigieren, „Meine Inhalte“, Suche/Filter und Film-/
Seriendetails öffnen. Zeit bis zum ersten bedienbaren Home getrennt von Intro
und vollständig geladenen Bildern vergleichen. #703 bleibt bis zur Nutzerabnahme
offen; Desktop-Browserprüfungen ersetzen diesen Fire-TV-Vergleich nicht.
