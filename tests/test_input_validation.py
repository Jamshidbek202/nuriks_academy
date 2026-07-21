from datetime import datetime

import unittest
from fastapi import HTTPException
from pydantic import ValidationError

from routes_homework import HomeworkCreate
from routes_journal import JournalEntryCreate
from routes_payments import CashPaymentCreate
from routes_tests import TestCreate
from models import LanguagePreferenceUpdate
from validation import require_date_string_window, require_date_window


class InputValidationTests(unittest.TestCase):
    def test_historical_assignment_dates_are_rejected(self):
        with self.assertRaises(HTTPException):
            require_date_window(datetime(1998, 1, 1), future_days=730, label="Due date")

    def test_historical_booking_dates_are_rejected(self):
        with self.assertRaises(HTTPException):
            require_date_string_window("1998-01-01", future_days=30)

    def test_unreasonable_payloads_are_rejected(self):
        factories = [
            lambda: HomeworkCreate(group_id="g", title="", description="x", due_date=datetime.now()),
            lambda: TestCreate(
                test_type="wrong", group_id="g", course_id="c", title="x",
                test_date=datetime.now(), max_score=-1,
            ),
            lambda: JournalEntryCreate(
                group_id="g", lesson_date=datetime.now(), lesson_number=0,
                topic="x", materials_covered="x",
            ),
            lambda: CashPaymentCreate(student_id="s", amount=-10, month="2026-99"),
        ]
        for factory in factories:
            with self.subTest(factory=factory), self.assertRaises(ValidationError):
                factory()

    def test_language_preference_accepts_only_supported_languages(self):
        for language in ("en", "ru", "uz"):
            self.assertEqual(LanguagePreferenceUpdate(language=language).language.value, language)
        with self.assertRaises(ValidationError):
            LanguagePreferenceUpdate(language="de")


if __name__ == "__main__":
    unittest.main()
