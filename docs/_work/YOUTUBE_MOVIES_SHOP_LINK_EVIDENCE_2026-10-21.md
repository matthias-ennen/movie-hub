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
