# MovieHub YouTube G2 – gezielter Matcher v1.1: Titel/Jahr getrennt, fragliche Teiltreffer gesichert

**Datum:** 22.10.2026 · **Issue:** #388 · **Status:** Nichtproduktiver Forschungsvorschlag zur technischen Prüfung. Keine Abnahme, kein Katalogimport.

## Original-Evidenz

- Original-125er-Sample (90 CiNENET/35 Netzkino): [Run #39754462653](https://github.com/matthias-ennen/movie-hub/actions/runs/39754462653), Artefakt #12414648272.
- Exakter Replay **derselben** 125 Video-IDs mit verbesserter CiNENET-Quelltitelaufbereitung: [Run #39761879885](https://github.com/matthias-ennen/movie-hub/actions/runs/39761879885), Artefakt #12418906111, **SUCCESS**, 4 YouTube-/488 TMDB-GETs.
- Ergebnis: 28 → 74 führende, 79 → 16 Fälle ohne Filmkandidaten; 68 Statusänderungen (nur CiNENET). Nur 0 unabhängig bestätigte Filme/DE-Angebote.
- Bei **45 von 74** führenden Hypothesen `titleLevel=2`. Bei **35 dieser 45** wird nach **rein diagnostischer** Abtrennung des am Ende stehenden Quellenjahrs `(YYYY)` der TMDB-Titel oder Originaltitel exakt. Die weiteren **10** sind ohne dieses exakte Titelpaar und erfordern weiterhin Review; alternative TMDB-Titel wurden bei dieser Zählung nicht zusätzlich einbezogen.
- Beispiel risikoreicher Pseudotreffer: YouTube `Liebe ist…`/Diane Keaton → TMDB `Liebe ist zollfrei` (1941). Nur Titelteil und Laufzeit reichen nicht zum Beweis.

## Umsetzung, bewusst schmal

1. G1 Matcher **v1 bleibt unverändert**. Neue eigenständige `scripts/youtube-g2-matcher-v1-1.mjs` bietet Forschungsscoring/Klassifikation als ausdrücklich auswählbare Alternative.
2. Wenn der vom vorhandenen v1 erkannte, **einzige eindeutige** Jahresbeleg ein terminales `(YYYY)` ist, wird dieser Text **nur für den Titelgleichheitsvergleich** abgetrennt. Jahreswert, Jahreswiderspruch, Source-Original, Sequel, Typ-Risiko, Laufzeitkonflikt und Quellprovenienz bleiben unverändert.
3. Wenn danach immer noch nur `titleLevel=2` besteht, darf die Klassifikation **nicht mehr führend** heißen: `review-partial-title-identity`, ohne bestätigten Movie-ID-/Offer-Wert. Individuelle englisch/deutsche Alternativtitel benötigen zusätzliche Evidenz.
4. Im bestehenden **read-only 125-ID-Audit** ist `matcher_version=v1` (Standard) oder `v1.1` auswählbar. Ein separates Replay mit **`replay_run_id=39761879885`** ermöglicht den direkten *v1 bei identischer Quellparser-Version* vs. *v1.1*-Vergleich. Kein neuer Upload-Sample-Drift. Weder v1.1 noch der Workflow legt MovieHub-Titel/Badges an.

## Quality Gates

- Positive: `Vollmacht zum Mord (1975)` und exakte TMDB-Titel werden `titleLevel=4`, Jahresbeleg bleibt.
- Negative: explizit falsches Veröffentlichungsjahr bleibt Jahreskonflikt; `2010: The Year We Make Contact` darf nicht als falsches Jahr gelten; Sequel-Konflikt bleibt geschützt.
- Teilmatching: `Liebe ist…` und `Red Phone - Manhunt` bleiben Prüfstatus, keine automatische führende Werkidentität.
- Replay und API-Hardcaps, Kanal-ID, Quellenwahl sowie Null-Schreiboperationen beibehalten.
- GitHub CI + Android APK vor Merge; **danach** gesonderter manueller Live-Replay und vollständige 125er-QA-Auswertung. Ein PR/Mock-Test alleine ist keine Live-Abnahme.
- Echte Filmfassung, gültiges DE-Angebot/Tarif, Rechte/API-Compliance, MovieHub-Katalogvergleich, Badge/Nightly/Fire-TV-E2E bleiben offen. Issue #388 bis zur Nutzerabnahme offen.

**Kein automatischer Import, keine Cloud-/App-Produktivänderung und keine rechtliche Freigabe durch dieses Arbeitspaket.**
