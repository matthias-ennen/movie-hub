# Movie Hub – Architekturentscheidungen

## ADR-001 – Firebase statt GitHub Pages als Plattformbasis

Status: entschieden

Movie Hub verwendet Firebase Hosting für die Web-App und Cloud Firestore + Firebase Authentication für persönliche Daten. GitHub bleibt Quelle für Code, Dokumentation, Issues und CI/CD.

## ADR-002 – TMDB-ID als Filmreferenz

Status: entschieden

Filme werden intern primär über ihre TMDB-ID referenziert. Persönliche Zustände werden von externen Metadaten getrennt gespeichert.

## ADR-003 – Web-App plus native Fire-TV-APK

Status: entschieden

Die zentrale Oberfläche bleibt eine Web-App. Eine schlanke Android-/Fire-OS-APK stellt Fire-TV-spezifische Navigation und native Deep-Link-/Intent-Funktionen bereit.

## ADR-004 – Provider-Symbole statt Textbadges

Status: entschieden

Auf Postern sollen nur kompakte Provider-Symbole erscheinen. Bei mehreren Wiedergabeoptionen öffnet sich eine Anbieterauswahl.

## ADR-005 – KI nur für Personalisierung

Status: entschieden

Verfügbarkeit, Metadaten und andere objektive Fakten werden aus strukturierten Quellen ermittelt. KI darf Empfehlungen, Rankings und Kategorien erzeugen, aber keine Verfügbarkeitsfakten erfinden.

## ADR-006 – Täglicher, atomarer TMDB-Katalog

Status: entschieden

Movie Hub erzeugt seinen öffentlichen Katalog täglich in einem vertrauenswürdigen
GitHub-Actions-Workflow. TMDB-Zugangsdaten bleiben dabei ausschließlich in GitHub
Secrets. Der Ablauf validiert vor dem Firebase-Deploy, dass jede sichtbare Reihe
ausreichend aktuelle Titel mit einem unterstützten deutschen Anbieter enthält.
Bei einem Fehler wird kein Teilkatalog veröffentlicht; Firebase Hosting liefert
weiterhin den zuletzt erfolgreichen Stand aus.

Die Entdeckungsregeln sind zentral konfiguriert. Persönliche Zustände werden
zusätzlich mit einer kleinen öffentlichen Titelkopie abgesichert, damit sie von
einem dynamischen Katalogwechsel unabhängig bleiben.
