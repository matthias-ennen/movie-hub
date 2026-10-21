# MovieHub G1 – 47 YouTube-Video-IDs: echter Werk-/Typen-Review (21.10.2026)

**Originallauf:** [GitHub Actions #39602961148](https://github.com/matthias-ennen/movie-hub/actions/runs/39602961148), `workflow_dispatch` auf `main`, **SUCCESS**. Originales Forschungsartefakt [#12347785136](https://github.com/matthias-ennen/movie-hub/actions/runs/39602961148/artifacts/12347785136), `forty-seven-identity-review.md`, **tatsächlich heruntergeladen und vollständig gelesen**. Erzeugung **2026-10-21T12:51:35.392Z**. Forschung ohne Produktionsimport. Artifact-Retention **14 Tage**, daher hier die wesentlichen Ergebnisse und Fortsetzungsregeln dauerhaft dokumentiert.

## Verifizierte Durchführung – keine Hochrechnung

- **49** belegte Fundbeobachtungen aus vier bisherigen G1-Quellen (12 Genre-Search, 2 Kanal-Uploads, 24 Sortierungs-Search, 11 öffentliche Nutzerlinks), **47** eindeutige YouTube-VIDEO-IDs nach der Doppelzählungsbereinigung `IxL_x8G1_FU` und `9PsAlt9VHQ0`. Grundlage: [historisches Originaldatenmanifest](YOUTUBE_MOVIES_G1_47_EVIDENCE_INPUT_2026-10-21.json).
- Ein einziger gebündelter **YouTube `videos.list`-GET für genau diese 47 Video-IDs**; 47/47 gültige Videos im tatsächlichen Bericht. Alle 47: öffentlich, Vollfilmlaufzeit-Screening, Display-Label `YouTube Movies`, und **DE in den Allowed-Region-Metadaten**. Das sind **keine** 47 bestätigten lizenzierten Filmwerke oder Wiedergabe-/Kauf-/Leihrechte in Deutschland.
- **73** echte TMDB-GETs, begrenzt auf max. **94**; zunächst `search/multi` (Typfilm/Serie) pro Kandidat, bei je einem exakten unverwechselbaren Filmhinweis `movie/{id}` zur Laufzeitdiagnose.
- Kein Zugriff auf den aktuellen produktiven MovieHub-Titelbestand / die kontoweiten persönlichen Titel; **keine Zahl tatsächlich neuer MovieHub-Titel feststellbar**.

## Originalverteilung der 47 Fälle

| Review-Zustand im tatsächlich erzeugten Artefakt | Zahl | Bedeutung |
| --- | ---: | --- |
| `plausible-review` | **25** | Exakter TMDB-Filmtitel und höchstens 15 Minuten Laufzeitdifferenz; **nur Vorschlag** |
| `title-exact-review` | **1** | Ein exakter TMDB-Filmhinweis, aber Laufzeit/Darstellungsfassung weiter offen |
| `ambiguous-work-or-media-type-review` | **10** | Mehrere Filme und/oder gleichlautender Serien-/Filmname; **keine** ID gewählt |
| `series-title-review` | **2** | In den untersuchten TMDB-`search/multi`-Treffern passte ein Serientitel, aber kein exakter Filmtitel; **nicht** bewiesen, dass das YouTube-Video eine Serie ist |
| `unmatched-or-title-variant` | **9** | Kein exakter Filmtitel in der ersten verfügbaren Multi-Suchergebnisantwort; auch Sprach-, Originaltitel- oder Fassungskonflikt möglich |
| **Gesamt** | **47** | **0** automatisch bestätigte Film-/Anbieter-/Wiedergabezuordnungen |

Die 26 vorläufig zugewiesenen TMDB-Movie-IDs sind untereinander verschieden, aber **keine 26 verifizierten Filmidentitäten**. **21** der 47 Video-IDs brauchen zunächst gezielte Film-/Serien-/Titelklärungen. Das Ergebnis ist besser als der vorherige ungeordnete Kandidatenpool, **aber noch kein erreichtes 50-WERKE-Gate**.

## Konkrete Review-Prioritäten

1. **Mehrdeutige Namen:** `School of Rock`, `Baywatch`, `Napoleon`, `Police Story`, `The Amateur`, `Sahara`, `War Story`, `The Beast`, `Mein bester Feind`, `Lügen haben kurze Beine`. Nicht nach Beliebtheit oder erstem Suchergebnis auswählen; Erscheinungsjahr, Originaltitel, Laufzeit, echte Fassung sowie nach Bedarf alternative TMDB-Titel gegenprüfen.
2. **Mögliche Medientyp-Kollision:** `Paradise` und `Mountain` stehen als `series-title-review` im Report. Das ist **nur ein Suchhinweis**, kein Seriennachweis; mögliche gleichnamige Filmwerke dürfen nicht ausgeschlossen werden.
3. **Verfehlter TMDB-Titelalias:** `2010: The Year We Make Contact`, `Jagdgeschwader Wildkatze`, `Back In Time OmU`, `Operation Arsenal – Widerstand in Warschau`, `Isn't She Great? – Ist sie nicht großartig?`, `El Club (OmU)`, `Das Protokoll – Mord auf höchster Ebene`. Gezielte `search/movie`-Kontrolle mit sprach- und fassungssensitiven Suchvarianten prüfen, keine Autozuordnung.
4. **Negativkontrollen:** `Peter Maffay – Niemals war es besser – Live` (Konzert), `Janette Oke: Die Coal Valley Saga Teil 6` (episodisches/Teil-Material). `videoType=movie` und `YouTube Movies` reichen **nicht** für eine positive Kinofilmklassifikation; keinen künstlichen Bestand mit Nichtfilmen auffüllen.
5. **Laufzeitabweichung:** `My Name Is Khan` fiel als `title-exact-review` statt `plausible-review` auf; Filmfassung/Schnitt/Länge genauer bewerten, ehe ein Work-Match bestätigt wird.

## Besonders wichtige Architekturkonsequenzen

- **YouTube-first bleibt unabhängig:** Ein Video wird nicht deshalb verworfen, weil bereits bestehende MovieHub-/TMDB-Providerlisten keinen YouTube-Eintrag führen. YouTube liefert Film-Video-ID-Signale, TMDB prüft die kanonische **Werkidentität** `(movie,tmdbId)`.
- **Sicherer Bestandsvergleich noch offen:** `public/search-index.json` ist laut [Suchindex-Dokumentation](../SEARCH_INDEX.md) der veröffentlichte, datenschutzarme **öffentliche** Index mit TMDB-ID und Medientyp; zusätzlich gibt es `public/catalog.json` (Browse) und profil-/kontogebundene Referenzen. Ein Treffer/Nichttreffer im öffentlichen Suchindex belegt daher nur **öffentliche Suchindex-Mitgliedschaft**, **nicht** die komplette titelübergreifende Nutzer-/Firestore-Welt. Im aktuellen G1-Audit wurde weder Index noch private Bestandsreferenz gelesen; neue MovieHub-Werkzahlen müssen offen bleiben.
- **Externe Compliance-Prüfung ist ein G2-Blocker:** Die aktuellen [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies), insbesondere **E.2 Data Aggregation**, untersagen bestimmte Formen der kanal-/rechteinhaberübergreifenden API-Datenaggregation. Der [offizielle Leitfaden](https://developers.google.com/youtube/terms/developer-policies-guide) verlangt außerdem klare Quellenkennzeichnung und gibt für unabhängig nützliche Suchdienste ein Beispiel, in dem YouTube und andere Plattformen unterscheidbar nebeneinanderstehen. Daher vor einem öffentlichen MovieHub-Aggregations-/Providerangebot den **konkreten vorgesehenen Nutzungs- und Anzeigefall** gegen die Bedingungen prüfen und nötigenfalls YouTube-Compliance-Auskunft/Audit einholen. Ein G1-Forschungs-GET begründet **keine** G2-Produktfreigabe.
- **Quota-Dokumentation prüfen:** Die aktuelle [YouTube-`search.list`-Dokumentation](https://developers.google.com/youtube/v3/docs/search/list) unterscheidet ein Suchanfragenkontingent von Kosten pro Suche; ältere G1-Schätzungen mit 100 Einheiten je Suche dürfen ohne erneuten Abgleich der aktiven Google-Cloud-Quotas nicht als aktueller Plattformzustand dargestellt werden. Der nun ausgeführte **47er-Review nutzt überhaupt keine `search.list`-Calls**, sondern einen `videos.list`-Call.

## Nächster kontrollierter G1-Schritt

1. Eine **getrennte gezielte Nachprüfung der 21 nicht eindeutig identifizierten Videos** spezifizieren (Film-/Serie/Alias/Jahr/Version), ohne alle 47 nochmal ungerichtet zu suchen.
2. Danach bestätigte kanonische TMDB-ID-Hinweise **read-only** gegen den **aktuellen öffentlichen** MovieHub-Suchindex abgleichen. Ein Titel, der nur persönlich/privat vorhanden ist, darf nicht ohne sichere und berechtigte Quelle als öffentlich unbekannt deklariert werden.
3. Dokumentierte **G1 Go-/No-Go-Entscheidung** für rechtmäßige, wiederholbare Entdeckung (YouTube-first und TMDB-first), regionale Verfügbarkeit, sichere Werkidentität und Datenfrische. Erst danach **separate ausdrückliche Freigabe** für G2/Produktivintegration.

**Grenze:** Alles oben ist Forschungsstand vom 21.10.2026. **0** produktive MovieHub-Titel, Badges, PlaybackRoutes, Android-/Fire-TV-Apps, Firebase-/Firestore-Daten oder Nachtläufe wurden durch diesen Run geändert. Issue #388 bleibt offen.