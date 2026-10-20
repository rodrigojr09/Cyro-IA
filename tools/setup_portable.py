"""Native six-step setup. Compiled separately; never formats a destination."""

import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from portable_install import install, removable_drives
from credential_dialog import credentials

TARGET_VERSION = "2.0.1-dev.0"


class Setup:
    def __init__(self):
        self.window = tk.Tk()
        self.window.title("JARVIS Setup — " + TARGET_VERSION + " (em desenvolvimento)")
        self.window.geometry("820x610")
        self.window.minsize(760, 560)
        self.frame = ttk.Frame(self.window, padding=28)
        self.frame.pack(fill="both", expand=True)
        self.step = 0
        self.destination = None
        self.manual = False
        self.vault = None
        self.unlocked = None
        self.events = queue.Queue()
        self.temporary = tempfile.TemporaryDirectory(prefix="jarvis-setup-")
        self.busy = False
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.show()

    def close(self):
        if self.busy:
            messagebox.showinfo(
                "Aguarde",
                "Aguarde a instalação terminar. Se o dispositivo foi desconectado, aguarde a mensagem de erro.",
                parent=self.window,
            )
            return
        self.temporary.cleanup()
        self.window.destroy()

    def clear(self):
        for child in self.frame.winfo_children():
            child.destroy()

    def next(self):
        if self.step == 1 and self.destination is None:
            messagebox.showerror(
                "Escolha o dispositivo",
                "Selecione uma unidade ou escolha o destino manualmente.",
                parent=self.window,
            )
            return
        if self.step == 2 and self.unlocked is None:
            messagebox.showerror(
                "Configuração necessária",
                "Configure ou desbloqueie seu cofre antes de instalar.",
                parent=self.window,
            )
            return
        if self.step == 3:
            self.settings = {
                "display_name": self.name.get().strip()[:120] or "Usuário",
                "language": "pt-BR",
                "theme": self.theme.get(),
                "voice": self.voice.get(),
                "quick_chat": self.quick.get(),
                "backup_retention": self.retention.get(),
                "privacy": {"send_authorized_content_to_api": self.privacy.get()},
            }
            if not self.privacy.get():
                messagebox.showinfo(
                    "Privacidade",
                    "Para usar a API, mensagens e conteúdo autorizado precisam ser enviados à OpenAI. Você pode cancelar a instalação.",
                    parent=self.window,
                )
                return
        self.step += 1
        self.show()

    def show(self):
        self.clear()
        headings = [
            "Bem-vindo ao JARVIS",
            "Escolha seu dispositivo",
            "Sua OpenAI API",
            "Seu espaço pessoal",
            "Instalando",
            "Tudo pronto",
        ]
        ttk.Label(
            self.frame, text=f"{self.step + 1} de 6 · JARVIS {TARGET_VERSION}"
        ).pack(anchor="w")
        ttk.Label(self.frame, text=headings[self.step], font=("Segoe UI", 24)).pack(
            anchor="w", pady=15
        )
        if self.step == 0:
            ttk.Label(
                self.frame,
                wraplength=740,
                justify="left",
                text="Leve seu assistente, preferências e histórico em um dispositivo removível.\n\nWindows 10 ou 11 x64. Não é necessário instalar Python ou Node.js no computador de destino. Reserve espaço para o aplicativo, seus dados e backups. A API exige conexão à internet e créditos próprios da OpenAI.\n\nConecte o dispositivo e execute Iniciar JARVIS.exe. Não há execução automática universal ao conectar USB.\n\nEsta edição está em desenvolvimento. A chave será criptografada; os bancos de conversas ainda não têm criptografia. Computadores comprometidos podem capturar dados e senhas. Backups no mesmo USB não protegem contra perda física.",
            ).pack(anchor="w", pady=12)
        elif self.step == 1:
            columns = ("name", "path", "total", "free", "fs")
            tree = ttk.Treeview(
                self.frame,
                columns=columns,
                show="headings",
                selectmode="browse",
                height=7,
            )
            for key, label in zip(
                columns, ["Nome", "Unidade", "Total (GiB)", "Livre (GiB)", "Formato"]
            ):
                tree.heading(key, text=label)
                tree.column(key, width=140)
            for drive in removable_drives():
                tree.insert(
                    "",
                    "end",
                    iid=drive["path"],
                    values=(
                        drive["name"],
                        drive["path"],
                        f'{drive["total"] / 1024**3:.1f}',
                        f'{drive["free"] / 1024**3:.1f}',
                        drive["filesystem"],
                    ),
                )
            tree.pack(fill="x", pady=8)
            status = ttk.Label(self.frame, text="Nenhum dispositivo selecionado.")
            status.pack(anchor="w", pady=10)

            def select(event):
                selected = tree.selection()
                if selected:
                    self.destination, self.manual = selected[0], False
                    status.configure(text="Destino: " + self.destination)

            tree.bind("<<TreeviewSelect>>", select)

            def manual():
                chosen = filedialog.askdirectory(
                    title="Escolha o destino no dispositivo externo", parent=self.window
                )
                if chosen and messagebox.askyesno(
                    "Confirmar dispositivo",
                    "Confirma que este destino está no dispositivo externo desejado?\n\n"
                    + chosen
                    + "\n\nNenhum dispositivo será formatado.",
                    parent=self.window,
                ):
                    tree.selection_remove(*tree.selection())
                    self.destination, self.manual = chosen, True
                    status.configure(text="Destino manual: " + chosen)

            ttk.Button(
                self.frame, text="Escolher destino manualmente", command=manual
            ).pack(anchor="w")
            ttk.Label(
                self.frame,
                text="Arquivos existentes serão preservados. Atualizações exigem encerrar o JARVIS pela bandeja.",
                wraplength=730,
            ).pack(anchor="w", pady=15)
        elif self.step == 2:
            ttk.Label(
                self.frame,
                wraplength=730,
                text="Crie uma senha mestra forte e guarde-a fora do dispositivo. Sem ela não será possível recuperar sua chave. O teste autenticado é opcional. Sua assinatura ChatGPT não inclui créditos da API.\n\nEm uma atualização, a configuração existente é preservada.",
            ).pack(anchor="w", pady=15)
            status = ttk.Label(self.frame, text="Configuração pendente")
            status.pack(anchor="w", pady=10)

            def configure():
                existing = (
                    Path(self.destination) / "JARVIS/data/config/credentials.vault"
                )
                target = (
                    existing.parents[1]
                    if existing.exists()
                    else Path(self.temporary.name)
                )
                self.unlocked = credentials(
                    target,
                    configure=not existing.exists(),
                    parent=self.window,
                    return_bundle=True,
                )
                if self.unlocked:
                    from guided_migration import wizard
                    import protected_storage

                    if existing.exists():
                        with protected_storage.session(
                            target, self.unlocked["data_key"]
                        ):
                            if not wizard(target, self.unlocked["data_key"]):
                                self.unlocked = None
                                return
                    self.vault = (target / "config/credentials.vault").read_bytes()
                    status.configure(text="Chave protegida por senha mestra.")

            ttk.Button(
                self.frame, text="Configurar chave e senha", command=configure
            ).pack(anchor="w")
        elif self.step == 3:
            self.name, self.theme = tk.StringVar(value="Usuário"), tk.StringVar(
                value="dark"
            )
            self.voice, self.quick, self.privacy = (
                tk.BooleanVar(value=False),
                tk.BooleanVar(value=True),
                tk.BooleanVar(value=False),
            )
            self.retention = tk.IntVar(value=5)
            ttk.Label(self.frame, text="Como você quer ser chamado?").pack(anchor="w")
            ttk.Entry(self.frame, textvariable=self.name, width=50).pack(
                anchor="w", pady=5
            )
            ttk.Label(self.frame, text="Idioma: Português (Brasil)").pack(
                anchor="w", pady=8
            )
            ttk.Radiobutton(
                self.frame, text="Tema escuro", variable=self.theme, value="dark"
            ).pack(anchor="w")
            ttk.Radiobutton(
                self.frame, text="Tema claro", variable=self.theme, value="light"
            ).pack(anchor="w")
            ttk.Checkbutton(
                self.frame, text="Respostas por voz", variable=self.voice
            ).pack(anchor="w", pady=4)
            ttk.Checkbutton(self.frame, text="Quick Chat", variable=self.quick).pack(
                anchor="w", pady=4
            )
            ttk.Label(self.frame, text="Backups a manter (1–100)").pack(anchor="w")
            ttk.Spinbox(
                self.frame, from_=1, to=100, textvariable=self.retention, width=6
            ).pack(anchor="w")
            ttk.Checkbutton(
                self.frame,
                text="Entendo que mensagens e fontes autorizadas são enviadas à OpenAI API",
                variable=self.privacy,
            ).pack(anchor="w", pady=15)
        elif self.step == 4:
            self.busy = True
            self.bar = ttk.Progressbar(self.frame, maximum=100)
            self.bar.pack(fill="x", pady=20)
            self.status = ttk.Label(
                self.frame, text="Preparando instalação", wraplength=730
            )
            self.status.pack(anchor="w")
            threading.Thread(target=self.perform_install, daemon=True).start()
            self.window.after(100, self.poll)
            return
        elif self.step == 5:
            ttk.Label(
                self.frame,
                wraplength=730,
                text="Use Iniciar JARVIS.exe na pasta escolhida. Encerre pela bandeja e use a remoção segura do Windows antes de desconectar o dispositivo.\n\nExporte também seus backups para outro dispositivo.",
            ).pack(anchor="w", pady=20)
            ttk.Button(
                self.frame,
                text="Iniciar JARVIS agora",
                command=lambda: subprocess.Popen(
                    [str(Path(self.destination) / "Iniciar JARVIS.exe")], shell=False
                ),
            ).pack(anchor="w", pady=10)
            ttk.Button(self.frame, text="Concluir", command=self.close).pack(anchor="e")
            return
        ttk.Button(
            self.frame,
            text="Instalar / atualizar" if self.step == 3 else "Continuar",
            command=self.next,
        ).pack(side="bottom", anchor="e")

    def perform_install(self):
        bundle = Path(
            getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent / "release")
        )
        try:
            install(
                bundle / "payload.exe",
                bundle / "launcher.exe",
                self.destination,
                TARGET_VERSION,
                self.settings,
                self.vault,
                self.manual,
                lambda percent, text: self.events.put(("progress", (percent, text))),
                data_key=self.unlocked["data_key"],
            )
            self.events.put(("done", None))
        except (OSError, ValueError, RuntimeError):
            self.events.put(
                (
                    "error",
                    "Não foi possível concluir. Confira espaço livre, permissões, conexão do dispositivo e se o JARVIS está encerrado. Instalações anteriores e dados foram preservados. Execute o Setup novamente para recuperar uma interrupção.",
                )
            )

    def poll(self):
        while not self.events.empty():
            kind, value = self.events.get()
            if kind == "progress":
                self.bar["value"], text = value
                self.status.configure(text=text)
            elif kind == "done":
                self.busy, self.step = False, 5
                self.show()
                return
            else:
                self.busy = False
                self.status.configure(text=value)
                ttk.Button(self.frame, text="Fechar", command=self.close).pack(
                    anchor="e", pady=20
                )
                return
        self.window.after(100, self.poll)


if __name__ == "__main__":
    setup = Setup()
    setup.window.mainloop()
