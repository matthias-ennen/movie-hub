# XMLTV #336 – G1e Teil 1: sichere Quellbeweise und rein lesende Wiederverwendungs-Vorschau

**Stand 12.11.2026. Nicht produktiv, keine TMDB-Anfragen, kein Cache-Aktivieren in Waipu/Joyn/XMLTV.**

Die Vorarbeiten G0 #758, G1a #759, G1b #760, G1c #762 und G1d #763 sind erfolgreich nach Tests in `main` übernommen. G1d stellt einen optionalen positiven EPG-Identitätsindex mit konfliktsicherer Sender-/Zeit-/Titelprüfung und independentem Adapter-Fallback bereit.

## Technische Brücke

`src/sources/sharedEpgEvidencePreview.js` führt **kein eigenes Matching** durch. Die Funktion `validatedSharedEpgEvidence(event, proof, { sourceStatus })` akzeptiert nur dann einen Index-Beleg, wenn:

- Das bereits vorhandene `BroadcastEvent` dem gemeinsamen SourceAdapter-Vertrag genügt.
- Die Quelle tatsächlich `healthy` ist und die zugehörige **ursprüngliche** Entscheidung des jeweiligen Waipu-/Joyn-/XMLTV-Matchers ausdrücklich `approved: true` und `status: 'matched'` hat.
- Der Matcherbeleg die genaue Quelle, externe Programm-ID, den **Original-EPG-Programmtitel**, Start-/Endzeit, TMDB-Medientyp und TMDB-ID sowie eine Matcher-Version/Prüfzeit enthält.
- Externe Programm-ID und Quelle in den `sourceRefs` des echten BroadcastEvents vorkommen, Sendezeiten, TMDB-ID und Typ ohne Widerspruch zum BroadcastEvent sind und keine Episodenkollision vorliegt.
- Ein Produktionsjahr – falls vorhanden – gültig ist.

**Besonders Waipu:** Dessen aktuelles BroadcastEvent enthält noch keinen verlässlichen Originalsendungstitel im `extensions.waipu`-Abschnitt. Dieser darf **nicht** einfach durch den TMDB-Titel ersetzt werden. Ohne Originaltitel aus der eigenen Matcher-Stufe **kein Shared-Index-Beleg**.

Die Ausgabe enthält nur die geprüften Identitätsfelder. Waipu-/Joyn-PlaybackRoutes, XMLTV-URLs und TMDB-Mediathek-Angebote gehen **nicht** in den Index.

## Dry-Run, kein behaupteter Einsparnachweis

`previewSharedEpgReuse(decisions)` wertet eine endliche Folge von Quellenentscheidungen **nur in-memory** aus. Er zählt:
- potenziell wiederverwendbare bestätigte EPG-Zuordnungen;
- zuerst unabhängig zu ermittelnde Identitäten;
- gegensätzliche TMDB-Identitätsentscheidungen;
- abgelehnte oder unvollständige Quellbelege.

Das Ergebnis ist ausdrücklich **kein Nachweis tatsächlich vermiedener TMDB-API-Requests**, weil die bisherigen Adapter möglicherweise bereits eigene Caches genutzt hätten. Dafür muss in einem gesonderten G1e-Teil 2 der reguläre Matcher mit/ohne optionalen Index unter derselben Quellgeneration verglichen werden, **mit konkretem TMDB-Requestzähler**.

## G1e-Gate vor produktiver Aktivierung

1. Offline-Tests für die neue Bridge und regressionssicheres Gesamt-CI/Android.
2. Waipu-Matcher-Stufe um den verifizierten originalen Programmtitel als **explizites, nachprüfbares Eingabefeld** ergänzen, ohne automatisch zu behaupten, dieser stehe in allen bisherigen BroadcastEvents.
3. Quellenentscheidungen nur aus vollständigen, gesund geprüften Generationsläufen bündeln; ein koordinierter Snapshot-Writer, keine Adapter-Querabhängigkeit.
4. Den optionalen Vorab-Lookup hinter einem standardmäßig **deaktivierten** Flag an je einen Adaptertestpfad anbinden; bei Cachefehler **immer** bisherige Zuordnung. Qualitäts- und API-Ersparnismetriken aus echten vergleichbaren Läufen messen.
5. Erst nach dieser Abnahme Nightly-/Firebase-/App-Integration beraten; senderbezogene AIR-Links und Android-/Fire-TV-Abnahmen bleiben getrennt.

**Aktuelle Grenzen:** Keine realen BroadcastEvents werden hier automatisch eingespeist. Keine zeitgesteuerte Datei, kein Deploy, kein neues Badge, kein von GitHub Actions abhängiger Adapterbetrieb.
