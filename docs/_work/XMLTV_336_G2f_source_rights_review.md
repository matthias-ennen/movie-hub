# MovieHub #336 / G2f – Rechts- und Aufbewahrungsprüfung der Original-XMLTV-Quellen

Stand: 14.11.2026. Technische, **keine rechtsverbindliche** Bewertung; diese Tabelle dokumentiert nur, **welche positiven Nachweise bislang nicht gefunden bzw. nicht bestätigt** sind. **Kein** Cloud-/Firebase-/Android-/Nightly-GO für fremde Originalprogramme. Quelle frei erreichbar ≠ Freigabe für dauerhafte Kopie und Auslieferung.

## 1. Geprüfte Quellen und tatsächlicher Nachweisstand

| Quell-ID | Originalfeed (bereits im festen G2c-Pilot) | Gefundene Anbieterinformation | Verifizierte Erlaubnis für private dauerhafte EPG-Rohdatenkopie | Verifizierte Erlaubnis für eigene App-Weitergabe |
| --- | --- | --- | --- | --- |
| `epgshare01` | `https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz` | FAQ: kostenloser EPG für **rechtmäßige** Nutzung; Dokumentation der verfügbaren Feeds und IDs. Keine konkret geprüfte ausdrückliche Zusage für dauerhafte eigene Speicherung oder Weitergabe. | **Nein / noch nicht nachgewiesen** | **Nein / noch nicht nachgewiesen** |
| `freeepg` | `https://free-epg.de/api/epg/de.xml.gz` | Dokumentierte Einbindung in IPTV-/PVR-Software; Impressum mit Urheberrechtsvorbehalt. Eine Integrationsanleitung ist keine überprüfte Zustimmung zu dauerhaftem eigenen Spiegel und erneuter Veröffentlichung. | **Nein / noch nicht nachgewiesen** | **Nein / noch nicht nachgewiesen** |
| `iptv-epg-org` | `https://iptv-epg.org/files/epg-de.xml.gz` | Öffentliches Länder- und Feedverzeichnis; in den geprüften Seiten keine konkrete Speicher-/Weitergabeklausel belegt. | **Nein / noch nicht nachgewiesen** | **Nein / noch nicht nachgewiesen** |

**Quellenlinks, besucht 14.11.2026:**
- EPGSHARE01: https://epgshare01.online/ ; https://epgshare01.online/epgshare01/0_READ_ME_FIRST_AS_I_CONTAIN_VERY_HELPFUL_INFO.html
- FreeEPG: https://www.free-epg.de/docs/dispatcharr ; https://free-epg.de/impressum ; https://www.free-epg.de/
- IPTV-EPG.org: https://iptv-epg.org/guides

**Verwechslungsgefahr:** `iptv-org/epg` ist ein **anderes** Open-Source-Softwareprojekt; dessen Unlicense für *Softwarecode* ist kein Nutzungsnachweis für die Programmdaten aus `iptv-epg.org` oder die Inhalte eines dritten EPG-Anbieters. Dass `freeepg` und `iptv-epg-org` derzeit denselben DE-Programm-Fingerprint haben, ist **kein zweiter unabhängiger Datensatz und keine Rechteübertragung**.

## 2. Technisch festgeschriebene Entscheidung G2f

`src/sources/xmltv/xmltvOriginalRetentionGate.js` enthält einen **hartcodierten, source-spezifischen Deny-by-Default-Status**. Alle drei Quellen: `status=no-verified-grant`, `privateDurableStorage=false`, `downstreamRedistribution=false`, `approvedRetentionHours=0`. Diese Werte sind **kein rechtliches Verbot** oder eine Aussage, dass die Anbieter die Nutzung grundsätzlich untersagen. Es fehlt bisher lediglich der konkrete geprüfte Rechts-/Nutzungsnachweis für diesen Anwendungsfall.

`assertXmltvOriginalRetentionAllowed` blockiert deshalb jede Anforderung, fremde Originalprogrammdaten über den flüchtigen, isolierten G2c-Runner hinaus als **dauerhaften Cloud-Originalcheckpoint** zu speichern. Laufzeitparameter, boolesche `reuseRightsApproved`-Felder oder von einem Feed behauptete Nutzungsrechte heben das nicht auf. Eine spätere echte Freigabe erfordert einen gesonderten, nachvollziehbaren Code-/Dokumentationsreview je Quellen-ID; **kein** pauschaler globaler Schalter.

`scripts/xmltv-g2f-original-retention-preflight.mjs` liest vorhandene **private** G2c/G2d-Quellstagingdaten zur strukturellen Validierung, gibt aber **ausschließlich allowlist-geprüfte Zähler** aus. Kein Cloud-SDK, kein Upload, keine Kopie von Originaltiteln in Logs/Actions-Artefakte, keine Firebase-/TMDB-/AIR-Schnittstelle. Frühere G2e-Tests dürfen unverändert synthetische Dateien im eigenen G2e-Testprefix speichern.

**EPG-Vorschau:** Das Maximum bleibt 14 Tage, das LKG-Alter ist unabhängig davon höchstens 36 Stunden. Quellen mit 2–3 Tagen Zukunftsprogramm sind weiterhin sinnvoll; eine starre 5-Tage-Mindestabdeckung ist **keine** Importbedingung. G2f verändert weder EPG-Abdeckung noch vorhandene Vorschauentscheidungen.

## 3. Welche Nutzung muss tatsächlich geklärt werden?

Vor einer Originaldaten-Persistenz sind je Quelle mindestens die **konkreten Verwertungsrechte und Nutzungsbedingungen** zu dokumentieren:

1. Darf MovieHub die XMLTV-Originaldaten intern für automatisierte Verarbeitung herunterladen und mit welchen Abrufraten/Attributionspflichten?
2. Darf MovieHub die fremden Sendungstitel, Beschreibungen, Metadaten und Sendezeiten als *eigene private Cloud-Kopie* über einzelne Verarbeitungsläufe hinaus aufbewahren? Wie lange maximal? Welche Lösch-/Widerrufsbedingungen gelten?
3. Darf MovieHub daraus eine öffentliche/private Anzeige für Android-/Fire-TV-Nutzer bereitstellen, und in welchen Nutzungs-/Distributionsformen?
4. Wenn nur ein direkter Bezug ohne Mirror gestattet ist: Sind ein reiner Client-Abruf, ein Link zum Ursprungsanbieter oder ein anderer Feedanbieter möglich? Diese Alternativen **erst** rechtlich und technisch prüfen, nicht stillschweigend aktivieren.
5. Ist eine Transformation in TMDB-identifizierte Sendereignisse und deren Speicherung erlaubt, und wie sind Provenienz, Datenweitergabe und eventuelle Quellenlöschungen umzusetzen?

Bis dahin bleiben die bisher getesteten echten Programme **ausschließlich flüchtige, nicht publizierte QA-Daten**, kein produktiver LKG-Cloud-Checkpoint. Der synthetische Multi-Runner-Cloud-Test aus G2e ist erfolgreich, **belegt aber nicht die Rechte zur Speicherung echter Originaldaten**. G2f arbeitet die erforderliche technische Freigabestufe vor, ohne Nutzerentscheidungen vorwegzunehmen.

## 4. Folgestufen

- **G2f:** source-spezifischer Deny-by-Default-Nachweis, negativer Rechte-/Spoofing-Test und echter isolierter 3-Feed-Staging-Preflight ohne Originalexport.
- **G2g:** nach positiver einzelquellenbezogener Prüfung: eng begrenztes reales Cloud-Retention-Design (TTL/Löschroutine, Generation, Prüfsumme, Atomizität, maximale Datenmenge), unabhängiger Folgelauf und echter Quellen-Ausfalltest.
- **G3:** erst nach gesonderter TMDB-Qualitäts-, Rechte-, AIR-Routen- und Android-/Fire-TV-Abnahme Verknüpfung mit produktivem Nightly/TV-Merge.

Dieser Bericht ist kein Rechtsgutachten; Freigaben dürfen nicht aus öffentlich zugänglichen Dateien oder aus Software-Repolizenzen erschlossen werden.
