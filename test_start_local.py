import os
import unittest
from unittest.mock import patch
import start
from tools import start_local

class LocalLauncherTests(unittest.TestCase):
    def test_default_origin_is_production_api_without_starting_server(self):
        with patch.dict(os.environ,{},clear=True),patch.object(start_local.runpy,"run_path") as child:
            self.assertEqual(start_local.launch(),0)
            self.assertEqual(os.environ["JARVIS_CLOUD_ORIGIN"],"https://api.cyro-ia.tech")
            child.assert_called_once()
    def test_individual_session_origin_preserved_and_server_secrets_removed(self):
        secret={k:"synthetic-secret" for k in ["DATABASE_URL","REDIS_URL","AUTH_SECRET","OPENAI_API_KEY","CYRO_FILES_SERVICE_KEY","CYRO_GITHUB_TOKEN","CYRO_PUBLISHER_SECRET","SPOTIFY_CLIENT_SECRET"]}
        secret["JARVIS_CLOUD_ORIGIN"]="https://backend.example.test"
        with patch.dict(os.environ,secret,clear=True):
            env=start_local.desktop_environment()
            self.assertEqual(env["JARVIS_CLOUD_ORIGIN"],secret["JARVIS_CLOUD_ORIGIN"])
            self.assertEqual(env["JARVIS_CLOUD"],"1")
            self.assertFalse(any(k in env for k in secret if k!="JARVIS_CLOUD_ORIGIN"))
            self.assertIn("DATABASE_URL",os.environ)
