# Movie Hub – Issue-Plan

Stand: 26. September 2026

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

## Aktuelle Priorisierung

### 1. #271 – gemeinsame Quellenplattform

**Jetzt.**

Erste umsetzbare Stufe:

1. bestehenden Waipu-Datenweg und seine Artefakte inventarisieren;
2. gemeinsames Adapter-Eingangsmodell definieren;
3. neutrales Sender-/Verfügbarkeitsereignis definieren;
4. Provider-/Wiedergabeziele vom Ereignis trennen;
5. gemeinsamen Quellenzustand mit Alter, Qualität, Fehlern und letzter gültiger Generation definieren;
6. Waipu auf diesen Vertrag abbilden, ohne sichtbare Produktfunktion zu verschlechtern;
7. Tests für Deduplizierung, Zeitgrenzen, mehrere Providerziele und Adapterausfall;
8. Vertrags- und Veröffentlichungsdokumentation aktualisieren.

**Definition of Done der ersten Stufe:** #280 kann einen zweiten Adapter implementieren, ohne den Movie-Hub-Kern oder den Waipu-Pfad quellenspezifisch umzubauen.

### 2. #280 – Joyn als erster zweiter Adapter

Unmittelbar danach:

1. Joyn-Senderinventur;
2. strukturierten EPG-Zugang und Nutzbarkeit prüfen;
3. Adapter auf den #271-Vertrag implementieren;
4. TMDB-Matching und neutrale Senderereignisse;
5. Waipu-/Joyn-Dubletten zusammenführen, Ziele getrennt erhalten;
6. echte Joyn-Ziele auf Smartphone, Tablet und Fire TV verifizieren;
7. begrenzten Pilot veröffentlichen, falls Daten- und Freigabegates erfüllt sind.

### 3. Weitere Adapter

Nach dem Joyn-Nachweis entstehen getrennte kleine Issues pro Quelle. Bevorzugt:

- offizielle ARD/ZDF-/Free-TV-Quellen
- geeignete FAST-/Free-TV-Anbieter
- weitere strukturierte Anbieterfeeds
- DVB-I nach belastbarer Zugangs-/Nutzbarkeitsprüfung

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

- #315 – Nachtlauf- und Frischeüberwachung
- #329 – Waipu-Restklassifizierung
- #312 – Mitteilungszentrale, Ende-zu-Ende-/Mehrgeräte-Restpunkte
- #118/#314 – Benachrichtigungen und spätere Anlässe
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

`#271 → #280 → weitere Adapter → Verfügbarkeitsdarstellung → Betriebs-/Produkt-Finish → #112 → 1.0`

#315 und #329 dürfen parallel laufen und blockieren die Hauptstrecke nicht.
