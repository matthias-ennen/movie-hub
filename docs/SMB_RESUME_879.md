# #879 Netzwerkvideo – Wiederaufnahme

Der native Player speichert einen Checkpoint alle 30 Sekunden aktiver Wiedergabe, bei Pause, Schließen und Lifecycle-Unterbrechung. Der lokale Store enthält lediglich Konto-/Profil-/Medien-ID, Position, Dauer, letzte Änderung und einen Sync-Marker; kein SMB-Pfad, keine Zugangsdaten, keine Neben- oder Schreibdatei auf der Freigabe. Die Medien-ID ist ein SHA-256 über Titel-ID, Link-ID und kanonischen Pfad. Ein geänderter Dateipfad erhält eine neue ID. Eine stark veränderte Dauer verwirft den alten Seek.

Die bereits authentifizierte Web-App synchronisiert die lokale Outbox nach Rückkehr in Movie Hub, beim nächsten Profilstart bzw. bei erneuter Online-Verbindung nach `users/{uid}/profiles/{profileId}/smbProgress/{id}`. Firestore-Transaktionen und Regeln verhindern das Überschreiben eines neueren Fortschritts mit einem älteren. Der Zeitvergleich nutzt die Gerätezeit; bei Geräten mit falsch gesetzter Uhr ist die Reihenfolge nicht zuverlässig. Auflösung auf selben Gerät erfolgt auch offline. Der nächste Start wartet höchstens 1,5 Sekunden auf die Abfrage der aktuellen Cloud-Position. Alte APKs und alte Web-App-Versionen können weiterhin den bisherigen SMB-Aufruf verwenden.

Nach dem vollständigen CRT-Switch-on (1 s) erscheint nur bei gültiger Position (ab 10 s, mehr als 15 s Restzeit) ein modaler Dialog in der nativen Activity, mit der aktiven Movie-Hub-Farbpalette und sichtbarem D-Pad-Fokus. Vor Auswahl startet das Video nicht. Zurück schließt den Player ohne Änderung; Fortsetzen startet mit dem gespeicherten Seek; Von Anfang an ersetzt die Position erst, wenn die neue Wiedergabe tatsächlich beginnt. Am regulären Ende wird Position 0 gespeichert. Alle übrigen Player/Provider bleiben unverändert.

## Geräteabnahme

1. Auf Fire TV Netzwerkvideo erstmalig öffnen: CRT, kein Dialog, Wiedergabe von Anfang. Über 30 s laufen lassen, pausieren und schließen.
2. Erneut öffnen: erst CRT vollständig, dann zentrierter Dialog; Position und Dauer korrekt. Mit Steuerkreuz beide Knöpfe fokussieren, Fortsetzen wählen; nahe gespeicherter Position startet Wiedergabe. Bedienelemente aus #877 weiterhin aufrufbar.
3. Während Dialog Back drücken: CRT-Switch-off und keine Veränderung. Erneut öffnen, Von Anfang an wählen. Wiedergabe beginnt bei 0.
4. Ende abspielen: kein Fortsetzen beim nächsten Start. Zweiten Link eines Films, andere Datei und anderes Profil prüfen: keine fremde Position.
5. Nach Start und Schließen eines Netzvideos in Movie Hub warten, anschließend auf zweitem Gerät mit gleichem Profil und installiertem Update öffnen: Position übernommen; anderes Profil getrennt. Beide müssen auf die SMB-Freigabe zugreifen können. Offline-Test: ohne Internet weiter lokal, nach erneuter Verbindung Sync.
6. Bright, Cinema, Midnight und übrige Designs, Touch und Fire-TV-D-Pad; Sound/CRT, SMB-Puffer und externe Links unverändert.

Die Geräteabnahme (einschließlich realer Firebase-Synchronisierung zwischen zwei Geräten) bleibt bis zur Bestätigung offen.
