# #877 – Player-Abnahme

## Technischer Umfang

- SMB: Activity-weite Steuerkreuz-/Medientasten-Behandlung; erster Navigationstastendruck weckt Controller, einschließlich Wiederholungen und Loslassen. Der bestehende Media3-Controller bleibt für Bedienung und Spulen zuständig.
- CRT: erzwungene Vollbild-Hardware-Layer nur während der Ein-/Ausblendanimation. Danach Standard-Compositing; die Hardwarebeschleunigung bleibt aktiv.
- Trailer: offizieller sichtbarer YouTube-IFrame-Player, ein Startpfad, Soundpräferenz, Zustandsereignisse und 30 Sekunden Timeout für einen nicht startenden bzw. dauerhaft puffernden Stream. Nach Autoplay-Blockierung bleiben die offiziellen Steuerelemente für den manuellen Start verfügbar. Bei Fehler kann der Player geschlossen und neu gestartet werden. Kein verstecktes Vorab-Abspielen, keine erzwungene Qualität oder garantierte Pufferreserve.

## Geräteprüfung (noch offen; vor Schließen des Issues)

| Plattform | Test | Soll |
|---|---|---|
| Fire TV | SMB starten, mindestens 7 s warten, OK drücken und loslassen | Controller sichtbar, Fokus auf Wiedergabe/Pause; kein unbeabsichtigtes Pausieren |
| Fire TV | Dreimal Autohide abwarten, mit Pfeiltasten erneut aufwecken | Controller jedes Mal erreichbar und navigierbar |
| Fire TV | Bei ausgeblendetem Controller Play/Pause, Vor- und Rückspulen auf der Fernbedienung | Genau eine jeweilige Aktion; sichtbares Feedback |
| Fire TV | Pause, einige Sekunden warten, weiter abspielen; Zurück | Wiedergabe fortsetzen, CRT-Schließen, ursprüngliche Detailseite |
| Fire TV | Gleicher Trailer/Teaser über Detailseite und Hero, je dreimal (gleiche Verbindung) | Beginn am Anfang, Sound gemäß Einstellung, keine unnötige Startunterbrechung |
| Fire TV | Trailer abbrechen oder vollständig abspielen | CRT-Schließen, Hero-Sequenz/Detailseite korrekt wiederhergestellt |
| Fire TV | Verbindung während Trailer unterbrechen, Timeout abwarten | verständliche Meldung und Schließen möglich; keine endlose Ladeanzeige |
| Android Phone/Tablet | SMB per Touch, Trailer mit/ohne Sound, Swipe/Back, regulärer externer YouTube-Link | bisheriges Verhalten unverändert |

Falls möglich, vor und nach Update denselben Trailer unter gleichen Bedingungen abspielen. Ruckler (sichtbare Frame-Aussetzer) von echter Pufferung (Ladekreis/Stillstand) unterscheiden. Die tatsächliche Wirkung auf Fire TV kann nicht per CI bewiesen werden.

## Optionale Diagnostik

```sh
adb logcat -s MovieHubTrailer:I
```

Die native Player-Activity protokolliert ohne Video-/Account-ID den YouTube-Status, geschätzten Ladefortschritt, Wiedergabeposition, Startzeit bis `PLAYING`, Anzahl und Dauer der erneuten Pufferzustände. Der Ladefortschritt ist **keine** verlässliche Zeitreserve. Bei Rucklern ohne `BUFFERING` GPU/Decoder/Compositor und WebView-Version prüfen; die globale WebView-Timer- und Hauptseiten-Lifecycle-Logik zunächst unverändert lassen, damit das bestehende Start-/Rückkehrverhalten nicht gefährdet wird.
