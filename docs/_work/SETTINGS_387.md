# #387 – Einstellungen und konsistente Anbieterregeln

Stand: 13.10.2026 · Umsetzung und Navigations-Fine-Tuning von Matthias freigegeben.

## Freigegebenes Navigations-Fine-Tuning – 13.10.2026

Die folgenden Vorgaben ersetzen die erste Vier-Gruppen-Navigation, nicht
die bestehenden Anbieter-/Sender-/Persistenzregeln. Freigabe: „Okay. In
unserem Stil umsetzen“ nach vollständiger Skizze.

- Eine Übersicht, elf direkte Kacheln: Profil (sechs), Für alle Profile
  (drei), Dieses Gerät (zwei). Gruppen sind Überschriften, keine Seiten.
- Flache Unterseiten mit kompakter, bleibend sichtbarer Breadcrumb-Kopfzeile
  und Geltungsbereich. Profilname oben statt Hinweis unter den Kacheln.
- Ein gemeinsamer Rückweg für Breadcrumb und Hardware-Zurück; Fokus und
  Scrollposition der Übersicht erhalten. Keine neuen globalen Tastaturregeln.
- Netzlaufwerke und TMDB-Verbindung einzeln öffnen, bestehende Funktionen
  und Zugangsdaten-/Kontogrenzen unverändert.
- In Profile & Konto ausschließlich mittlere Verweiskachel entfernen.
- Gezielt prüfen: alle elf Wege, Zurück per Tastatur/Klick, Scrollposition,
  Sticky-Kopf und Fokus, lange Senderliste, Smartphone/TV-Breiten,
  getrennte Geräteverbindungen. Geräteabnahme bleibt bei Matthias.

### Technischer Prüfstand des Fine-Tunings

- 970 Tests in 157 Dateien, Produktionsbuild und Diff-Prüfung erfolgreich.
- Chromium mit echten Settings-/Profil-Komponenten, Theme und D-Pad-Hook;
  externe Profil-/Speicher-/Gerätegrenzen simuliert, keine Kontodaten verändert.
- Alle elf Direktwege, drei Geltungsbereiche, Breadcrumb/Escape-Rückweg mit
  exakter Kachel und Scrollposition, Profilwechsel, Speicherfokus, Suche und
  Sticky-Fokus in einer Liste mit 228 Sendern erfolgreich geprüft.
- Getrennte Geräteverbindungen und zwei verbleibende Profil-/Kontokacheln
  bestätigt. 1280 × 720 und 390 × 844 ohne Überlauf oder Browserfehler.
- Kein neuer Datenabruf, keine Abhängigkeit und keine native Änderung;
  Hauptbundle +0,04 KB gzip, Settings +0,44 KB gzip. Keine neue APK nötig.
- CI und Veröffentlichung im Folge-PR/Issue nachweisen. Echte Smartphone-/
  Fire-TV-Abnahme bleibt offen; Browserprüfung ist keine Geräteabnahme.

Die folgenden Abschnitte dokumentieren die zuerst gelieferte Stufe.

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
