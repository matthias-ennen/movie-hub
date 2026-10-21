# MovieHub – zwölf Nutzer-YouTube-Links: echter G1-Metadaten- und Playlist-Lauf am 21.10.2026

**Primärbeleg:** [GitHub Actions #39593679849](https://github.com/matthias-ennen/movie-hub/actions/runs/39593679849), `workflow_dispatch`, **SUCCESS**. Das [originale Artefakt #12343545125](https://github.com/matthias-ennen/movie-hub/actions/runs/39593679849/artifacts/12343545125) wurde tatsächlich heruntergeladen und die Datei `user-twelve-playlists.md` vollständig gelesen. Berichtszeit `2026-10-21T11:40:46.533Z`. Kein Mock-, Schätzwert- oder nur CI-Code-Resultat.

## Verifizierte Zahlen (YouTube Data API)

| Messgröße | Echt gemessen |
| --- | ---: |
| Unterschiedliche zugelieferte YouTube-Video-IDs | 12 |
| Per `videos.list` erfolgreich aufgelöst | 12 |
| Verschiedene **tatsächliche** `snippet.channelId` | **12** |
| Davon Kanaltitel **YouTube Movies** | **11** |
| Davon anderes, nicht gelistetes **Suno Music** Kurzvideo (ca. 52 s) | **1** |
| Bei Kanälen abgefragte öffentliche `playlists.list` Einträge (jeweils nur erste Seite) | 56 |
| Davon tatsächlich beprobte Listen (bis zu 5 kuratierte je Kanal, Uploads separat) | 23 |
| Zugängliche `playlistItems.list` Seiten (jeweils bis zu 50 Einträge) | 23 |
| Zugelieferte Video-IDs mit direktem Mitgliedschaftstreffer im beprobten Bereich | **5** |
| Davon in einer namentlich genannten, kuratierten **Movies**-Playlist | **1** |
| Echte API-Aufrufe | 37 / 90 |
| API-Endpunkte | 1 `videos.list`, 1 `channels.list`, 12 `playlists.list`, 23 `playlistItems.list` |

**Wichtig:** 56 öffentlich gelistete Playlists ≠ 56 analysierte Playlists. Der Test hat nur **23** (einschließlich automatisch generierter Kanal-Uploads) geprüft. Der fünfte Nutzerlink zeigte sich als nicht gelistetes, fachfremdes Suno-Music-Video. Sein genauer Titel, seine URL und seine Video-ID werden **hier bewusst nicht erneut veröffentlicht**. Er darf nicht als Film oder YouTube-Movies-Katalogkandidat zählen.

## Elf per YouTube Data API belegte Filmanzeigen (Quelle: Video-Titel, keine unabhängige TMDB-Identitätsprüfung)

| Nutzer-Nr. | YouTube-Titel | Video-ID | Laufzeit ca. Minuten | Regions-Metadatensignal |
| ---: | --- | --- | ---: | --- |
| 1 | Tremors: Shrieker Island | `q9Gba51rkHw` | 102 | DE allowed |
| 2 | Sahara | `2SwHXYoQQeQ` | 124 | DE allowed |
| 3 | Predator: Badlands | `rzIyI-OME3M` | 107 | DE allowed |
| 4 | The Amateur | `PZC6NS-IFCk` | 123 | DE allowed |
| 6 | Spider-Man: Brand New Day | `tGPvABsHlu4` | 145 | DE allowed |
| 7 | INSIDIOUS: OUT OF THE FURTHER | `Etlfq9KD78Q` | 106 | DE allowed |
| 8 | Bibi Blocksberg: Das große Hexentreffen | `DxRslNY7hDw` | 89 | DE allowed |
| 9 | Napoleon | `EBiseL2xAz8` | 158 | DE allowed |
| 10 | Robert The Bruce – König von Schottland | `Ln4NNpDD5q8` | 124 | DE allowed |
| 11 | Evil Dead Burn | `rSn7jQolX_c` | 111 | DE allowed |
| 12 | Project Hail Mary | `h4Tv29mk4LE` | 156 | DE allowed |

Alle diese elf IDs sind nach `videos.list` öffentlich und haben einen kanalseitigen Anzeigenamen **YouTube Movies**, aber ihre elf **Kanal-IDs sind verschieden**. Außerdem steht jedes der elf Videos nach Metadaten explizit in einer `DE`-Freigabeliste. Diese Regionsangabe ist noch **kein Kauf-/Leihrecht, echter Abspieltest, Genrebeleg oder zeitlicher Store-Bestand**.

## Playlist-Hypothese – tatsächlich gefundene Quellen

- Bei Nutzerfilm **Nr. 10 – Robert The Bruce** fand die API eine **kuratierte öffentliche Playlist** mit Name `Movies`, ID `PLjQQr4USldHss1HocEpmsUUVVPjYdGakL`; diese Playlist enthielt genau **ein** Element und damit den zugehörigen Videoeintrag `Ln4NNpDD5q8`. Auch die automatisch erzeugte Uploads-Liste seines eigenen Filmkanals enthielt dieses Video. **Das ist eine echte Playlist-Zugehörigkeit, aber kein globaler Shop-Katalog.**
- Vier weitere IDs waren direkt nur über **ihre jeweiligen Kanal-Uploads** in den untersuchten ersten Seiten nachgewiesen: `rzIyI-OME3M`, `PZC6NS-IFCk`, `DxRslNY7hDw`, `h4Tv29mk4LE`. Zusammen mit `Ln4NNpDD5q8` ergeben sich genau **fünf** nachgewiesene Mitgliedschaftstreffer.
- Der Filmkanal zur ersten ID hatte 50 öffentliche Listen auf seiner **ersten** `playlists.list`-Antwortseite; das Forschungsskript sichtete davon nur die ersten fünf, jeweils mit einem Element, **ohne Mitgliedschaft des Nutzerfilms in diesen fünf**. Darüber hinaus sind weitere Seiten vorhanden. Hieraus darf weder „kein Kanalbestand“ noch „50-Film-Shop-Playlist“ geschlossen werden.
- Bei den übrigen elf Film-IDs ergab sich **keine gemeinsame Channel-ID**. Die einzig explizit gefundene kuratierte `Movies`-Playlist enthielt nur einen unserer Filme. Es gibt damit **keinen nachgewiesenen gemeinsamen öffentlichen Playlist-Einstieg** für diese 11 Filme in unserer konkreten 23-Listen-/Erstseiten-Stichprobe.

## Architekturempfehlung und offene G1-Grenzen

1. **TMDB bleibt kanonische Werkidentität.** Eine YouTube Movies Filmseite ergänzt eine konkrete Video-ID / Route pro Film, wobei die Video-ID und DE-Metadaten eigene Herkunft erhalten. **Nicht** nach dem gleichlautenden Label `YouTube Movies` auf eine einzige Kanal-ID normalisieren – bereits die elf Filme besitzen elf verschiedene technische Kanal-IDs.
2. Die zwölf vom Nutzer zugelieferten Links sind ein **nützlicher Seed für direkte Video-ID-/Kanal-Prüfungen**, aber keine gemeinsame maschinenlesbare YouTube-Film-Playlist. Keine globale Video-ID→beliebige-Playlist-Reverse-API und kein zulässiger Vollkatalog im Rahmen dieses Befunds.
3. Für die Erweiterung auf 50 empfiehlt sich als nächstes **TMDB-DE-YouTube-providergebundene Filmtitel als Werk-Seeds**, anschließend gezielte öffentliche YouTube `videoType=movie`-Video-ID-Suche mit konservativen Qualitätsregeln. Die elf möglicherweise korrekten YouTube-Movies-Film-IDs können anschließend mit TMDB-IDs verknüpft werden, aber **nicht automatisch** zur bestehenden 14er-Stichprobe addiert werden, bevor Werk-/Versionsidentität, Duplikate und Regionszugang geprüft sind.
4. Die YouTube-API liefert bei diesem Experiment **keine belegten Euro-Preise oder Einzelmitgliedschaften**. Diese tiefe Monetarisierungsprüfung ist laut jüngster Nutzerentscheidung **nicht Pflichtumfang**; TMDB-DE-Watch-Provider-Details liefern Angebotskategorien, Adapter ergänzen Video-ID und Metadaten.
5. **Keine produktiven Datenänderungen:** weder App, Badge, Deep-Link-Katalog, Firestore, Firebase, native Fire-TV-Code noch geplante Nachtläufe geändert. Nur lesender G1-Forschungslauf und technische Dokumentation. G2–G4 weiter nur mit separater Freigabe.

**Abnahmestatus:** Der G1-Test der zwölf URLs ist in seinem engen Sinne **erfolgreich abgeschlossen** (12/12 Videoressourcen aufgelöst, 37 API-GETs, 12 eigenständige Kanal-IDs). **Die Nutzerhypothese einer gemeinsamen zentralen öffentlichen Film-Playlist konnte in diesem Sample nicht bestätigt werden.** G1-Arbeit #388 läuft weiter.
