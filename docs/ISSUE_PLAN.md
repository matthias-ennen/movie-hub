# Movie Hub – Issue-Plan

Stand: 12. Oktober 2026

## Arbeitsprinzip

Die aktive Planung enthält nur noch echte Arbeitspakete. Historische Bestandsaufnahmen werden nach Überführung ihrer Restpunkte geschlossen. Große Sammelissues werden vermieden, wenn ein klarer technischer Rest als kleineres Paket separat geführt werden kann.

## Bereinigter Status

Am 26.09.2026 wurden folgende Planungsaltlasten bereinigt:

- #225 nach bestätigter Fire-TV-Abnahme geschlossen
- #254 und #255 geschlossen; verbliebene Trailer-/Teaser-Themen nach #328 verschoben
- #260 nach vollständiger Abnahme der produktiven 228-Sender-Stufe geschlossen
- #329 für die verbleibende Waipu-Restklassifizierung angelegt
- Fire-TV-Abnahme für #312/#118 dokumentiert
- Fire-TV-Abnahme der ersten Top-100-Stufe aus #7 dokumentiert

Am 12.10.2026 zusätzlich abgeschlossen:

- #118/#381/#312 – alle vier Restpunkte mit „Ja, das ist alles abgenommen“ bestätigt; keine offene Geräteabnahme der Mitteilungs-Grundstrecke.

- #383 – aktive Beobachtungen unter Einstellungen → Mitteilungen, einschließlich Profilwechsel und geräteübergreifendem Ausschalten.
- `movie-hub-admin#11` – Übersicht mit Status/Gültigkeit, Abbrechen und kontrollierte Rücknahme; ausdrücklich mit „Ja, das nehme ich so ab. Das ist fertig.“ bestätigt.

- #382 – TV-Erinnerungskette für Film und ganze Serie; die fünf offenen Prüfpunkte ausdrücklich mit „1 bis 5 abgenommen“ bestätigt, Zeitverhalten und automatischer Abschluss zuvor bestätigt.
- #413 – persönliche Smart-Reihen aus dem vollständigen zusammengeführten Bestand; PR #414 veröffentlicht, Geräteabnahme bestätigt.
- #415 – Schauspielersuche; PR #416 veröffentlicht, Geräteabnahme bestätigt.

Matthias bestätigte den gemeinsamen Josh-Hartnett-/„30 Days of Night“-Abnahmeschritt auf Smartphone und Fire TV ausdrücklich mit „Abgenommen“. Beide Issues sind geschlossen; die Hauptstrecke #314 bleibt unverändert.

## Aktuelle Priorisierung

### 1. #314 – Mitteilungs-Erweiterungen

Das Grundpaket #118/#312/#380/#381/#382/#383 einschließlich
`movie-hub-admin#11` ist vollständig abgenommen und abgeschlossen.

1. **#384:** aktuell ausschließlich technische Analyse/Aufwandsschätzung für
   **Auch per E-Mail** je Profil, Default aus. Persönliche Inklusiv-,
   TV-Fund- und letzte TV-Meldungen; Erweiterung des früheren Umfangs.
   Gemeinsamer Backend-Versand, Vorlagen, Absender/Versanddienst,
   Deduplizierung und Tests. Noch keine Implementierung.
2. **#385:** weitere Anlässe anschließend einzeln priorisieren.

Konsolidierter Abschluss und Analyse:
[TITLE_NOTIFICATIONS.md](TITLE_NOTIFICATIONS.md#tagesabschluss-12102026).

### 2. Betriebsnachtrag Waipu/Joyn vom 07.10.2026

Auf ausdrücklichen Auftrag von Matthias vorgezogen; unter #271 als Ergänzung
zu den abgeschlossenen #280/#315 dokumentiert, ohne neues eigenes Issue.

- Joyn-Vollaufbau über 14 Tage und 56 Fenster erfolgreich veröffentlicht;
- dauerhafte Checkpoints und inkrementeller TMDB-Pfad;
- gespeicherter Fehlerschutz, differenzierter Bericht und fünf öffentliche Prüfpunkte;
- Restore des größeren vollständigen Joyn-Titelbestands korrigiert;
- 837 Unit-Tests, 17 Firestore-Regeltests, CI, APK und finaler Code-Deploy erfolgreich.

**Aktualisierung 12.10.2026:** Nach #411/#412 bestätigt der reguläre
[Nachtlauf 38191419867](https://github.com/matthias-ennen/movie-hub/actions/runs/38191419867)
normale Budgets, gesicherte Checkpoints, vollständigen TMDB-Verbraucherabschluss
und frische gemeinsame öffentliche Daten. Start 03:19 statt 00:17 Uhr Europe/Berlin:
182 Minuten Verzögerung, deshalb kein Nachweis pünktlicher Ausführung.
Nachweise: [DATA_WORKFLOW_RELIABILITY.md](DATA_WORKFLOW_RELIABILITY.md).
Dieser Betriebspunkt ersetzt die Produkt-Hauptstrecke #314 nicht.

### 3. #271 – Quellenplattform und weitere Adapter danach

Die erste gemeinsame Waipu-/Joyn-Stufe ist belegt; #280 ist abgeschlossen.
Weitere Quellen bleiben getrennte Recherche-/Pilotpakete, unter anderem:

- #336 – DVB-I-Pilot;
- #388 – YouTube-Playlist-/Publisher-Quellen;
- #391 – Prime-Video-GTI-Links und möglicher Adapter;
- weitere offizielle Free-TV-/FAST-Quellen nach Zugangs- und Datenvertragsprüfung.

Die Anlage eines Quellenissues priorisiert es nicht automatisch vor #314.

### 4. Verfügbarkeitsdarstellung als Produktkern

Nach den ersten zusätzlichen Adaptern ein eigenes Paket bilden für die konsistente Darstellung und Priorisierung von:

- flatrate
- free
- ads
- rent
- buy
- kommende TV-Ausstrahlung
- laufende TV-Ausstrahlung
- eigener Movie-Hub-Inhalt

Ziel: Ein Nutzer erkennt unmittelbar, ob ein Titel ohne Einzelkauf verfügbar ist oder bald kostenlos im TV läuft.

## Parallel / nicht blockierend

- #329 – Waipu-Restklassifizierung
- #386 – verbleibende Fire-TV-Navigations-Freezes; eigenes Folgepaket nach #346
- #387 – Inventur, Fokus und Navigation der Einstellungen
- #7 – Empfehlungen/Automatisierung; Top-100-Stufe bereits abgenommen
- #328 – Trailer/Teaser-Finish
- #327 – TMDB-Kontosynchronisation, später
- #129 – Deutsch/Englisch, später
- #223 – Provisorien/Rückbau
- #8 – Ideensammlung
- #308 – Zukunftsvision

## Release 1.0

Vor öffentlicher Veröffentlichung:

- ausreichend breites und ausfallsicheres Quellenfundament
- klare Verfügbarkeitsdarstellung
- stabile Nachtläufe und Adapterzustände
- Geräteabnahmen auf Smartphone, Tablet und Fire TV
- wesentliche Provisorien bereinigt
- #112 Compliance vollständig bearbeitet bzw. extern freigegeben, wo erforderlich

## Aktuelle Abhängigkeitskette

`#314 (Grundpaket abgenommen; #384 Analyse, anschließend #385) → #271/weitere Adapter → Verfügbarkeitsdarstellung und Produkt-Finish → #112 → 1.0`

#280, #315, #346, #118, #312, #380, #381, #382, #383 und `movie-hub-admin#11` sind abgeschlossen. Die reguläre Datenfortschreibung
ist bestätigt; Startverzögerungen bleiben unter Beobachtung. #329 bleibt Wartung. Movie Hub Admin bleibt ein getrenntes Repository;
die bereits abgenommene Rücknahme wird nicht erneut als zukünftige Arbeit geführt.
