#!/usr/bin/env python3
"""One-time mail identities/secrets setup, run by the project administrator.

Default: inspect only. --apply: add the listed resources/bindings and read back.
No function, index, trigger, scheduler, API enablement or email deployment.
No secret payload reads, key files, role deletion or existing key rotation.
"""

import argparse
import json
import os
import re
import secrets
import subprocess
import sys
import time

PROJECT = "movie-hub-62459"
NUMBER = "612913221205"
REGION = "europe-west3"
DEPLOY = f"github-movie-hub-deploy@{PROJECT}.iam.gserviceaccount.com"
ACCOUNTS = {
    "movie-hub-email": "MovieHub profile email runtime",
    "movie-hub-email-build": "MovieHub profile email build",
    "movie-hub-email-events": "MovieHub profile email events",
    "movie-hub-email-scheduler": "MovieHub profile email scheduler",
}
ROLE = "MovieHubEmailRuntime"
ROLE_PATH = f"projects/{PROJECT}/roles/{ROLE}"
PERMISSIONS = sorted([
    "datastore.databases.get", "datastore.entities.get", "datastore.entities.list",
    "datastore.entities.create", "datastore.entities.update", "firebaseauth.users.get",
])
TOKEN = "MOVIE_HUB_EMAIL_TOKEN_KEY"
API_KEY = "RESEND_API_KEY"
ACCOUNT_READ_DELAYS = (0, 2, 4, 8, 16, 30, 30)
BUILD_BUCKETS = (
    f"gcf-v2-sources-{NUMBER}-{REGION}",
    f"gcf-v2-uploads-{NUMBER}.{REGION}.cloudfunctions.appspot.com",
)
BUILD_REPOSITORY = f"projects/{PROJECT}/locations/{REGION}/repositories/gcf-artifacts"


class SetupError(Exception):
    def __init__(self, message, code="SETUP_FAILED"):
        super().__init__(message)
        self.code = code


def error_code(error):
    # Only allowlisted categories leave the SDK boundary; never raw responses.
    for code, pattern in [
        ("UNAUTHENTICATED", r"UNAUTHENTICATED|\b401\b"),
        ("PERMISSION_DENIED", r"PERMISSION_DENIED|permission|\b403\b"),
        ("ALREADY_EXISTS", r"ALREADY_EXISTS|already exists|subject of a conflict|\b409\b"),
        ("NOT_FOUND", r"NOT_FOUND|not found|does not exist|\b404\b"),
        ("RESOURCE_EXHAUSTED", r"RESOURCE_EXHAUSTED|quota exceeded|\b429\b"),
        ("UNAVAILABLE", r"UNAVAILABLE|\b503\b"),
        ("INVALID_ARGUMENT", r"INVALID_ARGUMENT|unrecognized arguments|\b400\b"),
        ("FAILED_PRECONDITION", r"FAILED_PRECONDITION"),
        ("DEADLINE_EXCEEDED", r"DEADLINE_EXCEEDED"),
    ]:
        if re.search(pattern, error, re.I):
            return code
    return "SDK_ERROR"


def account(name):
    return f"{name}@{PROJECT}.iam.gserviceaccount.com"


def gcloud(args, *, missing_ok=False, data=None, format="json"):
    # Never inherit HTTP/body logging for commands receiving secret material.
    env = dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false",
               CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true")
    command = ["gcloud", *args, f"--project={PROJECT}", f"--format={format}",
               "--quiet", "--verbosity=error"]
    try:
        result = subprocess.run(command, input=data, capture_output=True,
                                text=True, timeout=120, env=env, check=False)
    except subprocess.TimeoutExpired:
        raise SetupError("Cloud-Befehl: Zeitlimit erreicht [DEADLINE_EXCEEDED].", "DEADLINE_EXCEEDED") from None
    except OSError:
        raise SetupError("Cloud-Befehl konnte nicht gestartet werden [SDK_UNAVAILABLE].", "SDK_UNAVAILABLE") from None
    if result.returncode:
        # Never print raw errors: SDK/provider responses may contain private data.
        code = error_code(result.stderr or "")
        if missing_ok and code == "NOT_FOUND":
            return None
        message = ("Cloud-Berechtigung/Anmeldung fehlt. Keine automatische Rechteausweitung."
                   if code in {"PERMISSION_DENIED", "UNAUTHENTICATED"}
                   else "Cloud-Befehl fehlgeschlagen; vorhandene Ressourcen bleiben erhalten.")
        raise SetupError(f"{message} [{code}; Exit {result.returncode}]", code)
    if format == "none":
        return None
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError):
        raise SetupError("Cloud-Metadaten konnten nicht geprüft werden.") from None


def require(condition, message):
    if not condition:
        raise SetupError(message)


def validate_account(value, name):
    require(isinstance(value, dict) and value.get("email") == account(name)
            and not value.get("disabled"), f"Unerwartetes/deaktiviertes Konto: {name}")


def wait_for_account(name):
    # IAM reads can lag creation by 60+ seconds. Repeat reads, never creation.
    # A 403 is retried only for this just-created/conflicting account; it never
    # becomes proof of absence or a reason to grant wider privileges.
    last_code = "NOT_FOUND"
    for delay in ACCOUNT_READ_DELAYS:
        if delay:
            print(f"Warte auf Sichtbarkeit von {name}: nächste Prüfung in {delay} Sekunden.", flush=True)
            time.sleep(delay)
        try:
            value = gcloud(["iam", "service-accounts", "describe", account(name)],
                           missing_ok=True, format="json(email,disabled)")
        except SetupError as error:
            if error.code not in {"NOT_FOUND", "PERMISSION_DENIED", "UNAVAILABLE", "DEADLINE_EXCEEDED"}:
                raise
            last_code = error.code
            continue
        if value is not None:
            validate_account(value, name)
            return
        last_code = "NOT_FOUND"
    raise SetupError(f"Konto noch nicht sicher lesbar [{last_code}]. "
                     "Keine weiteren Einrichtungsschritte ausgeführt; später denselben Befehl erneut starten.",
                     "ACCOUNT_NOT_VISIBLE")


def enabled_latest(secret):
    version = gcloud(["secrets", "versions", "describe", "latest", f"--secret={secret}"],
                     missing_ok=True, format="json(state)")
    require(version is not None and version.get("state") == "ENABLED",
            f"{secret}: Neueste Version fehlt oder ist nicht aktiv; keine automatische Rotation.")


def valid_role(role):
    return (not role.get("deleted") and role.get("stage") != "DISABLED"
            and sorted(role.get("includedPermissions", [])) == PERMISSIONS)


def has_binding(policy, member, role):
    return any(b.get("role") == role and not b.get("condition")
               and member in b.get("members", []) for b in policy.get("bindings", []))


def bind(resource, member, role):
    # add-iam-policy-binding preserves other members, conditions and roles.
    def policy():
        return gcloud([*resource[:-1], "get-iam-policy", resource[-1]])
    if not has_binding(policy(), member, role):
        gcloud([*resource[:-1], "add-iam-policy-binding", resource[-1],
                f"--member={member}", f"--role={role}", "--condition=None"], format="none")
    require(has_binding(policy(), member, role), "IAM-Zuweisung beim Rücklesen nicht bestätigt.")


def setup_build_access(apply=False):
    """Grant only the mail builder's three resource-specific storage bindings."""
    stage = "Buildspeicher und Konto prüfen"
    try:
        project = gcloud(["projects", "describe", PROJECT],
                         format="json(projectId,projectNumber,lifecycleState)")
        require(isinstance(project, dict) and project.get("projectId") == PROJECT
                and str(project.get("projectNumber")) == NUMBER
                and project.get("lifecycleState") == "ACTIVE", "Falsches oder inaktives Projekt.")
        validate_account(gcloud(["iam", "service-accounts", "describe", account("movie-hub-email-build")],
                                format="json(email,disabled)"), "movie-hub-email-build")
        # All exact destinations must be readable and match before any mutation.
        for name in BUILD_BUCKETS:
            value = gcloud(["storage", "buckets", "describe", f"gs://{name}", "--raw"],
                           format="json(name,projectNumber,location)")
            require(isinstance(value, dict) and value.get("name") == name
                    and str(value.get("projectNumber")) == NUMBER
                    and str(value.get("location", "")).lower() == REGION,
                    f"Build-Bucket hat unerwartetes Projekt oder Region: {name}")
        repository = gcloud(["artifacts", "repositories", "describe", BUILD_REPOSITORY],
                            format="json(name,format,mode)")
        require(isinstance(repository, dict) and repository.get("name") == BUILD_REPOSITORY
                and repository.get("format") == "DOCKER" and repository.get("mode") == "STANDARD_REPOSITORY",
                "Build-Registry fehlt oder weicht von der geplanten Docker-Registry ab.")
        resources = [(["storage", "buckets", f"gs://{name}"], "roles/storage.objectViewer")
                     for name in BUILD_BUCKETS]
        resources.append((["artifacts", "repositories", BUILD_REPOSITORY], "roles/artifactregistry.writer"))
        member = f"serviceAccount:{account('movie-hub-email-build')}"
        for resource, role in resources:
            policy = gcloud([*resource[:-1], "get-iam-policy", resource[-1]])
            require(isinstance(policy, dict) and isinstance(policy.get("bindings", []), list),
                    "Build-IAM-Metadaten nicht prüfbar.")
            state = "vorhanden" if has_binding(policy, member, role) else "einzurichten"
            print(f"Buildrecht {state}: {role} auf {resource[-1]}", flush=True)
        if not apply:
            print("NUR PRÜFUNG. Keine Änderung. Buildrechte mit --build-access --apply einrichten.")
            return
        for resource, role in resources:
            stage = f"Buildrecht auf {resource[-1]}"
            bind(resource, member, role)
        print("BUILDRECHTE ERFOLGREICH: Zwei Quell-Buckets und eine Docker-Registry rückgeprüft.")
        print("Versand bleibt aus. Keine Functions, Scheduler oder neuen Speicher angelegt.")
    except SetupError as error:
        raise SetupError(f"{stage}: {error}", error.code) from None


def setup(apply=False):
    stage = "Projekt und vorhandene Ressourcen lesen"
    try:
        project = gcloud(["projects", "describe", PROJECT],
                         format="json(projectId,projectNumber,lifecycleState)")
        require(project.get("projectId") == PROJECT and str(project.get("projectNumber")) == NUMBER
                and project.get("lifecycleState") == "ACTIVE", "Falsches oder inaktives Projekt.")
        enabled_latest(API_KEY)
        token_meta = gcloud(["secrets", "describe", TOKEN], missing_ok=True, format="json(name)")
        token_empty = False
        if token_meta is not None:
            versions = gcloud(["secrets", "versions", "list", TOKEN], format="json(state)")
            require(isinstance(versions, list), "Token-Versionen nicht prüfbar.")
            token_empty = not versions
            if not token_empty:
                enabled_latest(TOKEN)
        existing = {}
        for name in ACCOUNTS:
            existing[name] = gcloud(["iam", "service-accounts", "describe", account(name)],
                                   missing_ok=True, format="json(email,disabled)")
            if existing[name] is not None:
                validate_account(existing[name], name)
        role = gcloud(["iam", "roles", "describe", ROLE], missing_ok=True,
                      format="json(includedPermissions,deleted,stage)")
        require(role is None or valid_role(role), "Vorhandene Mailrolle weicht ab; keine Überschreibung.")

        print(f"Ziel: {PROJECT}, Region {REGION}")
        print("Vier getrennte Mailkonten; begrenzte Firestore-/Auth-Rechte ohne Löschen oder IAM-Schreibrechte.")
        print("Runtime: Zugriff auf genau die beiden Mail-Secrets. Deployer: nur deren Metadaten.")
        print("Build: Log Writer. Events: Event Receiver. Deployer darf die vier Konten verwenden.")
        print("Token-Schlüssel: neu erzeugen, falls noch ohne Version; vorhandenen Schlüssel erhalten.")
        print("Buildspeicher, Index, Functions, Aufrufrechte und Scheduler folgen separat.")
        if not apply:
            print("NUR PRÜFUNG. Keine Änderung. Einrichtung mit --apply ausführen.")
            return

        for name, display in ACCOUNTS.items():
            if existing[name] is not None:
                print(f"Dienstkonto bestätigt, wird weiterverwendet: {name}", flush=True)
                continue
            stage = f"Dienstkonto anlegen: {name}"
            try:
                gcloud(["iam", "service-accounts", "create", name, f"--display-name={display}"], format="none")
            except SetupError as error:
                if error.code != "ALREADY_EXISTS":
                    raise
                print(f"Dienstkonto existiert bereits; Identität wird geprüft: {name}", flush=True)
            stage = f"Dienstkonto nach Anlage/Existenzkonflikt lesen: {name}"
            wait_for_account(name)
            print(f"Dienstkonto bestätigt: {name}", flush=True)
        stage = "Begrenzte Laufzeitrolle"
        if role is None:
            gcloud(["iam", "roles", "create", ROLE, "--title=MovieHub profile email runtime",
                    "--description=Profile mail data read/create/update and Firebase Auth read only",
                    f"--permissions={','.join(PERMISSIONS)}", "--stage=GA"], format="none")
        require(valid_role(gcloud(["iam", "roles", "describe", ROLE])), "Laufzeitrolle nicht bestätigt.")
        for name, assigned_role in [("movie-hub-email", ROLE_PATH),
                                    ("movie-hub-email-build", "roles/logging.logWriter"),
                                    ("movie-hub-email-events", "roles/eventarc.eventReceiver")]:
            stage = f"Projektrolle für {name}"
            bind(["projects", PROJECT], f"serviceAccount:{account(name)}", assigned_role)
        for name in ACCOUNTS:
            stage = f"Bereitstellungsrecht für {name}"
            bind(["iam", "service-accounts", account(name)], f"serviceAccount:{DEPLOY}",
                 "roles/iam.serviceAccountUser")

        stage = "Token-Schlüssel sicher anlegen"
        if token_meta is None or token_empty:
            # 48 random bytes = 64 URL-safe characters; stdin only, never a file/argument/output.
            token = secrets.token_urlsafe(48)
            if token_meta is None:
                gcloud(["secrets", "create", TOKEN, "--replication-policy=user-managed",
                        f"--locations={REGION}", "--data-file=-"], data=token, format="none")
            else:
                gcloud(["secrets", "versions", "add", TOKEN, "--data-file=-"], data=token, format="none")
            del token
        enabled_latest(TOKEN)
        for secret in [API_KEY, TOKEN]:
            stage = f"Ressourcenbezogene Rechte auf {secret}"
            bind(["secrets", secret], f"serviceAccount:{account('movie-hub-email')}",
                 "roles/secretmanager.secretAccessor")
            bind(["secrets", secret], f"serviceAccount:{DEPLOY}", "roles/secretmanager.viewer")
            enabled_latest(secret)
        print("EINRICHTUNG ERFOLGREICH: Mailkonten, Rollen und Secret-Metadaten rückgeprüft.")
        print("Versand bleibt aus. Kein Schlüsselwert ausgelesen oder angezeigt. Keine E-Mail versandt.")
    except SetupError as error:
        raise SetupError(f"{stage}: {error}", error.code) from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Die oben begrenzte Einrichtung ausführen")
    parser.add_argument("--build-access", action="store_true",
                        help="Nur drei Buildspeicherrechte auf vorab geprüften Bestandsressourcen einrichten")
    args = parser.parse_args()
    try:
        (setup_build_access if args.build_access else setup)(args.apply)
    except SetupError as error:
        print(f"STOPP: {error}", file=sys.stderr)
        sys.exit(1)
