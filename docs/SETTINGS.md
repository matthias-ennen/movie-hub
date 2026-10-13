# Einstellungen und Anbieterregeln

Stand: 13.10.2026 · #387 · Durch Matthias abgenommen und abgeschlossen.

## Navigation und Geltungsbereich

| Überschrift auf der Übersicht | Direkte Kacheln | Geltungsbereich |
| --- | --- | --- |
| Profil: [aktiver Name] | Oberfläche; Design; Meine Kategorien; Persönliche Posterreihen; Sortierung & Abwechslung; Mitteilungen | Aktives Profil |
| Für alle Profile | Streaminganbieter; Waipu-Sender; Joyn-Sender | Konto, alle Profile und Geräte |
| Dieses Gerät | Netzlaufwerke; TMDB-Verbindung | Zugangsdaten lokal am Gerät; synchronisierte TMDB-Inhalte kontoweit |

Die drei Gruppen sind umschließende Kacheln im vorhandenen `settings-panel`-
Stil, keine zusätzlichen Menüseiten. Ihre Überschriften verwenden denselben
`settings-kicker`-Stil wie Profile & Konto. Innerhalb der Kacheln öffnen elf
Einträge direkt den Inhalt, je nach Breite in einer, zwei oder drei Spalten.
Der aktive Profilname steht an der Profilgruppe.

Jede Unterseite zeigt eine kompakte, beim Scrollen sichtbare Kopfzeile:
**Einstellungen › Seitentitel**, vollständig im vorhandenen kompakten
`eyebrow`-Überschriftenstil. Einstellungen bleibt als Text ohne dauerhafte
Buttonfläche bedienbar, mit sichtbarem Tastatur-/D-Pad-Fokus. Die zusätzlichen
Hinweise Profil: [Name], Für alle Profile und Dieses Gerät unter dem Breadcrumb
entfallen; der Geltungsbereich ist auf der Übersicht erkennbar. Breadcrumb und
Hardware-Zurück führen zur gleichen Übersichtskachel und Scrollposition zurück.
Die tatsächliche Höhe von Hauptnavigation und Kopfzeile bestimmt den Abstand
für den D-Pad-Fokus, auch bei umgebrochenen Überschriften. Netzlaufwerke und
TMDB-Verbindung sind getrennt erreichbar; jede Seite lädt nur ihre Verbindung.

**Profile & Konto** im Profilmenü verwaltet weiterhin Auswahl, Namen und
Anlegen von Profilen sowie Abmelden. Ausschließlich die mittlere Verweiskachel
zu den Einstellungen wurde entfernt; obere und untere Kachel bleiben erhalten.
Die Seite heißt direkt **Profile & Konto** im kompakten Überschriftenstil;
Dein Movie Hub, die große doppelte Überschrift und der Einleitungstext entfallen.
Profile & Konto, Einstellungen und Breadcrumbs teilen die Kopfabstände.
Gespeicherte Werte und Funktionen bleiben erhalten. Das E-Mail-Paket #384 ist
zurückgestellt.

Die Übersicht baut keine langen Senderlisten auf. Nur die aktive Unterseite
wird angezeigt; Senderkataloge werden bei Sender-/TV-Bedarf geladen und bei
erneutem Öffnen wiederverwendet. Anbieter und Sender nutzen einheitliche
Schalter und dieselbe Panelbreite. Senderlisten bieten eine Suche und normales
Seitenscrollen, keinen zweiten Scrollbereich. Speichern erhält den Fokus.

## Anbieterinventar und Reihenfolge

Die Registry enthält 18 Anbieter, in dieser Anzeigeordnung:

Movie Hub → waipu.tv → Joyn → Apple TV+ → ARD Mediathek → arte →
Crunchyroll → Disney+ → MagentaTV+ → Netflix → Netzkino → Paramount+ →
Pluto TV → Prime Video → RTL+ → WOW → YouTube → ZDF.

Movie Hub und die Live-Anbieter sind immer auswählbar. Weitere Anbieter
werden angezeigt, wenn der veröffentlichte Katalog eine positive ganzzahlige
TMDB-Anbieterzuordnung enthält. `null`, leere Werte und `0` zählen nicht als
Zuordnung. Die Registry ist kein Versprechen vollständiger Katalogabdeckung.
Eine Posterreihe erscheint nur bei aktiviertem Anbieter und passenden Titeln.

Unveränderte Standardauswahl: Movie Hub, Waipu, Joyn, Netflix, Prime Video,
Disney+ und YouTube. Vorhandene Kontoauswahlen bleiben erhalten. Anzeigeordnung
und gespeicherte Auswahl sind getrennt; es gibt keine manuelle Anbietersortierung.

## Sender und Live-Angebote

Der veröffentlichte Waipu-Senderkatalog bildet die gemeinsame Grundordnung.
Joyn-Sender werden über ihre geprüfte kanonische Zuordnung einsortiert;
zusätzliche Sender folgen alphabetisch. Dieselbe Ordnung gilt in Einstellungen
und TV. Es gibt keine manuelle Sendersortierung mehr. Bereits gespeicherte
`stationOrder`-Werte werden weder gelöscht noch überschrieben, aber nicht mehr
für die Anzeige verwendet. Deaktivierungen bleiben erhalten; neue Sender sind
wie bisher standardmäßig aktiv.

`createLiveProviderFilter` wendet Anbieter- und Senderauswahl gemeinsam auf
Tagesprogramm, 14-Tage-Übersicht, TV-Hero und titelbezogene Live-Verfügbarkeit
an. Bei Mehrquellenereignissen bleibt ein anderer eingeschalteter Wiedergabeweg
erhalten. Abschalten eines Joyn-Senders entfernt ausschließlich dessen
Live-Angebot; eine unabhängige Joyn-Streamingverfügbarkeit bleibt bestehen.

## Posterreihen auf den Seiten

| Seite | Vertrag |
| --- | --- |
| Home | Movie Hub, öffentliche Anbieter in gemeinsamer Ordnung, Entdeckungsreihen, persönliche Reihen, TMDB-Reihen; Anbieter enthalten Filme und Serien aus dem vollständigen geladenen Kandidatenpool |
| Filme / Serien | Persönliche Kategorien in Profilreihenfolge, Movie Hub, übrige Anbieter; nur passender Medientyp |
| Meine Inhalte | Persönliche Reihen und ihre sinnvolle Profilsortierung bleiben erhalten |
| TV | Gemeinsame Senderordnung; Zeit- und Qualitätsregeln bleiben fachlich maßgeblich |
| Suche / Details | Gleiche Anbieterordnung und gefilterte Live-Nachweise; persönliche Inhalte bleiben gespeichert und auffindbar |

Top 10 wird weiterhin nach drei tatsächlich sichtbaren Reihen eingesetzt;
Verlauf und Top 100 behalten ihre Fachlimits. Flexible Reihen werden vor dem
Posterlimit nach den Profileinstellungen kuratiert. Home bevorzugt nicht mehr
alle Filme vor Serien. Änderungen der Posteranzahl aktualisieren die betroffenen
Reihen unmittelbar.

`buildProviderCatalogModel` verbindet einmalig die geladenen TMDB-Kataloge
mit aktuellen, aktivierten Waipu-/Joyn-Ausstrahlungen vorhandener Titel.
Es erzeugt keine doppelten Titel und keine zusätzliche Reihe pro Quelle.
Home, Filme, Serien und Anbieter-Top-10 nutzen denselben Kandidatenbestand.
Es werden keine weiteren Titel oder Programme je Poster nachgeladen.
Die Reihen zeigen den verfügbaren geladenen Bestand, kein vollständiges
Live-TV-Archiv.

## Architektur und Prüfstand

Gemeinsame Module: `providerOrder.js`, `providerSelectionModel.js`,
`stationOrder.js`, `liveProviderSelection.js`, `providerCatalogRows.js` und
`settingsNavigation.js`. `useSettingsNavigation.js` kapselt ausschließlich
Fokus, Scrollposition und die gemessenen Headerabstände, ohne Scroll-Listener
oder React-Aktualisierung bei jeder Scrollbewegung. Die bestehenden Auswahl-/Profil-Hooks bleiben die
Persistenzgrenze. Keine neue Collection, keine Datenmigration, keine neue
Abhängigkeit und keine Änderung an nativen Schnittstellen.

- Erste Stufe vom 12.10.: 968 Unit-Tests in 157 Dateien erfolgreich; sieben
  neue gezielte Konsistenztests ergänzten die vorhandenen Prüfungen.
- Produktionsbuild der ersten Stufe erfolgreich. Haupt-JS gegenüber `091a0c95`: gzip
  65,79 → 67,38 KB (+1,59 KB). Settings und Profile zusammen:
  14,35 → 13,25 KB gzip; weiterhin separat nachgeladen.
- Chromium-Prüfung mit tatsächlichen Settings-Komponenten und simulierten
  Speicher-/Profil-Hooks: Menüwege, 18 Anbieter, 228 Sender, Suche,
  Speichern/Fokus, Speicherausfall/Rücknahme, Kategorienverschiebung,
  Posteranzahl und Zurücknavigation erfolgreich. Desktop 1280 × 720 und
  schmale Ansicht 390 × 844 ohne horizontalen Überlauf.
- CI einschließlich Firestore-Regeltests und Veröffentlichung werden im
  zugehörigen PR und Issue belegt. Browserprüfung ersetzt keine Geräteabnahme.

Navigations-Fine-Tuning vom 13.10.:

- Aktuelle vollständige Suite: 970 Tests in 157 Dateien erfolgreich;
  Produktionsbuild und `git diff --check` erfolgreich.
- Chromium mit echten UI-Komponenten und D-Pad-Navigation, simulierten
  Profil-/Speicher-/Geräteschnittstellen: alle elf Wege, Breadcrumb und
  Escape-Zurück, exakte Kachel-/Scrollwiederherstellung, Profilwechsel,
  Anbieter-Speicherfokus, Sender-Suche und 228 Sender geprüft. Fokus auf
  Sender 101 bleibt beim Navigieren unter der Sticky-Kopfzeile sichtbar.
- Getrennte Netzwerk-/TMDB-Aufrufe und genau zwei verbleibende Kacheln unter
  Profile & Konto geprüft. Desktop 1280 × 720 und Mobilansicht 390 × 844
  ohne horizontalen Überlauf; keine Browserfehler.
- Haupt-JS: 67,42 KB gzip (+0,04 KB); Settings: 12,28 KB gzip (+0,44 KB)
  gegenüber der ersten Stufe. Keine neue Abhängigkeit. Keine neue APK nötig.

Stilkorrektur nach den Screenshots vom 13.10.: Build und Diff-Prüfung
erfolgreich. Chromium bestätigt gemeinsame Überschriften-/Breadcrumb-Typografie
und Kopfabstände, drei vorhandene Panel-Kacheln mit 6/3/2 Einträgen, entfernte
Zusatzzeilen und sichtbaren Breadcrumb-Fokus ohne dauerhafte Buttonfläche.
Alle elf Wege, exakte Scroll-/Fokusrückkehr, lange Senderliste und die
verbleibenden Profil-/Kontokacheln geprüft. 1280 × 720 und 390 × 844 ohne
Überlauf oder Browserfehler; Ansichten zusätzlich visuell geprüft.

## Abnahme und Abschluss – 13.10.2026

Matthias hat den vorgelegten Stand mit **„Das ist abgenommen.“** bestätigt.
Damit ist #387 einschließlich Navigation und Stilkorrektur abgeschlossen.
Die Lieferkette #422 → #424 → #425 ist veröffentlicht, zuletzt Build
`b1cc238`; CI, Android und Firebase-Veröffentlichung waren erfolgreich.
Die früheren offenen Abnahmehinweise sind durch die Paketabnahme erledigt.
Zusätzliche, einzeln protokollierte Geräte-/Testdurchläufe werden daraus
nicht abgeleitet; der technische Prüfstand ist oben dokumentiert.

Als nächstes Paket ist **#426 – Detailseite aufräumen und verbessern**
angelegt: zunächst Sammlung, Bestandsaufnahme und gemeinsame Festlegung.
Noch keine Detailseiten-Implementierung. #384 E-Mail bleibt geparkt.
