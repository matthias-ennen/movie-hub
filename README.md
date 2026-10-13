# Movie Hub

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für Fire TV, Android-Smartphones und Tablets. Die Anwendung bündelt Filme und Serien aus Streaming-Diensten sowie linearem Fernsehen über Waipu und Joyn in einer gemeinsamen Oberfläche und verbindet Streaming-Verfügbarkeit mit persönlichen Bewertungen, Listen, eigenen Medien und TMDB-Daten.

## Zielbild

- Streaming-artige Oberfläche mit großen Postern und Backdrops
- Persönliche Listen und ein eigenes Filmgedächtnis
- Kompakte Provider-Symbole direkt auf den Filmkarten
- Automatische Anbieterbuttons mit bestmöglichem App-/Suchstart
- Deutsche Filmdaten, Poster, Bewertungen, Genres und Besetzung über TMDB
- Persönlicher TMDB-Katalog aus Favoriten und Watchlist
- Eigene Links sowie HTTP(S)- und SMB-/FRITZ!NAS-Videos
- Fire-TV-Fernbedienungsnavigation mit Fokussteuerung
- Web-App als zentrale Oberfläche; Android-/Fire-TV-APK als nativer Wrapper und Gerätebrücke

## Zielarchitektur

1. **Web-App:** React + Vite, TV-first und fernbedienbar
2. **Hosting:** Firebase Hosting
3. **Backend:** Cloud Firestore + Firebase Authentication
4. **Filmdaten:** TMDB
5. **Automatisierung:** CI/CD und regelmäßige Datenjobs
6. **Android / Fire TV:** schlanke native App mit WebView, sicherer Geräteablage, Player und Intent-/Deep-Link-Layer
7. **Provider:** automatische Drittanbieter sowie Movie Hub als virtueller Anbieter für persönliche Links und Videos

Details:
- [Architektur](docs/ARCHITECTURE.md)
- [Datenmodell](docs/DATA_MODEL.md)
- [Roadmap](docs/ROADMAP.md)
- [Abnahme 09.09.2026](docs/ACCEPTANCE_2026-09-09.md)

## Entwicklungsphasen

- **Phase 0:** Firebase-, Security-, Hosting- und Projektfundament
- **Phase 1:** TV-optimierte Streaming-Oberfläche
- **Phase 2:** TMDB-Filmdaten und persönliches Filmgedächtnis
- **Phase 3:** Android-/Fire-TV-APK
- **Phase 4:** Deep Links und Provider-Auswahl
- **Phase 5:** Dynamische Verfügbarkeit, persönliche Kataloge und eigene Medien
- **Phase 6:** Personalisierung, Toplisten und Automatisierung/KI

## Infrastrukturstand

- GitHub: `matthias-ennen/movie-hub`
- Firebase-Projekt: `movie-hub`
- Firebase Project ID: `movie-hub-62459`
- Firebase Web-App: `movie-hub-web`
- Firestore: Standard Edition, `europe-west3` (Frankfurt)
- Firebase Authentication: E-Mail/Passwort
- Firebase Hosting: `https://movie-hub-62459.web.app`
- Android-/Fire-TV-App: signierte, R8-minifizierte GitHub-Actions-APK mit fortlaufendem `versionCode`
- aktueller Release-Build: rund **2,51 MiB**
- Web-Bundle: stabile Vendor-Chunks für React, Firebase und TanStack; TV und sekundäre Ansichten werden bedarfsgerecht lazy geladen

## Status

Projektstart: 31. August 2026

Stand: **12. Oktober 2026**

Die kanonische Titelbasis aus #256 sowie die Waipu-Pakete #4, #259 und #260 sind technisch umgesetzt und auf den vorgesehenen Geräten abgenommen. TMDB bleibt die kanonische Quelle für öffentliche Film- und Serienmetadaten; externe Quellen ergänzen Verfügbarkeiten, Senderereignisse und Wiedergabeziele.

[#280 – Joyn-Adapter](https://github.com/matthias-ennen/movie-hub/issues/280) ist abgeschlossen. Joyn und Waipu liefern ihre Ausstrahlungen in denselben neutralen Quellen-/TV-Vertrag. Derselbe kanonische Titel kann dadurch mehrere getrennte Providerwege tragen, ohne als doppelter Movie-Hub-Titel zu erscheinen. Wiedergabeziele bleiben providerbezogen als PlaybackRoutes erhalten.

Der gezielt vorgezogene Betriebsnachtrag vom 07.10.2026 unter #271 erweitert
Joyn auf den geprüften 14-Tage-Import, dauerhafte Checkpoints, Quellenfehlerschutz
und den gemeinsamen Nachtlaufbericht. Er wurde ohne neues eigenes Issue als
Ergänzung zu #280/#315 bearbeitet. Der reguläre [Nachtlauf vom 12.10.2026](https://github.com/matthias-ennen/movie-hub/actions/runs/38191419867)
bestätigt die tägliche Fortschreibung mit normalen Budgets, privaten Checkpoints,
vollständigem TMDB-Verbraucherabschluss und geprüfter Veröffentlichung.
Der Start war 182 Minuten verspätet; die Pünktlichkeit ist damit nicht bestätigt.
Nachweise und verbleibende Betriebshinweise: [Nachtlauf-Dokumentation](docs/DATA_WORKFLOW_RELIABILITY.md).
Die Produkt-Hauptstrecke bleibt #314; Movie Hub Admin wird separat behandelt.

Der interaktive TV-Pfad liest vorbereitete Runtime-Artefakte statt vollständige Providerkataloge in die Oberfläche zu ziehen. Der TV-Hero kommt aus einem kleinen 14-Tage-Snapshot; Tagesdaten werden erst nach Hero-Bereitschaft geladen. Veraltete Tagesrequests werden abgebrochen und der Tagescache ist begrenzt. Seit #346 liegt die komplette TV-Runtime zusätzlich in einem lazy geladenen Feature und wird beim TV-Intent nur vorgewärmt.

[#346 – Fundamenthärtung und Performance](https://github.com/matthias-ennen/movie-hub/issues/346) ist abgeschlossen und von Matthias auf Smartphone und Fire TV abgenommen. Umgesetzt sind zentrale Produktverträge, Page-/Row-Logik, atomare Detailbeladung, TV Hero-first, progressive Poster-/Bildlogik, React-/State-Härtung, native Android-/Fire-TV-Härtung, Dependency-/CI-Bereinigung sowie Hosting-/Cache-/Bundle-Optimierung.

Der Vite-Hauptchunk wurde im Verlauf von #346 auf **210,46 kB minifiziert / 63,72 kB gzip** reduziert. Der signierte R8-Release liegt bei rund **2,51 MiB**. Das verbleibende leichte Fire-TV-Ruckeln ist kein Blocker des abgeschlossenen Pakets und kann später als eigenes Performance-Folgepaket untersucht werden. [#315 – Nachtlauf/Betriebszuverlässigkeit](https://github.com/matthias-ennen/movie-hub/issues/315) ist ebenfalls abgeschlossen; der reguläre Datenlauf nutzt geprüfte private Cloud-Checkpoints und ein unabhängiger Meldeweg überwacht Datenfrische und ausgebliebene Zeittrigger.

Für Home, Filme, Serien, TV und Meine Inhalte gelten gemeinsame Seiten-, Hero-, Fokus-, Row- und Ladeverträge. Top 10 wird relativ zu den tatsächlich sichtbaren Reihen eingesetzt, „Als gesehen markiert“ behält sein Fachlimit von bis zu 100 Titeln, Prime Time ist zentral auf 20:15 Uhr Europe/Berlin festgelegt und Anbieter werden zentral in der Reihenfolge Movie Hub → Waipu → Joyn → übrige Provider alphabetisch präsentiert.

Die aktuelle Hauptreihenfolge lautet:

`#314 Mitteilungs-Erweiterungen (#384 als nächstes, danach #385) → #271/#336 Quellenplattform und weitere belastbare Quellen → Verfügbarkeitsdarstellung und Produkt-Finish → #112 Release-Gate → 1.0`

Das Mitteilungs-Grundpaket aus [#314](https://github.com/matthias-ennen/movie-hub/issues/314) ist am 12.10.2026 vollständig durch Matthias abgenommen: #118/#312/#380/#381/#382/#383 und `movie-hub-admin#11` sind geschlossen. Die letzte Bestätigung „Ja, das ist alles abgenommen“ umfasst sämtliche vier noch aufgeführten Restpunkte. Es besteht keine weitere Geräteabnahme für diesen Lieferumfang. Der [Tagesabschluss](docs/TITLE_NOTIFICATIONS.md#tagesabschluss-12102026) hält Nachweise und Fortsetzung fest. Nach Abschluss von #387 und #426 ist das analysierte E-Mail-Paket [#384](https://github.com/matthias-ennen/movie-hub/issues/384) das nächste vorgesehene Arbeitspaket: **Auch per E-Mail** je Profil für bestehende persönliche Meldungen, mit verlässlichem serverseitigem Versand und passenden Vorlagen. Der Nutzerwunsch erweitert den früheren Umfang „nur letzte TV-Erinnerung“. Noch kein Implementierungsstart; #314 bleibt Master für #384/#385. Details: [Mitteilungen](docs/TITLE_NOTIFICATIONS.md) und [Scheduler-Betrieb](docs/TV_FINAL_SCHEDULER_RUNBOOK.md).

**Abgenommen und abgeschlossen: #387.** Matthias hat den über #422/#424/#425 veröffentlichten Einstellungen-Stand am 13.10.2026 mit „Das ist abgenommen.“ bestätigt. Elf Direktwege in drei Gruppenkacheln, kompakte Überschriften/Breadcrumbs sowie gemeinsame Anbieter-/Senderregeln sind geliefert. Umsetzung, technische Nachweise und Abschluss: [Einstellungen](docs/SETTINGS.md).

**Abgenommen und abgeschlossen: [#426 – Detailseite aufräumen und verbessern](https://github.com/matthias-ennen/movie-hub/issues/426).** Matthias hat den veröffentlichten Stand `ddd0dbd` am 13.10.2026 um 19:05 Uhr (Europe/Berlin) zum Abschluss freigegeben. Geliefert sind Stift/Glocke/Schließen, Notiz und Gesehen-Datum im Bearbeitungsmenü, gemeinsame Kacheln und Dialog-/Fokusregeln, transparent schwebende Aktionen sowie die einheitliche Staffel-/Folgenauswahl mit bebilderter Übersicht. Umfang, Prüfungen und Abnahme: [Detailpaket](docs/_work/DETAIL_426.md).

Die Staffel-/Folgenkachel erscheint bei nutzbarem Episodenbestand. Unklare Folgen
bleiben ohne Vorauswahl und ohne erklärende Hinweise; die manuelle Navigation
bleibt erhalten. Unter „Wo anschauen?“ stehen nur Datum, Uhrzeit und Sender.
Staffel, Folge und Folgentitel werden ausschließlich in der Auswahlkachel geführt.
Joyn-/Waipu-Daten werden im gemeinsamen Import-/Nachtlauf abgeglichen, einschließlich
verifizierter TMDB-Sprachaliase und erhaltener Nummernkonflikte. Der Client lädt
die kompakte Staffelverfügbarkeit einmal je Sitzung und Episodenlisten bei Bedarf;
zusätzliche Anbieter-/TMDB-Abfragen in der App entfallen.

Für #426 ist keine weitere Paketabnahme offen. Spätere Schönheitskorrekturen
werden separat gesammelt. Der Abschlussnachtrag ändert nur Dokumentation und
Planung; er startet weder ein neues Umsetzungspaket noch einen App-Deploy.

Die vorgezogenen Korrekturen [#413 – persönliche Smart-Reihen](https://github.com/matthias-ennen/movie-hub/issues/413) und [#415 – Schauspielersuche](https://github.com/matthias-ennen/movie-hub/issues/415) sind über PR #414/#416 veröffentlicht. Beide nutzen vorhandene gemeinsame Titelmetadaten; es gibt keine zusätzlichen Abfragen beim Tippen oder je Posterreihe. Technische Prüfungen sind erfolgreich; Matthias hat beide Pakete am 12.10.2026 auf Smartphone und Fire TV ausdrücklich abgenommen. #413 und #415 sind geschlossen. Web-Suche und Reihen werden nach vollständigem App-Neustart geladen; neue native Importe mit vollständigen Besetzungsfacetten benötigen die neue APK. #329 bleibt Wartung; für öffentliche Verteilung gilt weiterhin #112.

Vor jedem Umsetzungspaket werden offene Produktfragen mit Matthias einzeln geklärt und anschließend im betreffenden Issue verbindlich dokumentiert.
