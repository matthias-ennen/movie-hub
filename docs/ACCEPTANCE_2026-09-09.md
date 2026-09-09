# Movie Hub – Abnahmestand 09.09.2026

## Entscheidung

Matthias hat den aktuellen Movie-Hub-Stand am 9. September 2026 **bis hierhin auf Smartphone, Tablet und Fire TV abgenommen**. Sollten später noch Auffälligkeiten entstehen, werden dafür neue Issues angelegt, statt bereits abgenommene Arbeitspakete wieder unscharf zu öffnen.

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

## Abgeschlossene Issues dieses Abnahmepakets

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
- #8 – Ideen-Sammelstelle
- weitere langfristige Phasen-/Backlog-Issues

## Nächstes Arbeitspaket

**#86 – „Über Movie Hub“-Seite mit Version, Build und Projektinformationen**

Ziel ist eine TV-taugliche About-Seite mit klar getrennten Angaben für native APK und zentral ausgelieferte Web-Oberfläche, Projekt-/Datenhinweisen sowie sauberer D-Pad-/Zurück-Navigation.
