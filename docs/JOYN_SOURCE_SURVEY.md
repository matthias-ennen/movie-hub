# Joyn-Quellenuntersuchung und Pilotinventur (#280)

Stand: 26. September 2026

## Ausgangspunkt

Die gemeinsame Quellenplattform aus #330, #331 und #332 ist abgeschlossen.
Joyn ist damit die erste echte zweite Quelle, die ohne Änderung des
Movie-Hub-Kerns an den SourceEnvelope-V1-Vertrag angeschlossen werden soll.

## Bestätigte öffentliche Live-TV-Ziele

Die folgenden sechs Sender sind als erste Pilotgruppe festgelegt. Die
senderbezogenen Joyn-Seiten sind öffentlich erreichbar und zeigen jeweils
einen Live-TV-Einstieg sowie „Programm von heute“.

| Sender | Joyn-Slug | Joyn-Ziel | Waipu-ID | Status |
| --- | --- | --- | --- | --- |
| ProSieben | `prosieben` | `https://www.joyn.de/live-tv/prosieben` | `pro7` | Web bestätigt |
| SAT.1 | `sat1` | `https://www.joyn.de/live-tv/sat1` | `sat1` | Web bestätigt |
| Kabel Eins | `kabel-eins` | `https://www.joyn.de/live-tv/kabel-eins` | `kabeleins` | Web bestätigt |
| ZDF | `zdf` | `https://www.joyn.de/live-tv/zdf` | `zdf` | Web bestätigt |
| DMAX | `dmax` | `https://www.joyn.de/live-tv/dmax` | `dmax` | Web bestätigt |
| Tele 5 | `tele-5` | `https://www.joyn.de/live-tv/tele-5` | `tele5` | Web bestätigt |

Die Zuordnung zum bestehenden Waipu-Senderstamm ist nur eine
kanonische Senderzuordnung. Waipu und Joyn bleiben getrennte Provider und
getrennte PlaybackRoutes.

## Linkstatus

Diese HTTPS-Ziele werden zunächst als `WEB_LINK` modelliert.

Sie gelten **noch nicht** als bestätigte `APP_DEEP_LINK`-Ziele. Eine
Hochstufung erfolgt erst nach praktischer Geräteprüfung auf:

- Android-Smartphone;
- Android-Tablet;
- Fire TV.

Dabei wird unterschieden zwischen:

1. richtiger Sender startet direkt;
2. Joyn-App öffnet nur allgemein;
3. Browser/Web-Fallback;
4. Link funktioniert nicht bzw. benötigt Anmeldung.

## EPG-/Programmdaten

Die öffentlichen Senderseiten bestätigen, dass Joyn Programminformationen
anzeigt. Ein stabiler, dokumentierter öffentlicher Joyn-EPG-API-Vertrag ist
derzeit jedoch nicht bestätigt.

Es existieren technische Hinweise auf GraphQL im Joyn-Web-/App-Umfeld. Diese
Hinweise reichen **nicht** aus, um eine interne oder undokumentierte API als
Produktionsvertrag zu behandeln.

Für den Pilot gilt deshalb:

- keine Umgehung von Authentifizierung, DRM, Geoblocking oder Zugriffsschutz;
- keine privaten Tokens oder Benutzerzugänge;
- keine Veröffentlichung aus einem nur vermuteten API-Vertrag;
- strukturierte Programmdaten werden erst integriert, wenn Requestform,
  Stabilität, Felder und zulässige Nutzung ausreichend dokumentiert sind.

## Pilotstrategie

1. Senderinventur und stabile Web-Ziele festschreiben.
2. Strukturquelle für „Programm von heute“ technisch untersuchen.
3. Nur belastbare Read-only-Daten in einen Joyn SourceEnvelope überführen.
4. Mindestens fünf Pilot-Sender mit echten Events durch denselben
   Mehrquellen-Merge wie Waipu schicken.
5. Geräteverhalten der HTTPS-Ziele testen.
6. Erst danach Joyn-Providerziele sichtbar in Movie Hub freigeben.

Der App-Kern wird für diese Untersuchung nicht geändert.


## Playback-Zielqualität

Transportmodus und Produktqualität werden getrennt bewertet.

### Qualitätsstufen

1. `exact`
   - ein praktisch bestätigtes Ziel öffnet genau den vorgesehenen Sender,
     die Sendung oder den Inhalt;
   - dies ist die höchste Qualitätsstufe.

2. `provider-fallback`
   - die richtige Anbieter-App beziehungsweise ein sinnvoller Anbieterkontext
     wird geöffnet;
   - der exakte Sender oder Inhalt ist jedoch nicht garantiert.

3. `web-fallback`
   - stabiler offizieller HTTPS-Zielpunkt im Browser/WebView;
   - keine Behauptung eines bestätigten App-Deep-Links.

Der technische `PlaybackRoute.mode` (`APP_DEEP_LINK`, `WEB_LINK`,
`DIRECT_STREAM`, `RESOLVER`) ist davon unabhängig.

Für Joyn stehen die sechs Pilotziele derzeit auf `web-fallback`. Eine
Hochstufung erfolgt ausschließlich nach Geräteabnahme.

## EPG-Untersuchung – aktueller Stand

Die öffentliche Joyn-Seite für ProSieben bestätigt:

- senderbezogene Seite `/live-tv/prosieben`;
- Live-TV-Einstieg;
- sichtbaren Bereich „ProSieben Programm von heute“.

Im serverseitig öffentlich lesbaren HTML sind jedoch keine belastbaren
strukturierten Felder wie `startTime`, `endTime` oder ein Schedule-Objekt
sichtbar. Daraus folgt als Arbeitshypothese, dass die eigentlichen
Programmdaten clientseitig beziehungsweise über einen nachgelagerten
Datenservice geladen werden.

Bislang nicht bestätigt:

- dokumentierter öffentlicher EPG-Endpunkt;
- stabiler Vertrag für Sender-/Programm-IDs und Zeitfenster;
- Nutzung ohne interne/private Tokens;
- langfristige Stabilitäts- oder Weiterverwendungszusage.

Konsequenz für #280:

- keine interne oder nur vermutete Joyn-API fest verdrahten;
- öffentlich bestätigte Senderlinks weiterverwenden;
- EPG-Zugang getrennt weiter untersuchen;
- ein Joyn-SourceEnvelope mit echten Sendeterminen entsteht erst nach
  belastbarer Struktur- und Nutzungsbewertung.


> Live-Pilot gestartet: Der nächste mit `[waipu-refresh]` markierte Lauf erzeugt aus dem echten Waipu-SourceEnvelope einen diagnostischen Joyn-Playback-Overlay für die sechs Pilot-Sender. Es werden keine Joyn-EPG-Zeiten erfunden und keine Overlay-Daten an die App veröffentlicht.


> Zweiter Live-Pilot nach Korrektur der waipu-epg-Provenienzprüfung gestartet.


## Reale Pilotabdeckung – Live-Lauf #532

Der zweite Live-Pilot ist erfolgreich durchgelaufen.

Eingang:
- 14.963 neutrale Waipu-BroadcastEvents im SourceEnvelope;
- sechs freigegebene Joyn-Pilotsender.

Ergebnis:
- 870 Ereignisse lagen auf den sechs Pilot-Sendern;
- 870/870 Ereignisse erhielten erfolgreich eine zusätzliche Joyn-PlaybackRoute;
- alle sechs Pilot-Sender waren im realen Bestand vertreten;
- kein Titel und kein Senderereignis wurde dupliziert;
- Eventzeiten und EPG-IDs blieben vollständig Waipu-Provenienz;
- Joyn ergänzte ausschließlich den zusätzlichen Anbieterweg.

Abdeckung je Sender:

| Sender | Waipu-ID | Ereignisse mit Joyn-Route |
| --- | --- | ---: |
| ProSieben | `pro7` | 279 |
| SAT.1 | `sat1` | 103 |
| Kabel Eins | `kabeleins` | 191 |
| ZDF | `zdf` | 122 |
| DMAX | `dmax` | 55 |
| Tele 5 | `tele5` | 120 |
| **Gesamt** |  | **870** |

### Welche Daten kommen in dieser Pilotstufe wirklich von Joyn?

**Neu durch Joyn:**
- Provideridentität `joyn`;
- offizieller senderbezogener HTTPS-Zielpunkt;
- Joyn-Sender-Slug;
- Zuordnung dieses Zielpunkts zu einem bekannten neutralen Sender;
- aktuelle Qualitätsstufe des Ziels: `web-fallback`;
- öffentlich bestätigte Tatsache, dass der jeweilige Sender über Joyn Live-TV anbietet.

**Nicht von Joyn in dieser Pilotstufe:**
- Sendungsstart;
- Sendungsende;
- EPG-/Programm-ID;
- Film-/Serienklassifikation;
- TMDB-ID;
- Staffel/Folge;
- Titelmetadaten;
- Altersfreigabe;
- Bilddaten;
- exakter sendungsbezogener Joyn-Deep-Link.

Diese Werte stammen weiterhin aus Waipu beziehungsweise TMDB.

Damit ist der aktuelle Joyn-Baustein **ein Playback-Route-Adapter**, noch kein
unabhängiger Joyn-EPG-Adapter. Diese Unterscheidung ist verbindlich und wird im
UI/Reporting nicht verwischt.


## Optionaler Joyn-Benutzerlogin – Bewertung

Ein persönlicher Joyn-Login ist **nicht** Voraussetzung für den Basisadapter.
Der reproduzierte EPG-Datenweg funktioniert bereits mit Joyns anonymer
Webclient-Authentifizierung.

Ein echter Benutzerlogin könnte später jedoch zusätzliche, nutzerbezogene
Funktionen erschließen:

- Merkliste / Watchlist;
- „Jetzt weiterschauen“;
- Wiedergabefortschritt bzw. Resume-Positionen;
- personalisierte Empfehlungen / Lanes;
- möglicherweise gefolgte Marken/Sender;
- Inhalte, die Joyn erst nach Anmeldung freischaltet;
- bei Joyn PLUS+ accountgebundene Premium-Verfügbarkeiten.

Technische Hinweise dafür existieren bereits im Joyn-Webclient-/GraphQL-Umfeld,
u. a. über Operationen wie `GetMeState`,
`ResumePositionsWithToken`, `ResumeLaneWithToken` und `WatchNext`.

### Architekturentscheidung

- Basisadapter: anonym, read-only, EPG/Katalog/Metadaten.
- Benutzerkonto: optionaler späterer Zusatzadapter für persönliche Daten.
- Keine Speicherung von Joyn-Passwörtern in MovieHub.
- Falls Kontoverknüpfung später umgesetzt wird, ausschließlich über einen
  geeigneten offiziellen/Browser-basierten Login-/Token-Flow.
- Benutzerbezogene Daten werden strikt vom öffentlichen Quellenkatalog getrennt.

Damit bleibt #280 auf den unabhängigen Joyn-Datenstrom fokussiert; Login ist
ein späteres Erweiterungspaket und blockiert den EPG-Adapter nicht.
