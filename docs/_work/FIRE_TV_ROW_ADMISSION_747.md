# #747 – Fire-TV-Ladephasen und Hero-Rückweg

Stand: 08.11.2026. Codeänderungen auf `fix/747-fire-tv-loading-hero-reentry`. Keine Fire-TV-Geräteabnahme.

## Einheitlicher Navigationspfad

1. Header-Fokus kann lediglich das Hero-Bild verzögert vorladen (275 ms); **Aktivierung** verwirft spekulative Hero-Vorladungen des vorherigen Fokus.
2. `currentView` wechselt: React hängt die alte Inhaltsansicht mit ihren Bildbesitzern aus. Gemeinsame öffentliche und persönliche Grundkataloge bleiben erhalten.
3. `HeroFirstPage` montiert den Hero, meldet `heroReady` bei Erfolg, Fehler oder 1600-ms-Fallback. Das ist ausdrücklich **kein vollständiger Image-Download-Barrier**.
4. `ProgressiveRows` montiert nur sichtbare/nahe virtuelle Reihen. Die tatsächliche Viewport-Position geht bei der Admission vor; anschließend werden weitere Overscan-Reihen in 90-ms-Schritten freigegeben.
5. `ContentRow` rendert normale Poster in 12er-Fenstern. **Kein Reihen-Mount-Prefetch:** reales DOM-Bildladen hat Vorrang. Bei Posterfokus werden die kommenden 5 Bilder vorbereitet, soweit sie nicht bereits vom DOM beansprucht werden. Beim Verlassen der Reihe werden deren spekulative Anforderungen freigegeben.
6. Die zentrale `imageAdmission` lässt maximal zwei gleichzeitige Bild-/Decode-Jobs zu; echte sichtbare DOM-Bilder (auch Hero) dürfen spekulative Jobs verdrängen. Reihenblöcke warten nie auf alle 50/150 Bilder, damit ein defektes Bild die Navigation nicht blockiert.

## Seitenunterschiede

| Ansicht | Grundlage | Besondere Freigabe |
| --- | --- | --- |
| Home | Gemeinsamer Startkatalog, Anbieter-, persönliche und TMDB-Reihen | Hero vor Reihen; ausgeblendete Anbietergruppen/Top 10 werden früh übersprungen |
| Filme | Gemeinsamer Titelkatalog, Filmkategorien und Providerreihen | Deaktivierte Kategorien vor Sortierung ausschließen; Providergruppen/Top 10 vor teurer Berechnung überspringen |
| Serien | Gemeinsamer Titelkatalog, Serienkategorien und Providerreihen | Entsprechend Filme; kein gesonderter Download pro Reihe |
| TV | `tv-runtime/hero.json`, danach Index, Senderauswahl und gewählter Tages-/14-Tage-Snapshot | TV-Hero vor Sender-/Datentagsphase; bestehende `AbortController`-Abbrüche und kooperative Tag-Aufbereitung behalten |
| Meine Inhalte | Profilbibliothek und gemeinsamer Katalog | Hero vor persönlichen Reihen; ausgeblendete Top 10 und Verlauf vor der Berechnung überspringen. Persönliche Daten für einen sichtbaren Hero nicht wegoptimieren |

## Hero-Rückweg

Die Hero-Komponente bleibt bei vertikalem Scrollen innerhalb eines Tabs grundsätzlich montiert; Posterreihen werden durch den Vertical Virtualizer aus- und wieder eingehängt. Beim Fokuswechsel von der ersten Reihe zum Hero wird der spekulative Prefetch der alten Reihe freigegeben; echte Poster-/Hero-Bilder bleiben eigenständig budgetiert. D-Pad-Zielreihen und die Rückkehr aus Details umgehen die 90-ms-Reihenverzögerung. Die gemeinsame vertikale und horizontale Bewegungsdauer bleibt **260 ms**.

**Wichtig:** Ob der berichtete Fire-TV-Absturz durch Speicher-/GPU-Druck, Focus-Layout-Race oder einen WebView-Renderer-Tod entsteht, ist mit Codeanalyse nicht bewiesen. Bei erneutem Fehler `onRenderProcessGone` / `adb logcat` prüfen. Keine öffentlichen Logs.

## Regression / manuelle Geräteabnahme

- [ ] Home → Filme → Serien → TV → Meine Inhalte, schnell hin und her, insbesondere TV → Home → TV.
- [ ] TV-Datums-/14-Tage-Wechsel bei langsamer Antwort; keine alten Daten/Fokus-Ziele.
- [ ] Weit nach unten durch mehrere Reihen, zurück bis Reihe 1, dann Hero-Aktion/Hero/Header und wieder in Reihe 1; mehrfach.
- [ ] Von einer Reihe in eine andere, schnell horizontal navigieren, Bilder werden nachgezogen, Fokus geht nicht verloren.
- [ ] Providerreihen, Top 10, Verlauf und Kategorien in Profileinstellungen deaktivieren/reaktivieren; Reihenfolge unverändert.
- [ ] Android/Tablet, Badge-/Deeplink- und Detailrückkehr unverändert.
- [ ] Erst nach realem Fire-TV-Test und Nachweis des Endzustands Issue #747 abschließen.
