# MovieHub G1 – Fünf Originalvideo-/Filmfassungsprüfungen: echter Livebefund und Policy-Gate

**Stand:** 21.10.2026. **Modus:** rein lesende Entwicklung/Forschung; keine G2-Freigabe.

## Echte Nachweise

- [Manueller GitHub-Actions-Lauf #39613093627](https://github.com/matthias-ennen/movie-hub/actions/runs/39613093627) **SUCCESS**, Branch `main`; Original-GitHub-Artefakt [#12351731463](https://github.com/matthias-ennen/movie-hub/actions/runs/39613093627/artifacts/12351731463) (`five-work-evidence.md`) **als Original-ZIP heruntergeladen, geöffnet und vollständig gelesen**.
- Erzeugung **2026-10-21T14:01:26.139Z**, genau **1** offizieller `YouTube videos.list`-Batch für die 5 bekannten Video-IDs und genau **5** TMDB-`/movie/{id}`-GETs einschließlich `credits`, `alternative_titles`, `external_ids`. Kein neues Video-/Kanal-Discovery und keinerlei schreibender API-Aufruf.
- **Alle fünf** Originalfälle erhielten **`review-title-runtime-only`**. Es gab **0** `review-direct-identifier-support`, **0** `review-director-support`, **0** verifizierte Filmfassungen. Die YouTube-Beschreibungen lieferten bei **keinem** der fünf Fälle einen im Prüfschema explizit gekennzeichneten Zusatzbeleg für **IMDb-ID**, **Regie** oder **Erscheinungsjahr** (`not-listed / not-listed / not-listed`). Das heißt **nicht**, dass diese Informationen auf der kompletten YouTube-Seite nachweislich fehlen; es bedeutet nur: Im definierten sicheren Metadata-Pilot **kein unabhängiger gekennzeichneter Beleg**.

## Vergleichstabelle – G1-Evidenz, nicht Produktionsangebote

| Original-Video-ID | Bisherige Hypothese / TMDB-Film-ID | TMDB-Jahr / Regie aus dem echten GET | Laufzeitdifferenz YouTube-Metadaten vs. TMDB | Zusätzliche unabhängige IMDb-/Year-/Director-Stütze aus YouTube-Metadaten | Status |
| --- | --- | --- | ---: | --- | --- |
| `3ivgYkh5Res` | *2010: The Year We Make Contact* / [4437](https://www.themoviedb.org/movie/4437) | 1984 / Peter Hyams | 0,2 min | Keine der definierten Belegformen | `review-title-runtime-only` |
| `cVubTPv90f4` | *War Story* / [246013](https://www.themoviedb.org/movie/246013) | 2014 / Mark Jackson | 0,7 min | Keine der definierten Belegformen | `review-title-runtime-only` |
| `6f5O_yR5hUc` | *Isn't She Great?* / [75531](https://www.themoviedb.org/movie/75531) | 2000 / Andrew Bergman | 0,3 min | Keine der definierten Belegformen | `review-title-runtime-only` |
| `ImYG7I2Z2yM` | *El Club (OmU)* / [319995](https://www.themoviedb.org/movie/319995) | 2015 / Pablo Larraín | 3,8 min | Keine der definierten Belegformen | `review-title-runtime-only` |
| `ClLIOYaxXy0` | *Das Protokoll / De Premier* / [394645](https://www.themoviedb.org/movie/394645) | 2016 / Erik Van Looy | 0,6 min | Keine der definierten Belegformen | `review-title-runtime-only` |

Die Beispiele sind **keine** nachgewiesenen kostenlosen, werbefinanzierten, inklusive, Leih- oder Kaufangebote. `YouTube Movies` als Anzeigetitel/Kanallabel, `regionRestriction.allowed=DE`, `status.privacyStatus=public`, Laufzeit und mögliche Embeddability sind **keine** Bescheinigung, dass der Film am gewünschten deutschen Gerät tatsächlich abgespielt, ausgeliehen, gekauft oder in einem Tarif genutzt werden kann. Ein `videoId`-Link ist bisher ein **Forschungsbeleg**, keine freigegebene `PlaybackRoute` in MovieHub.

## Beleggrenze – jetzt erreicht

Die beiden TMDB-Filmprüfungen (21 unklare Titel und diese 5 Originalvideos) können aus **Titel plus Laufzeit allein keine werk-/fassungssichere Identität** liefern. Deshalb nicht mit immer neuen identischen `videos.list`- oder `search/movie`-Calls fortfahren. Ein weiterer technischer Lauf ist nur gerechtfertigt, wenn er eine **neue unterscheidende und zulässige Datenquelle** nutzt und eine konkrete offene Hypothese klären kann.

Fachliche Freigabe einer Video→TMDB-Werkzuordnung erfordert künftig z. B. **nachweisbar unabhängige** Film-Credits/Jahr/Original-/Landestitel/Fassung oder einen belegbaren Herausgeber-Identifier; mit einem bloßen `videoType=movie`, generischem Kanalnamen und Runtime-Toleranz dürfen weder Filmwerke noch Woo-/Leih-/Abo-Verfügbarkeiten automatisch als bestätigt gelten. Auch eine starke Werkidentität allein bestätigt **noch keine aktive DE-Verfügbarkeit**.

## Neue/konkretisierte YouTube-API-Policy-Prüfung (Stand 21.10.2026)

Offizielle Quellen, unverändert verlinkt:

- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies), Abschnitt **III.E.2 Data Aggregation**: weitreichende Beschränkung der Aggregation von YouTube-API-Daten über Content-Owner hinweg. Verknüpfter Gesamtbestand verschiedener `YouTube Movies`-Channel-IDs ist **nicht** automatisch als zulässige öffentliche Multi-Owner-Aggregation zu betrachten.
- Derselbe Text III.E.6 verbietet unzulässiges **Scraping** als Ersatz für die offizielle API.
- [Complying with YouTube's Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide) erklärt einerseits die Bedeutung einer **klar abgegrenzten Plattformsuche** neben anderen Plattformen als mögliches Beispiel für eigenständigen Mehrwert, untersagt andererseits unzulässiges Zusammenführen von API-Daten und fordert eine API-Compliance-Prüfung, wenn der konkrete Anwendungsfall unklar ist.
- [YouTube Data API – Video Resource](https://developers.google.com/youtube/v3/docs/videos): `regionRestriction` und `status.embeddable` sind technische Video-Eigenschaften, **kein nachgewiesener per-Film-Storefront-Angebotstyp**. YouTube Movie Shop-Leihe/Kauf/Flat/Ads/Free kann aus diesen Signalen nicht seriös abgeleitet werden.

**Interpretation für MovieHub:** Die in G1 gesichtete Bidirektionalität **YouTube-first und TMDB-first** bleibt als *Forschungs-/Konzeptoption* dokumentiert, aber die konkrete geplante produktive Zusammenführung vieler YouTube-Content-Owner zu einem einzigen öffentlichen, TMDB-gebundenen MovieHub-Verfügbarkeitskatalog ist **vor G2 ein ausdrücklich ungeklärter, ernsthafter Compliance-Gate**. Nicht behaupten, dass „Quellen nebeneinander anzeigen“ automatisch eine Ausnahme ist, oder dass eine gemeinsame canonical TMDB-ID die API-Bedingungen neutralisiert. Keine pauschale Behauptung, sämtliche Plattform-übergreifende Suchfunktionen seien verboten: der konkrete Datenfluss und die UI müssen gegenüber YouTube beschrieben und geprüft werden.

## Konkrete Fortsetzungsentscheidung

**G1 = weiter offen / G2 = vorerst No-Go** für einen automatischen produktiven YouTube-Providerbadge, TMDB-basierten YouTube-Verfügbarkeitsdatensatz, Shop-/Abo-Tarifart oder Massenimport.

1. **Einmalige praktische Geräte-/Angebotsprüfung je Video (manuell, DE-Kontext):** direkt die fünf bekannten `https://www.youtube.com/watch?v=<videoId>` auf einem deutschen Testgerät/YouTube-App öffnen; tatsächlicher Abspielstatus, mögliche explizite Gratis-/Ads-/Leih-/Kaufkennzeichnung und Filmfassungsanzeige dokumentieren. Konto-/Region-/Rechte- und Zeitabhängigkeit getrennt notieren; keine Preise erfinden. Keine Wiedergabe automatisch aus der API garantieren.
2. **Exakte Filmidentität:** Wo eine authentische unabhängige Werk-/Fassungsquelle vorhanden ist, TMDB-Werkidentität zur Freigabe prüfen; ansonsten `review`. Eventuelle Zweifel an Schnitt/Länge nicht durch einen ±15-Minuten-Automatismus übergehen.
3. **Policy-Freigabe:** Eine kurze, konkrete **API-Compliance-Anfrage** vorbereiten: (A) MovieHub-übergreifender YouTube-first-Discovery-Pool mehrerer eigener/unabhängiger Content-Owner, (B) Zuordnung zu TMDB-ID, (C) zentraler öffentlicher Titelkatalog neben Waipu/Joyn etc., (D) getrennte Anbieterlabels/Deep Links und (E) Speicher-/Updatefristen. Spezifisch fragen, welche dieser Gestaltungen zulässig ist und ob eine **separate YouTube-Suche** mit klarer Branding-/Quellentrennung stattdessen zulässig wäre. Vor Klärung **keinen** automatisierten produktiven Katalog aufbauen.
4. Erst bei dokumentiertem positiven fachlichem und Compliance-Ergebnis den Übergang G2 entwerfen und **gesonderte Nutzerfreigabe** einholen. Bis dahin keine Firestore-, Firebase-, Titel-, Badge-, EPG-, Nightly-, Android-/Fire-TV- oder Deploymentänderung.

**Issue:** [#388 – YouTube](https://github.com/matthias-ennen/movie-hub/issues/388). Dies ist ausdrücklich **kein** Abnahme- oder Abschlussnachweis des YouTube-Adapters. Die Recherche beendet lediglich den aktuellen fünf IDs umfassenden TMDB-/YouTube-Metadatenprüfschritt ohne neue filmfachliche Bestätigung.
