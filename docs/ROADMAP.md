# Movie Hub – Roadmap

Stand: 18. September 2026

## Leitprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte und erforderliche manuelle Geräteabnahmen erfüllt sind.

Für die nächste Entwicklungsstrecke gilt:

1. **Datenintegrität vor neuen Produktfeatures absichern.**
2. **Security-/Dependency-Hygiene anschließend bereinigen.**
3. Danach wieder sichtbare Produktfeatures in klaren Paketen weiterentwickeln.
4. Vor Beginn jedes größeren Pakets wird dessen Scope noch einmal fachlich und technisch überprüft.
5. Der veröffentlichte Movie-Hub-Katalog ist der kanonische Ist-Zustand für öffentliche Titelmetadaten; Laufzeit-Anreicherungen dürfen gültige Katalogdaten nicht verschlechtern.

## Aktuell abgeschlossener Stand

Zu den zuletzt abgeschlossenen bzw. abgenommenen Paketen gehören insbesondere:

- #114 – großer Suchindex
- #178 – Staffeln und Folgen auf der Serien-Detailseite
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – zentrale Begrenzung normaler Posterreihen / D-Pad-Entscheidung
- #207 – robuste persönliche TMDB-Synchronisierung
- #218 – Layout-Sammelissue / UI-Konsistenz
- #222 – Einstellungen, Profilsteuerung und Sichtbarkeit
- #205 – persönliche Daten schützen und SMB-Verbindungen konsolidieren
- #190 – automatische Hero-Trailer und nativer Trailer-/Teaser-Player
- #226 – einheitlicher TV-Switch-On/Off-Effekt für Startsequenz und native Player
- #225 – kanonische Katalogdaten bei Metadaten-Anreicherung verlustfrei erhalten
- #228 – robuster nativer Kaltstart ohne zusätzlichen Tastendruck
- #117 – Dependency-Audit und Security-Hygiene

Der aktuelle Fire-TV-Stand einschließlich der oben genannten Pakete wurde zuletzt am 18.09.2026 abgenommen.

## Aktuelles Arbeitspaket

### #4 – Öffentlichen Waipu-Live-Katalog aus dem Waipu-EPG erzeugen

- #4A: FreeEPG-Qualitätsprototyp technisch abgeschlossen; Quelle wegen
  veralteter Programmdaten ungeeignet
- der bisherige Konto-/OAuth-Prototyp #4B bleibt als technischer Versuch
  dokumentiert, ist aber keine Voraussetzung mehr
- **#4B abgeschlossen:** öffentlicher Datenvertrag, vollständiger
  Sieben-Sender-/14-Tage-Nachweis, reale Film-/Seriendetails, TMDB-Stichprobe,
  Cache-Verhalten, Requestkosten und sichere Lastgrenzen bestätigt
- **#4C abgeschlossen:** öffentlicher Read-only-Adapter, defensive
  Normalisierung und persistenter Sender-/Slot-/ETag-/Detailcache umgesetzt
- **#4D abgeschlossen:** rollierenden, budgetierten Import mit Checkpoints,
  Backoff, Circuit Breaker und stufenweiser Senderfreigabe eingerichtet
- **#4E abgeschlossen:** Film-/Serienklassifikation, TMDB-Matching und
  getrennten `waipu-live`-Katalog erzeugt
- **#4F abgeschlossen:** erste Ausbaustufe mit normalem Waipu-Badge, fester
  Badge-Priorität und konkreten Sendeterminen umgesetzt
- **#4G als nächstes:** zweite Ausbaustufe mit eigener TV-Registerkarte, Senderauswahl und
  14-Tage-Posterkarten
- #4H: Robustheit, Langzeitmessung, Geräteabnahme und Release-/Rechte-Gate
- Movie Hub fragt keine Waipu-Zugangsdaten ab und speichert keine Waipu-Token
- ein persönlicher Paket-/Senderfilter kann später optional ergänzt werden,
  blockiert aber den öffentlichen Live-Katalog nicht
- Waiputhek/VOD, Streaming, Aufnahmen und DRM bleiben ausdrücklich ausgeschlossen
- öffentliche Verteilung bleibt bis zur Rechte- und API-Klärung gesperrt

## Danach geplante Arbeitspakete

### 1. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Aktion direkt am Titel
- rent/buy-only oder derzeit nicht enthaltene Titel beobachten
- Wechsel zu `flatrate`, `free` oder `ads` bei aktivierten Anbietern erkennen
- nur bei echter Zustandsänderung benachrichtigen
- keine unnötige Regelverwaltung im normalen UI

### 2. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

- Bewertungen, gesehen/ungesehen, Favoriten, Watchlist und Katalogdaten als Signale verwenden
- persönliche Top-100- und Empfehlungsreihen erzeugen
- wiederholbaren automatisierten Job etablieren
- objektive Verfügbarkeitsdaten weiterhin ausschließlich aus strukturierten Quellen ableiten
- Empfehlungen ohne APK-Update aktualisierbar machen

## Weitere spätere Pakete

- #129 – Deutsch/Englisch-Umschaltung der GUI
- #112 – rechtliche & Compliance-Prüfung als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau; bleibt offen, solange noch Legacy-/Migrationspfade existieren

## Aktuelle Abhängigkeitskette

`#4A → #4B → #4C → #4D → #4E → #4F → #4G → #4H → #118 → #7`

Die spätere öffentliche Verteilung von #4 bleibt zusätzlich durch die Compliance-Prüfung #112 gesperrt. Vor Beginn jedes aktiven Pakets wird dessen Scope noch einmal kurz gegen den dann aktuellen Stand geprüft.
