#!/usr/bin/env python3
"""Add only emailDeliveries.queueAt COLLECTION_GROUP ASCENDING, preserving peers.

Administrator Cloud Shell helper; inspect by default, mutate only with --apply.
No IAM, document, secret, function, scheduler or email operations.
"""
import argparse
import copy
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

PROJECT = "movie-hub-62459"
NUMBER = "612913221205"
REGION = "europe-west3"
DATABASE = f"projects/{PROJECT}/databases/(default)"
FIELD = f"{DATABASE}/collectionGroups/emailDeliveries/fields/queueAt"
URL = f"https://firestore.googleapis.com/v1/{FIELD}"
TARGET = {"queryScope": "COLLECTION_GROUP", "fields": [{"fieldPath": "queueAt", "order": "ASCENDING"}]}


class SetupError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise SetupError(message)


def gcloud(args, raw=False):
    try:
        result = subprocess.run(["gcloud", *args, f"--project={PROJECT}", "--quiet",
                                 "--verbosity=error", *([] if raw else ["--format=json"])],
                                capture_output=True, text=True, timeout=60, check=False,
                                env=dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false",
                                         CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true"))
    except (OSError, subprocess.TimeoutExpired):
        raise SetupError("Cloud-Befehl nicht erreichbar oder Zeitlimit erreicht.") from None
    require(result.returncode == 0, "Cloud-Anmeldung oder Metadatenabfrage fehlgeschlagen; keine Rechte erweitert.")
    if raw:
        value = result.stdout.strip()
        require(bool(value) and not any(c.isspace() for c in value), "Zugriffstoken nicht verfügbar.")
        return value
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise SetupError("Cloud-Metadaten nicht lesbar.") from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SetupError("Unerwartete HTTP-Weiterleitung; Anfrage gestoppt.")


class FieldAPI:
    def __init__(self):
        # Token stays in memory; only the fixed Google field endpoint receives it.
        self.token = gcloud(["auth", "print-access-token"], raw=True)
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, body=None):
        request = urllib.request.Request(URL + ("?updateMask=indexConfig" if body is not None else ""),
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            method="PATCH" if body is not None else "GET")
        try:
            with self.opener.open(request, timeout=30) as response:
                data = response.read(1024 * 1024 + 1)
            require(len(data) <= 1024 * 1024, "Metadatenantwort zu groß.")
            value = json.loads(data)
            require(isinstance(value, dict), "Unerwartete Metadatenantwort.")
            return value
        except urllib.error.HTTPError as error:
            # No response bodies, URLs or credentials in diagnostics.
            raise SetupError(f"Firestore-Metadatenanfrage fehlgeschlagen [HTTP {error.code}].") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise SetupError("Firestore nicht erreichbar oder Zeitlimit erreicht; Zustand erneut prüfen.") from None
        except (ValueError, UnicodeError):
            raise SetupError("Firestore-Metadaten nicht lesbar.") from None


def definition(index):
    require(isinstance(index, dict) and set(index) <= {
        "queryScope", "apiScope", "fields", "name", "state", "density"},
        "Unbekannte Indexoptionen; bestehende Konfiguration bleibt erhalten.")
    require(index.get("queryScope") in {"COLLECTION", "COLLECTION_GROUP"}
            and index.get("apiScope", "ANY_API") == "ANY_API"
            and index.get("density", "SPARSE_ALL") == "SPARSE_ALL",
            "Unerwarteter Indexbereich oder Indextyp.")
    require(index.get("state") in {None, "READY", "CREATING"}, "Index benötigt Diagnose; keine automatische Neuerstellung.")
    fields = index.get("fields")
    require(isinstance(fields, list) and len(fields) == 1 and isinstance(fields[0], dict), "Kein einfacher Feldindex.")
    item = fields[0]
    require(item.get("fieldPath", "queueAt") == "queueAt" and set(item) <= {"fieldPath", "order", "arrayConfig"},
            "Unerwartetes Indexfeld.")
    require((item.get("order") in {"ASCENDING", "DESCENDING"} and "arrayConfig" not in item)
            or (item.get("arrayConfig") == "CONTAINS" and "order" not in item), "Unerwartete Indexsortierung.")
    result = copy.deepcopy(index)
    for key in ("name", "state"):
        result.pop(key, None)
    result["fields"][0]["fieldPath"] = "queueAt"
    return result


def signature(index):
    value = definition(index)
    # API may materialize defaults when reading back the same definition.
    value.pop("apiScope", None)
    value.pop("density", None)
    return json.dumps(value, sort_keys=True)


def inspect(field):
    require(isinstance(field, dict) and field.get("name") == FIELD, "Falsches Indexziel.")
    config = field.get("indexConfig")
    require(isinstance(config, dict) and not config.get("reverting"), "Indexkonfiguration fehlt oder wird gerade zurückgesetzt.")
    require(set(config) <= {"indexes", "usesAncestorConfig", "ancestorField", "reverting"},
            "Unbekannte Feldindexoptionen; keine Änderung.")
    indexes = config.get("indexes", [])
    require(isinstance(indexes, list), "Indexliste nicht lesbar.")
    require(not config.get("usesAncestorConfig") or bool(indexes), "Geerbte Indexliste nicht vollständig lesbar.")
    definitions = [definition(index) for index in indexes]
    keys = [signature(index) for index in indexes]
    require(len(keys) == len(set(keys)), "Mehrdeutige Indexkonfiguration.")
    return definitions, {signature(index): index.get("state") for index in indexes}


def setup(apply=False, *, run=gcloud, api=None, sleep=time.sleep, polls=60):
    project = run(["projects", "describe", PROJECT])
    require(isinstance(project, dict) and project.get("projectId") == PROJECT
            and str(project.get("projectNumber")) == NUMBER and project.get("lifecycleState") == "ACTIVE",
            "Falsches oder inaktives Projekt.")
    database = run(["firestore", "databases", "describe", "--database=(default)"])
    require(isinstance(database, dict) and database.get("name") == DATABASE
            and database.get("locationId") == REGION and database.get("type") == "FIRESTORE_NATIVE"
            and database.get("databaseEdition", "STANDARD") == "STANDARD", "Unerwartete Datenbank oder Region.")
    api = api or FieldAPI()
    before = api.request()
    definitions, states = inspect(before)
    target = signature(TARGET)
    print(f"Mail-Index: {len(definitions)} vorhandene Indexdefinitionen geprüft.", flush=True)
    if target in states and states[target] == "READY":
        print("INDEX BEREIT: emailDeliveries.queueAt, COLLECTION_GROUP ASCENDING. Keine Änderung.")
        return True
    if not apply:
        print("NUR PRÜFUNG: Mail-Index noch nicht bereit. Einrichtung mit --apply.")
        return False
    if target not in states:
        require(all(state == "READY" for state in states.values()), "Bestehender Indexaufbau läuft; später erneut starten.")
        # Field API has no etag precondition. Detect changes immediately before
        # the single patch; never intentionally remove a previously read index.
        latest = api.request()
        require(latest == before, "Indexkonfiguration wurde zwischenzeitlich geändert; erneut prüfen.")
        operation = api.request({"name": FIELD, "indexConfig": {"indexes": [*definitions, copy.deepcopy(TARGET)]}})
        require(isinstance(operation, dict) and not operation.get("error")
                and str(operation.get("name", "")).startswith(f"{DATABASE}/operations/"),
                "Indexänderung nicht bestätigt; Zustand vor erneutem Versuch prüfen.")
        print("Mail-Index ergänzt; warte auf READY. Vorhandene Indexdefinitionen übernommen.", flush=True)
    else:
        print("Mail-Index wird bereits aufgebaut; nur Statusprüfung, keine erneute Änderung.", flush=True)
    baseline = set(states)
    for attempt in range(polls):
        after = api.request()
        _, current = inspect(after)
        require(baseline <= set(current), "Vorhandene Indexdefinition beim Rücklesen nicht bestätigt.")
        require(after.get("ttlConfig") == before.get("ttlConfig"), "TTL-Konfiguration wurde zwischenzeitlich geändert.")
        if current.get(target) == "READY":
            print("INDEX BEREIT: emailDeliveries.queueAt, COLLECTION_GROUP ASCENDING. Versand bleibt aus.")
            return True
        if attempt + 1 < polls:
            print("Indexaufbau läuft; nächste Prüfung in 5 Sekunden.", flush=True)
            sleep(5)
    print("INDEX NOCH IM AUFBAU. Später denselben Befehl erneut starten; bestehender Aufbau wird weiter geprüft.")
    return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        ready = setup(args.apply)
        sys.exit(0 if ready or not args.apply else 2)
    except SetupError as error:
        print(f"STOPP: {error}", file=sys.stderr)
        sys.exit(1)
