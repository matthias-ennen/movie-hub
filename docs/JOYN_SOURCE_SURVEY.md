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
