# Temporäre Übergangslösungen und späterer Rückbau

Diese Datei dient als technisches Register für bewusst temporäre Kompatibilitäts- und Migrationslogik. Maßgeblich für Planung und Status ist das zugehörige GitHub-Issue.

## Grundregel

Temporärer Code darf nur bestehen bleiben, solange er für reale Altinstallationen oder laufende Migrationen benötigt wird. Jeder Eintrag braucht einen klaren Entfernungsgrund und ein prüfbares Kriterium, ab wann er gelöscht werden kann.

## Aktuelle Kandidaten

### SMB-Legacy-Endpunktschlüssel (#205)
- Altformat: `host:port/Share`
- Neuformat: kanonische Identität aus `host/share`, case-insensitive
- Übergangslogik wird benötigt, um vorhandene lokale Credentials und Netzlaufwerke verlustfrei zu übernehmen.
- Später entfernen: Legacy-Key-Helfer, Alt-Key-Lookups und Migrationsmarker, sobald unterstützte Altinstallationen sicher migriert sind.

### SMB-Verbindungsschema `connections_v1` (#205)
- Das bisherige lokale Metadatenschema kann während der Konsolidierung noch als Eingangsformat benötigt werden.
- Falls ein neues Schema eingeführt wird, bleibt der alte Leser nur für die Migrationsphase erhalten.
- Später entfernen: alten Schema-Reader und nicht mehr benötigte Konvertierungspfade.

### Klartext-Kompatibilität während der Verschlüsselungsmigration (#205)
- Während der Umstellung persönlicher Firestore-Felder auf Ciphertext muss Movie Hub alte Klartextdatensätze vorübergehend noch erkennen und lesen können.
- Neue Schreibvorgänge sollen ausschließlich das neue verschlüsselte Format verwenden.
- Später entfernen: Klartext-Lesepfad, Erkennung alter Records und einmalige Migrationslogik, sobald die Datenmigration belastbar abgeschlossen ist.

## Nicht als Provisorium eingestuft

Normale Fehler-Fallbacks, Offline-Verhalten, Startup-Timeout, Player-Fallbacks und Sicherheitsprüfungen sind keine automatischen Rückbaukandidaten. Sie bleiben bestehen, solange sie funktional sinnvoll sind.
