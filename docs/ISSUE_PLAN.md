# Movie Hub – Issue-Plan

Stand: 16. Oktober 2026

## Aktuelle Arbeitsliste / Übergabe vom 28.10.2026

**Operativ:** Waipu, Joyn und YouTube sind als technische V1-Adapter umgesetzt. `MovieHub Nightly Pipeline`: **00:10 Europe/Berlin**, gefolgt von einziger ChatGPT-Auswertung um **06:00**. [CI #40775805198](https://github.com/matthias-ennen/movie-hub/actions/runs/40775805198), [Android #40775805275](https://github.com/matthias-ennen/movie-hub/actions/runs/40775805275), [Push-Firebase #40775805203](https://github.com/matthias-ennen/movie-hub/actions/runs/40775805203) **success** – erster echter geplanter Lauf des neuen Gesamtwegs noch nicht belegt.

1. **[#388 YouTube](https://github.com/matthias-ennen/movie-hub/issues/388):** Code fertig; offen nur echte Nightly-Live-Abnahme (2–3 Läufe), daraus abgeleitete Matcher-Verbesserungen und ausdrückliches finales Nutzer-Okay. Automatische eindeutige Best-Effort-Film-ID-Deep-Links am YouTube-Badge seit [PR #693](https://github.com/matthias-ennen/movie-hub/pull/693); keine extra Rent-/Buy-Freigabe. Nicht vorher schließen.
2. **[#271 Quellenplattform](https://github.com/matthias-ennen/movie-hub/issues/271):** Rahmenpaket offen. Die laufende YouTube-Beobachtung **blockiert nicht mehr** die Planung des nächsten isolierten Quellenpiloten.
3. **[#336 DVB-I](https://github.com/matthias-ennen/movie-hub/issues/336):** nächster **parallel startbarer** G0-Pilot – offizieller deutscher Zugriff, Service List, EPG, Playback-Signalisierung und Go/No-Go; kein ungeprüfter Produktionsadapter. Danach [#391 Prime Video](https://github.com/matthias-ennen/movie-hub/issues/391).
4. **Verbesserungs-/Fehlerbacklog:** [#329 Waipu](https://github.com/matthias-ennen/movie-hub/issues/329) und [#481 Joyn](https://github.com/matthias-ennen/movie-hub/issues/481) bleiben bewusst offen, weitere Matcher-Tuningarbeiten nur anhand gemessener Fallgruppen. [#112 Compliance](https://github.com/matthias-ennen/movie-hub/issues/112) unabhängig.
5. **PR-Hygiene:** Alt-PRs [#521](https://github.com/matthias-ennen/movie-hub/pull/521) und [#578](https://github.com/matthias-ennen/movie-hub/pull/578) begründet geschlossen, **nicht gemergt**. Aktuelle YouTube-PRs #690–#693 sind gemergt. Offene Issues haben aktuell **keine zugeordneten GitHub-Milestones**; die vollständige eigenständige Milestone-Liste ist über den verbundenen Zugriff nicht lesbar – keine frei erfundenen Statusänderungen.

**Morgen im neuen Chat als Erstes:** [Aktuelle Adapter- und Nightly-Übergabe](ADAPTER_NIGHTLY_HANDOFF_2026-10-28.md) und echte neueste GitHub-Runs lesen. **Die Priorisierung vom 16.10. weiter unten ist nur historische Einordnung.**

## Arbeitsprinzip

Die aktive Planung enthält nur noch echte Arbeitspakete. Historische Bestandsaufnahmen werden nach Überführung ihrer Restpunkte geschlossen. Große Sammelissues werden vermieden, wenn ein klarer technischer Rest als kleineres Paket separat geführt werden kann.

## Verbindliche Priorisierung ab 16.10.2026

- **Abgeschlossen:** Gesamtpaket Mitteilungen #314 einschließlich Bewertungsissue #385 auf ausdrücklichen Wunsch von Matthias geschlossen. #380–#384 sind zuvor abgenommen und geschlossen. Neue Meldungstypen sind für später vertagt; keine erneute Abnahme der bestehenden Funktion.
- **Separat dokumentierter Fehler, nicht priorisiert:** [#482 – Android App Links für E-Mail-Erinnerungen](https://github.com/matthias-ennen/movie-hub/issues/482). Aktuelle Mail-Hauptlinks öffnen bisher die Web-Startseite statt zuverlässig die installierte MovieHub-App beziehungsweise die passende Film-/Seriendetailseite. Soll: verifizierte App Links mit sicherem Web-Fallback und titelspezifischer Navigation. Nur Analyse/Issue, keine Umsetzung oder Wiedereröffnung von #384/#314.
- **Spätere Personalisierungs-Idee, nicht priorisiert:** [#483 – Ähnliche Filme entdecken](https://github.com/matthias-ennen/movie-hub/issues/483) konkretisiert das weiterhin offene Empfehlungs-Master-Issue [#7](https://github.com/matthias-ennen/movie-hub/issues/7): Absprung aus Film-Detailseiten in eine Suchansicht ähnlicher Titel und täglich wechselnde profilbezogene Posterreihe auf Home/Filme/Serien (Favoriten, Bewertungen, Watchlist, gesehen). Nur Produktwunsch und Analyse-/Abnahmerahmen; kein neuer Code, kein Deploy, keine Verschiebung der YouTube-/Quellenpriorität.
- **Saisonale Designs/Filmwelten, nicht priorisiert:** [#484 – Theme-Audit, saisonale Overlays und kuratierte Posterreihen](https://github.com/matthias-ennen/movie-hub/issues/484). Die fünf bestehenden Presets sollen zuerst auf vollständige Token-/Layout-Abdeckung geprüft werden; später optionaler profilbezogener Saisonmodus für Halloween, Advent/Xmas, Ostern und Pfingsten mit Kalender, grafischen Akzenten und faktenbasierten saisonalen Film-/Serienreihen. Grunddesign-Automatik bleibt erhalten. Nur Konzept und späteres Prüf-/Abnahmepaket, keine Implementierung; aktive Hauptstrecke bleibt #271/#388.
- **Neue Hauptstrecke:** #271 Quellenplattform / [Adapterprogramm](ADAPTER_PROGRAM.md). Zuerst #388 **YouTube**, danach #336 **DVB-I**, danach #391 **Prime Video**. Weitere offizielle Quellen nur nach gesonderter Priorisierung.
- **Aktuelle Phase:** zulässige technische Quellen, API-/Rechtebedingungen, Datenqualität, konservatives TMDB-Matching, gemeinsame SourceEnvelope-/PlaybackRoute-Integration und reale Geräteziele analysieren. Pro Quelle klein begrenzter nichtproduktiver Datenpilot mit Bericht und Go/No-Go.
- **Klare Grenze:** Diese Planungsrunde gibt **keinen** produktiven Adapter, Codeumbau, Live-Import oder neue Secrets frei. G0/G1-Analyse vor Entscheidung; danach getrennte technische Tests, CI/Deploy und manuelle Geräteabnahme.
- **Danach:** Kosten-/Verfügbarkeitsdarstellung, Produktfinish, Compliance #112, Release 1.0. #386 und #458 bleiben eigenständige spätere/parallel planbare Pakete.

## Frühere Priorisierung bis 15.10.2026 (historische Einordnung)

## Bereinigter Status

Am 26.09.2026 wurden folgende Planungsaltlasten bereinigt:

- #225 nach bestätigter Fire-TV-Abnahme geschlossen
- #254 und #255 geschlossen; verbliebene Trailer-/Teaser-Themen nach #328 verschoben
- #260 nach vollständiger Abnahme der produktiven 228-Sender-Stufe geschlossen
- #329 für die verbleibende Waipu-Restklassifizierung angelegt
- Fire-TV-Abnahme für #312/#118 dokumentiert
- Fire-TV-Abnahme der ersten Top-100-Stufe aus #7 dokumentiert

Am 12.10.2026 zusätzlich abgeschlossen:

- #118/#381/#312 – alle vier Restpunkte mit „Ja, das ist alles abgenommen“ bestätigt; keine offene Geräteabnahme der Mitteilungs-Grundstrecke.

- #383 – aktive Beobachtungen unter Einstellungen → Mitteilungen, einschließlich Profilwechsel und geräteübergreifendem Ausschalten.
- `movie-hub-admin#11` – Übersicht mit Status/Gültigkeit, Abbrechen und kontrollierte Rücknahme; ausdrücklich mit „Ja, das nehme ich so ab. Das ist fertig.“ bestätigt.

- #382 – TV-Erinnerungskette für Film und ganze Serie; die fünf offenen Prüfpunkte ausdrücklich mit „1 bis 5 abgenommen“ bestätigt, Zeitverhalten und automatischer Abschluss zuvor bestätigt.
- #413 – persönliche Smart-Reihen aus dem vollständigen zusammengeführten Bestand; PR #414 veröffentlicht, Geräteabnahme bestätigt.
- #415 – Schauspielersuche; PR #416 veröffentlicht, Geräteabnahme bestätigt.

Matthias bestätigte den gemeinsamen Josh-Hartnett-/„30 Days of Night“-Abnahmeschritt auf Smartphone und Fire TV ausdrücklich mit „Abgenommen“. Beide Issues sind geschlossen; die Hauptstrecke #314 bleibt unverändert.

Am 13.10.2026 zusätzlich abgeschlossen:

- #387 – Einstellungen, Navigation und Stilkorrektur über #422/#424/#425;
  Matthias bestätigt den vorgelegten Stand mit „Das ist abgenommen.“.
  Technische Nachweise und Abschluss: [SETTINGS.md](SETTINGS.md).
- #426 – Detailseite einschließlich aller freigegebenen Nachbesserungen;
  Stand `6ef4f83` um 20:46 Uhr (Europe/Berlin) einschließlich Navigationsnachtrag
  ausdrücklich abgenommen und abgeschlossen; Basisabnahme um 19:05 Uhr bleibt im Verlauf.
  Nachweise und Abnahme: [DETAIL_426.md](_work/DETAIL_426.md).

## Historische Priorisierung (durch Beschluss 16.10.2026 ersetzt)

### Abgeschlossen: #426 einschließlich Navigationsnachtrag

Matthias hat Build `6ef4f83` am 13.10.2026 um 20:46 Uhr (Europe/Berlin)
mit „Ja, ist abgenommen und damit abgeschlossen“ ausdrücklich bestätigt.
Damit sind auch mitscrollende Kopfaktionen, zeilenweise D-Pad-Navigation,
vollständige Scrollgrenzen, stabile Ladepositionen und Favoritenfarben abgenommen.
Für dieses Arbeitspaket bleibt keine Abnahme offen. Basisabnahme und Verlauf
bleiben erhalten; #328/#391 gehören nicht zu diesem Umfang.

1.054 Anwendungstests, Browser-Komponentenprüfung in sechs Bildschirmformaten,
CI, Android-Build und Veröffentlichung sind nachgewiesen.
Abnahme und Nachweise: [Detailpaket](_work/DETAIL_426.md).
Aktuelles Paket ist **#384 – Auch per E-Mail je Profil**; erster echter Mail-Empfang bestätigt.

### 1. #314 – Mitteilungs-Erweiterungen

Das Grundpaket #118/#312/#380/#381/#382/#383 einschließlich
`movie-hub-admin#11` ist vollständig abgenommen und abgeschlossen.

1. **#384:** implementiert und im begrenzten Resend-Test. Erste TV-Mail empfangen,
   Gestaltung positiv bestätigt. Die zweite TV-Mail, Inklusivmail, Abmeldung,
   weitere Profiladressen und Gesamtfreigabe stehen aus. Domain registriert;
   Resend/DNS und dauerhaften Absender als Nächstes einrichten. Kein erneutes
   Infrastruktur-Bootstrap. [Übergabe für den nächsten Chat](_work/EMAIL_384.md).
2. **#385:** weitere Anlässe anschließend einzeln priorisieren.

Abgeschlossenes Grundpaket: [TITLE_NOTIFICATIONS.md](TITLE_NOTIFICATIONS.md#tagesabschluss-12102026).
Aktuelle Mail-Fortsetzung: [EMAIL_384.md](_work/EMAIL_384.md).

### 2. Betriebsnachtrag Waipu/Joyn vom 07.10.2026

Auf ausdrücklichen Auftrag von Matthias vorgezogen; unter #271 als Ergänzung
zu den abgeschlossenen #280/#315 dokumentiert, ohne neues eigenes Issue.

- Joyn-Vollaufbau über 14 Tage und 56 Fenster erfolgreich veröffentlicht;
- dauerhafte Checkpoints und inkrementeller TMDB-Pfad;
- gespeicherter Fehlerschutz, differenzierter Bericht und fünf öffentliche Prüfpunkte;
- Restore des größeren vollständigen Joyn-Titelbestands korrigiert;
- 837 Unit-Tests, 17 Firestore-Regeltests, CI, APK und finaler Code-Deploy erfolgreich.

**Aktualisierung 12.10.2026:** Nach #411/#412 bestätigt der reguläre
[Nachtlauf 38191419867](https://github.com/matthias-ennen/movie-hub/actions/runs/38191419867)
normale Budgets, gesicherte Checkpoints, vollständigen TMDB-Verbraucherabschluss
und frische gemeinsame öffentliche Daten. Start 03:19 statt 00:17 Uhr Europe/Berlin:
182 Minuten Verzögerung, deshalb kein Nachweis pünktlicher Ausführung.
Nachweise: [DATA_WORKFLOW_RELIABILITY.md](DATA_WORKFLOW_RELIABILITY.md).
Dieser Betriebspunkt ersetzt die Produkt-Hauptstrecke #314 nicht.

### 3. #271 – Quellenplattform und weitere Adapter danach

Die erste gemeinsame Waipu-/Joyn-Stufe ist belegt; #280 ist abgeschlossen.
Weitere Quellen bleiben getrennte Recherche-/Pilotpakete, unter anderem:

- #336 – DVB-I-Pilot;
- #388 – YouTube-Playlist-/Publisher-Quellen;
- #391 – Prime-Video-GTI-Links und möglicher Adapter;
- weitere offizielle Free-TV-/FAST-Quellen nach Zugangs- und Datenvertragsprüfung.

Die Anlage eines Quellenissues priorisiert es nicht automatisch vor #314.

### 4. Verfügbarkeitsdarstellung als Produktkern

Nach den ersten zusätzlichen Adaptern ein eigenes Paket bilden für die konsistente Darstellung und Priorisierung von:

- flatrate
- free
- ads
- rent
- buy
- kommende TV-Ausstrahlung
- laufende TV-Ausstrahlung
- eigener Movie-Hub-Inhalt

Ziel: Ein Nutzer erkennt unmittelbar, ob ein Titel ohne Einzelkauf verfügbar ist oder bald kostenlos im TV läuft.

## Parallel / nicht blockierend

- #329 – Waipu-Restklassifizierung
- #386 – verbleibende Fire-TV-Navigations-Freezes; eigenes Folgepaket nach #346
- #7 – Empfehlungen/Automatisierung; Top-100-Stufe bereits abgenommen
- #328 – Trailer/Teaser-Finish
- #327 – TMDB-Kontosynchronisation, später
- #129 – Deutsch/Englisch, später
- #223 – Provisorien/Rückbau
- #8 – Ideensammlung
- #308 – Zukunftsvision

## Release 1.0

Vor öffentlicher Veröffentlichung:

- ausreichend breites und ausfallsicheres Quellenfundament
- klare Verfügbarkeitsdarstellung
- stabile Nachtläufe und Adapterzustände
- Geräteabnahmen auf Smartphone, Tablet und Fire TV
- wesentliche Provisorien bereinigt
- #112 Compliance vollständig bearbeitet bzw. extern freigegeben, wo erforderlich

## Aktuelle Abhängigkeitskette – 16.10.2026

`#314/#385 abgeschlossen → #271/#388 YouTube → #336 DVB-I → #391 Prime Video → weitere Quellen nach Prüfung → Verfügbarkeitsdarstellung/Produkt-Finish → #112 → 1.0`

#280, #315, #346, #118, #312, #380, #381, #382, #383, #387 und `movie-hub-admin#11` sind abgeschlossen. #426 ist einschließlich aller Nachträge abgenommen und abgeschlossen. Die reguläre Datenfortschreibung
ist bestätigt; Startverzögerungen bleiben unter Beobachtung. #329 bleibt Wartung. Movie Hub Admin bleibt ein getrenntes Repository;
die bereits abgenommene Rücknahme wird nicht erneut als zukünftige Arbeit geführt.
