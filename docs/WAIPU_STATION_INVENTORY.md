# Waipu-Senderinventar

## Zweck

Der Inventarlauf ist die rein lesende erste Stufe von #260. Er vergleicht die
aktuelle öffentliche Senderreihenfolge mit dem öffentlichen technischen
`station-config`-Stamm, ohne den produktiven 50-Sender-Katalog oder Firebase zu
verändern.

## Ergebnis

Der Lauf erzeugt unter `artifacts/waipu-station-inventory/`:

- `inventory.json` als maschinenlesbaren, schema-versionierten Bestand;
- `report.md` als kompakten Prüfbericht und GitHub-Jobzusammenfassung.

Der Bericht unterscheidet:

- eindeutig über normalisierte Namen zugeordnete Sender;
- mehrdeutige Zuordnungen;
- öffentlich gelistete Sender ohne technische Zuordnung;
- ausschließlich technisch vorhandene Einträge;
- vorsichtige Prüfhinweise für Catch-up, VOD und regionale Einträge.

Namenshinweise sind keine automatische Freigabe oder Ausschlussentscheidung.
EPG-Abdeckung, Varianten, Dubletten und Movie-Hub-Eignung werden anschließend
auf Basis dieses Inventars kontrolliert bewertet.

## Ausführung

Lokal:

```bash
npm run waipu:stations:inventory
```

In GitHub Actions wird der Workflow **Waipu station inventory** ausschließlich
manuell gestartet. Er benötigt keine Secrets und besitzt nur lesenden
Repository-Zugriff. Die produktive Ausbaustufe bleibt unverändert bei 50.
