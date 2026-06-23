"""
Backend API Testing for Teacher and Support Staff Management
Tests all CRUD operations, deactivation, reactivation, and password reset
"""
import requests
import json
from typing import Dict, Optional

# Backend URL
BASE_URL = "https://school-ops-dashboard-2.preview.emergentagent.com/api"

# Test credentials
ADMIN_LOGIN = "admin"
ADMIN_PASSWORD = "Admin@2025"

# Global variables to store test data
admin_token = None
teacher_id = None
teacher_login = None
teacher_password = None
staff_id = None
staff_login = None
staff_password = None

def print_test(test_name: str):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(success: bool, message: str, response: Optional[Dict] = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if response:
        print(f"Response: {json.dumps(response, indent=2)}")

def login(login: str, password: str) -> Optional[str]:
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

def test_admin_login():
    """Test 1: Login as Super Admin"""
    global admin_token
    print_test("1. Login as Super Admin")
    
    admin_token = login(ADMIN_LOGIN, ADMIN_PASSWORD)
    
    if admin_token:
        print_result(True, "Admin login successful", {"token_length": len(admin_token)})
        return True
    else:
        print_result(False, "Admin login failed")
        return False

def test_create_teacher():
    """Test 2: Create a New Teacher"""
    global teacher_id
    print_test("2. Create a New Teacher")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "first_name": "New",
            "last_name": "Teacher",
            "phone": "+998909999888",
            "email": "newteacher@test.com",
            "specialization": ["Math"],
            "courses": ["English Basics"]
        }
        
        response = requests.post(
            f"{BASE_URL}/teachers",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            teacher_id = data.get("id")
            print_result(True, f"Teacher created successfully with ID: {teacher_id}", data)
            return True
        else:
            print_result(False, f"Failed to create teacher: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error creating teacher: {str(e)}")
        return False

def test_get_teacher_status():
    """Test 3: Get Teacher Status"""
    global teacher_login
    print_test("3. Get Teacher Status")
    
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
            
            # Verify login format
            expected_login = "teacher_+998909999888"
            if teacher_login == expected_login and is_active == True:
                print_result(True, f"Teacher status correct: login={teacher_login}, is_active={is_active}", data)
                return True
            else:
                print_result(False, f"Teacher status incorrect: Expected login={expected_login}, is_active=True, Got login={teacher_login}, is_active={is_active}", data)
                return False
        else:
            print_result(False, f"Failed to get teacher status: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error getting teacher status: {str(e)}")
        return False

def test_deactivate_teacher():
    """Test 4: Deactivate Teacher"""
    print_test("4. Deactivate Teacher")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/teachers/{teacher_id}/deactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if "deactivated" in data.get("message", "").lower():
                print_result(True, "Teacher deactivated successfully", data)
                return True
            else:
                print_result(False, f"Unexpected response message: {data.get('message')}", data)
                return False
        else:
            print_result(False, f"Failed to deactivate teacher: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error deactivating teacher: {str(e)}")
        return False

def test_deactivated_teacher_login():
    """Test 5: Test Deactivated Teacher Cannot Login"""
    print_test("5. Test Deactivated Teacher Cannot Login")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": teacher_login, "password": "Teacher@2025"}
        )
        
        # Should fail with 401 or 403
        if response.status_code in [401, 403]:
            print_result(True, f"Deactivated teacher correctly denied login: {response.status_code}", {"status_code": response.status_code, "message": response.text})
            return True
        elif response.status_code == 200:
            print_result(False, "Deactivated teacher was able to login (SECURITY ISSUE!)", response.json())
            return False
        else:
            print_result(False, f"Unexpected status code: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error testing deactivated login: {str(e)}")
        return False

def test_reactivate_teacher():
    """Test 6: Reactivate Teacher"""
    print_test("6. Reactivate Teacher")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/teachers/{teacher_id}/reactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if "reactivated" in data.get("message", "").lower():
                print_result(True, "Teacher reactivated successfully", data)
                return True
            else:
                print_result(False, f"Unexpected response message: {data.get('message')}", data)
                return False
        else:
            print_result(False, f"Failed to reactivate teacher: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error reactivating teacher: {str(e)}")
        return False

def test_reset_teacher_password():
    """Test 7: Reset Teacher Password"""
    global teacher_password
    print_test("7. Reset Teacher Password")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/teachers/{teacher_id}/reset-password",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            teacher_password = data.get("new_password")
            returned_login = data.get("login")
            
            if teacher_password and returned_login:
                print_result(True, f"Password reset successful: login={returned_login}, new_password={teacher_password}", data)
                return True
            else:
                print_result(False, "Password reset response missing login or new_password", data)
                return False
        else:
            print_result(False, f"Failed to reset password: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error resetting password: {str(e)}")
        return False

def test_teacher_login_new_password():
    """Test 8: Test Login with New Password"""
    print_test("8. Test Login with New Password")
    
    token = login(teacher_login, teacher_password)
    
    if token:
        print_result(True, "Teacher login with new password successful", {"token_length": len(token)})
        return True
    else:
        print_result(False, "Teacher login with new password failed")
        return False

def test_create_support_staff():
    """Test 9: Create a New Support Staff"""
    global staff_id, staff_login, staff_password
    print_test("9. Create a New Support Staff")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "first_name": "New",
            "last_name": "Support",
            "phone": "+998908888777",
            "email": "newsupport@test.com"
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
                return True
            else:
                print_result(False, "Support staff response missing id or credentials", data)
                return False
        else:
            print_result(False, f"Failed to create support staff: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error creating support staff: {str(e)}")
        return False

def test_get_all_support_staff():
    """Test 10: Get All Support Staff"""
    print_test("10. Get All Support Staff")
    
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
                print_result(True, f"Support staff list retrieved successfully. Found new staff member in list. Total: {len(data)}", {"total_count": len(data)})
                return True
            else:
                print_result(False, f"New support staff not found in list", {"total_count": len(data)})
                return False
        else:
            print_result(False, f"Failed to get support staff list: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error getting support staff list: {str(e)}")
        return False

def test_deactivate_support_staff():
    """Test 11: Deactivate Support Staff"""
    print_test("11. Deactivate Support Staff")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/support-staff/{staff_id}/deactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, "Support staff deactivated successfully", data)
            return True
        else:
            print_result(False, f"Failed to deactivate support staff: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error deactivating support staff: {str(e)}")
        return False

def test_deactivated_support_login():
    """Test 12: Test Deactivated Support Cannot Login"""
    print_test("12. Test Deactivated Support Cannot Login")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": staff_login, "password": staff_password}
        )
        
        # Should fail with 401 or 403
        if response.status_code in [401, 403]:
            print_result(True, f"Deactivated support correctly denied login: {response.status_code}", {"status_code": response.status_code})
            return True
        elif response.status_code == 200:
            print_result(False, "Deactivated support was able to login (SECURITY ISSUE!)", response.json())
            return False
        else:
            print_result(False, f"Unexpected status code: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error testing deactivated support login: {str(e)}")
        return False

def test_reactivate_support_staff():
    """Test 13: Reactivate Support Staff"""
    print_test("13. Reactivate Support Staff")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.patch(
            f"{BASE_URL}/support-staff/{staff_id}/reactivate",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, "Support staff reactivated successfully", data)
            return True
        else:
            print_result(False, f"Failed to reactivate support staff: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error reactivating support staff: {str(e)}")
        return False

def test_reset_support_password():
    """Test 14: Reset Support Password"""
    print_test("14. Reset Support Password")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/support-staff/{staff_id}/reset-password",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            new_password = data.get("new_password")
            returned_login = data.get("login")
            
            if new_password and returned_login:
                print_result(True, f"Support password reset successful: login={returned_login}, new_password={new_password}", data)
                return True
            else:
                print_result(False, "Password reset response missing login or new_password", data)
                return False
        else:
            print_result(False, f"Failed to reset support password: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Error resetting support password: {str(e)}")
        return False

def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "="*80)
    print("TEACHER AND SUPPORT STAFF MANAGEMENT API TESTING")
    print("="*80)
    
    results = []
    
    # Teacher Tests
    results.append(("Admin Login", test_admin_login()))
    
    if not results[-1][1]:
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        return
    
    results.append(("Create Teacher", test_create_teacher()))
    results.append(("Get Teacher Status", test_get_teacher_status()))
    results.append(("Deactivate Teacher", test_deactivate_teacher()))
    results.append(("Deactivated Teacher Login Denied", test_deactivated_teacher_login()))
    results.append(("Reactivate Teacher", test_reactivate_teacher()))
    results.append(("Reset Teacher Password", test_reset_teacher_password()))
    results.append(("Teacher Login with New Password", test_teacher_login_new_password()))
    
    # Support Staff Tests
    results.append(("Create Support Staff", test_create_support_staff()))
    results.append(("Get All Support Staff", test_get_all_support_staff()))
    results.append(("Deactivate Support Staff", test_deactivate_support_staff()))
    results.append(("Deactivated Support Login Denied", test_deactivated_support_login()))
    results.append(("Reactivate Support Staff", test_reactivate_support_staff()))
    results.append(("Reset Support Password", test_reset_support_password()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print(f"{'='*80}\n")
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
