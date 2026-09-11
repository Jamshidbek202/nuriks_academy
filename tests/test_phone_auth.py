import os
import unittest
from unittest.mock import patch

from phone_auth import (
    PasswordPolicyError,
    PhoneValidationError,
    legacy_login_allowed,
    normalize_phone,
    validate_password,
)


class PhoneAuthValidationTests(unittest.TestCase):
    def test_uzbek_phone_normalizes_to_e164(self):
        values = ("+998 90 848 87 87", "998908488787", "90-848-87-87", "0908488787")
        for value in values:
            with self.subTest(value=value):
                self.assertEqual(normalize_phone(value), "+998908488787")

    def test_non_uzbek_and_malformed_phones_are_rejected(self):
        for value in ("", "+12025550123", "+998123", "hello"):
            with self.subTest(value=value), self.assertRaises(PhoneValidationError):
                normalize_phone(value)

    def test_password_policy_requires_all_character_classes(self):
        validate_password("StrongPass@2026")
        for value in (
            "short@1A",
            "alllowercase@2026",
            "ALLUPPERCASE@2026",
            "NoNumberHere@",
            "NoSymbolHere2026",
            "Has Space@2026",
            "A1@" + "a" * 70,
        ):
            with self.subTest(value=value), self.assertRaises(PasswordPolicyError):
                validate_password(value)

    def test_legacy_login_cannot_be_enabled_in_production(self):
        with patch.dict(
            os.environ,
            {"APP_ENV": "production", "ALLOW_LEGACY_LOGIN": "1"},
            clear=False,
        ):
            self.assertFalse(legacy_login_allowed())

if __name__ == "__main__":
    unittest.main()
