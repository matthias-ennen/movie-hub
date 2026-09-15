# Movie Hub – Roadmap

Stand: 15. September 2026

## Leitprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn die technischen Prüfpunkte erfüllt sind; Fire-TV-bezogene Änderungen benötigen zusätzlich die vereinbarte manuelle Geräteabnahme.

Für die nächste Entwicklungsstrecke gilt ausdrücklich:

1. **Stabilität vor neuen Komfortfunktionen**
2. **Datenkonsistenz vor weiterer UI-Komplexität**
3. **Security-Hygiene vor öffentlicher Verteilung**
4. Änderungen an derselben kritischen Navigation oder Datenstruktur möglichst nacheinander statt parallel

## Bereits erreichte Grundlage

### Phase 0 – Fundament

Abgeschlossen:

- Firebase Hosting und Authentication
- Firestore-Datenmodell und Security Rules
- React/Vite-Web-App
- CI-/Deployment-Pipeline
- TMDB-Secret-Strategie

### Phase 1 – TV-optimierte Oberfläche

Weitgehend abgeschlossen und produktiv genutzt:

- Streaming-artige Hauptseiten
- Hero-Bereiche
- horizontale Posterreihen
- D-Pad-/Tastatur-/Touch-Navigation
- Detailansichten
- Providerdarstellung
- responsive Smartphone-/Tablet-/TV-Oberfläche

### Phase 2 – Filmdaten und persönliches Filmgedächtnis

Weitgehend abgeschlossen:

- TMDB-Metadaten, Poster, Backdrops, Cast, Genres und Laufzeiten
- Bewertung, gesehen/ungesehen, Favorit, Watchlist
- persönliche Notizen
- profilbezogene Zustände
- persönlicher TMDB-Katalog

### Phase 3 – Android-/Fire-TV-App

Abgeschlossen und mehrfach auf realen Geräten geprüft:

- Android-/Fire-OS-WebView-Shell
- native Bridge
- Jingle und Startintro
- CRT-/Startübergang
- signierte Update-APK
- SMB-/Media3-Wiedergabe
- lokale geschützte SMB-Zugangsdaten
- getrennte Smartphone-/Tablet- und Fire-TV-Launcher-Komponenten

#202 zur getrennten Launcher-Grafik wurde am 15.09.2026 manuell abgenommen und geschlossen.

### Phase 4 – Deep Links und Provider

Abgeschlossen:

- automatische Providerbuttons
- Netflix, Prime Video, Disney+, YouTube, waipu.tv und weitere unterstützte Anbieter
- native App-/Such-/Web-Fallbacks
- keine benutzerdefinierten Overrides für externe Anbieter
- eigene Links und Videos bleiben im virtuellen Anbieter **Movie Hub** getrennt

### Phase 5 – Katalog, Verfügbarkeit und Datenqualität

Große Teile sind bereits umgesetzt:

- tägliche automatische Katalogaktualisierung
- deutscher Providerbestand
- separater großer Suchindex
- `flatrate`, `free`, `ads`, `rent` und `buy`
- Lazy-/Shard-basierte vollständige Detaildaten
- rollierende Aktualisierung vollständiger Suchdetails
- Staffel-/Episodendaten als getrennte Katalogdaten
- Datenfüllstand unter **Über Movie Hub**

#196 und #200 bilden die aktuelle Datenqualitäts-/Statusgrundlage. #196 wurde am 15.09.2026 manuell abgenommen und geschlossen.

Noch offen in Phase 5 ist insbesondere der spätere Ausbau von **linearem Fernsehen / waipu.tv / EPG** aus #4.

## Integrierte Funktionen mit noch offenen formalen Abnahmen

Einige Issues sind technisch längst auf `main`, aber formal noch offen. Sie sind kein Anlass für eine erneute Implementierung, sondern müssen bereinigt beziehungsweise gezielt nachgetestet werden:

- #134 – Kaltstart-/WebView-Absicherung
- #150 – TMDB-Bewertungsreihe
- #166 – Hero-first Rendering und progressive Reihen
- #170 – Movie Hub als eigener Anbieter-Katalog
- #171 – profilgebundene Kuratierung

#173 (Top-10-Sonderreihen), #137/#181 (Filmreihen und Movie-Hub-Metadaten) sowie weitere zugrunde liegende Pakete sind bereits integriert beziehungsweise abgenommen.

## Aktuelle Entwicklungsreihenfolge

### 1. #185 – Firestore-IAM-Backfill sauber aktivieren

Kleines vorbereitendes Betriebs-/Security-Paket:

- minimal notwendige Firestore-Berechtigungen für das Deployment-Dienstkonto
- keine pauschale Owner-/Editor-/Datastore-Admin-Rolle
- Workload Identity Federation beibehalten
- administrativen Backfill ohne `PERMISSION_DENIED` testen

Dieser Wartungspfad ist später für Datenmigrationen und Backfills nützlich.

### 2. #191 – Fire-TV-Stabilität, Navigation und Posterlast

**Nächstes großes Arbeitspaket.**

Ziel:

- bekannte Fire-TV-Abstürze beim Hauptseitenwechsel diagnostizieren und beseitigen
- posterweise Firestore-Fallback-Reads entfernen
- Movie-Hub-Präsenz zentralisieren
- D-Pad-Repeat kontrollieren
- gestapelte Scrollbewegungen verhindern
- Hero-Preloading beruhigen
- Speicher-/Renderer-Verhalten auf beiden Fire TV Sticks messen
- horizontale Posterbegrenzung nur bei nachgewiesenem Bedarf

#191 ist Voraussetzung für die endgültige Fire-TV-Abnahme von #178 und die spätere Schleifennavigation aus #195.

### 3. #178 – Staffeln und Folgen final abnehmen

Die Daten- und Staffelnavigation ist bereits integriert. Die **aktuell gültige Produktentscheidung** lautet:

- Staffeln sind auswählbar.
- Die Folgen einer Staffel werden in einer scroll-/navigierbaren Liste angezeigt.
- Die Folgenliste dient ausschließlich zum Durchblättern und Informieren.
- Eine Folge ist **nicht anklickbar/öffnbar**.
- Das Navigieren durch Folgen verändert die Serien-Detailseite nicht.
- Serientitel und Serienbeschreibung bleiben unverändert stehen.

Die frühere Idee einer Episoden-Detailansicht ist damit verworfen.

Nach #191 wird dieses endgültige Verhalten auf Smartphone, Tablet und Fire TV abgenommen und #178 geschlossen.

### 4. #114 – Großen Suchindex endgültig abschließen

Die wesentliche Sucharchitektur ist bereits umgesetzt und der Datenbestand liegt in der geplanten Größenordnung. Nach stabiler Fire-TV-Basis folgt nur noch eine abschließende Bestands-/Performanceprüfung gegen die Abnahmekriterien von #114.

Ziel ist, #114 danach zu schließen und keine neue Sucharchitektur zu beginnen, solange die bestehende Lösung die Zielgröße zuverlässig trägt.

### 5. #117 – Dependency-Audit

Danach Security-Hygiene auf stabiler Laufzeitbasis:

- aktuellen npm-Audit-Stand neu ermitteln
- Critical-/High-Funde bewerten und soweit möglich beseitigen
- verbleibende Findings dokumentieren
- vollständige Web-/Firebase-/Android-Regression

Die Reihenfolge nach #191 ist bewusst gewählt, damit Dependency-Updates die Diagnose des bestehenden Fire-TV-Problems nicht verfälschen.

### 6. #205 – Persönliche Klartextdaten in Firestore verschlüsseln

Festgelegtes Modell:

- keine Ende-zu-Ende-Verschlüsselung
- keine Gerätefreigabe und kein Recovery Key
- appseitiger gemeinsamer Schlüssel
- AES-256-GCM mit zufälligem IV/Nonce und `cryptoVersion`

Verschlüsselt werden mindestens:

- `sharedMedia.entries.url`
- `sharedMedia.entries.label`
- persönliche `note`

Bestehende Klartextdaten werden verlustfrei migriert. Öffentliche TMDB-/Katalogdaten bleiben bewusst lesbar. Der Schlüssel soll nach Möglichkeit über die native Android-/Fire-TV-Schicht bereitgestellt werden und nicht unnötig im öffentlichen Web-Bundle liegen.

### 7. #195 – 50 Poster und bedingt zyklische Navigation

Erst nach #191:

- reguläre Reihen auf maximal 50 Titel erweitern
- beim ersten Betreten bleibt der linke Rand geschlossen
- erst der Sprung vom letzten Poster nach rechts zum ersten schaltet die Schleife frei
- danach direkter Umlauf in beide Richtungen
- Verlassen der Reihe nach oben/unten setzt die Freigabe zurück
- keine lange Smooth-Scroll-Fahrt über alle Zwischenposter

### 8. #176 – Sichtbarkeit von Inhaltsbereichen je Profil

Danach kann die Oberfläche weiter individualisiert werden. Vor Implementierung wird eine überschaubare Seiten-/Modulmatrix festgelegt. Bereits vorhandene Provider-, Kategorie-, Smart-Reihen- und Sortiereinstellungen dürfen nicht doppelt konfiguriert werden.

### 9. #190 – Optionale Trailer im Hero

Spätere Komfortfunktion, erst nach stabiler Fire-TV-Performance. Vor Umsetzung müssen Verzögerung, Ton, Einstellungsbereich und Player-Verhalten verbindlich entschieden werden.

### 10. #4 – Live-TV-/waipu-Ausbau

Die allgemeine Streaming-Verfügbarkeit wird nicht neu gebaut. Das alte Phase-5-Issue wird auf die tatsächlich noch offenen Funktionen konzentriert:

- lineares Fernsehen
- EPG/Sendezeiten
- waipu.tv-Live-Status
- belastbare Aktualisierung und Attribution

### 11. #118 – Benachrichtigen, wenn ein Titel inklusive wird

Aufbauend auf stabilem Provider-/Suchindex:

- beobachtete Titel nutzerbezogen speichern
- Wechsel von `rent`/`buy`/nicht inklusive zu `flatrate`/`free`/`ads` erkennen
- nur echte Zustandsänderungen melden
- einfache Ein-Klick-Bedienung

### 12. #7 – Persönliche Empfehlungen und Top 100

Spätere Phase 6:

- persönliche Top 100
- „Heute für dich“
- ähnliche Titel
- noch nicht gesehen
- regelmäßige Empfehlungsjobs
- KI nur für Empfehlung und Einordnung, nie für objektive Verfügbarkeitsfakten

### 13. #129 – Deutsch/Englisch

Internationalisierung erst dann, wenn die deutschsprachige Funktionsoberfläche weitgehend stabil ist. Dadurch müssen während der aktiven Produktentwicklung nicht ständig doppelte GUI-Texte nachgezogen werden.

### 14. #112 – Compliance als Release-Gate

Vor einer öffentlichen oder kommerziellen Verteilung müssen unter anderem abgeschlossen sein:

- TMDB-/JustWatch-Attribution und Nutzungsbedingungen
- Marken-/Logo-Prüfung
- Datenschutz/DSGVO
- Impressum/Anbieterkennzeichnung
- OSS-/Drittlizenzen
- Security-/Dateninventur

#112 läuft als Querschnittsthema mit; einzelne technische Punkte werden bereits früher über #117, #185 und #205 bearbeitet.

## Dauerhaft offen

#8 bleibt als Ideen-Sammelstelle bestehen. Umsetzungsreife Ideen werden daraus in klar abgegrenzte Issues überführt.

## Abhängigkeitskette der nächsten Pakete

`#185 → #191 → #178 → #114 → #117 → #205 → #195`

Danach folgen die voneinander weniger abhängigen UX-/Produktpakete `#176`, `#190`, `#4`, `#118`, `#7` und `#129`.

## Später / optional

- komfortable Geräte-Kopplung per Code/QR
- Smartphone-optimierte Verwaltungsansicht
- Bewertungsverlauf
- eigene Sammlungen
- Import/Export persönlicher Filmdaten
- zusätzliche Verwaltungs- und Diagnosefunktionen
