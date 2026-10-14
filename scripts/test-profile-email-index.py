"""Verify the single-field patch boundary without Cloud access."""
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
import urllib.error

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("mail_index", Path(__file__).with_name("setup-profile-email-index.py"))
mail = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mail)


def index(scope="COLLECTION", mode="ASCENDING", state="READY"):
    item = {"fieldPath": "queueAt", "order": mode} if mode != "CONTAINS" else {"fieldPath": "queueAt", "arrayConfig": mode}
    return {"queryScope": scope, "fields": [item], "state": state}


class Cloud:
    def __init__(self):
        self.field = {"name": mail.FIELD, "indexConfig": {"usesAncestorConfig": True,
            "ancestorField": f"{mail.DATABASE}/collectionGroups/__default__/fields/*",
            "indexes": [index(), index(mode="DESCENDING"), index(mode="CONTAINS")]},
            "ttlConfig": {"state": "ACTIVE"}}
        self.project = {"projectId": mail.PROJECT, "projectNumber": mail.NUMBER, "lifecycleState": "ACTIVE"}
        self.database = {"name": mail.DATABASE, "locationId": "europe-west3", "type": "FIRESTORE_NATIVE"}
        self.writes = []
        self.reads = 0
        self.stay_building = False
        self.change_before_patch = False
        self.drop_old_index = False

    def run(self, args):
        if args == ["projects", "describe", mail.PROJECT]:
            return copy.deepcopy(self.project)
        if args == ["firestore", "databases", "describe", "--database=(default)"]:
            return copy.deepcopy(self.database)
        raise AssertionError(f"Unexpected SDK command: {args}")

    def request(self, body=None):
        if body is not None:
            self.writes.append(copy.deepcopy(body))
            self.field["indexConfig"] = copy.deepcopy(body["indexConfig"])
            for item in self.field["indexConfig"]["indexes"]:
                item["state"] = "CREATING" if self.stay_building else "READY"
                item["apiScope"] = "ANY_API"
                item["density"] = "SPARSE_ALL"
            if self.drop_old_index:
                self.field["indexConfig"]["indexes"].pop(0)
            return {"name": f"{mail.DATABASE}/operations/example"}
        self.reads += 1
        if self.change_before_patch and self.reads == 2:
            self.field["indexConfig"]["indexes"].append(index("COLLECTION_GROUP", "DESCENDING"))
        return copy.deepcopy(self.field)


class IndexTests(unittest.TestCase):
    def execute(self, cloud, apply=True):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            ready = mail.setup(apply, run=cloud.run, api=cloud, sleep=lambda _: None, polls=2)
        return ready, output.getvalue()

    def test_add_preserves_all_inherited_definitions_and_ttl(self):
        cloud = Cloud()
        before = copy.deepcopy(cloud.field)
        ready, output = self.execute(cloud)
        self.assertTrue(ready)
        self.assertIn("INDEX BEREIT", output)
        self.assertEqual(len(cloud.writes), 1)
        body = cloud.writes[0]
        self.assertEqual(set(body), {"name", "indexConfig"})
        self.assertEqual(body["name"], mail.FIELD)
        self.assertEqual(len(body["indexConfig"]["indexes"]), 4)
        self.assertEqual(body["indexConfig"]["indexes"][:3], [mail.definition(x) for x in before["indexConfig"]["indexes"]])
        self.assertEqual(cloud.field["ttlConfig"], before["ttlConfig"])
        self.execute(cloud)
        self.assertEqual(len(cloud.writes), 1)

    def test_read_only_never_patches(self):
        cloud = Cloud()
        self.assertFalse(self.execute(cloud, False)[0])
        self.assertEqual(cloud.writes, [])

    def test_building_target_waits_without_patch_and_does_not_claim_ready(self):
        cloud = Cloud()
        cloud.field["indexConfig"]["indexes"].append(index("COLLECTION_GROUP", state="CREATING"))
        ready, output = self.execute(cloud)
        self.assertFalse(ready)
        self.assertNotIn("INDEX BEREIT", output)
        self.assertEqual(cloud.writes, [])

    def test_new_pending_build_can_be_resumed_without_recreating(self):
        cloud = Cloud()
        cloud.stay_building = True
        self.assertFalse(self.execute(cloud)[0])
        self.assertFalse(self.execute(cloud)[0])
        self.assertEqual(len(cloud.writes), 1)
        for item in cloud.field["indexConfig"]["indexes"]:
            item["state"] = "READY"
        self.assertTrue(self.execute(cloud)[0])

    def test_empty_explicit_override_is_not_replaced_with_default_indexes(self):
        cloud = Cloud()
        cloud.field["indexConfig"] = {}
        self.assertTrue(self.execute(cloud)[0])
        self.assertEqual(cloud.writes[0]["indexConfig"]["indexes"], [mail.TARGET])

    def test_wrong_project_database_field_and_unreadable_inheritance_stop(self):
        for mutate in [lambda c: c.project.update(projectNumber="999"),
                       lambda c: c.database.update(locationId="europe-west1"),
                       lambda c: c.field.update(name="other-field"),
                       lambda c: c.field["indexConfig"].update(indexes=[]),
                       lambda c: c.field["indexConfig"].update(reverting=True)]:
            cloud = Cloud()
            mutate(cloud)
            with self.assertRaises(mail.SetupError):
                self.execute(cloud)
            self.assertEqual(cloud.writes, [])

    def test_unknown_index_settings_and_failed_or_pending_peers_stop(self):
        for changes in [{"futureSetting": True}, {"state": "NEEDS_REPAIR"}, {"state": "CREATING"},
                        {"fields": [{"fieldPath": "other", "order": "ASCENDING"}]}]:
            cloud = Cloud()
            cloud.field["indexConfig"]["indexes"][0].update(changes)
            with self.assertRaises(mail.SetupError):
                self.execute(cloud)
            self.assertEqual(cloud.writes, [])

    def test_concurrent_change_stops_before_write(self):
        cloud = Cloud()
        cloud.change_before_patch = True
        with self.assertRaisesRegex(mail.SetupError, "zwischenzeitlich"):
            self.execute(cloud)
        self.assertEqual(cloud.writes, [])

    def test_lost_existing_definition_fails_readback(self):
        cloud = Cloud()
        cloud.drop_old_index = True
        with self.assertRaisesRegex(mail.SetupError, "Rücklesen"):
            self.execute(cloud)

    def test_sdk_error_does_not_print_private_output(self):
        with patch.object(mail.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "private-token", "private-response")):
            with self.assertRaises(mail.SetupError) as result:
                mail.gcloud(["auth", "print-access-token"], raw=True)
        self.assertNotIn("private", str(result.exception))

    def test_http_boundary_is_fixed_and_patch_mask_is_only_index_config(self):
        requests = []
        class Opener:
            def open(self, request, timeout):
                requests.append(request)
                self_test.assertEqual(timeout, 30)
                return io.BytesIO(b'{}')
        self_test = self
        with patch.object(mail, "gcloud", return_value="private-test-token"), patch.object(mail.urllib.request, "build_opener", return_value=Opener()):
            api = mail.FieldAPI()
            api.request()
            api.request({"name": mail.FIELD, "indexConfig": {"indexes": [mail.TARGET]}})
        self.assertEqual([r.full_url for r in requests], [mail.URL, mail.URL + "?updateMask=indexConfig"])
        self.assertEqual([r.get_method() for r in requests], ["GET", "PATCH"])
        self.assertIsNone(requests[0].data)
        self.assertNotIn("ttlConfig", json.loads(requests[1].data))
        with self.assertRaises(mail.SetupError):
            mail.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com")

    def test_http_denied_does_not_become_missing_or_expose_body(self):
        error = urllib.error.HTTPError(mail.URL, 403, "private-body", {}, io.BytesIO(b"private-token"))
        with patch.object(mail, "gcloud", return_value="private-test-token"):
            api = mail.FieldAPI()
        with patch.object(api.opener, "open", side_effect=error):
            with self.assertRaisesRegex(mail.SetupError, "HTTP 403") as result:
                api.request()
        self.assertNotIn("private", str(result.exception))


if __name__ == "__main__":
    unittest.main()
