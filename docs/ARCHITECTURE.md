# Movie Hub – Architektur

Stand: 12. September 2026

## Ziel

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für mehrere Streaming-Dienste. Die Anwendung soll auf Fire TV laufen, Filme plattformübergreifend darstellen, persönliche Bewertungen und Listen speichern und Filme nach Möglichkeit direkt in der passenden Streaming-App öffnen.

## Systemübersicht

### GitHub
- Quellcode und Versionsverwaltung
- Issues, Roadmap und Projektdokumentation
- CI/CD-Workflows
- keine geheimen Schlüssel im Repository

### Firebase Hosting
- Hosting der zentralen Movie-Hub-Web-App
- dieselbe Web-App wird im Browser und innerhalb der Fire-TV-APK verwendet
- Deployments aus `main` liefern UI- und Katalogänderungen ohne APK-Neuinstallation aus

### Firebase Authentication
- zentrale Benutzeridentität für persönliche Daten
- Start mit E-Mail/Passwort
- später optional komfortablere Geräte-Kopplung für Fire TV

### Cloud Firestore
- persönliche Bewertungen
- gesehen / ungesehen
- Favoriten
- Watchlist / später ansehen
- persönliche Notizen
- persönliche Listen und daraus abgeleitete Empfehlungen
- kontoweit gemeinsame eigene Links und Videos je Titel
- Zugriff ausschließlich über definierte Security Rules

### TMDB
- stabile Filmreferenz über TMDB-ID
- deutsche Titel und Beschreibungen
- Poster und Backdrops
- Laufzeit, Genres, Bewertungen und Besetzung
- Watch-Provider-Daten soweit technisch und lizenzrechtlich geeignet

### Provider-Layer
Unterstützte Zielanbieter:
- Netflix
- Prime Video
- Disney+
- YouTube
- waipu.tv / lineares Fernsehen

Die Anbieter sind systemseitig und vollständig automatisch. TMDB bestimmt, welche Provider bei einem Titel angezeigt werden. Der Benutzer kann Anbieterbuttons weder bearbeiten noch mit eigenen Ziel-URLs überschreiben.

Auf Filmkarten werden nur kompakte Provider-Symbole eingeblendet. In der Detailansicht stehen die automatisch ermittelten Anbieter neben einem optionalen Movie-Hub-Button für eigene Inhalte.

### Eigene Movie-Hub-Inhalte

Der Movie-Hub-Button ist fachlich vom Provider-Layer getrennt. Unter ihm liegen ausschließlich vom Benutzer selbst hinzugefügte Inhalte:

- **Link**: HTTP(S)-Adresse, die in der passenden externen App beziehungsweise im Browser geöffnet wird
- **Video**: HTTP(S)-Video oder SMB-/UNC-Netzwerkvideo; das zugrunde liegende Protokoll wird automatisch aus der Adresse erkannt

SMB ist kein eigener Bedien- oder Medientyp. Zugangsdaten und Netzlaufwerksdefinitionen bleiben ausschließlich gerätelokal unter **Einstellungen → Netzlaufwerke**.

### Persönliche Smart-Reihen

Unter **Meine Inhalte** können interne Movie-Hub-Profile bis zu zehn eigene dynamische Posterreihen verwalten. Gespeichert wird jeweils eine profilbezogene Filterregel, keine feste Kopie von Titel-IDs. Die Reihen werden beim Laden aus dem aktuellen öffentlichen Katalog berechnet und aktualisieren sich dadurch mit jedem erfolgreichen Katalogwechsel automatisch.

Unterstützte Facetten sind Besetzung, Regie/Serienschöpfer, TMDB-Keyword, Film-Collection und Jahrzehnt. Der vertrauenswürdige Katalogjob verdichtet die dafür benötigten TMDB-Daten zu numerischen Facetten pro Titel sowie deduplizierten Auswahlverzeichnissen. Die Web-App erhält weder den serverseitigen noch einen persönlichen TMDB-Schlüssel.

Diese Smart-Reihen sind fachlich und technisch von den festen Film-/Serienkategorien sowie von Watchlist, Favoriten, Bewertungen und synchronisierten TMDB-Listen getrennt.

### Fire-TV-App
- schlanke Android-/Fire-OS-APK
- lädt die zentrale Web-App
- D-Pad-/Fernbedienungsnavigation
- native Bridge für Android Intents, App-Starts, Web-/YouTube-Links und SMB-Wiedergabe
- automatische Provider-Fallback-Kette: bestmögliche Titelsuche -> anbietereigene Such-/Startadresse -> App öffnen -> Web-Fallback
- YouTube behält seine auf Fire TV funktionierende HTTPS-Titelsuche als bevorzugten ersten Versuch

Die Titelsuche ist Best Effort. Ob eine fremde Anbieter-App externe Suchparameter verarbeitet, entscheidet die jeweilige App; Movie Hub garantiert deshalb nur den bestmöglichen Start, nicht die titelgenaue Zielseite.

### Hero-first-Renderpfad

Home, Filme, Serien und Meine Inhalte verwenden denselben gestuften Seitenaufbau:

1. Die endgültige Hero-Fläche und der Hero-Inhalt werden zuerst gemountet.
2. Das aktive Backdrop-Bild wird eager und mit hoher Priorität geladen.
3. Nach Bild-Load, Bildfehler, fehlendem Bild oder einem begrenzten Timeout wird zunächst genau eine Posterreihe freigegeben.
4. Weitere Reihen werden in Viewportnähe oder auf eine D-Pad-Anforderung einzeln ergänzt.
5. Posterbilder bleiben lazy und nachrangig; die Prüfung auf gemeinsame Movie-Hub-Medien startet erst, wenn eine Karte in die Nähe des Viewports gelangt.

Beim nativen Kaltstart gilt zusätzlich ein expliziter Handshake: Der anfänglich leere Katalog darf keine Hero-Bereitschaft melden. Erst wenn der echte Katalog verarbeitet, das Hero-Bild geladen beziehungsweise kontrolliert fehlgeschlagen und die erste Reihe über zwei Renderframes stabil gemountet ist, meldet die Web-App die Home-Oberfläche an Android. Die native Startfläche bleibt mindestens fünf Sekunden sichtbar. Nach spätestens zwölf Sekunden beendet sie die CRT-Sequenz in jedem Fall und zeigt bei ausbleibender Bereitschaft eine neutrale Fehleransicht mit Wiederholen-Aktion.

Der nicht fokussierbare Lade-Sentinel kann keine D-Pad-Sackgasse erzeugen. Fordert die Fernbedienung unterhalb der letzten bereits sichtbaren Reihe den nächsten Inhalt an, wird die nächste Reihe synchron zur Navigation freigegeben und ihr räumlich passendes Poster fokussiert.

### Automatisierung / KI
Objektive Fakten werden programmatisch ermittelt; KI erzeugt Empfehlungen, keine Verfügbarkeitsfakten.

Mögliche regelmäßige Jobs:
- Provider-Verfügbarkeit aktualisieren
- TV-/waipu-Daten aktualisieren
- neue Filme einordnen
- aus persönlichen Bewertungen neue Empfehlungen und Toplisten erzeugen

## Architekturprinzipien

1. Externe Filmdaten und persönliche Nutzerdaten strikt trennen.
2. Automatische Provider und benutzereigene Links/Videos strikt trennen.
3. Keine geheimen Zugangsdaten im Client oder öffentlichen Repository.
4. TV-first: Bedienbarkeit mit Fernbedienung ist Kernanforderung.
5. Web-App und APK klar trennen: Inhalte/Web-UI zentral, native Gerätefunktionen in der APK.
6. Provider-Verfügbarkeit und Deep-Link-/Suchfähigkeit sind zwei getrennte Probleme.
7. Firestore wird von Anfang an mit Authentication und restriktiven Regeln betrieben.
8. Erst belastbare Basis, danach Automatisierung und KI.

## Aktueller Infrastrukturstand

- GitHub-Repository: `matthias-ennen/movie-hub`
- Firebase-Projekt: `movie-hub`
- Firebase Project ID: `movie-hub-62459`
- Web-App: `movie-hub-web`
- Firestore: Standard Edition, Region `europe-west3` (Frankfurt), Produktionsmodus
- Firebase Authentication: E-Mail/Passwort aktiviert
- TMDB: täglicher Katalog und deutsche Watch-Provider-Daten integriert

## Noch bewusst offen

- weitere belastbare App-spezifische Such-/Deep-Link-Verbesserungen je Anbieter
- geeignete Quelle für deutsches Live-TV/EPG
- endgültige Darstellung und Branding der Provider-Symbole
- genaue Form der täglichen Empfehlungsautomation
- Geräte-Kopplung ohne Texteingabe auf Fire TV
