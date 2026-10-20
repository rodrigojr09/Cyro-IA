import asyncio
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import main
import test_jarvis
from ai_tools import MAX_CONTEXT_CHARS, converse, speech_text
from programming.discovery import discover, project_candidates
from programming.security import ReadError, ReadPolicy, redact
from programming.tools import ProgrammingService, TOOLS


def call(name, args):
    return SimpleNamespace(
        id="test_" + name,
        function=SimpleNamespace(name=name, arguments=json.dumps(args)),
    )


def fixture(root):
    desktop = root / "Desktop"
    project = desktop / "iPet"
    files = {
        "package.json": '{"dependencies":{"next":"15","react":"19","express":"5"},"devDependencies":{"electron":"44"}}',
        "backend/index.ts": 'import { getUsers } from "./users";\nexport const result = getUsers();\n// READ_ONLY_SENTINEL\n',
        "backend/users.ts": "export function getUsers() { return []; }\n",
        "frontend/index.ts": 'import React from "react";\n',
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
        "helper.js": "export class Helper {}\n",
        "requirements.txt": "fastapi>=0.115\n",
        ".env": "OPENAI_API_KEY=DO_NOT_READ_ENV\n",
        "credentials.json": '{"password":"DO_NOT_READ_CREDENTIALS"}',
        "private.key": "DO_NOT_READ_KEY",
        "database.sqlite3": "DO_NOT_READ_DB",
        "node_modules/hidden/index.ts": "DO_NOT_READ_VENDOR",
        ".git/config": "DO_NOT_READ_GIT",
        "binary.ts": "\x00BINARY",
    }
    for relative, content in files.items():
        path = project / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return desktop, project


def hashes(root):
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file() and not path.is_symlink()
    }


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.desktop, self.project = fixture(self.root)
        self.storage = self.root / "jarvis-state"
        self.storage.mkdir()
        self.service = ProgrammingService(self.storage)
        self.service.authorize(str(self.desktop))
        self.service.dispatch("select_project", '{"project":"iPet"}')
        self.before = hashes(self.desktop)

    def tearDown(self):
        self.assertEqual(
            self.before,
            hashes(self.desktop),
            "Os projetos analisados foram modificados",
        )
        self.temp.cleanup()

    def run_tool(self, name, **kwargs):
        return self.service.dispatch(name, json.dumps(kwargs))

    def test_discovery_desktop_aliases_absolute_and_project_root(self):
        self.assertTrue(
            any(
                item["name"] == "iPet"
                for item in discover(self.service.policy)["projects"]
            )
        )
        for reference in [
            "Área de Trabalho/iPet",
            "Desktop/iPet",
            str(self.project),
            str(self.project / "backend/index.ts"),
        ]:
            result = self.run_tool("select_project", project=reference)
            self.assertEqual(result["project"]["path"], str(self.project))
        for name, alias in [("Documents", "Documentos"), ("Downloads", "Downloads")]:
            directory = self.root / name
            directory.mkdir()
            self.service.authorize(str(directory))
            self.assertEqual(
                project_candidates(self.service.policy, alias), [directory]
            )

    def test_read_typescript_javascript_python_json_and_subfolders(self):
        for path in ["backend/index.ts", "helper.js", "main.py", "package.json"]:
            data = self.run_tool("read_file", path=path)
            self.assertIn("1: ", data["content"])
            self.assertEqual(data["path"], str(self.project / path))
        data = self.run_tool("read_file", path="index.ts do backend")
        self.assertIn("getUsers", data["content"])

    def test_search_functions_imports_extensions_and_partial_paths(self):
        for query in ["getUsers", "import", "FastAPI"]:
            self.assertTrue(self.run_tool("search_code", query=query)["matches"])
        for query in ["*.ts", ".py", "backend/index"]:
            self.assertTrue(self.run_tool("search_files", query=query)["entries"])

    def test_duplicate_filenames_and_projects_require_clarification(self):
        data = self.run_tool("read_file", path="index.ts")
        self.assertTrue(data["needs_clarification"])
        self.assertEqual(len(data["candidates"]), 2)
        root_file = self.project / "index.ts"
        root_file.write_text("// duplicate in root", encoding="utf-8")
        try:
            self.assertEqual(
                len(self.run_tool("read_file", path="index.ts")["candidates"]), 3
            )
            self.assertEqual(
                self.run_tool("read_file", path="./index.ts")["path"], str(root_file)
            )
        finally:
            root_file.unlink()
        another = self.root / "Documents" / "iPet"
        another.mkdir(parents=True)
        self.service.authorize(str(another.parent))
        self.assertTrue(
            self.run_tool("select_project", project="iPet")["needs_clarification"]
        )

    def test_block_sensitive_files_for_every_access_pattern(self):
        for path in [
            ".env",
            "credentials.json",
            "private.key",
            "database.sqlite3",
            "node_modules/hidden/index.ts",
            ".git/config",
        ]:
            with self.assertRaises(ReadError):
                self.service.policy.read(path, self.project)
        for tool, args in [
            ("list_directory", {}),
            ("search_files", {"query": "env"}),
            ("search_code", {"query": "DO_NOT_READ"}),
            ("get_project_structure", {}),
        ]:
            output = json.dumps(self.run_tool(tool, **args))
            self.assertNotIn("DO_NOT_READ", output)
            self.assertNotIn("credentials.json", output)
        self.assertFalse(self.run_tool("search_code", query="DO_NOT_READ")["matches"])

    def test_outside_paths_traversal_ads_and_unc_are_blocked(self):
        outside = self.root / "outside.ts"
        outside.write_text("outside", encoding="utf-8")
        for value in [
            str(outside),
            "../outside.ts",
            "backend/../../outside.ts",
            "backend/index.ts:stream",
            "\\\\server\\share\\code.py",
            "C:relative.ts",
            "\\\\?\\C:\\Windows\\file.py",
        ]:
            with self.assertRaises(ReadError):
                self.service.policy.read(value, self.project)

    def test_symlinks_and_junctions_are_blocked(self):
        link = self.project / "linked.ts"
        try:
            link.symlink_to(self.project / "main.py")
        except OSError:
            # Sem privilégio de symlink no Windows, simula o atributo de junction.
            original = Path.lstat

            def reparse(path):
                info = original(path)
                return (
                    SimpleNamespace(st_mode=info.st_mode, st_file_attributes=0x400)
                    if path == self.project / "main.py"
                    else info
                )

            with patch.object(Path, "lstat", reparse):
                with self.assertRaises(ReadError):
                    self.service.policy.read(self.project / "main.py")
            return
        try:
            with self.assertRaises(ReadError):
                self.service.policy.read(link)
        finally:
            link.unlink()

    def test_no_writes_execution_or_authorization_tool(self):
        with patch("subprocess.Popen") as execute, patch("os.system") as system:
            for name in [
                "write_file",
                "delete_file",
                "rename_file",
                "run_command",
                "open_application",
                "install_dependencies",
                "authorize_folder",
                "confirm_action",
            ]:
                with self.assertRaises(ReadError):
                    self.run_tool(name, path="main.py", command="echo unsafe")
            self.run_tool("analyze_project")
            self.run_tool("get_file_context", path="backend/index.ts")
            execute.assert_not_called()
            system.assert_not_called()
        self.assertNotIn(
            "authorize", " ".join(tool["function"]["name"] for tool in TOOLS)
        )

    def test_context_reuse_and_persistence_contain_references_not_file_contents(self):
        result = self.run_tool("get_file_context", path="backend/index.ts")
        self.assertTrue(result["related"])
        self.assertEqual(
            self.service.context.data["last_file"],
            str(self.project / "backend/index.ts"),
        )
        self.service.context.remember(
            "Problema no login", "Sugestão:\n```ts\nconst privateContent = 1;\n```"
        )
        restored = ProgrammingService(self.storage)
        self.assertEqual(restored.selected(), self.project)
        self.assertTrue(restored.context.data["references"])
        stored = restored.context.state_file.read_text(encoding="utf-8")
        self.assertNotIn("READ_ONLY_SENTINEL", stored)
        self.assertNotIn("privateContent", stored)

    def test_missing_permission_binary_size_and_line_limits(self):
        with self.assertRaises(ReadError):
            self.service.policy.read(self.project / "missing.ts")
        with self.assertRaises(ReadError):
            self.service.policy.read(self.project / "binary.ts")
        with patch.object(
            Path, "open", side_effect=PermissionError("private-path-secret")
        ):
            with self.assertRaisesRegex(ReadError, "permissão"):
                self.service.policy.read(self.project / "main.py")
        with self.assertRaises(ReadError):
            self.run_tool("read_file", path="main.py", end_line=300)
        large = self.project / "large.ts"
        large.write_text("x" * (128 * 1024 + 1), encoding="utf-8")
        try:
            with self.assertRaises(ReadError):
                self.service.policy.read(large)
        finally:
            large.unlink()

    def test_technology_detection_and_structure(self):
        data = self.run_tool("analyze_project", project="iPet")
        for tech in [
            "Next.js",
            "React",
            "Node.js",
            "Express",
            "Electron",
            "Python",
            "FastAPI",
        ]:
            self.assertIn(tech, data["technologies"])
        self.assertTrue(self.run_tool("get_project_structure", depth=1)["entries"])

    def test_no_implicit_authorization_revoke_and_no_disk_root(self):
        service = ProgrammingService(self.root)
        with self.assertRaises(ReadError):
            service.dispatch("list_projects", "{}")
        with self.assertRaises(ReadError):
            service.authorize(self.desktop.anchor)
        self.service.revoke(str(self.desktop))
        self.assertIsNone(self.service.status()["project"])
        with self.assertRaises(ReadError):
            self.service.policy.read(self.project / "main.py")

    def test_embedded_secrets_redaction(self):
        value = (
            'api_key = "sk-this-is-a-fake-secret-test"\npassword = "private-value"\n'
        )
        clean = redact(value)
        self.assertNotIn("sk-this", clean)
        self.assertNotIn("private-value", clean)
        manifest = json.loads(
            redact('{"dependencies":{"jsonwebtoken":"9"},"api_key":"test-private"}')
        )
        self.assertIn("jsonwebtoken", manifest["dependencies"])
        self.assertNotIn("test-private", json.dumps(manifest))
        self.assertEqual(json.loads(redact('{"api_key": "abc", "safe": 1}'))["safe"], 1)

    def test_hard_links_cannot_bypass_sensitive_names(self):
        link = self.project / "leak.ts"
        os.link(self.project / ".env", link)
        try:
            with self.assertRaises(ReadError):
                self.service.policy.read(link)
        finally:
            link.unlink()

    def test_walk_limits_depth_and_entry_count(self):
        from programming.discovery import walk

        result = walk(self.service.policy, self.project, max_entries=2)
        self.assertLessEqual(result["visited"], 2)
        self.assertTrue(result["truncated"])
        result = walk(self.service.policy, self.project, depth=0)
        self.assertFalse(
            any(
                item["relative_path"].startswith("backend/")
                for item in result["entries"]
            )
        )

    def test_search_reads_later_lines_and_rejects_extra_arguments(self):
        path = self.project / "long.py"
        path.write_text("\n" * 250 + "def laterFunction(): pass\n", encoding="utf-8")
        try:
            result = self.run_tool("search_code", query="laterFunction")
            self.assertEqual(result["matches"][0]["line"], 251)
            read = self.run_tool(
                "read_file", path="long.py", start_line=245, end_line=260
            )
            self.assertIn("251:", read["content"])
            with self.assertRaises(ValueError):
                self.run_tool("read_file", path="long.py", mode="write")
        finally:
            path.unlink()


class ProgrammingChatTests(unittest.TestCase):
    def setUp(self):
        test_jarvis.JarvisTests.setUp(self)
        root = Path(self.temp.name)
        self.desktop, self.project = fixture(root)
        self.service = ProgrammingService(root)
        self.service.authorize(str(self.desktop))
        self.service_patch = patch.object(main, "programming", self.service)
        self.service_patch.start()

    def tearDown(self):
        self.service_patch.stop()
        test_jarvis.JarvisTests.tearDown(self)

    def test_progressive_analysis_follow_up_and_audio(self):
        sequence = [
            test_jarvis.completion(
                calls=[call("analyze_project", {"project": "iPet"})]
            ),
            test_jarvis.completion(
                calls=[call("read_file", {"path": "backend/index.ts"})]
            ),
            test_jarvis.completion(
                "Hipótese em backend/index.ts:2. Sugestão:\n```ts\nconst result = [];\n```"
            ),
        ]
        create = AsyncMock(side_effect=sequence)
        with patch.object(main.client.chat.completions, "create", create):
            response = self.client.post(
                "/chat",
                json={"message": "Analise o login de iPet", "mode": "programming"},
            )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["programming"]["project"]["name"], "iPet")
        self.assertNotIn("const result", data["speech_text"])
        self.assertIn("const result", data["reply"])
        self.assertNotIn("const result", json.dumps(self.client.get("/history").json()))
        create = AsyncMock(
            return_value=test_jarvis.completion("Continuando a análise do login.")
        )
        with patch.object(main.client.chat.completions, "create", create):
            self.client.post(
                "/chat",
                json={"message": "E como posso corrigir?", "mode": "programming"},
            )
        sent = json.dumps(create.call_args.kwargs["messages"], ensure_ascii=False)
        self.assertIn("iPet", sent)
        self.assertIn("login", sent)
        self.assertIn("backend", sent)
        with patch.object(
            main.client.audio.speech,
            "create",
            AsyncMock(return_value=SimpleNamespace(content=b"mp3")),
        ):
            self.assertEqual(
                self.client.post(
                    "/speak", json={"message": data["speech_text"]}
                ).status_code,
                200,
            )

    def test_model_cannot_call_computer_or_grant_tools_in_readonly_mode(self):
        for forbidden in [
            "open_application",
            "run_command",
            "write_file",
            "authorize_folder",
        ]:
            create = AsyncMock(
                side_effect=[
                    test_jarvis.completion(calls=[call(forbidden, {"app": "notepad"})]),
                    test_jarvis.completion("Operação bloqueada."),
                ]
            )
            with patch.object(main.client.chat.completions, "create", create), patch(
                "subprocess.Popen"
            ) as execute:
                response = self.client.post(
                    "/chat",
                    json={"message": "Analise o projeto", "mode": "programming"},
                )
            self.assertEqual(response.status_code, 200)
            execute.assert_not_called()
            self.assertFalse(response.json()["pending_actions"])
            available = [
                tool["function"]["name"]
                for tool in create.call_args_list[0].kwargs["tools"]
            ]
            self.assertNotIn(forbidden, available)

    def test_authorization_requires_authenticated_human_endpoint_and_status(self):
        self.assertEqual(self.client.get("/programming/status").status_code, 200)
        self.assertEqual(
            self.client.post(
                "/programming/authorize",
                headers={"X-Jarvis-Token": ""},
                json={"path": str(self.desktop)},
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                "/programming/authorize", json={"path": str(self.root_missing())}
            ).status_code,
            400,
        )

    def root_missing(self):
        return Path(self.temp.name) / "missing"

    def test_speech_is_short_and_does_not_read_code(self):
        result = speech_text(
            "Explicação.\n```python\n"
            + "print(1)\n" * 200
            + "```\n"
            + "Mais detalhes. " * 200
        )
        self.assertLessEqual(len(result), 700)
        self.assertNotIn("print(1)", result)

    def test_round_and_context_budgets_stop_progressive_calls(self):
        self.service.dispatch("select_project", '{"project":"iPet"}')
        response = test_jarvis.completion(
            calls=[call("search_code", {"query": "getUsers"})]
        )
        create = AsyncMock(return_value=response)
        client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        )
        messages = [{"role": "user", "content": "Investigue"}]
        asyncio.run(
            converse(client, "fake-model", messages, "programming", self.service)
        )
        self.assertLessEqual(create.await_count, 6)
        self.assertLessEqual(
            sum(len(item["content"]) for item in messages if item["role"] == "tool"),
            MAX_CONTEXT_CHARS,
        )

    def test_large_results_and_many_calls_do_not_exceed_context_or_dispatch_budget(
        self,
    ):
        responses = [
            test_jarvis.completion(calls=[call("list_projects", {}) for _ in range(8)])
        ] * 5
        responses.append(test_jarvis.completion("Análise parcial."))
        create = AsyncMock(side_effect=responses)
        client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        )
        messages = [{"role": "user", "content": "Analise"}]
        with patch.object(
            self.service, "dispatch", return_value={"content": "x" * 50000}
        ) as dispatch:
            asyncio.run(
                converse(client, "fake-model", messages, "programming", self.service)
            )
        self.assertLessEqual(dispatch.call_count, 12)
        self.assertLessEqual(
            sum(len(item["content"]) for item in messages if item["role"] == "tool"),
            MAX_CONTEXT_CHARS,
        )


if __name__ == "__main__":
    unittest.main()
