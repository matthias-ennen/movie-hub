# Movie Hub – Issue-Plan

Stand: 20. September 2026

## Arbeitsprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. Vor Beginn eines Pakets wird dessen Umfang noch einmal kurz fachlich und technisch überprüft. Bereits bekannte, gültige Katalogdaten dürfen durch nachgeladene oder partielle Metadaten nicht verschlechtert werden.

## Bereinigter aktueller Status

Zuletzt abgeschlossen bzw. abgenommen:

- #114 – großer Suchindex
- #178 – Staffeln/Folgen
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – Posterreihen-/D-Pad-Paket
- #207 – robuste persönliche TMDB-Synchronisierung
- #218 – Layout/UI-Konsistenz
- #222 – Einstellungen, Profilsteuerung und Sichtbarkeit
- #205 – Verschlüsselung persönlicher Daten und SMB-Konsolidierung
- #190 – automatische Hero-Trailer sowie nativer Trailer-/Teaser-Player
- #225 – verlustfreie Metadaten-Anreicherung
- #228 – robuster nativer Kaltstart
- #117 – Dependency-Audit und Security-Hygiene

Die Fire-TV-App wurde mit diesem Stand zuletzt am 18.09.2026 abgenommen.

## Aktuelles Arbeitspaket

### #4 – Öffentlichen Waipu-Live-Katalog aus dem Waipu-EPG erzeugen

- #4A: FreeEPG-Qualitätsprototyp abgeschlossen; Feed wegen veralteter Daten ungeeignet
- bisheriger Konto-/OAuth-Prototyp: dokumentierter Versuch, nicht mehr im
  kritischen Umsetzungspfad
- **#4B abgeschlossen:** vollständiger Sieben-Sender-/14-Tage-Nachweis,
  reale Film-/Seriendetails, TMDB-Stichprobe, ETag/304, Requestvolumen und
  Stop-Grenzen bestätigt
- **#4C abgeschlossen:** öffentlichen Read-only-Adapter und persistenten
  Sender-/Slot-/ETag-/Detailcache umgesetzt
- **#4D abgeschlossen:** rollierenden Import mit Requestbudget, Checkpoints,
  niedriger Parallelität, Backoff, Circuit Breaker und stufenweiser
  Senderfreigabe umgesetzt
- **#4E abgeschlossen:** Film-/Serienklassifikation, TMDB-Matching und
  `waipu-live`-Artefakte erzeugt
- **#4F abgeschlossen:** normales Waipu-Badge, feste Badge-Priorität und
  konkrete Sendetermine an vorhandenen Titeln umgesetzt
- **#4G technisch umgesetzt:** eigene TV-Registerkarte mit chronologischen
  Tagesreihen aus den senderweisen 14-Tage-Dateien; keine Senderauswahl auf der
  TV-Seite. Alle veröffentlichten Sender sind standardmäßig aktiv und können
  ausschließlich in den kontoweiten Einstellungen einzeln ausgeblendet werden
- **#4H technisch umgesetzt:** Die ersten 50 Sender der offiziellen
  Waipu-Reihenfolge sind mit stabilen IDs freigegeben. Der tägliche gemeinsame
  TMDB-/Waipu-/Firebase-Lauf, kontoweites Ein-/Ausschalten und die persönliche
  Pfeilsortierung sind umgesetzt. Der vollständige 50er-Lauf vom 19.09.2026
  lieferte 1.040 Titel, 7.903 Ausstrahlungen und 1.040/1.040 vollständige
  TMDB-Metadatensätze. Langzeitbeobachtung und Geräteabnahme bleiben offen
- **#4I technisch umgesetzt:** einzelne Waipu-Terminzeile unter
  „Wo anschauen?“, einheitliche TV-Posterkarten, zeitgenauer statischer
  `ON AIR`-Badge und vollständige „Gesehen“-Markierung für alle
  Anbieter-Aufrufe; gemeinsame Geräteabnahme bleibt offen
- keine Waiputhek-/VOD-Aussage aus linearen Sendeterminen ableiten
- keine Waipu-Anmeldung und keine Waipu-Token für die öffentliche Basisintegration

## Triage des Referenzstands APK 0.1.473

Die vollständige Sammlung steht in #254. Die strukturierte
[Bestandsaufnahme ab APK 0.1.473](APP_REVIEW_0.1.473.md) und das
Fortsetzungs-/Triage-Issue #255 bündeln sie in fünf vorläufige Pakete:

1. gemeinsame Inhaltsseiten-Grundlage und Fokus;
2. TV als zeitgesteuerte Videothek;
3. vollständige TV-Metadaten und schnelle Details;
4. Trailer und Teaser;
5. TV-Beobachtungen und Erinnerungen.

Für **Home, Filme, Serien, TV und Meine Inhalte** gilt verbindlich eine
gemeinsame technische Inhaltsseiten-Grundlage. Vor jedem daraus entstehenden
Umsetzungspaket werden die zugehörigen offenen Produktfragen Matthias erneut
einzeln vorgelegt. Die Paketvorschläge ändern die bestätigte Hauptpriorisierung
nicht automatisch; vor #118 wird gemeinsam entschieden, welche Korrekturen
zwingend davor liegen.

## Aktuelle Priorisierung

### 1. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Beobachten-Aktion direkt am Titel
- rent/buy-only bzw. aktuell nicht inklusive Titel beobachten
- Zustandswechsel zu `flatrate`, `free` oder `ads` erkennen
- Benachrichtigungen nur bei echten Änderungen
- Beobachtung einfach wieder entfernen

### 2. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

- persönliche Signale aus Bewertungen, gesehen/ungesehen, Favoriten und Watchlist nutzen
- persönliche Top-100- und Empfehlungsreihen erzeugen
- automatisierten, reproduzierbaren Job einrichten
- strukturierte Verfügbarkeitsdaten als Faktenbasis verwenden
- Ergebnisse ohne APK-Update aktualisieren

## Weitere spätere Themen

- #129 – Deutsch/Englisch-Umschaltung der Movie-Hub-GUI
- #112 – Compliance als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau

## Abhängigkeitskette

`#4A → #4B → #4C → #4D → #4E → #4F → #4G → #4H → #4I → Triage #254/#255 → #118 → #7`

#4 ist aktiv. Die 50er-Ausbaustufe wird funktional ausgeliefert und im Betrieb
weiter beobachtet. Eine spätere Ausweitung über 50 Sender bleibt eine eigene,
ausdrücklich freizugebende Stufe.

## Leitentscheidung

Der Waipu-Live-Ausbau verwendet die öffentlich und ohne Anmeldung erreichbaren
Waipu-Sender-, Grid- und Programmdetail-Endpunkte. Ein persönlicher Kontozugang
ist für den Basis-Katalog nicht erforderlich. Der Import läuft zentral,
budgetiert und gecacht; die App erhält ausschließlich fertige, bereinigte
Katalogartefakte. Die Schnittstelle ist nicht öffentlich dokumentiert, daher
bleiben Lastgrenzen, Langzeitstabilität und Rechteprüfung verbindliche Gates.
