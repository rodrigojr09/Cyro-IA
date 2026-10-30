import unittest
from production import validate, check_origin
from cyro import runtime_environment
from unittest.mock import patch

class PlatformTests(unittest.TestCase):
    def configs(self):
        backend={"NODE_ENV":"production","DATABASE_URL":"postgresql://backend:synthetic-test-only@postgres:5432/cyro_backend","REDIS_URL":"redis://redis:6379/1","AUTH_SECRET":"a"*64,"APP_ORIGIN":"https://admin.cyro-ia.tech","API_PUBLIC_ORIGIN":"https://api.cyro-ia.tech","CYRO_FILES_URL":"http://cyro-files:3000","CYRO_FILES_APPLICATION_ID":"8e17442b-fbe8-42e2-aad7-bd7390422647","CYRO_FILES_SERVICE_KEY":"b"*64,"CYRO_FILES_CONTEXT_SECRET":"c"*64}
        files={"NODE_ENV":"production","DATABASE_URL":"postgresql://files:synthetic-test-only@postgres:5432/cyro_files","REDIS_URL":"redis://redis:6379/2","STORAGE_PATH":"/app/storage","PUBLIC_URL":"http://cyro-files:3000","SERVICE_AUTH_SECRET":"b"*64,"SERVICE_CONTEXT_SECRET":"c"*64,"SIGNED_URL_SECRET":"d"*64}
        cloud={"CYRO_BACKEND_ORIGIN":"https://api.cyro-ia.tech"}
        return backend,files,cloud
    def test_existing_private_services_match_without_exposing_values(self):
        self.assertEqual(validate(*self.configs()),[])
    def test_wrong_shared_keys_and_client_secrets_fail_closed(self):
        backend,files,cloud=self.configs();backend["CYRO_FILES_SERVICE_KEY"]="private-wrong-key"*4;cloud["DATABASE_URL"]="private-database-url"
        result=" ".join(validate(backend,files,cloud));self.assertIn("divergente",result);self.assertIn("remover DATABASE_URL",result);self.assertNotIn("private-wrong-key",result);self.assertNotIn("private-database-url",result)
    def test_database_isolation_and_public_origin(self):
        backend,files,cloud=self.configs();files["DATABASE_URL"]=backend["DATABASE_URL"];cloud["CYRO_BACKEND_ORIGIN"]="http://api.cyro-ia.tech"
        self.assertTrue(validate(backend,files,cloud))
        with self.assertRaises(ValueError):check_origin("https://user:password@api.cyro-ia.tech")
    def test_child_processes_receive_only_explicit_environment(self):
        with patch.dict("os.environ",{"DATABASE_URL":"private","GITHUB_TOKEN":"private","PATH":"runtime"},clear=True):
            env=runtime_environment({"CYRO_BACKEND_ORIGIN":"https://api.cyro-ia.tech"});self.assertEqual(env["PATH"],"runtime");self.assertNotIn("DATABASE_URL",env);self.assertNotIn("GITHUB_TOKEN",env)

if __name__=="__main__":unittest.main()
