"""Regressão da identidade comum sem depender de um provedor pago."""

import unittest
from jarvis_identity import IDENTITY, system_prompt


class IdentityTests(unittest.TestCase):
    def test_modes_share_identity_and_human_confirmation(self):
        for mode in ("chat", "quick", "writer"):
            with self.subTest(mode=mode):
                self.assertEqual(system_prompt(mode), IDENTITY)
                self.assertIn("confirmação pelo botão", system_prompt(mode))
                self.assertIn("Nunca peça tokens ou chaves", system_prompt(mode))

    def test_unknown_mode_does_not_create_new_identity(self):
        with self.assertRaises(ValueError):
            system_prompt("independent_assistant")
