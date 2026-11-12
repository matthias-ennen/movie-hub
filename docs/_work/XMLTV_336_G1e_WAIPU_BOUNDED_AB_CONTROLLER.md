# MovieHub #336 – G1e: streng begrenzter Waipu-Zieladapter-A/B-Controller

**Status 12.11.2026: Nur explizit aufzurufende Testbibliothek. Kein privater Real-A/B-Lauf durchgeführt.** Nicht produktiv, keine automatische Nightly-/Firebase-/GitHub-Actions-Aktivierung, keine neue Quellabfrage.

## Ziel und sicherer erster Testumfang

Der unveränderte Waipu-Matcher soll unter zwei identischen Originalbedingungen getestet
werden: **Baseline** nutzt den bisherigen Matcher; **Indexarm** darf ausschließlich
durch eine zuvor bestätigte **andere** Quelle (Joyn) die unveränderte
TMDB-Werkidentität übernehmen. Beide Seiten müssen dieselben eigenen Waipu-
Entscheidungscaches und dieselben lokalen TMDB-Kandidaten sehen.

Dies erlaubt einen ersten **Waipu-als-Ziel**-Vergleich, ohne den >128 MiB großen
historischen Joyn-Matcher-Cache für **zwei** Joyn-Originalmatcher-Sessions
vollständig laden zu müssen. Joyn wird in dieser ersten Richtung **nur als
Beleglieferant** eingesetzt. Dazu sind nach wie vor die in einer **gesunden,
expliziten Joyn-Originalgeneration** erzeugten `approvedEvidence`-Einträge
aus dem Opt-in-Capture notwendig. Alte Cachezählwerte aus der privaten
Checkpoint-Prüfung dürfen keinesfalls als neue Quittungen gelten.

## Controller

`scripts/epg-g1e-waipu-bounded-ab-controller.mjs` exportiert:

```js
compareBoundedWaipuWithJoynEvidence({
  waipuInputs,           // maximal 20 originale Waipu-Programmkandidaten
  joynEvidenceCapture,   // vollständiger IN-MEMORY-Callback-Bericht aus joyn-catalog
  waipuDecisionSnapshot, // private originale waipu-tmdb-match-decisions v5
  token, fetchImpl,      // explizit vom isolierten Testcontroller, KEINE Defaults
  now, maxRequestsPerArm, paceMs,
})
```

Strenge Vorbedingungen:

1. Nur `waipu-epg`-Zielkandidaten mit einer einzigen Waipu-Quellgeneration
   (`waipu:<Zeitpunkt>`), Originaltitel, gültigen Sender-/Zeit-/Medientypangaben,
   unverfälschtem Waipu-Matcherinput und maximal 200 bereits vorhandenen lokalen
   TMDB-Kandidaten pro Event; nie ein öffentlicher TMDB-Ersatz für den Original-EPG-Titel.
2. Joyn-Belege aus `joyn-catalog:<Zeitpunkt>`, `status: complete`,
   `approved: true`, `matchStatus: matched`, nur `sourceId: joyn-epg`;
   prüfbar übereinstimmende positive Capture-Anzahl, maximal 200 Belege.
   Der aufrufende **geschützte** Testlauf ist für die tatsächliche
   Erzeugung und Herkunftskontrolle verantwortlich; das Modul allein kann eine
   übergebene Quellgeneration nicht unabhängig authentifizieren.
3. Eine originale, versionierte `waipu-tmdb-match-decisions`-Datei aus dem
   privaten Checkpoint – maximal 24 MiB vollständig lesbarer JSON-Entscheidungscache.
   Jede Variante kopiert den Ursprungszustand eigenständig, lässt den
   **unveränderten** `matchWaipuProgram` entscheiden und verwendet
   `WaipuTmdbSearchClient.requestsStarted` für tatsächlich gestartete
   Transportversuche. Waipu verwendet im üblichen Import **keinen persistenten**
   TMDB-Suchantwortcache; daher beginnen beide Seiten mit einem leeren
   In-Run-Responsecache.
4. Kein impliziter TMDB-Zugang: `token` und `fetchImpl` müssen vom Aufrufer
   übergeben werden. Maximale **40 HTTP-Transportstarts je Variante**, im
   empfohlenen ersten Pilot deutlich weniger (Standard 20);
   **keine HTTP-Retries**. Fehler/Budgetüberschreitungen schlagen geschlossen
   fehl. Tests verwenden ausschließlich einen lokalen deterministischen Stub.
5. Beide Waipu-Originalmatcher-Sessions werden in den bereits vorhandenen
   `compareOptionalSharedEpgIndexAb` eingebunden. Dessen Prüfungen für
   identische initiale Cache-Inhalte, ausschließlich andere Quellherkunft,
   Identitätskonflikte und Mehrverkehr bleiben vollständig aktiv.

## In-Memory-Brücke aus der gesunden Waipu-Originalgeneration (Folgeschritt #782)

Der Waipu-Builder hält den **wirklich verwendeten** normalisierten
Originalmatcherinput und seine **wirklich verwendeten** lokalen
TMDB-Kandidaten in einer lokalen Matchermap. Bislang konnte ein unabhängiger
Testcontroller sie nicht ohne erneute Rekonstruktion oder privaten Datenexport
für den A/B-Vergleich erhalten.

Nur im bereits vorhandenen **freiwilligen**
`buildWaipuLiveCatalog({ onCompletedEvidence })`-Zweig bekommt der private
Callback nun zusätzlich zu den bestätigten Waipu-Belegen einen zweiten
In-Memory-Parameter: `selectBoundedWaipuReplayInputs(joynEvidenceCapture, {now})`.
Ein neuer, separat getesteter Collector
`scripts/epg-g1e-waipu-replay-input-selection.mjs` verbindet dafür
Original-Waipu-Grid, gesunden SourceEnvelope, ursprüngliche Matchermap,
**dieselbe** lokale Kandidaten-Lookup-Funktion des Originalmatchers und
gesonderte, bereits geprüfte `joyn-catalog`-Quittungen.

Die Auswahl bleibt strikt auf **20 Waipu-Ereignisse** begrenzt,
erhält nur passende Originaltitel/Sender/Zeitfenster und verwirft
widersprüchliche Waipu-Originalzeilen, abweichende Originalmatcher-
identitäten, zu große lokale Kandidatensätze und Joyn-Indexkonflikte.
Nur tatsächlich bestätigte Joyn-Fremdquellen-Quittungen werden in einem
**auf höchstens 20 Einträge reduzierten** Capturesatz mitgegeben.
Das Ergebnis enthält Originaltitel und Originalmatcherinputs: **privat,
ausschließlich im Prozessspeicher**, weder in Logs, öffentlichem
SourceEnvelope, regulärem Builder-Rückgabewert, Action-Artefakten noch
Firebase zu veröffentlichen.

Dies verbindet zwei bereits existierende sichere Schnittstellen zu
passenden A/B-Eingaben, erzeugt aber **keine neuen** Matcherquittungen,
keinen Workflow für eine vollständige frische Joyn-Generation und
**noch keine** echten TMDB-HTTP-Messwerte. Die Unit-Tests nutzen einen
unveränderten echten Waipu-Originalmatcher, synthetische Joyn-Belege
und lokale/Stub-Inputs. Der Produktivpfad ohne Callback bleibt unverändert.

---

## Datensparsamkeit und Nachweiskraft

Die Rückgabe besteht ausschließlich aus aggregierten A/B-Zählern und
Sicherheits-Gates, **ohne** Programm-Originaltitel, TMDB-IDs, Token,
Cache-Einträge oder Source-URLs. Es existiert in diesem Schritt **kein**
Datei-Writer, Workflow, Session-Checkpoint-Upload, Datenjob oder Startsignal
für reale API-Anfragen. Anwendungs- und Mock-HTTP-Tests belegen nur die
**technische Vergleichsfähigkeit**, keine reale TMDB-Ersparnis.

Erst ein separater, bewusst gestarteter, geschützter Lauf darf frisch geprüfte
Joyn-Originalmatcherquittungen und die tatsächlich gesunde Waipu-Quellgeneration
im Speicher übergeben. Danach sind ein sehr kleines reales Anfragebudget,
die übereinstimmenden TMDB-Werkidentitäten, passende Serienepisoden und
die echte Transportdifferenz zu prüfen. Auch bei positivem echten Test
bleibt ein Produktiv-Go ein eigenständiger, wiederholter Abnahmeschritt.

**Keine** Aktivierung des gemeinsamen Index in Waipu, Joyn, XMLTV, Nightly
oder Fire TV; keine AIR- oder Playback-Link-Änderung.
