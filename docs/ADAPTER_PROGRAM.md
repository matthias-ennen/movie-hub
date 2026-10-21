# Movie Hub – Adapterprogramm und Quellen-Ausbau

## Aktuelle Zielkorrektur – 21.10.2026: YouTube Movies vor Publisher-Playlists

**Neues fachliches Ziel nach Nutzerklärung:** MovieHub soll **von YouTube selbst über YouTube Movies/Film-Shop angebotene Filme in Deutschland** erschließen, nicht nur kostenlose Filme und nicht primär vollständige YouTube-Uploads von Publishern. Zu unterscheiden sind **FREE/ADS** (kostenlos/werbeunterstützt), **RENT** (Leihe), **BUY** (Kauf) und, soweit tatsächlich belegbar, **SUBSCRIPTION** (Primetime-Kanalabo). Derselbe Film kann mehrere Angebotsarten besitzen. Nicht belegte Angebote/Preise bleiben **unbekannt**; keine erfundenen Badges. Publisher-Playlists wie Netzkino/CiNENET bleiben ein **Kontroll- und Ergänzungsszenario**, nicht das primäre Produktziel. Frühere auf kostenlose Playlists begrenzte Zieltexte sind insofern historisch; der bestehende G1-200er-API-/TMDB-Befund bleibt unverändert und gültig.

### G1-Testszenario vor Produktiv-Coding ausweiten

1. **Katalog-/API-Zugang klären:** Dokumentierte, zulässige Schnittstellen oder offiziell lizenzierte Katalogquellen für den *deutschen YouTube-Movies-Shop einschließlich Angebotsart und Preisen* ermitteln. Die dokumentierte YouTube Data API kennt u.a. die Filmsuche mit videoType=movie und Videos-Metadaten; sie ist **bisher kein nachgewiesener vollständiger DE-Shop-/Preisfeed**. Der Parameter videoPaidProductPlacement betrifft Creator-Werbung, nicht Rent/Buy. Ohne belastbaren Feed kein automatischer Vollkatalog.
2. **Separate offizielle Shop-Stichprobe:** **40–60 anhand der offiziellen YouTube-Movies-Oberfläche ermittelte Testfälle**, möglichst über FREE/ADS, RENT, BUY, belegbare Abo-Fälle und Negativfälle verteilt. Bestehende 200er-Publisher-Stichprobe weiter als Kontrollfall nutzen. Falls eine Klasse nicht belegbar ist, die Lücke statt fiktiver Fälle ausweisen.
3. **Fallakte je Film:** offizieller Film-/Share-Link, belegte Film-/Video-ID, Titel/Originaltitel/Jahr/Version, Medientyp+TMDB-ID, Preis-/Angebotsart(en), ggf. EUR-Betrag und Qualität, Quelle/Publisher, DE-Region, Zeitpunkt, Anmelde-/Kanalabo-Voraussetzung, Filmseite/Kaufdialog/Wiedergabe unterscheiden. Unbekanntes nicht aus anderen Videoattributen ableiten.
4. **API-Kontrollvergleich:** Shop-Stichprobe gegen dokumentierte search.list-/videos.list-Felder halten. Messen, welche Filme und IDs auffindbar sind und welche Preis-/Angebotsklasse **wirklich aus offizieller Datenquelle** ableitbar ist. Region oder Filmtyp allein ist kein Kosten-/Rechtenachweis.
5. **Exakte Geräteziele:** Bei hinreichend belegten Film-IDs kontrollieren, ob Android-Smartphone, Tablet und Fire TV die richtige YouTube-Filmseite, den Leih-/Kaufdialog oder die tatsächliche Wiedergabe öffnen; Web-Fallback/Entitlement dokumentieren. Keine Testkäufe ohne ausdrücklichen Auftrag und keine erfundene Geräteabnahme.
6. **Kanonische Identität und Lebenszyklus:** TMDB-ID+Medientyp weiterhin zentral; gleiche Filme aus YouTube-Shop und Publishern nicht duplizieren. Änderungen bei Preis, Region, Gratis-Angebot, Abo oder Entfernung getrennt erfassen.
7. **Gate-Entscheidung:** G1-Zahlenbericht je Klasse: offizielle Katalogabdeckung, sichere Titel-IDs, Preis-/Availability-Daten, Matchquote, Links/Fire TV, Frische/Quota/Rechte, **Go / begrenztes Teil-Go / No-Go**. G2 erst nach erneuter Nutzerfreigabe.

**Grenzen:** kein Scraping, keine internen undokumentierten APIs, keine Preisbehauptung aus normalen Video-Metadaten, kein automatischer Massenimport oder Produktiv-Code. Eine kleine kuratierte Film-Link-Liste ist allenfalls ein **später separat freizugebendes** Teilziel, kein Ersatz für bewiesene Shop-Automatisierung.

**Offizielle Referenzen:** [YouTube Filme kaufen/leihen](https://support.google.com/youtube/answer/9674101?hl=de) · [YouTube kostenlose Primetime-Filme](https://support.google.com/youtube/answer/16618963?hl=de) · [Data API search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list) · [Videos](https://developers.google.com/youtube/data/reference/rest/v3/videos) · [Developer Policies](https://developers.google.com/youtube/terms/developer-policies).

---

**Stand:** 16.10.2026  
**Status:** Verbindliche Priorisierung und erste Analyse; **keine Implementierungs- oder Produktivfreigabe**.  
**Leit-Issue:** [#271 – Modulare Quellenplattform](https://github.com/matthias-ennen/movie-hub/issues/271).  
**Nächster Einzelauftrag:** [#388 – YouTube-Quellenadapter](https://github.com/matthias-ennen/movie-hub/issues/388).

## 1. Projektübergabe und Entscheidung

Matthias hat am **16.10.2026** das Gesamtpaket **Mitteilungen** als abgeschlossen erklärt; **#314 und #385** sind danach mit `completed` geschlossen worden. Die Teilpakete **#380–#384** sind ebenfalls geschlossen und zuvor fachlich abgenommen. Zusätzliche Meldungsfamilien sind Ideen für später, **keine aktuelle Aufgabe**. Die in #385 mit dokumentierten TV-/Provider-Korrekturen wurden technisch veröffentlicht; daraus wird keine undokumentierte weitere visuelle Geräteabnahme abgeleitet.

**Neue Hauptstrecke:** Quellenfundament durch unabhängige Adapter ausbauen. **YouTube kommt zuerst**, danach DVB-I und Prime Video als separat freizugebende Pakete. Das Ziel ist eine robuste, breitere Film-/Serienverfügbarkeit und konkrete Wiedergabewege – nicht eine Sammlung unkontrollierter URLs.

## 2. Priorität und Schnitt der Arbeitspakete

| Reihenfolge | Issue | Inhalt | Aktuelle Phase | Freigabegrenze |
| --- | --- | --- | --- | --- |
| 1 | [#388 YouTube](https://github.com/matthias-ennen/movie-hub/issues/388) | Vollständige legale Filme aus zulässigen Playlists/Publisher-Quellen, TMDB-Matching, genaue Video-Route | **Analyse und kleiner nichtproduktiver Datenpilot** | Kein Import in produktiven Movie-Hub-Katalog vor Daten-, Recht-, Match- und Geräteprüfung |
| 2 | [#336 DVB-I](https://github.com/matthias-ennen/movie-hub/issues/336) | Deutsche Service-Liste, EPG, Live-Playback-Signalisierung | Quellen- und Zugangsrecherche | Kein produktiver Adapter ohne nachgewiesenen erlaubten, verlässlichen Produktionszugang |
| 3 | [#391 Prime Video](https://github.com/matthias-ennen/movie-hub/issues/391) | Titelgenaue GTI-/Content-ID, Fire-TV-Absprung | IDs und offiziell unterstützte Wege validieren | Kein automatischer Import, solange keine tragfähige ID-Quelle/Zuordnung besteht |
| später | neue Teilissues unter #271 | offizielle Free-TV-, Mediathek- und FAST-Quellen | Kandidatensuche | Jede Quelle eigener Go/No-Go-Prozess |

Die Reihenfolge ist eine **Arbeitspriorität**, keine Zusage, alle drei Adapter produktiv integrieren zu können. Ein No-Go beendet einen Pilot sauber, ohne die Quellenarchitektur zu verbiegen.

## 3. Unveränderliche Architektur- und Qualitätsregeln

1. **Titelidentität:** `Medientyp + TMDB-ID` ist kanonisch. YouTube-Video-ID, DVB-I-Service-/Event-ID und Prime-GTI werden **separat als Quellen-/Playback-IDs** verwaltet.
2. **Neutrale Datenstrecke:** unabhängiger Adapter → Quellenevidenz und SourceEnvelope → konservatives Titelmatching → normalisierte Verfügbarkeit/PlaybackRoute → validierte, atomare Veröffentlichung → bestehender Movie-Hub-Lesepfad.
3. **Kein zweiter Metadatenstamm:** Filme/Serien bekommen keine parallelen Titel, nur zusätzliche nachgewiesene Angebote, ggf. mit Gültigkeitsfenster und Quelle.
4. **Provenienz:** Herkunft, abgefragte Generation, Zeitpunkt, Gültigkeit, DE-Eignung, Matching-Sicherheit und Ablehnungsgrund diagnostizierbar halten; unklare Werte nicht erfinden.
5. **Anbieter versus Wiedergabe:** Der tatsächliche Anbieter bleibt erkennbar. Die Route führt zum **exakten** Film bzw. zur richtigen Ausstrahlung; ein bloßer allgemeiner Anbieterstart darf nicht als „direkt abspielbar“ ausgegeben werden.
6. **Fehlerisolation:** Ausfall, Fehlzuordnung, Quota-Problem oder abgeschnittene Antwort eines Adapters dürfen andere Quellen sowie den letzten gültigen veröffentlichten Datenstand nicht zerstören. Ablauf/Entzug einzelner Angebote kontrolliert behandeln.
7. **Leistung und Sicherheit:** keine neuen Netzwerkaufrufe pro Poster, kein Scraping/DRM-Bypass, keine öffentlichen Secrets, keine ungesicherte Massenerfassung. Bestehenden inkrementellen Nachtlauf und Test-/Diagnosepfad möglichst wiederverwenden.
8. **Produktgrenze:** `FLAT`, `FREE`, `ADS`, `RENT`, `BUY`, `AIR` strikt nach belegtem Angebots-/Sendekontext; keine Vermischung oder automatisch erfundenen Labels.

## 4. Erstes Paket #388 – YouTube: bestätigte Recherche

**Quellenstand der folgenden Angaben: 16.10.2026.** Die folgenden Ergebnisse beruhen auf den offiziellen veröffentlichten Dokumentationen und dem bereits angelegten Issue #388; **es gab noch keinen authentifizierten YouTube-API-Abruf und keinen realen Fire-TV-Wiedergabetest dieses Adapters**.

### G1-Ergebnis (16.10.2026) – 200er-Inventarisierung erfolgreich

**Live belegt:** [YouTube G1 Inventory Run #38878217586](https://github.com/matthias-ennen/movie-hub/actions/runs/38878217586), alle Schritte grün. [Messdetails und methodische Abgrenzung](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--vollständige-playlist-id-inventarisierung-und-200er-stichprobe-erfolgreich-16102026).

- **Vollständiges ID-Inventar dieser beiden spezifischen Playlists:** **24 CiNENET**-Themenplaylist-Einträge + **2.766 Netzkino**-Uploadliste-Einträge; 57 Seiten erfolgreich gelesen. **Keine Behauptung, 2.790 geprüfte Filme oder der komplette CiNENET-Kanal seien erschlossen.**
- **Zeitlich verteilte 200er-Probe:** **200/200** Videometadaten erfolgreich; davon **174 Langvideo-Kandidaten** (≥45 Min), **21 Clips** (unter 20 Min), **4 mittlere Videos** (20–44 Min) und **1 Video aus anderem Kanal innerhalb der CiNENET-Playlist** (separate Herkunftsprüfung).
- **DE-Metadaten:** **194** explizite `regionRestriction.allowed`-Signale für DE, **6** ohne solche Eindeutigkeit, keine ausdrückliche DE-Sperre in der Probe; **kein Playbackbeweis**.
- **API-Aufwand:** 64 lesende Calls, keine Katalog-/Firebase-/Adapter-/Nightly-Schreiboperationen. Secret- und WIF-Pfad nachgewiesen.
- **Interne Priorisierung:** `viewCount`-Ranking für die 200er-Stichprobe gelungen, **keine** weltweite oder kanalweite Aufrufzahlrangliste. Datenbeschaffung (seitenweises Inventar) bleibt getrennt von nachgelagerter Priorisierung und kanonischer TMDB-Identität.

**Nächstes Gate:** hochwertige, **nichtproduktive TMDB-Matchinganalyse** der 174 Kandidaten, inklusive Titel-/Originaltitel-/Jahr-/Laufzeitprüfung, Konfidenz, unsicherer Fälle und Überschneidungen mit dem bestehenden MovieHub-Katalog. Danach rechtliche Verfügbarkeit und echte DE-/Fire-TV-Wiedergabetests. **Keine Freigabe für Produktivimport oder neue Badges. #388 bleibt offen.**

### G1-Kodi-Nachprüfung live abgeschlossen: fünf Filmhinweise zur Sichtprüfung, Spider mehrdeutig

**Echter Live-Nachweis:** [YouTube G1 TMDB Match Research #38895558740](https://github.com/matthias-ennen/movie-hub/actions/runs/38895558740), **SUCCESS**. Die vormals sechs gefundenen TMDB-Suchhinweise wurden gegen zentralen Matcherscore, weitere konkurrierende Kandidaten, TMDB-Jahr und Videolaufzeit erneut geprüft: **fünf `priority-manual-review`** (`movie:13998`, `11595`, `14359`, `150`, `45881`) mit Laufzeitdifferenzen von **0,2 bis 2,4 Minuten**. **Spider bleibt `ambiguous-or-weak`**; vollständigerer Kandidatenvergleich meldete `movie:9613` gegen `movie:615750` und ungenügenden Score-Abstand. Die Top-3-Suchergebnisliste aus dem früheren A/B-Pilot war ausdrücklich keine vollständige Matchingentscheidung.

**Kodi-inspirierte en-US-Suche der übrigen 14 Videos:** **10 `no-results`**, **4 `results-but-no-exact-alias`**, **0** neue identifizierte TMDB-Kandidaten; **14** Suchabfragen auf Seite 1, **0** auf Seite 2, da nirgends weitere Ergebnisseiten gemeldet wurden. Gesamtverbrauch aller G1-Stufen: **327/420** echte TMDB-Requests inklusive Retry. **Baseline 10 `provisional-identity` / 117 `review` / 47 `unmatched` bleibt unverändert.**

**Nächste fachliche Gate-Reihenfolge:** (1) Tatsächliche menschliche Sichtprüfung ausgewählter Fünfer- und 18er-Prüffälle auf Werk, Vollfilm, DE-/Android-/Fire-TV-Wiedergabe, Kosten/Anmeldung und Publisherrechte; (2) bei übrigen unklaren Titeln bessere **Publisher-/Originaltitel-Metadaten**, nicht unnötige zusätzliche Seiten/Sprachen; (3) kanonischer Dubletten-/Bestandsvergleich gegen **echte** MovieHub-Live-Daten, nicht GitHub-Fallback. **Auch fünf sehr plausible Hinweise sind keine fünf final gematchten oder frei nutzbaren Filme.** Produktivadapter, G2/G3/G4, Badges, Nachtlauf und Firebase bleiben gesperrt.

[Vollständiger Messbericht samt Videolinks, Spider-Erklärung und Ablehnungsgründen](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--kodi-inspirierte-nachprüfung-16102026).

### Historische Vorbereitungsphase vor dem Live-Nachlauf

### G1-Folgeanalyse vorbereitet: sechs neue Filmhinweise und 14 Suchprobleme

Auf Basis des echten G1-A/B-Berichts (**6** neue TMDB-Suchhinweise aus 20 wiederholten Nichttreffern, bisherige Baseline **10/117/47** unverändert) wird die Kodi-inspirierte Kandidatensuche in den bestehenden **read-only** YouTube-/TMDB-Forschungsworkflow integriert.

**Prüfspur A – sechs Kandidaten:** Sämtliche bekannten konkurrierenden TMDB-Ergebnisse werden erneut mit dem **zentralen Waipu-TMDB-Scorer** bewertet; nur bei eindeutigem und exakt passendem Titel wird TMDB-Jahr und Laufzeitdifferenz des YouTube-Videos zusätzlich geprüft. `Spider` mit mehreren möglichen IDs bleibt ausdrücklich eine Mehrdeutigkeit. Das Resultat ist allenfalls **`priority-manual-review`**, niemals automatische Film-/Provider-Freigabe.

**Prüfspur B – 14 ohne weitere Titelvariante:** Streng begrenzte `en-US`-Recherche auf derselben Quellstichprobe; zweite TMDB-Seite nur bei `total_pages>1`, nie mehr als zwei Seiten. Die additive `WaipuTmdbSearchClient.searchDiagnostic`-Methode nutzt **dieselbe API-Budget-/Cache-/Rate-Limit-Logik**, während die bestehende produktive `search()` unverändert bleibt. Max. 28 zusätzliche Suchrequests vor Cache; Gesamtdeckel **420 TMDB**, **90 YouTube**. Nur diagnostische Suchhinweise.

**Status:** Code/Tests vorbereitet, neuer Live-Diagnoselauf steht noch aus; keine Produktiv-/Quellen-, Badge-, Firestore-/Firebase- oder Playback-Änderung. [Methodik und Gate-Definition](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-folgearbeit-vorbereitet--sechs-suchhinweise-streng-nachprüfen-kodi-suchkaskade-begrenzt-testen). **#388 bleibt offen, G2 nicht freigegeben.**

### G1-A/B-Livebefund: 6 neue TMDB-Suchhinweise und Kodi-Architekturvergleich

**Echter Live-Lauf:** [YouTube G1 TMDB Match Research #38892290414](https://github.com/matthias-ennen/movie-hub/actions/runs/38892290414) vollständig **grün**. **Identische 20** aus 47 `unmatched`-Video-IDs erneut untersucht: mit dem alten Suchdiagnosepfad **0** zusätzliche TMDB-Hinweise (25 Suchfunktionsaufrufe); die neue quellneutrale Bereinigung gewann bei **6 von 20 Videos** mindestens einen weiteren Kandidaten mit nur **7** zusätzlichen TMDB-Suchfunktionsaufrufen. **14** Videos blieben ohne sicher neu ableitbare Suchvariante. Gesamtworkflow **308/420** echte TMDB-Anfragen einschließlich der unveränderten Baseline und des Jahresvergleichs.

Die sechs Fälle betreffen `Margot und die Hochzeit` (TMDB 13998), `Und wieder 48 Stunden` (11595), `Glaubensfrage` (14359), `Spider` (**mehrdeutige TMDB-IDs**), `Nur 48 Stunden` (150) sowie `Die Brücke von San Luis Rey` (45881). Für `Nur 48 Stunden` wurde ebenfalls eine offensichtlich werbliche, unnötige zweite Titelfassung erzeugt: gezieltes künftiges Qualitätsgate. **Alle sechs sind nur Suchhinweise, kein MovieHub-Match. Die Baseline bleibt 10 `provisional-identity`, 117 `review`, 47 `unmatched`.**

**Zusätzlich Kodi-Originalcode/Wiki untersucht:** Der offizielle [Kodi-TMDB-Filmscraper](https://github.com/xbmc/metadata.themoviedb.org.python) belegt kontrollierte Suchkaskaden (Jahr, ±1, ohne Jahr), ggf. zweite TMDB-Ergebnisseite, getrennte Such-/Anzeigesprache, exakte TMDB-/IMDb-IDs, Ergebnispriorisierung/Manuell-Auswahl und fallbackbasierte Detailanreicherung. **Für MovieHub übernehmen wir nur konzeptionelle Suchideen**: breite, begrenzte Kandidatenfindung → unveränderte, **strenge** zentrale Identitätsentscheidung. TMDB-Popularität und alternative Jahre sind höchstens Sortier-/Recall-Signale; **niemals automatische Freigabe**. Der Kodi-Scraper ist **GPL-2.0-or-later**; **kein Quelltext oder API-Key übernommen**. Kodi-interne YouTube-`plugin://`-Links taugen nicht als Android-/Fire-TV-Wiedergaberoute.

**Nächstes G1-Gate:** die sechs Hinweise inkl. `Spider`-Mehrdeutigkeit konservativ durch gemeinsamen Matcher, Jahr, Originaltitel und tatsächliche Video-/TMDB-Laufzeit abgleichen; dann die 14 weiterhin unklaren Fälle begrenzt über ergänzende Suchsprache bzw. weitere Kandidatenseite testen und Ergebnis sowie API-Budget messen. Echte manuelle 18er-Filmsichtung, DE-/Fire-TV-Playback und Rechtefrage bleiben gesondert offen. **Kein G2, keine neuen YouTube-Badges oder produktiven Änderungen.**

[Gesicherte Messwerte, vollständige Videolinks und Kodi-Referenzanalyse](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--neuer-suchtext-parser-6-statt-0-suchhinweise-16102026).

### Historischer A/B-Plan vor dem erfolgreichen Lauf

### G1-Titelqualität – quellneutraler Parser und A/B-Vergleich vorbereitet

Nach der echten [G1-Liveprobe #38889900636](https://github.com/matthias-ennen/movie-hub/actions/runs/38889900636) (20 aus 47 `unmatched`, 25 zusätzliche TMDB-Suchen, 0 neue Hinweise) wurde eine streng begrenzte **quellneutrale Query-Bereinigung** vorbereitet. Sie trennt **eindeutig erkennbare Darsteller-Werbeformeln, Publisher-Prefixe und Genre-/Format-Footer** von möglichen Filmtiteln, ohne Werktitel mit Bindestrich pauschal zu zerschneiden.

Ein A/B-Diagnoselauf gegen **dieselben maximal 20 unverändert `unmatched` gebliebenen YouTube-Videos** vergleicht die früheren Suchtexte mit **höchstens zwei tatsächlich zusätzlichen** Varianten pro Video (max. 40 Query-Aufrufe). Auch gute neue TMDB-Hinweise bleiben **reine Suchkandidaten**; zentraler Waipu-/Joyn-Matcher, Score-/Margin-/Jahres-/Laufzeitgates, kanonischer Filmvertrag und Bestandsstatus werden nicht verändert.

**Stand:** implementiert und mit Regressionstests versehen, **Live-Ergebnisse der neuen A/B-Diagnose ausstehend**. Manuell nur nach grüner PR-CI/Android-Freigabe starten; bestehendes Limit 420 TMDB-Requests inklusive Retry beibehalten. Keine Cloud-/Firebase-Schreibzugriffe, kein YouTube-Provider-Badge, keine automatische Filmaufnahme. [Methodik und bewusst verbotene Sonderregeln](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-ausbau--erklärbare-quellunabhängige-titelbereinigung-und-ab-diagnose-vorbereitet).

### G1-Sichtprüfliste und `unmatched`-Diagnose real durchgelaufen – nächster Titelqualitäts-Fokus

**Nachweis:** [YouTube G1 TMDB Match Research #38889900636](https://github.com/matthias-ennen/movie-hub/actions/runs/38889900636), komplett **grün**, ausschließlich lesend. Die bestehende **Baseline 10 provisorische Identitäten / 117 Reviews / 47 unmatched** blieb unverändert. Der Forschungsworkflow hat aus den 79 priorisierten Kandidaten eine **divers verteilte Liste von 18 konkreten YouTube-/TMDB-Paaren** mit gültigen Links, Filmjahr und Laufzeitabweichungen erstellt; alle 18 stehen weiter ausdrücklich auf **`offen`**, keine tatsächliche menschliche Film-/DE-/Fire-TV-/Rechteabnahme.

Von den bisherigen **47 `unmatched`** wurden **20** in einer getrennten, streng begrenzten Alternativtitelsuche untersucht. **19** blieben ohne TMDB-Suchresultat, **1** besaß keine sichere alternative Suchform. Die Diagnose führte **25** weitere TMDB-Suchaufrufe aus; die echte Gesamtsumme stieg von **276 auf 301** (Budget 420).

**Interpretation für die Architektur:** Die vorherige Query-Aufbereitung lässt häufig Filmschauspieler, Marketing- und Genrefragmente in den Suchstrings stehen; die Suche scheitert also potenziell am Suchtext, **nicht** zwingend an fehlenden TMDB-Titeln. Das nächste kleine G1-Qualitätspaket ist ein **konservativer, erklärbarer Titel-/Werbetextparser**, dessen Vorher-/Nachher-Vergleich zuerst die 20 realen Nichttreffer und dann begrenzt weitere der 47 testet. Der zentrale Waipu-/Joyn-Matcher, der Filmidentitätsvertrag und Produktiv-Schwellenwerte bleiben unverändert. Separat: **wirkliche menschliche Video-/Playback-Sichtprüfung** der dokumentierten 18 Fälle, später kanonischer Live-MovieHub-Katalogabgleich und Anbieterrechts-/Kostenprüfung.

**Detaillierter Livebericht mit allen 18 Video-/TMDB-Paaren:** [YouTube-Forschungsdokument](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--18er-sichtprüfliste-und-unmatched-suchdiagnose-erfolgreich-erzeugt-16102026). **Keine produktive Quellenaufnahme, keine YouTube-Badges und keine G2-Freigabe.**

### Historische Vorbereitung der 18er-/20er-Diagnose

### G1-Nächste Qualitätsanalyse: Prüfliste und 47 Nichttreffer (vorbereitet)

Nach dem echten G1-Jahreslückenvergleich (**79** priorisierte und **32** ungeklärte Fälle bei weiterhin **10/117/47** Baseline) wird als nächste **nur manuell auszulösende Diagnose** eine **über Laufzeitdifferenz und Filmjahr gestreute Sichtprüfliste mit höchstens 18 YouTube-/TMDB-Linkpaaren** erzeugt. Alle Einträge sind ausdrücklich **ungeprüft**, bis das konkrete Video hinsichtlich Filmidentität, Vollständigkeit, deutschem Playback auf Geräten, Anmeldung/Kosten und Verbreitungsrechten tatsächlich überprüft wurde.

Die separaten **47 `unmatched`** erhalten im selben schreibgeschützten Test nur eine **auf höchstens 20 Videos / 40 Titelsuchvarianten begrenzte** diagnostische TMDB-Suche bei eindeutig entfernbaren Werbezusätzen; kein automatisches Matching oder pauschales Zerlegen mehrteiliger Filmtitel. Ohne sichere Suchalternative bleibt `no-safe-query-variant` im Bericht stehen. Vorhandener Matcher, Quellenvertrag, Quotenlimits und bestehende Geheimnisse bleiben unverändert.

**Status:** Implementierung/Tests im G1-Pilot vorbereitet, **kein erneuter Live-Test dieser Zusatzdiagnose** und **keine manuelle Film-/Playback-/Rechteabnahme** bisher. Workflow und Ergebnisse nach grüner CI auf Basis echter Daten getrennt prüfen. [Methodik](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-folgepaket--konkrete-sichtprüfliste-und-separate-unmatched-suchdiagnose-vorbereitet). **G2 nicht freigegeben.**

### G1-Jahreslückenvergleich erfolgreich – 79 von 111 Fällen für die manuelle Prüfung priorisiert

**Tatsächlicher Live-Nachweis:** [Read-only Run #38886597861](https://github.com/matthias-ennen/movie-hub/actions/runs/38886597861), vollständiger Job-Erfolg. Baseline auf exakt derselben 200er-YouTube-Stichprobe unverändert: **174** TMDB-untersuchte Langvideos, **10** vorläufige Identitäten, **117** Reviews, **47** `unmatched`. Von den **111** Reviews ohne explizites Filmjahr im YouTube-Videotitel wurden nach exaktem TMDB-Lokal-/Originaltitel, Kandidatenabstand und verifizierter Laufzeitdifferenz von höchstens zehn Minuten **79** als **`priority-manual-review`** priorisiert (rund 71 %). **32** der 111 bleiben ohne genügend zusätzliche Evidenz: 16 fehlende exakte Titelaliases, 12 mehrdeutige/schwache Kandidaten, 3 Laufzeitkonflikte, 1 fehlendes Laufzeitdetail.

**API-Aufwand:** **276** tatsächliche TMDB-Requests inkl. Retry (Baseline + Zusatzanalyse; Obergrenze 420), von denen die Vergleichsanalyse 82 ergänzende Detailabfragen vor Client-internem Cache benötigte. Keine Änderung der produktiven Matcher-/Quellenregeln, kein Import und keine Firestore-/Firebase-Schreiboperation.

**Wesentliche Trennung:** `priority-manual-review` ist **keine neue Identitätsfreigabe**. Es bleiben weiterhin 117 Reviews, nicht automatisch 79 zusätzliche „fertige Filme“. Die **47 `unmatched`** sind ein separates Problem der Titel-/Suchqualität. Echte DE-/Fire-TV-Wiedergabe, zulässige Rechte und der Abgleich mit dem aktuellen veröffentlichten MovieHub-Katalog bleiben offen.

**Nächstes G1-Gate:** Einzelfallprüfung einer repräsentativen Teilmenge der 79 priorisierten Videos und gezielte Fehleranalyse der übrigen 32 plus der 47 nicht gefundenen Kandidaten; Ergebnisse nach den bestehenden, zentralen Identitäts- und Quellenverträgen bewerten. Keine Lockerung des Waipu-/Joyn-Produktivmatchings, keine G2-Freigabe. [Vollständiger Livebericht mit Beispieltiteln und Zahlen](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--zusätzlicher-evidenzvergleich-ohne-filmjahr-erfolgreich-16102026).

### Historische Vorbereitung vor dem erfolgreichen Vergleichslauf

### G1-Datenqualität: konservativer Vergleich für 111 Video-Titel ohne Filmjahr (vorbereitet)

**Zusatzdiagnose zum gleichen 174er-TMDB-Sample:** Nach den Live-Ergebnissen mit 10 vorläufigen Identitäten, 117 Reviews und 47 ohne Kandidaten soll eine **zweite Evidenzschicht** die **111 Reviews ohne explizites Filmjahr** auf *manuell lohnende Fälle* reduzieren. Der bestehende Waipu-TMDB-Matcher und die Baseline-Kategorien werden nicht verändert oder aufgeweicht. Ein Review erhält **keine automatische TMDB-Identität**.

Die nur manuell ausführbare Forschungsstrecke ergänzt bei exakt passendem TMDB-Lokal- oder Originaltitel, vorhandener Matcher-Eindeutigkeit und einer Laufzeitdifferenz ≤10 Minuten den Status **`priority-manual-review`**. Das ist nur eine *Prioritätsliste für menschliche Sichtprüfung* – keine Nachweisführung zu identischem Werk, Filmrechten, kostenlosen Angeboten oder DE-/Fire-TV-Abspielbarkeit. Fehlende Belege bleiben als `insufficient` nachvollziehbar. Einheitlicher Matcher und Quellen-/Katalogvertrag bleiben verbindlich.

**Status:** Code/Regressionstests vorbereitet, echte Vergleichszahlen stehen noch aus. Workflow nach grüner CI nur manuell starten. [Methode und Ausschlussgründe](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1--vergleichsdiagnose-ohne-filmjahr-vorbereitet-16102026). **Keine Produktivänderung und keine G2-Freigabe.**

### G1-TMDB-Livelauf – technische Zuordnung erfolgreich, Qualitätsgates noch offen

**Beleg:** [GitHub Actions #38884328789](https://github.com/matthias-ennen/movie-hub/actions/runs/38884328789) ist **vollständig grün**; kombinierter YouTube-/TMDB-API-Test nutzt den **vorhandenen Waipu-Matcher v5**. **200** untersuchte Videos, **26** Quell-/Laufzeit-Ausschlüsse, somit **174** analysierte Langvideos; davon **10** starke *vorläufige* Identitäts-Hypothesen, **117** prüfpflichtige Kandidaten und **47** ohne hinreichenden TMDB-Kandidaten. **194 TMDB-API-Aufrufe** durchgeführt. Eine potenzielle Dublettengruppe bei `movie:304613` unter YouTube-Videos; kein verifizierter Live-MovieHub-Dublettenabgleich.

**Entscheidender Befund:** Bei **111** Videos fehlt das vom Erstpilot zur automatischen vorläufigen Bestätigung vorgeschriebene ausdrückliche Filmjahr im YouTube-Titel; dadurch allein sinkt die strenge Zuordnungsrate auf 10/174. Das ist **kein** Beweis für fehlende TMDB-Identität, schlechte YouTube-Quellen oder angeblich 164 ungeeignete Filme. Die Matchingregeln dürfen nicht unbemerkt gelockert werden.

**Nächstes separates G1-Gate:** konservative, universelle Evidenzanreicherung für unvollständige YouTube-/Publisher-Titel und Vergleichsmessung auf derselben Stichprobe. TMDB-Titel/Originaltitel/Jahr/Laufzeit gemeinsam validieren, mehrdeutige Varianten in Review belassen, die 47 Suchausfälle diagnostizieren. Anschließend mit tatsächlichem kanonischen Live-Katalog vergleichen und echte DE-/Fire-TV-Wiedergabe sowie erlaubte Angebotsklasse separat prüfen.

**Freigabestatus:** YouTube API/Inventar/Matchingdiagnostik technisch nachgewiesen, **noch kein freigegebener Produktivadapter oder neue Anbieter-Badges**. [Detaillierter Originalmessbericht](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--erster-kombinierter-youtube-tmdb-matchinglauf-16102026). #388 offen.

### Historischer vorbereiteter TMDB-Pilot (vor dem erfolgreichen Liveabruf)

### G1-Folgepaket vorbereitet – konservatives YouTube-/TMDB-Matching (noch nicht ausgeführt)

Nach erfolgreicher YouTube-Inventarisierung von 2.790 IDs und 200/200 Video-Metadaten folgt die **identitätsorientierte Analyse der 174 Langvideo-Kandidaten**. Der getrennte, ausschließlich manuelle Diagnoseworkflow `YouTube G1 TMDB Match Research` kombiniert das bestehende G1-Inventar mit dem **bereits in MovieHub vorhandenen Waipu-TMDB-Matcher** und seinem TMDB-Suchclient. Die vorhandene Logik für kanonische Identität, Titel-/Jahr-Konfidenz und Mehrdeutigkeiten wird wiederverwendet, statt einen Youtube-Sondermatcher zu bauen.

Für eine **vorläufig starke Zuordnung** müssen zusätzlich zu einer positiven Matchentscheidung ein explizites Filmjahr aus dem Videotitel und eine TMDB-Laufzeitdifferenz von höchstens 15 Minuten vorliegen. Unbekannte Jahre, unklare Titel und Konflikte gehen in den Prüf-/Review-Pfad. Mehrfache YouTube-IDs mit derselben TMDB-ID werden als **potenzielle Quellen-Dubletten** protokolliert. Eine belastbare **Überschneidung mit dem Live-MovieHub-Katalog** ist hier noch nicht geprüft und wird nicht aus dem leeren `public/catalog.json`-Fallback abgeleitet.

**Betriebsgrenzen:** max. 200 YouTube-Videos, 90 YouTube- und 420 TMDB-Requests, ausschließlich öffentliches Research-Reporting, beide Schlüssel geschützt, keine Produktiv-/Firebase-Schreibzugriffe. **Ausführung und Ergebnisanalyse ausstehend**; TMDB-Treffer sind weiterhin kein Nachweis einer legalen, kostenlosen oder aus Deutschland auf Fire TV abspielbaren Quelle. [Detaillierte Methodik](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-fortsetzung--youtube-zu-tmdb-matchingpilot-vorbereitet-16102026).

### Historischer Plan vor dem erfolgreichen 200er-Run

### G1-Folgepilot – vollständiges Quelleninventar, 200-Videos-Stichprobe und internes Ranking

**Neu vorbereitet, noch nicht durchgeführt:** manuell startbarer **schreibgeschützter** Workflow `YouTube G1 Inventory Pilot (200)`. Er inventarisiert die vorhandenen CiNENET-/Netzkino-Playlist-IDs seitenweise und bildet daraus bis zu 200 eindeutig bestimmte Video-IDs mit **zeitlich verteilter Netzkino-Stichprobe** statt bloß der neuesten Uploads. `videos.list` ergänzt Laufzeit, Regionssignale und `statistics.viewCount`; ein transparentes Ranking gilt **nur innerhalb der untersuchten Stichprobe**. Filter trennt Shorts/Clips, mittellange und lange Videos. [Reproduzierbare Methodik und technische Gates](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-vertiefung--größere-zeitlich-verteilte-stichprobe-in-vorbereitung-16102026).

**Grenzen:** maximal 70 Seiten je Playlist, 90 API-Aufrufe, 200 Videos; bei unvollständigen Quellen oder Fehlern Abbruch. Keine Google-Suche zur vermeintlichen Komplettinventarisierung, keine TMDB-Matches, keine automatische Bestätigung von Vollfilm/DE-/Gratisangebot, kein Cloud-/Produktivimport. Echte Zahlen erst nach manuellem Lauf; spätere TMDB-Zuordnung und Geräteproben gesondert.

### G1-Messergebnis vom 16.10.2026 – erste echte Quellenprobe erfolgreich

**Beleg:** [GitHub Actions Run #38874604617](https://github.com/matthias-ennen/movie-hub/actions/runs/38874604617); **auslesbarer Bericht** in Job-Logs und temporärem Artefakt. [Detaillierte Quantifizierung, Filterbefunde und offene Gates](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1--quantitativer-erstbefund-youtube-data-api-liefert-echte-filmdaten-16102026).

- **CiNENET-Themenplaylist:** 24 Gesamt-Playlist-Einträge; 12 gelesen, alle 12 Videos über `videos.list` aufgelöst.
- **Netzkino-Upload-Playlist:** 2.766 Playlist-Einträge laut API; 12 gelesen, alle 12 Videos aufgelöst. **Uploadliste ist kein Nachweis von 2.766 vollständigen Filmen!**
- **Gesamtprobe:** **24/24 eindeutige Videos mit Detailmetadaten**; **22** mit `DE` in der `allowed`-Liste, **2** ohne ausdrückliches DE-Signal, **0** ausdrücklich als für DE blockiert gemeldete Videos. **1 eindeutiger Nichtfilm-Short (32 Sekunden)** in Netzkino-Uploads.
- **Technik/Betrieb:** 6 erfolgreiche, rein lesende YouTube-API-Aufrufe. Workload Identity, Secret Manager, YouTube API, GitHub-Bericht/Artefakt erfolgreich. Kein Live-Import, keine Änderung am produktiven MovieHub.
- **Noch nicht abgeleitet:** rechtlich belegte Vollfilme, tatsächliche kostenlose DE-Wiedergabe, eindeutige TMDB-Matches, Überschneidungen mit bestehendem Netzkino-Katalog, Fire-TV-Playback.
- **Nächste Untersuchung:** systematischer, nichtproduktiver **100–200-Videos-G1-Datenpilot** mit Pagination, Vorfilter für Trailer/Shorts, konservativer TMDB-Zuordnung und separaten Gerätetests. Weitere Code-/Infrastrukturschritte getrennt bewerten und freigeben, keine automatische Produktivsetzung.

**Status:** G0 erfolgreich, **G1 erste technische Datenprobe nachgewiesen**, erweiterte G1-Analyse noch offen; **G2–G4 nicht beauftragt**.

### Historischer Zwischenstand vor dem erfolgreichen G1-Lauf

### G1-Fortsetzung vom 16.10.2026 – Zugangsgate statt erfundener Datenprobe

**Verschobener Testschritt:** Der vereinbarte reale YouTube-Datenpilot wurde begonnen, konnte aber **noch keinen authentifizierten YouTube-API-Datenabruf** durchführen: In der aktuellen Werkzeugverbindung steht kein verwendbarer YouTube-API-Key und kein Zugriff auf Google-Cloud-API-Aktivierung/Secret Manager zur Verfügung. Daraus folgt **nicht**, dass im Google-Projekt noch kein Key existiert; dieser Zustand ist bislang **unbestätigt**.

**Neue konkrete Primärquellen-Evidenz:** UCM.ONE verlinkt selbst die CiNENET-Deutschland-Playlist „Silvester 2025“ mit `playlistId=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`. Die ID und eine exakt definierte `channels.list → playlists.list → playlistItems.list → videos.list`-Probe stehen im [G1-Zugangsprotokoll](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-zugangsprüfung-und-konkretisierte-datenprobe--16102026). Die Zahl der heute enthaltenen Videos ist **nicht gemessen**; eine kleine Jahreswechsel-Playlist allein muss nicht die geplanten 100–200 Fälle liefern. Bei gültigem Zugang andere offiziell kuratierte Kanalplaylists/Uploads ergänzen; kein Scraping.

**Entscheidungsgrenze:** Nichtproduktiver Abruf kann nach geklärtem Projektzugang starten. Kein Code/Secret/Cloud-Deploy in dieser Fortsetzung; #388 bleibt offen, G1-API-Datensample weiterhin ausstehend.

### G0-Nachtrag vom 16.10.2026 – vertiefte YouTube-API-Recherche

**Dokumentiert:** [YouTube Data API – Methoden, Feldmatrix, aktuelle Quotas, Rechte-/Caching-Regeln, Quellenkandidaten und G1-Pilotvorschlag](_work/YOUTUBE_API_RESEARCH_2026-10-16.md).

- **G0 abgeschlossen als Recherche**, **G1 noch nicht ausgeführt**: keine Live-API-Antworten, keine echten Videozahlen oder Geräteergebnisse vorgetäuscht.
- **Kontingentstand 15.10.2026:** YouTube hat die offizielle Quota-Tabelle aktualisiert. `search.list` jetzt eigener Tages-Bucket **100 Aufrufe**, **1 Einheit je Suche**; übrige `playlistItems.list`, `videos.list` etc. jeweils 1 Einheit und typischer Gesamt-Bucket 10.000 Einheiten/Tag. Der 200-Video-Playlist-Pilot läge rechnerisch bei 8 List-Aufrufen vor Zusatzabfragen.
- **Quellenempfehlung:** zuerst der deutsche Publisher **CiNENET Deutschland / UCM.ONE** (laut Betreiber lizenzierte AVOD-Filme), **Netzkino / PLAION** als Kontrollkanal. Offizielle DE-Primetime-Angebote sind vorhanden, aber der vollständige deutsche FREE/ADS-Katalog ist **nicht** als offene Data-API-Liste nachgewiesen.
- **Wichtiges Compliance-Gate:** Fremd-API-Metadaten regelmäßig aktualisieren (30-Tage-Grenze gemäß API-Policies), YouTube-Quelle sichtbar lassen, keine Videoextraktion, kein Scraping, keine Abkürzung von Geo-/Wiedergaberegeln.
- **Nächster konkreter Schritt:** Nach API-/Quellenfreigabe begrenzter **nichtproduktiver** G1-Datenabruf, danach Bericht mit echten Treffer-, Matching-, Rechte- und Wiedergabezahlen; erst dann eine Implementierungsentscheidung.

### 4.1 Bestätigter Einstieg

- YouTube bietet laut offizieller Hilfe **kostenlose werbeunterstützte Primetime-Filme in Deutschland**; der Nutzerkatalog ist unter `youtube.com/movies` sichtbar. Das allein belegt **keinen** öffentlich dokumentierten vollständigen Datenfeed für exakt diese `FREE/ADS`-Teilmenge.
- `playlistItems.list` der offiziellen YouTube Data API kann eine **bekannte öffentliche Playlist** mit maximal **50 Elementen je Seite** über `nextPageToken` lesen; laut Referenz **1 Quota-Einheit pro Aufruf**.
- `videos.list` kann bekannte Video-IDs gesammelt prüfen, ebenfalls mit **1 Quota-Einheit je Aufruf**. Metadaten: Kanal, Titel, Beschreibung, Laufzeit, Regionsblockaden/-freigaben, Privacy-/Einbettungsstatus.
- Eine öffentliche Playlist oder ein öffentliches Video ist **kein Nachweis**, dass es sich um einen legal vollständig angebotenen Kinofilm, um DE-Verfügbarkeit oder um ein kostenloses Angebot handelt. `licensedContent` allein ist ebenfalls kein eindeutiger Nutzungsrechtsnachweis.
- Die YouTube-API-Richtlinien untersagen **Scraping**. Ein vermeintlicher Katalog-Endpoint oder eine inoffizielle Player-URL wird **nicht** zur produktiven Datenquelle gemacht.

**Offizielle Referenzen:**
- [Kostenlose Primetime-Filme (YouTube-Hilfe)](https://support.google.com/youtube/answer/16618963?hl=de)
- [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [videos – Datenschema](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Pflichtfunktionen bei Wiedergabe](https://developers.google.com/youtube/terms/required-minimum-functionality)

### 4.2 Zu trennende Quellenklassen

**A. Offizieller Primetime-Filmkatalog:** hoher Produktnutzen, aber derzeit **kein verifizierter maschinenlesbarer DE-FREE/ADS-Gesamtkatalog**. Separates Zugangsgate, nicht durch Web-Scraping ersetzen.

**B. Öffentliche Playlists:** reguläre API-Pagination technisch möglich. Die Playlist ist nur ein *Kandidatenset*. Publisher-Vertrauenswürdigkeit, Rechtehinweise, DE-Verfügbarkeit, Vollfilm-Status und Matching müssen einzeln geprüft werden.

**C. Offizielle Rechteinhaber-/Filmkanäle:** potenziell geeignetere Evidenz als beliebige Nutzeruploads. Qualität und länderspezifische Rechte dennoch gesondert prüfen.

**Vorhandener Testkandidat aus #388:** eine große kuratierte kostenlose Film-Playlist (`PL30RAv-0lkxHdTcoGGgx5L6eXIHnnrEHC`); **keine durch uns bestätigte aktuelle DE-Abspielbarkeit und keine pauschale Lizenzfreigabe**.

### 4.3 Nichtproduktiver YouTube-Pilot – vorgeschlagener Prüfablauf

1. **Zugangscheck:** YouTube Data API im passenden Projekt/Konto zulässig verfügbar? API-Key nur serverseitig in Secret Manager, Quota/Conditions, Nutzungsbedingungen, Branding und Datenschutzhinweise prüfen. Kein Key nötig für die reine Konzeptphase.
2. **Kleine Stichprobe:** ca. **100–200 Videos** aus **einer** benannten öffentlichen Playlist oder geprüften Rechteinhaberquelle nur per offizieller API lesen. Keine Produktivpublikation und keine Aufnahme fragwürdiger Quellen in den öffentlichen Index.
3. **Normalisierung:** Video-ID, Playlist/Kanal, vollständiger Originaltitel, Sprache, Laufzeit, Link, Regionseinschränkung, Abrufzeitpunkt, Status, Quellengeneration. Trailer, Clips, unvollständige Filme und Dubletten früh aussondern.
4. **Konservatives TMDB-Matching:** Medientyp/Filmtitel, Jahr, Laufzeit und ggf. Originalsprache vergleichen. Eindeutige IDs übernehmen, unsichere Treffer in Reviewliste. Kein Zwangs-Match und keine neuen TMDB-Titeldubletten.
5. **Verfügbarkeit getrennt prüfen:** Zugriff aus Deutschland, tatsächlicher ganzer Film, Nachweis zulässiger Quelle, Kosten-/Werbeart. **Nur** belegte `FREE`/`ADS`-Eigenschaften publizieren; `YouTube` als Plattform allein rechtfertigt kein `FREE`.
6. **Playback-Pilot:** Route zur **exakten Video-ID** auf Android-Smartphone und realem Fire TV testen; offizielle YouTube-App/Webziel statt Direktstream-Extraktion. Vorsicht bei Einbettungs-, Alters-, Login- und Regionalbeschränkungen.
7. **Dry-run-Bericht:** Roh-Einträge, Vollfilm-Kandidaten, eindeutige Matches, uneindeutige/abgelehnte Matches, DE-verfügbare und verifizierte Angebote, funktionierende exakte Absprünge, API-Kosten, Datenalter, entfernte Videos und Fehlerraten. Keine persönlichen Daten erfassen.
8. **Go/No-Go:** Erst nach Belegen und Nutzerfreigabe begrenzte produktive Einführung unter vorhandener SourceEnvelope-/PlaybackRoute-Strecke planen. Geräteabnahme getrennt von CI und Datenprüfung.

**Offene Knackpunkte:** Wird ein belastbarer Filmkatalog mit **nachgewiesenen legalen DE-Vollfilmen** geliefert? Ist DE-Verfügbarkeit reproduzierbar überprüfbar, statt aus Metadaten abgeleitet? Reicht die Matching-Qualität? Bleiben Video-Links stabil? Werden Filmwiedergabe und native App auf Fire TV korrekt geöffnet? Wie lassen sich entfernte Filme auslaufen, ohne letzte gültige Snapshots zu verlieren?

## 5. Weitere Adapter – erste Abgrenzung (noch keine Vollanalyse)

### DVB-I – #336 / Priorität 2

**Erster externer Quellenbefund:** Die Deutsche TV-Plattform hat am **17.03.2026** das deutsche DVB-I Implementation Profile veröffentlicht; die DVB meldete am **29.05.2026** die Verabschiedung des „DVB-I Book Germany“. Dies sind **Normen-/Rahmenmeilensteine**, nicht der Nachweis eines für MovieHub zugänglichen deutschen **Produktions-Service-List-Endpunkts**. Die DVB-Deployment-Übersicht beschreibt einen deutschen Pilot und einen damals für September 2026 **angestrebten** Marktstart; das ist nicht als bestätigter tatsächlicher Start zu lesen.

**Bekannte Vorarbeit im Repo:** deutscher Service-List-/Registry-Zugang, Parser, Content Guide/EPG, Region, Bearer-/Playback-Signalisierung und SourceEnvelope-Probe als Pilot planbar. Ob ein **zugelassener stabiler deutscher Produktionszugang aktuell** verfügbar ist, ist **nicht durch diese Recherche bestätigt**. Nächster Schritt: Betreiber/Registry, Produktionsfreigabe, Nutzungsbedingungen und Beispielendpunkt ermitteln; Referenz/experimentell/Pilot/Produktion strikt trennen. Keine experimentelle Liste als Produktionswahrheit.

**Primärquellen:** [DTVP-Profil](https://www.tv-plattform.de/dvb-i-implementation-profile-veroeffentlicht/) · [DVB Book Germany](https://dvb.org/news/dvb-i-book-germany-approved-clearing-path-to-market-launch/) · [DVB-I Deployments](https://dvb-i.tv/deployments/).

### Prime Video – #391 / Priorität 3

**Bekannte Vorarbeit im Repo:** Auf Fire TV wurde für einen Referenztitel ein `app.primevideo.com/detail?gti=...`-basierter titelspezifischer Absprung getestet. Das ist ein **beobachteter Deep-Link-Test**, kein Beleg für eine offizielle allgemeine Prime-Katalog-/GTI-Schnittstelle. Die öffentlich beschriebene [Amazon Fire-TV-Launcher-Integration](https://developer.amazon.com/docs/catalog/integrate-with-launcher.html) betrifft die Integration **eigener Contentanbieter-Apps**; sie belegt **nicht**, dass MovieHub fremde Prime-GTIs offiziell in einem offenen Katalog abrufen kann. Nächster Schritt: offizielle/erlaubte Quellen für titelgenaue GTI und deutsches Angebot untersuchen; GTI getrennt von TMDB halten. Keine automatisierte GTI-Generierung aus Titeln behaupten und keine unbestätigten universellen Links veröffentlichen.

### Weitere Free-TV-/FAST-/Mediathekquellen

Erst kandidatenweise prüfen: dokumentierter Zugang, verlässliche Quellen-IDs, deutscher Katalog und Rechte, Timing/Region, direkte App-/Web-Routen, Quellenfrische, Betriebskosten. Pro Quelle eigenes Issue nach Priorisierungsentscheidung.

## 6. Abnahmegates pro Adapter (einheitlich)

- **G0 – Analyse:** API-/Quellenzugang, zulässige Nutzung, eindeutiges Produktziel, Datenfelder, bekannte Lücken dokumentiert.
- **G1 – Datenprobe:** begrenzter Dry-run, Quellendaten und Feldabdeckung gemessen, Match-Fehler dokumentiert. Noch keine produktiven Badge-/Katalogeffekte.
- **G2 – Integrationsentscheidung:** Nutzer entscheidet über konkreten Produktivumfang und akzeptiert verbleibende Risiken. Kein Automatismus nach positivem Pilot.
- **G3 – Umsetzung:** kleiner Adapter an bestehendem gemeinsamen Daten-/Playbackvertrag; dedupliziert, fehlerisoliert, Budget/Frische/Tests.
- **G4 – Veröffentlichung und Geräteabnahme:** CI/APK/Deploy technisch verifiziert; reales Smartphone/Fire-TV-Verhalten und Angebotswahrheit vom Nutzer getrennt abgenommen. Erst dann Einzelissue schließen.

## 7. Sofort nächste Arbeitsschritte

1. **#388 beginnen – nur Analyse / API-Zugang / Quellenauswahl / Prüfstichprobe vorbereiten**. Zunächst vorhandene Verträge, Import-Schnittstellen und #388-Befunde lesen; keine produktiven Änderungen.
2. Pilotfragen und Ergebnisse im **YouTube-Issue #388** fortschreiben; Querschnittsentscheidungen in **#271** und diesem Dokument.
3. Nach einem belastbaren YouTube-Dry-run **G0/G1-Bericht mit konkreten Zahlen und Go/No-Go-Vorschlag** präsentieren und vor Implementierung ausdrückliche Freigabe einholen.
4. Danach #336 und #391 in derselben Gate-Systematik analysieren; keine parallelen unfertigen Adapter-Baustellen eröffnen.

**Nicht Teil dieser Planungsrunde:** App-Code, Live-Import, Firestore-Schemaänderung, neue Secrets, API-Keys, produktiver Scheduler, bestehende Mitteilungspakete, Fire-TV-Installer #458 oder Fire-TV-Feintuning #386.
