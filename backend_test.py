"""
Comprehensive QA Test for Staff Management System at Nurik's Academy
Tests all Teacher and Support Staff Management APIs as per review request
"""
import requests
import json
from typing import Dict, Optional

# Backend URL
BASE_URL = "https://school-ops-dashboard-2.preview.emergentagent.com/api"

# Admin Credentials
ADMIN_LOGIN = "admin"
ADMIN_PASSWORD = "Admin@2025"

# Global variables to store test data
admin_token = None
teacher_id = None
teacher_login = None
teacher_new_password = None
staff_id = None
staff_login = None
staff_new_password = None

# Test results tracking
test_results = []

def print_test(test_number: str, test_name: str):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST {test_number}: {test_name}")
    print(f"{'='*80}")

def print_result(success: bool, message: str, response: Optional[Dict] = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if response:
        print(f"Response: {json.dumps(response, indent=2)}")

def login_user(login: str, password: str) -> Optional[str]:
    """Login and return access token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": login, "password": password}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")
        else:
            print(f"Login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login error: {str(e)}")
        return None

# ==================== PART 1: TEACHER MANAGEMENT ====================

def test_1_1_create_teacher():
    """Test 1.1: Create Teacher"""
    global teacher_id
    print_test("1.1", "Create Teacher")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "first_name": "QA",
            "last_name": "TeacherTest",
            "phone": "+998901111222",
            "email": "qa.teacher@test.com",
            "specialization": ["English"]
        }
        
        response = requests.post(
            f"{BASE_URL}/teachers",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            teacher_id = data.get("id")
            if teacher_id:
                print_result(True, f"Teacher created successfully with ID: {teacher_id}", data)
                test_results.append(("Test 1.1: Create Teacher", True))
                return True
            else:
                print_result(False, "Teacher created but no ID returned", data)
                test_results.append(("Test 1.1: Create Teacher", False))
                return False
        else:
            print_result(False, f"Failed to create teacher: {response.status_code} - {response.text}")
            test_results.append(("Test 1.1: Create Teacher", False))
            return False
    except Exception as e:
        print_result(False, f"Error creating teacher: {str(e)}")
        test_results.append(("Test 1.1: Create Teacher", False))
        return False

def test_1_2_get_teacher_status():
    """Test 1.2: Get Teacher Status (Verify Credentials)"""
    global teacher_login
    print_test("1.2", "Get Teacher Status (Verify Credentials)")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/teachers/{teacher_id}/status",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            teacher_login = data.get("login")
            is_active = data.get("is_active")
            
            expected_login = "teacher_+998901111222"
            if teacher_login == expected_login and is_active == True:
                print_result(True, f"Teacher status correct: login={teacher_login}, is_active={is_active}", data)
                test_results.append(("Test 1.2: Get Teacher Status", True))
                return True
            else:
                print_result(False, f"Expected login={expected_login}, is_active=True, Got login={teacher_login}, is_active={is_active}", data)
                test_results.append(("Test 1.2: Get Teacher Status", False))
                return False
        else:
            print_result(False, f"Failed to get teacher status: {response.status_code} - {response.text}")
            test_results.append(("Test 1.2: Get Teacher Status", False))
            return False
    except Exception as e:
        print_result(False, f"Error getting teacher status: {str(e)}")
        test_results.append(("Test 1.2: Get Teacher Status", False))
        return False

def test_1_3_edit_teacher():
    """Test 1.3: Edit Teacher"""
    print_test("1.3", "Edit Teacher")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "first_name": "QA_Updated",
            "last_name": "TeacherTest",
            "phone": "+998901111222",
            "email": "qa.updated@test.com",
            "specialization": ["English", "Math"]
        }
        
        response = requests.put(
            f"{BASE_URL}/teachers/{teacher_id}",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Verify updated data
            if data.get("first_name") == "QA_Updated" and data.get("email") == "qa.updated@test.com":
                print_result(True, "Teacher updated successfully", data)
                test_results.append(("Test 1.3: Edit Teacher", True))
                return True
            else:
                print_result(False, "Teacher updated but data doesn't match", data)
                test_results.append(("Test 1.3: Edit Teacher", False))
                return False
        else:
            print_result(False, f"Failed to update teacher: {response.status_code} - {response.text}")
            test_results.append(("Test 1.3: Edit Teacher", False))
            return False
    except Exception as e:
        print_result(False, f"Error updating teacher: {str(e)}")
        test_results.append(("Test 1.3: Edit Teacher", False))
        return False

def test_1_4_teacher_login_before_deactivation():
    """Test 1.4: Teacher Login (Before Deactivation)"""
    print_test("1.4", "Teacher Login (Before Deactivation)")
    
    token = login_user(teacher_login, "Teacher@2025")
    
    if token:
        print_result(True, "Teacher login successful before deactivation", {"token_length": len(token)})
        test_results.append(("Test 1.4: Teacher Login (Before Deactivation)", True))
        return True
    else:
        print_result(False, "Teacher login failed before deactivation")
        test_results.append(("Test 1.4: Teacher Login (Before Deactivation)", False))
        return False

def test_1_5_deactivate_teacher():
    """Test 1.5: Deactivate Teacher"""
    print_test("1.5", "Deactivate Teacher")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/teachers/{teacher_id}/deactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_active") == False and "deactivated" in data.get("message", "").lower():
                print_result(True, "Teacher deactivated successfully", data)
                test_results.append(("Test 1.5: Deactivate Teacher", True))
                return True
            else:
                print_result(False, f"Unexpected response: {data}", data)
                test_results.append(("Test 1.5: Deactivate Teacher", False))
                return False
        else:
            print_result(False, f"Failed to deactivate teacher: {response.status_code} - {response.text}")
            test_results.append(("Test 1.5: Deactivate Teacher", False))
            return False
    except Exception as e:
        print_result(False, f"Error deactivating teacher: {str(e)}")
        test_results.append(("Test 1.5: Deactivate Teacher", False))
        return False

def test_1_6_teacher_login_after_deactivation():
    """Test 1.6: Teacher Login (After Deactivation - Should Fail)"""
    print_test("1.6", "Teacher Login (After Deactivation - Should Fail)")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": teacher_login, "password": "Teacher@2025"}
        )
        
        if response.status_code == 403:
            response_text = response.text.lower()
            if "inactive" in response_text:
                print_result(True, f"Deactivated teacher correctly denied login with 403 Forbidden: {response.text}")
                test_results.append(("Test 1.6: Teacher Login After Deactivation (Should Fail)", True))
                return True
            else:
                print_result(False, f"Got 403 but wrong message: {response.text}")
                test_results.append(("Test 1.6: Teacher Login After Deactivation (Should Fail)", False))
                return False
        elif response.status_code == 200:
            print_result(False, "SECURITY ISSUE: Deactivated teacher was able to login!", response.json())
            test_results.append(("Test 1.6: Teacher Login After Deactivation (Should Fail)", False))
            return False
        else:
            print_result(False, f"Unexpected status code: {response.status_code} - {response.text}")
            test_results.append(("Test 1.6: Teacher Login After Deactivation (Should Fail)", False))
            return False
    except Exception as e:
        print_result(False, f"Error testing deactivated login: {str(e)}")
        test_results.append(("Test 1.6: Teacher Login After Deactivation (Should Fail)", False))
        return False

def test_1_7_reactivate_teacher():
    """Test 1.7: Reactivate Teacher"""
    print_test("1.7", "Reactivate Teacher")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/teachers/{teacher_id}/reactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_active") == True and "reactivated" in data.get("message", "").lower():
                print_result(True, "Teacher reactivated successfully", data)
                test_results.append(("Test 1.7: Reactivate Teacher", True))
                return True
            else:
                print_result(False, f"Unexpected response: {data}", data)
                test_results.append(("Test 1.7: Reactivate Teacher", False))
                return False
        else:
            print_result(False, f"Failed to reactivate teacher: {response.status_code} - {response.text}")
            test_results.append(("Test 1.7: Reactivate Teacher", False))
            return False
    except Exception as e:
        print_result(False, f"Error reactivating teacher: {str(e)}")
        test_results.append(("Test 1.7: Reactivate Teacher", False))
        return False

def test_1_8_reset_teacher_password():
    """Test 1.8: Reset Teacher Password"""
    global teacher_new_password
    print_test("1.8", "Reset Teacher Password")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/teachers/{teacher_id}/reset-password",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            teacher_new_password = data.get("new_password")
            returned_login = data.get("login")
            
            if teacher_new_password and returned_login:
                print_result(True, f"Password reset successful: login={returned_login}, new_password={teacher_new_password}", data)
                test_results.append(("Test 1.8: Reset Teacher Password", True))
                return True
            else:
                print_result(False, "Password reset response missing login or new_password", data)
                test_results.append(("Test 1.8: Reset Teacher Password", False))
                return False
        else:
            print_result(False, f"Failed to reset password: {response.status_code} - {response.text}")
            test_results.append(("Test 1.8: Reset Teacher Password", False))
            return False
    except Exception as e:
        print_result(False, f"Error resetting password: {str(e)}")
        test_results.append(("Test 1.8: Reset Teacher Password", False))
        return False

def test_1_9_teacher_login_new_password():
    """Test 1.9: Teacher Login with New Password"""
    print_test("1.9", "Teacher Login with New Password")
    
    token = login_user(teacher_login, teacher_new_password)
    
    if token:
        print_result(True, "Teacher login with new password successful", {"token_length": len(token)})
        test_results.append(("Test 1.9: Teacher Login with New Password", True))
        return True
    else:
        print_result(False, "Teacher login with new password failed")
        test_results.append(("Test 1.9: Teacher Login with New Password", False))
        return False

# ==================== PART 2: SUPPORT STAFF MANAGEMENT ====================

def test_2_1_create_support_staff():
    """Test 2.1: Create Support Staff"""
    global staff_id, staff_login
    print_test("2.1", "Create Support Staff")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "first_name": "QA",
            "last_name": "SupportTest",
            "phone": "+998902222333",
            "email": "qa.support@test.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/support-staff",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            staff_id = data.get("id")
            credentials = data.get("credentials", {})
            staff_login = credentials.get("login")
            staff_password = credentials.get("password")
            
            if staff_id and staff_login and staff_password:
                print_result(True, f"Support staff created: ID={staff_id}, login={staff_login}, password={staff_password}", data)
                test_results.append(("Test 2.1: Create Support Staff", True))
                return True
            else:
                print_result(False, "Support staff response missing id or credentials", data)
                test_results.append(("Test 2.1: Create Support Staff", False))
                return False
        else:
            print_result(False, f"Failed to create support staff: {response.status_code} - {response.text}")
            test_results.append(("Test 2.1: Create Support Staff", False))
            return False
    except Exception as e:
        print_result(False, f"Error creating support staff: {str(e)}")
        test_results.append(("Test 2.1: Create Support Staff", False))
        return False

def test_2_2_get_support_staff_list():
    """Test 2.2: Get Support Staff List"""
    print_test("2.2", "Get Support Staff List")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/support-staff",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Check if our newly created support staff is in the list
            found = any(s.get("id") == staff_id for s in data)
            
            if found:
                print_result(True, f"Support staff list retrieved. New staff member found. Total: {len(data)}")
                test_results.append(("Test 2.2: Get Support Staff List", True))
                return True
            else:
                print_result(False, f"New support staff not found in list. Total: {len(data)}")
                test_results.append(("Test 2.2: Get Support Staff List", False))
                return False
        else:
            print_result(False, f"Failed to get support staff list: {response.status_code} - {response.text}")
            test_results.append(("Test 2.2: Get Support Staff List", False))
            return False
    except Exception as e:
        print_result(False, f"Error getting support staff list: {str(e)}")
        test_results.append(("Test 2.2: Get Support Staff List", False))
        return False

def test_2_3_get_support_staff_by_id():
    """Test 2.3: Get Support Staff by ID"""
    print_test("2.3", "Get Support Staff by ID")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/support-staff/{staff_id}",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            is_active = data.get("is_active")
            login = data.get("login")
            
            if is_active is not None and login:
                print_result(True, f"Support staff details retrieved: is_active={is_active}, login={login}", data)
                test_results.append(("Test 2.3: Get Support Staff by ID", True))
                return True
            else:
                print_result(False, "Support staff details missing is_active or login", data)
                test_results.append(("Test 2.3: Get Support Staff by ID", False))
                return False
        else:
            print_result(False, f"Failed to get support staff: {response.status_code} - {response.text}")
            test_results.append(("Test 2.3: Get Support Staff by ID", False))
            return False
    except Exception as e:
        print_result(False, f"Error getting support staff: {str(e)}")
        test_results.append(("Test 2.3: Get Support Staff by ID", False))
        return False

def test_2_4_edit_support_staff():
    """Test 2.4: Edit Support Staff"""
    print_test("2.4", "Edit Support Staff")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "first_name": "QA_Updated",
            "last_name": "SupportTest",
            "phone": "+998902222333",
            "email": "qa.updated.support@test.com"
        }
        
        response = requests.put(
            f"{BASE_URL}/support-staff/{staff_id}",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Verify updated data
            if data.get("first_name") == "QA_Updated" and data.get("email") == "qa.updated.support@test.com":
                print_result(True, "Support staff updated successfully", data)
                test_results.append(("Test 2.4: Edit Support Staff", True))
                return True
            else:
                print_result(False, "Support staff updated but data doesn't match", data)
                test_results.append(("Test 2.4: Edit Support Staff", False))
                return False
        else:
            print_result(False, f"Failed to update support staff: {response.status_code} - {response.text}")
            test_results.append(("Test 2.4: Edit Support Staff", False))
            return False
    except Exception as e:
        print_result(False, f"Error updating support staff: {str(e)}")
        test_results.append(("Test 2.4: Edit Support Staff", False))
        return False

def test_2_5_support_login_before_deactivation():
    """Test 2.5: Support Login (Before Deactivation)"""
    print_test("2.5", "Support Login (Before Deactivation)")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": staff_login, "password": "Support@2025"}
        )
        
        if response.status_code == 200:
            data = response.json()
            user_role = data.get("user", {}).get("role")
            if user_role == "support":
                print_result(True, f"Support login successful with role={user_role}")
                test_results.append(("Test 2.5: Support Login (Before Deactivation)", True))
                return True
            else:
                print_result(False, f"Support login successful but wrong role: {user_role}", data)
                test_results.append(("Test 2.5: Support Login (Before Deactivation)", False))
                return False
        else:
            print_result(False, f"Support login failed: {response.status_code} - {response.text}")
            test_results.append(("Test 2.5: Support Login (Before Deactivation)", False))
            return False
    except Exception as e:
        print_result(False, f"Error testing support login: {str(e)}")
        test_results.append(("Test 2.5: Support Login (Before Deactivation)", False))
        return False

def test_2_6_deactivate_support_staff():
    """Test 2.6: Deactivate Support Staff"""
    print_test("2.6", "Deactivate Support Staff")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/support-staff/{staff_id}/deactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_active") == False and "deactivated" in data.get("message", "").lower():
                print_result(True, "Support staff deactivated successfully", data)
                test_results.append(("Test 2.6: Deactivate Support Staff", True))
                return True
            else:
                print_result(False, f"Unexpected response: {data}", data)
                test_results.append(("Test 2.6: Deactivate Support Staff", False))
                return False
        else:
            print_result(False, f"Failed to deactivate support staff: {response.status_code} - {response.text}")
            test_results.append(("Test 2.6: Deactivate Support Staff", False))
            return False
    except Exception as e:
        print_result(False, f"Error deactivating support staff: {str(e)}")
        test_results.append(("Test 2.6: Deactivate Support Staff", False))
        return False

def test_2_7_support_login_after_deactivation():
    """Test 2.7: Support Login (After Deactivation - Should Fail)"""
    print_test("2.7", "Support Login (After Deactivation - Should Fail)")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": staff_login, "password": "Support@2025"}
        )
        
        if response.status_code == 403:
            response_text = response.text.lower()
            if "inactive" in response_text:
                print_result(True, f"Deactivated support correctly denied login with 403 Forbidden: {response.text}")
                test_results.append(("Test 2.7: Support Login After Deactivation (Should Fail)", True))
                return True
            else:
                print_result(False, f"Got 403 but wrong message: {response.text}")
                test_results.append(("Test 2.7: Support Login After Deactivation (Should Fail)", False))
                return False
        elif response.status_code == 200:
            print_result(False, "SECURITY ISSUE: Deactivated support was able to login!", response.json())
            test_results.append(("Test 2.7: Support Login After Deactivation (Should Fail)", False))
            return False
        else:
            print_result(False, f"Unexpected status code: {response.status_code} - {response.text}")
            test_results.append(("Test 2.7: Support Login After Deactivation (Should Fail)", False))
            return False
    except Exception as e:
        print_result(False, f"Error testing deactivated support login: {str(e)}")
        test_results.append(("Test 2.7: Support Login After Deactivation (Should Fail)", False))
        return False

def test_2_8_reactivate_support_staff():
    """Test 2.8: Reactivate Support Staff"""
    print_test("2.8", "Reactivate Support Staff")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/support-staff/{staff_id}/reactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_active") == True and "reactivated" in data.get("message", "").lower():
                print_result(True, "Support staff reactivated successfully", data)
                test_results.append(("Test 2.8: Reactivate Support Staff", True))
                return True
            else:
                print_result(False, f"Unexpected response: {data}", data)
                test_results.append(("Test 2.8: Reactivate Support Staff", False))
                return False
        else:
            print_result(False, f"Failed to reactivate support staff: {response.status_code} - {response.text}")
            test_results.append(("Test 2.8: Reactivate Support Staff", False))
            return False
    except Exception as e:
        print_result(False, f"Error reactivating support staff: {str(e)}")
        test_results.append(("Test 2.8: Reactivate Support Staff", False))
        return False

def test_2_9_reset_support_password():
    """Test 2.9: Reset Support Password"""
    global staff_new_password
    print_test("2.9", "Reset Support Password")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/support-staff/{staff_id}/reset-password",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            staff_new_password = data.get("new_password")
            returned_login = data.get("login")
            
            if staff_new_password and returned_login:
                print_result(True, f"Support password reset successful: login={returned_login}, new_password={staff_new_password}", data)
                test_results.append(("Test 2.9: Reset Support Password", True))
                return True
            else:
                print_result(False, "Password reset response missing login or new_password", data)
                test_results.append(("Test 2.9: Reset Support Password", False))
                return False
        else:
            print_result(False, f"Failed to reset support password: {response.status_code} - {response.text}")
            test_results.append(("Test 2.9: Reset Support Password", False))
            return False
    except Exception as e:
        print_result(False, f"Error resetting support password: {str(e)}")
        test_results.append(("Test 2.9: Reset Support Password", False))
        return False

def test_2_10_support_login_new_password():
    """Test 2.10: Support Login with New Password"""
    print_test("2.10", "Support Login with New Password")
    
    token = login_user(staff_login, staff_new_password)
    
    if token:
        print_result(True, "Support login with new password successful", {"token_length": len(token)})
        test_results.append(("Test 2.10: Support Login with New Password", True))
        return True
    else:
        print_result(False, "Support login with new password failed")
        test_results.append(("Test 2.10: Support Login with New Password", False))
        return False

# ==================== PART 3: DATABASE VERIFICATION ====================

def test_3_1_verify_teacher_in_database():
    """Test 3.1: Verify Teacher in Database"""
    print_test("3.1", "Verify Teacher in Database")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/teachers",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Check if QA_Updated TeacherTest appears
            found = any(
                t.get("first_name") == "QA_Updated" and 
                t.get("last_name") == "TeacherTest" 
                for t in data
            )
            
            if found:
                print_result(True, "QA_Updated TeacherTest found in database")
                test_results.append(("Test 3.1: Verify Teacher in Database", True))
                return True
            else:
                print_result(False, "QA_Updated TeacherTest not found in database")
                test_results.append(("Test 3.1: Verify Teacher in Database", False))
                return False
        else:
            print_result(False, f"Failed to get teachers: {response.status_code} - {response.text}")
            test_results.append(("Test 3.1: Verify Teacher in Database", False))
            return False
    except Exception as e:
        print_result(False, f"Error verifying teacher in database: {str(e)}")
        test_results.append(("Test 3.1: Verify Teacher in Database", False))
        return False

def test_3_2_verify_support_in_database():
    """Test 3.2: Verify Support in Database"""
    print_test("3.2", "Verify Support in Database")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/support-staff",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Check if QA_Updated SupportTest appears
            found = any(
                s.get("first_name") == "QA_Updated" and 
                s.get("last_name") == "SupportTest" 
                for s in data
            )
            
            if found:
                print_result(True, "QA_Updated SupportTest found in database")
                test_results.append(("Test 3.2: Verify Support in Database", True))
                return True
            else:
                print_result(False, "QA_Updated SupportTest not found in database")
                test_results.append(("Test 3.2: Verify Support in Database", False))
                return False
        else:
            print_result(False, f"Failed to get support staff: {response.status_code} - {response.text}")
            test_results.append(("Test 3.2: Verify Support in Database", False))
            return False
    except Exception as e:
        print_result(False, f"Error verifying support in database: {str(e)}")
        test_results.append(("Test 3.2: Verify Support in Database", False))
        return False

def test_3_3_verify_user_status():
    """Test 3.3: Verify User Status"""
    print_test("3.3", "Verify User Status")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/teachers/{teacher_id}/status",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            is_active = data.get("is_active")
            
            # Should be active after reactivation
            if is_active == True:
                print_result(True, f"Teacher status correctly reflects is_active={is_active}", data)
                test_results.append(("Test 3.3: Verify User Status", True))
                return True
            else:
                print_result(False, f"Teacher status incorrect: is_active={is_active}", data)
                test_results.append(("Test 3.3: Verify User Status", False))
                return False
        else:
            print_result(False, f"Failed to get teacher status: {response.status_code} - {response.text}")
            test_results.append(("Test 3.3: Verify User Status", False))
            return False
    except Exception as e:
        print_result(False, f"Error verifying user status: {str(e)}")
        test_results.append(("Test 3.3: Verify User Status", False))
        return False

# ==================== MAIN TEST RUNNER ====================

def run_all_tests():
    """Run all tests in sequence"""
    global admin_token
    
    print("\n" + "="*80)
    print("COMPREHENSIVE QA TEST FOR STAFF MANAGEMENT SYSTEM")
    print("Nurik's Academy - Teacher and Support Staff Management")
    print("="*80)
    
    # Admin Login
    print_test("0", "Admin Login")
    admin_token = login_user(ADMIN_LOGIN, ADMIN_PASSWORD)
    
    if not admin_token:
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        return False
    
    print_result(True, "Admin login successful", {"token_length": len(admin_token)})
    
    # PART 1: Teacher Management
    print("\n" + "="*80)
    print("PART 1: TEACHER MANAGEMENT")
    print("="*80)
    
    test_1_1_create_teacher()
    test_1_2_get_teacher_status()
    test_1_3_edit_teacher()
    test_1_4_teacher_login_before_deactivation()
    test_1_5_deactivate_teacher()
    test_1_6_teacher_login_after_deactivation()
    test_1_7_reactivate_teacher()
    test_1_8_reset_teacher_password()
    test_1_9_teacher_login_new_password()
    
    # PART 2: Support Staff Management
    print("\n" + "="*80)
    print("PART 2: SUPPORT STAFF MANAGEMENT")
    print("="*80)
    
    test_2_1_create_support_staff()
    test_2_2_get_support_staff_list()
    test_2_3_get_support_staff_by_id()
    test_2_4_edit_support_staff()
    test_2_5_support_login_before_deactivation()
    test_2_6_deactivate_support_staff()
    test_2_7_support_login_after_deactivation()
    test_2_8_reactivate_support_staff()
    test_2_9_reset_support_password()
    test_2_10_support_login_new_password()
    
    # PART 3: Database Verification
    print("\n" + "="*80)
    print("PART 3: DATABASE VERIFICATION")
    print("="*80)
    
    test_3_1_verify_teacher_in_database()
    test_3_2_verify_support_in_database()
    test_3_3_verify_user_status()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total if total > 0 else 0}%)")
    print(f"{'='*80}\n")
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
