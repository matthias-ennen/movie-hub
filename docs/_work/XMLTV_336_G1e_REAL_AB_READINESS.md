# MovieHub #336 – G1e: echte A/B-Eingabebereitschaft nachweisen

**Stand 12.11.2026 – reine QA.** G1e-2d enthält bereits einen isolierten A/B-Test mit dem echten Waipu-Matcher und einem lokalen HTTP-Teststub. Der Test beweist, dass die Zähler funktionieren; er beweist **nicht**, wie viele echte TMDB-HTTP-Aufrufe im produktiven Nachtlauf tatsächlich eingespart würden.

## Verifizierte Datenlage

Der vollständige, grüne Nachtlauf [#43150253272](https://github.com/matthias-ennen/movie-hub/actions/runs/43150253272) besitzt das Artifact `source-adapter-artifacts-43150253272-1`. Es enthält die fertigen Waipu-/Joyn-SourceAdapter-Envelopes sowie die aggregierten Waipu-/Joyn-Live-Indizes.

Die bestehende Upload-Liste in `.github/workflows/deploy-firebase.yml` schließt folgende **private** oder lediglich im Runner-Cache gespeicherte Daten aus:
- `artifacts/waipu-live/match-decisions.json` (ursprüngliche Waipu-Matcherentscheidungen);
- `artifacts/joyn-live/match-cache.json` und `artifacts/joyn-live/lookup-cache.json` (Joyn-Matcher-/TMDB-Response-Caches);
- `artifacts/waipu-sync/` und `artifacts/joyn-sync/` (die ursprünglichen Grid-/Programmquellen);
- ausdrücklich geprüfte Original-Matcher-Quittungen, wie sie nur die neu eingebauten Opt-in-Capture-Funktionen erzeugen können.

**Die SourceAdapter-Envelopes selbst sind keine Matcher-Quittungen.** Der darin enthaltene `tmdbId`, `matchConfidence` oder `matchReason` ist nicht dasselbe wie ein bestätigter, von der Originalprogramm-ID, Matcher-Version und originalem `checkedAt` gedeckter Entscheidungsbeleg. Besonders bei Waipu fehlt im Envelope der ursprüngliche EPG-Programmtitel.

## Neuer reproduzierbarer Gate-Check

- `scripts/epg-g1e-real-ab-readiness.mjs` liest die beiden bekannten echten SourceAdapter-Envelopes, prüft die Quellgesundheit und erhebt ausschließlich **aggregierte** Werte: Anzahl Ausstrahlungen, Quellprogrammreferenzen, vorhandene Originaltitel und explizite Original-Matcher-Belege.
- Der Check prüft die Existenz der echten Cache-/Rohquellen-Pfade im **entpackten Artifact**; es werden **keine** privaten Caches, Originaltitel, TMDB-IDs oder Wiedergabelinks ausgegeben.
- Fehlen Originaldaten, Matcher-Quittungen oder gesichert gleiche Eingangs-Caches, stellt der Bericht ausdrücklich fest: `canPerformComparableOriginalMatcherAb: false`, `canClaimActualAvoidedTmdbRequests: false` und `actualAvoidedTmdbRequests: null`. Das ist ein **korrekt bestandener Audit**, kein Fehler und kein Produktiv-Go.
- `tests/epg-g1e-real-ab-readiness.test.js` prüft diesen Fail-Closed-Pfad, auch wenn ein Film bereits eine `tmdbId` und `matchConfidence: 1` besitzt.
- `.github/workflows/shared-epg-g1e-ab-readiness.yml` lädt nur das bekannte echte Nachtlauf-Artefakt mit `actions:read`; der Job führt keine TMDB-/YouTube-/Firebase-Netzwerkanfragen aus und publiziert maximal den **aggregierten** Prüfbericht.

## Technisch nächster Schritt bei positivem QA-Audit

Das vorhandene Originalprogramm- und Cachematerial muss im **privaten, ausdrücklich gestarteten QA-Lauf** mit den entsprechenden bereits implementierten Opt-in-Callbacks gemeinsam verfügbar sein. Ein gesunder Lauf kann die frischen Waipu- und Joyn-Quittungen **im Arbeitsspeicher** weiterreichen. Derselbe Testcontroller muss für beide Varianten identische, unabhängig initialisierte Matcher- und TMDB-Response-Cachezustände garantieren und die tatsächlich gestarteten HTTP-Transporte vergleichen.

**Keine** Originaltitel, personenbezogenen Nutzerdaten, Schlüssel oder internen Roh-Matcherentscheidungen in öffentliche Actions-Artifacts, Firebase oder das Repository hochladen. Keine breit angelegte erneute TMDB-Abfrage nur zu Messzwecken.

## Unveränderte Produktivgrenzen

Der gemeinsam nutzbare EPG-Index bleibt deaktiviert. Waipu, Joyn und XMLTV arbeiten unabhängig. Der Nachtlauf, Android-/Fire-TV-App, Firebase und AIR-Senderlinks bleiben durch dieses QA-Paket unverändert. Vor G2 folgt eine eigene Produktivabnahme auf Basis **echter** gemessener Transportdifferenzen, Widersprüche und Zuordnungsqualität.
