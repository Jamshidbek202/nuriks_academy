"""Static and runtime finance access-control regression checks."""

import ast
from pathlib import Path
from typing import Dict, List


SUPER_ADMIN_ONLY = {
    "seed_default_configuration",
    "seed_reception_account",
    "add_tariff_version",
    "add_teacher_share_version",
    "add_recurring_expense_version",
    "add_billing_rules_version",
    "create_exceptional_discount_entitlement",
    "reverse_and_replace_invoice",
    "review_cash_shift_discrepancy",
    "reverse_receipt",
    "correct_expense_obligation_amount",
    "reverse_outgoing_payment",
    "reverse_other_income_record",
}

MANAGER_OPERATIONAL = {
    "create_finance_live_ticket",
    "preview_default_configuration",
    "list_policy_versions",
    "current_finance_pricing",
    "list_payment_destinations",
    "add_payment_destination",
    "edit_payment_destination",
    "list_card_payment_reports",
    "resolve_reported_card_payment",
    "list_discount_entitlements",
    "add_group_finance_version",
    "list_group_finance_versions",
    "add_closure",
    "list_closures",
    "generate_group_lessons",
    "list_lesson_occurrences",
    "resolve_lesson",
    "decide_lesson_exception",
    "schedule_replacement_lesson",
    "invoice_readiness",
    "generate_invoice_drafts",
    "finalize_month_invoices",
    "add_invoice_adjustment",
    "open_main_cash_shift",
    "get_current_cash_shift",
    "list_cash_shifts",
    "list_cash_events",
    "record_cash_removal",
    "close_main_cash_shift",
    "confirm_main_cash_day",
    "post_cash_receipt",
    "list_receipts",
    "list_teacher_earnings",
    "generate_recurring_expenses",
    "add_other_expense",
    "list_expense_obligations",
    "pay_expense",
    "set_manual_recurring_expense_amount",
    "pay_teacher_salary",
    "list_outgoing_payments",
    "add_other_income",
    "list_other_income",
    "get_financial_position",
    "run_daily_finance_controls",
    "override_student_finance_freeze",
    "list_freeze_recommendations",
    "reception_finance_call_list",
}

CRITICAL_MANAGER_BRANCH_SCOPES: Dict[str, str] = {
    "generate_invoice_drafts": "branch_id",
    "finalize_month_invoices": "branch_id",
    "list_invoices": "_student_visibility_query",
    "list_invoice_lines": "_student_visibility_query",
    "add_invoice_adjustment": "_enforce_branch",
    "post_cash_receipt": "branch_id",
    "list_receipts": "_student_visibility_query",
    "list_teacher_earnings": "branch_id",
    "add_other_expense": "branch_id",
    "pay_expense": "_enforce_branch",
    "set_manual_recurring_expense_amount": "_enforce_branch",
    "pay_teacher_salary": "_enforce_branch",
    "add_other_income": "branch_id",
    "get_financial_position": "branch_id",
    "override_student_finance_freeze": "_enforce_branch",
    "list_payment_destinations": "_payment_destination_query",
    "add_payment_destination": "branch_id",
    "edit_payment_destination": "branch_id",
    "list_card_payment_reports": "branch_id",
    "resolve_reported_card_payment": "branch_id",
}


def _is_route(function: ast.AsyncFunctionDef) -> bool:
    return any(
        isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and isinstance(decorator.func.value, ast.Name)
        and decorator.func.value.id == "router"
        for decorator in function.decorator_list
    )


def _route_method(function: ast.AsyncFunctionDef) -> str:
    for decorator in function.decorator_list:
        if (
            isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
            and isinstance(decorator.func.value, ast.Name)
            and decorator.func.value.id == "router"
        ):
            return decorator.func.attr
    return ""


def _require_role_expressions(function: ast.AsyncFunctionDef) -> List[str]:
    expressions = []
    for node in ast.walk(function):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "_require_role"
            and len(node.args) >= 2
        ):
            expressions.append(ast.unparse(node.args[1]))
    return expressions


def audit_finance_routes(route_file: Path) -> dict:
    source = route_file.read_text(encoding="utf-8")
    tree = ast.parse(source)
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
    }
    routes = {name: node for name, node in functions.items() if _is_route(node)}
    problems: List[str] = []

    for name, function in routes.items():
        function_source = ast.get_source_segment(source, function) or ""
        if _route_method(function) == "websocket":
            if "consume_finance_live_ticket" not in function_source:
                problems.append(f"{name}: websocket has no one-time ticket authentication")
            if "stream_finance_changes" not in function_source:
                problems.append(f"{name}: websocket does not use the scoped finance stream")
            continue
        if "current_user" not in {argument.arg for argument in function.args.args}:
            problems.append(f"{name}: route has no current_user dependency")
        if not _require_role_expressions(function) and "_student_visibility_query" not in function_source:
            problems.append(f"{name}: route has no explicit role or visibility guard")

    for name in sorted(SUPER_ADMIN_ONLY):
        function = routes.get(name)
        if function is None:
            problems.append(f"{name}: required super-admin route is missing")
            continue
        requirements = _require_role_expressions(function)
        if not any(expression.replace(" ", "") == "{'super_admin'}" for expression in requirements):
            problems.append(f"{name}: must remain super-admin only")

    for name in sorted(MANAGER_OPERATIONAL):
        function = routes.get(name)
        if function is None:
            problems.append(f"{name}: required manager workflow is missing")
            continue
        requirements = _require_role_expressions(function)
        if not any(
            "FINANCE_ROLES" in expression
            or "FINANCE_LIVE_ROLES" in expression
            or "'manager'" in expression
            for expression in requirements
        ):
            problems.append(f"{name}: manager is no longer explicitly authorized")

    for name, required_guard in CRITICAL_MANAGER_BRANCH_SCOPES.items():
        function = routes.get(name)
        if function is None:
            problems.append(f"{name}: branch-sensitive route is missing")
            continue
        function_source = ast.get_source_segment(source, function) or ""
        if required_guard not in function_source:
            problems.append(f"{name}: missing manager branch guard {required_guard}")

    return {
        "route_count": len(routes),
        "super_admin_only_checked": len(SUPER_ADMIN_ONLY),
        "manager_operational_checked": len(MANAGER_OPERATIONAL),
        "manager_branch_scopes_checked": len(CRITICAL_MANAGER_BRANCH_SCOPES),
        "live_routes_checked": sum(
            1 for function in routes.values() if _route_method(function) == "websocket"
        ),
        "problems": problems,
    }
