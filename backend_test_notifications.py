"""
Comprehensive Push Notifications API Test for Nurik's Academy
Tests all Push Notification endpoints as per review request
"""
import requests
import json
from typing import Dict, Optional
import time

# Backend URL - Using localhost as specified in review request
BASE_URL = "http://localhost:8001/api"

# Admin Credentials
ADMIN_LOGIN = "admin"
ADMIN_PASSWORD = "Admin@2025"

# Test data
TEST_TOKEN = "ExponentPushToken[test123456789]"
TEST_DEVICE_TYPE = "android"

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

def login_user(login: str, password: str) -> Optional[str]:
    """Login and return access token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"login": login, "password": password},
            timeout=10
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

# ==================== PUSH NOTIFICATION TESTS ====================

def test_1_register_token():
    """Test 1: Register Push Token"""
    global token_id
    print_test("1", "Register Push Token")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "token": TEST_TOKEN,
            "device_type": TEST_DEVICE_TYPE
        }
        
        response = requests.post(
            f"{BASE_URL}/notifications/register-token",
            json=payload,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token_id = data.get("token_id")
            message = data.get("message", "")
            
            if token_id and ("registered" in message.lower() or "already" in message.lower()):
                print_result(True, f"Token registered successfully: token_id={token_id}", data)
                test_results.append(("Test 1: Register Push Token", True))
                return True
            else:
                print_result(False, "Token registration response missing token_id or message", data)
                test_results.append(("Test 1: Register Push Token", False))
                return False
        else:
            print_result(False, f"Failed to register token: {response.status_code} - {response.text}")
            test_results.append(("Test 1: Register Push Token", False))
            return False
    except Exception as e:
        print_result(False, f"Error registering token: {str(e)}")
        test_results.append(("Test 1: Register Push Token", False))
        return False

def test_2_get_preferences():
    """Test 2: Get Notification Preferences"""
    print_test("2", "Get Notification Preferences")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/notifications/preferences",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check for all expected preference fields
            expected_fields = [
                "payment_reminders",
                "homework_notifications",
                "test_notifications",
                "lesson_reminders",
                "news_announcements",
                "admin_broadcasts"
            ]
            
            missing_fields = [field for field in expected_fields if field not in data]
            
            if not missing_fields:
                print_result(True, f"All {len(expected_fields)} preference fields present", data)
                test_results.append(("Test 2: Get Notification Preferences", True))
                return True
            else:
                print_result(False, f"Missing preference fields: {missing_fields}", data)
                test_results.append(("Test 2: Get Notification Preferences", False))
                return False
        else:
            print_result(False, f"Failed to get preferences: {response.status_code} - {response.text}")
            test_results.append(("Test 2: Get Notification Preferences", False))
            return False
    except Exception as e:
        print_result(False, f"Error getting preferences: {str(e)}")
        test_results.append(("Test 2: Get Notification Preferences", False))
        return False

def test_3_update_preferences():
    """Test 3: Update Notification Preferences"""
    print_test("3", "Update Notification Preferences")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "payment_reminders": True,
            "homework_notifications": True,
            "test_notifications": False,
            "lesson_reminders": True,
            "news_announcements": False,
            "admin_broadcasts": True
        }
        
        response = requests.put(
            f"{BASE_URL}/notifications/preferences",
            json=payload,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            
            if "success" in message.lower() or "updated" in message.lower():
                print_result(True, "Preferences updated successfully", data)
                test_results.append(("Test 3: Update Notification Preferences", True))
                return True
            else:
                print_result(False, f"Unexpected response message: {message}", data)
                test_results.append(("Test 3: Update Notification Preferences", False))
                return False
        else:
            print_result(False, f"Failed to update preferences: {response.status_code} - {response.text}")
            test_results.append(("Test 3: Update Notification Preferences", False))
            return False
    except Exception as e:
        print_result(False, f"Error updating preferences: {str(e)}")
        test_results.append(("Test 3: Update Notification Preferences", False))
        return False

def test_4_get_history():
    """Test 4: Get Notification History"""
    print_test("4", "Get Notification History")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/notifications/history",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, list):
                print_result(True, f"Notification history retrieved successfully. Count: {len(data)}", {"count": len(data)})
                test_results.append(("Test 4: Get Notification History", True))
                return True
            else:
                print_result(False, f"Expected list response, got: {type(data)}", data)
                test_results.append(("Test 4: Get Notification History", False))
                return False
        else:
            print_result(False, f"Failed to get history: {response.status_code} - {response.text}")
            test_results.append(("Test 4: Get Notification History", False))
            return False
    except Exception as e:
        print_result(False, f"Error getting history: {str(e)}")
        test_results.append(("Test 4: Get Notification History", False))
        return False

def test_5_send_test_notification():
    """Test 5: Send Test Notification"""
    print_test("5", "Send Test Notification")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/notifications/test",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            tokens_count = data.get("tokens_count")
            result = data.get("result")
            
            if "test" in message.lower() and tokens_count is not None:
                print_result(True, f"Test notification sent. Tokens: {tokens_count}", data)
                test_results.append(("Test 5: Send Test Notification", True))
                return True
            else:
                print_result(False, "Test notification response missing expected fields", data)
                test_results.append(("Test 5: Send Test Notification", False))
                return False
        else:
            print_result(False, f"Failed to send test notification: {response.status_code} - {response.text}")
            test_results.append(("Test 5: Send Test Notification", False))
            return False
    except Exception as e:
        print_result(False, f"Error sending test notification: {str(e)}")
        test_results.append(("Test 5: Send Test Notification", False))
        return False

def test_6_admin_broadcast():
    """Test 6: Admin Broadcast Notification"""
    print_test("6", "Admin Broadcast Notification")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": "Test Broadcast",
            "body": "This is a test broadcast notification"
        }
        
        response = requests.post(
            f"{BASE_URL}/notifications/broadcast",
            json=payload,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            sent_count = data.get("sent_count")
            
            if ("broadcast" in message.lower() or "queued" in message.lower()) and sent_count is not None:
                print_result(True, f"Broadcast notification sent. Count: {sent_count}", data)
                test_results.append(("Test 6: Admin Broadcast Notification", True))
                return True
            else:
                print_result(False, "Broadcast response missing expected fields", data)
                test_results.append(("Test 6: Admin Broadcast Notification", False))
                return False
        else:
            print_result(False, f"Failed to broadcast: {response.status_code} - {response.text}")
            test_results.append(("Test 6: Admin Broadcast Notification", False))
            return False
    except Exception as e:
        print_result(False, f"Error broadcasting notification: {str(e)}")
        test_results.append(("Test 6: Admin Broadcast Notification", False))
        return False

def test_7_send_to_role():
    """Test 7: Send Notification to Role"""
    print_test("7", "Send Notification to Role")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": "Role Test",
            "body": "Test message",
            "target_roles": ["student"]
        }
        
        response = requests.post(
            f"{BASE_URL}/notifications/send",
            json=payload,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            sent_count = data.get("sent_count")
            
            # Accept both "queued" and "No registered devices found" as valid responses
            # since there may not be any students with registered tokens
            if sent_count is not None and ("queued" in message.lower() or "notification" in message.lower() or "no registered" in message.lower()):
                print_result(True, f"Role notification API working correctly. Count: {sent_count}, Message: {message}", data)
                test_results.append(("Test 7: Send Notification to Role", True))
                return True
            else:
                print_result(False, "Role notification response missing expected fields", data)
                test_results.append(("Test 7: Send Notification to Role", False))
                return False
        else:
            print_result(False, f"Failed to send to role: {response.status_code} - {response.text}")
            test_results.append(("Test 7: Send Notification to Role", False))
            return False
    except Exception as e:
        print_result(False, f"Error sending to role: {str(e)}")
        test_results.append(("Test 7: Send Notification to Role", False))
        return False

def test_8_unregister_token():
    """Test 8: Unregister Push Token"""
    print_test("8", "Unregister Push Token")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.delete(
            f"{BASE_URL}/notifications/unregister-token?token={TEST_TOKEN}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            
            if "unregistered" in message.lower() or "success" in message.lower():
                print_result(True, "Token unregistered successfully", data)
                test_results.append(("Test 8: Unregister Push Token", True))
                return True
            else:
                print_result(False, f"Unexpected response message: {message}", data)
                test_results.append(("Test 8: Unregister Push Token", False))
                return False
        else:
            print_result(False, f"Failed to unregister token: {response.status_code} - {response.text}")
            test_results.append(("Test 8: Unregister Push Token", False))
            return False
    except Exception as e:
        print_result(False, f"Error unregistering token: {str(e)}")
        test_results.append(("Test 8: Unregister Push Token", False))
        return False

# ==================== MAIN TEST RUNNER ====================

def run_all_tests():
    """Run all tests in sequence"""
    global admin_token
    
    print("\n" + "="*80)
    print("PUSH NOTIFICATIONS API TEST")
    print("Nurik's Academy - Complete Push Notification System")
    print("="*80)
    
    # Admin Login
    print_test("0", "Admin Login")
    admin_token = login_user(ADMIN_LOGIN, ADMIN_PASSWORD)
    
    if not admin_token:
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        return False
    
    print_result(True, "Admin login successful", {"token_length": len(admin_token)})
    
    # Run all notification tests
    print("\n" + "="*80)
    print("PUSH NOTIFICATION ENDPOINTS")
    print("="*80)
    
    test_1_register_token()
    test_2_get_preferences()
    test_3_update_preferences()
    test_4_get_history()
    test_5_send_test_notification()
    test_6_admin_broadcast()
    test_7_send_to_role()
    test_8_unregister_token()
    
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
