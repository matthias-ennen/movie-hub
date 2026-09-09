# Movie Hub – Abnahmestand 09.09.2026

## Entscheidung

Matthias hat den aktuellen Movie-Hub-Stand am 9. September 2026 **bis hierhin auf Smartphone, Tablet und Fire TV abgenommen**. Sollten später noch Auffälligkeiten entstehen, werden dafür neue Issues angelegt, statt bereits abgenommene Arbeitspakete wieder unscharf zu öffnen.

Mit der anschließenden Abnahme von #86 ist auch die erste Version der Seite **„Über Movie Hub“** abgeschlossen. Spätere gestalterische oder inhaltliche Überarbeitungen werden bei Bedarf als neue, klar abgegrenzte Issues angelegt.

## Abgenommener Funktionsumfang

### Android / Fire TV Shell

- eine gemeinsame APK für Smartphone, Tablet und Fire TV
- vollflächiges Startintro auf echtem App-Start
- schwarzer Startlayer mit MOVIE-HUB-Schriftlogo
- ca. 5 Sekunden statische Logoanzeige
- ca. 1 Sekunde CRT-/Röhrenfernseher-Abschaltung
- Startjingle beginnt ca. 1 Sekunde nach App-Start
- Intro und Jingle werden bei normaler Rückkehr aus dem Hintergrund nicht erneut abgespielt
- signierte Release-APK kann bestehende Installation aktualisieren

### Launcher-Grafiken

- normales Android-Launcher-Icon für Smartphone/Tablet
- separates TV-Banner in derselben APK
- blaues TV-Symbol ohne Antennen, mit zwei Füßen und weißer Play-Taste
- Fire-TV-Sideloading darf Launcher-Assets systembedingt anders darstellen; dies ist für den aktuellen Abnahmestand kein Blocker

### Bedienung

- Smartphone-/Tablet-Bedienung funktionsfähig
- Fire-TV-D-Pad, OK und Zurück funktionsfähig
- Profile und Profilwechsel funktionsfähig
- Detailansicht, Suche, Einstellungen und persönliche Inhalte nutzbar

### Eigene Movie-Hub-Inhalte

- eigene Links bleiben vom automatischen Provider-System getrennt
- Videos können über HTTP(S) oder SMB-/UNC-Quelle hinterlegt werden
- SMB-/FRITZ!NAS-Zugangsdaten bleiben gerätelokal geschützt
- native SMB2/3-Wiedergabe ist auf Fire TV nutzbar

### Persönliche TMDB-Verbindung

- persönlicher TMDB API Read Access Token wird gerätelokal geschützt gespeichert
- persönliche Session bleibt außerhalb von JavaScript, Firestore und Repository
- direkte Kontoanmeldung und Trennung funktionieren nativ
- dieselbe TMDB-Geräteverbindung wird von allen Movie-Hub-Profilen auf diesem Gerät verwendet

### Persönlicher TMDB-Katalog

- Favoriten und Watchlist für Filme und Serien können synchronisiert werden
- Titel werden über TMDB-ID + Medientyp dedupliziert
- TMDB Favoriten und TMDB Watchlist erscheinen als eigene Reihen
- Katalog ist accountweit, persönliche Movie-Hub-Zustände bleiben profilbezogen
- erneuter Sync kann entfernte TMDB-Zuordnungen bereinigen

### Automatische Anbieterbuttons

Unterstützte Anbieter:

- Netflix
- Prime Video
- Disney+
- YouTube
- waipu.tv

Zielhierarchie je Anbieter:

1. **Stufe 3:** Suchergebnisse mit bereits übergebenem Titel
2. **Stufe 2:** Anbieter-App öffnet direkt die Suchoberfläche
3. **Stufe 1:** richtige Anbieter-App öffnet zuverlässig
4. nur wenn keine passende App verfügbar ist: Web-Fallback

Die Paketlisten enthalten Android-/Android-TV- und reale Fire-TV-Varianten. Unterschiedliche Suchfähigkeiten der Fremd-Apps sind kein Blocker, solange die vereinbarte Mindestfunktion erreicht wird.

Für waipu.tv sind als stabile Ziele dokumentiert:

- Waiputhek: `https://app.waipu.tv/waiputhek`
- Das Erste / Live-TV: `https://www.waipu.tv/sender/das-erste/`

### Über Movie Hub

- eigener Menüpunkt **„Über Movie Hub“** zwischen Einstellungen und Abmelden
- native App-Version und `versionCode` werden aus der installierten APK gelesen
- Web-Build wird separat und automatisch ausgewiesen
- Plattforminformation für Android bzw. Fire TV
- GitHub-Projektlink über sicheren Öffnungsweg
- Hinweise zu TMDB, Firebase, Datenschutz und verwendeten Open-Source-Komponenten
- Browser-Fallback funktioniert ohne native APK-Informationen
- responsive und D-Pad-taugliche Darstellung

Technischer Stand der ersten Umsetzung:

- PR #108 in `main`
- CI #175 grün
- Firebase-Deploy #64 grün
- Android APK #100 grün

## Abgeschlossene Issues dieses Abnahmepakets

- #86 – „Über Movie Hub“-Seite mit Version, Build und Projektinformationen
- #87 – Persönliche TMDB-Verbindung in den Einstellungen sicher einrichten
- #90 – Persönlichen TMDB-Katalog aus Favoriten und Watchlist synchronisieren
- #94 – Movie-Hub-Startintro mit 5-Sekunden-Logo und CRT-Abschaltung
- #96 – Android: Startintro wirklich vollflächig anzeigen und Launcher-Icon erneuern
- #98 – Startjingle beim App-Start um 1 Sekunde verzögern
- #100 – YouTube-Anbieterbutton: native Suche vor HTTPS-Link versuchen
- #102 – Provider-Aufruf für Android und Fire TV vereinheitlichen
- #104 – Launcher-Icon und Fire-TV-Banner auf neues Movie-Hub-TV-Design umstellen

## Weiterhin offen

- #78 – übergeordnete Katalogarchitektur und spätere Anbieterkataloge
- #4 – Phase 5: Streaming-Verfügbarkeit und waipu.tv-Live-Badges
- #7 – Phase 6: Persönliche Empfehlungen, Top 100 und Automatisierung
- #8 – Ideen-Sammelstelle

## Nächstes Arbeitspaket

**#78 – Katalogarchitektur: TMDB-Katalog und anbieterspezifische Kataloge**

Die persönliche TMDB-Verbindung (#87) und der persönliche TMDB-Katalog (#90) sind bereits umgesetzt und abgenommen. Damit ist der nächste logische Schritt innerhalb von #78, die **Anbieterkataloge** sauber zu konkretisieren: Welche Titel gehören jeweils in Netflix-, Prime-Video-, Disney+-, YouTube- und waipu.tv-Kataloge, aus welchen strukturierten Quellen kommen diese Zuordnungen, wie groß sollen die Kataloge sein und wie bleiben Katalogzugehörigkeit, TMDB-Metadaten und aktuelle Verfügbarkeit technisch getrennt.

Für waipu.tv soll dabei die Trennung zwischen Mediathek/Waiputhek und linearem Live-TV ausdrücklich erhalten bleiben.

## Tagesabschluss 09.09.2026

Der Entwicklungsstand dieses Tages ist dokumentiert und abgenommen. Für heute erfolgen keine weiteren Funktionsänderungen. Die weitere Entwicklung setzt beim nächsten Termin mit #78 beziehungsweise einem daraus abgeleiteten konkreten Teil-Issue fort.
