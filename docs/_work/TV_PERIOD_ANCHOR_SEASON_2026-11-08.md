# MovieHub – Tagesabschluss 08.11.2026: TV-Anker, Saisontexte, Fire-TV-Stand

## Änderungen dieses Korrekturpakets

Verknüpfungen: #724 (TV-D-Pad/Fokus), #740 (Scroll-/Hero-Ausrichtung), #484 (visuelle Saisons). Die ursprünglichen Fire-TV-Lastoptimierungen sind separat über #747 / PR #748 dokumentiert.

### TV-Datumszeile und erste Posterreihe

**Fehlerursache vor dem Fix:** `alignTvFirstRowAndPeriod` verwendete die erste gerenderte `.poster-card` als Positionsreferenz, wechselte bei noch nicht gerenderter/ausgehängter erster Reihe aber auf die Datumszeile als andere Referenz. Bei täglichem/14-tägigem Ergebniswechsel wird die Posteransicht während `loading` ausgehängt; geringe Seitenhöhe ließ den Browser vertikal scrollen/clampen.

**Lösung:** `calculateTvPairScrollTop` nimmt nur die immer vorhandene TV-Zeitraumleiste als feste Referenz; Zielposition `max(topbarBottom + 24px, 25% der Viewporthöhe)`, mit normaler Scrollgrenzen-Klemmung. Die erste Posterreihe verwendet beim Fokussieren weiterhin dieselbe TV-Ankerfunktion. `tv-program-results` reserviert dauerhaft mindestens `115vh`, sodass der Wechsel `ready → loading → ready` ausreichend Scrollraum behält, ohne den sichtbaren Datumsstreifen zu entfernen. Kein zusätzlicher Reload, kein neuer Observer, keine zusätzliche Bitmap/Animation; D-Pad-Scrollprofil unverändert 260 ms.

**Vertrag:** Hero-Aktion → Datumszeile richtet sofort aus, egal ob erste Reihe bereits zugelassen ist. Links/rechts in der Datumsauswahl startet keine neue vertikale Ausrichtung. Datum → erste Reihe → Datum bleibt vertikal unverändert. Ein Klick auf Morgen/Heute/14 Tage darf während Laden/Fehler/Leere kein vertikales Nachrücken oder einen Fokusverlust auslösen.

### Saisonüberschriften

`src/theme/seasonalPresentation.js` enthält nun auch `tv` für alle neun Saisonwelten. `MovieHub` liest `activeVisualSeason` aus dem vorhandenen `ThemeProvider` und übergibt `seasonalPageHeading(activeVisualSeason, 'tv')` durch die lazy-geladene `TvFeature` an die rein präsentierende `TvView`. Damit bleiben die Komponenten ohne erzwungenen ThemeProvider einzeln testbar und der hartkodierte Text `TV` entfällt:

| Saison | TV-Titel |
|---|---|
| Klassisch | TV-Programm |
| Halloween | Gruselzeit im TV |
| Weihnachten | Festliches im TV |
| Silvester & Neujahr | Highlights zum Jahreswechsel |
| Ostern | TV für die Feiertage |
| Pfingsten | TV fürs lange Wochenende |
| Filmfestival | Filmhighlights im TV |
| Hollywood | Hollywood im TV |
| Sommerkino | TV für laue Sommerabende |

Die Texte auf Home, Filme, Serien und Meine Inhalte sowie die unabhängige saisonale Inhaltsauswahl bleiben unverändert.

## Regression und Live-Abnahme

- Automatisiert: TV-Zielkoordinate mit/ohne gerendertes Poster identisch; wiederholte Ausrichtung idempotent; Mobil-/Kleinbildschirm-Klemmung; neun saisonale Texte + unbekannte Saison; stabile React-Hülle für Lade-/Fehlerzustände.
- [ ] **Fire TV:** TV-Tab aktivieren, aus Hero-Aktionen auf Datum wechseln; sofort gleiche Ausrichtung wie die erste Posterreihe.
- [ ] **Fire TV:** Heute → Morgen → Heute → 14 Tage, während der Ladephasen auf der Datumszeile bleiben; weder vertikales Springen noch Fokusverlust.
- [ ] **Fire TV:** Datum → erste Reihe → Datum, links/rechts in der Datumszeile, mehrfach; ruhiges Bild.
- [ ] **Android/Tablet:** Touch-Auswahl anderer Tage und D-Pad-/Tastaturnavigation ohne Regression.
- [ ] **Saisonprüfung:** Alle neun manuell anwählen; TV-Hero wechselt Text, andere Seiten behalten ihre Texte.
- [ ] **Fire-TV-Lastabnahme #747:** nach tiefer Poster-Navigation zurück zur ersten Reihe/Hero; keine Abstürze, mit Geräteprotokoll bei Abweichung.

**Status:** Codebereit für CI/Deployment, aber die realen Geräteprüfungen sind nicht durch automatisierte Repository-Tests ersetzbar. #724, #740, #747 und #484 daher nicht nur anhand dieses Commits schließen.

## Nächste offene Arbeitspakete (nach TV-Geräteabnahme)

1. **#747 / #743:** gezielte Fire-TV-Stabilität, insbesondere Crash-/Fokus-Abnahme und Speicherdruck beim Reenter in den Hero.
2. **#724 / #740:** restliche Fokus-, TV- und Layout-Regressionen aus den jeweils offenen Checklisten, nicht pauschal als erledigt markieren.
3. **#717 / #723 / #720:** Serienfolgen-Provider, beste Deeplinks, kompakte Liste weiterer Ausstrahlungstermine.
4. **#388:** YouTube-Playlisten/Serienfolgen-Adapter, Nightly-Lauf und reale Endabnahme.

Diese Liste ist eine technische Reihenfolge zur Wiederaufnahme, keine behauptete Schließung/Endabnahme.
