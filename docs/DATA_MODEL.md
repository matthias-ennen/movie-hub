# Movie Hub – Datenmodell

Stand: 31. August 2026

## Ziel

Das Datenmodell trennt externe Filmdaten von persönlichen Nutzerdaten. TMDB bleibt Quelle für allgemeine Filminformationen; Firestore speichert nur Movie-Hub-spezifische und persönliche Zustände.

## Grundprinzip

Jeder Film wird intern über seine TMDB-ID referenziert. Dadurch müssen Titel, Poster und andere externe Metadaten nicht als persönliche Nutzerdaten dupliziert werden.

## Firestore-Struktur – Version 1

```text
users/{uid}
  displayName
  createdAt
  updatedAt

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
  source             string         # ai | rules | hybrid
  categories        map/array

users/{uid}/sharedMedia/{type-tmdbId}/entries/{entryId}
  label             string          # frei wählbare Bezeichnung
  url               string          # erreichbare HTTP(S)-Adresse
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

## Gemeinsame Movie-Hub-Medien

Manuell gepflegte Web- und Video-URLs liegen kontoweit unter `users/{uid}/sharedMedia` und bewusst nicht unter einem internen Profil. Dadurch sind dieselben Einträge in allen Profilen sichtbar und aus jedem Profil pflegbar. Film und Serie werden im Dokumentschlüssel getrennt, damit identische numerische TMDB-IDs nicht kollidieren.

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

Diese Daten gehören nicht in `users/{uid}/movies`, sondern werden beim Build/über einen Cache oder eine getrennte öffentliche Datenschicht bereitgestellt.

## Provider-Daten

Provider-Verfügbarkeit wird getrennt vom persönlichen Zustand modelliert. Ein möglicher Cache kann später z. B. so aussehen:

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
