# MovieHub – YouTube-Adapter: G2, integrierbare Funktionen und klare Datengrenzen

**Stand: 22. Oktober 2026.** Der Nutzer hat die **technische Integration des YouTube-Adapters** beauftragt und möchte die vorbereitete **YouTube-API-Compliance-Anfrage erst später** stellen. Die einzelne MovieHub-Benutzeranmeldung ist dabei kein festgestellter Ausnahmegrund von den YouTube API Developer Policies. Wir führen daher eine **funktionale, nichtaggregierende Integration** aus und trennen die noch ungenehmigte kanalübergreifende automatische Quellenfusion strikt davon.

## Was bereits vorhanden ist und nicht neu gebaut werden muss

1. YouTube ist als TMDB-Watch-Provider `youtube` in `src/providers/providerRegistry.js` registriert. Vorhandene TMDB-/JustWatch-Anbieterindikatoren werden nach dem vorhandenen Anbieter-Schema und ihrer jeweiligen Quellenprovenienz gezeigt; sie enthalten **keine automatisch bestätigte, genaue YouTube-Video-ID**.
2. `src/components/DetailModal.jsx` und das Profil-übergreifende Bearbeiten-Menü unterstützen verschlüsselte persönliche Links und Medien über `src/library/sharedMedia.js`. Persönliche Links erscheinen als **Movie-Hub-eigene Medien**, nicht als ein automatisch als verfügbar behauptetes YouTube-/FREE-/ADS-Angebot.
3. Die Android-/Fire-TV-Brücke `MainActivity.openMediaUrl` erkennt YouTube-Watch- und `youtu.be`-Links via `YouTubeUrlResolver` und versucht die offizielle YouTube-App, mit normaler Android-URL-Weiterleitung als Fallback. Der Anbieterbrowser unterstützt außerdem eine YouTube-Suche.

## Etappe 1: Tatsächlich implementierte Funktionen in diesem PR

- **Filmdetail:** Eine explizite Aktion **„Auf YouTube suchen“** öffnet eine benutzerinitiierte YouTube-Suche nach dem Film in der YouTube-App oder Browser. Sie ist **keine Angebotskarte**, erzeugt keinen Provider-/FREE-/ADS-Badge, führt keine YouTube-API-Sammlung aus und markiert den Film nicht automatisch als gesehen.
- **Bearbeiten → Eigene Links und Videos → „YouTube-Link hinzufügen“** eröffnet eine auf konkrete Videos beschränkte Eingabe. Zulässig sind exakte `youtube.com/watch?v=<11-stellige-id>` oder `youtu.be/<id>`-Links. Die Eingabe lehnt gefälschte Domains, doppelte Video-IDs, Benutzername/Passwort in der URL, ungültige Protokolle und Playlists als vermeintliche exakte Filme ab.
- **Kanonisierung und verschlüsselte Speicherung:** Share-/Tracking-Parameter werden entfernt; gespeichert wird `https://www.youtube.com/watch?v=<id>` **ausschließlich als vom Nutzer eingegebener persönlicher `type=web`-Link**, wie alle bestehenden Movie-Hub-Medieneinträge. Kein neuer Firestore-Datenpfad, keine neuen Secrets, keine API-Video-Metadaten, keine Änderung an den Badge-/Offer-/WatchProvider-Tabellen.
- **Wiedergabe:** Die bestehende Native-Brücke für exakte YouTube-Watch-Links wird unverändert wiederverwendet. Der konkrete gespeicherte Link kann direkt von der Detailseite bzw. dem eigenen-Link-Picker gestartet werden; die generelle Suche wird davon sichtbar getrennt.
- **Automatische Tests:** YouTube-URL-Validierung/Kanonisierung, nicht-YouTube-Links unverändert, keine automatische Provider-Zuweisung, benutzerinitiierte Suche in nativer App/Browser, kein automatisches Gesehen-Markieren im Suchpfad.

## Was NICHT in diesem PR aktiviert wird

- **Kein Nightly-Crawl aller YouTube-Kanäle**, kein zentrales automatisches `(tmdbId, youtubeVideoId)`-Aggregat aus vielen Content-Ownern, keine dauerhaft zwischengespeicherten API-Suchergebnisse, keine neuen YouTube-API-Lesetoken im Client.
- **Keine** neue automatische `youtube:free/ads/flat/rent/buy`-Zuordnung aus Video-Titel, Kanalname, Länge, RegionRestriction oder TMDB-Matcher-Score.
- Kein automatischer Filmfassungs-/Rechte-/DE-Player-Nachweis. Matcher v1 bleibt eingefroren und ist ausschließlich ein früherer G1-Werkhinweis.
- Keine automatische Bestätigung, dass die YouTube-App auf jedem Fire-TV-Gerät installiert ist oder jede dortige Video-ID tatsächlich abgespielt wird.

## Restliche G2-Etappen – als separate Abnahmen

1. **Funktionstest auf echten Geräten:** Benutzer erzeugt in der Detailseite per „YouTube-Link hinzufügen“ einen exakten Video-Link; Speichern → Schließen → Neuöffnen → eigene Links → YouTube-App; Test auf Telefon und Fire TV, jeweils mit positivem Link und ungültiger URL. Ebenso allgemeine Suchaktion testen. Bei Bedarf konkrete Android-Fallback-Probleme gezielt korrigieren, nicht Matcher v1 nochmals ausbauen.
2. **Rechte-/Quellenmodell für automatische Angebote:** Übernehmen nur wenn ein technisch und nach API-/Quellenbedingungen zulässiger Datenfluss **und** ein unabhängig belegter Video-/Fassungs-/Entitlement-Nachweis existieren. Ein einziger Nutzer macht YouTube API Developer Policies **III.E.2** zur Aggregation verschiedener Content-Owner nicht unwirksam. Bei fehlender Klärung darf der zusätzliche vollautomatische Providerkatalog nicht aktiviert werden, auch nicht „nur privat“.
3. **Falls schriftlich geklärt/autorisiert:** Anbieteradapter gemäß `sourceAdapterContract`, `sourceRefs`, `titleRef`, `region=DE`, `playbackRoutes`, Beleg-/Gültigkeits-/Refreshkonzept sowie zentrale Poster-/Detail-Badge-Projektion über den gemeinsamen Providerpfad; URL-Sicherheit und konkrete Angebotstypen separat prüfen. Erst nach erfolgreichem isoliertem Stage-/Fire-TV-Test und ausdrücklicher Freigabe Live-Nightly/Firestore-Import zulassen.
4. **Compliance-Anfrage:** Die Frage kann administrativ vertagt werden; vor weiterer Benutzer-/öffentlicher Freigabe erneut aufrufen. **Die rechtliche Zulässigkeit darf aber nicht als pauschaler „später“-Schalter behandelt werden, wenn schon vorher unzulässige API-Nutzung geplant wäre.** Original-Entwurf: `YOUTUBE_MOVIES_G1_YOUTUBE_API_COMPLIANCE_REQUEST_DRAFT_2026-10-21.md`.

## Abnahmecheck für diesen PR

- Ausschließlich user-initiierte Suchaktion und persönliche exakte Watch-Links funktionieren und sind für D-Pad/Fernbedienung erreichbar.
- Native Link-/Suchfunktion berücksichtigt ältere Android-Brücken und normalen Browser-Fallback.
- Alte gespeicherte `type=web`-Links bleiben ohne Migration lesbar, normale HTTP-/SMB-Videos unverändert.
- Kein ungeprüftes YouTube-Badge, keine neue `tmdbProviderOffer` und kein zusätzlicher eigener API-Nightly.
- CI und Android-APK-Build grün. **Dieser Softwaretest ersetzt keinen echten Gerätetest**.

**Referenz:** [YouTube API Developer Policies – Data Aggregation, Speicherung, API-Daten](https://developers.google.com/youtube/terms/developer-policies), [YouTube Compliance Guide – unabhängige Suche und Datenkennzeichnung](https://developers.google.com/youtube/terms/developer-policies-guide). Issue #388 bleibt offen bis echtes G2-Integrations- und Quellen-/Compliance-Gate.
