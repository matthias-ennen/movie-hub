# MovieHub #336 – G1e Teil 2c: Waipu-Quittungs-Capture nur auf ausdrücklichen Testaufruf

**Status 12.11.2026: nicht-produktive, absichtlich deaktivierte Capture-Schnittstelle.** Gemeinsamer EPG-Index, unabhängige Matcher, bestehende Nightly- und Firebase-Verarbeitung bleiben unverändert.

## Hintergrund

G1e-2a bewies aus realen Nightly-Artefakten 46.089 Waipu-Events, 23.785 Joyn-Events und 10.481 in Sender/Zeit/TMDB-Identität übereinstimmende Events – aber **keine nachgewiesen vermiedenen TMDB-HTTP-Aufrufe**. Bei Waipu ist der originale Grid-EPG-Titel nur in der Matcherphase vorhanden, bei den bereits publizierten SourceAdapter-BroadcastEvents fehlt er. G1e-2b-1 stellte einen konservativen, versionierten Waipu-Matcherquittungs-Prüfer bereit.

## Lösung

`scripts/epg-g1e-waipu-evidence-capture.mjs` exportiert `collectApprovedWaipuEvidence({ adapterEnvelope, sourceBroadcasts, matchesByProgram })`. Diese Funktion ist rein lesend und benötigt eine **vollständig gesunde**, mengenmäßig begrenzte SourceAdapter-Generation. Sie bildet den Schlüssel aus **originaler Programm-ID, kanonischem Sender, exakter Start- und Endzeit** und verknüpft ausschließlich dadurch Grid-Programmtitel, originalen Matcherinput samt Entscheidung und den echten publizierbaren BroadcastEvent. Danach verwendet sie den bereits geprüften `buildWaipuApprovedEpgReceipt`.

Ergebnis ist ein **ausschließlich in-memory** gespeichertes optionales Aggregat mit `approvedEvidence` und Zählern für akzeptierte, abgewiesene und fehlende Quellbelege. Originaltitel dürfen später **nicht** in einen öffentlichen GitHub-Actions-Bericht oder ein Firebase-Artefakt gelangen. Für die Statusausgabe sind ausschließlich Zähler und Ablehnungsgründe freigegeben.

`buildWaipuLiveCatalog()` akzeptiert jetzt optional `onCompletedEvidence: async capture => {...}`:

- **Standardwert `null`**: keinerlei Aufruf, Dateizugriff, zusätzliche Berechnung oder sonstige Änderung am normalen Import. Das Modul wird nur im ausdrücklichen Testmodus dynamisch geladen.
- **Erst nach erfolgreichem Erzeugen des gesamten healthy SourceAdapter-Envelopes** werden diese Quittungen gesammelt, die zum ursprünglichen Grid und bestehenden Waipu-Matcher v5 gehören.
- **Kein Publikationsweg** für die Quittungen: `sourceEvidenceCapture` im Rückgabeobjekt enthält ausschließlich `status`, Zähler und Ablehnungsgründe, **niemals** die sensiblen Originaltitel. Die vorhandenen `adapterEnvelope`-/`index`-Daten bleiben gleich.
- **Ausfallsicherheit:** Eine kaputte Callback-Auswertung wird abgefangen und liefert ausschließlich den unkritischen Status `unavailable`. Der bereits bestätigte Waipu-Import bricht deswegen nicht ab; alle übrigen Adapter bleiben eigenständig.
- Ein im eigenen Waipu-Matcher zulässiger schwächerer TMDB-Treffer wird **nicht** automatisch für den gemeinsamen Index akzeptiert. Dazu gelten weiterhin die strengeren Regeln des Quittungs-Builders.

Die isolierten Tests benutzen **`buildWaipuLiveCatalog` mit echtem bestehenden Waipu-Matcher und SourceAdapter-Mapper**; sie prüfen Default-Inaktivität, validen Capture, fehlerhaften Sink, fehlerhafte/zu große Generation und eindeutige Quell-Provenienz.

## Schutz vor widersprüchlichen Originalzeilen (Folgeschritt)

Eine ursprüngliche Waipu-Programm-ID, ein Sender und ein Start-/Endzeitfenster
sind noch **kein** eindeutiger Beleg, wenn mehrere Grid-Zeilen mit
unterschiedlichen Originaltiteln, Episodenfeldern, Produktionsjahr oder
Quellklassifizierung existieren. Der Capture-Collector überschreibt deshalb
eine bereits erfasste Quellzeile **nicht mehr** mit einer später gefundenen
Duplikat-Zeile. Stimmen die relevanten Originalfelder aller Wiederholungen
überein, wird die identische Zeile einmal betrachtet. Bei der ersten
Widersprüchlichkeit bleibt dieser Programmschlüssel für die **gesamte
Generation abgelehnt** – auch wenn spätere Zeilen wieder der ersten gleichen.

Der ausschließlich aggregierte Ablehnungsgrund lautet
`ambiguous_original_grid_duplicate`. Es werden weiterhin weder Originaltitel
noch Quell-IDs, Replaykandidaten oder private Matcherentscheidungen in
Dateien, Logs, Firebase oder Actions-Artefakte geschrieben. Waipus eigener
produktiver Matcher ist von dieser zusätzlichen optionalen Evidenzkontrolle
**nicht** betroffen. Neue Tests nutzen den realen Waipu-Mapper und simulieren
widersprüchliche Titel sowie Episoden und harmlose identische Mehrfachzeilen.

---

## Noch offen vor realer Einsparungsmessung

1. Joyn analog ausschließlich in einer **explizit aktivierten** abgeschlossenen Generation erfassen, mitsamt originalem `JoynMatchCache.getWithProvenance()`-Zeitstempel.
2. Testlauf im isolierten, datenschutzgerechten QA-Workflow mit echten Quellen-/Matcher-Quittungen, **niemals** in der normalen MovieHub Nightly Pipeline.
3. Waipu-/Joyn-Originalmatcher ohne/mit gemeinsamem Index für **dieselben Quellenprogramme, gleichen lokalen Kandidaten und unabhängig initialisierten, identischen Adapter-Caches** aufrufen und echte TMDB-Transport-Request-Zähler erfassen. Unterschiedliche Quelleninfos und Serienepisoden niemals blind überschreiben.
4. Wiederholte Prüfung und gesondertes Produktiv-Go. **Kein** AIR-/Playback-Link, kein Cross-Adapter-Ausfallrisiko, kein Firebase-Umbau.

**Qualitätsbegriff:** Ein gemeinsam bekannter TMDB-Film ist noch kein vermiedener TMDB-API-Aufruf. Bis zu einem solchen gemessenen A/B-Test bleibt die Zahl der tatsächlichen Einsparungen **unbekannt**.
