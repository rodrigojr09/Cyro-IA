"""Native Tk widgets exercised without showing windows or touching real devices."""

import importlib.util
from pathlib import Path
import sys
import tkinter as tk
from tkinter import ttk
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))
spec = importlib.util.spec_from_file_location(
    "setup_portable", ROOT / "tools/setup_portable.py"
)
setup_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup_module)
from credential_dialog import credentials


def descendants(widget):
    for child in widget.winfo_children():
        yield child
        yield from descendants(child)


class SetupWidgetTests(unittest.TestCase):
    def test_setup_pages_no_drive_selected_and_novice_defaults(self):
        root = tk.Tk()
        root.withdraw()
        with patch.object(setup_module.tk, "Tk", return_value=root), patch.object(
            setup_module,
            "removable_drives",
            return_value=[
                {
                    "path": "X:\\",
                    "name": "Fixture USB",
                    "total": 4 * 1024**3,
                    "free": 3 * 1024**3,
                    "filesystem": "exFAT",
                }
            ],
        ):
            setup = setup_module.Setup()
            try:
                setup.step = 1
                setup.show()
                tree = next(
                    widget
                    for widget in descendants(root)
                    if isinstance(widget, ttk.Treeview)
                )
                self.assertEqual(tree.selection(), ())
                self.assertIsNone(setup.destination)
                for stage in [0, 2, 3]:
                    setup.step = stage
                    setup.show()
                    root.update_idletasks()
                self.assertFalse(setup.voice.get())
                self.assertTrue(setup.quick.get())
                self.assertFalse(setup.privacy.get())
                self.assertEqual(setup.retention.get(), 5)
            finally:
                setup.close()

    def test_credentials_fields_masked_and_cancel_never_writes(self):
        import tempfile

        with tempfile.TemporaryDirectory() as folder:
            root = tk.Tk()
            root.withdraw()
            observed = []

            def inspect():
                for widget in list(root.winfo_children()):
                    if isinstance(widget, tk.Toplevel):
                        observed.extend(
                            entry.cget("show")
                            for entry in descendants(widget)
                            if isinstance(entry, ttk.Entry)
                        )
                        widget.destroy()

            root.after(50, inspect)
            try:
                self.assertIsNone(
                    credentials(folder, configure=True, parent=root, return_bundle=True)
                )
                self.assertEqual(observed, ["*", "*", "*"])
                self.assertFalse((Path(folder) / "config/credentials.vault").exists())
            finally:
                root.destroy()


if __name__ == "__main__":
    unittest.main()
