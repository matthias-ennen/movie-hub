# MovieHub – Entwurf einer YouTube-API-Compliance-Anfrage (G1, nicht abgesendet)

## Projektentscheidung 21.10.2026 – interne Einzelnutzung, Anfrage zurückgestellt

Der Eigentümer nutzt MovieHub derzeit **allein mit einem Benutzerkonto**. Er hat entschieden, den Versand dieser Anfrage **bis zur konkreten Freigabe weiterer Benutzer oder öffentlicher Nutzung** zurückzustellen und die interne G1-Entwicklung fortzuführen. Die Entscheidung und ihr Geltungsumfang sind im [verbindlichen Issue #388](https://github.com/matthias-ennen/movie-hub/issues/388#issuecomment-6325708456) dokumentiert.

**Harter Trigger vor einer Freigabe:** Sobald weitere eigenständige Benutzer Zugang bekommen sollen oder MovieHub öffentlich/extern genutzt beziehungsweise der YouTube-Katalog-/Badge-Adapter veröffentlicht werden soll, den geplanten API-Datenfluss erneut bewerten, YouTubes erforderliche konkrete Genehmigungen/Compliance-Fragen klären und **erst danach** Zugriff, Veröffentlichungen und automatisierte Angebote aktivieren. Nicht allein wegen einer kleinen Benutzerzahl freigeben.

**Wichtig auch jetzt:** Single-User/private Nutzung ist **keine** nachgewiesene Ausnahme von [YouTube API Developer Policies III.E.2](https://developers.google.com/youtube/terms/developer-policies) über Datenaggregation verschiedener Content Owner oder von Datenretentions-/Refresh-Vorgaben. Diese Projektentscheidung gibt **keinen** zusätzlichen kanalübergreifenden API-Gesamtkatalog, keinen breiten Multi-Owner-Crawl und keine ungeprüften MovieHub-YouTube-Badges frei. Weiterarbeit vorläufig an vorhandener 100er-Qualitätsauswertung, unverändertem Matcher v1, Tests und datenflussgetrennter Architektur im Rahmen der geltenden Regeln.

**Status:** Entwurf weiter **nicht versendet**. Keine öffentliche Freigabe, keine bestätigten DE-Offers, kein produktiver YouTube-Import.

---

**Status:** fachlicher Entwurf, Stand 21.10.2026. **Nicht an YouTube gesendet. Keine Freigabe behauptet.** Antragsteller/Projekt-ID/Ansprechpartner aus dem echten verknüpften Google-Cloud-Projekt nur bei einer später explizit freigegebenen Einreichung ergänzen, keine Secrets oder personenbezogenen Daten in GitHub-Dokumente schreiben.

## Zweck für Google/YouTube

Die YouTube API Developer Policies [Abschnitt III.E.2 Data Aggregation](https://developers.google.com/youtube/terms/developer-policies) sind bei einem öffentlichen Film-/Quellenaggregator mehrdeutig im Verhältnis zum erlaubten Beispiel eines eigenständigen Suchdienstes, der YouTube-Angebote klar von anderen Plattformen trennt. Wir benötigen eine **konkrete schriftliche Einordnung**, bevor eine solche Funktion implementiert oder veröffentlicht wird.

## Anfrageentwurf auf Englisch

**Subject:** YouTube Data API compliance clarification for a multi-provider movie discovery app (read-only)

> Hello YouTube API Compliance Team,
>
> We are evaluating a feature for MovieHub, a movie discovery and personal movie-collection app for Android, Fire TV, and the web. The application already has independent movie metadata from The Movie Database (TMDB) and lists other streaming/broadcast sources. We have **not** enabled an automated production YouTube catalog, provider badges, rental/purchase availability, or a combined YouTube data feed.
>
> In a limited internal research pilot, we used the official YouTube Data API (read-only `search.list` and `videos.list`) to inspect public video IDs that YouTube reported as movie-related. The videos came from different channel IDs and potentially different content owners. We are unsure whether the planned public product feature would qualify as prohibited multi-owner aggregation under Developer Policies III.E.2, even if YouTube results are clearly attributed and separated from other providers.
>
> We would like specific guidance on these possible designs:
>
> 1. **Platform-specific search view:** An end-user-initiated YouTube search tab showing unmodified YouTube search results, clearly labeled as YouTube, separately from TMDB and other services. Would this be permitted if the required functionality, branding, attribution, privacy, refresh and storage rules are met?
> 2. **Movie-ID resolution:** Matching a YouTube video ID returned by that search to a TMDB movie ID purely to navigate to a movie-information page. Is that considered prohibited aggregation or mixing of YouTube API Data with non-YouTube data?
> 3. **Combined public movie list:** Periodically fetching movie video IDs across channels with different content owners, deduplicating/matching to TMDB IDs and publishing them in one consolidated publicly accessible movie catalog with a YouTube source badge and links. Is this prohibited under III.E.2? Would explicit YouTube approval or channel/content-owner authorization be necessary?
> 4. **Playback and commercial availability:** Does the public Data API support a reliable per-video, Germany-specific entitlement/offer signal distinguishing free, advertising-supported, subscription-included, rental and purchase options? If not, we would avoid any such classification based on video metadata or channel display names.
> 5. **User-supplied links:** May users privately save their own explicit `https://www.youtube.com/watch?v=...` links as personal bookmarks to launch the official YouTube app without API aggregation, video downloading, or embedding? Please identify any YouTube API-specific requirements if those links are merely stored by users.
>
> We do not download, copy, cache, rehost, extract or offline-play any YouTube audiovisual content. We do not plan to present third-party content as YouTube search results, and will not infer video monetization or shop offer types. We would like to avoid implementation until the exact compliant architecture is clear.
>
> Please advise which features could be compliant and whether an API Compliance Audit or prior approval is required for these scenarios.
>
> Thank you.

## Verbindliche interne Grenze

- Der Entwurf ist **keine** Erlaubnis, keine rechtsverbindliche Auslegung und wurde **nicht** eingereicht.
- Bis zur Klärung **kein** produktiver kanalübergreifender YouTube-Katalog, kein automatischer YouTube-MovieHub-Badge, kein `free`/`ads`/`rent`/`buy`-Inference aus API-Metadaten, kein YouTube-TMDB-Datenmerge im normalen Nightly.
- Mögliches alternatives Minimalmodell **nur nach separater Prüfung**: vom Benutzer bewusst hinzugefügter persönlicher YouTube-Link, als Quelle klar gekennzeichnet und nicht als automatisch bestätigtes Verfügbarkeitsangebot dargestellt.
- Maßgebliche Links: [Developer Policies](https://developers.google.com/youtube/terms/developer-policies), [YouTube Compliance Guide](https://developers.google.com/youtube/terms/developer-policies-guide), [Data API video object](https://developers.google.com/youtube/v3/docs/videos), [Google API Compliance Audit / Quota Form über den offiziellen Guide](https://developers.google.com/youtube/terms/developer-policies-guide).

**Nächster Schritt bei separater Freigabe:** Anfrage mit tatsächlich geplanter Funktion und Screenshots/Architekturentwurf vervollständigen; erst nach Nutzerfreigabe über den offiziellen Compliance-Kanal einreichen. Kein automatisches Absenden.
