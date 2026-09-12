# Movie Hub – Datenmodell

Stand: 12. September 2026

## Ziel

Das Datenmodell trennt externe Filmdaten von persönlichen Nutzerdaten. TMDB bleibt Quelle für allgemeine Filminformationen und Anbieter-Verfügbarkeit; Firestore speichert nur Movie-Hub-spezifische und persönliche Zustände.

## Grundprinzip

Jeder Film wird intern über seine TMDB-ID referenziert. Dadurch müssen Titel, Poster und andere externe Metadaten nicht als persönliche Nutzerdaten dupliziert werden.

## Firestore-Struktur – Version 1

```text
users/{uid}
  displayName
  providerSettings    map          # kontoweite Anbieterauswahl inklusive Movie Hub
  createdAt
  updatedAt

users/{uid}/profiles/{profileId}
  displayName        string
  role               string
  themeSettings      map
  categorySettings   map          # feste Reihen auf Filme/Serien
  contentRowSettings map          # bis zu 10 Smart-Reihen für Meine Inhalte
  contentDisplaySettings map      # Sortierung, Wechselintervall und Gesehen-Behandlung

users/{uid}/profiles/{profileId}/titles/{type-tmdbId}
  watched           boolean
  watchedAt         string | null    # editierbares lokales Datum, YYYY-MM-DD
  watchedMarkedAt   string | null    # exakter ISO-Zeitpunkt für den Gesehen-Verlauf
  favorite          boolean
  watchlist         boolean
  rating            number | null
  note              string
  titleSnapshot     map | null

users/{uid}/movies/{tmdbId}
  rating            number | null   # 1 bis 10
  watched           boolean
  favorite          boolean
  watchLater        boolean
  watchedAt         timestamp | null
  personalNote      string | null
  createdAt         timestamp
  updatedAt         timestamp

users/{uid}/lists/{listId}
  title             string
  description       string | null
  type              string          # manual | generated | system
  movieIds          array<number>
  generatedAt       timestamp | null
  updatedAt         timestamp

users/{uid}/recommendations/{documentId}
  generatedAt       timestamp
  algorithmVersion  string
  source            string          # ai | rules | hybrid
  categories        map/array

users/{uid}/sharedMedia/{type-tmdbId}
  hasMedia          boolean       # automatisch abgeleitete Katalogmitgliedschaft
  titleRef          map           # kompakter, rekonstruierbarer Titelschnappschuss
  updatedAt         timestamp

users/{uid}/sharedMedia/{type-tmdbId}/entries/{entryId}
  label             string          # frei wählbare Bezeichnung
  url               string          # HTTP(S)-Adresse oder bei Videos SMB-Pfad
  type              string          # web | video
  titleRef          map             # TMDB-ID, Medientyp, Titelschnappschuss
  updatedAt         timestamp
```

## Persönlicher Filmzustand

Für Version 1 werden folgende Felder vorgesehen:
- Bewertung 1–10
- gesehen / ungesehen
- Favorit
- später ansehen
- Datum gesehen
- persönliche Notiz

Weitere Felder können später ergänzt werden, ohne das Grundmodell zu ändern.

## Persönliche Listen

Beispiele:
- Meine Top 100
- Heute für dich
- Science-Fiction & Technik
- Thriller & Psychologie
- Politik & Gesellschaft
- große Schlachten & Historie
- Noch nicht gesehen
- Favoriten
- Später ansehen

Systemlisten wie Favoriten oder Watchlist müssen nicht zwingend als separate Dokumente gespeichert werden; sie können aus dem persönlichen Filmzustand berechnet werden. Kuratierte oder KI-generierte Reihen können zusätzlich als Listendokumente persistiert werden.

### Persönliche Smart-Reihen

Die unter **Meine Inhalte** konfigurierten dynamischen Reihen liegen als kleine Regelliste direkt im jeweiligen Profildokument:

```text
contentRowSettings.rows[]
  id          string
  type        string       # cast | creator | keyword | collection | decade
  valueId     number       # stabile TMDB-ID bzw. Beginn des Jahrzehnts
  valueLabel  string       # sichtbarer Namensschnappschuss
  title       string       # automatisch vorgeschlagen, optional angepasst
  enabled     boolean
  order       number
```

Die Liste wird auf zehn gültige, eindeutige Regeln begrenzt. Sie enthält keine feste Titelmenge. Treffer werden clientseitig aus den Facetten des aktuellen öffentlichen Katalogs berechnet; eine leere Regel bleibt gespeichert und kann nach einem späteren Katalogupdate wieder sichtbar werden.

## Eigene Links und Videos

Manuell gepflegte Inhalte liegen kontoweit unter `users/{uid}/sharedMedia` und bewusst nicht unter einem internen Profil. Dadurch sind dieselben Einträge in allen Profilen sichtbar und aus jedem Profil pflegbar. Film und Serie werden im Dokumentschlüssel getrennt, damit identische numerische TMDB-IDs nicht kollidieren.

Das Bedien- und Datenmodell kennt nur zwei Typen:

- `web`: ein eigener Link. Unterstützt werden HTTP- und HTTPS-Adressen. Beim Öffnen wird die passende externe App beziehungsweise der Browser verwendet.
- `video`: ein eigenes Video. Movie Hub erkennt aus der Adresse automatisch, ob es sich um ein HTTP(S)-Video oder um ein Netzwerkvideo über `smb://` beziehungsweise einen UNC-Pfad handelt.

SMB ist damit kein eigener fachlicher Medientyp mehr. Ein Netzwerkvideo enthält ausschließlich einen kanonischen Pfad wie `smb://fritz.box/FRITZ.NAS/Ordner/video.mp4`. Benutzername und Kennwort sind weder Teil dieser URL noch des Firestore-Dokuments. Sie werden je Server/Freigabe ausschließlich auf dem Android-/Fire-TV-Gerät über **Einstellungen → Netzlaufwerke** verwaltet.

Providerbuttons sind vollständig davon getrennt. Netflix, Prime Video, Disney+, YouTube und waipu.tv werden aus den TMDB-Verfügbarkeitsdaten bestimmt. Eigene Provider-Overrides werden nicht mehr gespeichert oder ausgewertet.

Der übergeordnete `sharedMedia/{type-tmdbId}`-Datensatz ist ein automatisch gepflegter Manifest-Eintrag. Er macht alle Titel mit mindestens einem gültigen Link oder Video ohne einzelne Abfrage pro Poster als kontoweiten Movie-Hub-Anbieter-Katalog lesbar. Der erste Eintrag legt das Manifest an, Änderungen aktualisieren es und das Löschen des letzten Eintrags entfernt es. Ältere Einträge werden beim nächsten vorhandenen, bereits progressiv verzögerten Presence-/Detailzugriff nachgezogen. Der Manifest-Datensatz enthält keine URL und keine Zugangsdaten; die eigentlichen Medien bleiben ausschließlich in `entries`.

## Profilbezogene Sortierung und Abwechslung

```text
contentDisplaySettings
  sortMode                 string    # balanced | popular | newest | top-rated | discover
  watchedMode              string    # normal | demote | hide
  autoSwitch.enabled       boolean
  autoSwitch.interval      string    # daily | weekly
  autoSwitch.periodKey     string | null
  autoSwitch.periodOrdinal number | null
```

Die Einstellung liegt im internen Profil. Sie speichert Regeln, keine Titel-IDs. Die wirksame Reihenfolge wird reproduzierbar aus Profil, Wechselperiode, Katalogmetadaten und persönlichem Gesehen-Zustand berechnet.

### Migration bestehender Einträge

Bereits vorhandene Daten bleiben erhalten:

- bisheriger Typ `provider` → `web`; URL und Dokument-ID bleiben erhalten und der Eintrag erscheint künftig unter dem Movie-Hub-Button
- bisheriger Typ `smb` → `video`; URL und Dokument-ID bleiben erhalten, die SMB-Erkennung erfolgt anschließend automatisch aus der Adresse

Die Migration wird beim Laden vorhandener gemeinsamer Medien bestmöglich in Firestore nachgezogen. Ein fehlgeschlagener Migrationsschreibzugriff verhindert nicht, dass ein gültiger Alt-Eintrag weiterhin gelesen wird.

## Externe Filmdaten

TMDB liefert u. a.:
- Titel
- Originaltitel
- Beschreibung
- Erscheinungsdatum
- Laufzeit
- Genres
- Poster
- Backdrops
- Besetzung
- TMDB-Rating
- filterbare Besetzungs-, Regie-/Creator-, Keyword-, Collection- und Jahrzehnt-Facetten für persönliche Reihen

Diese Daten gehören nicht in `users/{uid}/movies`, sondern werden beim Build/über einen Cache oder eine getrennte öffentliche Datenschicht bereitgestellt.

## Provider-Daten

Provider-Verfügbarkeit wird getrennt vom persönlichen Zustand und von eigenen Links/Videos modelliert. Ein möglicher Cache kann später z. B. so aussehen:

```text
catalog/{tmdbId}
  metadataUpdatedAt
  providersUpdatedAt
  providers.de[]
  liveTv[]
```

Ob dieser Cache in Firestore, als Build-Artefakt oder als statische JSON-Datei geführt wird, wird erst nach Prüfung von Datenquelle, Kosten und Aktualisierungsbedarf festgelegt.

## Security-Ziel

- Nicht angemeldete Nutzer dürfen keine persönlichen Daten lesen oder schreiben.
- Ein angemeldeter Nutzer darf ausschließlich Dokumente unter seiner eigenen `uid` lesen und schreiben.
- Öffentliche Katalogdaten werden separat behandelt.
- Administrative/automatisierte Jobs erhalten keine unnötigen Client-Rechte.
- SMB-Zugangsdaten werden niemals in Firestore oder einer Medien-URL gespeichert.

## Beispielregeln – nur als Plan, noch nicht produktiv übernehmen

```text
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;

  match /{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}
```

Vor produktiver Freigabe werden die Regeln genauer validiert und getestet.

## Offene Datenmodellfragen

- Mehrbenutzerfähigkeit vs. zunächst nur ein persönlicher Account
- getrennte Profile innerhalb eines Accounts
- Speicherung von Bewertungsverlauf statt nur aktuellem Wert
- Favoriten/Watchlist als berechnete oder materialisierte Listen
- Cache-Strategie für TMDB- und Provider-Daten
