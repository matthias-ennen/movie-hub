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

## 8. Echter G1-Dreifilm-TMDB-Detailbericht (21.10.2026, 09:41 UTC)

**Quelle (tatsächlich als Artefakt gelesen):** [Actions #39578883501](https://github.com/matthias-ennen/movie-hub/actions/runs/39578883501), 21.10.2026 **09:41 UTC** (11:41 MESZ), SUCCESS, [Reportartefakt #12336195508](https://github.com/matthias-ennen/movie-hub/actions/runs/39578883501/artifacts/12336195508). Skript meldet 4/4 ausschließlich lesende TMDB-API-Abfragen; Node-Test 5/5 erfolgreich. Enthalten waren der DE-Filmanbieterkatalog und drei separate `movie/{id}/watch/providers`-DE-Details. Dieser Run **ist real ausgeführt** (die davor stehende historische Vorbereitung in Abschnitt 7 ist daher inzwischen erledigt).

**Echtes deutsches TMDB-Detailresultat, streng nach exakter Anbieter-ID:**

| TMDB Film | Filmgenaues YouTube-Watch-Ziel (extern auf Android und Fire TV vom Nutzer positiv getestet) | YouTube TMDB-ID 192 | YouTube Free ID 235 | YouTube Premium ID 188 | Echter YouTube-Shop-Button / Preis |
| --- | --- | --- | --- | --- | --- |
| `movie:9479` Nightmare Before Christmas | https://www.youtube.com/watch?v=nJf67zNZhoc | **rent, buy** | kein DE-Detailtreffer | kein DE-Detailtreffer | **unbekannt**, nicht beobachtet |
| `movie:238` Der Pate | https://www.youtube.com/watch?v=xcCsnx-GRkA | **rent, buy** | kein DE-Detailtreffer | kein DE-Detailtreffer | **unbekannt**, nicht beobachtet |
| `movie:872585` Oppenheimer | https://www.youtube.com/watch?v=_1WjM7ucekc | **buy** | kein DE-Detailtreffer | kein DE-Detailtreffer | **unbekannt**, nicht beobachtet |

**Gegenproben belegen den Grund für getrennte Provider-IDs:** Der Pate hat laut TMDB `free` bei **Arte**, nicht YouTube. Oppenheimer hat `ads` bei **Joyn**, nicht YouTube. Nightmare hat `flatrate` bei **Disney Plus**, nicht YouTube. Diese Angebotsarten dürfen die YouTube-Badges **nicht** infizieren. Die vorigen G1-TMDB-Vorbefunde für Der Pate und Oppenheimer werden im echten aktuellen Test bestätigt, Nightmare neu korrekt mit `rent+buy` eingeordnet.

**Keine Preisauskunft, keine Lizenz- oder Abspielgarantie:** Eine positive `watch?v=...`-Route plus TMDB-Watch-Provider-Angabe sind **zwei voneinander unabhängige Quellen** und beweisen nicht, dass das spezifische YouTube-Video im aktuell angemeldeten DE-Konto tatsächlich zu diesen Konditionen angeboten wird. „Kein TMDB-Detailtreffer“ = fehlende Daten, **nicht** nachgewiesene Abwesenheit der Leistung. Bei uns bleiben aktuelle UI-/Konto-`offerType` und Preis zunächst `unknown`.

### Anschluss an bestehende MovieHub-Architektur – read-only geprüft

- In `src/services/tmdb.js` normalisiert `normalizeTmdbWatchProviders` bereits `flatrate`, `free`, `ads`, `rent`, `buy` zu `providerOffers[].offerTypes`. Die `TMDB_PROVIDER_REGISTRY` kennt den **YouTube**-Alias, aber nicht automatisch `YouTube Free` oder `YouTube Premium`; diese separaten TMDB-Anbieter werden damit nicht stillschweigend zur normalen YouTube-Angebotsklasse vermischt.
- `src/providers/providerPlaybackLaunch.js` kann eine providergebundene exakte Route verwenden; der native `YouTubeUrlResolver` und der paketgebundene Android-/Fire-TV-Launcher wurden bereits geprüft und für die drei konkreten URLs vom Nutzer praktisch bestätigt.
- `scripts/provider-catalogs.mjs` nutzt TMDB Discover nur zur Kandidatenrekrutierung und zieht individuelle `watch/providers`-Daten beim Film-Detail hinzu. Die gesonderte Discover-Katalogmitgliedschaft mit `offerTypes: ['catalog']` ist **nicht** mit echtem `rent`, `buy`, `free` oder `ads` gleichzusetzen. Vor produktiver Integration muss die vorhandene Abgrenzung der Katalog-Mitgliedschaft zu tatsächlichen Badge-OfferTypes getestet werden.

### G1-Gate nach dem Messlauf

Der nächste sinnvolle Schritt ist **nicht** noch ein ähnlicher TMDB-Test. Die vorhandenen Filmseiten werden in der echten deutschen YouTube-App (gleiches Konto wie beim Gerätetest) geöffnet und die **sichtbaren Buttons** `Ausleihen`, `Kaufen`, `Kostenlos ansehen`, `Mit Werbung`, `Primetime abonnieren`, jeweils ggf. Preis und Qualitätsvariante, ohne Kauf notiert. Für die spätere automatische Skalierung bleibt die offene Kernfrage ein nachweisbar rechtmäßiger, pflegbarer Film-ID+Angebotsfeed; ein beliebiges `search.list`-Treffer-Resultat reicht wegen Fehlzuordnungen/Regionen nicht aus.

**Gate-Status:** Android/Fire-TV-Routing für drei Filme (Nutzerbericht) ✅; exakte deutsche TMDB-Anbieter-Angebotsklassen (Report) ✅; aktuelle YouTube-Storefront-Buttons/Preise ❌; breite unabhängige 40–60-Film-Stichprobe ❌; rechtmäßiger automatischer laufender Shop-/ID-Datenpfad ❌. **G1 bleibt offen, G2–G4 nicht freigegeben, keine produktiven Badges/Firestore/Katalogänderungen.**

## 9. Echte YouTube-App-Screenshots 21.10.2026 – Oppenheimer und Der Pate

**Quelle:** Zwei vom Nutzer am 21.10.2026 um etwa 11:48 Uhr deutscher Ortszeit bereitgestellte Screenshots der **YouTube-Android-App** (Suchergebnisansicht) für `Oppenheimer` und `der pate`. Die Bilder wurden direkt visuell ausgewertet; **keine personenbezogenen Bildschirmranddaten, Nutzerbilder oder Accountinformationen** in das Repository kopiert. Dies sind visuell bestätigte reale YouTube-UI-Labels, **keine** automatisch über die öffentliche YouTube Data API auslesbaren Angebotsfelder. Die Suchergebnis-Kacheln zeigen passendes offizielles Filmposter, Filmlänge und den Absender `Filme & Shows von YouTube`; ein Klick auf den Preis-/Leihdialog wurde noch **nicht** gezeigt.

| TMDB-Film | Filmkandidat-/Link-ID bereits separat getestet | Screenshot-UI-Text | TMDB-G1-Angebote, DE | Bewertung |
| --- | --- | --- | --- | --- |
| Oppenheimer `movie:872585` | `_1WjM7ucekc` | `Kaufen oder ausleihen`; Laufzeit `3:00:22`, Drama `2023`, FSK 12 | YouTube 192: **buy**; kein `rent`-Eintrag | **Mögliche Datenabweichung**: YouTube-Button nennt Kauf/Leihe, TMDB nur Kauf. Button alleine bestätigt **nicht**, dass beide Varianten im nächsten Dialog tatsächlich buchbar sind; Preise / Verfügbarkeit / Fassung noch `unknown`. |
| Der Pate `movie:238` | `xcCsnx-GRkA` | `Als Mitglied ansehen` **und** `Kaufen oder ausleihen`; Laufzeit `2:55:28`, FSK 16; YouTube-Suchergebnis-Metadaten `Drama · 1977` | YouTube 192: **rent, buy**; YouTube Premium 188 ohne Detailtreffer | **Zusätzlicher Mitgliedschaftszugang in realer YouTube-UI**, Herkunft / konkreter Kanal / Entitlement bisher `unknown`. KEIN Beleg für YouTube Premium oder generisches `flatrate`. `1977` als UI-Metadatum weicht von originalem Erscheinungsjahr `1972` des Werkes ab; nicht automatisch an TMDB überschreiben. |

**Separate Prüfachsen und Trust-Grenzen:**

- **Screenshot-UI-Status:** Oppenheimer `offerButtonLabel=Kaufen oder ausleihen`, Der Pate `offerButtonLabels=[Als Mitglied ansehen,Kaufen oder ausleihen]`; `checkedAt=2026-10-21 ~11:48 Europe/Berlin`, `platform=Android/YouTube-App/search-results`. Kein genauer Preis oder Formatanbieter eingeblendet.
- **Interpretation „Als Mitglied ansehen“:** Google dokumentiert getrennte kostenpflichtige [YouTube-Primetime-Kanäle](https://support.google.com/youtube/answer/12770587?hl=de-BI) und [Filmkäufe/Leihen](https://support.google.com/youtube/answer/9674101?hl=de). Das allein beweist **nicht**, welche konkrete Mitgliedschaft die Filmkachel anbietet. Vor Verwendung als `flatrate` in MovieHub: Ziel des Buttons/benannter Kanal und DE-Verfügbarkeit überprüfen. YouTube Premium ist keine allgemeine Vollfilm-Flatrate.
- **Oppenheimer:** „Kaufen oder ausleihen“ ist UI-Wortlaut, aber noch keine transaktionsfähige Bestätigung der Einzeloptionen; bis zum zweiten Dialog `rentOfferConfirmed=false/unknown` statt voreiligem Ja. Screenshot und TMDB `buy` sind daher als **zu klärende Abweichung**, nicht als bewiesener TMDB-Fehler zu führen.
- **Der Pate:** `1977` ist das von YouTube sichtbare Feld, `1972` das Werkjahr; Runtime `2:55:28` passt zur Filmkandidaten-Laufzeit. Jahresabweichung als Qualitätswarnung beim TMDB-Film-Matching beibehalten, **keine** automatische falsche Neuverknüpfung anhand Jahreszahl.
- **Nightmare Before Christmas:** Vom Nutzer in dieser Nachricht kein Screenshot/Shop-Button geliefert. Zustand `offerButton=unknown`, auch wenn TMDB YouTube 192 `rent,buy` liefert.
- **Keine** Screenshots auf GitHub hochgeladen, keine Code-/Badge-/Katalog-/Firestore-/Firebase-Änderung. Screenshots zeigen YouTube-Suchergebnisse und belegen noch keinen produktiven App-internen MovieHub-Angebotsstatus.

**Kleiner nächster G1-Abnahmetest:** (1) auf Oppenheimer `Kaufen oder ausleihen` antippen und **nur** die Auswahl/Preise ansehen, nichts kaufen; (2) bei Der Pate `Als Mitglied ansehen` antippen und feststellen, **welche Mitgliedschaft bzw. welcher konkrete Kanal** genannt wird, nichts abonnieren; (3) wenn sinnvoll den Nightmare-Kauf-/Leih-Button ebenfalls im Suchergebnis abgleichen. Damit ließe sich aus der bisherigen generischen UI eine anbieter-/tarifgenaue Evidenz machen, ohne weitere API-Schleifen. Nutzerzustimmung zur Anzeige/Prüfung muss weiter von produktiver Einführung getrennt bleiben.

## 10. Fachliche Scope-Entscheidung: TMDB-Basis statt YouTube-Einzelmitgliedschaften

**Nutzerentscheidung vom 21.10.2026:** Nach Prüfung des YouTube-Buttons `Als Mitglied ansehen` mit *mehreren verschiedenen* Angeboten lautet die fachliche Vorgabe: „TMDB als Grundlage. Die nachgelagerten Adapter reichern Metadaten an und oder verbessern und oder ergänzen diese.“ Einzelne YouTube-Primetime-Kanäle, Varianten des Mitgliedschaftsdialogs und Preise sind **bewusst außerhalb des notwendigen YouTube-G1-Testumfangs**. Das zuvor in Abschnitt 9 vorgeschlagene weitere Klick- und Screenshotprogramm ist **zurückgenommen**; seine Durchführung ist kein Gate.

**Ab jetzt geltende G1-Regel für MovieHub:** TMDB ist die kanonische Film-/Serien-ID und liefert bereits DE-Watch-Provider-Angebotsarten pro **exakter TMDB-Provider-ID**. Quellenadapter dürfen eindeutig identifizierte YouTube-Filmvideo-IDs samt zielgenauen Watch-Links, region-/providergebundene Verfügbarkeit und von ihnen fachlich abgesicherte Metadaten ergänzen oder präzisieren. Sie ersetzen keinen kanonischen TMDB-Film durch ähnlichen Suchtreffer, übertragen keine Tarifart anderer Provider und erfinden bei unbekanntem Angebot kein Badge. Quellen-/Zeit-/Qualitätsmetadaten steuern eine zentrale Zusammenführung; kein blindes Überschreiben.

**Konkrete G1-Festlegung:** Die echten vier TMDB-DE-Detailanfragen aus Run #39578883501 sind als Basisevidenz ausreichend für diesen **engen Drei-Film-Angebotsprobelauf** (`movie:9479` YouTube `rent,buy`; `movie:238` `rent,buy`; `movie:872585` `buy`). Die unabhängig bestätigten YouTube-App-Links liefern die PlaybackRoute. Ein möglicher differenzierter YouTube-Mitgliedschaftsbutton bei `Der Pate` oder der generische Kauf-/Leihbutton bei `Oppenheimer` führen **nicht** zu einer Sonderlogik und werden nicht zum gesonderten Freigabeblocker. Bei bekanntem Datenkonflikt bleibt die Herkunft transparent; es werden keine nicht vorhandenen aktuellen Euro-Preise oder Konto-Berechtigungen behauptet.

**G1-Weiterarbeit:** zulässiger, hinreichend großer und werksgenauer YouTube-ID-/Link-Kandidatenpool, robuste automatische Werkzuordnung, Staleness-/Region-/Takedown-Regeln, korrektes Zusammenführen zu einer Provider-/Badge-Quelle und nachvollziehbarer Abnahmebericht. Freigabe der produktiven Integration als **G2** weiterhin separat erforderlich. Die ältere tiefere Tarifprüfliste bleibt nur als historische Forschungsnotiz lesbar.
