# Einstellungen und Anbieterregeln

Stand: 12.10.2026 · #387 · Umsetzung freigegeben, Geräteabnahme offen.

## Navigation und Geltungsbereich

| Hauptgruppe | Unterseiten / Inhalt | Geltungsbereich |
| --- | --- | --- |
| Darstellung & Posterreihen | Oberfläche; Design; Meine Kategorien; Persönliche Posterreihen; Sortierung & Abwechslung | Aktives Profil |
| Anbieter & Sender | Streaminganbieter; Waipu-Sender; Joyn-Sender | Konto, alle Profile und Geräte |
| Mitteilungen | Beobachtete Titel und Erinnerungen | Aktives Profil |
| Verbindungen | Netzlaufwerke; TMDB-Zugang und Synchronisierung | Zugangsdaten lokal am Gerät; synchronisierte TMDB-Inhalte kontoweit |

**Profile & Konto** im Profilmenü verwaltet weiterhin Auswahl, Namen und
Anlegen von Profilen sowie Abmelden. Ein Link führt zu den
Darstellungseinstellungen. Keine Funktion oder gespeicherte Auswahl wurde
entfernt. Das E-Mail-Paket #384 ist zurückgestellt.

Die Übersicht baut keine langen Senderlisten auf. Nur die aktive Unterseite
wird angezeigt; Senderkataloge werden bei Sender-/TV-Bedarf geladen und bei
erneutem Öffnen wiederverwendet. Anbieter und Sender nutzen einheitliche
Schalter und dieselbe Panelbreite. Senderlisten bieten eine Suche und normales
Seitenscrollen, keinen zweiten Scrollbereich. Speichern erhält den Fokus;
Zurück führt stufenweise zum vorherigen Menüeintrag.

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
`settingsNavigation.js`. Die bestehenden Auswahl-/Profil-Hooks bleiben die
Persistenzgrenze. Keine neue Collection, keine Datenmigration, keine neue
Abhängigkeit und keine Änderung an nativen Schnittstellen.

- 968 Unit-Tests in 157 Dateien erfolgreich; sieben neue gezielte
  Konsistenztests ergänzen die vorhandenen Prüfungen.
- Produktionsbuild erfolgreich. Haupt-JS gegenüber `091a0c95`: gzip
  65,79 → 67,38 KB (+1,59 KB). Settings und Profile zusammen:
  14,35 → 13,25 KB gzip; weiterhin separat nachgeladen.
- Chromium-Prüfung mit tatsächlichen Settings-Komponenten und simulierten
  Speicher-/Profil-Hooks: Menüwege, 18 Anbieter, 228 Sender, Suche,
  Speichern/Fokus, Speicherausfall/Rücknahme, Kategorienverschiebung,
  Posteranzahl und Zurücknavigation erfolgreich. Desktop 1280 × 720 und
  schmale Ansicht 390 × 844 ohne horizontalen Überlauf.
- CI einschließlich Firestore-Regeltests und Veröffentlichung werden im
  zugehörigen PR und Issue belegt. Browserprüfung ersetzt keine Geräteabnahme.

**Noch durch Matthias abzunehmen:** auf Smartphone und Fire TV Menübreiten,
lange Senderliste und Zurück/Fokus; Anbieter-/Senderschalter über Home,
Filme/Serien und TV; bestehende Auswahl und persönliche Reihen nach
Profilwechsel/App-Neustart. Bis dahin bleibt #387 offen.
