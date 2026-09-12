# Movie Hub – Issue-Plan

Stand: 12. September 2026

## Kern-Issues

- #5 – Phase 0: Firebase-Fundament, Security, Hosting und Web-Grundgerüst
- #1 – Phase 1: TV-optimierte Streaming-Oberfläche
- #2 – Phase 2: TMDB-Filmdaten und persönliches Filmgedächtnis
- #3 – Phase 3: Fire-TV-APK und native App-Brücke
- #6 – Phase 4: Deep Links und Provider-Auswahl auf Fire TV
- #4 – Phase 5: Streaming-Verfügbarkeit und waipu.tv-Live-Badges
- #7 – Phase 6: Persönliche Empfehlungen, Top 100 und Automatisierung

## Laufende Produktideen

- #8 – Ideen-Sammelstelle für Wünsche, UX-Ideen und spätere Features

Aus #8 werden umsetzungsreife Punkte bei Bedarf in eigene Issues überführt, ohne dass die Sammelstelle geschlossen werden muss.

## Aktiver Arbeitsstand

#163 – profilbezogene Smart-Reihen ausschließlich unter **Meine Inhalte** – ist abgeschlossen. Die technische Hero-first-Umsetzung aus #166/#168 und die Kaltstartkorrektur #169 sind integriert; #166 wartet noch auf die ausdrücklich getrennte manuelle Geräteabnahme.

Integriert und zur Geräteabnahme bereitgestellt sind:

- #170 – Movie Hub als virtuellen, kontoweiten Anbieter-Katalog aus eigenen Links und Videos integrieren;
- #171 – Heroes und flexible Posterreihen dynamisch sowie profilbezogen kuratieren;
- #173 – dynamische Top-10-Sonderreihen auf Home, Filme, Serien und Meine Inhalte einfügen.

Aktuell umgesetzt wird #137: vollständige TMDB-Filmreihen als eigener Navigationsbereich innerhalb der Film-Detailseite. Sammlungskacheln und eine eigenständige Sammlungs-Detailseite bleiben nach der gemeinsamen Produktentscheidung außerhalb dieser ersten Stufe.

Die früheren Phase-0-Arbeiten sind abgeschlossen; der folgende historische Abschnitt dokumentiert ihren damaligen Abschlussweg.

Phase 0 wird auf dem Branch `phase-0-foundation` über PR #9 abgeschlossen. Der reale Firebase-End-to-End-Test ist bestanden: Hosting, Authentication, Persistenz nach Reload sowie Firestore Write/Read funktionieren. CI-Build und automatisierte Firestore-Rules-Tests sind grün.

Vor dem Abschluss von Phase 0 werden noch das Deployment aus `main` automatisiert und der vorhandene GitHub Secret-Scanning-Hinweis zum früher eingecheckten Firebase-Web-Key fachlich aufgelöst. TMDB-Funktionalität gehört inhaltlich zu Phase 2 und wird dort weitergeführt.

Technische Prüfpunkte werden erst nach tatsächlicher Ausführung als bestanden markiert.
