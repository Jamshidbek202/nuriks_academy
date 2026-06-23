"""
Backend Test for Lead to Student Conversion Flow
Nurik's Academy CRM
"""
import requests
import json
from datetime import datetime

# Configuration
BACKEND_URL = "https://school-ops-dashboard-2.preview.emergentagent.com/api"
ADMIN_LOGIN = "admin"
ADMIN_PASSWORD = "Admin@2025"

# Test data
test_lead_phone = f"+99890123{datetime.now().strftime('%H%M%S')}"  # Unique phone for each test run

def print_section(title):
    """Print a formatted section header"""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80)

def print_result(step, success, message, data=None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"\n{status} - {step}")
    print(f"Message: {message}")
    if data:
        print(f"Data: {json.dumps(data, indent=2)}")

def test_lead_conversion_flow():
    """Test the complete Lead to Student conversion flow"""
    
    print_section("LEAD TO STUDENT CONVERSION FLOW TEST")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Phone: {test_lead_phone}")
    
    # Store test data
    access_token = None
    lead_id = None
    lead_mongo_id = None
    student_id = None
    student_login = None
    parent_login = None
    
    # ==================== STEP 1: LOGIN AS SUPER ADMIN ====================
    print_section("Step 1: Login as Super Admin")
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"login": ADMIN_LOGIN, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            access_token = data.get("access_token")
            user_role = data.get("user", {}).get("role")
            
            if access_token and user_role == "super_admin":
                print_result(
                    "Login",
                    True,
                    f"Successfully logged in as {user_role}",
                    {"token_length": len(access_token), "role": user_role}
                )
            else:
                print_result("Login", False, "Token or role missing in response", data)
                return False
        else:
            print_result("Login", False, f"HTTP {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result("Login", False, f"Exception: {str(e)}")
        return False
    
    # Headers for authenticated requests
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # ==================== STEP 2: CREATE A TEST LEAD ====================
    print_section("Step 2: Create a Test Lead")
    try:
        lead_data = {
            "first_name": "TestLead",
            "last_name": "Conversion",
            "phone": test_lead_phone,
            "age": 14,
            "parent_name": "Parent TestLead",
            "interested_course": "General English",
            "source": "instagram",
            "notes": "Test lead for conversion flow"
        }
        
        response = requests.post(
            f"{BACKEND_URL}/leads",
            json=lead_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            lead_mongo_id = data.get("id")
            lead_id = data.get("lead_id")
            status = data.get("status")
            
            if lead_mongo_id and lead_id and status == "new_lead":
                print_result(
                    "Create Lead",
                    True,
                    "Lead created successfully",
                    {
                        "lead_id": lead_id,
                        "mongo_id": lead_mongo_id,
                        "status": status,
                        "name": f"{data.get('first_name')} {data.get('last_name')}"
                    }
                )
            else:
                print_result("Create Lead", False, "Missing required fields in response", data)
                return False
        else:
            print_result("Create Lead", False, f"HTTP {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result("Create Lead", False, f"Exception: {str(e)}")
        return False
    
    # ==================== STEP 3: CONVERT LEAD TO STUDENT ====================
    print_section("Step 3: Convert Lead to Student")
    try:
        response = requests.post(
            f"{BACKEND_URL}/leads/{lead_mongo_id}/convert",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            student_id = data.get("student_id")
            student_login = data.get("student_login")
            student_password = data.get("student_password")
            parent_login = data.get("parent_login")
            parent_password = data.get("parent_password")
            
            # Verify all expected fields are present
            if (student_id and student_login and student_password == "Student@2025" and
                parent_login and parent_password == "Parent@2025"):
                
                # Verify student_login format (should be student_id in lowercase)
                if student_login == student_id.lower():
                    # Verify parent_login format (should be the phone number)
                    if parent_login == test_lead_phone:
                        print_result(
                            "Convert Lead",
                            True,
                            "Lead converted successfully with correct credentials",
                            {
                                "student_id": student_id,
                                "student_login": student_login,
                                "student_password": student_password,
                                "parent_login": parent_login,
                                "parent_password": parent_password
                            }
                        )
                    else:
                        print_result(
                            "Convert Lead",
                            False,
                            f"Parent login mismatch. Expected: {test_lead_phone}, Got: {parent_login}",
                            data
                        )
                        return False
                else:
                    print_result(
                        "Convert Lead",
                        False,
                        f"Student login format incorrect. Expected: {student_id.lower()}, Got: {student_login}",
                        data
                    )
                    return False
            else:
                print_result("Convert Lead", False, "Missing or incorrect credentials in response", data)
                return False
        else:
            print_result("Convert Lead", False, f"HTTP {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result("Convert Lead", False, f"Exception: {str(e)}")
        return False
    
    # ==================== STEP 4: VERIFY STUDENT WAS CREATED ====================
    print_section("Step 4: Verify Student Was Created")
    try:
        response = requests.get(
            f"{BACKEND_URL}/students",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            students = response.json()
            
            # Find the newly created student
            found_student = None
            for student in students:
                if student.get("student_id") == student_id:
                    found_student = student
                    break
            
            if found_student:
                print_result(
                    "Verify Student",
                    True,
                    "Student found in students list",
                    {
                        "student_id": found_student.get("student_id"),
                        "name": f"{found_student.get('first_name')} {found_student.get('last_name')}",
                        "status": found_student.get("status")
                    }
                )
            else:
                print_result(
                    "Verify Student",
                    False,
                    f"Student {student_id} not found in students list",
                    {"total_students": len(students)}
                )
                return False
        else:
            print_result("Verify Student", False, f"HTTP {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result("Verify Student", False, f"Exception: {str(e)}")
        return False
    
    # ==================== STEP 5: VERIFY LEAD STATUS CHANGED ====================
    print_section("Step 5: Verify Lead Status Changed to 'enrolled'")
    try:
        response = requests.get(
            f"{BACKEND_URL}/leads",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            leads = response.json()
            
            # Find the converted lead
            found_lead = None
            for lead in leads:
                if lead.get("id") == lead_mongo_id:
                    found_lead = lead
                    break
            
            if found_lead:
                lead_status = found_lead.get("status")
                if lead_status == "enrolled":
                    print_result(
                        "Verify Lead Status",
                        True,
                        "Lead status correctly updated to 'enrolled'",
                        {
                            "lead_id": found_lead.get("lead_id"),
                            "status": lead_status,
                            "converted_to_student_id": found_lead.get("converted_to_student_id")
                        }
                    )
                else:
                    print_result(
                        "Verify Lead Status",
                        False,
                        f"Lead status incorrect. Expected: 'enrolled', Got: '{lead_status}'",
                        found_lead
                    )
                    return False
            else:
                print_result(
                    "Verify Lead Status",
                    False,
                    f"Lead {lead_mongo_id} not found in leads list",
                    {"total_leads": len(leads)}
                )
                return False
        else:
            print_result("Verify Lead Status", False, f"HTTP {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result("Verify Lead Status", False, f"Exception: {str(e)}")
        return False
    
    # ==================== STEP 6: TEST LOGIN WITH STUDENT CREDENTIALS ====================
    print_section("Step 6: Test Login with Student Credentials")
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"login": student_login, "password": "Student@2025"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            user_role = data.get("user", {}).get("role")
            
            if token and user_role == "student":
                print_result(
                    "Student Login",
                    True,
                    "Student login successful",
                    {
                        "login": student_login,
                        "role": user_role,
                        "token_length": len(token)
                    }
                )
            else:
                print_result("Student Login", False, "Token or role incorrect", data)
                return False
        else:
            print_result("Student Login", False, f"HTTP {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result("Student Login", False, f"Exception: {str(e)}")
        return False
    
    # ==================== STEP 7: TEST LOGIN WITH PARENT CREDENTIALS ====================
    print_section("Step 7: Test Login with Parent Credentials")
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"login": parent_login, "password": "Parent@2025"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            user_role = data.get("user", {}).get("role")
            
            if token and user_role == "parent":
                print_result(
                    "Parent Login",
                    True,
                    "Parent login successful",
                    {
                        "login": parent_login,
                        "role": user_role,
                        "token_length": len(token)
                    }
                )
            else:
                print_result("Parent Login", False, "Token or role incorrect", data)
                return False
        else:
            print_result("Parent Login", False, f"HTTP {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result("Parent Login", False, f"Exception: {str(e)}")
        return False
    
    # ==================== STEP 8: TEST EDGE CASE - CONVERT SAME LEAD AGAIN ====================
    print_section("Step 8: Edge Case - Try Converting Same Lead Again")
    try:
        response = requests.post(
            f"{BACKEND_URL}/leads/{lead_mongo_id}/convert",
            headers=headers,
            timeout=10
        )
        
        # Should fail with 400 error
        if response.status_code == 400:
            data = response.json()
            error_detail = data.get("detail", "")
            
            if "already converted" in error_detail.lower():
                print_result(
                    "Duplicate Conversion Prevention",
                    True,
                    "Correctly prevented duplicate conversion",
                    {"error": error_detail}
                )
            else:
                print_result(
                    "Duplicate Conversion Prevention",
                    False,
                    f"Wrong error message. Expected 'already converted', Got: '{error_detail}'",
                    data
                )
                return False
        else:
            print_result(
                "Duplicate Conversion Prevention",
                False,
                f"Expected HTTP 400, Got HTTP {response.status_code}",
                response.text
            )
            return False
    except Exception as e:
        print_result("Duplicate Conversion Prevention", False, f"Exception: {str(e)}")
        return False
    
    # ==================== ALL TESTS PASSED ====================
    print_section("TEST SUMMARY")
    print("\n✅ ALL TESTS PASSED!")
    print("\nTest Results:")
    print("  ✅ Super Admin Login")
    print("  ✅ Lead Creation")
    print("  ✅ Lead to Student Conversion")
    print("  ✅ Student Verification")
    print("  ✅ Lead Status Update")
    print("  ✅ Student Login")
    print("  ✅ Parent Login")
    print("  ✅ Duplicate Conversion Prevention")
    print("\n" + "="*80)
    
    return True

if __name__ == "__main__":
    try:
        success = test_lead_conversion_flow()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
