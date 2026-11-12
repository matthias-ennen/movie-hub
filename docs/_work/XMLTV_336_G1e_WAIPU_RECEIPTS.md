# MovieHub #336 – G1e Teil 2b-1: gesicherte Waipu-Originaltitel-Quittung

**Ziel:** Das aus dem G1e-2a-Replay bewiesene Herkunftsproblem lösen, ohne Waipu oder den Nightly bereits von einem gemeinsamen Cache abhängig zu machen.

## Ausgangslage

Das echte Nightly-Artefakt aus Run [#43150253272](https://github.com/matthias-ennen/movie-hub/actions/runs/43150253272) enthielt 46.089 Waipu-BroadcastEvents, **aber keinen einzigen ursprünglichen EPG-Programmtitel im Waipu-Event selbst**. Der Filmname in den öffentlichen Waipu-Titeldaten ist nach der TMDB-Zuordnung bereits der **TMDB-Titel** und daher kein Ersatz für die Originalquelle. Der vorhandene Waipu-Matcher kennt den Originaltitel hingegen noch vor seinem Match.

## Neue isolierte sichere Schnittstelle

`scripts/epg-g1e-waipu-match-receipt.mjs` exportiert `buildWaipuApprovedEpgReceipt({ sourceBroadcast, normalizedInput, matcherDecision, broadcastEvent, sourceStatus })`:

- EPG-Programmtitel **direkt aus dem ursprünglichen Waipu-Grid-Broadcast** (`sourceBroadcast.title`), gekoppelt an dessen echte `programId`, exakte Sendezeiten, kanonische Station und ursprünglichen `BroadcastEvent.sourceRefs`.
- Positive Entscheidung des **bestehenden echten Waipu-TMDB-Matchers v5**, nicht eines neuen Ersatzmatchers; die `checkedAt`-Zeit des Originalmatches wird unverändert verwendet.
- **Strengere Freigabe nur für sourceübergreifende Wiederverwendung:** exakter Matcher-Titelsignalbeleg (`title:70`), hoher Score, eindeutiger Mindestabstand zur zweitbesten TMDB-ID, korrekter Typ; Film-/Serienjahr darf nicht deutlich widersprechen. Unsichere Treffer bleiben für **Waipu selbst** weiterhin gültig, werden aber **nicht** zu gemeinsamen Quittungen.
- Originaltitel muss zum normalisierten Input oder dessen belegter Aliasliste passen, nicht zu einem frei geratenen TMDB-Titel. Programmkennung, Sendezeiten und TMDB-ID werden erneut durch die bereits vorhandene `validatedSharedEpgEvidence`-Brücke aus G1e Teil 1 kontrolliert.
- Cache-Treffer aus älteren Matcher-Generationen werden **nicht stillschweigend mit dem aktuellen Erzeugungsdatum versehen**. Wenn ihr originaler `checkedAt` nicht zur aktuellen SourceRef passt, verweigert der Beleg-Prüfer die Freigabe.
- Ausgabe enthält **keine** Waipu-Wiedergabelinks, Mediathek-/AIR-Badges oder Provider-Berechtigungen.

## Noch absichtlich nicht geändert

**Keine** Änderungen an `buildWaipuLiveCatalog`, produktiven Nachtläufen, Firebase, TV-Ansichten oder Datenpublikation. Der neue Beleg-Builder ist rein funktional und kann erst in einer separaten G1e-Stufe von einer vollständig gesunden Matcher-Generation aufgerufen werden. Seine Tests verwenden den **echten** `matchWaipuProgram` und den bestehenden `mapWaipuAiringToBroadcastEvent`, keinen nachgebauten TMDB-Matcher.

## Nächster Schritt

Für eine kontrollierte Integration einen **ausschließlich bei explizitem Dry-Run aktivierten** Capture-Hook bei der abschließenden Waipu-Ereignisprojektion bereitstellen; **keine** Spuren falscher Programm-/Titel-Identitäten in externen Projektionen. Danach analog Joyn (dort sind originale EPG-Titel bereits vorhanden, Matcher-Caches müssen aber mit echten Prüfzeiten verbunden werden). Erst dann einen fairen A/B-Vergleich der getrennten TMDB-Anfragen vor dem gemeinsamen Index durchführen, mit identischen Kandidaten und lokalen Caches.
