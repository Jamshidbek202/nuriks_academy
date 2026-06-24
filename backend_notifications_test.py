"""
Push Notifications API Test for Nurik's Academy
Tests all Push Notifications endpoints as per review request
"""
import requests
import json
from typing import Dict, Optional

# Backend URL
BASE_URL = "https://school-ops-dashboard-2.preview.emergentagent.com/api"

# Admin Credentials
ADMIN_LOGIN = "admin"
ADMIN_PASSWORD = "Admin@2025"

# Global variables
admin_token = None
token_id = None

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

def login_admin() -> Optional[str]:
    """Login as admin and return access token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": ADMIN_LOGIN, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            print(f"✅ Admin login successful")
            return token
        else:
            print(f"❌ Admin login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Admin login error: {str(e)}")
        return None

# ==================== TEST CASES ====================

def test_1_register_push_token():
    """Test 1: Register Push Token"""
    global token_id
    print_test("1", "Register Push Token")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "token": "ExponentPushToken[test123456789]",
            "device_type": "ios"
        }
        
        response = requests.post(
            f"{BASE_URL}/notifications/register-token",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            token_id = data.get("token_id")
            if token_id:
                print_result(True, f"Push token registered successfully. Token ID: {token_id}", data)
                test_results.append(("Test 1: Register Push Token", True, data))
                return True
            else:
                print_result(False, "Token registered but no token_id returned", data)
                test_results.append(("Test 1: Register Push Token", False, data))
                return False
        else:
            print_result(False, f"Failed to register token: {response.status_code} - {response.text}")
            test_results.append(("Test 1: Register Push Token", False, {"error": response.text}))
            return False
    except Exception as e:
        print_result(False, f"Error registering token: {str(e)}")
        test_results.append(("Test 1: Register Push Token", False, {"error": str(e)}))
        return False

def test_2_get_notification_preferences():
    """Test 2: Get Notification Preferences"""
    print_test("2", "Get Notification Preferences")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/notifications/preferences",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Check if all expected fields are present
            expected_fields = [
                "payment_reminders", "homework_notifications", "test_notifications",
                "lesson_reminders", "news_announcements", "admin_broadcasts"
            ]
            all_fields_present = all(field in data for field in expected_fields)
            
            if all_fields_present:
                print_result(True, "Notification preferences retrieved successfully (all fields present)", data)
                test_results.append(("Test 2: Get Notification Preferences", True, data))
                return True
            else:
                print_result(False, "Some preference fields are missing", data)
                test_results.append(("Test 2: Get Notification Preferences", False, data))
                return False
        else:
            print_result(False, f"Failed to get preferences: {response.status_code} - {response.text}")
            test_results.append(("Test 2: Get Notification Preferences", False, {"error": response.text}))
            return False
    except Exception as e:
        print_result(False, f"Error getting preferences: {str(e)}")
        test_results.append(("Test 2: Get Notification Preferences", False, {"error": str(e)}))
        return False

def test_3_update_notification_preferences():
    """Test 3: Update Notification Preferences"""
    print_test("3", "Update Notification Preferences")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "payment_reminders": True,
            "homework_notifications": True,
            "test_notifications": True,
            "lesson_reminders": False,
            "news_announcements": True,
            "admin_broadcasts": True
        }
        
        response = requests.put(
            f"{BASE_URL}/notifications/preferences",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, "Notification preferences updated successfully", data)
            test_results.append(("Test 3: Update Notification Preferences", True, data))
            return True
        else:
            print_result(False, f"Failed to update preferences: {response.status_code} - {response.text}")
            test_results.append(("Test 3: Update Notification Preferences", False, {"error": response.text}))
            return False
    except Exception as e:
        print_result(False, f"Error updating preferences: {str(e)}")
        test_results.append(("Test 3: Update Notification Preferences", False, {"error": str(e)}))
        return False

def test_4_send_test_notification():
    """Test 4: Send Test Notification"""
    print_test("4", "Send Test Notification")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/notifications/test",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Test notification may show no tokens if test token is not valid
            # This is expected behavior
            print_result(True, "Test notification endpoint working correctly", data)
            test_results.append(("Test 4: Send Test Notification", True, data))
            return True
        else:
            print_result(False, f"Failed to send test notification: {response.status_code} - {response.text}")
            test_results.append(("Test 4: Send Test Notification", False, {"error": response.text}))
            return False
    except Exception as e:
        print_result(False, f"Error sending test notification: {str(e)}")
        test_results.append(("Test 4: Send Test Notification", False, {"error": str(e)}))
        return False

def test_5_send_admin_notification():
    """Test 5: Send Admin Notification"""
    print_test("5", "Send Admin Notification")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": "Test Notification",
            "body": "This is a test",
            "target_roles": ["student"]
        }
        
        response = requests.post(
            f"{BASE_URL}/notifications/send",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if "sent_count" in data:
                print_result(True, f"Admin notification sent successfully. Sent count: {data.get('sent_count')}", data)
                test_results.append(("Test 5: Send Admin Notification", True, data))
                return True
            else:
                print_result(True, "Admin notification endpoint working (no sent_count in response)", data)
                test_results.append(("Test 5: Send Admin Notification", True, data))
                return True
        else:
            print_result(False, f"Failed to send admin notification: {response.status_code} - {response.text}")
            test_results.append(("Test 5: Send Admin Notification", False, {"error": response.text}))
            return False
    except Exception as e:
        print_result(False, f"Error sending admin notification: {str(e)}")
        test_results.append(("Test 5: Send Admin Notification", False, {"error": str(e)}))
        return False

def test_6_get_notification_history():
    """Test 6: Get Notification History"""
    print_test("6", "Get Notification History")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/notifications/history",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                print_result(True, f"Notification history retrieved successfully. Count: {len(data)}", {"count": len(data), "sample": data[:2] if data else []})
                test_results.append(("Test 6: Get Notification History", True, {"count": len(data)}))
                return True
            else:
                print_result(False, "Notification history response is not a list", data)
                test_results.append(("Test 6: Get Notification History", False, data))
                return False
        else:
            print_result(False, f"Failed to get notification history: {response.status_code} - {response.text}")
            test_results.append(("Test 6: Get Notification History", False, {"error": response.text}))
            return False
    except Exception as e:
        print_result(False, f"Error getting notification history: {str(e)}")
        test_results.append(("Test 6: Get Notification History", False, {"error": str(e)}))
        return False

def test_7_admin_broadcast():
    """Test 7: Admin Broadcast"""
    print_test("7", "Admin Broadcast")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": "Academy Announcement",
            "body": "Important update for all users"
        }
        
        response = requests.post(
            f"{BASE_URL}/notifications/broadcast",
            json=payload,
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if "sent_count" in data:
                print_result(True, f"Broadcast notification sent successfully. Sent count: {data.get('sent_count')}", data)
                test_results.append(("Test 7: Admin Broadcast", True, data))
                return True
            else:
                print_result(True, "Broadcast notification endpoint working (no sent_count in response)", data)
                test_results.append(("Test 7: Admin Broadcast", True, data))
                return True
        else:
            print_result(False, f"Failed to send broadcast: {response.status_code} - {response.text}")
            test_results.append(("Test 7: Admin Broadcast", False, {"error": response.text}))
            return False
    except Exception as e:
        print_result(False, f"Error sending broadcast: {str(e)}")
        test_results.append(("Test 7: Admin Broadcast", False, {"error": str(e)}))
        return False

# ==================== MAIN TEST RUNNER ====================

def run_all_tests():
    """Run all notification tests"""
    global admin_token
    
    print("\n" + "="*80)
    print("PUSH NOTIFICATIONS API TEST - NURIK'S ACADEMY")
    print("="*80)
    
    # Login as admin
    print("\n🔐 Logging in as Admin...")
    admin_token = login_admin()
    if not admin_token:
        print("\n❌ CRITICAL ERROR: Admin login failed. Cannot proceed with tests.")
        return
    
    # Run all tests
    print("\n" + "="*80)
    print("STARTING PUSH NOTIFICATIONS API TESTS")
    print("="*80)
    
    test_1_register_push_token()
    test_2_get_notification_preferences()
    test_3_update_notification_preferences()
    test_4_send_test_notification()
    test_5_send_admin_notification()
    test_6_get_notification_history()
    test_7_admin_broadcast()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, success, *_ in test_results if success)
    failed = len(test_results) - passed
    
    print(f"\nTotal Tests: {len(test_results)}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed/len(test_results)*100):.1f}%")
    
    print("\n" + "="*80)
    print("DETAILED RESULTS")
    print("="*80)
    
    for result in test_results:
        test_name = result[0]
        success = result[1]
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print("TEST EXECUTION COMPLETE")
    print("="*80)

if __name__ == "__main__":
    run_all_tests()
