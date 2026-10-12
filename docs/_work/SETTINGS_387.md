# #387 – Einstellungen und konsistente Anbieterregeln

Stand: 12.10.2026 · Umsetzung von Matthias freigegeben.

## Ziel und Grenzen

Vier Gruppen: Darstellung & Posterreihen, Anbieter & Sender, Mitteilungen,
Verbindungen. Profile/Konto bleiben erreichbar. Alle bisherigen Werte und
Profil-/Konto-/Gerätegrenzen bleiben bestehen. Alte Sender-Sortierwerte bleiben
gespeichert; die neue Anzeige folgt einer gemeinsamen festen Grundordnung.
Persönliche Kategorien und Reihen bleiben sortierbar. #384 bleibt zurückgestellt.

## Umsetzung

1. Eine Providerordnung (Movie Hub, Waipu, Joyn, übrige alphabetisch) für
   Settings, Badges und Reihen. Einmal aufgebautes Anbieter-Lesemodell aus
   vorhandenen TMDB- und Live-Daten, ohne Anfragen je Reihe.
2. Gemeinsame Live-Auswahl für aktive Anbieter/Sender, Tagesprogramm,
   14-Tage-Ansicht und Hero. Sendezeit-/Qualitätsordnung unverändert.
3. Flexible Home-Anbieterreihen verwenden denselben Profilsortierpfad wie
   Filme/Serien; kein Vorrang aller Filme vor Serien.
4. Kleine Settings-Komponenten und bedarfsgerechte Unterseiten; einheitliche
   Schalter, stabiler Fokus während Save und bei Zurücknavigation.
5. Persönliche Darstellungs-/Reihenoptionen aus Profil & Design in die
   passende Settings-Gruppe verschieben. Profilverwaltung/Konto erhalten.

## Prüfungen

- Anbieterordnung, gültige Katalog-IDs, leere/deaktivierte Reihen.
- Gemischte Home-Kandidaten, Waipu/Joyn-Mitgliedschaft, keine Titelduplikate.
- Anbieter-/Senderschalter inklusive gemischter Ausstrahlungen und Ablauf.
- Persönliche Reihen, Top 10, Verlauf und Fachlimits erhalten.
- Save-Fokus, Navigation vor/zurück, Datenbestand und Profilwechsel.
- Unit-Suite und Build; CI-Regeltests vor Bereitstellung.
- Matthias: Smartphone und Fire TV – noch offen.

## Technischer Abschluss vor CI

- 968 Tests / 157 Dateien erfolgreich; Produktionsbuild erfolgreich.
- Gezielte Browserprüfung mit simulierten Speichervorgängen erfolgreich:
  Menüwege, 18 Anbieter, 228 Sender, Suche, Fokus, Fehlerrollback,
  Kategorieverschiebung, Posteranzahl und schmale Ansicht.
- Hauptbundle +1,59 KB gzip; Settings/Profile zusammen −1,10 KB gzip.
- Architektur, vollständiges Anbieterinventar und Abnahmeumfang: [SETTINGS.md](../SETTINGS.md).
- CI/Deployment werden im PR und #387 nachgewiesen; reale Geräteabnahme offen.
