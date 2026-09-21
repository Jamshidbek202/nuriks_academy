from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
import sys
import unittest

from pydantic import ValidationError


BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import StudentCreate  # noqa: E402
from routes_leads import LeadCreate  # noqa: E402


class BirthDateValidationTests(unittest.TestCase):
    def test_new_lead_requires_full_date_of_birth(self):
        with self.assertRaises(ValidationError):
            LeadCreate(
                first_name="Test",
                last_name="Student",
                phone="+998901234567",
                source="walk_in",
            )

    def test_future_birth_dates_are_rejected(self):
        future = date.today() + timedelta(days=1)
        with self.assertRaises(ValidationError):
            LeadCreate(
                first_name="Test",
                last_name="Student",
                phone="+998901234567",
                date_of_birth=future,
                source="walk_in",
            )

    def test_student_creation_accepts_a_real_birth_date(self):
        student = StudentCreate(
            first_name="Test",
            last_name="Student",
            date_of_birth=datetime(2010, 5, 12),
        )
        self.assertEqual(student.date_of_birth.date(), date(2010, 5, 12))


if __name__ == "__main__":
    unittest.main()
