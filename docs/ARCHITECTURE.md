# Movie Hub – Architektur

Stand: 13. September 2026

## Ziel

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für mehrere Streaming-Dienste. Die Anwendung soll auf Fire TV laufen, Filme plattformübergreifend darstellen, persönliche Bewertungen und Listen speichern und Filme nach Möglichkeit direkt in der passenden Streaming-App öffnen.

## Systemübersicht

### GitHub
- Quellcode und Versionsverwaltung
- Issues, Roadmap und Projektdokumentation
- CI/CD-Workflows
- keine geheimen Schlüssel im Repository

### Firebase Hosting
- Hosting der zentralen Movie-Hub-Web-App
- dieselbe Web-App wird im Browser und innerhalb der Fire-TV-APK verwendet
- Deployments aus `main` liefern UI- und Katalogänderungen ohne APK-Neuinstallation aus

### Firebase Authentication
- zentrale Benutzeridentität für persönliche Daten
- Start mit E-Mail/Passwort
- später optional komfortablere Geräte-Kopplung für Fire TV

### Cloud Firestore
- persönliche Bewertungen
- gesehen / ungesehen
- Favoriten
- Watchlist / später ansehen
- persönliche Notizen
- persönliche Listen und daraus abgeleitete Empfehlungen
- kontoweit gemeinsame eigene Links und Videos je Titel
- Zugriff ausschließlich über definierte Security Rules

### TMDB
- stabile Filmreferenz über TMDB-ID
- deutsche Titel und Beschreibungen
- Poster und Backdrops
- Laufzeit, Genres, Bewertungen und Besetzung
- Watch-Provider-Daten soweit technisch und lizenzrechtlich geeignet

### Provider-Layer
Unterstützte Zielanbieter:
- Netflix
- Prime Video
- Disney+
- YouTube
- waipu.tv / lineares Fernsehen

Die Anbieter sind systemseitig und vollständig automatisch. TMDB bestimmt, welche Provider bei einem Titel angezeigt werden. Der Benutzer kann Anbieterbuttons weder bearbeiten noch mit eigenen Ziel-URLs überschreiben.

Zusätzlich erscheint **Movie Hub** an erster Stelle der kontoweiten Anbieterauswahl. Dieser interne virtuelle Anbieter wird nicht von TMDB erzeugt: Seine Katalogmitgliedschaft entsteht automatisch aus den kontoweiten eigenen Links und Videos. Das Ausschalten blendet Movie-Hub-Reihen, -Badges und den Wiedergabebutton aus, löscht aber keine eigenen Inhalte.

Auf Filmkarten werden nur kompakte Provider-Symbole eingeblendet. In der Detailansicht stehen die automatisch ermittelten Anbieter neben einem optionalen Movie-Hub-Button für eigene Inhalte.

### Eigene Movie-Hub-Inhalte

Der Movie-Hub-Button ist fachlich vom Provider-Layer getrennt. Unter ihm liegen ausschließlich vom Benutzer selbst hinzugefügte Inhalte:

- **Link**: HTTP(S)-Adresse, die in der passenden externen App beziehungsweise im Browser geöffnet wird
- **Video**: HTTP(S)-Video oder SMB-/UNC-Netzwerkvideo; das zugrunde liegende Protokoll wird automatisch aus der Adresse erkannt

SMB ist kein eigener Bedien- oder Medientyp. Zugangsdaten und Netzlaufwerksdefinitionen bleiben ausschließlich gerätelokal unter **Einstellungen → Netzlaufwerke**.

Ein kontoweites Shared-Media-Manifest bildet daraus ohne öffentlichen Nutzerkatalog und ohne Abfrage jeder Posterkarte die Movie-Hub-Katalogsicht. Vor der Manifest-Einführung gespeicherte Einträge werden bei ihrem nächsten kontrollierten Presence-/Detailzugriff automatisch nachgezogen.

Anbieterzugehörigkeit und Titelmetadaten bleiben getrennte Wahrheiten: Mindestens ein gültiger eigener Link oder ein Video erzeugt die Movie-Hub-Mitgliedschaft; das gemeinsame Lesemodell ergänzt daraus die Anbieter-ID `moviehub`. Die kompakte Titelreferenz wird profilgebunden beim Laden des Movie-Hub-Katalogs sowie beim Öffnen eines Titels zunächst aus veröffentlichten Detail-Shards vervollständigt. Ist der veröffentlichte Datensatz selbst noch unvollständig, lädt die Android-/Fire-TV-Shell den einzelnen Titel über den verschlüsselt gerätelokal gespeicherten TMDB-Token und gibt ausschließlich bereinigte Metadaten an die WebView zurück. Ein vertrauenswürdiger Firestore-/TMDB-Backfill bleibt als zusätzliche Schutzschicht vorgesehen, sobald das Deployment-Dienstkonto Firestore-Datenzugriff besitzt. Vollständige Manifestmetadaten haben beim Zusammenführen Vorrang vor schwächeren Browse-Snapshots.

### Profilbezogene Inhaltskuratierung

Flexible Anbieter-, Kategorie-, Entdeckungs- und Smart-Reihen trennen Kandidatenmenge, Sortierung und sichtbares Posterlimit. Das aktive Profil wählt zwischen ausgewogen, beliebt, neu, bestbewertet und stärker entdeckungsorientiert. Ein optionaler täglicher oder wöchentlicher Wechsel bleibt innerhalb der Periode stabil. Gesehene Titel können in öffentlichen Reihen normal erscheinen, nach hinten rücken oder ausgeblendet werden.

Home, Filme und Serien koordinieren ihre Hero-Auswahl gemeinsam. Bei ausreichender Kandidatenmenge verwenden die drei Seiten unterschiedliche erste Heroes; weitere Überschneidungen bleiben zulässig. Semantische Neuheiten-/Trendreihen sowie persönliche Watchlist-, Favoriten-, Bewertungs- und TMDB-Reihen behalten ihre fachliche Ordnung.

### Top-10-Sonderreihen

Home, Filme, Serien und Meine Inhalte setzen nach der dritten tatsächlich sichtbaren normalen Posterreihe eine größere, nummerierte Top-10-Reihe ein. Sie bleibt Teil desselben progressiven Render- und D-Pad-Pfads; die Posterkarte selbst wird wiederverwendet.

Die öffentlichen Listen aggregieren die bereits geordneten Rohlisten aller aktivierten Anbieter mit normalisierten Positionspunkten. Gleiche Titel werden über Medientyp und TMDB-ID zusammengeführt; Home strebt bei ausreichender Auswahl fünf Filme und fünf Serien an. Movie Hub ist als aktivierbare eigene Rangquelle enthalten und ordnet seinen Katalog nach den vorhandenen TMDB-Qualitätssignalen.

Die persönliche Liste wird ausschließlich aus tatsächlich vorhandenen persönlichen Reihen gebildet. Profilbezogene Movie-Hub-Bewertungen haben Vorrang, danach folgen die kontoweiten persönlichen TMDB-Bewertungen und schließlich TMDB-Beliebtheit sowie belastbare Tie-Breaker. Die allgemeinen profilbezogenen Sortier- und Gesehen-Einstellungen verändern die nummerierte Rangfolge bewusst nicht. Es entstehen weder zusätzliche Laufzeit-API-Aufrufe noch Firestore-Lesevorgänge je Poster.

Direkt hinter der persönlichen Top 10 folgt **Als gesehen markiert** als profilbezogener Verlauf mit höchstens 100 Titeln. Neue Markierungen speichern zusätzlich zum editierbaren Gesehen-Datum einen exakten Markierungszeitpunkt; die jüngste steht vorn. Bestehende Datensätze ohne diesen Zeitpunkt bleiben über ihr Gesehen-Datum stabil einsortiert.

### Persönliche Smart-Reihen

Unter **Meine Inhalte** können interne Movie-Hub-Profile bis zu zehn eigene dynamische Posterreihen verwalten. Gespeichert wird jeweils eine profilbezogene Filterregel, keine feste Kopie von Titel-IDs. Die Reihen werden beim Laden aus dem aktuellen öffentlichen Katalog berechnet und aktualisieren sich dadurch mit jedem erfolgreichen Katalogwechsel automatisch.

Unterstützte Facetten sind Besetzung, Regie/Serienschöpfer, TMDB-Keyword, Film-Collection und Jahrzehnt. Der vertrauenswürdige Katalogjob verdichtet die dafür benötigten TMDB-Daten zu numerischen Facetten pro Titel sowie deduplizierten Auswahlverzeichnissen. Die Web-App erhält weder den serverseitigen noch einen persönlichen TMDB-Schlüssel.

Diese Smart-Reihen sind fachlich und technisch von den festen Film-/Serienkategorien sowie von Watchlist, Favoriten, Bewertungen und synchronisierten TMDB-Listen getrennt.

### Filmreihen-Navigation

Der vertrauenswürdige Katalogjob löst die bei Filmen vorhandene TMDB-Collection-ID einmal je Sammlung über den offiziellen Collection-Endpunkt auf. `catalog.json` enthält daraus einen kompakten `collections`-Index mit Sammlungsmetadaten und sämtlichen von TMDB gelieferten Teilen. Vorhandene vollständige Katalogtitel reichern diese Einträge um die aktuelle Anbieterinformation an; Teile außerhalb des Browse-Katalogs bleiben als reduzierte öffentliche Detailobjekte navigierbar. Zusätzlich können persönliche Movie-Hub-Manifeste ihre eigene kompakte Collection-Teileliste tragen, wenn ihr Titel außerhalb des Browse-Katalogs liegt. Der Browser benötigt dafür keinen TMDB-Schlüssel und führt keine direkten TMDB-Laufzeitabfragen aus.

Auf der Film-Detailseite erscheint vor Videos und Anbieteraktionen ein eigener Abschnitt **Filmreihe**. Das darüber geöffnete Auswahlfenster zeigt alle Teile nach Veröffentlichungsdatum, markiert den aktuellen und den profilbezogenen Gesehen-Status und weist Verfügbarkeit immer je Einzeltitel aus. Die Auswahl ersetzt den aktuellen Film innerhalb derselben Detailansicht. Serien, eigene Sammlungen, Sammlungskacheln und eine eigenständige Sammlungsseite gehören nicht zu dieser ersten Stufe.

### Serien-, Staffel- und Folgen-Navigation

Serien tragen nur kompakte, sortierte Staffelzusammenfassungen. Die wesentlich größeren Episodenlisten liegen in einem eigenen öffentlichen, nach Serien-ID aufgeteilten Shard-Katalog und werden erst durch **Folgen anzeigen** geladen. Staffelwechsel aktualisieren das linke Poster mit Rückfall auf das Serienposter. Eine Folgenselektion ersetzt weder Route noch Titelobjekt, sondern öffnet einen Episodenkontext innerhalb derselben Detailansicht. Dadurch bilden Folgenauswahl, Episodenkontext und Serien-Detailseite klar getrennte Zurück- und Fokusebenen für Touch, Tastatur und D-Pad.

Der tägliche vertrauenswürdige TMDB-Job erzeugt Staffelzusammenfassungen und Episodenshards inkrementell. Die Web-App führt dafür keine direkten TMDB-Abfragen aus. Fehlen die neuen Felder in einem älteren Katalog, bleibt die bisherige Serien-Detailansicht ohne Navigationsblock erhalten.

### Fire-TV-App
- schlanke Android-/Fire-OS-APK
- lädt die zentrale Web-App
- D-Pad-/Fernbedienungsnavigation
- native Bridge für Android Intents, App-Starts, Web-/YouTube-Links und SMB-Wiedergabe
- automatische Provider-Fallback-Kette: bestmögliche Titelsuche -> anbietereigene Such-/Startadresse -> App öffnen -> Web-Fallback
- YouTube behält seine auf Fire TV funktionierende HTTPS-Titelsuche als bevorzugten ersten Versuch

Die Titelsuche ist Best Effort. Ob eine fremde Anbieter-App externe Suchparameter verarbeitet, entscheidet die jeweilige App; Movie Hub garantiert deshalb nur den bestmöglichen Start, nicht die titelgenaue Zielseite.

### Hero-first-Renderpfad

Home, Filme, Serien und Meine Inhalte verwenden denselben gestuften Seitenaufbau:

1. Die endgültige Hero-Fläche und der Hero-Inhalt werden zuerst gemountet.
2. Das aktive Backdrop-Bild wird eager und mit hoher Priorität geladen.
3. Nach Bild-Load, Bildfehler, fehlendem Bild oder einem begrenzten Timeout wird zunächst genau eine Posterreihe freigegeben.
4. Weitere Reihen werden in Viewportnähe oder auf eine D-Pad-Anforderung einzeln ergänzt.
5. Posterbilder bleiben lazy und nachrangig; Movie-Hub-Verfügbarkeit kommt primär aus dem einmal kontoweit geladenen Manifest. Nur die einmalige Nachmigration älterer Einträge verwendet weiterhin die in Viewportnähe verzögerte Presence-Prüfung.

Beim nativen Kaltstart gilt zusätzlich ein expliziter Handshake: Der anfänglich leere Katalog darf keine Hero-Bereitschaft melden. Erst wenn der echte Katalog verarbeitet, das Hero-Bild geladen beziehungsweise kontrolliert fehlgeschlagen und die erste Reihe über zwei Renderframes stabil gemountet ist, meldet die Web-App die Home-Oberfläche an Android. Die native Startfläche bleibt mindestens fünf Sekunden sichtbar und beendet die CRT-Sequenz nach spätestens zwölf Sekunden, ohne diesen visuellen Grenzwert mit einem Ladefehler gleichzusetzen. Ist Home dann noch nicht bereit, bleibt die WebView unter einer neutralen Ladefläche aktiv. Der Katalogabruf und echte Hauptseitenfehler werden automatisch wiederholt; nach 30 Sekunden ohne Bereitschaft erfolgt einmalig ein vollständiger Neuaufruf. Erst wenn auch dieser Versuch scheitert, erscheint die Wiederholen-Aktion. Ein späteres gültiges Bereitschaftssignal wird auch dann noch angenommen, blendet die Fehlerfläche selbstständig aus und gibt anschließend den Startfokus frei.

### Automatische Hero-Trailer-Sequenz

Bei aktivierter profilbezogener Trailer-Automatik durchlaufen Home, Filme, Serien und Meine Inhalte ihre sichtbaren Heroes einmalig von vorn nach hinten. Jeder Hero beginnt mit der eingestellten Wartezeit. Besitzt er keinen gültigen YouTube-Trailer, wechselt die Web-App danach direkt zum nächsten Hero. Teaser bleiben für die manuelle Wiedergabe zulässig, gelten in der automatischen Sequenz jedoch nicht als Trailer.

Beim nativen Kaltstart wird der erste Home-Hero erst nach dem vollständigen Entfernen der Startfläche fokussiert; dadurch beginnt sein Profiltimer weder zu früh noch verdeckt hinter dem Intro. Ist kein Hero vorhanden, bleibt der Navigationspunkt **Home** der kontrollierte Fokus-Rückfall.

Der native Trailerplayer unterscheidet `completed`, `dismissed` und `error`. Erst nach einem natürlichen Videoende führt er den vollständigen CRT-Switch-Off aus, schließt die Activity und meldet anschließend `completed` zusammen mit einer eindeutigen Anforderungskennung an die Web-App zurück. Der technisch unvermeidliche vorübergehende Fokuswechsel zur Player-Activity lässt diese laufende Anforderung bestehen. Android hält die Rückmeldung über den `onResume`-Übergang hinweg vor, stellt sie wiederholt zu und verwirft sie erst nach einer Bestätigung der Web-App oder einem begrenzten Sicherheits-Timeout. Die Web-App wartet nach der bestätigten Rückmeldung weitere drei Sekunden und aktiviert dann den nächsten Hero, dessen eigener Profiltimer neu beginnt. Manuelles Schließen, Wiedergabefehler, echter Fokusverlust ohne laufenden Player, Seitenwechsel und veraltete Rückmeldungen lösen keinen automatischen Wechsel aus. Beim letzten Hero endet die Sequenz ohne Rücksprung zum ersten Hero.

Der nicht fokussierbare Lade-Sentinel kann keine D-Pad-Sackgasse erzeugen. Fordert die Fernbedienung unterhalb der letzten bereits sichtbaren Reihe den nächsten Inhalt an, wird die nächste Reihe synchron zur Navigation freigegeben und ihr räumlich passendes Poster fokussiert.

### Automatisierung / KI
Objektive Fakten werden programmatisch ermittelt; KI erzeugt Empfehlungen, keine Verfügbarkeitsfakten.

Mögliche regelmäßige Jobs:
- Provider-Verfügbarkeit aktualisieren
- TV-/waipu-Daten aktualisieren
- neue Filme einordnen
- aus persönlichen Bewertungen neue Empfehlungen und Toplisten erzeugen

## Architekturprinzipien

1. Externe Filmdaten und persönliche Nutzerdaten strikt trennen.
2. Automatische Provider und benutzereigene Links/Videos strikt trennen.
3. Keine geheimen Zugangsdaten im Client oder öffentlichen Repository.
4. TV-first: Bedienbarkeit mit Fernbedienung ist Kernanforderung.
5. Web-App und APK klar trennen: Inhalte/Web-UI zentral, native Gerätefunktionen in der APK.
6. Provider-Verfügbarkeit und Deep-Link-/Suchfähigkeit sind zwei getrennte Probleme.
7. Firestore wird von Anfang an mit Authentication und restriktiven Regeln betrieben.
8. Erst belastbare Basis, danach Automatisierung und KI.

## Aktueller Infrastrukturstand

- GitHub-Repository: `matthias-ennen/movie-hub`
- Firebase-Projekt: `movie-hub`
- Firebase Project ID: `movie-hub-62459`
- Web-App: `movie-hub-web`
- Firestore: Standard Edition, Region `europe-west3` (Frankfurt), Produktionsmodus
- Firebase Authentication: E-Mail/Passwort aktiviert
- TMDB: täglicher Katalog und deutsche Watch-Provider-Daten integriert

## Noch bewusst offen

- weitere belastbare App-spezifische Such-/Deep-Link-Verbesserungen je Anbieter
- geeignete Quelle für deutsches Live-TV/EPG
- endgültige Darstellung und Branding der Provider-Symbole
- genaue Form der täglichen Empfehlungsautomation
- Geräte-Kopplung ohne Texteingabe auf Fire TV
