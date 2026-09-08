# Movie Hub – Roadmap

Stand: 8. September 2026

## Arbeitsprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte durchgeführt wurden; Fire-TV-bezogene Punkte benötigen zusätzlich eine manuelle Geräteabnahme.

## Phase 0 – Fundament

Ziel: belastbare technische Grundlage schaffen, bevor UI und Integrationen wachsen.

- Architektur dokumentieren
- Firebase-Projekt konfigurieren
- Firestore-Datenmodell festlegen
- Firebase Authentication aktivieren
- Firestore Security Rules implementieren und testen
- Firebase Hosting einrichten
- React/Vite-Grundgerüst anlegen
- Deployment-Pipeline vorbereiten
- TMDB-Zugang einrichten und Secret-Strategie festlegen

Abschlusskriterium: Eine minimale Web-App wird sicher über Firebase Hosting ausgeliefert; Anmeldung funktioniert; ein angemeldeter Nutzer kann ausschließlich seinen eigenen Testzustand in Firestore lesen/schreiben.

## Phase 1 – TV-optimierte Oberfläche

- Streaming-artige Startseite
- Hero-Bereich
- horizontale Filmreihen
- Poster-Karten
- Provider-Symbole als Overlay
- D-Pad-/Tastaturnavigation
- sichtbarer Fokuszustand
- Film-Detailansicht
- Provider-Auswahlmenü bei mehreren Diensten

Abschlusskriterium: Oberfläche ist im Desktop-Browser und in 1280×720 sowie 1920×1080 sinnvoll bedienbar.

## Phase 2 – Echte Filmdaten und persönliches Filmgedächtnis

- TMDB-ID als Referenz
- deutsche Metadaten, Poster, Backdrops, Cast, Laufzeit, Genres
- Bewertung 1–10
- gesehen / ungesehen
- Favorit
- später ansehen
- Datum gesehen
- persönliche Notiz
- persönliche/systemische Listen

Abschlusskriterium: Filmzustände bleiben nach Neustart erhalten und sind für denselben Benutzer geräteübergreifend abrufbar.

## Phase 3 – Fire-TV-App

- Android-/Fire-OS-Projekt
- schlanke APK mit WebView/native Bridge
- D-Pad, OK und Zurück
- App-Lifecycle und Fokuswiederherstellung
- Sideloading auf mindestens einem Fire TV Stick HD
- Test auf weiteren verfügbaren Fire-TV-Geräten

Abschlusskriterium: Movie Hub startet als APK zuverlässig und ist vollständig mit der Fire-TV-Fernbedienung bedienbar.

Status: abgeschlossen. Die reale Geräteabnahme wurde in #40 mit APK-Build #35 bestätigt; das übergeordnete Paket #3 ist geschlossen.

## Phase 4 – Deep Links und Provider-Auswahl

Für Netflix, Prime Video, Disney+, YouTube und waipu.tv jeweils testen:
1. bestmögliche Titelsuche mit dem TMDB-Titel
2. anbietereigene Such-/Startadresse
3. App-Start als Fallback
4. Web-Fallback

Abschlusskriterium: dokumentierte Testmatrix und stabile Fallback-Logik je Anbieter.

Status: #50 wurde mit APK-Build #39 auf realer Fire-TV-Hardware abgenommen. Die Providerbuttons bleiben vollständig automatisch und können nicht durch benutzereigene Links überschrieben werden. Weitere Best-Effort-Verbesserungen der automatischen Titelsuche werden getrennt in #75 behandelt.

## Phase 5 – Dynamische Verfügbarkeit

- Streaming-Verfügbarkeit Deutschland
- mehrere Anbieter pro Film
- Provider-Overlays dynamisch aktualisieren
- lineares TV/waipu.tv getrennt modellieren
- „heute im Fernsehen“ / Zeitangaben
- Datenquelle und Attribution dokumentieren

Abschlusskriterium: Verfügbarkeit ist nachvollziehbar aktualisiert und UI behandelt fehlende/mehrdeutige Daten sauber.

### Abgeschlossenes Paket #53 – Automatische TMDB-Katalogaktualisierung

- täglicher GitHub-Actions-Job für den öffentlichen Katalog
- aktuelle Trend-, Neuheiten- und Popularitätsreihen für Filme und Serien
- deutsche Anbieter-Verfügbarkeit als Auswahlkriterium
- atomare Veröffentlichung: bei Fehler bleibt der letzte Live-Katalog bestehen
- persönliche Listen bleiben unabhängig von wechselnden Entdeckungsreihen sichtbar

### Abgeschlossenes Paket #57 – Trailer, Teaser und gemeinsame Movie-Hub-Medien

- automatische Trailer-/Teaser-Referenzen aus TMDB, bevorzugt deutsch und offiziell
- gemeinsame manuelle Web- und Video-URLs je Titel, sichtbar in allen internen Profilen
- Movie Hub als eigener Anbieterbutton mit Direkteinstieg oder Auswahl bei mehreren Einträgen
- integrierter Video-Player für HTTP(S)-Quellen, soweit Container und Codec vom Gerät unterstützt werden
- Bearbeiten und Löschen der gemeinsamen Einträge aus jedem Profil
- D-Pad- und Zurück-Verhalten für Auswahl, Verwaltung und Player

### Abgeschlossenes Paket #62 – SMB-/FRITZ!NAS-Medien

- stabile `smb://`- oder eindeutig umwandelbare UNC-Pfade als gemeinsame Medienquelle je Titel
- Referenzsystem: an einer FRITZ!Box angeschlossene, per SMB freigegebene Festplatte
- Zugangsdaten ausschließlich geschützt auf dem jeweiligen Android-/Fire-TV-Gerät
- nativer SMB2/3-Abruf und Wiedergabe über den gepufferten Media3-Player
- klare Fehlerzustände für fehlendes Heimnetz, Anmeldung und nicht erreichbare Dateien
- vollständig mit der signierten APK Build #43 auf realer Fire-TV-Hardware abgenommen

### Aktuelles Paket #65 – Automatische Anbieter von eigenen Links und Videos trennen

- Netflix, Prime Video, Disney+, YouTube und waipu.tv ausschließlich aus TMDB bestimmen
- keine editierbaren Anbieter-Links und keine Provider-Overrides mehr
- eigener Movie-Hub-Button enthält ausschließlich benutzereigene Inhalte
- Bedienung nur noch über **Link hinzufügen** und **Video hinzufügen**
- HTTP(S)- und SMB-/UNC-Quelle bei Videos automatisch erkennen
- bestehende Provider-Links als normale Links und bestehende SMB-Typen als Videos migrieren, ohne URLs oder Einträge zu löschen
- technische Tests automatisieren; reale Android-/Fire-TV-Bedienung anschließend manuell abnehmen

### Aktives Paket #69 – Netzlaufwerke verwalten

- eigener geräteweiter Einstellungsbereich über das Profilmenü
- Netzlaufwerke anlegen, bearbeiten, verbinden, prüfen, trennen und entfernen
- Erreichbarkeits- und Anmeldestatus mit Farbe und verständlichem Text
- wahlweise verschlüsselte gerätelokale Speicherung oder nur aktuelle App-Sitzung
- Zugangsdaten bleiben vollständig außerhalb von Weboberfläche und Cloud
- bestehende Netzwerkvideos werden über Server, Port und Freigabe zugeordnet

## Phase 6 – Personalisierung und Automatisierung

- persönliche Top 100 aus Bewertungen und Präferenzen
- „Heute für dich“
- ähnliche Filme
- noch nicht gesehen
- neue verfügbare Filme
- täglicher/regelmäßiger Empfehlungsjob
- strukturierte JSON-/Firestore-Ausgabe der Empfehlungen
- KI nur für Empfehlung/Einordnung, nicht für objektive Verfügbarkeitsfakten

Abschlusskriterium: Empfehlungen werden reproduzierbar aus aktuellen Filmdaten und persönlichen Signalen erzeugt und automatisch in Movie Hub sichtbar.

## Später / optional

- komfortable Geräte-Kopplung per Code/QR statt Texteingabe am TV
- mehrere Profile
- Smartphone-optimierte Verwaltungsansicht
- Bewertungsverlauf
- Suche und Filter
- eigene Sammlungen
- Import/Export persönlicher Filmdaten
