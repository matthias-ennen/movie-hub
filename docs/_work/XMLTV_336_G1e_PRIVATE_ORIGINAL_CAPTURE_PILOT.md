# MovieHub #336 – G1e: echter privater Joyn-Originalmatcher-Pilot (isoliert, opt-in)

## 13.11.2026 – G1e: feste Aggregatgröße nach erweitertem Same-Type-Preflight

Der geschützte [Audit #43417244710](https://github.com/matthias-ennen/movie-hub/actions/runs/43417244710) nach PR #803 hat aus dem originalen privaten Checkpoint erfolgreich einen **schema- und zahlengeprüften** Bericht erstellt, scheiterte jedoch nach der Berechnung am **zweiten Artefaktgate**: das erlaubte kompakte JSON war mit **4.367 ASCII-Zeichen** länger als die bisherige pauschale 4.096-Zeichen-Schwelle. Die Rohdaten, Quellen und Matches wurden dadurch nicht veröffentlicht; der geschützte Lauf ist wegen des blockierten aggregierten Artefakts zu Recht **rot**, nicht grün.

Dieser Fix erweitert **nur** das Längenlimit auf **5.120 Zeichen** und behält unverändert die strikte `isSafeJoynRestoredSourceCoverage`-Prüfung mit exakt erlaubten Feldnamen, nichtnegativen Integerzählern, Summenbeziehungen und `externalRequestsStarted=0`. Das Log führte nur numerische Aggregate, keine Originaltitel, IDs, Hashes oder Beschreibungen. Weder das Produktivmatching noch TMDB- oder Provider-Budgets werden geändert. Eine erneute geschützte Bestandsprüfung ist erst nach grünen PR-Checks, Merge und explizitem einmaligem Read-only-Marker gestattet.

---


## 13.11.2026 – G1e: zusätzliche Evidenz für gleichnamige Film-/Serien-IDs (weiterhin offline)

Der [private Originalmatcher-Audit #43404733445](https://github.com/matthias-ennen/movie-hub/actions/runs/43404733445) auf #802 zählt **135** noch relevante Titelgruppen (davon **126** vollständige TMDB-Cache-Erstantwortgruppen); **124** von 126 ursprünglichen Matchversuchen bleiben exakt titelmehrdeutig (79 nur Kollisionen **innerhalb eines Medientyps**, 7 nur Film/Serie, 38 kombiniert), **2** haben keinen gültigen Kandidaten, **0** wurden hypothetisch gematcht. Der Unterschied zu vorherigen 136/127/125 ist dem fortschreitenden 14-Tage-Fenster geschuldet.

Dieser PR untersucht **ausschließlich die 79 Same-Type-Fälle** anhand bereits vorhandener, niemals veröffentlichter Metadaten in derselben geschützten Laufzeitumgebung. Er zählt nur feste Aggregate für:
- gleichnamige Kandidaten ausschließlich **Film** oder ausschließlich **Serie**; bereits beweiskräftig bestätigten Quellmedientyp;
- Quellbeschreibung vorhanden; **sämtliche** exakten TMDB-Treffer mit nichtleerer Übersicht/Beschreibung; Schnittmenge beider Voraussetzungen;
- mindestens zwei unterschiedliche, bekannte TMDB-Erstausstrahlungs-/Erscheinungsjahre (kein Nachweis für ein passendes **Quell**-Produktionsjahr);
- nur bei eindeutigem Quelltyp **Film**: positive Sendedauer sowie zusätzlich für **alle** exakt gleichnamigen Film-IDs noch gültige TMDB-Filmdetailantworten mit plausibler Laufzeit im originalen `tmdb-search-v1`-Cache.

Nur bei diesen Voraussetzungen könnte eine **spätere** kontrollierte Prüfung der bestehenden Originalregeln für Beschreibungs-/Laufzeitabgleich aussichtsreich sein. Weder dieses Audit noch die obigen nackten Merkmale ordnen automatisch einen TMDB-Titel zu. Ein Quell-Produktionsjahr wird im bisherigen jahresfreien Replay nicht an den Matcher übergeben; zwei unterschiedliche TMDB-Jahreszahlen reichen ausdrücklich **nicht** zur Zuordnung. Die Original-Regeln für Beschreibung (hohe Überlappung und ausreichend Vorsprung), Dauer (ein plausibler Kandidat, alle übrigen nachgewiesen unmöglich) und Typ müssen weiter gelten.

**Sicherheit und Grenzen:** Alle Berichte sind ausschließlich numerisch, fix-schlüsselig, intern arithmetisch begrenzt und fail-closed. Private Titel, IDs, Beschreibungen, Jahre, Runtime-Werte, Hashes und Originalantworten werden nie exportiert. Die ursprüngliche 7-Tage-Cache-TTL gilt auch für Detailantworten; fehlende/abgelaufene Details werden nicht nachgeladen. Die 14-Tage-EPG-Quelle wird nicht neu erzeugt. Alle Provider-/TMDB-HTTP-Abfragen bleiben auf **0**, produktive Matcherentscheidungen und G0/Shared-EPG-Freigabe unverändert.

---


## 13.11.2026 – G1e: Root-Cause-Klassifikation der 125 exakten Cache-Replay-Mehrdeutigkeiten

Der [geschützte Audit #43403300222](https://github.com/matthias-ennen/movie-hub/actions/runs/43403300222) nach #801 bestätigt **136** Titelgruppen, **127** vollständig gecachte jahresfreie Basisreplays und **9** wegen fehlender Cacheantworten übersprungene Gruppen. Unter 127 Replays gab es **0** hypothetische Matches, **125** `ambiguous_exact_title` und **2** `no_candidate`. Alle Messungen erfolgten ohne Provider-/TMDB-HTTP und ohne produktive Matcherentscheidungen.

Der nächste rein lokale Analyseschritt trennt mit demselben Original-TMDB-Erstsuchcache die **125 exakten Kollisionen** nach konkurrierenden Identitäten: ausschließlich **Film-gegen-Serie**, ausschließlich **mehrere unterschiedliche TMDB-IDs desselben Typs**, **beides gleichzeitig** oder ein expliziter **nicht näher erklärter Restfall**. Die Originalmatcher-`type`-Filter werden beachtet; dublette identische `type:tmdbId`-Kandidaten zählen nur einmal. Exakte Titel werden allein in privatem Runner-Speicher mit `normalizeWaipuText` über Originaltitel/Alias verglichen; keine Rohprogramme, Sendungstitel, TMDB-IDs oder Beispiele gehen in Ausgaben. Zusätzlich wird ausschließlich als Zahl erfasst, bei wie vielen mehrdeutigen Fällen der Quelltyp bereits eindeutig belegt war. Die Kategorien sind disjunkt und summieren sich zwingend auf die Zahl `unmatchedAmbiguousExactTitle`; die Eingabebasis, Cache-TTL und die Ausgabe-Schema-Gates bleiben unverändert.

Auch das ist keine Lockerung der Regeln und keine Matchfreigabe. Eine ursprüngliche Quelltyp-Klassifikation per SearchQ/Algolia kann die Film-/Serie-Kollision auflösen, aber nicht automatisch zwei gleichnamige Filme oder zwei gleichnamige Serien unterscheiden. Produktionsjahr, Beschreibung, Sendedauer und verlässliche Original-Metadaten müssen gegebenenfalls getrennt und weiterhin gegen die Original-Entscheidungsregeln geprüft werden. Keine neue externe Stichprobe, kein EPG-Neusync, `freshOriginalMatcherReceiptsApproved=false`, `measuredProductionSavings=null`, Shared EPG Index bleibt aus.

---


## 13.11.2026 – G1e: rein offline Originalmatcher-Replay gegen vollständig gecachte TMDB-Erstsuchantworten

**Ausgangspunkt:** Der erfolgreiche geschützte [read-only Audit #43391342657](https://github.com/matthias-ennen/movie-hub/actions/runs/43391342657) bestätigt bei 136 unterschiedlichen Joyn-Quelltiteln ohne lokale TMDB-Kandidaten **248 gültige von 264** modellierten jahresfreien TMDB-Basissuchantworten, 212 davon nichtleer, 16 fehlen. Die 136 Titelgruppen teilen sich in zwei mit ausschließlich `movie`-, sechs mit ausschließlich `series`-Typ und 128 mit unbekanntem Typ.

**Nächster Schritt (weiterhin rein lokal, keine externen Requests):** In demselben geschützten Preflight wird pro normalisierter Gruppe genau **eine Originaltitel-Repräsentanz** mit ihrer tatsächlichen Originalbeschreibung und Sendedauer genommen. Der unveränderte exportierte `matchJoynProgram` wird nur aufgerufen, wenn **alle** für die Basisrecherche notwendigen `tmdb-search-v1`-Antworten noch innerhalb ihrer originalen Sieben-Tage-TTL vorliegen: bei eindeutig belegtem Film-/Serientyp eine zum Typ passende Anfrage, bei unbekanntem/widersprüchlichem Typ beide `/search/movie` und `/search/tv`. Die Original-Response-Objekte werden intern wie beim `WaipuTmdbSearchClient.search` mit festem `type` und `source='tmdb-search'` versehen; durch eine in-memory-Callbackfunktion erhält der Originalmatcher genau diese Searchkandidaten. `loadTmdbDetails` bleibt `null`. Es existiert **kein Fetch, Token, HTTP-Transport oder Live-TMDB-Client** im Replay. Die Replayedaten, Titel, Quellhashes und IDs bleiben ausschließlich im ephemeren Runner; kein Match oder Cache wird gespeichert.

**Fail-closed:** Ein fehlender/abgelaufener Endpunkt (auch wenn der andere Treffer liefert) wird **nie** als leere Antwort interpretiert. Beschädigte/ungewöhnliche Ergebnisse, nichtpositive TMDB-IDs oder mehr als 20 Resultate pro Searchresponse überspringen die ganze Gruppe. `matchJoynProgram` muss die Original-Matcher-Version und eine feste bekannte Ergebniskategorie mit `local+tmdb-search` liefern. Unter den vollständigen Replaygruppen zählen wir ausschließlich anonymisierte hypothetische Matches, keine Kandidaten, Score-/Marginwerte oder IDs. Mehrdeutige Titel bleiben mehrdeutig; die unterbundene Detailauflösung bedeutet, dass ein vorläufiges `ambiguous_exact_title` **keine** definitive produktive Absage ist.

**Ausdrückliche Einschränkung:** Die Eingabe enthält keine neu recherchierten Jahres-/Alias- und Episodenfelder, sondern nur den belegten Quelltyp, Originaltitel, private Beschreibung und Sendedauer. Der produktive Adapter kann zusätzliche datenabhängige SearchQ-/Algolia-Typ-/Jahresbelege, Details, Aliasvarianten und Jahr-/Fallback-Suchschritte verwenden. Deshalb heißt dieser Schritt *hypothetisches Offline-Replay*, nicht vollständiger Produktionslauf, nicht produktive Matcherentscheidung, nicht EPG- oder TMDB-Ersparnisnachweis. Das vorhandene boolesche G1e-Freigabegate bleibt `false`, Einsparung `null`, der Shared EPG Index weiterhin abgeschaltet.

---


## 13.11.2026 – G1e: vorhandenen TMDB-Antwortcache vor Mini-Originalmatcher-Stichprobe prüfen

**Ausgangspunkt:** Die erfolgreiche [private Messung #43388690063](https://github.com/matthias-ennen/movie-hub/actions/runs/43388690063) bestätigt im aktuellen 14-Tage-Horizont **136** verschiedene Joyn-Originaltitel ohne lokale TMDB-Kandidaten, darunter **2** mit ausschließlich bestätigtem Quelltyp `movie`, **6** mit `series` und **128** ohne eindeutigen Typ. Es liegen **keine** freigegebenen frischen Originalmatcherquittungen und **keine** gemessenen produktiven HTTP-Einsparungen vor.

**Neuer privater rein lokaler Preflight:** Für jeweils **einen repräsentativen Originaltitel je normalisierter Titelgruppe** modellieren wir die minimalen *jahresfreien ersten TMDB-Suchslots* des unveränderten `JoynTmdbSearchClient`: bekannter Film → `/search/movie`, bekannte Serie → `/search/tv`, unbekannter oder widersprüchlicher Typ → **beide** Endpunkte. Das sind unter dem obigen Datenstand **264 theoretische erste Slots** (130 Filme, 134 Serien), ausdrücklich **keine Garantie** der späteren Requests und kein genehmigtes Budget.

Die Anfragekeys werden **bytegleich** in der originalen Form `JSON.stringify([endpoint, {language:'de-DE', query:originalTitle, include_adult:'false'}])` mit dem vorhandenen 7-Tage-`JoynLookupCache.get('tmdb-search-v1', key)` geprüft. Numerisch getrennt zählen wir noch gültige Antworten mit `results`-Array, darunter nichtleere Ergebnisse, fehlende/abgelaufene Caches und strukturell ungültige Cacheantworten. Die Originaltitel bleiben ausschließlich im ephemeren geschützten Runner. Das Ergebnis enthält nur feste ganzzahlige Summen; sämtliche Summengleichungen und `externalRequestsStarted=0` sind harte Gates.

**Grenzen:** Der echte Originalmatcher kann jahresgebundene Suchen, Fallback-Suchen, mehrere Aliase, Detailaufrufe und Wiederholungen nutzen. Die Modellrechnung erfasst **nur jahresfreie Basisabfragen für eine Titelrepräsentanz**, nicht notwendigerweise die künftig exakten Requestkeys, nicht alle Schreibweisen und keine HTTP-Prognose. Andere Sprachen, produktive Matchingregeln und Budgets bleiben unverändert. Dieser Schritt startet **keine** Joyn-/Algolia-/TMDB-HTTP-Anfrage, erzeugt keine EPG-Neusynchronisierung und schaltet den Shared Index nicht ein. Eine spätere wirklich externe Mini-Stichprobe braucht gesonderte explizite Freigabe und einen unabhängig überwachten harten Startdeckel.

---


## 13.11.2026 – G1e: Original-Quelltypbelege für 136 nicht lokal vorhandene Joyn-Titel abgleichen

Die geschützte [Read-only-Messung #43372798332](https://github.com/matthias-ennen/movie-hub/actions/runs/43372798332) hat **393** unterschiedliche fehlende Originalschlüssel ohne lokale TMDB-Kandidaten in **136** unterschiedliche normalisierte Originalsendungstitel zerlegt (davon 35 Mehrfachgruppen, 257 zusätzliche Schlüssel). Das reduziert die diagnostische Titelsuchfläche, ist aber keine belastbare Vorhersage der TMDB-HTTP-Kosten.

Der folgende ausschließlich lokale Audit liest pro Originalsendung ausschließlich schon gespeicherte **Joyn-SearchQ**- und **Algolia-Hit-Antworten** über die unveränderte `JoynLookupCache.get`-Methode einschließlich Original-TTL und technischer Fehlerprüfungen. Ein `movie`-/`series`-Typ ist nur dann als diagnostischer Quellenhinweis gültig, wenn entweder `trustedCachedJoynSearchType` einen im Original-SearchQ exakt belegten Typ liefert oder die Originalfunktion `classifyJoynAlgoliaHits` anhand bereits vorhandener Hits einen validierten Typ ermittelt. Wird innerhalb einer normalisierten Titelgruppe beides widersprüchlich oder verschieden klassifiziert, gilt die gesamte Gruppe als `conflicting`, **niemals** als eindeutig typisiert.

Veröffentlicht werden ausschließlich feste numerische Zähler: Anzahl unterschiedlicher Originaltitel, Gruppen mit einer noch gültigen gecachten SearchQ-Antwort, Gruppen mit Algolia-Antwort, darunter jeweils belastbare Typbelege, und die disjunkten Kategorien **nur Filmtyp**, **nur Serientyp**, **widersprüchliche Typen** und **ohne belastbaren Typ**. Die disjunkten Kategorien müssen exakt alle unterschiedlichen normalisierten Titel abdecken; Schema, Summen, externe Anfragezahl `0` und obere Zählgrenzen werden vor dem Artefakt-Upload strikt geprüft.

**Nicht** enthalten: Rohsendungstitel, IDs, Hashes, Beispiele, rohe Suchhits, verschärfte/gemilderte Matchingregeln, Produktivzuordnungen, neue Provider- oder TMDB-HTTP-Anfragen, Budgeterhöhungen, EPG-Neugeneration, echte Matchfreigabequittungen, eine gemessene TMDB-Einsparung oder ein Shared-EPG-Go. Ein hypothetisch vorhandener Quelltyp liefert ausdrücklich **keine** TMDB-Identität. Nach grünen synthetischen PR-Tests nur einmalige geschützte Read-only-Messung auf `main` via bewährtem Marker.

---


## 13.11.2026 – G1e: fehlende lokale TMDB-Kandidaten nach Original-Quelltitel deduplizieren

Der geschützte vollständige Offline-Quellaudit [#43371696383](https://github.com/matthias-ennen/movie-hub/actions/runs/43371696383) ergab im wandernden 14-Tage-Horizont **593** unterschiedliche fehlende Originalcache-Schlüssel, darunter **395** ohne jeden lokalen TMDB-Kandidaten und **181** bekannte Titelkollisionen. Die vorherigen 159 `no_joyn_type`-Fälle wurden über bereits gecachte private Algolia-Hits geprüft: 158 ohne validierten Titelbeleg, 1 widersprüchliche Typfamilie, **0** eindeutig aufgelöste Typen, **0** neue externe Requests.

**Bevor neue TMDB-HTTP-Anfragen überhaupt budgetiert werden**, prüft der nächste geschützte Read-only-Audit die 395 aktuell fehlenden Originalcache-**Schlüssel** ohne lokale Kandidaten nach ihrem **unveränderten `normalizeWaipuText(originalTitle)`**. Mehrere Originalcache-Schlüssel können unterschiedliche Beschreibungen, Episodentitel oder Laufzeiten derselben Sendung repräsentieren. Die ausschließlich lokal gehaltene Map der normierten Titel zählt (1) verschiedene nichtleere Titelformen, (2) Titelgruppen mit mehr als einem Originalschlüssel, (3) durch Wiederholungen zusätzliche Schlüssel, (4) gegebenenfalls leere Titelformen, (5) Schlüssel mit Quellenbeschreibung und (6) Schlüssel mit Untertitel. Eine Titeldeduplizierung ist hier **nur eine Planungsmetrik**, kein freigegebener Matcher-Schlüssel und keine Prognose tatsächlich benötigter TMDB-Requests.

Ausschließlich feste numerische Aggregate mit strenger Summen- und Schemaprüfung; alle privaten Originaltitel, IDs, Hashes und Kandidatendaten verbleiben im Runner. Originalmatcher und seine Schwellen bleiben unverändert. **0 externe Requests**, keine neue 14-Tage-Quellgeneration, kein Produktivmatching oder A/B-Transporttest, keine Freigabe neuer Originalquittungen, keine Budgeterhöhung, kein Shared-EPG-Go. Nach grünen PR-Tests einmalige markierte private Read-only-Prüfung auf `main`.

---


## 13.11.2026 – G1e: vorhandene private Algolia-Hits für 159 fehlende Joyn-Quelltypen auswerten

Der letzte bestätigte geschützte Audit [#43312369870](https://github.com/matthias-ennen/movie-hub/actions/runs/43312369870) lieferte für einen aktuellen Quellenhorizont **159** ohne eindeutigen SearchQ-Originaltyp (`no_joyn_type`); weitere **21** weiterhin offene Fälle sind trotz eindeutigem Typ innerhalb desselben Typs exakt titelmehrdeutig. Alle übrigen Klassifikationsfamilien und Summen bleiben unverändert.

Der nächste *rein lokale und geschützte* Read-only-Audit nutzt **ausschließlich** den bereits restaurierten privaten `JoynLookupCache.get('algolia-hits-v1', originalTitle)` mit originaler **7-Tage-TTL**. Nur `status=ready` und höchstens **20** Hits werden über den **unveränderten originalen** `classifyJoynAlgoliaHits({ title, secondaryTitle }, cached.hits)` geprüft. Die Ausgabe gruppiert lediglich feste numerische Zähler: cache missing/stale, ungültige gecachte Antwort, keine validierten Treffer, konfligierende Film-/Serientypen, konservativ validierte Movie-/Series-Klassifikation. Für letztere erfolgt ausschließlich eine **hypothetische** Offline-Zweitprüfung per bestehendem Original-`matchJoynProgram` mit `searchTmdb:null` und `loadTmdbDetails:null`. Bereits bestehende gleichnamige TMDB-Kollisionen werden **nicht** heuristisch aufgelöst.

**Beide Rechensummen sind Sicherheitsgates:** Alle 159 SearchQ-No-Type-Fälle müssen exakt auf die Algolia-Kategorien aufgeteilt werden, alle typisierten lokalen Zweitprüfungen exakt auf aufgelöst und weiterhin offen. Ergebnisfelder, Feldnamen und numerische Grenzen werden vor jedem Bericht/Upload strikt allowlist-geprüft; `externalRequestsStarted=0` ist obligatorisch. Ausschließlich synthetische Regressionen auf PR-Branches, private Quell- und Cache-Rohdaten nur auf geschütztem `main` im ephemeren Runner.

**Keine** Originaltitel/IDs/Hashes/Rohhits oder personenbezogenen Daten in Artefakten oder Logs. Keine Joyn-/Algolia-/TMDB-Anfragen, keine neue 14-Tage-Synchronisierung, kein A/B-HTTP-Vergleich, kein Produktionsmatching, kein behaupteter TMDB-Einspareffekt, keine G1e-Quittungsfreigabe und **keine** Aktivierung des Shared EPG Index. G0-Lizenz- und Quellenfragen für XMLTV bleiben separat offen.

---


## 12.11.2026 – G1e: die verbleibenden SearchQ-Mehrdeutigkeiten rein lokal unterscheiden

Der geschützte Read-only-Lauf [#43294753080](https://github.com/matthias-ennen/movie-hub/actions/runs/43294753080) mit PR #794 ergab für **181** exakt mehrdeutige Originaltitel: **0** fehlende/ungültige Lookup-Cacheantworten, **159** Antworten ohne vertrauenswürdigen eindeutigen Quelltyp, **8** belegte Movie- und **14** belegte Series-Typen. Im rein lokalen Matcher-Zweitdurchlauf wurde **1** zusätzlicher Fall nur hypothetisch aufgelöst; **21** der typisierten Fälle bleiben offen. Es bestehen weiter 622 unterschiedliche fehlende Originalcache-Schlüssel; es gibt keine neuen freigegebenen Quittungen.

Der nächste **ausschließlich offline** laufende Diagnoseschritt zerlegt die 159 nicht eindeutigen vorhandenen SearchQ-Antworten nur bei überprüfter Originaltitel- und Antwortkonsistenz in `both_types` (Film **und** Serie), `no_exact_type` (keine passende typisierte Originalantwort) und `other_or_invalid` (nicht belastbar/abweichend). Die 21 typisiert, aber weiter abgelehnten Originalmatcher-Projektionen werden in dessen **unveränderte** vier feste Ablehnungsgründe aufgeteilt. Beide Teilmengen müssen rechnerisch exakt aufsummieren; die Sicherheitsprüfung blockiert fremde Felder, inkonsistente Summen und jede externe Requestzahl größer null.

**Keine** Rohantworten, Programmtitel, IDs, Schlüssel, privaten Matchentscheidungen oder spekulativen Nachklassifikationen werden ausgegeben. Keine Joyn-/TMDB-/Algolia-Netzwerkabfrage, neue Originalgeneration, Produktivpublikation, Live-Einsparungsmessung, Budgetänderung oder Freigabe des gemeinsamen EPG-Index. Erst nach grüner CI auf `main` ist ein neuer privater Read-only-Audit mit ausschließlich numerischen Aggregaten zulässig. Issue #336 bleibt offen.

---





## 12.11.2026 – Korrekte PRIVATE Joyn-Quellen-Typklassifikation aus bestehendem Cache prüfen

Der gesicherte [Read-only-Run #43292722861](https://github.com/matthias-ennen/movie-hub/actions/runs/43292722861) zeigte: Die **181/181 lokalen Kollisionen** haben `ambiguous_exact_title` als Ursache; 170 Originalsendungen besitzen eine Beschreibung und 11 keine. Ein Titel kann sowohl in mehreren TMDB-Filmen als auch mehreren Serien vorkommen. Das bloße Vorhandensein einer Beschreibung oder mehrerer Kandidaten ist daher **keine** Freigabegrundlage.

Der nächste private Offline-Audit liest den bereits restaurierten `artifacts/joyn-live/lookup-cache.json` mit der **originalen** `JoynLookupCache.get('joyn-title-v1', originalTitle)`-Methode (7-Tage-TTL und bestehende technische Fehlerprüfung). Eine Film-/Serientypkennung gilt *nur für die nachfolgende Diagnose* als zulässiger privater Quellhinweis, wenn der **gespeicherte originale Joyn-SearchQ-Beleg** `reason=exact_joyn_search`, genau einen `exactTypes`-Wert (`movie` oder `series`), eine positive und konsistente Anzahl und ausschließlich zum Originaltitel exakt passende `Movie`-/`Series`-/`Episode`-Belege dieser einen Typkategorie enthält. Keine heuristische Typzuweisung aus Filmtitel, Cover oder TMDB-Kandidat.

Für einen solchen privat gültigen Original-Suchbeleg wird der **bestehende** lokale `matchJoynProgram({ title, type, description, broadcastDurationMinutes }, { localCandidates, searchTmdb:null, loadTmdbDetails:null })` als zweite **rein lesende** Projektion ausgeführt. Die ursprüngliche lokale Mehrdeutigkeit bleibt separat dokumentiert; eine Auflösung im zweiten Durchlauf ist **keine** neu freigegebene G1e-Quittung, kein Produktivmatching und keine gemessene TMDB-Einsparung. Die Identitätsregeln bleiben unverändert.

Öffentlich sichtbar werden ausschließlich feste numerische Aggregate: geprüfte exakt mehrdeutige Schlüssel; fehlende/abgelaufene Joyn-SearchQ-Caches; vorhandene Antworten ohne belastbare eindeutige Typklassifikation; trusted Film-/Serien-Typbelege; dadurch lokal lösbare bzw. weiterhin ungelöste Schlüssel; und immer 0 externe Requests. Die privaten Rohantworten, Titel, IDs, Hashes oder Zuordnungen verlassen den geschützten Runner nicht. Summen und Schema werden strikt geprüft; Tests verwenden nur synthetische Werte.

Die Tests selbst dürfen ausschließlich auf PRs ohne Zugriff auf private Checkpoints laufen. Der echte Offline-Audit wird erst nach grüner PR-CI auf `main` explizit ausgelöst. Produktiver Nightly, EPG-/TMDB-Budgets, die Joyn-Adapterlogik und der deaktivierte Shared EPG Index bleiben unangetastet.

---

## 12.11.2026 – Gründe der 181 lokalen Joyn-Matcher-Ablehnungen (reiner Diagnostikschritt)

Der erfolgreiche geschützte [Read-only-Lauf #43289483491](https://github.com/matthias-ennen/movie-hub/actions/runs/43289483491) hat von **623** unterschiedlichen fehlenden Originalcache-Schlüsseln **17** rein lokal zuordenbare Fälle, **425** ohne lokalen Kandidaten und **181** ungelöste Fälle **mit** lokalen TMDB-Kandidaten ermittelt. Diese 181 Fälle werden jetzt nach den **festen Gründen des existierenden Originalmatchers** aufgeschlüsselt, nicht mittels eines neuen oder weicheren Matchers.

Die Erweiterung der geschützten Offline-Prüfung liest nur die bereits lokal berechneten `result.status`- und `result.reason`-Werte. Sie gibt ausschließlich die vier fest benannten Zähler `noCandidateAboveMinimumScore` (kein Kandidat mit mindestens 70 Punkten), `belowAcceptanceScore` (Kandidat unter Freigabeschwelle), `ambiguousScoreMargin` (zu geringer Vorsprung) und `ambiguousExactTitle` (mehrere exakt gleichnamige TMDB-Kandidaten) aus. Zusätzlich folgen feste Oberkategorien **ein Kandidat / mehrere Kandidaten** und, für exakte Mehrdeutigkeiten, **mit / ohne Original-Quellenbeschreibung**. Damit lassen sich Konflikte von wirklich fehlenden Suchergebnissen unterscheiden, ohne das System mit unbekannten Titeln zu ergänzen.

Jede Anzahl ist **ausschließlich ein privater, anonym aggregierter Diagnostikwert**. Unbekannte Matcher-Gründe, unzulässige Ergebnisformen oder widersprüchliche Summen führen zum Abbruch; niemals werden Original- oder Kandidatentitel, TMDB-IDs, Quellenidentitäten, Hashes oder freie Begründungstexte in Logs oder Artefakten ausgegeben. Der private Test läuft nur auf dem geschützten Runner; PRs erhalten ausschließlich synthetische Testdaten.

Die **tatsächlich im Produktivmatcher vorhandenen** Eindeutigkeitsschwellen, Titel- und Quellenidentitätsregeln bleiben unangetastet. Eine Beschreibung allein berechtigt noch nicht zum Auflösen einer Mehrdeutigkeit; auch eine spätere Typklärung darf nur aus gesicherter Quellenprovenienz stammen. Keine TMDB-/Joyn-/Algolia-Anfrage, kein HTTP-Pilot, keine neuen G1e-Originalquittungen, keine behauptete produktive Einsparung und kein Shared-Index-Go.

---

## 12.11.2026 – Fehlende Originalschlüssel: rein lokaler Matcher-Vordurchlauf

Aus dem geschützten [Lauf #43285326590](https://github.com/matthias-ennen/movie-hub/actions/runs/43285326590) sind unter 50.596 noch relevanten Originalprogramm-IDs **623 unterschiedliche fehlende Original-Cache-Schlüssel** bekannt. Diese Zahl ist **nicht** mit der Zahl künftig benötigter TMDB-HTTP-Suchanfragen gleichzusetzen.

Die Erweiterung des existierenden G1e-Read-only-Audits spielt für **jeden unterschiedlichen fehlenden Schlüssel genau einmal** den bereits produktiv genutzten Aufruf `matchJoynProgram({ title, description, broadcastDurationMinutes }, { localCandidates, searchTmdb: null, loadTmdbDetails: null })` nach. Die lokalen Kandidaten stammen aus der bereits verwendeten Projektion aus öffentlichem TMDB-Katalog und vorhandenen veröffentlichten Live-Titeln. Keine externe TMDB-Suche, keine Joyn-/Algolia-HTTP-Abfrage, keine Runtime-Detail-API, keine neue Matcher-Cache-Entscheidung und kein Schreiben der Rohdaten.

Der private Bericht enthält nur die feste `offlineLocalPreflight`-Struktur: Anzahl geprüfter **unterschiedlicher fehlender Originalschlüssel**, davon lokal ohne externe Anfrage zuordenbar, ungelöst ohne vorhandene lokale Kandidaten und ungelöst trotz lokaler Kandidaten sowie die auf **null** festgeschriebenen externen Anfrage-Starts. Alle Summen müssen exakt der Anzahl fehlender unterschiedlicher Originalschlüssel entsprechen. Originalschlüssel, Titel, IDs, Kandidaten und Entscheidungen verlassen den ephemeren Runner **nicht**. Auf PRs werden ausschließlich synthetische Tests ausgeführt; echte private Rohdaten bleiben dem geschützten Job vorbehalten.

**Ein lokal erfolgreiches Replay ist noch keine frische G1e-Matcher-Freigabequittung** und keine gemessene produktive TMDB-Ersparnis. Das Produktivverhalten, die EPG- und TMDB-Budgets und der deaktivierte Shared-Index bleiben unverändert. Die anschließend gemessenen noch ungelösten Schlüssel bestimmen die Größe einer zukünftigen streng begrenzten Originalmatcher-HTTP-Stichprobe.

---

## 12.11.2026 – Unterschiedliche noch offene Matcher-Schlüssel statt Programm-IDs

Der erfolgreiche private Read-only-Audit [#43283391309](https://github.com/matthias-ennen/movie-hub/actions/runs/43283391309) wies unter **50.669** ursprünglichen, noch relevanten Joyn-Programm-IDs **2.038** IDs ohne passenden Cache-Schlüssel sowie **einen** vorhandenen, aber vom Originalcache verworfenen Schlüssel nach. Das bedeutet nicht, dass tatsächlich 2.038 unterschiedliche TMDB-Suchfälle vorliegen: Wiederholungen desselben Titels mit gleicher Beschreibung, Untertitel und Laufzeit ergeben denselben ursprünglichen SHA-Schlüssel.

Die Erweiterung des **bestehenden** geschützten Original-Checkpoint-Audits sammelt die ursprünglichen SHA-Schlüssel ausschließlich flüchtig als private `Map` und berichtet nur fünf überprüfte Aggregate: Anzahl unterschiedlicher Schlüssel insgesamt, unterschiedlicher fehlender Schlüssel, verworfener Schlüssel, wiederverwendbarer positiver und wiederverwendbarer negativer Schlüssel. Zusätzliche Tests beweisen, dass zwei unterschiedliche Programm-IDs mit exakt gleichem ursprünglichem Schlüssel **nur einen** fehlenden Suchfall ergeben. Widersprüchliche Statusklassifikationen für denselben Schlüssel werden geschlossen abgebrochen.

Wie zuvor werden **keine** Roh-Hashes, Titel, Sender-/Programm-IDs oder Suchtexte gespeichert, ausgegeben oder hochgeladen. Der feste Bericht wird sowohl beim Erstellen als auch vor dem Upload gegen ganzzahlige Grenzen und Konsistenzgleichungen geprüft. Keine neue Joyn-Quelle, keine TMDB-API, kein Matcher-HTTP, kein höheres Budget, keine Veröffentlichung, keine Shared-EPG-Freigabe.

**Wichtig:** Eine Zahl unterschiedlicher fehlender Schlüssel ist **keine** vorhergesagte Anzahl von TMDB-HTTP-Anfragen. Ein Originalmatcher-Suchfall kann mehrere Suchen und zusätzliche Kontextabfragen auslösen; wiederverwendbare negative Entscheidungen sind keine gefundenen TMDB-Identitäten. Erst diese neue Messung erlaubt, die nächste kleine, geschützte Offline-Stichprobe sinnvoll festzulegen.

---

## 12.11.2026 – G1e: echte Quell-Cache-Schlüsselabdeckung aus privatem Checkpoint

Die vorangegangene geschützte [TTL-Messung #43278792468](https://github.com/matthias-ennen/movie-hub/actions/runs/43278792468) bestätigte im restaurierten Joyn-Cache 64.044 historische Entscheidungen, davon 33.925 positive (30-Tage-TTL) und 11.154 negative (7-Tage-TTL) innerhalb der Altersgrenzen. **Diese 45.079 historisch zeitlich geeigneten Einträge sind noch keine nachgewiesenen Treffer für das aktuelle EPG.** Separate 23.292 Lookup-Antworten lagen ebenfalls innerhalb der 7-Tage-TTL; deren tatsächliche Anwendbarkeit wurde nicht überprüft.

Der nächste Schritt verwendet **nur den vorhandenen privat restaurierten vollständigen 14-Tage-Joyn-Sync**, seine 56 Originalcache-Fenster und den unveränderten Joyn-Entscheidungs-Cache. Die vorhandene **öffentliche** TMDB-Katalogfassung wird mittels `npm run tmdb:restore` abgerufen (nur veröffentlichte Daten, **kein** TMDB-API-Aufruf). Für jedes noch nicht beendete Originalprogramm im restaurierten Horizont werden exakt die **produktiv genutzte** Normalisierung, V2-Anreicherung, Senderzuordnung, Auswahl des ersten Programmeintrags, originaler SHA-Cache-Schlüssel, lokaler TMDB-Kandidatenkontext und `JoynMatchCache.get` ausgeführt — ausschließlich lesend und ohne eine neue Matcherentscheidung.

Der feste anonyme Diagnosebericht trennt:
- vollständige 56 geprüfte Originalfenster, Rohzeilenzahl und nach Programm-ID eindeutige verbleibende Programme;
- Anzahl der **exakt vorhandenen Original-Cache-Schlüssel** bzw. fehlenden Schlüssel;
- die nach **originaler Cache-Policy** tatsächlich wiederverwendbaren positiven und negativen Cacheentscheidungen (TTL, technische Fehler und bei negativen Treffern aktueller lokaler Kandidatenkontext);
- vorhandene, aber durch die Original-Policy abgewiesene Schlüssel;
- ein gesondertes Flag, ob der vollständige Source-Status zum Prüftermin noch innerhalb der geprüften 72-Stunden-Frische und des 14-Tage-Horizonts liegt.

**Grenze der Evidenz:** Dies ist eine *statische Replay-Projektion* aus dem privaten Checkpoint, **keine** frische Joyn-Originalgenerierung, kein externer Match-HTTP-Vergleich, kein Produktiv-Beleg. Ein rekonstruierter Cachetreffer darf nicht als neu freigegebene G1e-Matcher-Quittung gelten. Es werden keine Titel, Sender, Roh-IDs, Hashes, URLs, Kandidatenlisten, EPG-Einträge oder Tokens ins GitHub-Log oder Artefakt geschrieben. Die originale Quellprüfung bricht bei fehlenden/abweichenden Fenstern, ungültigen Metadaten und übergroßen Quellen geschlossen ab. Der neue Prüfjob ist geschützt; auf PRs laufen ausschließlich synthetische Tests.

Budgets, Adapter, produktiver Nightly, Firebase-Datenmodell und der deaktivierte Shared EPG Index bleiben unverändert. Erst die **gemessene** Schlüssel-/Kontextabdeckung soll die Größe des folgenden getrennten, budgetierten Originalmatcher-Stichprobenlaufs begründen.

---

## 12.11.2026 – nächster Schritt: zeitliche Cache-Gültigkeit ohne TMDB-Anfragen

Der vollständig geschützte **read-only** Checkpoint-Audit #43233887430 hatte 64.044 historische Joyn-Matcherentscheidungen gezählt. Diese Bestandszahl sagt allein noch nichts über die aktuelle Cache-Wiederverwendbarkeit aus: `JoynMatchCache` hat **30 Tage** TTL für positive Zuordnungen, **7 Tage** für negative; der separate `JoynLookupCache` hat **7 Tage** für gespeicherte Original-Antworten. Änderungen an Titel, Untertitel, Beschreibung, Sendedauer oder lokalen Kandidaten können trotz einer gültigen TTL weitere Suchen nötig machen.

Der neue `scripts/epg-g1e-private-joyn-cache-ttl-audit.mjs` prüft ausschließlich die **bereits privat restaurierten** JSON-Caches lokal auf exakte Schema-/Matcher-Version, Zeitgrenzen und konservative Altersklassen. Er meldet **nur feste aggregierte Zahlen**, getrennt nach TTL-geeigneten positiven/negativen Entscheidungseinträgen, abgelaufenen/ungültigen Zeitstempeln und TTL-geeigneten Antwortcache-Einträgen. Die Zahlen sind ausdrücklich **nur Obergrenzen**: Es findet weder eine aktuelle Originalprogramm-Schlüsselprüfung noch lokale Kandidatenprüfung, technische Quellenvalidierung oder neue Matchfreigabe statt.

Sicherheitsgrenzen: maximal 600 MiB je regulärer Quelldatei, höchstens 250.000 Cacheeinträge; nur der geschützte `main`-Readiness-Job mit Authentisierung darf private Cacheinhalte lesen, der PR führt nur synthetische Tests ohne Secrets aus. Keine Joyn-EPG-Abfrage, kein TMDB-HTTP, kein Cloud-Upload von Cache oder Titel, kein geänderter Nightly, keine Index-Freigabe. Das feste Berichtsschema hält `currentProgrammeCacheHitsVerified=false`, `freshOriginalMatcherReceiptsApproved=false` und `measuredProductionSavings=null`.

Erst die realen TTL-Zahlen sollen helfen, einen eng begrenzten, weiterhin getrennt freizugebenden Originalmatcher-Stichprobenlauf zu dimensionieren. Wiederholung des vollständigen 14-Tage-Echtlaufs allein zur Cache-Diagnose ist nicht erforderlich.

---

## 12.11.2026 – G1e: Matcher-Berichtsprüfung nach #787 präzisiert

Der neueste echte geschützte [Lauf #43272834198](https://github.com/matthias-ennen/movie-hub/actions/runs/43272834198) hat die vollständigen 56 Joyn-EPG-Basisfenster mit 194 Requests, null Cachehits, 69 Fensterteilungen und ohne Retry abgeschlossen. Der separate Original-Joyn-TMDB-Suchdeckel (30) führte danach zu `JOYN_TMDB_REQUEST_BUDGET`. Die Gesamtgrenze von 450 HTTPS-Starts wurde bei 299 nicht erreicht. Es gab **keine** vollständige Joyn-Originalmatcherfreigabe, keinen Waipu-A/B-HTTP-Test und keine gemessene Produktionseinsparung.

Die bisherige anonyme `sourceTrace.phase=post-epg-before-matcher` **beweist nicht**, dass der Matcher noch nicht gestartet wurde: Der private Bericht wird nur eingelesen, wenn sein Schema und alle Zahlen im alten Grenzrahmen (max. 50.000 Programme) validieren. Der vorhandene geschützte [read-only Checkpoint-Lauf #43233887430](https://github.com/matthias-ennen/movie-hub/actions/runs/43233887430) hatte bereits **64.044 historische Joyn-Entscheidungs-Cacheeinträge** gezählt (nicht gleichzusetzen mit aktuellen Cachetreffern oder Freigabequittungen).

Dieser reine Diagnostik-Fix differenziert darum in `matcherReportStatus` strikt zwischen `absent`, `not-current`, `rejected-by-schema-or-bounds` und `validated`. Ein aktueller, aber abgewiesener Bericht erscheint nur als `phase=matcher-progress-unverified`, **nicht** als vermeintlich noch nicht gestarteter Matcher. Die rein numerische Grenze für originale Matcher-**Zähler** wird auf 200.000 begrenzt erhöht, um größere 14-Tage-Programmeaggregate diagnostizieren zu können. **Unverändert** bleiben die maximal 50.000 separat freigebbaren Original-Quittungen, 30 Joyn-TMDB-Suchstarts, 250 EPG-Starts, 450 globale HTTPS-Starts, Privatsphärenprüfungen und sämtliche Produktivpfade.

Die Änderung selbst startet **keinen** privaten Echtlauf. Der nächste gesondert genehmigte Test sollte eine kleine, budgetierte, korrekte Originalmatcher-Stichprobe statt eines wiederholten vollständigen 14-Tage-Exports sein. Die Cacheverfügbarkeit und -Frische bleibt separat zu klären; eine historische Cacheentscheidung ist keine neue G1e-Belegquittung.

---

## Zielgenaue Fehlerlokalisierung nach echtem Capture #43267851778 (#787)

Der letzte isolierte echte [Joyn-Capture #43267851778](https://github.com/matthias-ennen/movie-hub/actions/runs/43267851778) hat nach erneutem erfolgreichen privaten Quellenrestore **sicher abgebrochen**, aber **nicht** am globalen Anfragebudget:
`status=failed-closed`, `phase=joyn-original-generation`,
`failureClass=UNCLASSIFIED_ORIGINAL_SOURCE_ERROR`,
`boundedAllowlistedFetches=299` von maximal `450`.
Das ist **keine** erfolgreiche EPG-Originalgeneration, kein bestätigter Joyn-Beleg,
kein Waipu-A/B-HTTP-Vergleich und **keine** Produktiveinsparung.
Die erhöhten Budgets nochmals pauschal anzuheben wäre damit nicht begründet.

Die technische Folgekorrektur nutzt **nur privat bereits entstehende
Statusdateien**: `artifacts/joyn-sync/status.json` (ursprüngliche
56-Fenster-Synchronisierung) und
`artifacts/joyn-live/matching-progress.json`
(ursprünglicher Matcher). Nach einem fehlgeschlagenen Pilotlauf wird
ausschließlich für **frisch im selben Prozess entstandene Generationen**
`sourceTrace` erzeugt. Ein restaurierter alter Status ist **keine** zulässige
Echtlauf-Evidenz. Fehlt der aktuelle originale Status, entfällt die
Zusatzdiagnose vollständig.

Der neue, feste Privacy-Bericht enthält ausschließlich:

- `phase`: `epg-sync`, `post-epg-before-matcher`,
  `original-matcher` oder `post-matcher-publication`
- Aus der echten EPG-Sync-Datei:
  `processedBaseWindows` (maximal 56),
  `cachedBaseWindows`, `recursiveWindowSplits`,
  `retryStarts`, `startedEpgRequests` (maximal 250),
  `epgBudget` und eine **statisch geprüfte** Fehlerklasse
- Nur nach **vollständigem** EPG-Status aus der Matcher-Statusdatei:
  `processedOriginalPrograms`, `totalOriginalPrograms`,
  `originalMatchCacheHits`, begonnenen TMDB-/Algolia-/
  Serienseiten-Anfragen innerhalb ihrer separaten Budgets,
  plus ausschließlich fest definierte `JOYN_...`-Budgetfehlerklassen
  (alle fremden Strings werden `OTHER_MATCHER_ERROR`)

Weder rohe Exceptions noch Serien-/Filmtitel, Zeitfenster,
Senderkennungen, URLs, API-Tokens, TMDB-IDs oder Matcherentscheidungen
dürfen diesen Bericht verlassen. Vor Artefakt-Upload wird das gesamte
`sourceTrace` zusätzlich auf **exakte Schlüssel**, feste Enums,
logische Konsistenz und numerische Grenzen geprüft. Tests belegen
die Zurückweisung von injizierten Originaltiteln, fremden Feldern,
alten Checkpoints und ungültigen Größen.

Es wurde **keine** automatische Wiederholung oder Anhebung der bisherigen
250-EPG-/450-Gesamt-HTTPS-Grenzen eingebaut, und der produktive
Joyn-/Waipu-Adapter, Nightly und gemeinsame Index bleiben unverändert.
Erst nach grünen Checks kann ein **einziger** neuer geschützter
`capture`-Einmallauf mittels bereits bestehendem Marker die genaue
anonymisierte Phase ermitteln.

---


## Folgemessung und gezielt dimensionierter zweiter Budgetsprung (#786)

Die gesonderte echte
[Capture #43265178996](https://github.com/matthias-ennen/movie-hub/actions/runs/43265178996)
hat nach erneuter erfolgreicher privater Checkpoint-Wiederherstellung und
Waipu-Originalcache-Prüfung nochmals `JOYN_EPG_REQUEST_BUDGET` gemeldet –
**bei exakt 180 gestarteten Joyn-EPG-Anfragen**. Der anonymisierte
`joynEpg`-Bericht liefert erstmals:

| EPG-Fenster-/Transportkennzahl | Echte Messung |
| --- | ---: |
| Basisfenster, 14 Tage × 4 | 56 |
| Vollständig verarbeitete Basisfenster | 46 |
| Verbleibende Basisfenster | 10 |
| Cachehits | 0 |
| Zusätzliche Fensterteilungen (binär) | 67 |
| EPG-Requeststarts | 180 |
| Retry-Versuche | 0 |
| Alle erlaubten HTTPS-Fetches inklusive vorgelagerter Quellzugriffe | 213/300 |

Die Original-Sync-Semantik erklärt die 180 Requeststarts exakt:
**46 Basisfenster + 2 × 67 Kindfenster = 180**.
Der Mehrbedarf ist also tatsächliche Aufteilung von bei 1.000
Ergebnissen gekappten EPG-Fenstern, **kein Retry- oder fehlgeschlagener
Upstream-Request**. Die hochgerechnete Gesamtzahl bei gleicher
Dichte ist rund **219** (180 × 56 / 46); der Wert ist nur eine
**Planungsschätzung**, kein echtes vollständiges 14-Tage-Messergebnis.

**Eng kontrollierte Korrektur – nur QA-Einmaljob, nicht Produktiv:**

- Gesondertes Joyn-EPG-Budget **180 → 250**. Das lässt rund 30
  zusätzliche Requests über der plausiblen Schätzung zu, ohne eine
  unbegrenzte Quelle zu öffnen.
- Der private globale HTTPS-Deckel **300 → 450**. Denn die bisher
  unabhängig vor EPG-Matching angefallenen 33 erlaubten Requests
  plus eine voraussichtliche EPG-Vollmenge um 219 benötigen anschließend
  einen explizit abgezäunten Puffer für den tatsächlich ursprünglichen
  Joyn-Matcher. **450 ist ein harter Gesamtdeckel**; der 451. Versuch
  wird vor dem tatsächlichen `fetch` blockiert (synthetisch getestet).
- Andere explizite Grenzen (TMDB-Suchen 30, Details 10,
  Metadaten 30, Algolia 90, Serienseiten 20, Episoden 30,
  erlaubte HTTPS-Hosts, keine unbegrenzten Retries) bleiben
  unverändert. Der `capture`-Modus gibt **keinen zusätzlichen**
  Waipu-A/B-Request frei.
- Die anonyme Fensterdiagnose bleibt bei einem erneuten Budgetstopp
  strikt auf geprüfte Zahlen begrenzt; vor Upload gelten
  `configuredEpgBudget=250`, `startedEpgRequests=250`, sonst
  **fail closed**. Keine Zeitfenster, Programmtitel oder IDs.

Noch kein tatsächlicher Joyn-Capture-Erfolg und **keine**
behauptete TMDB-Einsparung. Erst der nächste echte Einmallauf kann
Original-Matcher-Quittungen bestätigen. Der Produktivindex bleibt aus.

---


**Stand: 12. November 2026.** Dieser Schritt schließt die technische
Verbindung zwischen #780 (Waipu-A/B mit zwei originalen Matcherinstanzen),
#781 (24-MiB-Originalcache nachweislich nutzbar) und #782 (im Prozessspeicher
ausgewählte Original-Waipu-Matcherinputs).

## Warum ein dedizierter Test nötig ist

Ein normaler Joyn-SourceEnvelope, ein veröffentlichter EPG-Titel und historische
Cache-Zählwerte **beweisen keine neu freigegebenen Matcherentscheidungen**.
Der bisherige Joyn-Import stellt deshalb ausschließlich im Opt-in-Callback
`onCompletedEvidence` echte ursprüngliche Sender-/Sendungs-/Zeit- und
Originalmatcher-Quittungen bereit – mit tatsächlich gespeichertem
`checkedAt`. Gerade ein alter positiver Cachetreffer darf **nicht** künstlich
als gerade neu entschiedener Treffer ausgegeben werden.

Dieser Pilot erzeugt einen **neuen vollständigen 14-Tage-Joyn-Generationslauf**
mit dem **unveränderten Originalmatcher**. Seine private
`approvedEvidence`-Sammlung wird **nie serialisiert** oder exportiert.
Danach wird aus den **bereits gespeicherten originalen Waipu-Grid- und
Programmdetails**, dem gleichen lokalen Kandidatenindex und der unveränderten
Waipu-Matcherentscheidung eine mögliche gemeinsame Teilmenge berechnet.
Waipu wird hierfür **nicht neu von der Quelle abgefragt**.

## Zwei getrennte explizite Stufen

Die neue GitHub-Action
`.github/workflows/shared-epg-g1e-private-joyn-capture.yml`
hat einen eingeschränkt berechtigten und einen privilegierten Job:

1. Bei PRs nur **synthetische Tests**, kein OIDC, keine Cloud-Geheimnisse,
   keine echten Joyn- oder TMDB-Anfragen. Der vollständige CI-Build und der
   normale Android-Build laufen weiter unabhängig.
2. Erst auf `main`, mit manueller Workflow-Dispatch-Bestätigung oder einem
   **eindeutigen einmaligen Commit-Marker** `[g1e-joyn-capture-once]` kann
   die private Stufe starten. Sie benötigt den bestehenden privaten
   Checkpoint-Bucket und die bereits bewährte Workload-Identity.
   Die Daten werden ausschließlich in einen **ephemeren Actions-Runner**
   restauriert. Es gibt keine Cloud-Checkpoint-Sicherung, keine APK-/Firebase-
   Publikation und keinerlei Git-Commit mit privaten Werten.
3. Der normale, aktuelle Joyn-Katalogdurchlauf im Modus `joyn-catalog`
   verarbeitet alle 56 Zeitfenster unter nachfolgendem Budget. Der originale
   Quellen-/Matcher-Callback wird genau einmal akzeptiert. Quelle muss
   `healthy`, Generation `joyn-catalog:<Zeitstempel>` und der
   Original-Capture vollständig und positiv sein; alle Zeitprüfungen werden
   anhand des **Zeitpunkts nach** dem Matcher-Lauf bewertet.
4. Der bereits erprobte `buildWaipuLiveCatalog` verarbeitet nur den
   **restaurierten lokalen Waipu-Grid- und Programmdetailbestand**.
   Ohne Waipu-Quelle oder neuen TMDB-Suchclient wird der **bestehende originale
   Waipu-Matcher** samt historischer Startentscheidungen genutzt. Die
   vorhandene #782-Callback-Brücke wählt höchstens 20 passende Originalwaipu-
   Programme und die kleinste passende Teilmenge von Joyn-Fremdbelegen.
5. Der Standardmodus **`capture`** liefert nur aggregierte Felder wie
   `approvedJoynReceipts`, `selectedOriginalWaipuPrograms`,
   `minimizedJoynReceipts`. **Kein** zusätzlicher Waipu-A/B-TMDB-Aufruf.
   Ein ausdrücklich **getrennter** `workflow_dispatch` mit
   `mode=ab` und Bestätigung `PRIVATE_G1E_AB_MAX_4_PER_ARM` darf
   ausschließlich **nach diesen Gates** den #780-Vergleich auf höchstens
   **vier tatsächlich gestartete TMDB-Transporte je Matcherarm** erweitern.

## Netzsicherheit und Begrenzungen

Der Source-Pilot erzeugt tatsächlich **externe Joyn-, Algolia- und je nach
Cachezustand TMDB-Anfragen**. Er ist somit **nicht** der rein lesende
Checkpoint-Audit #781. Für die isolierte erste Generation gelten:

- Ein globaler harter Schutz von maximal **300 Fetch-Versuchen**.
  Nur HTTPS zu den bekannten Hosts `auth.joyn.de`, `api.joyn.de`,
  `www.joyn.de`, `ffqrv35svv-dsn.algolia.net` und
  `api.themoviedb.org` wird über den im Runner eingesetzten Fetch
  gestattet. Ein neuer, nicht geprüfter Fremdhost bricht geschlossen ab.
- Joyn-EPG: höchstens **72** neue Fensterabrufe statt unbegrenzter
  Wiederholungen; ursprüngliche 56 Fenster können durch Source-Caches
  bedient werden. Joyn-TMDB-Suche: **30** Versuche;
  TMDB-Detailsuche: **10**; Metadaten: **30**; Algolia: **90**;
  Serienseiten: **20**, Episoden: **30**. Einzelne Source-Adapter
  können kleinere interne Schranken besitzen.
- Nur exakt bestätigte bestehende Private-Checkpoint-Konfiguration,
  beidseitig `complete` gemeldete Sync-Status und originaler
  Waipu-Matcher-Cache innerhalb von **24 MiB** aus #781.
  Alte Caches bleiben als **Originalentscheidung** erhalten, aber werden
  niemals zu `approvedEvidence` umetikettiert.
- Der isolierte Prozess unterdrückt alle normalen Source-/Matcher-
  Diagnoseausgaben. Bei Fehlern erscheint ausschließlich eine generische
  Fehlermeldung, kein Raw-Error mit möglicherweise eingebetteten Quell-
  oder Suchbegriffen. Hochgeladen werden ausschließlich zwei ausdrücklich
  benannte anonymisierte JSON-Dateien (`preflight.json`, `aggregate.json`)
  mit kurzer Aufbewahrung; der gesamte private Joyn-Cache, Raw-EPG,
  Originaltitel, TMDB-IDs und Credentials bleiben aus Artefakten heraus.

**Wichtig:** Ein roter Pilot kann auch eine Source-Änderung, ein benötigtes
neues Host-Allowlist-Element oder ein zu knappes API-Budget signalisieren.
Das ist dann ein **bewusst geschlossenes Test-Gate** und darf nicht durch
Ausgabe der originalen Anfrage oder unlimitierte Wiederholung umgangen werden.

## G1e – überprüfte Fensteraufteilung und neuer begrenzter Joyn-Test (12.11.2026)

Der zweite Echtversuch
[Actions #43245305473](https://github.com/matthias-ennen/movie-hub/actions/runs/43245305473)
hatte anonym bestätigt: `phase=joyn-original-generation`,
`failureClass=JOYN_EPG_REQUEST_BUDGET`, **105 von 300** erlaubten
HTTPS-Fetches gesamt. Die getrennte Obergrenze von **72 gestarteten
Joyn-EPG-Requests** war erreicht; der 14-Tage-Lauf noch nicht beendet.

Nach Codeprüfung: `syncJoynEpg` betrachtet **56 feste
Sechs-Stunden-Basisfenster**. Jeder Request mit **1.000 oder mehr**
Quellprogrammen gilt als gekappte Antwort; das betroffene Fenster
wird jeweils **rekursiv halbiert**, bis die Antwort vollständig
unter 1.000 Einträgen liegt. Zusätzlich sind begrenzte Wiederholungen
bei 429/5xx möglich. Ein alter/nicht mehr gültiger Checkpoint kann
Fenster nicht als Cachehit zählen. Daher ist **56 nur die Basis**,
nicht die zugesicherte Gesamtanzahl an API-Abfragen. Aus dem alten
Anonymbericht lässt sich die konkrete Aufteilung noch nicht ablesen.

**Pilot-only Änderung:** Erhöhung des *separaten* Joyn-EPG-Budgets von
**72 auf 180**. Das lässt höchstens 124 zusätzliche Requeststarts über
der Zahl der Basisfenster zu (Aufteilungen und begrenzte Retries,
abzüglich gültiger Cachehits). **Unverändert** bleiben: globale Obergrenze
**300 erlaubte HTTPS-Starts**, Host-Allowlist, Joyn-TMDB/Algolia- und
Metadatenlimits, ausschließlich die Originalmatcher-Freigaben,
`capture` ohne zusätzlichen Waipu-A/B-TMDB-Vergleich und die
produktiven Scheduler/Adapter.

**Neue Aggregat-Telemetrie:** Wenn die neue 180er-Grenze erneut
erreicht wird, liest der Runner das ohnehin lokal erzeugte
`artifacts/joyn-sync/status.json` *nur im ephemeren Prozess*,
prüft `kind`, `schemaVersion`, `status=failed`, exakt
`JOYN_EPG_REQUEST_BUDGET`, frischen Zeitstempel und konsistente,
ganzzahlige Obergrenzen. Der herunterladbare Report enthält dann nur:
`baseWindows=56`, `processedWindows`, `cacheHits`,
`subdividedWindows`, `startedEpgRequests`,
`retryAttempts`, `configuredEpgBudget=180`
und `completedFullHorizon=false`. Keine Rohfenster,
Sender, Originaltitel, TMDB-IDs, privaten Fehlertexte oder URLs.
Der Workflow validiert die Felder und Werte vor Upload nochmals.
Bei unpassendem Status entfällt dieser Diagnoseteil vollständig.

Ein Test gilt erst als erfolgreich, wenn die echte gesunde
Joyn-Originalgeneration die frischen Quittungen vollständig
erfasst und die lokale Waipu-Originalauswahl erfolgreich abgeschlossen
hat. **Keine Behauptung produktiver Einsparungen** aus Cache-Kennzahlen.
Der neue Einmallauf erfolgt separat per `[g1e-joyn-capture-once]`
nach grünen PR-Checks und wird im Issue #336 nachgewiesen.

---

## Erster realer Test und anonymisierter Fehlerbericht

[Einmallauf #43242852401](https://github.com/matthias-ennen/movie-hub/actions/runs/43242852401)
hat die Original-Checkpoints und den unabhängigen 24-MiB-Waipu-Preflight
**erfolgreich** bestanden; der originale Joyn-Quell-/Matcher-Schritt ist
dagegen **sicher rot abgebrochen**. Der erste Driver hat den eigentlichen
Quellfehler aus Datenschutzgründen völlig verschluckt; damit ist die Ursache
des Fehlers **noch offen**. Es darf daher weder von gesammelten neuen
Originalbelegen noch von realen TMDB-Einsparungen gesprochen werden.

Der private Runner schreibt ab sofort auch bei Fehlern genau **einen
anonymisierten Diagnosereport** mit folgenden Feldern:

- `phase` aus einer **festen Liste**: private Checkpoint-Vorabprüfung,
  Joyn-Originalgeneration, Waipu-Originalrehydration oder Waipu-A/B-Transport
- `failureClass` aus explizit freigegebenen Fehlercodes wie
  `G1E_NETWORK_REQUEST_LIMIT`, `G1E_NETWORK_DESTINATION_BLOCKED`,
  `JOYN_EPG_REQUEST_BUDGET` oder `G1E_JOYN_ORIGINAL_EVIDENCE_NOT_APPROVED`.
  Alle anderen Rohfehler (einschließlich ihrer vielleicht vertraulichen
  Nachricht) erhalten nur `UNCLASSIFIED_ORIGINAL_SOURCE_ERROR`
- Anzahl der begonnenen erlaubten HTTPS-Fetches und die bekannte globale
  Obergrenze 300, **niemals** angefragte Titel, URLs, IDs oder Tokens

Die privaten Source-/Matcher-Logs bleiben unterdrückt. Die neue Action
prüft vor Artefakt-Upload nochmals die erlaubte Struktur und verbietet
einige bekannte Rohdatenfeldnamen ausdrücklich. **Ein positiver oder
negativer Replay-Wert darf erst nach einem tatsächlich erfolgreichen
privaten Pilotlauf gemeldet werden.**

---

## Kein Produktions-Go

Der erste Capture-Erfolg bestätigt nur das tatsächliche Vorliegen
prüfbarer Originalmatcher-Quittungen und die Verfügbarkeit passender
privater Waipu-Eingaben. Ein A/B-Ergebnis zeigt höchstens die **im
isolierten Lauf** beobachteten begonnenen TMDB-HTTP-Anfragen; nicht die
Ersparnis jeder Nacht. Für Produktiv-Aktivierung sind getrennte,
wiederholte Abnahmen, unveränderte Identitäten, nachvollziehbare
Konflikt-/Fehlerraten und das unveränderte Adapter-Fallback nötig.

**Gemeinsamer EPG-Index bleibt AUS**, AIR-Routen und Anbieterlinks
unverändert. Produktiver Nightly und TV-/Fire-TV-Seiten werden nicht
umgeschaltet.
