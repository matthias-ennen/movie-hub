# MovieHub – G1: echter Live-Test aller YouTube-DE-Kategorien, 100 Filmvideo-Kandidaten

**21. Oktober 2026, 14:40:57 UTC.** Forschung ausschließlich read-only; keine Produktivfreigabe oder YouTube-Provider-Angebotsdaten.

## Tatsächliche Originalquellen

- [GitHub Actions #39618878080](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080), `workflow_dispatch` auf `main`: **SUCCESS**.
- Tatsächliches [Original-Artefakt #12353497700](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080/artifacts/12353497700), `all-categories-hundred.md`: Original-ZIP **heruntergeladen, geöffnet und komplett ausgewertet**. Es enthält die vollständige 100er-Liste mit Titel, Video-ID, Kategorie, Herkunft, Laufzeit, Region-Metadaten und ausschließlich vorläufigem Filmsignal. Das GitHub-Artefakt wird nach 14 Tagen entfernt; diese Dokumentation ist die dauerhafte fachliche Auswertung.
- Der vollständige Originalreport enthält **100** echte unterschiedliche YouTube-Video-IDs (nicht 100 bestätigte Filmtitel). Der stabile SHA-256 über die 100 Video-IDs in Berichtsreihenfolge, mit jeweils einem Zeilenumbruch und abschließendem Zeilenumbruch, ist `f18e3fe44bf8a6c312bf7cf1e02bb22d3770ed2fb0fb4a1a49ea9512c9cc7c27`. Dadurch lässt sich ein späterer Kandidatenexport exakt mit dem Originalbericht abgleichen.

## Ergebnis – 100 Kandidaten erreicht, nicht 100 bestätigte Filmwerke

| Primärmessung | Tatsächlicher Wert |
| --- | ---: |
| Ziel / tatsächliche unterschiedliche Video-IDs in Forschungsstichprobe | **100 / 100** |
| Darin vorhandene, erneut erfolgreich geprüfte Original-47-Video-IDs | **45** |
| Neu gegenüber den ursprünglichen 47 gefundene Video-IDs | **55** |
| Unterschiedliche normalisierte YouTube-Titelschreibweisen | **100** |
| Tatsächlich offiziell in DE gemeldete und im Basislauf geprüfte Kategorien | **31 / 31** |
| Alte separate Kategorie-IDs `30, 35, 36, 39, 43` in offiziellen Antworten | **5 / 5 enthalten** |
| Alle Suchergebnisse vor detaillierter Video-Prüfung, eindeutige Video-IDs | **988** |
| Zur aktuellen Metadatenprüfung ausgewählte Video-IDs | **1.030** |
| Davon mit Videometadaten wieder aufgelöst | **1.030** |
| `videoCategories.list`-GETs | **2** |
| `search.list`-GETs | **54 / maximal 76** |
| `videos.list`-Batch-GETs | **21 / maximal 30** |
| Suchphase wegen Quota/Rate-Limit abgebrochen | **Ja**, beim Kategorie+`videoType=movie`-Test der ID **36** |
| Zweiter Kategorien-Durchgang | **22** Varianten erfolgreich, **1** Quotenfehler, **8** nicht mehr geprüft |
| Explizites `DE allowed`-Region-Metadatensignal in 100 ausgewählten IDs | **88** |
| Kein bestätigendes DE-Regionssignal, daher `unknown` | **12** |

**Kein Quota-Irrtum:** Der Workflow erhielt die Drosselung nach **54** eigenen Such-GETs. Das ist mit früheren Forschungsläufen und einem projekt-/tagesweiten Quotenbudget vereinbar; die konkrete Google-Cloud-Restquote zum Start ist nicht dokumentiert. Das Standardmaximum aus der offiziellen YouTube-Dokumentation ist **keine** Zusage über jederzeit freie Calls in diesem Projekt. Nicht automatisch am gleichen Tag neu starten.

## Welche Kategorien tatsächlich taugen

- **`30` („Filme“) – entscheidende Kategorie:** **87 der 100** am Ende ausgewählten Video-IDs hatten die Kategorie `30`. Davon stammen **45** aus dem bekannten Altbestand und **42** sind neue Filmkandidaten. Sowohl die Basissuche als auch `category+videoType=movie` lieferten je 50 rohe Suchtreffer in ihren jeweiligen einzelnen Suchantworten. Das sind **nicht** 100 verschiedene Werke.
- **13 der 100** wurden aus den übrigen Kategorien ausgewählt, jeweils einer aus `1, 2, 10, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27`. Diese Kategorie-Diversitätsauswahl ist als **besonders prüfbedürftig** zu behandeln, weil schon ein `videoType=movie`-Suchtreffer und eine lange Laufzeit noch kein echtes vollständiges Filmwerk garantieren. Beispiele: `World of Warcraft - O Filme da Historia Dublado` (Gaming-/Compilation-Risiko), `Reich und Arm - Staffel 1 Ganzer Film Deutsch lernen` (Staffel-/Sprachlern-Risiko), Sport- und Naturdokumentationen (können richtige Filme sein, sind aber nicht automatisch Kino-/Spielfilm- oder Store-Filme).
- Die sogenannten **Subgenre-IDs `31–42`** waren zwar offiziell auffindbar, lieferten aber bei der durchgeführten langen `q=ganzer film`-Basissuche jeweils **0 Treffer**. Die daraus angeführten Kategorienamen allein sind daher **keine brauchbare Evidenz** für mehr Video-Fundstücke. Eine generelle Unbrauchbarkeit für jede andere Suchanfrage oder jeden anderen Tag wäre dagegen nicht belegt.
- **`43` („Serien“) lieferte 50** Basistreffer, ist aber offensichtlich keine eigenständige Vollfilm-Bestätigung. Die zweite `videoType=movie`-Variante für ID 43 wurde wegen Erreichen des Quotenlimits **nicht getestet**.
- Die Ablehnungsstatistik in diesem einen Livebericht lautete: **212 zu kurze**, **247 ohne ausreichendes Filmsignal („weak“) und 4 mit klarem Nichtfilm-Titelhinweis** (die Gründe gelten nur für den Screening-Snapshot, nicht als dauerhaftes Qualitätsurteil über Videoeinträge).

### Empfohlene Suchreihenfolge aus den Messwerten

Für die nächste YouTube-first-Forschung **zuerst Kategorie `30`** als Hauptquelle. Die regulären Genre-/Titelvarianten und alle übrigen Kategorien nach Relevanz/ausgewiesener Qualität gezielt ergänzen, statt über alle Kategorien zu skalieren. `43` als **eigene Serienaufgabe**, nicht als unbesehene Ergänzung zum Vollfilm-Pool. Die historischen `30/35/36/39/43`-Bezeichnungen ersetzen weder TMDB-Medientypbestimmung noch einen lizenzierten Shop-/DE-Abspielnachweis.

### Signalschwere in den 100 Video-IDs

| Einschlussgrund laut Forschung | Anzahl |
| --- | ---: |
| Frühere G1-Video-ID, heute erneut geprüft | **45** |
| YouTube-Movies-Kanalbezeichnungsheuristik | **42** |
| Treffer aus Film-Suchmodus | **7** |
| Ausdrücklich „Ganzer Film / Full Film“ im Titel | **6** |
| **Gesamt** | **100** |

Der bloße Kanal-**Anzeigename** ist **kein** Beweis offizieller Rechteinhaberschaft oder des Angebotsstatus. Ebenso ist `videoType=movie` eine Klassifizierungs-/Suchheuristik. **0** Videos wurden bei diesem Lauf unabhängig als TMDB-Filmwerk identifiziert, **0** als Kauf-/Leih-/Ads-/Flat-/Free-Video oder garantiert in Deutschland spielbar bestätigt. Persönliche/private MovieHub-Titel wurden nicht untersucht.

## Ergebnis für G1 und nächste Prüfung

1. **Das Ziel 100 eindeutige YouTube-Video-Kandidaten ist tatsächlich erreicht**. **Nicht** behaupten, es seien 100 sicher identifizierte Filme oder 55 zusätzliche kanonische TMDB-Werke.
2. In der nächsten separaten **G1-Identitätsanalyse** die exakt 100 Research-Video-IDs anhand **TMDB-Werksidentität, Film-vs.-Serie, Titelalias, Jahr und Laufzeit** bewerten. Zuerst die **13 anders kategorisierten Kandidaten** und bekannte Nichtfilm-/Episoden-Risiken aussondern, danach die Kategorie-`30`-Kandidaten. Keine automatischen Veröffentlichungen.
3. Den gegenwärtigen **Livebericht mit der 100er-ID-Liste vor Ablauf der 14 Tage sichern**; SHA-256 oben dient der Überprüfung, dass spätere Analysen exakt denselben Bestand benutzen. Nicht erneut unbegrenzt auf YouTube suchen, wenn 100 Kandidaten bereits vorliegen.
4. **Compliance-Hürde bleibt:** [YouTube Developer Policies III.E.2](https://developers.google.com/youtube/terms/developer-policies) zu API-Datenaggregation kanal-/Content-Owner-übergreifend. Kein aus den Daten erstellter automatischer produktiver YouTube-MovieHub-Badge oder DE-Kauf-/Leih-/Abonachweis vor separater G2-Policy-/User-Freigabe.
5. GitHub-Actions-Tests und der echte Discovery-Lauf waren grün; das ist **keine** TMDB-Match-, Rechte-, Video-/App-Playback- oder G2-Abnahme. Issue [#388](https://github.com/matthias-ennen/movie-hub/issues/388) bleibt offen.

**Keine** Änderungen an MovieHub-App, Suche/Katalog, Firestore/Firebase, Badges, TV/Nightly, Android/Fire TV oder Anbieterlinks aus diesem G1-Forschungslauf.
