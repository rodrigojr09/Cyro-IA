"""Offline backup UI. The renderer and AI cannot invoke a restore directly."""

import json
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk, simpledialog
import protected_storage

from portable_backup import create_backup, restore_backup


def backup_dialog(data):
    data = Path(data)
    window = tk.Tk()
    window.title("JARVIS — Backups e restauração")
    window.geometry("660x460")
    window.minsize(620, 420)
    frame = ttk.Frame(window, padding=25)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Cuide da sua memória", font=("Segoe UI", 20)).pack(
        anchor="w"
    )
    ttk.Label(
        frame,
        wraplength=560,
        text="O JARVIS deve estar encerrado. Backups portáteis são criptografados e exigem a senha mestra usada ao criá-los. Exporte para outro dispositivo: cópias no mesmo USB não protegem contra perda ou defeito físico.",
    ).pack(anchor="w", pady=15)
    status = ttk.Label(frame, text="", wraplength=560)
    status.pack(anchor="w", pady=10)

    def create(export=False):
        destination = (
            filedialog.askdirectory(
                title="Exportar backup para outra pasta", parent=window
            )
            if export
            else str(data.parent / "backups")
        )
        if not destination:
            return
        try:
            settings = data / "config/settings.json"
            retention = (
                json.loads(protected_storage.read_text(settings)).get(
                    "backup_retention", 5
                )
                if settings.exists()
                else 5
            )
            create_backup(data, destination, retention)
            status.configure(text="Backup criado e verificado.")
        except (OSError, ValueError):
            status.configure(
                text="Não foi possível fazer o backup. Confira o dispositivo, o espaço e se o JARVIS está encerrado."
            )

    def restore():
        backup = filedialog.askopenfilename(
            title="Restaurar backup JARVIS",
            filetypes=[("Backup protegido JARVIS", "*.jbackup")],
            parent=window,
        )
        if not backup:
            return
        confirmed = messagebox.askyesno(
            "Confirmar restauração",
            "Substituir a memória atual pelo backup escolhido?\n\nA pasta atual será preservada separadamente. Conversas posteriores ao backup ficarão nessa pasta anterior.",
            default="no",
            parent=window,
        )
        if not confirmed:
            return
        password = simpledialog.askstring(
            "Desbloquear backup",
            "Senha mestra usada na criação deste backup:",
            show="*",
            parent=window,
        )
        if password is None:
            return
        try:
            restore_backup(backup, data, confirmed=True, password=password)
            status.configure(
                text="Restauração concluída. Os dados anteriores foram preservados. Abra o JARVIS novamente."
            )
        except (OSError, ValueError, KeyError):
            status.configure(
                text="Não foi possível restaurar. Backup inválido, incompatível ou dispositivo indisponível. Confira se o JARVIS está encerrado."
            )

    ttk.Button(frame, text="Criar backup no dispositivo", command=create).pack(
        anchor="w", pady=4
    )
    ttk.Button(
        frame, text="Exportar backup para outra pasta", command=lambda: create(True)
    ).pack(anchor="w", pady=4)
    ttk.Button(frame, text="Restaurar backup…", command=restore).pack(
        anchor="w", pady=4
    )
    window.mainloop()
