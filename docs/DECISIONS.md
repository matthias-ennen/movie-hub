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

## ADR-007 – Automatische Anbieter strikt von eigenen Inhalten trennen

Status: entschieden

Netflix, Prime Video, Disney+, YouTube und waipu.tv sind ausschließlich automatische Anbieter. Ob ein Anbieter bei einem Titel erscheint, wird aus den strukturierten TMDB-Verfügbarkeitsdaten bestimmt. Der Benutzer hinterlegt keine eigenen Anbieter-Links und kann die automatischen Anbieterbuttons nicht bearbeiten.

Beim Öffnen versucht die native Android-/Fire-TV-Schicht weiterhin bestmöglich, den TMDB-Titel an die jeweilige Anbieter-App zu übergeben. Unterstützt die App keine externe Titelsuche, folgen die vorhandenen App-, Suchseiten- und Web-Fallbacks. Diese Suchverbesserung ist Implementierungsdetail und keine Bedienoption oder Garantie.

Der Movie-Hub-Button enthält ausschließlich selbst hinzugefügte Inhalte. Das Bedienmodell kennt dafür nur **Link hinzufügen** und **Video hinzufügen**. Ein Link wird extern geöffnet; ein Video wird im Movie-Hub-Player wiedergegeben. Bei Videos wird HTTP(S), `smb://` oder UNC automatisch aus der Adresse erkannt. SMB-Zugangsdaten bleiben zentral unter **Einstellungen → Netzlaufwerke**.

Bestehende manuelle Anbieter-Links werden nicht gelöscht. Sie werden als normale eigene Links unter dem Movie-Hub-Button weitergeführt. Bestehende explizite SMB-Medientypen werden als Videos weitergeführt; die Netzwerkquelle wird anschließend automatisch aus der URL erkannt.

## ADR-008 – Persönliche Reihen als profilbezogene Filterregeln

Status: entschieden

Selbst konfigurierte Reihen unter **Meine Inhalte** werden als Smart-Reihen modelliert. Ein Profil speichert höchstens zehn Regeln mit Filtertyp, stabiler numerischer ID, sichtbarem Namen, Reihentitel, Aktivstatus und Reihenfolge. Feste Titel-IDs werden nicht in der Regel gespeichert.

Die Treffermenge wird aus dem aktuellen öffentlichen Movie-Hub-Katalog berechnet. Der Katalogjob normalisiert Besetzung, Regie/Serienschöpfer, Keywords, Film-Collections und Jahrzehnte zu kompakten Facetten. Dadurch aktualisieren sich die Reihen automatisch, ohne dass TMDB-Zugangsdaten in die Web-App gelangen.

Version 1 verwendet genau einen Filterwert je Reihe. Komplexe UND-/ODER-Regeln und Smart-Reihen außerhalb von **Meine Inhalte** bleiben späteren Paketen vorbehalten.

## ADR-009 – Movie Hub als virtueller interner Anbieter

Status: entschieden

Eigene Links und Videos bleiben technisch und fachlich von automatischen TMDB-/JustWatch-Anbietern getrennt, bilden in der Oberfläche aber einen vollständigen internen Anbieter **Movie Hub**. Ein automatisch gepflegtes kontoweites Shared-Media-Manifest bestimmt seine Katalogmitgliedschaft. Movie Hub steht in der Anbieterwahl zuerst, ist nach einer versionierten Migration standardmäßig aktiv und kann als reiner Sichtbarkeitsfilter ausgeschaltet werden.

Das Manifest enthält nur eine kompakte Titelreferenz und keine Medien-URL oder SMB-Zugangsdaten. Ein öffentlicher oder profilbezogener Nutzerkatalog wird nicht erzeugt.

## ADR-010 – Deterministische profilbezogene Inhaltskuratierung

Status: entschieden

Flexible Posterreihen und Heroes werden clientseitig aus der jeweils vollständigen verfügbaren Kandidatenmenge kuratiert. Das Profil speichert nur Sortiermodus, Gesehen-Behandlung und optionales Wechselintervall. Die Berechnung ist ohne KI- oder Laufzeit-API reproduzierbar und innerhalb eines Tages beziehungsweise einer Woche stabil.

Fachlich feste Reihen behalten ihre Bedeutung. Persönliche Listen behalten ihre persönliche Reihenfolge. Die koordinierte Hero-Auswahl reserviert bei ausreichender Kandidatenmenge unterschiedliche Starttitel für Home, Filme und Serien.
