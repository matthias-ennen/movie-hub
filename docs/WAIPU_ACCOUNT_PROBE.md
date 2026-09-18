# Historischer persönlicher Waipu-Konto-Machbarkeitsnachweis

> Status 18.09.2026: historischer, technisch vorbereiteter Prototyp. Der
> produktive #4-Pfad verwendet inzwischen die ohne Anmeldung erreichbaren
> Sender-, EPG-Grid- und Programmdetail-Endpunkte. Dieser Konto-Prototyp bleibt
> als Sicherheits- und Forschungsartefakt dokumentiert, ist aber keine
> Voraussetzung für den Waipu-Live-Katalog mehr.

Stand: 18. September 2026

## Zweck

Diese Komponente war die ursprünglich vorgesehene Umsetzungsstufe **#4B**. Sie
prüft mit einem persönlichen waipu.tv-Konto, ob der inoffizielle, aus der Kodi-Erweiterung
`flubshi/pvr.waipu` bekannte technische Datenweg für Movie Hub grundsätzlich
tragfähig ist.

Der Runner prüft ausschließlich:

1. OAuth-Geräteanmeldung ohne Waipu-Passwort;
2. einmalige Erneuerung der erhaltenen Sitzung;
3. Zählung der persönlichen sichtbaren, gesperrten und ausgeblendeten Sender;
4. sparsame EPG-Stichproben an höchstens drei Live-Sendern;
5. Stichproben bei 0, 1, 3, 7 und 14 Tagen;
6. höchstens drei Programmdetails;
7. Requestzahl, Antwortgrößen, HTTP-Status und vorhandene Feldnamen.

Er erzeugt noch keinen Waipu-Katalog und ist kein Bestandteil des normalen
App-Starts.

## Klare Grenzen

- keine Firestore-Schreibzugriffe;
- keine Änderung von `public/catalog.json`;
- keine Streaming-, Aufnahme-, Replay-, Tuner- oder DRM-Endpunkte;
- kein Waipu-Passwort;
- keine dauerhafte Tokenablage;
- keine vollständigen API-Antworten im Bericht;
- keine Senderkennungen, Program IDs oder Programmtitel im Bericht;
- kein automatischer CI-Live-Test mit einem persönlichen Konto.

## Voraussetzung für den Live-Test

waipu.tv stellt derzeit keine öffentlich dokumentierte Entwickler-API und
keine offiziell für Movie Hub ausgegebene OAuth-Client-Konfiguration bereit.
Die im inoffiziellen Kodi-Projekt verwendete Client-Authentifizierung wird
deshalb nicht in dieses Repository kopiert.

Ein Live-Test darf erst starten, wenn eine für diesen privaten Test autorisierte
Client-Authentifizierung vorliegt. Sie wird als Base64-Anteil des HTTP-Basic-
Headers nur für den laufenden Prozess gesetzt:

```bash
read -rsp 'Temporäre OAuth-Client-Authentifizierung: ' WAIPU_OAUTH_CLIENT_AUTH_B64
export WAIPU_OAUTH_CLIENT_AUTH_B64
npm run waipu:account:probe
unset WAIPU_OAUTH_CLIENT_AUTH_B64
```

Der Wert darf nicht in `.env`, Shell-Historie, GitHub-Issues, Workflow-Dateien
oder Commit-Inhalte übernommen werden. Für einen kontrollierten manuellen Test
sollte er in der jeweiligen Shell verdeckt eingelesen oder über einen dafür
geeigneten temporären Secret-Mechanismus bereitgestellt werden.

## Manueller Ablauf

1. `npm ci` ausführen.
2. Client-Authentifizierung nur für den aktuellen Prozess bereitstellen.
3. `npm run waipu:account:probe` starten.
4. Die angezeigte Bestätigungsadresse auf einem persönlichen Gerät öffnen.
5. Den kurzlebigen Benutzercode bestätigen.
6. Warten, bis der lokale Runner den bereinigten Bericht geschrieben hat.
7. Bericht unter `artifacts/waipu-account-probe/report.json` prüfen.
8. Die temporäre Client-Authentifizierung aus der Umgebung entfernen.

Ein Abbruch mit `Strg+C` beendet den Polling-Ablauf kontrolliert. Fehler bei
401/429/5xx oder unerwarteten Antworten erzeugen keinen unbegrenzten
Wiederholungs-Loop.

## Lastgrenzen

Standardwerte:

- höchstens drei repräsentative Live-Sender;
- fünf einzelne Vier-Stunden-Fenster je Sender;
- höchstens drei Programmdetails;
- Parallelität 1, maximal konfigurierbar bis 4;
- höchstens 180 Requests einschließlich des OAuth-Pollings;
- 15 Sekunden Timeout je Request;
- 2 MiB maximale Antwortgröße je Request.

Die Horizonte sind Stichproben und kein vollständiger 14-Tage-Download. Erst
nach der Messung wird für #4D entschieden, welcher Zeitraum mit vertretbarer
Last rollierend synchronisiert werden kann.

## Bereinigter Bericht

Der JSON-Bericht enthält:

- Erfolg oder Fehlerstufe des Geräteflusses und Token-Refreshs;
- ausschließlich die Information, ob ein Refresh-Token rotiert wurde;
- Senderzahlen nach Status;
- Anzahl geprüfter und erfolgreicher EPG-Fenster;
- höchsten Horizont mit mindestens einem Programmeintrag;
- Anzahl geprüfter Programmdetails;
- ausschließlich Feldnamen der EPG- und Detailobjekte;
- Requests je Host, HTTP-Status und gesamte Antwortbytes;
- kontrollierte Fehlercodes ohne Server-Rohtext.

Token, Client-Authentifizierung, Geräte-ID, Gerätecode, Benutzer-Code,
Senderkennungen, Program IDs, Titel und vollständige Antworten fehlen bewusst.

## Tests

```bash
npm run test:waipu
```

Die Tests verwenden ausschließlich lokale Mock-Antworten. Sie prüfen unter
anderem Host-Allowlist, HTTPS-Pflicht, UTC-Zeitfenster, Senderfilter,
Gerätefluss, Tokenrotation, Abbruch ohne Loop und das Fehlen künstlicher
Secrets im gespeicherten Bericht.

## Abnahmegrenze

Automatisierte Tests können die Sicherheits- und Ablaufmechanik bestätigen.
Ob der Datenweg mit dem persönlichen Konto tatsächlich funktioniert, wie weit
das EPG reicht und welche Rate-Limits gelten, kann nur der kontrollierte
manuelle Live-Test beantworten. Keines dieser Ergebnisse wird vor diesem Test
als bestanden markiert.

Auch ein technisch erfolgreicher Test ist keine rechtliche oder vertragliche
Freigabe für eine öffentliche App-Verteilung. Diese Entscheidung bleibt ein
separates Release-Gate.
