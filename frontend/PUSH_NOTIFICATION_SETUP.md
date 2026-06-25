# Push Notification Setup Guide

## 📋 Overview

This guide explains how to configure push notifications for Nurik's Academy on both Android (Firebase Cloud Messaging) and iOS (Apple Push Notification Service).

---

## 🔔 Architecture Summary

### How Push Notifications Work

```
[User Action] → [Backend API] → [Expo Push Server] → [FCM/APNs] → [Device]
```

1. **Device Token Registration**: When a user logs in, the app requests permission and obtains an Expo Push Token
2. **Token Storage**: The token is sent to the backend and stored in the `push_tokens` collection
3. **Notification Trigger**: When an event occurs (homework assigned, message sent, etc.), the backend sends a notification
4. **Expo Push API**: Backend sends notification to Expo's push server
5. **Platform Delivery**: Expo routes to FCM (Android) or APNs (iOS)

### Notification Types Implemented

| Type | Trigger | Recipients |
|------|---------|------------|
| **Homework** | New homework assigned | Students + Parents |
| **Tests** | Test scheduled | Students + Parents |
| **Payments** | Payment reminder | Parents |
| **News** | News published | Targeted audience |
| **Chat** | New message (when offline) | Recipient |
| **Certificates** | Certificate issued | Student |
| **Attendance** | Marked absent/late | Student + Parent |

---

## 🤖 Android Setup (Firebase Cloud Messaging)

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"**
3. Project name: `Nurik's Academy`
4. Enable Google Analytics (optional)
5. Click **"Create project"**

### Step 2: Add Android App

1. In Firebase console, click **"Add app"** → **Android**
2. Enter package name: `com.nuriksacademy.app`
3. App nickname: `Nurik's Academy`
4. Debug signing certificate SHA-1: (optional for development)
5. Click **"Register app"**

### Step 3: Download google-services.json

1. Click **"Download google-services.json"**
2. Place the file in: `/app/frontend/google-services.json`

### Step 4: Update app.json

Add this to your `app.json` under `expo.android`:

```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

### Step 5: Enable Cloud Messaging

1. In Firebase Console → Project Settings → Cloud Messaging
2. Ensure Cloud Messaging API (V1) is enabled
3. Note: FCM Server Key is NOT needed - Expo handles this automatically

### File Structure After Setup

```
/app/frontend/
├── google-services.json    ← Add this file
├── app.json               ← Already configured
└── ...
```

---

## 🍎 iOS Setup (Apple Push Notification Service)

### Step 1: Apple Developer Account

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Wait for enrollment approval (usually 24-48 hours)

### Step 2: Create App ID

1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
2. Click **"+"** to add new identifier
3. Select **"App IDs"** → Continue
4. Select **"App"** → Continue
5. Description: `Nurik's Academy`
6. Bundle ID (Explicit): `com.nuriksacademy.app`
7. Under Capabilities, enable:
   - ✅ **Push Notifications**
8. Click **"Continue"** → **"Register"**

### Step 3: Create APNs Key

1. Go to [Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Click **"+"** to create a new key
3. Key Name: `Nurik's Academy Push Key`
4. Enable: ✅ **Apple Push Notifications service (APNs)**
5. Click **"Continue"** → **"Register"**
6. **IMPORTANT**: Download the key (`.p8` file) - you can only download once!
7. Note your **Key ID** and **Team ID**

### Step 4: Configure in EAS

Run this command and follow the prompts:

```bash
eas credentials --platform ios
```

When prompted:
1. Select **"Push Notifications: Manage your Apple Push Notifications Key"**
2. Upload your `.p8` file
3. Enter your Key ID and Team ID

Alternatively, configure via eas.json:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@email.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

### Important iOS Files

You do NOT need to manually add any iOS files. EAS Build handles:
- Provisioning profiles
- Push notification entitlements
- APNs configuration

---

## 🔧 Expo Configuration

### Step 1: Link Expo Project

```bash
cd /app/frontend
eas login
eas build:configure
```

This will:
1. Create your project on Expo servers
2. Generate a unique project ID
3. Update your `app.json` with the project ID

### Step 2: Update app.json Placeholders

Replace these placeholders in `/app/frontend/app.json`:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR_ACTUAL_PROJECT_ID"  // ← Replace
      }
    },
    "owner": "YOUR_EXPO_USERNAME",              // ← Replace
    "updates": {
      "url": "https://u.expo.dev/YOUR_ACTUAL_PROJECT_ID"  // ← Replace
    }
  }
}
```

### Step 3: Verify Notification Plugin

Your `app.json` should already have:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/icon.png",
          "color": "#D49A2F",
          "sounds": []
        }
      ]
    ]
  }
}
```

---

## 🧪 Testing Push Notifications

### Test on Physical Device

1. Build development version:
   ```bash
   eas build --platform android --profile development
   # or
   eas build --platform ios --profile development
   ```

2. Install on device

3. Login to the app

4. Go to **Profile → Notification Settings**

5. Click **"Send Test Notification"**

### Test via API

```bash
# Get auth token
TOKEN=$(curl -s -X POST https://your-api.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login": "admin", "password": "Admin@2025"}' | jq -r '.access_token')

# Send test notification
curl -X POST https://your-api.com/api/notifications/test \
  -H "Authorization: Bearer $TOKEN"
```

### Test Admin Broadcast

```bash
curl -X POST https://your-api.com/api/notifications/broadcast \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Broadcast",
    "body": "This is a test broadcast notification",
    "data": {"type": "test"}
  }'
```

---

## 📱 Notification Behavior

### When App is in Foreground
- Notification banner appears at top of screen
- Sound plays (if enabled)
- Badge updates

### When App is in Background
- System notification appears
- Tapping notification opens app to relevant screen

### Navigation on Tap

| Notification Type | Opens Screen |
|-------------------|--------------|
| Homework | `/homework` |
| Test | `/tests` |
| Payment | `/payments` |
| News | `/news` |
| Chat | `/chat/{conversation_id}` |
| Certificate | `/certificates` |

---

## 🔒 User Preferences

Users can control which notifications they receive:

| Preference | Default | Description |
|------------|---------|-------------|
| Payment Reminders | ✅ On | Payment due date reminders |
| Homework | ✅ On | New homework assignments |
| Tests | ✅ On | Upcoming tests |
| Lesson Reminders | ✅ On | Before lessons start |
| News | ✅ On | Academy announcements |
| Admin Broadcasts | ✅ On | Important messages |

Access via: **Profile → Notification Settings**

---

## 🚨 Troubleshooting

### Notifications Not Received

1. **Check Device**:
   - Must be physical device (not simulator)
   - Notifications enabled in device settings

2. **Check Token**:
   - View token in Notification Settings screen
   - Token should start with `ExponentPushToken[...]`

3. **Check Permissions**:
   - App must have notification permission granted

4. **Check Backend Logs**:
   ```bash
   sudo supervisorctl tail -f backend
   ```
   Look for: `Push notification sent successfully`

### Android-Specific Issues

- Ensure `google-services.json` is in correct location
- Rebuild app after adding the file:
  ```bash
  eas build --platform android
  ```

### iOS-Specific Issues

- Ensure APNs key is uploaded to EAS
- Check entitlements include push notifications
- Verify bundle ID matches exactly

---

## 📁 Related Files

### Backend
- `/app/backend/routes_notifications.py` - API endpoints
- `/app/backend/notification_helpers.py` - Trigger functions

### Frontend
- `/app/frontend/src/services/notifications.ts` - Service layer
- `/app/frontend/src/contexts/NotificationContext.tsx` - Global handler
- `/app/frontend/src/contexts/AuthContext.tsx` - Auto-registration
- `/app/frontend/app/(dashboard)/notification-settings.tsx` - UI

### Configuration
- `/app/frontend/app.json` - Expo config
- `/app/frontend/eas.json` - Build profiles
- `/app/frontend/google-services.json` - Firebase (to be added)

---

## ✅ Checklist

### Android
- [ ] Firebase project created
- [ ] Android app registered in Firebase
- [ ] `google-services.json` downloaded and placed in `/app/frontend/`
- [ ] `app.json` updated with `googleServicesFile` reference
- [ ] Development build created with `eas build`
- [ ] Test notification received on device

### iOS
- [ ] Apple Developer account enrolled
- [ ] App ID created with Push Notifications capability
- [ ] APNs key created and downloaded
- [ ] Key uploaded to EAS via `eas credentials`
- [ ] Development build created with `eas build`
- [ ] Test notification received on device

### Expo
- [ ] `eas login` completed
- [ ] `eas build:configure` run
- [ ] Project ID updated in `app.json`
- [ ] Owner updated in `app.json`

---

© 2025 Nurik's Academy
