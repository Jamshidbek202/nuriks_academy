"""
Simple test to debug teacher login issue
"""
import requests
import json

BASE_URL = "https://school-ops-dashboard-2.preview.emergentagent.com/api"

# Test 1: Admin Login
print("=" * 80)
print("TEST 1: Admin Login")
print("=" * 80)
response = requests.post(
    f"{BASE_URL}/auth/login",
    json={"login": "admin", "password": "Admin@2025"}
)
print(f"Status: {response.status_code}")
print(f"Response: {json.dumps(response.json(), indent=2)}")

if response.status_code == 200:
    admin_token = response.json()["access_token"]
    print(f"\n✅ Admin login successful")
    
    # Test 2: Get all teachers
    print("\n" + "=" * 80)
    print("TEST 2: Get All Teachers")
    print("=" * 80)
    response = requests.get(
        f"{BASE_URL}/teachers",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print(f"Status: {response.status_code}")
    teachers = response.json()
    print(f"Total teachers: {len(teachers)}")
    
    # Find the QA teacher
    qa_teacher = None
    for teacher in teachers:
        if teacher.get("phone") == "+998901111222":
            qa_teacher = teacher
            print(f"\nFound QA Teacher:")
            print(f"  ID: {teacher.get('id')}")
            print(f"  Name: {teacher.get('first_name')} {teacher.get('last_name')}")
            print(f"  Phone: {teacher.get('phone')}")
            print(f"  Email: {teacher.get('email')}")
            break
    
    if qa_teacher:
        teacher_id = qa_teacher["id"]
        
        # Test 3: Get teacher status
        print("\n" + "=" * 80)
        print("TEST 3: Get Teacher Status")
        print("=" * 80)
        response = requests.get(
            f"{BASE_URL}/teachers/{teacher_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Status: {response.status_code}")
        status_data = response.json()
        print(f"Response: {json.dumps(status_data, indent=2)}")
        
        teacher_login = status_data.get("login")
        is_active = status_data.get("is_active")
        
        # Test 4: Try to login as teacher with default password
        print("\n" + "=" * 80)
        print("TEST 4: Teacher Login with Default Password")
        print("=" * 80)
        print(f"Login: {teacher_login}")
        print(f"Password: Teacher@2025")
        print(f"Is Active: {is_active}")
        
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": teacher_login, "password": "Teacher@2025"}
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            print("✅ Teacher login successful!")
        else:
            print("❌ Teacher login failed!")
            
            # Test 5: Reset password and try again
            print("\n" + "=" * 80)
            print("TEST 5: Reset Teacher Password")
            print("=" * 80)
            response = requests.post(
                f"{BASE_URL}/teachers/{teacher_id}/reset-password",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            print(f"Status: {response.status_code}")
            reset_data = response.json()
            print(f"Response: {json.dumps(reset_data, indent=2)}")
            
            new_password = reset_data.get("new_password")
            
            # Test 6: Try to login with new password
            print("\n" + "=" * 80)
            print("TEST 6: Teacher Login with New Password")
            print("=" * 80)
            print(f"Login: {teacher_login}")
            print(f"Password: {new_password}")
            
            response = requests.post(
                f"{BASE_URL}/auth/login",
                json={"login": teacher_login, "password": new_password}
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                print("✅ Teacher login with new password successful!")
            else:
                print("❌ Teacher login with new password failed!")
    else:
        print("\n❌ QA Teacher not found")
else:
    print("❌ Admin login failed")
