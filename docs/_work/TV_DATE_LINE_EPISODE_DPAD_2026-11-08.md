# MovieHub – TV-Linie und D-Pad-Fokus auf Folgendetails · 08.11.2026

Folgekorrekturen nach Gerätefeedback zu PR #749. Bezug: Issues #740 und #724.

## A. TV-Datumszeile: gemessene Bezugslinie statt 25 % Bildschirmhöhe

**Nutzer-Soll:** Die gedachte Linie befindet sich **eine halbe tatsächliche Datumsbuttonhöhe oberhalb der Button-Oberkante**. Im TV-Layout soll diese Linie direkt unterhalb der sicheren Zone des festen Headers liegen, sodass der Datumsbereich nicht wie bisher bei einer pauschalen Viertel-Bildschirmhöhe steht. Datumszeile ↔ erste Posterreihe bleibt eine gemeinsame vertikal feste Fokuszone; erst ab der zweiten Reihe greift die normale Posterzentrierung. Nach Rückweg zur ersten Reihe gilt wieder die Date-Anker-Position.

**Implementierung:** `src/navigation/pageRowScroll.js` ermittelt `buttonRect` aus `.tv-period-shell .tv-period-button`. Die gedachte Linie ist `buttonRect.top - buttonRect.height / 2`; die Zielposition im Viewport ist `topbarBottom + TOP_GAP` (24 px). `calculateTvPairScrollTop` rechnet den benötigten Seiten-Scrolloffset aus. Fallback ohne vorhandenen Button: Höhe/Oberkante der Period-Shell. Keine Abhängigkeit vom ersten Poster, kein fester prozentualer Bildschirmwert. Die stabile `tv-program-results`-Hülle aus PR #749 bleibt erhalten, ebenso die gemeinsame 260-ms-Navigationsbewegung.

**Wichtig:** Die technische Position ist deterministisch, aber die ästhetische Beurteilung (Abstand zur Hero-Endkante, reale Android-/Fire-TV-Skalierung und Responsive-Layout) erfordert eine Sichtprüfung am Gerät.

## B. Folgendetailseite: Fokusnavigation und Aktionen

**Fehler:** `useDpadNavigation.js` fing auf `.episode-detail-panel` `ArrowUp` und `ArrowDown` im überlaufenden Folgen-Inhalt mit `scrollBy(±180)` ab und kehrte vor `navigateDetailRows` zurück. Dadurch konnten die bereits gerenderten und als `data-focusable` markierten Schaltflächen (insb. `TitleDescription` → „Mehr lesen“ sowie TV-/Mediathek-Anbieter) trotz sichtbarer Buttons nicht erreicht werden.

**Korrektur:** Die Episode-Ausnahme entfällt. Einheitsvertrag mit der normalen Film-/Seriendetailseite: D-Pad-Pfeile wechseln den Fokus über `navigateDetailRows`, wobei `detailDpadNavigation.js` den passenden inneren Scrollcontainer auf das fokussierte Ziel ausrichtet. Eingebaute `onClick`-Handler bleiben unverändert und können per OK/Enter aktiviert werden. Weder Episode-Layout noch Provider-/Deeplink-Bestimmung werden verändert. TV-Anbieter **ohne gültige Route** bleiben mit Absicht statische Badges und werden nicht als nicht funktionierende Buttons ausgegeben.

## Tests und Abnahme

- Automatisiert: halbe gemessene Buttonhöhe als Linienoffset, unabhängig von Viewporthöhe, posterunabhängiger Anker mit/ohne gerenderte Reihe, Wechsel Datum ↔ erste Reihe, sichere Scrollgrenzen.
- Automatisiert: überlaufender verschachtelter Folgendialog → Mehr-lesen-Button → TV-Provider links/rechts → Streaming-Badge und zurück, dabei Fokus und Container-Scroll, ohne `scrollBy`-Abfangregel.
- Automatisiert: langes Episoden-Exposé mit fokussierbarem „Mehr lesen“ sowie fokussierbare Anbieteraktionen; vorhandene Detail-/Deeplink-Tests.
- [ ] **Fire TV:** TV-Seite von Hero zum Datum, Datum → erste Reihe → zweite Reihe → erste Reihe → Datum, Beobachtung der Bildausrichtung.
- [ ] **Fire TV:** Heute/Morgen/14-Tage-Laden, Datum bleibt sichtbar an exakt derselben Stelle.
- [ ] **Fire TV:** Serie → Staffel/Folge → Folgendetail → mit D-Pad über „Mehr lesen“ bis TV-/Streaming-Badges, mit OK öffnen, mit Pfeil hoch wieder zurück.
- [ ] **Fire TV:** Bei langem Text klappt „Mehr lesen“ aus/mit „Weniger anzeigen“ wieder ein; Fokus bleibt benutzbar.
- [ ] **Android/Tablet:** Touch- und Zurück-Navigation nicht beeinträchtigt, Fokus-/Scrolling auch auf kleinen Displays plausibel.
- [ ] **Fehlende Anbieter-Route:** Badge bleibt informativ, nicht anklickbar, kein toter Fokus.

Diese Korrekturen schließen nicht alle Punkte der Sammelissues #724 und #740; reale Fire-TV-Abnahme bleibt gesondert offen.
