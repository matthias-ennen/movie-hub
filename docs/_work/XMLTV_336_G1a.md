# XMLTV #336 – G1a: sichere Rohdaten-/Sender-Normalisierung

Stand: 11.11.2026. Dieser PR erweitert den grünen und bereits gemergten [G0-Quellenprobelauf #758](https://github.com/matthias-ennen/movie-hub/pull/758). **G1a enthält keine produktive Datenintegration, keine Firebase-/Nightly-Änderungen, keine TV-UI und keine Links.**

## Nutzerseitig freigegebenes Produktmodell

- **TMDB/JustWatch (FREE/FLAT/ADS/RENT/BUY):** titelbezogene **Mediathek-/VOD-Angebote**, z. B. ZDF-Mediathek.
- **XMLTV (AIR):** konkretes lineares Fernsehprogramm, z. B. ZDF am Samstag 20:15 Uhr.
- Eine zukünftige XMLTV-Ausstrahlung ist kein Beweis für ein ZDF-Mediathekangebot und umgekehrt.
- Ein Sender darf später eine eigene AIR-Anbieteraktion erhalten, aber nur mit manuell kuratierter, auf Android/Fire TV geprüfter fester `WEB_LINK + channel`- oder `APP_DEEP_LINK + channel`-Route. Ohne geprüften Link kein toter Button.
- **5 Tage** EPG sind ausreichend, **7 Tage** erwünscht, **14 Tage** optional. Im G0-Originaltest [#43083401056](https://github.com/matthias-ennen/movie-hub/actions/runs/43083401056) waren für sechs große deutsche Sender 120/120 Stunden belegt, nicht die Langzeitstabilität nachgewiesen.

## Implementiertes G1a

1. `src/sources/xmltv/xmltvTime.js`: gemeinsame zeitzonensichere XMLTV-Zeitverarbeitung für G0 und G1; gültige Kalenderdaten und explizite UTC-Offsets, einschließlich Sommer-/Winterzeitwechsel.
2. `src/sources/xmltv/xmltvCandidates.js`: SAX-Parser für ein vorher größenbegrenztes XMLTV-Dokument mit XML-DOCTYPE-Sperre und hartem Programmeintrag-Budget. Übernimmt Quellkennung, Zeitintervall, Titel (deutsche Sprache priorisiert), Untertitel, Beschreibung, Kategorien sowie `xmltv_ns`-Staffel-/Folgenangaben. Prüft fehlende UTC-Offsets und offensichtliche Fehler.
3. **Kanonische Senderzuordnung nur über eine explizite, quellgebundene Tabelle**, z. B. `stationMappings['iptv-epg-org']['ZDF.de'] = { stationId: '…', stationName: 'ZDF' }`. **Kein unscharfes Matching von Sendernamen** und keine Vermischung von ZDF mit ZDFneo. Noch **kein** produktiver vollständiger Senderkatalog: tatsächliche externe IDs und entsprechende MovieHub-Station-IDs müssen separat verifiziert werden.
4. `parseXmltvCandidates()` gibt fachliche Prüfkandidaten zurück. Diese sind absichtlich **weder** `BroadcastEvent` **noch** Medienangebote. Unbekannte Sender bleiben als `unmapped` in der Diagnose.
5. `projectConfirmedXmltvBroadcastEvent(candidate, match)` erlaubt `normalizeBroadcastEvent` nur, wenn ein bestehender kontrollierter Matcher **explizit `accepted: true`** für eine gültige TMDB-ID mit `movie|series` geliefert hat **und** der Sender zugeordnet ist. Der Normalizer erzeugt nie eigenmächtig eine TMDB-ID. `playbackRoutes` bleibt in G1a **leer**.
6. Tests in `tests/xmltv-candidates.test.js`: Senderzuordnung, korrekte deutsche Titelpräferenz, Folgenformat, UTC/DST, Dubletten, Ablehnung unklarer Werkidentität, XXE/DOCTYPE-Sperre und Record-Limits.
7. `scripts/probe-xmltv-feeds.mjs` nutzt die gemeinsame Uhrzeitfunktion statt eines zweiten abweichenden Algorithmus; die bestehenden G0-Tests werden mitgeprüft.

## Noch nicht implementiert / nächstes G1b

- Die tatsächlich beobachteten XMLTV-IDs der drei Live-Quellen mit dem bestehenden MovieHub-Waipu-/Joyn-Senderstamm **manuell überprüfen und versioniert kuratieren**. Die Diagnose-Aliasliste aus G0 ist dafür nur Kandidatenmaterial.
- Das bereits vorhandene konservative TMDB-Matching für XMLTV-Rohereignisse wiederverwenden. Der hier genutzte `accepted: true`-Parameter ist eine **Explizitfreigabe-Schnittstelle**, keine behauptete bestehende automatische Matcher-Abnahme.
- Exakte gemeinsame `BroadcastEvent`-Felder und `mergeTvAirings`-Deduplizierung regressionsprüfen, bevor Daten in den TV-Lauf gelangen.
- Quellen-/Sender-Cache, tägliche Aktualisierung, Fehler-/Frischekennzahlen und last-known-good. Separate realistische Testläufe über mehrere Tage.
- Feste Sender-Wiedergabelinks **gemeinsam mit dem Nutzer** festlegen und auf Android/Fire TV verifizieren; erst dann AIR-Badges produktiv aktivieren.

## Definition of Done für G1a

- Isolierte Unit-Tests und bestehende G0-Tests erfolgreich.
- CI grün; keine unbeabsichtigten Änderungen an App, Nightly, Firebase, TMDB-Anbieterlisten oder SourceEnvelope-Contract.
- Dieser reine interne Parser kann nach CI gemergt werden, ohne als Fertigstellung des gesamten XMLTV-Adapters oder von #336 zu gelten.
