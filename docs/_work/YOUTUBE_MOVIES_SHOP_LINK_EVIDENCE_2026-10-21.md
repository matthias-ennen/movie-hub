# G1 – Offizielle YouTube-Movies-Filmseiten und Deep-Link-Evidenz

**Stand: 21.10.2026.** Research-only, Unterauftrag [#388](https://github.com/matthias-ennen/movie-hub/issues/388) in [#271](https://github.com/matthias-ennen/movie-hub/issues/271). **Keine produktive Umsetzung oder G2-Freigabe.**

## A. Aktuelles TMDB-Filter-Gate abgeschlossen (Datenlauf, nicht Produktfreigabe)

**Live-G1-Lauf:** [GitHub Actions #39566078265](https://github.com/matthias-ennen/movie-hub/actions/runs/39566078265), 21.10.2026 08:00 UTC, SUCCESS; [originäres Reportartefakt #12329747051](https://github.com/matthias-ennen/movie-hub/actions/runs/39566078265/artifacts/12329747051), tatsächlich gelesen.

- **30/48** read-only TMDB-Anfragen, 3 deutsche YouTube-Provider (192 YouTube, 235 YouTube Free, 188 YouTube Premium), 15 Discover-Kombinationen, **14 unterschiedliche Filmdetails**, **28 Provider+Angebotstyp-Vergleiche**.
- **8** der 28 Kombinationen stimmten zwischen `discover/movie` und `movie/{id}/watch/providers` (DE) überein. **20** wichen beim konkret abgefragten Anbieter/Typ ab.
- **Alle 20/20** Abweichungen hatten **genau die gesuchte Angebotsart bei einem anderen Anbieter im DE-Detaildatensatz**. **0** Fälle ohne dieselbe Angebotsart irgendwo in den deutschen Detaildaten. Beispiel: `movie:238` „Der Pate“ `free` bei Arte (234), aber bei YouTube (192) nur `rent/buy`. `movie:872585` „Oppenheimer“ `ads` bei Joyn (304), aber YouTube (192) nur `buy`.
- **Fachliche Schlussfolgerung**: Auf diesem gezielten, *nicht repräsentativen* ersten-Treffer-Sample spricht das Muster stark dafür, dass die TMDB-Discover-Filter Anbieter und Monetarisierung unabhängig erfüllen können. Der interne Suchalgorithmus ist **nicht bewiesen**. Nicht pauschal eine „71%-Katalog-Fehlerquote“ ableiten. Discover nur für **Kandidaten**, nie als Beleg für den preisgebundenen YouTube-Angebotstyp. Je TMDB-ID die deutschen Detailangebote auf `provider_id + offerType` auswerten; das ist TMDB-interne Evidenz, **noch keine offizielle YouTube-Shop-Preis-/Gerätefreigabe**.

**Prüfung weiterer Filtersemantik abschließen und auf YouTube-Shop umschwenken**. Kein weiterer TMDB-Filter-PR ohne neue Fragestellung.

## B. Offizielle YouTube-Movies-URL-Semantik erstmals belegt

Google erklärt in der [offiziellen Movies & TV Partner-Hilfe „Titel auf unseren Plattformen“](https://support.google.com/moviestvpartners/answer/9311527?hl=de) für **Legacy und Next Gen** auf **Filmebene**:

`https://www.youtube.com/watch?v=<YouTube-Film-Video-ID>`

- Die konkrete Kennung wird unter **Angebote → Angebotsdetails** des **Google TV & YouTube VOD Partner Portals** aus der **YouTube-Video-ID** entnommen.
- Das Dokument beschreibt eine **11 Zeichen** lange ID (in der maschinellen DE-Übersetzung „11 Ziffern“ genannt; tatsächlich sind YouTube-IDs alphanumerisch inkl. `-` und `_`). **Keine ID aus TMDB-ID, Titel oder Angebotsart berechnen oder erfinden.**
- Bei älteren Legacy-Fällen nennt die Hilfe einen Ausnahmeweg aus der Playstore-Storefront-Kennung, wenn die YouTube-Storefront-ID fehlt. **Nicht** frei beliebige Google-Play-IDs umformen.
- Google empfiehlt bei **Google-TV-TVoD-Deep-Links** die **vollständige vom Partnerportal ausgegebene URL** zu übernehmen und warnt vor synthetisch konstruierten Google-TV-Links. Ein Google-TV-Deep-Link ist **nicht** dasselbe wie die belegte YouTube-Watch-URL.
- Dieses Partnerportal ist **kein nachgewiesener allgemein öffentlicher Katalog-/API-Feed**. Zugang und Nutzungsrechte sind offen. Die sichtbare YouTube-Filmseite eines Titels beweist weder aktuellen DE-Preis noch entitlementbezogene Wiedergabe.

Googles [YouTube-Hilfe zu Käufen und Leihen](https://support.google.com/youtube/answer/9674101?hl=de) bestätigt Rent/Buy in Deutschland. Die [YouTube-Hilfe zur Wiedergabe](https://support.google.com/youtube/answer/9679194?hl=de) bestätigt Zugriff auf bereits erworbene Filme in der YouTube-App u. a. auf **Fire TV**. **Ein von MovieHub gestarteter titelgenauer Fire-TV-App-Absprung ist noch nicht tatsächlich getestet.**

## C. Zwei **reale** titelgenaue YouTube-Movies-Webseiten – erste G1-Links

Diese zwei einzelnen YouTube-Suchergebnisse sind **nicht** Trailerfunde: Die tatsächlich auf YouTube liegende Seite wurde über die Suchquelle als von **„YouTube Movies“ / „YouTube Movies & TV“ (verifizierter Kanal)** veröffentlicht zurückgeliefert. Beim direkten nicht angemeldeten Web-Leseversuch blockierte bzw. versagte die Seitenextraktion. Daher nur **öffentliche Werk-/Video-ID-Evidenz**, **keine** aktuelle DE-Preis-/Shop-/Geräteabnahme.

| MovieHub / TMDB-Film | TMDB-ID | Exakte gefundene YouTube-ID | Original-YouTube-URL | Herkunft/Evidenz | Status |
| --- | ---: | --- | --- | --- | --- |
| Kedi – Von Katzen und Menschen (2016) | `movie:392011` | `-oMYcSU3oVo` | https://www.youtube.com/watch?v=-oMYcSU3oVo | YouTube Movies (verifiziert), Titel der Filmseite „Kedi: Von Katzen und Menschen“ | Konkrete Filmseite als Web-Suchfund, DE-Angebot und Fire TV offen |
| Nightmare Before Christmas (1993) | `movie:9479` | `Hw0CGCHl3V8` | https://www.youtube.com/watch?v=Hw0CGCHl3V8 | YouTube Movies & TV (verifiziert), Titel der Filmseite „Tim Burton's The Nightmare Before Christmas“ | Konkrete Filmseite als Web-Suchfund, DE-Angebot und Fire TV offen |

**Wichtig:** `movie:392011` hat im TMDB-G1-Sample die Anbieterklasse YouTube Premium `flatrate` als *TMDB-Detailangabe*; `movie:9479` hatte YouTube (192) `rent, buy` als *TMDB-Detailangabe*. Beides kann sich vom tatsächlichen deutschen YouTube-Shop unterscheiden. **Keines der beiden Labels in MovieHub veröffentlichen, bevor offizielle YouTube-Filmseite und Geräteverhalten überprüft sind.**

## D. Nächster empirischer G1-Test – keine Live-Änderung

1. **Deutschland-/Account-Sichtprüfung:** Beide konkreten YouTube-Watch-URLs in der offiziellen YouTube-App öffnen (Smartphone/Tablet), **Titel, Filmjahr/Fassung, Film-Shop-Einstufung, Preis/Kauf-/Leih-/Abodialog, Konto-Voraussetzung und Link-Verfügbarkeit** notieren. Insbesondere **Movie-Webseite vs. Trailer/Preview vs. tatsächliche Videowiedergabe** sauber unterscheiden.
2. **Fire-TV-Gate:** Dieselben URLs über einen zulässigen Link-Übergabeweg/Android-Intent und, wenn eingerichtet, gezielt über MovieHubs bestehende YouTube-Playback-Bridge prüfen. **Keine** Geräteabnahme ohne tatsächliche Ausführung. Unterschiede zwischen Webbrowser-Suche und YouTube-App-Detailziel notieren.
3. **Vergleich mit TMDB-Detailtypen:** `movie:392011` und `movie:9479` gegen echte deutsche Angebote prüfen, *ohne* `free/rent/buy/flat` aus dem Vorhandensein der Webseite zu raten. Bei Konflikt vorläufig `unknown`.
4. **Angebotsabdeckung:** Weitere offizielle YouTube-Movies-Filmseiten aus der tatsächlichen DE-Shop-UI sammeln, einschließlich kostenlos/werbeunterstützt, Miete, Kauf und nachweisbaren Kanalabos. Ziel später **40–60 eindeutige Filme**, aber nicht als schon erreicht deklarieren. Derzeit exakt **zwei** öffentliche direkte Film-URLs dokumentiert.
5. **Automationsgate:** Nach ausreichender unabhängiger Sampleabdeckung die erlaubten Wege zur automatischen YouTube-Video-ID pro TMDB-Titel bewerten: Partner-/lizenzierter Feed, dokumentierte API-Grenzen, eventuell kuratierter und belegter Quellenkatalog; **kein HTML-Scraping, keine undokumentierten internen APIs, kein unautorisierter Partnerportalzugriff**. 
6. **Abnahme:** erst G1-Zahlenbericht, dann explizite G2-Entscheidung. Keine produktiven Badges/Firestore-Schreibzugriffe/Käufe.

**Architektur:** Kanonische Identität bleibt `movie:<TMDB-ID>`; YouTube-Video-ID ist separate belegte PlaybackRoute mit Quelle, Prüfzeit, Land, Angebotsstatus und gerätespezifischer Verifikationsstufe. Fallback bei unbekannter ID weiterhin Suchroute, **nicht** erfundene `watch?v=`-URL.

## E. Öffentliche Data API vs. Film-Shop-IDs: eng begrenzter Suchtest vorbereitet (21.10.2026)

Nach Abschluss des TMDB-Discover-Diagnoseteils wurde **kein** weiterer TMDB-Test implementiert. [PR #488](https://github.com/matthias-ennen/movie-hub/pull/488) liegt nach grüner CI/APK als **isoliertes, manuelles, rein lesendes** Forschungswerkzeug auf main (Commit `b848c53d1326145fec13b7da9d14d41df3627ed1`).

**Prüffrage:** Liefert der offizielle YouTube-Endpunkt `search.list` mit `videoType=movie` bei `regionCode=DE` tatsächlich die schon dokumentierten Film-Video-IDs `-oMYcSU3oVo` und `Hw0CGCHl3V8`, die zugleich über `videos.list` in Metadaten verifiziert werden sollen? Gegenprobe mit `videoType=any`. Zusätzlich nur Freitextsuche nach Der Pate / Oppenheimer ohne bekannte Film-ID; solche Suchtreffer sind *Hinweise* und keine freigegebene Identität.

- <https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-store-id-g1.yml>: Manuell auf `main` ausführbarer Workflow, OIDC/Secret-Manager-Schlüssel, **max. 9** lesende YouTube-API-Calls (8 Suchanfragen, 1 Videodetail).
- Script `scripts/youtube-movies-store-id-g1.mjs` und isolierte Node-Tests `scripts/youtube-movies-store-id-g1.check.mjs` liegen auf main; temporärer 14-Tage-Bericht im Actions-Artefakt.
- `search.list` dokumentiert `videoType=movie` ausdrücklich, hat aber laut der API-Referenz **keine Preis-/Rent-/Buy-/DE-Entitlement-Felder**. Das Partnerportal ist weiterhin kein öffentlicher Komplettfeed. Fehlende Treffer bei nicht aktiv angebotenen Filmen sind laut Google ausdrücklich möglich.

**Status:** Diagnosecode technisch durch bestehende CI/APK validiert und nachgelesen; **neuer API-Livebericht noch offen**. Keine Android-/Fire-TV-App-Abnahme, keine produktive Film-PlaybackRoute, kein Badge, kein Katalogimport und keine Testkäufe. Die unabhängige echte DE-YouTube-Shop-Stichprobe mit 40–60 Fällen ist weiterhin G1-Arbeit.


## F. Erster echter YouTube-Data-API-ID-Test und gebündelte Filmkandidaten-Gegenprüfung (21.10.2026)

**Primärbeleg:** [GitHub Actions #39568885205](https://github.com/matthias-ennen/movie-hub/actions/runs/39568885205) (SUCCESS, 21.10.2026 08:23 UTC), [unveränderter G1-Report #12330773610](https://github.com/matthias-ennen/movie-hub/actions/runs/39568885205/artifacts/12330773610), vollständig gelesen. **8/8 search.list + 1/1 videos.list** erfolgreich, **vier TMDB-Filmfälle**, pro Film die Suchvarianten \`videoType=movie\` und \`any\`, DE/Deutsch, erste zehn Treffer, **keine Pagination**.

**Bereits vorhandene offizielle Filmseiten-IDs durch videos.list aufgelöst:**

| TMDB-Film | Frühere Filmseiten-ID | videos.list Titel/Kanal | Laufzeit | RegionRestriction Metadaten DE | Such-Recall (erste 10) |
| --- | --- | --- | --- | --- | --- |
| \`movie:392011\` Kedi | \`-oMYcSU3oVo\` | Kedi: Von Katzen und Menschen / YouTube Movies | \`PT1H19M2S\` | DE **in** Allowed-Liste | Weder \`movie\` noch \`any\` |
| \`movie:9479\` Nightmare Before Christmas | \`Hw0CGCHl3V8\` | Tim Burton's The Nightmare Before Christmas / YouTube Movies | \`PT1H16M39S\` | DE **nicht in** Allowed-Liste | Weder \`movie\` noch \`any\` |

**Weitere reine Search-Kandidaten, noch ohne eigene videos.list-Gegenprobe (keine automatischen Matches):**

| TMDB-Film | YouTube Movies \`videoType=movie\`-Suchkandidat | Status |
| --- | --- | --- |
| \`movie:9479\` Nightmare Before Christmas | \`nJf67zNZhoc\` | Nur Suchresultat; vollständiger Videos-/Regions-/Kanal-ID-Beweis offen |
| \`movie:238\` Der Pate / The Godfather | \`xcCsnx-GRkA\` | Nur Suchresultat; vollständiger Videos-/Regions-/Kanal-ID-Beweis offen |
| \`movie:872585\` Oppenheimer | \`_1WjM7ucekc\` | Nur Suchresultat; vollständiger Videos-/Regions-/Kanal-ID-Beweis offen |

Für \`Kedi\` lieferte \`videoType=movie\` innerhalb der ersten Resultate **andere** Filme (Schmidts Katze / Annemin Yarası); \`videoType=any\` führte unter anderem zu Dritten und Trailern. Wichtig: **Nichtauffindbarkeit in den ersten zehn Suchergebnissen belegt nicht, dass eine konkrete Film-ID ungültig oder außerhalb Deutschlands unverfügbar ist.** Eine YouTube-Video-ID kann je Werk/Fassung/Region variieren. Ein vorhandener Kanal- oder Laufzeitnachweis belegt **keinen** aktuellen deutschen Shop-Preis, Rent/Buy/Ads/Free, Käuferberechtigung oder tatsächlichen Fire-TV-App-Absprung.

**Gezielte technische Fortsetzung abgeschlossen:** [PR #489](https://github.com/matthias-ennen/movie-hub/pull/489), [CI SUCCESS #39569847409](https://github.com/matthias-ennen/movie-hub/actions/runs/39569847409) mit **187 bestandenen Testdateien / 1218 Tests**, [Android APK SUCCESS #39569847441](https://github.com/matthias-ennen/movie-hub/actions/runs/39569847441). Kontrollierter Research-only-Squash-Merge \`9e61132a2e7eab7034fc25a712af23df26466e8e\` mit \`[skip ci]\`; 3 Dateien auf \`main\` verifiziert.

Die bestehende **manuelle** [YouTube Movies G1 ID Discovery](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-store-id-g1.yml) führt künftig denselben **einen** \`videos.list\`-API-Abruf **nach** den acht \`search.list\`-Aufrufen aus. Er umfasst beide Referenz-IDs und maximal die ersten **drei** \`videoType=movie\`-Suchtreffer je Film (maximal 14 verschiedene Video-IDs, API-Batchlimit 50). Der neue Bericht unterscheidet Metadatenabruf, konkrete Laufzeit, Regionsausschluss und Übereinstimmung der Kanal-ID mit den älteren Filmseiten des offiziellen YouTube-Movies-Kanals. **9 API-Aufrufe unverändert**, öffentliche Metadaten und temporäre Research-Datei; kein Firestore, kein Katalog, kein Badge, keine Kauf-/Geräteaktion. Ein fehlender Datensatz bleibt ausdrücklich \`unverified\` und verursacht keinen Crash.

**Status des neuen erweiterten API-Laufs: noch NICHT gestartet.** Bestehender G1-Livebefund ist nur #39568885205. Nächste Aktion: Workflow einmal manuell auf \`main\` laufen lassen und sein neues Artefakt auswerten. Danach getrennte Sichtprüfung realer deutscher YouTube-Movies-Detailseiten auf Android und Fire TV (Titel/Fassung/Angebotsklasse/Preis/App-Ziel) **ohne** Testkauf. Erst unabhängige Nachweise erlauben ein belastbares TMDB→YouTube-Movie-ID-Mapping; G2–G4 weiterhin gesperrt.

## G. Reale videos.list-Gegenprobe 21.10.2026 – drei DE-Filmkandidaten und Geräteabnahme

**Bestätigter Forschungslauf:** [GitHub Actions #39571075075](https://github.com/matthias-ennen/movie-hub/actions/runs/39571075075), gestartet 21.10.2026 08:40 UTC, SUCCESS. [Original-Reportartefakt #12332506808](https://github.com/matthias-ennen/movie-hub/actions/runs/39571075075/artifacts/12332506808), tatsächlich aus dem ZIP gelesen. **9/9** Data-API-Anfragen (8 search.list, 1 videos.list) erfolgreich; **12/12** movie-Suchkandidaten aus dem Bericht wurden per videos.list mit Titel/Kanal/Runtime und RegionRestrictions aufgelöst. Zwei frühere Referenz-IDs wurden zusätzlich mit abgefragt. Max. 14 Video-IDs, keine Pagination. Die API-Tests sind erfolgreich, *nicht* die YouTube-DE-Shop- oder Fire-TV-Tests.

### A-/B-Kandidaten – noch KEINE produktiven PlaybackRoutes

| Film / TMDB-ID | Video-ID und kanonische Watch-URL | Laufzeit | DE-Metadatensignal | Kanal-Evidenz | G1-Stufe |
| --- | --- | --- | --- | --- | --- |
| Nightmare Before Christmas `movie:9479` | `nJf67zNZhoc` https://www.youtube.com/watch?v=nJf67zNZhoc | `PT1H16M39S` (1:16:39) | DE explizit in Allowed-Liste | API-Kanalname YouTube Movies; Kanal-ID entspricht **einer** der zwei früheren offiziellen Filmreferenzen; identische Runtime der älteren Nightmare-ID | A: sehr starker Werk-/Storefront-Kandidat, aber noch **kein** DE-Angebot/Fire-TV-Nachweis |
| Der Pate `movie:238` | `xcCsnx-GRkA` https://www.youtube.com/watch?v=xcCsnx-GRkA | `PT2H55M28S` (2:55:28) | DE explizit in Allowed-Liste | API-Kanalname YouTube Movies; Kanal-ID **nicht** unter den zwei Referenzkanälen | B: plausibler Filmseitenkandidat, Anbieteridentität/DE-Angebot/Gerät noch unabhängig prüfen |
| Oppenheimer `movie:872585` | `_1WjM7ucekc` https://www.youtube.com/watch?v=_1WjM7ucekc | `PT3H22S` (3:00:22) | DE explizit in Allowed-Liste | API-Kanalname YouTube Movies; Kanal-ID **nicht** unter den zwei Referenzkanälen | B: plausibler Filmseitenkandidat, Anbieteridentität/DE-Angebot/Gerät noch unabhängig prüfen |

**Kontrollfall:** Die alte Nightmare-ID `Hw0CGCHl3V8` zeigt im identischen Data-API-Lauf dieselbe Filmlaufzeit (1:16:39), aber DE **nicht** in Allowed-Liste. Kontroll-URL: https://www.youtube.com/watch?v=Hw0CGCHl3V8 . Die Kedi-ID `-oMYcSU3oVo` zeigt DE in Allowed-Liste und 1:19:02 Laufzeit; für Kedi fand die Titelsuche in diesem begrenzten Versuch **keine passende neue ID**. Unterschiedliche regionale Filmseitenkennungen sind daher möglich, aber die genaue YouTube-Verteilungsarchitektur wurde nicht offiziell bewiesen.

**Negativ- und Verwechslungsproben:** Unter den anderen neun movie-Suchkandidaten waren echte andere Langfilme (u. a. Hocus Pocus, Godfather Coda, Mission Impossible). Fast alle zeigen plausible Laufzeiten und DE-Regionshinweise, gehören aber **nicht** zum abgefragten TMDB-Werk. Der movie-Filter ist daher **keine** selbständige Filmzuordnungsregel. Ein YouTube-Kanalname kann grundsätzlich nachgeahmt werden; abweichende Kanal-ID ist nicht automatisch falsch, übereinstimmende Kanal-ID nicht automatisch eine Shop-/Lizenzfreigabe.

### Explizite manuelle G1-Geräteabnahme (nicht durchgeführt)

1. **Android extern:** Jeden der drei obigen neuen HTTPS-Watch-Links antippen. Notieren: startet die YouTube-App / Browser / Fehler? Kommt die **richtige Film-Detailseite** mit Laufzeit/Fassung? Ist Leihe, Kauf, Kostenlos, Mit Werbung oder Abo **tatsächlich sichtbar**? Notieren, aber **nichts kaufen**.
2. **Deutschland-Angebot:** Preis, Angebotsart, Account/Region und ggf. Hinweis „nicht verfügbar“ festhalten. Fehlen Angaben oder wird die Wiedergabe verweigert, als `unknown` beziehungsweise `blocked` dokumentieren, nicht aus den API-RegionRestrictions erfinden.
3. **Fire TV:** Dieselben exakten HTTPS-Watch-Links über einen vorhandenen kontrollierten Link-Übergabeweg auf dem Gerät auslösen. Unterscheiden: YouTube-App startet nur / öffnet **genau die Film-Detailseite** / startet sofort Playback / landet in Suchergebnissen / fällt in Browser / Fehler. Kein automatischer Erfolg ohne reale Beobachtung.
4. **MovieHub-Bridge separat:** Repository-Bestandsprüfung zeigte, dass die native Android-App eine gültige YouTube-Watch-URL über `YouTubeUrlResolver` normalisiert und bei `openProviderExact` zuerst eine `ACTION_VIEW`-Intent mit den bekannten YouTube-Paketen (`com.amazon.firetv.youtube`, `com.google.android.youtube.tv`, `com.google.android.youtube`) versucht; sonst greift die bestehende Fallbackkette. **Code-Fähigkeit ist noch kein bestätigter Gerätetest**. Kein Test durch produktiven Badge-/Katalogimport.
5. **Vergleich:** Die alte Nightmare-URL als kontrollierter DE-Negativfall getrennt betrachten. Keine Testkäufe, keine Anmeldung an Partnerportal, kein Scraping.

**Abnahmeschema je Link:** `titleMatched` / `youtubeAppOpened` / `exactDetailOpened` / `offerType` (`free|ads|rent|buy|flatrate|unknown`) / `priceEUR` (nur sichtbarer Preis) / `entitlement` (nur beobachtet) / `androidResult` / `fireTvResult` / `checkedAt` / `country=DE`. Bewertung erst nach Benutzer-/Gerätebeobachtung. Eine 40–60 Fälle umfassende ausgewogene Stichprobe sowie der rechtmäßige kontinuierliche TMDB→YouTube-Movies-ID-Feed bleiben G1-offen.

## H. Nutzer-Praxistest: drei YouTube-Movies-Watch-Links funktionieren (21.10.2026)

**Nutzerbeobachtung im laufenden MovieHub-G1-Chat:** Nach Aushändigung der drei URLs als lesbare HTTPS-Links meldete der Nutzer wörtlich: **„Haben alle funktioniert“**. Die Aufforderung zuvor bezog sich auf den *externen Linkaufruf auf Android*, nicht auf einen in MovieHub eingebauten Abspielbutton. Somit für alle drei IDs **gemeldete erfolgreiche externe Linkfunktion im Android-Testkontext**. Die Antwort präzisiert nicht, ob die native YouTube-App statt eines Browsers geöffnet wurde, ob die *exakte* Film-Detailseite zu sehen war oder welche Shopoptionen/Preise sichtbar waren. **Diese Aspekte bleiben ausdrücklich unbestätigt.**

| TMDB-Identität / Film | Geprüfter externer HTTPS-Link | Beobachtungsstatus | Offene Informationen |
| --- | --- | --- | --- |
| `movie:9479` Nightmare Before Christmas | https://www.youtube.com/watch?v=nJf67zNZhoc | Nutzer meldet funktionierenden Link | native App vs. Browser, genaue Film-Detailseite, DE-Kauf-/Leih-/Aboangebot, Fire TV |
| `movie:238` Der Pate | https://www.youtube.com/watch?v=xcCsnx-GRkA | Nutzer meldet funktionierenden Link | native App vs. Browser, genaue Film-Detailseite, DE-Kauf-/Leih-/Aboangebot, Fire TV |
| `movie:872585` Oppenheimer | https://www.youtube.com/watch?v=_1WjM7ucekc | Nutzer meldet funktionierenden Link | native App vs. Browser, genaue Film-Detailseite, DE-Kauf-/Leih-/Aboangebot, Fire TV |

**G1-Gate-Einstufung:** `externalLinkReportedWorking=true` für alle drei URLs (Nutzerbericht, Android-Testkontext); `youtubeAppOpened=unknown`, `exactDetailOpened=unknown`, `offerType=unknown`, `priceEUR=unknown`, `fireTvResult=untested`, `movieHubBridgeTest=untested`. Keinerlei tatsächliche Käufe, keine automatische Anbieterbadgevergabe, keine produktiven Firestore-Schreiboperationen. Nächster Schritt: gezielt nach der Art des geöffneten Ziels (YouTube-App vs. Browser und richtige Filmseite) fragen; danach einen echten Fire-TV-Test mit identischen IDs durchführen. Die Original-API-Metadaten und die drei Links sind oben in Abschnitt G dokumentiert.

## I. Nutzer bestätigt Android-App-Absprung und Film-Anzeige (21.10.2026)

**Nachfrage und eindeutige Rückmeldung:** Nach der vorherigen Mitteilung zu den drei Links fragte die Assistenz explizit: „Haben deine drei gerade getesteten Links die **YouTube-App direkt geöffnet und dort die Filme angezeigt**?“ Darauf antwortete der Nutzer: **„Ja passt alles bis hierhin“**. Der vorangehende externe Test bezog sich auf sein Android-Gerät. Damit liegt jetzt eine **Nutzerbestätigung** für den direkten Wechsel zur YouTube-App und die Anzeige des jeweils zugehörigen Films für **alle drei** Links vor. Es ist eine Nutzerbeobachtung, kein automatisierter Emulator-, App-Bridge- oder Geräteprotokolltest.

| TMDB-Film | Exakte extern getestete HTTPS-URL | Android-App-Absprung | Passender Film angezeigt |
| --- | --- | --- | --- |
| Nightmare Before Christmas `movie:9479` | https://www.youtube.com/watch?v=nJf67zNZhoc | vom Nutzer bestätigt | vom Nutzer bestätigt |
| Der Pate `movie:238` | https://www.youtube.com/watch?v=xcCsnx-GRkA | vom Nutzer bestätigt | vom Nutzer bestätigt |
| Oppenheimer `movie:872585` | https://www.youtube.com/watch?v=_1WjM7ucekc | vom Nutzer bestätigt | vom Nutzer bestätigt |

**Präziser Statuswechsel gegenüber Abschnitt H:** `externalLinkReportedWorking=true`, `youtubeAppOpened=user-confirmed`, `correctFilmDisplayed=user-confirmed`, Plattform `Android/external-link`. Das belegt **nicht**, dass tatsächliche Kauf-/Leih-/Gratis-/Werbe-/Abooptionen sichtbar waren, dass ein gekaufter Film abgespielt werden konnte, dass in MovieHub die Produktiv-Provider-PlaybackRoute bereits angesteuert wird oder dass Fire TV dieselben Links annimmt. Deshalb bleiben `offerType=unknown`, `priceEUR=unknown`, `entitlement=unknown`, `actualPlayback=untested`, `movieHubBridgeTest=untested`, `fireTvResult=untested`.

**Nächste G1-Abnahme:** Exakt diese drei IDs **auf Fire TV** über den nativen MovieHub-Playback-Absprung kontrollieren, getrennt dokumentieren ob YouTube-App, richtige Filmseite und ggf. Rückfall auf Suche/Browser erfolgt. Preise/Entitlements später gesondert in realer deutscher Shop-UI beobachten, ohne Testkäufe. Kein Produktions-Commit, kein Badge und keine Firestore-Katalogänderungen allein aufgrund dieser Nutzerrückmeldung.

## J. Fire-TV-Nutzerabnahme 3/3 und Fortsetzung: deutsche Shop-Angebotsarten

**Fire-TV-Rückmeldung (21.10.2026):** Unmittelbar nachdem die Assistenz ausdrücklich darum gebeten hatte, **die gleichen drei Watch-Links auf Fire TV aus MovieHub heraus** auf die korrekte Filmseite zu prüfen, antwortete der Nutzer: **„Passt auch. Bitte weit“**, anschließend „Weiter“. Die nahe Gesprächssituation belegt eine **positive Nutzerbestätigung für diesen angefragten Fire-TV-Test**. Es liegt aber weder ein automatisierter Intent-/Player-Log noch ein aufgezeichnetes Videowiedergabeprotokoll vor. Kein Kauf und keine Kontoberechtigung wurde bestätigt.

| Film / TMDB-ID | Android externer Link | Fire TV über MovieHub | YouTube-Angebotsklasse (Deutschland) |
| --- | --- | --- | --- |
| Nightmare Before Christmas / `movie:9479` | Nutzer bestätigt App + korrekten Film | Nutzer bestätigt Test positiv | `unknown` |
| Der Pate / `movie:238` | Nutzer bestätigt App + korrekten Film | Nutzer bestätigt Test positiv | `unknown` |
| Oppenheimer / `movie:872585` | Nutzer bestätigt App + korrekten Film | Nutzer bestätigt Test positiv | `unknown` |

**Bewertung:** Für diese drei Titel ist das kanonische `https://www.youtube.com/watch?v=<echte Video-ID>`-Linkformat nun sowohl im externen Android-Praxistest als auch im vom Nutzer bestätigten Fire-TV-MovieHub-Absprung positiv. Das testet den **Absprung zu Filmseiten**, nicht die eigentliche Wiedergabe des Films oder seinen aktuellen Lizenz-/Zahlungsstatus. Das Gesamt-G1-Gate bleibt offen.

**Nächster eigener G1-Prüfschwerpunkt:** Nicht weitere Link-Roundtrips, sondern die tatsächlich sichtbaren *deutschen Shop-Angebotsarten* mit Quellennachweis. Der öffentliche YouTube-Data-API-`videos.list`-Datensatz enthält keine verlässliche Rent/Buy/Free/Ads-Preis-/Berechtigungstabelle; TMDB/JustWatch hat landes-/anbieterspezifische Angebotsindikatoren ohne den filmgenauen YouTube-Deep-Link und fordert Quellenattribution. **YouTube Premium ist nicht dasselbe wie der Bezug eines einzelnen Primetime-Kanal-Abos.**

**Verbindlicher Angebots-, Badge-, Provenienz- und Quellenplan:** [YOUTUBE_MOVIES_G1_MONETIZATION_EVIDENCE_2026-10-21.md](YOUTUBE_MOVIES_G1_MONETIZATION_EVIDENCE_2026-10-21.md). Sofortige nächste Sichtprüfung: für die drei funktionierenden Filmseiten **nur die sichtbaren Buttons** in der YouTube-App notieren (Leihen/Kaufen/Kostenlos/Mit Werbung/Abo-Kanal/nicht verfügbar), ohne Kauf. Bis zur Bestätigung bleiben die Offer-Typen für alle drei `unknown`. Aus einer funktionierenden Filmseite niemals ein `free`-, `ads`-, `flat`- oder `R&B`-Badge ableiten.
