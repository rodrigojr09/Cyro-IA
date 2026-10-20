"""Native password UI, only reachable from human application startup/configuration."""

import os
import tkinter as tk
from tkinter import messagebox, ttk
from pathlib import Path

from secure_vault import load_bundle, save_key


def credentials(data, configure=False, parent=None, return_bundle=False):
    vault = Path(data) / "config" / "credentials.vault"
    create = configure or not vault.exists()
    result = []
    window = tk.Toplevel(parent) if parent is not None else tk.Tk()
    window.title("JARVIS — Configurar API" if create else "JARVIS — Desbloquear")
    window.geometry("650x600" if create else "560x320")
    window.minsize(560, 540 if create else 300)
    frame = ttk.Frame(window, padding=24)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Sua chave, seu assistente", font=("Segoe UI", 18)).pack(
        anchor="w"
    )
    ttk.Label(
        frame,
        text="A senha mestra acompanha você, mas não é salva no dispositivo.",
        wraplength=500,
    ).pack(anchor="w", pady=12)
    api = tk.StringVar()
    password = tk.StringVar()
    repeat = tk.StringVar()
    if create:
        ttk.Label(
            frame,
            text="Chave da OpenAI API (assinatura ChatGPT não inclui créditos de API)",
            wraplength=500,
        ).pack(anchor="w")
        field = ttk.Entry(frame, textvariable=api, show="*", width=65)
        field.pack(fill="x", pady=5)
        visible = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            frame,
            text="Mostrar chave",
            variable=visible,
            command=lambda: field.configure(show="" if visible.get() else "*"),
        ).pack(anchor="w")

        def test():
            # No SDK debug logging or provider exception text (which could contain secrets).
            key = api.get()
            if (
                not key.startswith("sk-")
                or len(key) < 20
                or any(c.isspace() for c in key)
            ):
                messagebox.showerror(
                    "Chave inválida",
                    "Confira a chave no painel da OpenAI API.",
                    parent=window,
                )
                return
            from openai import (
                OpenAI,
                AuthenticationError,
                APIConnectionError,
                RateLimitError,
            )
            import logging

            for logger in ["openai", "httpx", "httpcore"]:
                logging.getLogger(logger).setLevel(logging.WARNING)

            try:
                with OpenAI(
                    api_key=key,
                    max_retries=0,
                    timeout=15,
                    base_url="https://api.openai.com/v1",
                ) as client:
                    client.models.list()
                messagebox.showinfo(
                    "Conexão",
                    "Autenticação aceita. Isso não garante saldo nem acesso a todos os modelos.",
                    parent=window,
                )
            except AuthenticationError:
                messagebox.showerror(
                    "Conexão",
                    "Chave recusada. Gere ou confira sua chave da API.",
                    parent=window,
                )
            except RateLimitError:
                messagebox.showerror(
                    "Conexão",
                    "Limite ou cota da API atingido. Confira sua conta.",
                    parent=window,
                )
            except APIConnectionError:
                messagebox.showerror(
                    "Conexão",
                    "Não foi possível conectar. Confira internet, proxy e firewall.",
                    parent=window,
                )
            except Exception:
                messagebox.showerror(
                    "Conexão",
                    "Não foi possível validar a API. Tente novamente mais tarde.",
                    parent=window,
                )

        ttk.Button(frame, text="Testar conexão autenticada", command=test).pack(
            anchor="w", pady=5
        )
    ttk.Label(frame, text="Senha mestra (mínimo 12 caracteres)").pack(
        anchor="w", pady=(10, 0)
    )
    ttk.Entry(frame, textvariable=password, show="*", width=65).pack(fill="x", pady=5)
    if create:
        ttk.Label(frame, text="Repita a senha mestra").pack(anchor="w")
        ttk.Entry(frame, textvariable=repeat, show="*").pack(fill="x", pady=5)

    def submit():
        try:
            data_key = None
            if create:
                if password.get() != repeat.get():
                    raise ValueError("As senhas não coincidem.")
                if vault.exists():
                    # Replacing a key requires both the old password and explicit human choice.
                    from tkinter.simpledialog import askstring

                    old = askstring(
                        "Confirmar troca",
                        "Senha mestra atual:",
                        show="*",
                        parent=window,
                    )
                    if old is None:
                        return
                    data_key = load_bundle(vault, old)["data_key"]
                save_key(vault, api.get(), password.get(), data_key=data_key)
                unlocked = load_bundle(vault, password.get())
            else:
                unlocked = load_bundle(vault, password.get())
            result.append(unlocked if return_bundle else unlocked["api_key"])
            api.set("")
            password.set("")
            repeat.set("")
            window.destroy()
        except (ValueError, OSError):
            messagebox.showerror(
                "JARVIS",
                "Confira a chave, as senhas e a permissão do dispositivo. Senha incorreta ou cofre danificado impede desbloqueio.",
                parent=window,
            )

    ttk.Button(frame, text="Salvar" if create else "Desbloquear", command=submit).pack(
        anchor="e", pady=12
    )
    if parent is not None:
        window.transient(parent)
        window.grab_set()
        parent.wait_window(window)
    else:
        window.mainloop()
    return result[0] if result else None
