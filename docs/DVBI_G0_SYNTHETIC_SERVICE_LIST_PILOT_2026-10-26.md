# DVB-I #336 – isolierter Service-Listen-Pilot (26.10.2026)

**Stand:** Synthetischer XML-Fixture-Parser, noch **kein** deutscher Produktions- oder EPG-Adapter.

## Quellen und Vertrauensgrenzen
- DVB BlueBook A177r8 inklusive Schema-/Beispielressourcen: https://dvb.org/?standard=service-discovery-and-programme-metadata-for-dvb-i
- Die deutsche SES-FTA-DVB-I-Liste wird von DVB ausdrücklich als **experimentell** und als Entwicklerreferenz beschrieben: https://dvb.org/specifications/verification-validation/dvb-i/
- Deutsches DVB-I-Implementierungsprofil: https://www.tv-plattform.de/wp-content/uploads/2026/06/DTVP_DVB-I_-Implementierungsprofil_V1-0-1_approved_03062026_CLEAN.pdf

## Lieferumfang
Der Parser parseDvbiServiceList erhält **nur explizite lokale XML-Texte**. Die synthetische Testliste enthält zwei erfundene Services, einen DASH- und einen DVB-S-Hinweis. Erfasst werden Sender-ID, Name, optionaler Anbieter, Liefertyp, Ländersignal, Content-Guide- und Locator-Präsenz sowie ein Feld-Inventar über die bestehende Movie-Hub-Field-Discovery. Fremde Elementnamen werden nur mit Namen inventarisiert. **Weder URI-Inhalt noch Token, PlaybackRoute, EPG-Ereignis oder Produktionssender werden übernommen.**

Der Parser lehnt DTD/Entity, falsche Wurzel/Namespace, ungültige XML-Struktur, doppelte Sender-IDs, übergroße Dateien und mehr als 250 Services ab. Es werden **keine Web-/YouTube-/TMDB-Aufrufe** ausgeführt und keine bestehenden Waipu-/Joyn-/Firebase-/Firestore-Dateien verändert.

**Abnahmegrenzen:** Das ist ein Offline-Fixture-Test, keine vollständige A177r8-XSD-Validierung. Keine reale deutsche Serviceliste, kein Content-Guide-Endpunkt und kein Playback wurde geprüft. Aus Service-List-Delivery-Signalen folgt keine Streamingfreigabe.

## Reproduzierbarer Test
npx vitest run tests/dvbi-service-list-probe.test.js

**Nächster Schritt:** Wenn ein offiziell bereitgestellter und erlaubter Referenz-Datensatz vorliegt, Namespace-/Feldabdeckung und A177r8-XSD vergleichen und dann den bestehenden SourceEnvelope-V1-Vertrag ohne produktive Veröffentlichung als Modell prüfen.
