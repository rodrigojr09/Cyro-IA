import contextlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from unittest.mock import Mock,patch

import start


def stop_fixture_tree(process):
    # O redirector de ambientes virtuais no Windows também pode criar um Python filho.
    import psutil
    try:family=psutil.Process(process.pid).children(recursive=True)
    except psutil.NoSuchProcess:family=[]
    for child in reversed(family):
        try:child.terminate()
        except psutil.NoSuchProcess:pass
    psutil.wait_procs(family,timeout=5)
    try:
        if isinstance(process,subprocess.Popen):
            if process.poll() is None:process.terminate()
            process.wait(timeout=5)
        else:process.terminate();process.wait(timeout=5)
    except psutil.NoSuchProcess:pass


class LauncherTests(unittest.TestCase):
    def flow(self,reuse=False,probe=0,build=0):
        owner=Mock()
        backend=Mock();backend.poll.return_value=None
        frontend=Mock();frontend.poll.return_value=0;frontend.returncode=0
        probe_process=Mock();probe_process.wait.return_value=probe
        build_process=Mock();build_process.wait.return_value=build
        owner.spawn.side_effect=[probe_process,build_process,frontend] if reuse else [probe_process,backend,build_process,frontend]
        stack=contextlib.ExitStack()
        stack.enter_context(patch.object(start,'InstanceLock',return_value=contextlib.nullcontext()))
        stack.enter_context(patch.object(start,'OwnedProcesses',return_value=owner))
        stack.enter_context(patch.object(start,'dependencies',return_value=('node','electron')))
        stack.enter_context(patch.object(start,'port_open',return_value=reuse))
        wait=stack.enter_context(patch.object(start,'wait_backend'))
        stack.enter_context(patch.object(start.importlib.util,'find_spec',return_value=object()))
        stack.enter_context(patch.object(start,'say'))
        return stack,owner,backend,wait

    def test_start_order_current_python_and_absolute_cwds(self):
        stack,owner,backend,wait=self.flow()
        with stack:self.assertEqual(start.launch(),0)
        calls=owner.spawn.call_args_list
        self.assertEqual(calls[1].args[0][0],sys.executable)
        self.assertEqual(calls[1].args[0][2],start.ROOT/'start.py')
        self.assertEqual(calls[1].args[1],start.BACKEND)
        self.assertEqual(calls[-1].args[1],start.DESKTOP)
        wait.assert_called_once_with(backend)
        owner.close.assert_called_once()

    def test_reuse_never_spawns_or_owns_external_backend(self):
        stack,owner,backend,wait=self.flow(reuse=True)
        with stack:self.assertEqual(start.launch(),0)
        self.assertEqual(owner.spawn.call_count,3)
        self.assertTrue(all('--backend-child' not in call.args[0] for call in owner.spawn.call_args_list))
        wait.assert_called_once_with(None,timeout=4)
        backend.terminate.assert_not_called()

    def test_native_existing_app_returns_without_backend_or_build(self):
        stack,owner,_,_=self.flow(probe=73)
        with stack:self.assertEqual(start.launch(),0)
        self.assertEqual(owner.spawn.call_count,1)
        owner.close.assert_called_once()

    def test_port_occupied_by_unknown_service_does_not_spawn_backend(self):
        stack,owner,_,wait=self.flow(reuse=True)
        with stack:
            wait.side_effect=start.LaunchError('timeout')
            with self.assertRaisesRegex(start.LaunchError,'Porta 8765 ocupada'):start.launch()
        self.assertEqual(owner.spawn.call_count,1)
        owner.close.assert_called_once()

    def test_build_failure_cleans_up_owned_backend(self):
        stack,owner,_,_=self.flow(build=1)
        with stack:
            with self.assertRaisesRegex(start.LaunchError,'compilar'):start.launch()
        self.assertEqual(owner.spawn.call_count,3)
        owner.close.assert_called_once()

    def test_missing_python_dependencies_never_launch_backend(self):
        stack,owner,_,_=self.flow()
        with stack,patch.object(start.importlib.util,'find_spec',return_value=None):
            with self.assertRaisesRegex(start.LaunchError,'Dependências Python'):start.launch()
        self.assertEqual(owner.spawn.call_count,1)
        owner.close.assert_called_once()

    def test_keyboard_interrupt_always_cleans_up(self):
        stack,owner,_,wait=self.flow()
        with stack:
            wait.side_effect=KeyboardInterrupt
            with self.assertRaises(KeyboardInterrupt):start.launch()
        owner.close.assert_called_once()

    def test_wait_detects_early_exit_and_timeout(self):
        child=Mock();child.poll.return_value=1
        with self.assertRaisesRegex(start.LaunchError,'encerrou'):start.wait_backend(child)
        with self.assertRaisesRegex(start.LaunchError,'respondeu'):start.wait_backend(None,timeout=0)

    def test_duplicate_lock_and_release_work_with_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'lock'
            with start.InstanceLock(path):
                with self.assertRaises(start.LaunchError):
                    with start.InstanceLock(path):pass
            with start.InstanceLock(path):pass

    def test_health_checks_service_and_installation_on_real_local_http(self):
        response={'ok':True,'service':'jarvis','installation':start.INSTALLATION,'version':start.VERSION}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*_):pass
            def do_GET(self):
                self.send_response(200);self.end_headers();self.wfile.write(json.dumps(response).encode())
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with patch.object(start,'PORT',server.server_port):
                self.assertTrue(start.healthy());response['service']='other';self.assertFalse(start.healthy())
                response['service']='jarvis';response['installation']='other';self.assertFalse(start.healthy())
        finally:server.shutdown();server.server_close();thread.join()

    def test_missing_node_has_actionable_error(self):
        with patch.object(start.shutil,'which',return_value=None):
            with self.assertRaisesRegex(start.LaunchError,'Node.js'):start.dependencies()

    def test_real_owned_tree_cleanup_preserves_unowned_process(self):
        import psutil
        with tempfile.TemporaryDirectory() as directory:
            marker=Path(directory)/'pid'
            external=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'])
            owned=start.OwnedProcesses()
            try:
                script=('import subprocess,sys,time,signal;from pathlib import Path;'
                        "signal.signal(getattr(signal,'SIGBREAK',signal.SIGTERM),lambda *_:sys.exit(0));"
                        "child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);"
                        'Path(sys.argv[1]).write_text(str(child.pid));time.sleep(60)')
                parent=owned.spawn([sys.executable,'-c',script,marker],Path(directory))
                deadline=time.monotonic()+5
                while not marker.exists() and time.monotonic()<deadline:time.sleep(.05)
                self.assertTrue(marker.exists())
                descendant=psutil.Process(int(marker.read_text()))
                owned.close()
                self.assertIsNotNone(parent.poll())
                descendant.wait(timeout=5)
                self.assertIsNone(external.poll())
            finally:
                owned.close();stop_fixture_tree(external)

    @unittest.skipUnless(os.name=='nt','Política de Job Object específica do Windows')
    def test_backend_job_preserves_applications_opened_after_startup(self):
        import psutil
        with tempfile.TemporaryDirectory() as directory:
            marker=Path(directory)/'pid'
            owned=start.OwnedProcesses();application=None
            try:
                script=('import subprocess,sys,time,signal;from pathlib import Path;'
                        "signal.signal(signal.SIGBREAK,lambda *_:sys.exit(0));"
                        "child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],creationflags=subprocess.CREATE_NEW_PROCESS_GROUP|subprocess.CREATE_BREAKAWAY_FROM_JOB);"
                        'Path(sys.argv[1]).write_text(str(child.pid));time.sleep(60)')
                parent=owned.spawn([sys.executable,'-c',script,marker],Path(directory),preserve_descendants=True)
                deadline=time.monotonic()+5
                while not marker.exists() and time.monotonic()<deadline:time.sleep(.05)
                self.assertTrue(marker.exists())
                application=psutil.Process(int(marker.read_text()))
                owned.close()
                self.assertIsNotNone(parent.poll())
                self.assertTrue(application.is_running())
            finally:
                owned.close()
                if application is not None:stop_fixture_tree(application)

    @unittest.skipUnless(os.name=='nt','Desligamento gracioso do Uvicorn no Windows')
    def test_real_uvicorn_child_receives_graceful_shutdown(self):
        import socket
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            source=("import json\nfrom pathlib import Path\n"
                    "async def app(scope,receive,send):\n"
                    " if scope['type']=='lifespan':\n"
                    "  while True:\n"
                    "   event=await receive()\n"
                    "   if event['type']=='lifespan.startup':await send({'type':'lifespan.startup.complete'})\n"
                    "   else:\n"
                    "    Path(__file__).with_name('shutdown').write_text('clean')\n"
                    "    await send({'type':'lifespan.shutdown.complete'});return\n"
                    " else:\n"
                    "  await send({'type':'http.response.start','status':200,'headers':[]})\n"
                    "  await send({'type':'http.response.body','body':"+repr(json.dumps({'ok':True,'service':'jarvis','installation':start.INSTALLATION,'version':start.VERSION}).encode())+"})\n")
            (root/'main.py').write_text(source)
            with socket.socket() as listener:listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
            owned=start.OwnedProcesses()
            try:
                script='import start,sys;from pathlib import Path;start.BACKEND=Path(sys.argv[1]);start.PORT=int(sys.argv[2]);start.backend_child()'
                child=owned.spawn([sys.executable,'-c',script,root,port],start.ROOT,preserve_descendants=True)
                with patch.object(start,'PORT',port):start.wait_backend(child,timeout=10)
                owned.close()
                self.assertEqual((root/'shutdown').read_text(),'clean')
            finally:owned.close()

    def test_port_race_is_rejected_before_importing_application(self):
        import socket
        with tempfile.TemporaryDirectory() as directory,socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen()
            root=Path(directory);marker=root/'imported'
            (root/'main.py').write_text("from pathlib import Path\nPath(__file__).with_name('imported').write_text('unexpected')\n")
            script='import start,sys;from pathlib import Path;start.BACKEND=Path(sys.argv[1]);start.PORT=int(sys.argv[2]);start.sys.argv=["start.py","--backend-child"];sys.exit(start.main())'
            child=subprocess.run([sys.executable,'-c',script,str(root),str(listener.getsockname()[1])],cwd=start.ROOT,capture_output=True,timeout=10)
            self.assertEqual(child.returncode,1)
            self.assertFalse(marker.exists())


if __name__=='__main__':unittest.main()
