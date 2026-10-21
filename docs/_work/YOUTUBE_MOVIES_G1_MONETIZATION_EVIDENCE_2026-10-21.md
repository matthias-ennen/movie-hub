# MovieHub / #388 – YouTube Movies G1: Angebotsarten, Quellen- und Evidenzgates

**Stand:** 21.10.2026. Research-only. Keine produktiven Badges, kein automatischer Import, keine Käufe, kein Firestore-Schreiben, keine Freigabe von G2–G4.

## 1. Ausgangslage nach erfolgreich gemeldetem Fire-TV-Gerätetest

Der Nutzer hat bereits alle **drei** von ihm zuvor auf Android bestätigten externen Film-Links erneut für den ausdrücklich erfragten Fire-TV-Test mit **„Passt auch“** bestätigt. Der vorherige Testauftrag war, die gleichen Links **aus MovieHub heraus** über die YouTube-App auf Fire TV zu öffnen und die korrekte Filmseite zu erreichen. Deshalb G1-Evidenzstatus: **3/3 Links auf Android und 3/3 Links auf Fire TV positiv nach Nutzerbericht**, getrennt nach Geräteplattform. Keine unabhängigen App-/Intent-Logs; Betrieb an anderem Modell/anderem Konto und tatsächliche Filmwiedergabe nicht bestätigt.

| TMDB Film-ID | Film | Filmgenaue HTTPS-Watch-URL | Android externer Link | Fire TV über MovieHub | Tatsächliche Film-Shop-Angebote DE |
| --- | --- | --- | --- | --- | --- |
| `movie:9479` | Nightmare Before Christmas | https://www.youtube.com/watch?v=nJf67zNZhoc | Nutzer bestätigt YouTube-App + richtigen Film | Nutzer bestätigt funktioniert; keine Geräte-Logs | `unknown` |
| `movie:238` | Der Pate | https://www.youtube.com/watch?v=xcCsnx-GRkA | Nutzer bestätigt YouTube-App + richtigen Film | Nutzer bestätigt funktioniert; keine Geräte-Logs | `unknown` |
| `movie:872585` | Oppenheimer | https://www.youtube.com/watch?v=_1WjM7ucekc | Nutzer bestätigt YouTube-App + richtigen Film | Nutzer bestätigt funktioniert; keine Geräte-Logs | `unknown` |

**Separat offen:** Konto-Entitlement, echte Wiedergabe, Lizenzierung des Angebots, Gratis/ADS/Flatrate/Leihe/Kauf, angezeigter Preis, Aktualisierungszeit und Rechtefreigabe für die automatisierte Weiterverwendung. Ein positiver Deep-Link darf keine Angebotsart implizieren.

## 2. Externe Primärquellen und was sie tatsächlich belegen

- [YouTube Data API videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos): Titel, Kanal, RegionRestriction, Laufzeit usw. **Keine dokumentierten öffentlichen Einzelpreis-, Rent-, Buy- oder Primetime-Entitlement-Felder.** Ein DE-Allowed-Signal bestätigt nur einen technischen Regionsindikator.
- [YouTube Data API search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list): `videoType=movie`, `regionCode=DE`; **Kandidatenfindung, kein vollständiger deutscher Filme-Shop und keine preisgebundene Angebotsklassifizierung.** Aktuelles [Quota-Modell](https://developers.google.com/youtube/v3/determine_quota_cost): eigenes Standardkontingent von 100 `search.list`-Anfragen pro Tag; **nicht unbegrenzt suchen**.
- [TMDB Movie Watch Providers](https://developer.themoviedb.org/reference/movie-watch-providers): region- und anbieterspezifische Streaming-/Leih-/Kauf-Hinweise aus JustWatch-Partnerschaft, **keine vollständigen Filmlinks**, und ausdrücklich **„JustWatch Attribution Required“**. Vor produktiver Nutzung dieser Daten sicherstellen, dass MovieHub die verlangte Quellenangabe korrekt sichtbar führt.
- [TMDB Discover Movie](https://developer.themoviedb.org/reference/discover-movie): `with_watch_providers` und `with_watch_monetization_types`; die echten G1-Läufe fanden 20/20 Fehl-Paarungen, die bei einem **anderen** Anbieter denselben Angebots-Typ aufwiesen. Darum **niemals** Discover als garantierte Paarung YouTube+Angebotsart interpretieren.
- [Offizielle YouTube-Hilfe: Filme kaufen/leihen](https://support.google.com/youtube/answer/9674101?hl=de): Deutschland unterstützt Rent/Buy; Titel können sich regional/zeitlich ändern; zusätzlich gibt es separat gebuchte Primetime-Kanäle. [Primetime-Kanäle](https://support.google.com/youtube/answer/12770587?hl=de-BI) sind **separate Abos und nicht gleichbedeutend mit YouTube Premium**.
- [Google Movies & TV Partner-Hilfe](https://support.google.com/moviestvpartners/answer/9311527?hl=de): bestätigtes Filmseitenformat `https://www.youtube.com/watch?v=<echte Video-ID>`; die tatsächliche ID kommt aus dem VOD-Partnerkontext. Die Partnerseite ist **kein belegter öffentlicher TMDB→YouTube-Storefront-Feed**.

## 3. Strikt getrennte Evidenzachsen in MovieHub

**A. Filmidentität:** TMDB-Medientyp und ID, Titel, Jahr/Fassung, echte elfstellige YouTube-ID, Filmumfang, verifizierter Provenienz-/Kanalhinweis. Ein Suchtreffer mit ähnlichem Titel ist `candidate`, noch kein sicherer Werk-Match.

**B. Abspielroute:** `route.type=youtubeWatch`, echte Video-ID, kanonische HTTPS-Watch-URL, Quelle, `androidExternalTest=user-confirmed`, `fireTvMovieHubTest=user-confirmed`, letzter Checkzeitpunkt. Route-Erfolg sagt **nichts** über Preis-/Lizenztarif aus.

**C. Angebot pro Region und Anbieter:** `country=DE`, `providerId`, `offerType` (`free|ads|flatrate|rent|buy|unknown`), optional `price` plus `currency` und Qualität/Fassung, `sourceType`, `observedAt`, `confidence`, `expiry`. Leihe und Kauf können gleichzeitig gelten; nicht in einen einzelnen Typ zwängen. Ein filmgenauer YouTube-Link ohne bestätigte Angebotsart behält `unknown`.

**D. Abozuordnung:** Ein `flatrate`-Hinweis darf niemals aus dem bloßen Vorhandensein von `YouTube Premium` hergeleitet werden; bei **Primetime** den konkreten Abo-Kanal separat identifizieren. Publisher-Vollfilme (CiNENET/Netzkino/DEFA) wiederum separat vom offiziellen YouTube-Movies-TVoD-Shop führen.

## 4. G1-Entscheidungsregeln für Angebot und Badge

| Beobachtung / Datenquelle | Mögliche G1-Aussage | In MovieHub produktiv als kostenlos / inklusive / R&B freigeben? |
| --- | --- | --- |
| YouTube-App öffnet richtige Filmseite | Filmgenauer Link funktioniert auf getesteter Plattform | **Nein** – Route separat, Angebot unbekannt |
| YouTube API: Laufzeit + DE-Allowed | Video-Metadaten und technischer Regionsindikator | **Nein** |
| TMDB Discover: YouTube und `free` / `ads` / `rent` / `buy` als Filter | Kandidat zur Einzelprüfung | **Nein** |
| TMDB Watch Details: **genau** YouTube-Provider-ID + konkreter Angebotstyp für DE | Externe anbieterspezifische JustWatch/TMDB-Indikation | **Nur nach existierenden MovieHub-Regeln, Attribution- und Datenqualitätscheck**; kein Beweis für aktuelle YouTube-Shopseite oder Preis |
| Direkt auf der richtigen DE-YouTube-Filmseite sichtbarer `Ausleihen`-/`Kaufen`-Button | Manuell beobachteter Shop-Angebotstyp zu einem Zeitpunkt und Konto | G1-**bestätigter UI-Befund**, aber erst nach Daten-/Rechte-/Aktualisierungsfreigabe produktiv |
| Sichtbar kostenlos abspielbarer kompletter Film (rechtmäßiger Anbieter) | Beobachtete Gratis-/Werbe-Situation je Account und Gerät | `free` vs. `ads` **nicht** ohne klare UI-/Playback-Evidenz verwechseln |
| YouTube Premium vorhanden / YouTube-Primetime-Titel sichtbar | Unklar, welcher Abozugang den Film umfasst | **Nein** ohne konkret identifizierten Primetime-Kanal und Berechtigung |

**Badge-Sicherheitsregel:** Keine `free`, `ads`, `flat` oder `R&B`-Zusätze aus einer bloßen Film-ID, einer erfolgreichen App-Öffnung oder einer ungepaarten Discover-Abfrage erzeugen. Vor einer produktiven Änderung die vorhandene zentralisierte Badge-Architektur (Poster-Top-3 = Detailseite Reihenfolge; einheitliche Anbieter-ID) und vorhandenes TMDB-/JustWatch-Attributionsdesign prüfen. Keine unbestätigte Shop-URL als „inklusive“ vermarkten.

## 5. G1-Abnahmeinventar und konkrete nächste Prüfung

**Sofort nutzbarer Dreier-Kontrollsatz:** Die drei obigen real bestätigten Filmrouten in der **deutschen YouTube-App** noch einmal **ohne Kauf** öffnen und nur die direkt sichtbaren **Angebotsbuttons** erfassen: `Ausleihen`, `Kaufen`, `Kostenlos ansehen`, `Mit Werbung`, `Abonnieren <Kanal>` oder `nicht verfügbar`; wenn ein Preis direkt sichtbar ist, Währung/Betrag und Qualitätsstufe notieren. Nicht einen Kaufprozess abschließen, kein Konto auslesen, keine geschützten Seiten automatisiert scrapen. Bis dahin bleiben alle drei `offerType=unknown`.

**Danach repräsentativerer G1-Probenplan:** 40–60 *eindeutige* und unabhängig überprüfte Filme aus deutschen YouTube-Movies-Shop-Seiten und seriösen offiziellen Publisher-Vollfilmen, bewusst auf Rent/Buy, nachweisbar kostenlose bzw. werbefinanzierte Vollfilme und – nur wenn tatsächlich nachgewiesen – Primetime-Abo-Titel verteilen. **Keine Quote künstlich erzwingen**, wenn ein Segment in DE nicht belegt ist; negativ/unklar explizit berichten. Gleiches Werk in mehreren Varianten separat kennzeichnen, nicht als unabhängigen Stichprobenfilm doppelt zählen.

**Technisch anschließbarer Pfad (noch nicht freigegeben):** TMDB-Film-ID → Kandidatenliste via TMDB-Watch-Details/YouTube `videoType=movie` → strenger Werk-/Kanal-/Fassungsabgleich → eine oder mehrere provenance-stamped YouTube-Watch-IDs → **separater, ggf. unbekannter** DE-Angebotsstatus → bestehender nativer YouTube-Launcher. Bei fehlender ID ausschließlich bestehender Such-Fallback, niemals generierte Film-ID. Rechtmäßig nutzbarer dauerhafter VOD-Katalog-/Entitlement-Feed weiterhin **nicht identifiziert**.

**G1→G2-Grenze:** Entscheiden erst nach ausreichendem Treffer-/Fehlmatch-Bericht, Rechte-/Attributionsprüfung, echter Geräteabnahme und nachvollziehbarer Datenaktualisierung, welche *isolierten* Integrationsbausteine produktiv umgesetzt werden dürfen. Ohne belegten Monetarisierungsfeed wäre eventuell ein eingeschränkter **Link-Only-Modus ohne Angebotsversprechen** denkbar, aber das ist ein **gesondert freizugebendes G2-Produktfeature**, nicht automatisch aus diesem Test entstanden.

## 6. Bereits vorhandene JustWatch-Attribution im MovieHub-Bestandscode geprüft

Bei einer read-only-Codeinspektion von [`src/components/AboutView.jsx`](../../src/components/AboutView.jsx) auf `main` war die JustWatch-Attribution **bereits explizit vorhanden**: eine sichtbare Listenzeile `JustWatch` mit Streaming-Verfügbarkeitsdaten aus TMDB sowie der englische Satz `Watch-provider availability is powered by JustWatch via TMDB.`. Auch die TMDB-Nutzung und Nicht-Zertifizierung wird dort erwähnt. Die pauschale Behauptung, MovieHub verfüge **überhaupt nicht** über diese Quellenangabe, wäre falsch.

**Offen bleibt nur eine engere Fachprüfung:** Ob die vorhandene Position und Darstellung dieser Attribution sämtliche anwendbaren TMDB-/JustWatch-Nutzungsbedingungen für jede konkrete Präsentationsfläche erfüllt, wurde rechtlich nicht geprüft; vor G2 keine neue Quellennutzung ohne Prüfung. Diese G1-Erkenntnis verlangt **keinen** sofortigen produktiven Eingriff.

## 7. Fokussierter G1-TMDB-Detailabgleich für 3 bereits geprüfte YouTube-Filmseiten

**Live-Datenstand zuvor:** Der frühere [TMDB-G1-Provider-Audit #39566078265](https://github.com/matthias-ennen/movie-hub/actions/runs/39566078265) zeigte in seiner gezielten Stichprobe, dass `movie:238` Der Pate für **TMDB-provider 192 YouTube** `rent` und `buy` zugeordnet war, jedoch `free` bei einem anderen Dienst (Arte) lag; `movie:872585` Oppenheimer war bei **TMDB-provider 192 YouTube** nur unter `buy` gelistet, `ads` lag bei Joyn. Dies sind **historische TMDB-interne Vorbefunde, keine aktuellen YouTube-Shop-Anzeigen**. Für `movie:9479` Nightmare Before Christmas ist aus diesen Filter-Audit-Beispielen kein gleichwertiger Anbieter-/Tarifbeleg abzuleiten.

**Neue, eng begrenzte Forschungsprüfung:** [PR #490](https://github.com/matthias-ennen/movie-hub/pull/490), nach korrigiertem Mock-Endpunkt erfolgreich durch [CI #39577427122](https://github.com/matthias-ennen/movie-hub/actions/runs/39577427122) (**188 Testdateien, 1.219 Tests**) und [Android APK #39577427082](https://github.com/matthias-ennen/movie-hub/actions/runs/39577427082); geprüft und via Squash `080be18439ed63823e131561fff43a2ff3486ae1` mit `[skip ci]` in `main` integriert. Genau vier isolierte Forschungsdateien, nachgelesen: `scripts/youtube-movies-three-offers-g1.mjs`, `scripts/youtube-movies-three-offers-g1.check.mjs`, `tests/youtube-movies-three-offers-g1.test.js` und `.github/workflows/youtube-movies-three-offers-g1.yml`.

**Was das Werkzeug exakt tut:** 1× `/watch/providers/movie`-Anbieterverzeichnis für DE; je 1× `/movie/9479/watch/providers`, `/movie/238/watch/providers`, `/movie/872585/watch/providers`. Es bindet die fünf TMDB-Monetarisierungsklassen strikt an **die genaue Provider-ID** und dokumentiert YouTube, YouTube Free, YouTube Premium, Google Play Movies und Google TV **getrennt**. Andere Dienstangebote nur in einer eigenen Kontrollspalte. Fehlt ein DE-Detaildatensatz, ist das `unknown` und **kein** Beweis gegen echte YouTube-Shop-Verfügbarkeit. Daten enthalten keine echten YouTube-Filmseitenpreise oder individuellen Berechtigungen.

**Sicherheit:** Nur manueller [YouTube Movies G1 Three Film Offers (Read-only)](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-three-offers-g1.yml)-Workflow auf `main`, max. **4** TMDB-Anfragen, bestehendes geheimes `TMDB_API_READ_TOKEN` nicht ausgeben, temporäres 14-Tage-Artefakt. Keine Firebase-/Firestore-/Badge-/Katalog-/APK-Produktivänderung. **Ein echter Lauf dieses neu angelegten Workflows hat zum Zeitpunkt dieses Dokuments noch nicht stattgefunden**; CI-Grün allein ist kein Live-Datenbericht.

**Noch offener Entscheidungsweg:** Den manuellen Bericht einmal ausführen, nach tatsächlichem Artefakt nachprüfen, historische TMDB-Vorbefunde gegen aktuelle DE-Provider-Details vergleichen und weiterhin erst im echten YouTube-Shop am Gerät `Leihen`, `Kaufen`, `Kostenlos`, `Mit Werbung`, konkrete Primetime-Kanäle und sichtbare Preise bestätigen. Bis dahin behalten die drei Filme `offerType=unknown` auf Ebene **YouTube-Shop direkt beobachtet**; keine voreilige Produktiv-Integration. Erst danach 40–60 belegte unabhängige Werke verschiedener Angebotsklassen als G1-Stichprobe.
