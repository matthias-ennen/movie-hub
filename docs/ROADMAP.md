# Movie Hub – Roadmap

Stand: 12. September 2026

## Arbeitsprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte durchgeführt wurden; Fire-TV-bezogene Punkte benötigen zusätzlich eine manuelle Geräteabnahme. Später auftretende Auffälligkeiten werden nach einer bestätigten Abnahme grundsätzlich als neue Issues erfasst.

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

Status: abgeschlossen. Die reale Geräteabnahme wurde in #40 mit APK-Build #35 bestätigt; das übergeordnete Paket #3 ist geschlossen. Die Shell wurde anschließend um Startintro, Jingle, Launcher-Grafiken, SMB-, TMDB- und Providerfunktionen erweitert und am 09.09.2026 erneut auf Smartphone, Tablet und Fire TV abgenommen.

## Phase 4 – Deep Links und Provider-Auswahl

Für Netflix, Prime Video, Disney+, YouTube und waipu.tv jeweils testen:
1. bestmögliche Titelsuche mit dem TMDB-Titel
2. anbietereigene Such-/Startadresse
3. App-Start als Fallback
4. Web-Fallback

Abschlusskriterium: dokumentierte Testmatrix und stabile Fallback-Logik je Anbieter.

Status: Providerbuttons sind vollständig automatisch und können nicht durch benutzereigene Links überschrieben werden. Die gemeinsame Android-/Fire-TV-Fallback-Logik wurde mit #102 abgeschlossen und am 09.09.2026 abgenommen. Unterschiedliche Suchfähigkeiten der Fremd-Apps bleiben Best Effort.

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

### Abgeschlossenes Paket #65 – Automatische Anbieter von eigenen Links und Videos trennen

- Netflix, Prime Video, Disney+, YouTube und waipu.tv ausschließlich automatisch bestimmen
- keine editierbaren Anbieter-Links und keine Provider-Overrides
- eigener Movie-Hub-Button enthält ausschließlich benutzereigene Inhalte
- Bedienung über **Link hinzufügen** und **Video hinzufügen**
- HTTP(S)- und SMB-/UNC-Quelle bei Videos automatisch erkennen
- bestehende Daten verlustfrei migrieren

### Abgeschlossenes Paket #69 – Netzlaufwerke verwalten

- geräteweiter Einstellungsbereich über das Profilmenü
- Netzlaufwerke anlegen, bearbeiten, verbinden, prüfen, trennen und entfernen
- Erreichbarkeits- und Anmeldestatus mit verständlichem Text
- wahlweise verschlüsselte gerätelokale Speicherung oder nur aktuelle App-Sitzung
- Zugangsdaten bleiben vollständig außerhalb von Weboberfläche und Cloud

### Abgeschlossene persönliche TMDB-Pakete #87 und #90

- persönlicher API Read Access Token und persönliche TMDB-Session sicher gerätelokal
- Favoriten und Watchlist für Filme und Serien vollständig synchronisieren
- gemeinsamer persönlicher TMDB-Katalog für alle Movie-Hub-Profile eines Kontos
- Katalogzugehörigkeit bleibt getrennt von profilbezogenen Movie-Hub-Zuständen

### Abgeschlossenes UX-/Informationspaket #86 – Über Movie Hub

- eigener About-Bereich im Profilmenü
- native APK-Version und Build separat vom Web-Build anzeigen
- Projekt-, Daten-, Datenschutz- und Open-Source-Hinweise
- responsive und D-Pad-taugliche Darstellung
- erste Version am 09.09.2026 abgenommen; spätere Überarbeitungen werden getrennt behandelt

## Aktuelle Arbeitspakete – #170, #171 und #173

Die technische Hero-first-Grundlage aus #166/#168 und die Kaltstartkorrektur #169 sind integriert; die manuelle Geräteabnahme von #166 bleibt getrennt offen.

#170 erweitert die vorhandenen eigenen Links und Videos zum virtuellen Anbieter-Katalog **Movie Hub**:

- erster, standardmäßig aktiver Eintrag in der kontoweiten Anbieterwahl;
- automatisch abgeleiteter Katalog ohne zweiten manuellen Pflegeweg;
- eigene Reihen auf Home, Filme und Serien;
- gleiche Sichtbarkeitswirkung auf Badges, Detailbutton, Suche und Kategorien wie bei anderen aktivierten Anbietern;
- keinerlei Löschung eigener Inhalte beim Ausschalten.

#171 ergänzt darauf aufbauend:

- koordinierte, täglich reproduzierbare Hero-Auswahl mit unterschiedlichen Starttiteln auf Home, Filme und Serien;
- fünf profilbezogene Sortierlogiken für flexible Reihen;
- optionaler täglicher oder wöchentlicher Wechsel;
- profilbezogene Behandlung gesehener Titel;
- Trennung von vollständiger Kandidatenmenge und sichtbarem Reihenlimit als Vorbereitung auf größere spätere Katalogbestände.

#173 ergänzt vier dynamisch abgeleitete Top-10-Sonderreihen:

- Einbau nach der dritten tatsächlich sichtbaren Reihe auf Home, Filme, Serien und Meine Inhalte;
- rund 150 Prozent große Poster mit gut lesbarer Rangnummer 1 bis 10;
- anbieterübergreifende Rangaggregation ohne Behauptung offizieller Plattform-Charts;
- getrennte Film-, Serien- und gemischte Home-Liste;
- profilbezogene persönliche Liste mit Movie-Hub-Bewertung vor persönlicher TMDB-Bewertung und TMDB-Beliebtheit;
- keine neue Laufzeit-API, kein zusätzlicher Firestore-Zugriff je Poster und keine gespeicherte Rangliste.

## Danach vorgemerkt – #137 Sammlungen

#137 bleibt das eigenständige Konzept-/UX-Paket für gruppierte Sammlungen und eine mögliche Sammlungs-Detailseite. Nach der Produktentscheidung wird es in klar abgegrenzte technische Umsetzungspakete zerlegt. Die Performance-Grundlage aus #166 sollte möglichst vorher umgesetzt werden, weil Sammlungen zusätzliche inhaltsreiche Ansichten erzeugen können.

## Phase 6 – Personalisierung und Automatisierung

- persönliche Top 100 aus Bewertungen und Präferenzen
- „Heute für dich“
- ähnliche Filme
- noch nicht gesehen
- neue verfügbare Filme
- täglicher/regelmäßiger Empfehlungsjob
- strukturierte JSON-/Firestore-Ausgabe der Empfehlungen
- KI nur für Empfehlung/Einordnung, nicht für objektive Verfügbarkeitsfakten

### Abgeschlossenes Paket #163 – Persönliche Smart-Reihen

- bis zu zehn profilbezogene, selbst konfigurierte Posterreihen ausschließlich unter **Meine Inhalte**
- Filter nach Schauspieler/in, Regie/Serienschöpfer, Thema, Filmreihe oder Jahrzehnt
- stabile TMDB-IDs statt fehleranfälligem Namensvergleich
- automatische Aktualisierung aus dem aktuellen öffentlichen Katalog
- Anlegen, Bearbeiten, Aktivieren, Verschieben und Löschen per Touch, Tastatur und D-Pad
- Fokusbindung im Editor sowie Fokuswiederherstellung nach Speichern und Umschalten
- themengesteuerte Schalter und Zustände über die zentralen Layout-Tokens
- getrennt von den mit #156 abgeschlossenen Film- und Serienkategorien

Abschlusskriterium: Empfehlungen werden reproduzierbar aus aktuellen Filmdaten und persönlichen Signalen erzeugt und automatisch in Movie Hub sichtbar.

## Später / optional

- komfortable Geräte-Kopplung per Code/QR statt Texteingabe am TV
- Smartphone-optimierte Verwaltungsansicht
- Bewertungsverlauf
- Suche und Filter weiter ausbauen
- eigene Sammlungen
- Import/Export persönlicher Filmdaten
- vollständige Drittlizenz-/Impressums-/Datenschutzansicht für „Über Movie Hub“
