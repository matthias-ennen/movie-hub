# MovieHub – YouTube Matcher v1: letzte gebündelte Verbesserung und Schlussabnahme

**Datum:** 21. Oktober 2026. **Freigabeumfang:** Endgültige G1-Matcher-Logik als **rein lesender Forschungsbaustein**, kein produktiver YouTube-Angebotsadapter. **Keine weitere generische Verbesserungsrunde nach erfolgreicher 100er-Abnahme.**

## Warum wir hier die Matching-Entwicklung abschließen

In den bisherigen G1-Tests wurden **100 verschiedene öffentliche YouTube-Video-IDs** unter begrenzten Suchläufen identifiziert, **100** per TMDB-Titelsuche untersucht und **34** gezielte Konflikte anschließend mit alternativen TMDB-Titeln/Laufzeiten besser sortiert. Der letzte echte 34er-Test #39636101093 ergab **21** führende Hypothesen, **4** Mehrdeutigkeiten, **4** Versionsunsicherheiten, **3** fehlende filmfachliche TMDB-Hinweise, **2** Inhaltsrisiken. Dieser letzte v1-Entwicklungsschritt führt die daraus gelernten Regeln zu einer **einzigen konservativen, deterministischen Bewertung aller 100** zusammen. Es wird **kein 100%-Match-Versprechen** abgegeben.

## Endgültige v1-Architektur

**Quellen strikt getrennt:**
- YouTube-Discovery ist ein eigenständiger Lieferant von Video-ID, Titel, Quelle/Kategorie, Laufzeit und beschränkten DE-Metadaten – **kein** Beleg für eine Filmfassung oder einen deutschen Shop-Status.
- TMDB liefert mögliche kanonische **`(movie,tmdbId)`-Werkhypothesen**. Movie-/TV-Hinweise bleiben als unterschiedliche Medientypen erhalten. Der v1-Matcher bekommt nur die bereits recherchierten maximal drei Film-IDs pro ursprünglichem Video; er führt **keine neue TMDB-/YouTube-Suche** aus.
- Eine **separate**, später rechtskonform zu entwerfende Verfügbarkeits-/Playback-Bestätigung ist erforderlich, bevor irgendein YouTube-Anbieterbadge in MovieHub erscheinen dürfte.

**Regeln pro ursprünglichem Video:**
1. **Provenienzpflicht:** Nur exakt die 100 originalen Video-IDs aus [#39618878080](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080) mit festgelegtem SHA-256 `f18e3fe44bf8a6c312bf7cf1e02bb22d3770ed2fb0fb4a1a49ea9512c9cc7c27`; alle 100 zuvor gefundenen Film-/TV-Hinweise aus [#39628463786](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786) müssen dazu passen. **Bei fremder ID oder unvollständigen Originalreports abbrechen.**
2. **Titelvereinheitlichung:** Deutsche Titel, Originalnamen, TMDB-`alternative_titles`, Diakritika, Such-/Versionszusätze, abweichende Groß-/Kleinschreibung; vollständiger Titel-/Aliasmatch wird stärker bewertet als Teilstring/Tokenüberschneidung. Regie und Jahr aus dem TMDB-Detail werden als **Kandidatenbelege** ausgegeben, aber nicht mit frei erfundenen YouTube-Credits gleichgesetzt.
3. **Alle ernsthaften Werkhypothesen vergleichbar:** Je `videoId` bis zu drei **bestehende** `/movie/{id}`-Film-Datensätze einschließlich `alternative_titles,credits,external_ids`; echte Laufzeitdifferenz **je Filmversion**, niemals nur erster Suchtreffer. Wiederholte TMDB-Film-IDs innerhalb der 100er-Probe werden **einmal gelesen und dann gecacht**. Deckel: **maximal 300** lesende TMDB-GETs. Region/Provider-/Rechtedaten werden **nicht** aus TMDB abgeleitet.
4. **Konfliktschutz statt Schönrechnen:** `Staffel/Folge/Gameplay/Learn German/Compilation/Trailer/Making of` kann nur `review-source-content-type-risk` erhalten. Andere Filmversion/Sequel-Index, ein ausdrücklich genanntes aber unpassendes Jahr, Film-/TV-Kollisionen, **mehr als 15 Minuten Laufzeitdifferenz**, nahe beieinander liegende ernsthafte Filmhypothesen und sehr aktuelle Filmjahre bleiben sichtbar als **Review-Gates**. Zahl `2010` in `2010: The Year We Make Contact` darf nicht als Veröffentlichungsjahr missverstanden werden.
5. **Einheitliche Abstufung:** `review-leading-film-hypothesis`, `review-leading-movie-with-TV-alternatives`, `review-multiple-film-works`, `review-weak-title`, `review-work-or-cut-runtime-conflict`, `review-explicit-year-conflict`, `review-current-release-needs-content-check`, `review-source-content-type-risk`, `review-no-movie-candidate` sowie explizite Fehler-/Quota-Zustände. **Kein** Status ist eine produktive Werk-/Angebots-/Wiedergabefreigabe; jede Reihe enthält `confirmedMovieId: null, confirmedFilm: false, confirmedDEPlayback: false, confirmedOffer: false`.
6. **Keine stillen Fehler:** 429 oder Detail-Quota stoppt weitere Abrufe; nicht untersuchte Video-IDs werden als `review-not-checked-quota` ausgewiesen, nicht als Nichtfilm. Fehlende TMDB-Kandidaten sind `unknown`, nicht `negative`.
7. **Keine falsche Erfolgsmetrik:** Gemessen werden Video-IDs (100), plausible Werkhypothesen und nachweislich offen gelassene Konflikte. **„100 Video-IDs“ bedeutet nie „100 bestätigte Filme“**, und mehrere Videos können demselben kanonischen Werk entsprechen.

## Einziger v1-Schlussabnahmelauf und Qualitätsgates

- **Code:** `scripts/youtube-g1-matcher-v1.mjs`.
- **Regressionen:** `scripts/youtube-g1-matcher-v1.check.mjs`, in der vollständigen Repository-CI über `tests/youtube-g1-matcher-v1.test.js`: simulierte komplette 100er-Quellberichte, Original-ID-SHA-Mismatch, TV-/Nichtfilm-/Staffel-Grenze, 429-Abbruch, *War Story* 2014, *Man Bites Dog*/*Mann beißt Hund*, *2010* 1984, `Rambo II`/III, *Terminator 2*, sehr aktuelle Kino-Titel und **keine** positive TMDB-/Offer-Automatik.
- **Einziger echter Quellenabnahmelauf:** [YouTube G1 Final Matcher v1 – 100-Video Acceptance](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-g1-matcher-v1-final.yml) startet **automatisch einmal beim Übernehmen der neuen Matcher-v1-Datei nach `main`** (`push` mit engem `paths`-Filter) und kann bei Bedarf manuell wiederholt werden. Es ist **kein** geplanter Nachtlauf. GitHub `actions: read` lädt die beiden noch gültigen Original-Forschungsartefakte #12353497700 und #12358536690. Es werden **keine YouTube API-Calls** ausgeführt, maximal 300 TMDB-GETs. Der abgeleitete Bericht `matcher-v1-final-hundred.md` ist GitHub-intern auf **14 Tage** beschränkt.
- **Abnahme gilt nur wenn:** CI **und** Android-APK-Build für diesen letzten Forschungscode grün sind; die finale 100er-Actions-Research-Execution einen **echten SUCCESS-Status** und Originalreport mit **100/100** liefert; alle 100 Forschungsfälle inklusive unbekannter/mehrdeutiger explizit dargestellt sind; keine ungeprüfte Filmwerkzuordnung automatisch angenommen wird. Erst dann Status **`Matcher v1 FROZEN / abgeschlossen`** in Issue #388 dokumentieren. Ein fehlgeschlagener technischer Schlussabnahmelauf ist **keine** Freigabe und wird mit konkretem Gate dokumentiert – keine Endlosschleife zusätzlicher Heuristiken.
- **Anschließend keine weitere generelle Verbesserungsschleife.** Konkrete nachgewiesene Bugs dürfen als eigener späterer Fehler behandelt werden; ungeklärte Werke gehören in eine fachliche Reviewliste, nicht in immer neue Anpassungen am Matcher.

## Klar getrennte weitere Arbeitspakete nach dem Freeze

Das gesamte YouTube-G1-/G2-Adapterprojekt ist **nicht** allein wegen der Matcher-Abnahme fertig. Für einen veröffentlichten MovieHub-YouTube-Adapter fehlen weiterhin:
- Unabhängiger Beleg des tatsächlichen Inhalts/Filmschnitts für eine konkrete YouTube-Video-ID;
- Echte Länder-/Geräte-/Shop-/Tarif-/Abspielbarkeit und Lizenzprüfung im DE-Kontext;
- Konkrete schriftliche technische/rechtliche Einordnung der geplanten kanal-/Content-Owner-übergreifenden YouTube-API-Datenaggregation nach [YouTube API Developer Policies III.E.2](https://developers.google.com/youtube/terms/developer-policies); der vorbereitete Compliance-Anfrageentwurf wurde **noch nicht abgesendet**;
- Eigenständige G2-Freigabe für Adapter, zentrale Datenquelle, MovieHub-Titelzuweisung/Anbieterbadge, Android und Fire TV.

**Implementierungsumfang:** Nur isolierte G1-Research-Dateien und dieses technische Abnahmedokument. **Keine** Produktionsänderung an Firestore/Firebase, Nachtlauf/TV, Titelbestand, Badges, Android/Fire TV oder Deeplinks. Kein G2-Go.
