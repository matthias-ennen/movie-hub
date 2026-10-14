"""Exercise IAM/secret setup boundaries without Cloud credentials or network."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("setup_mail", Path(__file__).with_name("setup-profile-email-cloud.py"))
mail = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mail)


class Cloud:
    def __init__(self):
        self.accounts = {}
        self.role = None
        self.versions = {mail.API_KEY: [{"state": "ENABLED"}]}
        self.policies = {("projects", mail.PROJECT): {"bindings": [
            {"role": "roles/example.viewer", "members": ["serviceAccount:existing-tv-account"]}
        ]}}
        self.calls = []
        self.writes = []
        self.secret_values = []
        self.denied = None
        self.ignore_bindings = False
        self.post_create_reads = []
        self.pending_reads = {}
        self.conflict_on_create = False
        self.disabled_on_create = False
        self.buckets = {name: {"name": name, "projectNumber": mail.NUMBER, "location": mail.REGION.upper()}
                        for name in mail.BUILD_BUCKETS}
        self.repository = {"name": mail.BUILD_REPOSITORY, "format": "DOCKER", "mode": "STANDARD_REPOSITORY"}

    def __call__(self, args, **options):
        self.calls.append(args)
        if self.denied and self.denied(args):
            raise mail.SetupError("Cloud-Berechtigung fehlt.")
        if args[:2] == ["projects", "describe"]:
            return {"projectId": mail.PROJECT, "projectNumber": mail.NUMBER, "lifecycleState": "ACTIVE"}
        if args[:3] == ["iam", "service-accounts", "describe"]:
            pending = self.pending_reads.get(args[3], [])
            if pending:
                reply = pending.pop(0)
                if reply is not None:
                    raise mail.SetupError("Simulierter Lesefehler", reply)
                return None
            return copy.deepcopy(self.accounts.get(args[3]))
        if args[:3] == ["iam", "roles", "describe"]:
            return copy.deepcopy(self.role)
        if args[:3] == ["storage", "buckets", "describe"]:
            assert "--raw" in args
            return copy.deepcopy(self.buckets.get(args[3].removeprefix("gs://")))
        if args[:3] == ["artifacts", "repositories", "describe"]:
            return copy.deepcopy(self.repository)
        if args[:2] == ["secrets", "describe"]:
            return {"name": args[2]} if args[2] in self.versions else None
        if args[:3] == ["secrets", "versions", "list"]:
            return copy.deepcopy(self.versions[args[3]])
        if args[:3] == ["secrets", "versions", "describe"]:
            secret = next(a.split("=", 1)[1] for a in args if a.startswith("--secret="))
            versions = self.versions.get(secret, [])
            return copy.deepcopy(versions[-1]) if versions else None
        if "get-iam-policy" in args:
            i = args.index("get-iam-policy")
            return copy.deepcopy(self.policies.get(tuple(args[:i] + [args[i + 1]]), {"bindings": []}))

        self.writes.append(args)
        if args[:3] == ["iam", "service-accounts", "create"]:
            self.accounts[mail.account(args[3])] = {"email": mail.account(args[3]), "disabled": self.disabled_on_create}
            self.pending_reads[mail.account(args[3])] = list(self.post_create_reads)
            if self.conflict_on_create:
                raise mail.SetupError("Konto existiert bereits", "ALREADY_EXISTS")
        elif args[:3] == ["iam", "roles", "create"]:
            self.role = {"includedPermissions": mail.PERMISSIONS, "stage": "GA"}
        elif args[:2] == ["secrets", "create"] or args[:3] == ["secrets", "versions", "add"]:
            secret = args[2] if args[1] == "create" else args[3]
            self.versions.setdefault(secret, []).append({"state": "ENABLED"})
            self.secret_values.append(options["data"])
        elif "add-iam-policy-binding" in args:
            i = args.index("add-iam-policy-binding")
            key = tuple(args[:i] + [args[i + 1]])
            binding = {k: next(a.split("=", 1)[1] for a in args if a.startswith(f"--{k}="))
                       for k in ["member", "role"]}
            if not self.ignore_bindings:
                self.policies.setdefault(key, {"bindings": []})["bindings"].append(
                    {"role": binding["role"], "members": [binding["member"]]})
        else:
            raise AssertionError(f"Unexpected mutation: {args}")
        return None


class SetupTests(unittest.TestCase):
    def run_setup(self, cloud, apply=True):
        output = io.StringIO()
        with patch.object(mail, "gcloud", cloud), patch.object(mail.time, "sleep"), contextlib.redirect_stdout(output):
            mail.setup(apply)
        return output.getvalue()

    def run_build(self, cloud, apply=True):
        output = io.StringIO()
        with patch.object(mail, "gcloud", cloud), contextlib.redirect_stdout(output):
            mail.setup_build_access(apply)
        return output.getvalue()

    def build_cloud(self):
        cloud = Cloud()
        cloud.accounts[mail.account("movie-hub-email-build")] = {"email": mail.account("movie-hub-email-build")}
        return cloud

    def test_build_access_only_three_scoped_grants_and_repeat_is_read_only(self):
        cloud = self.build_cloud()
        key = ("storage", "buckets", f"gs://{mail.BUILD_BUCKETS[0]}")
        unrelated = {"role": "roles/storage.objectViewer", "members": ["serviceAccount:existing-tv-account"]}
        cloud.policies[key] = {"bindings": [unrelated]}
        self.assertIn("BUILDRECHTE ERFOLGREICH", self.run_build(cloud))
        self.assertEqual(len(cloud.writes), 3)
        for call in cloud.writes:
            self.assertIn("add-iam-policy-binding", call)
            self.assertIn(f"--member=serviceAccount:{mail.account('movie-hub-email-build')}", call)
            self.assertNotIn("projects", call)
            self.assertIn(call[3], [f"gs://{name}" for name in mail.BUILD_BUCKETS] + [mail.BUILD_REPOSITORY])
        self.assertIn(unrelated, cloud.policies[key]["bindings"])
        before = copy.deepcopy(cloud.writes)
        self.run_build(cloud)
        self.assertEqual(before, cloud.writes)
        self.assertFalse(any("secrets" in call or "functions" in call or "scheduler" in call for call in cloud.calls))

    def test_build_read_only_never_grants_access(self):
        cloud = self.build_cloud()
        self.run_build(cloud, False)
        self.assertEqual(cloud.writes, [])

    def test_all_build_targets_must_match_before_any_grant(self):
        for field, wrong in [("location", "EUROPE-WEST1"), ("projectNumber", "999"), ("name", "other-bucket")]:
            with self.subTest(field=field):
                cloud = self.build_cloud()
                cloud.buckets[mail.BUILD_BUCKETS[1]][field] = wrong
                with self.assertRaisesRegex(mail.SetupError, "unerwartetes Projekt oder Region"):
                    self.run_build(cloud)
                self.assertEqual(cloud.writes, [])
        for field, wrong in [("name", "other-registry"), ("format", "NPM"), ("mode", "REMOTE_REPOSITORY")]:
            with self.subTest(field=field):
                cloud = self.build_cloud()
                cloud.repository[field] = wrong
                with self.assertRaisesRegex(mail.SetupError, "Build-Registry"):
                    self.run_build(cloud)
                self.assertEqual(cloud.writes, [])

    def test_missing_or_unreadable_build_resource_never_triggers_creation_or_grant(self):
        cloud = self.build_cloud()
        del cloud.buckets[mail.BUILD_BUCKETS[1]]
        with self.assertRaises(mail.SetupError):
            self.run_build(cloud)
        self.assertEqual(cloud.writes, [])
        cloud = self.build_cloud()
        cloud.denied = lambda args: args[:3] == ["artifacts", "repositories", "get-iam-policy"]
        with self.assertRaisesRegex(mail.SetupError, "Berechtigung"):
            self.run_build(cloud)
        self.assertEqual(cloud.writes, [])

    def test_build_grant_readback_failure_stops_next_grant(self):
        cloud = self.build_cloud()
        cloud.ignore_bindings = True
        with self.assertRaisesRegex(mail.SetupError, "Rücklesen"):
            self.run_build(cloud)
        self.assertEqual(len(cloud.writes), 1)

    def test_initial_setup_and_repeat_preserve_keys_and_unrelated_policy(self):
        cloud = Cloud()
        unrelated = copy.deepcopy(cloud.policies[("projects", mail.PROJECT)]["bindings"][0])
        output = self.run_setup(cloud)
        self.assertEqual(len(cloud.accounts), 4)
        self.assertEqual(len(cloud.secret_values), 1)
        self.assertGreaterEqual(len(cloud.secret_values[0]), 64)
        self.assertNotIn(cloud.secret_values[0], output + json.dumps(cloud.calls))
        self.assertIn(unrelated, cloud.policies[("projects", mail.PROJECT)]["bindings"])
        self.assertIn("EINRICHTUNG ERFOLGREICH", output)
        writes = copy.deepcopy(cloud.writes)
        self.run_setup(cloud)
        self.assertEqual(cloud.writes, writes)
        # Neither default Compute/TV accounts nor project-wide secret grants are modified.
        for call in cloud.writes:
            self.assertNotIn("compute@", " ".join(call))
            self.assertNotIn("tv-", " ".join(call))
            self.assertNotIn("access", call)
            self.assertNotIn("delete", call)
            if "--role=roles/secretmanager.secretAccessor" in call:
                self.assertEqual(call[:2], ["secrets", "add-iam-policy-binding"])
                self.assertIn(f"--member=serviceAccount:{mail.account('movie-hub-email')}", call)

    def test_read_only_has_no_writes(self):
        cloud = Cloud()
        self.run_setup(cloud, False)
        self.assertEqual(cloud.writes, [])

    def test_delayed_visibility_after_creation_retries_reads_without_recreating(self):
        cloud = Cloud()
        cloud.post_create_reads = [None, "PERMISSION_DENIED", "UNAVAILABLE", None]
        self.run_setup(cloud)
        creates = [c for c in cloud.writes if c[:3] == ["iam", "service-accounts", "create"]]
        self.assertEqual(len(creates), 4)
        self.assertEqual(len({c[3] for c in creates}), 4)
        self.assertEqual(len(cloud.secret_values), 1)

    def test_create_conflict_requires_successful_readback_then_resumes(self):
        cloud = Cloud()
        cloud.conflict_on_create = True
        cloud.post_create_reads = [None]
        output = self.run_setup(cloud)
        self.assertIn("Identität wird geprüft", output)
        self.assertEqual(len(cloud.secret_values), 1)

    def test_persistent_denial_after_creation_stops_before_roles_and_secrets(self):
        cloud = Cloud()
        cloud.post_create_reads = ["PERMISSION_DENIED"] * len(mail.ACCOUNT_READ_DELAYS)
        with self.assertRaisesRegex(mail.SetupError, "Konto noch nicht sicher lesbar"):
            self.run_setup(cloud)
        self.assertEqual(len(cloud.writes), 1)
        self.assertEqual(cloud.writes[0][:3], ["iam", "service-accounts", "create"])
        self.assertIsNone(cloud.role)
        self.assertEqual(cloud.secret_values, [])

    def test_conflict_does_not_accept_a_disabled_account(self):
        cloud = Cloud()
        cloud.conflict_on_create = True
        cloud.disabled_on_create = True
        with self.assertRaisesRegex(mail.SetupError, "deaktiviertes Konto"):
            self.run_setup(cloud)
        self.assertEqual(len(cloud.writes), 1)
        self.assertEqual(cloud.secret_values, [])

    def test_permission_denied_during_initial_inspection_never_creates_or_retries(self):
        cloud = Cloud()
        cloud.denied = lambda args: args[:3] == ["iam", "service-accounts", "describe"]
        with self.assertRaisesRegex(mail.SetupError, "Berechtigung"):
            self.run_setup(cloud)
        self.assertEqual(cloud.writes, [])
        self.assertEqual(sum(c[:3] == ["iam", "service-accounts", "describe"] for c in cloud.calls), 1)

    def test_create_failure_is_not_retried_or_ignored(self):
        cloud = Cloud()
        cloud.denied = lambda args: args[:3] == ["iam", "service-accounts", "create"]
        with self.assertRaisesRegex(mail.SetupError, "Dienstkonto anlegen"):
            self.run_setup(cloud)
        self.assertEqual(sum(c[:3] == ["iam", "service-accounts", "create"] for c in cloud.calls), 1)
        self.assertEqual(cloud.secret_values, [])

    def test_sdk_conflict_reports_only_category_and_keeps_secret_material_hidden(self):
        marker = "provider-private-material"
        failed = subprocess.CompletedProcess([], 1, "", "Resource is the subject of a conflict: "
                                              f"Service account already exists. {marker}")
        with patch.object(mail.subprocess, "run", return_value=failed):
            with self.assertRaises(mail.SetupError) as caught:
                mail.gcloud(["iam", "service-accounts", "create", "movie-hub-email"], format="none")
        self.assertEqual(caught.exception.code, "ALREADY_EXISTS")
        self.assertIn("Exit 1", str(caught.exception))
        self.assertNotIn(marker, str(caught.exception))

    def test_permission_failure_is_not_resource_absence(self):
        cloud = Cloud()
        cloud.denied = lambda args: args[:2] == ["secrets", "describe"]
        with self.assertRaisesRegex(mail.SetupError, "Berechtigung"):
            self.run_setup(cloud)
        self.assertEqual(cloud.writes, [])

    def test_existing_broader_role_is_not_rewritten(self):
        cloud = Cloud()
        cloud.role = {"includedPermissions": mail.PERMISSIONS + ["datastore.entities.delete"]}
        with self.assertRaisesRegex(mail.SetupError, "keine Überschreibung"):
            self.run_setup(cloud)
        self.assertEqual(cloud.writes, [])

    def test_disabled_latest_is_not_replaced_even_if_older_version_enabled(self):
        cloud = Cloud()
        cloud.versions[mail.TOKEN] = [{"state": "ENABLED"}, {"state": "DISABLED"}]
        with self.assertRaisesRegex(mail.SetupError, "keine automatische Rotation"):
            self.run_setup(cloud)
        self.assertEqual(cloud.writes, [])

    def test_empty_secret_after_interruption_can_be_completed(self):
        cloud = Cloud()
        cloud.versions[mail.TOKEN] = []
        self.run_setup(cloud)
        self.assertEqual(len(cloud.secret_values), 1)
        self.assertTrue(any(c[:3] == ["secrets", "versions", "add"] for c in cloud.writes))

    def test_missing_binding_readback_aborts_before_secret_creation(self):
        cloud = Cloud()
        cloud.ignore_bindings = True
        with self.assertRaisesRegex(mail.SetupError, "Rücklesen"):
            self.run_setup(cloud)
        self.assertEqual(cloud.secret_values, [])

    def test_subprocess_receives_secret_only_on_stdin_and_hides_provider_error(self):
        value = "private-test-token-never-print"
        failed = subprocess.CompletedProcess([], 1, "", f"PERMISSION_DENIED NOT_FOUND {value}")
        with patch.object(mail.subprocess, "run", return_value=failed) as run:
            with self.assertRaises(mail.SetupError) as caught:
                mail.gcloud(["secrets", "create", mail.TOKEN, "--data-file=-"],
                            missing_ok=True, data=value, format="none")
        self.assertNotIn(value, str(caught.exception))
        self.assertNotIn(value, json.dumps(run.call_args.args))
        self.assertEqual(run.call_args.kwargs["input"], value)
        self.assertEqual(run.call_args.kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
        self.assertEqual(run.call_args.kwargs["env"]["CLOUDSDK_CORE_DISABLE_FILE_LOGGING"], "true")


if __name__ == "__main__":
    unittest.main()
