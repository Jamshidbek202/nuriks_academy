from routes_tests import GRADING_WEIGHTS, neutral_average, weighted_overall_grade


def test_new_student_starts_at_one_hundred() -> None:
    assert neutral_average([]) == 100.0
    assert weighted_overall_grade(100.0, 100.0, 100.0) == 100.0


def test_weighted_grade_uses_published_category_weights() -> None:
    assert GRADING_WEIGHTS == {"tests": 50, "homework": 30, "attendance": 20}
    assert weighted_overall_grade(80.0, 60.0, 90.0) == 76.0


def test_a_zero_only_reduces_its_own_weighted_share() -> None:
    assert weighted_overall_grade(100.0, 100.0, 0.0) == 80.0
    assert weighted_overall_grade(0.0, 100.0, 100.0) == 50.0
    assert weighted_overall_grade(100.0, 0.0, 100.0) == 70.0
