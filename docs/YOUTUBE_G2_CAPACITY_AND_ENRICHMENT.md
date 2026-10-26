# YouTube G2 – Filmkandidaten, Recheck-Kapazität und Veröffentlichung

Stand: 26.10.2026. Technischer Arbeitsstand zu [Issue #388](https://github.com/matthias-ennen/movie-hub/issues/388).

## Gemeinsame Filmidentität

Movie Hub verwendet `movie:<tmdbId>` als kanonische Filmidentität. TMDB
liefert den Film und seine Anbieterhinweise; der YouTube-Adapter kann
zusätzlich **private Video-ID-Kandidaten** sammeln. Erst ein separater,
aktueller Null-Such-Recheck entscheidet, ob ein **Best-Effort-Watch-Link**
als optionale Eigenschaft des bestehenden Films auf Firebase Hosting
bereitgestellt werden darf. Der Link bleibt unbestätigt und ist **kein**
geprüftes deutsches Angebot, Filmfassung, Tarif oder Wiedergaberecht.

## Aktuelle unabhängige Verarbeitungsketten

| Prozess | Aufgabe | Konservativer Grenzwert | Publiziert direkt? |
| --- | --- | --- | --- |
| Privater Discovery-Nachtlauf | neue TMDB-Filme anhand öffentlicher DE-YouTube-Badges priorisieren, privat Kandidaten recherchieren und speichern | maximal 10 intern reservierte `search.list`-Versuche je Pacific-Tag, mit GCS-CAS-Ledger gemeinsam mit manueller Recherche | Nein |
| Privater Kandidatencheckpoint | bereits recherchierte Film-/VIDEO-IDs dauerhaft aufbewahren | maximal 3.500 Filme; geschützt in GCS, keine öffentliche QA | Nein |
| Täglicher Null-Such-Recheck | vorhandene VIDEO-IDs anhand aktueller TMDB-/YouTube-Metadaten auf Plausibilität prüfen | **maximal 250 Filme je Durchlauf**, in Gruppen bis 25; ausschließlich `videos.list`, keine `search.list` | Nur gesonderte, validierte Link-only-Projektion |
| Firebase-Deploy | aus einer frischen, authentifizierten, erfolgreichen Review die explizit erlaubten Linkfelder auf Hosting bereitstellen | maximal 250 Links mit aktueller Gültigkeit und Kollisionsprüfung | Ja, nur optionaler Best-Effort-Link |

Die publizierten Linkkandidaten und das privat mögliche Filmvolumen sind
deshalb bewusst **nicht** dieselbe Zahl. Alle Angaben sind unabhängig
von allgemeinen Google-Projektkontingenten und externen API-Aufrufern.

## Kapazitätsschutz bei >250 privaten Filmen

Der täglich verwendete, geschützte Basiskohort wird aus dem **gesamten
validierten** Checkpoint bestimmt. Historisch vertrauenswürdige Archiv-
und bereits veröffentlichte redaktionelle Playlist-Kandidaten haben
Vorrang; sonst gilt aufsteigende TMDB-ID. Daraus werden maximal 250
Filmidentitäten mit höchstens zehn `videos.list`-Batch-Aufrufen bei
25er-Gruppen verarbeitet. Somit können neue Film-IDs mit kleinerer
numerischer TMDB-ID nicht willkürlich ältere, bisher veröffentlichte
Basislinks verdrängen.

**Wichtige Sicherheitsregel:** Dieselbe Video-ID kann scheinbar auf zwei
TMDB-Filme passen. Solche Kollisionen werden über den **vollständigen
Checkpoint einschließlich heute zurückgestellter Filme** ermittelt.
Alle betroffenen Filmidentitäten werden aus dem tagesaktuellen
Publikationsquellmaterial ausgeschlossen. Ein scheinbar eindeutiger
Link ist sonst unter Umständen gar nicht eindeutig.

Die private Review meldet:

- `sharedCheckpointCandidateFilms`: sämtliche gespeicherten Filme
- `globalStoredCandidateFilms`: heutiger abgegrenzter Basiskohort
- `deferredCandidateFilms`: noch nicht im heutigen Review enthaltener Rest
- `crossTitleCollisionFilms`: wegen Filmkollisionen quarantänisierte Filme
- `reviewCoverage`: `complete` oder `bounded-baseline-partial`

**Ein Teilreview darf niemals als Komplettabnahme bezeichnet werden.**
Die noch ausstehenden Filme erhalten dadurch keine neuen öffentlichen
Links; bisherige Suchlinks bleiben ein Fallback. Es werden keine
DE-Angebotsarten oder Anbieter-Badges aus unbestätigten YouTube-Treffern
erfunden.

## Offene Ausbaustufe

Als Nächstes braucht der noch nicht geprüfte Überschuss von bis zu 3.250
Filmen einen **separaten, privaten und fortsetzbaren Rotationscursor**
mit eigenem `videos.list`- und TMDB-Abfragebudget. Dieser darf den
heutigen vollständigen Basiskohort nicht ersetzen und nicht selbst
Publikationsautorität erhalten. Erst danach kann eine sichere,
quellenübergreifende Projektion frisch revalidierter zusätzlicher
Film-Links definiert und mit Tests abgesichert werden.

Ein bloßes Erhöhen der 250er-Grenze wäre wegen YouTube-API-Aufrufen,
TMDB-Requests, Workflow-Laufzeit und Fehlerrisiken unzureichend.

## Begonnene Overflow-Umsetzung: privater Rotationscursor

**Vorbereitete erste Stufe (Arbeitsbranch, noch keine Live-Freigabe):**
`scripts/youtube-g2-overflow-rotation-cursor.mjs` wählt aus dem
bereits validierten, privaten Kandidatencheckpoint höchstens **25** Filme
pro UTC-Tag aus, die **nicht** zur stabilen 250er-Basiskohorte gehören.
Die Auswahl berücksichtigt nur vorhandene öffentliche DE-TMDB-YouTube-
Filmbadges, isoliert Video-ID-Kollisionen gegen den **gesamten** Checkpoint
und überspringt Filmidentitäten ohne gegenwärtiges Badge.

Der isolierte GCS-Cursor `youtube-g2/private-overflow-review/v1/cursor.json`
verwendet das bestehende private Bucket, eine atomare Generation-CAS-
Vorbedingung und einen anschließenden exakten Readback. Er speichert
nur zuletzt geprüfte **öffentliche TMDB-Film-ID**, UTC-Tagesdatum und
summarische Laufzähler, keine privaten Video-IDs. Der Cursor wird erst
nach einem erfolgreich abgeschlossenen künftigen Review-Batch
weitergesetzt. Kein Review am selben UTC-Tag wird erneut geplant.

**Noch nicht umgesetzt und nicht behauptet:** Es gibt derzeit **keinen**
zusätzlichen Live-Runner, keine neue GitHub-Actions-Schedule, keine
Übernahme von Overflow-Review-Ergebnissen in öffentliche Link-Projektionen
und **keine** neuen YouTube-/TMDB-API-Anfragen durch diese erste Stufe.
Die bestehende stabile 250er-Basiskohorte, ihre tägliche Linkquelle und
der Nachweis von 0 unabhängig geprüften Angeboten bleiben unberührt.

**Nächster eigener Review-Schritt:** separater budgetierter
`videos.list`-/TMDB-Overflow-Runner, ausschließlich privates QA,
erfolgsabhängiges Cursor-CAS und anonymisierte Zähler; nach erfolgreichen
CI-/Android-Tests mit echtem private-GCS-Readback kontrolliert freigeben.
Danach erst zusätzliche öffentliche Best-Effort-Projektion gesondert
prüfen, niemals ungeprüfte Overflow-Kandidaten direkt publizieren.

## Betriebs- und Freigabegates

1. Vor jedem Merge: CI- und Android-Erfolg auf dem **konkreten** PR-Commit.
2. Nach Merge: vollständiger Firebase-Deploy und HTTP-Readback; letzter
   verifizierter Linkbestand darf sich nicht unbegründet ändern.
3. Automatische Suche: echte Pacific-Tagesreservierungen und
   `search.list`-Versuche getrennt zählen, Abbruch bei Fehlern; kein
   rückwirkendes Quota-Refund.
4. Nachtlauf-Fortschritt: private Checkpoints und anonymisierte
   GitHub-Berichte; bei Fehlern bleiben nicht gemessene Werte unbekannt.
5. Compliance, Rechte, Filmfassung, DE-Tarif und echte Angebotsfreigabe
   bleiben absichtlich **offene, separate** Voraussetzungen.

Der offene Adapter-Issue wird nicht allein aufgrund eines erfolgreichen
Best-Effort-Links geschlossen.
