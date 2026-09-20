# Movie Hub – Roadmap

Stand: 20. September 2026

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
- #4 – öffentlicher Waipu-Live-Katalog einschließlich 50-Sender-Bestand, TV-Integration und Geräteabnahme

Der aktuelle Fire-TV-Stand einschließlich der oben genannten Pakete wurde zuletzt am 18.09.2026 abgenommen.

## Aktuelles Arbeitspaket

### #256 – Datenfundament: vollständige kanonische Titelmetadaten vor Veröffentlichung

#256 ist nach dem vollständig abgenommenen und geschlossenen #4 das nächste Arbeitspaket. Vor der Programmierung erfolgt nur noch eine kurze technische Scope-Kontrolle.

Verbindlicher Umfang:

- katalogrelevante Titel aus Browse/Anbietern, persönlichem TMDB-Katalog, Movie Hub und `waipu-live` zu einem kanonischen Bestand nach `Medientyp + TMDB-ID` zusammenführen;
- vollständige Titel serverseitig wiederverwenden und fehlende beziehungsweise veraltete Metadaten zentral ergänzen;
- `metadataComplete` als vollständig geprüft definieren, ohne optionale bei TMDB nicht vorhandene Felder zu erzwingen;
- TMDB-Änderungslisten als tägliche Schnellspur für Korrekturen, neue Trailer und andere Änderungen nutzen;
- vollständige Titel zusätzlich rollierend nach spätestens 30 Tagen erneut prüfen; die in #200 umgesetzte Suchdetail-Logik wird eingebunden;
- eine gemeinsame deduplizierte Prioritätswarteschlange für neue, fehlerhafte, geänderte und altersbedingt fällige Titel führen;
- normale Code-Deployments vom planmäßigen beziehungsweise manuellen Datenlauf trennen;
- alle zusammengehörigen Artefakte mit gemeinsamer Generationskennung validieren und atomar veröffentlichen;
- bei jedem Teilfehler den letzten gültigen Stand online lassen;
- verspätete oder ausgefallene Nachtläufe sichtbar melden und fehlende Changes-Zeiträume kontrolliert nachholen.

Reine Suchindex-Titel außerhalb aller sichtbaren Kataloge müssen nicht vorangereichert werden. Beim Öffnen dürfen sie vollständig geladen werden, zeigen bis dahin jedoch ausschließlich einen klaren Ladezustand und anschließend die vollständige Detailseite auf einmal.

## Bestandsaufnahme und Triage vor dem nächsten Umsetzungspaket

Die Beobachtungen zum Referenzstand APK 0.1.473 sind in #254 gesammelt und in
[Bestandsaufnahme ab APK 0.1.473](APP_REVIEW_0.1.473.md) strukturiert. Wegen der
Größe von #254 werden weitere Beobachtungen, offene Entscheidungen und die
Paketbildung in #255 fortgeführt.

Verbindliches Ziel ist eine gemeinsame technische Inhaltsseiten-Grundlage für
**Home, Filme, Serien, TV und Meine Inhalte**. Bewährte Seiten-, Hero-,
Posterreihen-, Fokus-, Lade- und Detailseitenlogik wird gemeinsam genutzt;
TV ergänzt ausschließlich die fachlich notwendigen Zeit-, Sender- und
Ausstrahlungszustände.

Die dort vorgeschlagenen Pakete sind noch keine automatischen
Programmieraufträge. #256 wurde daraus als eigenständiges nächstes
Datenfundament-Paket ausgearbeitet. Die übrigen UI-, TV-, Trailer- und
Erinnerungspakete werden erst nach #256 weiter priorisiert. Jedes gewählte
Paket beginnt mit einem kurzen Klärungsblock zu seinen ausdrücklich
registrierten offenen Fragen.

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

`#4 abgeschlossen → #256 Datenfundament → weitere Triage #254/#255 → #118 → #7`

#4 ist vollständig abgenommen und geschlossen. Der veröffentlichte 50-Sender-Bestand bleibt der gültige Ausgangsstand. Eine spätere Erweiterung oder öffentliche Verteilung bleibt von der Compliance-Prüfung #112 abhängig. Vor Beginn von #256 wird dessen Scope einmal kurz gegen den aktuellen Repository-Stand geprüft.
