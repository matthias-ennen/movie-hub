# Movie Hub – Dependency-Audit

Stand: 18. September 2026

## Geltungsbereich

Dieses Dokument hält die technische Bewertung aus GitHub-Issue #117 fest und dient zugleich als Vorarbeit für das Release-/Compliance-Gate #112.

Geprüft wurden der vollständige npm-Abhängigkeitsbaum, der reine Produktionsbaum sowie die tatsächliche Verwendung der direkten Pakete in Web-App, Wartungsskripten und CI/CD.

## Umgesetzte Aktualisierungen

- `firebase-admin`: 13.x → 14.4.0
- `firebase-tools`: 14.x → 15.30.2
- `vitest`: 3.x → 5.0.1
- `package-lock.json` als verbindliche, reproduzierbare Auflösung ergänzt
- CI, Firebase-Deployment und TMDB-Smoke-Test von `npm install` auf `npm ci` umgestellt
- CI-Gate `npm audit --audit-level=high` ergänzt

`firebase-admin` ist keine Browser- oder App-Laufzeitabhängigkeit. Das Paket wird ausschließlich von vertrauenswürdigen Wartungs- und Deploy-Skripten verwendet und ist deshalb korrekt unter `devDependencies` eingeordnet.

## Audit-Ergebnis

| Prüfung | Critical | High | Moderate | Bewertung |
| --- | ---: | ---: | ---: | --- |
| `npm audit --omit=dev` | 0 | 0 | 0 | Produktiver Web-Abhängigkeitsbaum ohne bekannte Findings |
| vollständiges `npm audit` | 0 | 0 | 7 | ausschließlich Build-/Deploy-Werkzeuge |

Der ursprüngliche Critical-Fund in `tar` ist durch das Update von `firebase-tools` beseitigt. Ebenso verbleibt kein High-Fund.

## Verbleibende moderate Findings

Alle sieben Einträge stammen aus dem aktuellen `firebase-tools`-Abhängigkeitsbaum:

- `@google-cloud/pubsub` / `@opentelemetry/core`: mögliche Speicherüberlastung durch speziell präparierte Baggage-Header
- `csv-parse`: Prototype-Replacement über speziell präparierte CSV-Strukturen
- `stream-json`: mögliche CPU-/Event-Loop-Überlastung durch tief verschachtelte JSON-Daten
- `gaxios` / `uuid`: fehlende Puffergrenzenprüfung in bestimmten UUID-Funktionen
- `firebase-tools`: Sammelbefund aufgrund der genannten transitiven Abhängigkeiten

Diese Pakete werden weder an den Browser ausgeliefert noch in die Android-/Fire-TV-App eingebettet. Sie laufen ausschließlich kontrolliert in lokaler Entwicklung beziehungsweise GitHub Actions. Movie Hub übergibt diesen Werkzeugpfaden keine nicht vertrauenswürdigen CSV-, Baggage- oder frei gestaltbaren JSON-Eingaben.

Für die aktuelle `firebase-tools`-Version existiert laut npm-Audit keine sichere automatische Auflösung. Der angebotene erzwungene Wechsel auf `firebase-tools@10.1.1` wäre ein erheblicher Rückschritt und beseitigt die Ursache nicht kontrolliert. Auch ein Audit-Dry-Run ergab keine gefahrlose Lockfile-Änderung. Deshalb bleiben die moderaten transitiven Findings dokumentiert, bis Firebase aktualisierte Abhängigkeiten veröffentlicht.

## Dauerhafte Schutzmaßnahmen

- Das Lockfile verhindert unbemerkte unterschiedliche transitive Auflösungen zwischen lokalen Installationen und CI.
- `npm ci` bricht bei einer Abweichung zwischen `package.json` und Lockfile ab.
- CI schlägt bei neuen High- oder Critical-Funden fehl.
- Moderate Findings bleiben sichtbar und werden bei Dependency-Arbeit erneut bewertet.
- Automatische `npm audit fix --force`-Änderungen werden nicht eingesetzt.
