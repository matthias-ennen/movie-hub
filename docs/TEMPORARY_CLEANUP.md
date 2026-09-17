# Temporäre Übergangslösungen und späterer Rückbau

Dieses Register ergänzt das GitHub-Sammelissue für bewusst temporäre Kompatibilitäts-, Migrations- und Diagnosepfade.

## Regeln

- Jeder temporäre Pfad braucht einen Zweck, eine Herkunft und ein klares Entfernungskriterium.
- Normale Sicherheits-, Fehler- und Offline-Fallbacks gelten nicht automatisch als Provisorium.
- Neue Migrationen sollen hier bzw. im zugehörigen Sammelissue direkt beim Einbau vermerkt werden.

## Aktuell bekannte Rückbaukandidaten

### SMB-Legacy-Endpunktschlüssel (#205)
Das bisherige Format `host:port/Share` bleibt während der Migration als Altformat relevant. Nach erfolgreicher Migration aller unterstützten Altinstallationen können Legacy-Key-Helfer, Alt-Key-Lookups und zugehörige Migrationsmarker entfernt werden.

### SMB-Verbindungsschema `connections_v1` (#205)
Falls #205 ein neues lokales Verbindungsschema einführt, wird der alte Reader nur für die Übergangsphase benötigt. Nach abgeschlossenem Rollout kann der alte Schema-Lesepfad entfallen.

### Klartext-Kompatibilität bei der Firestore-Verschlüsselungsmigration (#205)
Während der Umstellung auf verschlüsselte persönliche Felder müssen bestehende Klartextdatensätze noch erkannt und migriert werden. Nach abgeschlossener Migration sollen Klartext-Lesepfade, Legacy-Erkennung und einmalige Konvertierungslogik entfernt werden.
