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


class SetupError(Exception):
    pass


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
    except (OSError, subprocess.TimeoutExpired):
        raise SetupError("Cloud-Befehl nicht ausgeführt oder Zeitlimit erreicht.") from None
    if result.returncode:
        # Never print raw errors: SDK/provider responses may contain private data.
        error = result.stderr or ""
        if re.search(r"PERMISSION_DENIED|permission|403|UNAUTHENTICATED|401", error, re.I):
            raise SetupError("Cloud-Berechtigung fehlt. Keine automatische Rechteausweitung.")
        if missing_ok and re.search(r"NOT_FOUND|not found|404|does not exist", error, re.I):
            return None
        raise SetupError("Cloud-Befehl fehlgeschlagen; vorhandene Ressourcen bleiben erhalten.")
    if format == "none":
        return None
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError):
        raise SetupError("Cloud-Metadaten konnten nicht geprüft werden.") from None


def require(condition, message):
    if not condition:
        raise SetupError(message)


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
                require(existing[name].get("email") == account(name)
                        and not existing[name].get("disabled"), f"Unerwartetes/deaktiviertes Konto: {name}")
        role = gcloud(["iam", "roles", "describe", ROLE], missing_ok=True,
                      format="json(includedPermissions,deleted,stage)")
        require(role is None or valid_role(role), "Vorhandene Mailrolle weicht ab; keine Überschreibung.")

        print(f"Ziel: {PROJECT}, Region {REGION}")
        print("Vier getrennte Mailkonten; Firestore/Auth-Leserolle ohne Löschen oder IAM-Schreibrechte.")
        print("Runtime: Zugriff auf genau die beiden Mail-Secrets. Deployer: nur deren Metadaten.")
        print("Build: Log Writer. Events: Event Receiver. Deployer darf die vier Konten verwenden.")
        print("Token-Schlüssel: neu erzeugen, falls noch ohne Version; vorhandenen Schlüssel erhalten.")
        print("Buildspeicher, Index, Functions, Aufrufrechte und Scheduler folgen separat.")
        if not apply:
            print("NUR PRÜFUNG. Keine Änderung. Einrichtung mit --apply ausführen.")
            return

        for name, display in ACCOUNTS.items():
            stage = f"Dienstkonto {name}"
            if existing[name] is None:
                gcloud(["iam", "service-accounts", "create", name, f"--display-name={display}"], format="none")
            verified = gcloud(["iam", "service-accounts", "describe", account(name)], format="json(email,disabled)")
            require(verified.get("email") == account(name) and not verified.get("disabled"),
                    "Dienstkonto beim Rücklesen nicht bestätigt.")
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
        raise SetupError(f"{stage}: {error}") from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Die oben begrenzte Einrichtung ausführen")
    args = parser.parse_args()
    try:
        setup(args.apply)
    except SetupError as error:
        print(f"STOPP: {error}", file=sys.stderr)
        sys.exit(1)
