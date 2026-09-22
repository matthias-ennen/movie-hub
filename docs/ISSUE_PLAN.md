# Movie Hub – Issue-Plan

Stand: 22. September 2026

## Arbeitsprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. Vor Beginn eines Pakets wird dessen Umfang noch einmal kurz fachlich und technisch überprüft. Bereits bekannte, gültige Katalogdaten dürfen durch nachgeladene oder partielle Metadaten nicht verschlechtert werden.

## Bereinigter aktueller Status

Zuletzt abgeschlossen bzw. abgenommen:

- #114 – großer Suchindex
- #178 – Staffeln/Folgen
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – Posterreihen-/D-Pad-Paket
- #207 – robuste persönliche TMDB-Synchronisierung
- #218 – Layout/UI-Konsistenz
- #222 – Einstellungen, Profilsteuerung und Sichtbarkeit
- #205 – Verschlüsselung persönlicher Daten und SMB-Konsolidierung
- #190 – automatische Hero-Trailer sowie nativer Trailer-/Teaser-Player
- #225 – verlustfreie Metadaten-Anreicherung
- #228 – robuster nativer Kaltstart
- #117 – Dependency-Audit und Security-Hygiene
- #4 – öffentlicher Waipu-Live-Katalog einschließlich 50-Sender-Bestand, TV-Integration und Geräteabnahme
- #256 – vollständige kanonische Titelmetadaten, gemeinsamer Nachtlauf und atomarer Search-only-Detailpfad
- #259 – exakter Waipu-Programmlink mit sicherer Fallbackkette und Geräteabnahme auf Smartphone, Tablet und Fire TV
- #281 – TV-Hero, Zeitraumwahl und Videothek-Posterreihen
- #283 – gemeinsamer Hero-first-Seitenrahmen für TV
- #285/#289 – TV-/Hero-UI-Finish, Aktivierungsfokus und Folgekorrekturen

Die Fire-TV-App wurde mit diesem Stand zuletzt am 22.09.2026 abgenommen.

## Abgeschlossenes Datenfundament

### #256 – Datenfundament: vollständige kanonische Titelmetadaten vor Veröffentlichung

#256 ist technisch und auf Fire TV vollständig abgenommen. Der zentrale
V3-Titelbestand, der kontrollierte Nachtlauf, der Watchdog sowie der atomare
Search-only-Lade-, Fehler- und Wiederholen-Pfad sind produktiv verifiziert.

- alle katalogrelevanten Titelquellen in einem kanonischen Bestand nach `Medientyp + TMDB-ID` zusammenführen;
- vollständige, geprüfte Metadaten zentral wiederverwenden und kontrolliert aktualisieren;
- TMDB-Änderungslisten als tägliche Schnellspur einsetzen;
- vollständige Titel zusätzlich im rollierenden 30-Tage-Umlauf erneut prüfen;
- #200 für reine Suchdetails wiederverwenden und keine konkurrierende zweite Logik schaffen;
- eine gemeinsame deduplizierte Prioritätswarteschlange aufbauen;
- Code-Deployment und Datenlauf trennen;
- eine vollständige Generation mit gemeinsamer Generationskennung validieren und atomar veröffentlichen;
- bei Teilfehlern den letzten gültigen Stand erhalten;
- verspätete oder ausgefallene Nachtläufe und einen zu alten Datenstand sichtbar melden;
- reine Suchindex-Titel außerhalb sichtbarer Kataloge weiterhin erst beim Öffnen vollständig laden, dabei aber einen geschlossenen Lade-/Fehlerzustand verwenden.

## Triage des Referenzstands APK 0.1.473

Die vollständige Sammlung steht in #254. Die strukturierte
[Bestandsaufnahme ab APK 0.1.473](APP_REVIEW_0.1.473.md) und das
Fortsetzungs-/Triage-Issue #255 bündeln sie in sieben vorläufige beziehungsweise bereits ausgearbeitete Pakete:

1. gemeinsame Inhaltsseiten-Grundlage und Fokus;
2. TV als zeitgesteuerte Videothek;
3. #256 – katalogübergreifendes Datenfundament und kontrollierter Nachtlauf;
4. Trailer und Teaser;
5. TV-Beobachtungen und Erinnerungen;
6. #259 – direkter Start der laufenden Waipu-Sendung;
7. #260 – vollständiger, kontrollierter Senderausbau über 50 hinaus.

Für **Home, Filme, Serien, TV und Meine Inhalte** gilt verbindlich eine
gemeinsame technische Inhaltsseiten-Grundlage. Vor jedem daraus entstehenden
Umsetzungspaket werden die zugehörigen offenen Produktfragen Matthias erneut
einzeln vorgelegt. Die Paketvorschläge ändern die bestätigte Hauptpriorisierung
nicht automatisch; vor #118 wird gemeinsam entschieden, welche Korrekturen
zwingend davor liegen.

## Aktuelle Priorisierung

### 1. #260 – Waipu-Senderbestand über 50 hinaus ausbauen

- offizielle Liste, technischen Stamm und tatsächlich lineare Movie-Hub-Sender abgleichen
- 337 dokumentierte offizielle Listeneinträge und zuletzt 398 technische Einträge klassifizieren
- Catch-up, VOD, Dubletten, regionale Varianten und fehlendes EPG ausweisen
- Ausbau mit Checkpoints, Budgets und Stabilitätsgates in kontrollierten Wellen
- neue Sender standardmäßig aktivieren und bestehende persönliche Einstellungen erhalten
- Compliance-Gate #112 vor öffentlicher Verteilung beachten

### 2. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Beobachten-Aktion direkt am Titel
- rent/buy-only bzw. aktuell nicht inklusive Titel beobachten
- Zustandswechsel zu `flatrate`, `free` oder `ads` erkennen
- Benachrichtigungen nur bei echten Änderungen
- Beobachtung einfach wieder entfernen

### 3. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

- persönliche Signale aus Bewertungen, gesehen/ungesehen, Favoriten und Watchlist nutzen
- persönliche Top-100- und Empfehlungsreihen erzeugen
- automatisierten, reproduzierbaren Job einrichten
- strukturierte Verfügbarkeitsdaten als Faktenbasis verwenden
- Ergebnisse ohne APK-Update aktualisieren

## Weitere spätere Themen

- #129 – Deutsch/Englisch-Umschaltung der Movie-Hub-GUI
- #112 – Compliance als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau

## Abhängigkeitskette

`#4 abgeschlossen → #256 abgeschlossen → #259 abgeschlossen → TV-Grundlage abgeschlossen → #260 Senderausbau in Wellen → #118 → #7`

#4, #256, #259 sowie die TV-Grundlage aus #281, #283, #285 und #289 sind
vollständig abgenommen und geschlossen. Der 50-Sender-Bestand bleibt der gültige
Ausgangsstand. Als nächstes wird #260 nochmals technisch eingegrenzt und danach
in ausdrücklich freizugebenden, kontrollierten Senderwellen umgesetzt.

## Leitentscheidung

Der Waipu-Live-Ausbau verwendet die öffentlich und ohne Anmeldung erreichbaren
Waipu-Sender-, Grid- und Programmdetail-Endpunkte. Ein persönlicher Kontozugang
ist für den Basis-Katalog nicht erforderlich. Der Import läuft zentral,
budgetiert und gecacht; die App erhält ausschließlich fertige, bereinigte
Katalogartefakte. Die Schnittstelle ist nicht öffentlich dokumentiert, daher
bleiben Lastgrenzen, Langzeitstabilität und Rechteprüfung verbindliche Gates.
