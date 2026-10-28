# YouTube #388 – getrennter, noch inaktiver search.list-Transport für das gemeinsame Tagesbudget

**Stand 28.10.2026.** Basis: main 9a575a9bc97d979e38a23906694d283de36a1803 nach Sicherheits-PR #677.

## Was diese Stufe konkret liefert

Neue API-Fabrik scripts/youtube-g2-shared-search-transport.mjs mit dem bestehenden Callback-Vertrag (endpoint, params), vorbereitet als zukünftiger Ersatz für den direkten youtubeGet-Callback in Nightly Discovery, 5er-Forschung und 1er-Forschung. Sie ist derzeit bewusst in **keinem Live-Workflow** importiert.

- Nur für endpoint=search und einen gültigen öffentlichen Video-Suchplan darf die Fabrik executeSharedBudgetedSearch aufrufen. Dieses reserviert **genau einen** Suchversuch über den neuen GCS-Generation-CAS-Gateway, prüft die bereits vorhandene Projektfreigabe und verbucht das Ergebnis. Unbekannte bzw. fehlerhafte Projektfreigabe blockiert vor dem API-Aufruf.
- Eine eigene monoton wachsende attemptNumber pro runId verhindert Doppelvergabe bei gleichzeitig vom selben Worker gestarteten Suchanfragen. Mehr als 95 Versuche aus demselben Worker werden **vor** GCS und API gestoppt.
- Die Nicht-Such-Endpunkte videos, channels, playlists, playlistItems und videoCategories dürfen weiterhin mit der normalen API verarbeitet werden; das spendet keine search.list-Reservierung, ist aber **keine Freigabe unbegrenzter sonstiger Google-Quoten**.
- Unbekannte API-Endpunkte sowie unsichere oder unvollständige Suchargumente werden abgewiesen; API-Key, Anfrageparameter und Video-/Film-IDs werden nicht im neuen Ledger gespeichert.
- Nach 403 quotaExceeded bleibt die Tages-Sperre maßgeblich; HTTP 429 wird getrennt erfasst. Weder API-Suchen noch unbekannte Fehler werden automatisch wiederholt. Jede neue, bewusst einzeln angefragte Suche benötigt ihre eigene reservierte attemptNumber.
- Die Approval-Datenstruktur ist bisher nur eine *deklarative* Prüfung im separaten Gateway. Dieses neue Modul **bescheinigt nicht selbst** die tatsächliche Google-Projektquote oder fremde Verbraucher.

## Was weiterhin NICHT erfolgt

- Keine Verbindung zu produktiven Jobs oder GCS-Ledger-Cutover. Die Live-G2-Workflows behalten das gemeinsame alte v1-10/1-Tagesledger unverändert. Die beiden Ledger dürfen nicht als unabhängige Tagesbudgets parallel genutzt werden.
- Keine Änderung an 20s Search-Abstand, 60 Film-Vorprüfungen, TMDB/YouTube-Video-Limits, Publishing- oder Link-Freigaben, bekannten Kandidaten, Firestore/Hosting oder Endabnahme.
- Kein API-Key-Beschaffen, keine echten YouTube-Suchanfragen, keine Quotenanhebung oder neue Google-Cloud-Rechte durch dieses Modul.

## Nachweise vor dem nächsten Schritt

1. Automatisierte Tests in tests/youtube-g2-shared-search-transport.test.js: keine Suche ohne Approval; atomarer Reservierungs-Readback vor dem Transport; Videos ohne Suche; fehlerhafte Requests/Endpunkte blockieren; Quota-Stop vs. Rate-Limit; unsichere Ergebnisse bleiben spent; gleichzeitige Versuch-IDs; unverändertes altes produktives 10/1-Gate.
2. Echte CI und Android-Prüfungen nur nach GitHub-Status als bestanden melden.
3. Quoten- und Verbraucher-Audit für das **tatsächliche** Google-Projekt einschließlich anderer Schlüssel/Caller abschließen; externe Quotenreste niemals aus internen GCS-Slots ableiten.
4. Alle ausführbaren Search-Pfade vollständig kontrollieren; altes v1-Ledger und neuen 95er-Gateway an der **Tageswechsel-Grenze** mit einem einzigen aktiven Schreiber migrieren. Nicht lediglich die 95er-Konstante in alten Workflows erhöhen.
5. Erst danach die API-Fabrik in genau definierten aktiven Suchstrecken verkabeln, E2E auf konservativem Volumen kontrollieren, die echte Pacific-Tages-/429-/403-Bilanz und den automatischen Discovery → Known-Video-Recheck → Firebase-Deploy nachweisen.

Dieser Schritt ändert ausschließlich **isolierten neuen Quellcode, Tests und diese Dokumentation**. Issue #388 bleibt offen und DVB-I #336 sowie Prime Video #391 pausiert.
