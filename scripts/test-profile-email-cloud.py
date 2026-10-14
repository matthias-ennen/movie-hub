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

    def __call__(self, args, **options):
        self.calls.append(args)
        if self.denied and self.denied(args):
            raise mail.SetupError("Cloud-Berechtigung fehlt.")
        if args[:2] == ["projects", "describe"]:
            return {"projectId": mail.PROJECT, "projectNumber": mail.NUMBER, "lifecycleState": "ACTIVE"}
        if args[:3] == ["iam", "service-accounts", "describe"]:
            return copy.deepcopy(self.accounts.get(args[3]))
        if args[:3] == ["iam", "roles", "describe"]:
            return copy.deepcopy(self.role)
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
            self.accounts[mail.account(args[3])] = {"email": mail.account(args[3]), "disabled": False}
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
        with patch.object(mail, "gcloud", cloud), contextlib.redirect_stdout(output):
            mail.setup(apply)
        return output.getvalue()

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
