"""Inicialização local do JARVIS. Não instala pacotes nem lê o .env."""
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import build_opener, ProxyHandler

ROOT=Path(__file__).resolve().parent
BACKEND=ROOT/'backend'
DESKTOP=ROOT/'desktop'
PORT=8765
INSTALLATION=hashlib.sha256(os.path.normcase(str(ROOT)).encode()).hexdigest()


class LaunchError(Exception):
    pass


def say(message):
    print('[JARVIS] '+message,flush=True)


class InstanceLock:
    """Lock do SO; o arquivo pode permanecer, mas um processo encerrado não prende o lock."""
    def __init__(self,path=None):
        self.path=path or Path(tempfile.gettempdir())/('jarvis-launch-'+INSTALLATION+'.lock')
        self.file=None

    def __enter__(self):
        self.file=open(self.path,'a+b')
        self.file.seek(0,2)
        if not self.file.tell():
            self.file.write(b'0');self.file.flush()
        self.file.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(self.file.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.file,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.file.close();self.file=None
            raise LaunchError('O iniciador do JARVIS já está em execução.') from None
        return self

    def __exit__(self,*_):
        if self.file:
            self.file.close();self.file=None


class OwnedProcesses:
    """Job Object do Windows limita a limpeza à árvore dos processos criados aqui."""
    def __init__(self):
        self.children=[]
        self.job=None
        self.jobs=[]
        if os.name=='nt':
            from ctypes import wintypes as w
            class Basic(ctypes.Structure):
                _fields_=[('process_time',ctypes.c_int64),('job_time',ctypes.c_int64),('flags',w.DWORD),('min_ws',ctypes.c_size_t),('max_ws',ctypes.c_size_t),('active',w.DWORD),('affinity',ctypes.c_size_t),('priority',w.DWORD),('scheduling',w.DWORD)]
            class IO(ctypes.Structure):
                _fields_=[(name,ctypes.c_uint64) for name in ['read_ops','write_ops','other_ops','read_bytes','write_bytes','other_bytes']]
            class Extended(ctypes.Structure):
                _fields_=[('basic',Basic),('io',IO),('process_memory',ctypes.c_size_t),('job_memory',ctypes.c_size_t),('peak_process',ctypes.c_size_t),('peak_job',ctypes.c_size_t)]
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.CreateJobObjectW.argtypes=[ctypes.c_void_p,w.LPCWSTR];kernel.CreateJobObjectW.restype=w.HANDLE
            kernel.SetInformationJobObject.argtypes=[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD]
            kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE]
            kernel.CloseHandle.argtypes=[w.HANDLE]
            self.kernel=kernel
            self.limits_type=Extended
            self.job=self.new_job()

    def new_job(self,preserve_descendants=False):
        job=self.kernel.CreateJobObjectW(None,None)
        limits=self.limits_type()
        # Permite que apenas as ferramentas autorizadas iniciem aplicativos fora do Job.
        limits.basic.flags=0x2000|(0x800 if preserve_descendants else 0)
        if not job or not self.kernel.SetInformationJobObject(job,9,ctypes.byref(limits),ctypes.sizeof(limits)):
            if job:self.kernel.CloseHandle(job)
            raise LaunchError('O Windows não permitiu preparar o encerramento seguro dos processos.')
        self.jobs.append(job)
        return job

    def spawn(self,args,cwd,preserve_descendants=False):
        kwargs={'cwd':str(cwd),'env':dict(os.environ)}
        kwargs['env'].pop('ELECTRON_RUN_AS_NODE',None)
        if self.job and preserve_descendants:kwargs['env']['JARVIS_LAUNCHER_JOB']='1'
        if os.name=='nt':kwargs['creationflags']=subprocess.CREATE_NEW_PROCESS_GROUP
        else:kwargs['start_new_session']=True
        job=self.new_job(True) if self.job and preserve_descendants else self.job
        try:
            child=subprocess.Popen([str(arg) for arg in args],**kwargs)
        except OSError:
            raise LaunchError('Não foi possível iniciar o processo. Confira os executáveis e as permissões.') from None
        self.children.append(child)
        if job and not self.kernel.AssignProcessToJobObject(job,int(child._handle)):
            child.terminate();child.wait(timeout=5)
            raise LaunchError('O Windows recusou o controle seguro do processo iniciado.')
        return child

    def close(self):
        for child in reversed(self.children):
            if child.poll() is None:
                try:
                    if os.name=='nt':child.send_signal(signal.CTRL_BREAK_EVENT)
                    else:os.killpg(child.pid,signal.SIGTERM)
                    child.wait(timeout=5)
                except (OSError,subprocess.TimeoutExpired):
                    try:child.kill();child.wait(timeout=3)
                    except (OSError,subprocess.TimeoutExpired):pass
        for job in self.jobs:self.kernel.CloseHandle(job)
        self.jobs=[];self.job=None


def port_open():
    try:
        with socket.create_connection(('127.0.0.1',PORT),timeout=.3):return True
    except OSError:return False


def healthy():
    """Sem proxy do sistema, redirects, token ou conteúdo privado."""
    from urllib.request import HTTPRedirectHandler
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self,*_):return None
    try:
        with build_opener(ProxyHandler({}),NoRedirect()).open(f'http://127.0.0.1:{PORT}/health',timeout=.7) as response:
            data=json.loads(response.read(4096))
            return response.status==200 and data.get('ok') is True and data.get('service')=='jarvis' and data.get('installation')==INSTALLATION
    except (OSError,URLError,ValueError,AttributeError):return False


def wait_backend(child,timeout=45):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if child is not None and child.poll() is not None:
            raise LaunchError('O backend encerrou antes de ficar pronto. Confira as dependências e a configuração local.')
        if healthy():return
        time.sleep(.25)
    raise LaunchError('O backend não respondeu ao /health dentro de 45 segundos.')


def dependencies():
    node=shutil.which('node')
    electron=DESKTOP/'node_modules'/'electron'/'dist'/('electron.exe' if os.name=='nt' else 'electron')
    if not node:raise LaunchError('Node.js não encontrado. Instale a versão indicada no README e abra outro terminal.')
    if not electron.is_file() or not (DESKTOP/'node_modules'/'esbuild').is_dir():
        raise LaunchError('Dependências desktop ausentes. Execute npm ci na pasta desktop uma vez.')
    return node,electron


def launch():
    with InstanceLock():
        say('Verificando dependências locais...')
        node,electron=dependencies()
        owned=OwnedProcesses()
        try:
            # O probe usa o mesmo lock nativo do Electron, inclusive para instâncias abertas por npm start.
            probe=owned.spawn([electron,DESKTOP,'--jarvis-probe'],DESKTOP)
            try:code=probe.wait(timeout=15)
            except subprocess.TimeoutExpired:raise LaunchError('O Electron não respondeu à verificação de instância.') from None
            if code==73:
                say('O JARVIS já está aberto. A janela existente foi solicitada.');return 0
            if code!=0:raise LaunchError('Falha ao verificar a instância do Electron.')
            backend=None
            if port_open():
                say('A porta 8765 está em uso; verificando se é o backend deste JARVIS...')
                try:wait_backend(None,timeout=4)
                except LaunchError:raise LaunchError('Porta 8765 ocupada por outro serviço ou backend antigo. Encerre-o manualmente e tente novamente; nenhum processo externo foi finalizado.') from None
                say('Backend existente reutilizado; ele não será encerrado pelo iniciador.')
            else:
                missing=[name for name in ['uvicorn','fastapi','openai','dotenv','psutil'] if importlib.util.find_spec(name) is None]
                if missing:raise LaunchError('Dependências Python ausentes: '+', '.join(missing)+'. Ative o ambiente instalado ou instale backend/requirements.txt uma vez.')
                say('Iniciando FastAPI com o interpretador Python atual na porta 8765...')
                backend=owned.spawn([sys.executable,'-u',ROOT/'start.py','--backend-child'],BACKEND,preserve_descendants=True)
                say('Aguardando o backend responder ao /health...')
                wait_backend(backend)
            say('Backend pronto. Preparando a interface (sem reinstalar pacotes)...')
            build=owned.spawn([node,DESKTOP/'build.cjs'],DESKTOP)
            try:code=build.wait(timeout=60)
            except subprocess.TimeoutExpired:raise LaunchError('A preparação da interface excedeu o tempo esperado.') from None
            if code:raise LaunchError('Falha ao compilar a interface. Confira as dependências desktop instaladas.')
            say('Abrindo o Electron. Feche a janela ou pressione Ctrl+C para encerrar.')
            frontend=owned.spawn([electron,DESKTOP],DESKTOP)
            while frontend.poll() is None:
                if backend is not None and backend.poll() is not None:
                    raise LaunchError('O backend encerrou inesperadamente. Encerrando a interface iniciada aqui.')
                time.sleep(.25)
            if frontend.returncode not in (0,73):raise LaunchError('O Electron encerrou com erro.')
            say('JARVIS encerrado.')
            return 0
        finally:
            say('Finalizando somente os processos iniciados por este script...')
            owned.close()


def backend_child():
    # CTRL_BREAK sinaliza apenas este grupo; convertemos para o desligamento gracioso do Uvicorn.
    if os.name=='nt':signal.signal(signal.SIGBREAK,lambda *_:signal.raise_signal(signal.SIGINT))
    sys.path.insert(0,str(BACKEND))
    import uvicorn
    # Reserve a porta antes de importar main/lifespan: uma corrida não pode substituir o token de outro backend.
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as listener:
        if os.name=='nt':listener.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        try:listener.bind(('127.0.0.1',PORT))
        except OSError:raise LaunchError('Porta 8765 ocupada durante a inicialização; nenhum serviço externo foi alterado.') from None
        config=uvicorn.Config('main:app',host='127.0.0.1',port=PORT,log_level='warning',access_log=False)
        try:uvicorn.Server(config).run(sockets=[listener])
        except KeyboardInterrupt:pass


def main():
    try:
        if sys.argv[1:]==['--backend-child']:
            backend_child();return 0
        if sys.argv[1:]:raise LaunchError('Uso: python start.py')
        return launch()
    except KeyboardInterrupt:
        say('Encerramento solicitado.');return 0
    except (LaunchError,OSError) as error:
        say(str(error) if isinstance(error,LaunchError) else 'Não foi possível acessar os recursos locais. Confira permissões e dependências.')
        return 1


if __name__=='__main__':
    raise SystemExit(main())
