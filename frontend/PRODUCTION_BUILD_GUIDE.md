# Nurik's Academy - Production Build Guide

## Pre-Build Setup

### 1. Install EAS CLI
```bash
npm install -g eas-cli
```

### 2. Login to Expo
```bash
eas login
```

### 3. Configure Project
```bash
cd frontend
eas build:configure
```
This will:
- Create/update your project on Expo servers
- Generate a unique project ID
- Update `app.json` with your project ID

### 4. Update Configuration Files

#### app.json - Replace placeholders:
- `YOUR_EAS_PROJECT_ID` → Your actual EAS project ID (from eas build:configure)
- `YOUR_EXPO_USERNAME` → Your Expo account username

#### eas.json - For submission (optional):
- `YOUR_APPLE_ID` → Apple ID email
- `YOUR_APP_STORE_CONNECT_APP_ID` → App Store Connect app ID
- `YOUR_APPLE_TEAM_ID` → Apple Developer Team ID

### 5. Set Production Backend URL
Edit `eas.json` and update the production `EXPO_PUBLIC_BACKEND_URL`:
```json
"env": {
  "EXPO_PUBLIC_BACKEND_URL": "https://your-production-api.com"
}
```

---

## Android Build (AAB for Google Play)

### Prerequisites
- Google Play Console Developer account ($25 one-time)
- Firebase project (for push notifications)

### Step 1: Set up Firebase (for Push Notifications)
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project "Nurik's Academy"
3. Add Android app with package name: `com.nuriksacademy.app`
4. Download `google-services.json`
5. Place in `/frontend/` folder

### Step 2: Build Production AAB
```bash
cd frontend
eas build --platform android --profile production
```

### Step 3: Download AAB
After build completes (~10-15 minutes):
- Download link will be provided in terminal
- Or visit: https://expo.dev → Select project → Builds

### Step 4: Upload to Google Play
1. Go to [Google Play Console](https://play.google.com/console)
2. Create new app or select existing
3. Go to Release → Production → Create new release
4. Upload the AAB file
5. Fill in release notes
6. Submit for review

---

## iOS Build (IPA for App Store)

### Prerequisites
- Apple Developer Program membership ($99/year)
- App Store Connect setup

### Step 1: Apple Developer Setup
1. Enroll at [developer.apple.com](https://developer.apple.com/programs/)
2. Create App ID with bundle: `com.nuriksacademy.app`
3. Enable Push Notifications capability

### Step 2: Configure iOS Credentials
```bash
eas credentials --platform ios
```
Follow prompts to:
- Generate/upload distribution certificate
- Create provisioning profile
- Set up push notification keys

### Step 3: Build Production IPA
```bash
cd frontend
eas build --platform ios --profile production
```

### Step 4: Submit to App Store
```bash
eas submit --platform ios --latest
```
Or manually:
1. Download IPA from Expo dashboard
2. Upload via Transporter app or App Store Connect

---

## Quick Commands Reference

```bash
# Development builds (testing)
eas build --platform android --profile development
eas build --platform ios --profile development

# Preview builds (internal testing)
eas build --platform android --profile preview
eas build --platform ios --profile preview

# Production builds
eas build --platform android --profile production
eas build --platform ios --profile production

# Submit to stores
eas submit --platform android --latest
eas submit --platform ios --latest

# Build both platforms
eas build --platform all --profile production
```

---

## Environment Variables

For production, create a production `.env` file or set in `eas.json`:

```
EXPO_PUBLIC_BACKEND_URL=https://api.nuriksacademy.com
```

---

## Push Notification Testing

After installing on a physical device:

1. **Register Token**: App automatically registers on login
2. **Test Notification**: Use admin panel or API:
   ```bash
   curl -X POST https://api.nuriksacademy.com/api/notifications/test \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

---

## Troubleshooting

### Build Fails
- Run `eas build:inspect` to check configuration
- Ensure all assets exist (icons, splash screens)
- Check `app.json` for syntax errors

### Push Notifications Not Working
- Verify `google-services.json` is in place (Android)
- Check APNs keys are configured (iOS)
- Ensure device is physical, not simulator

### App Crashes on Start
- Check Metro bundler output for errors
- Verify all environment variables are set
- Test with development build first

---

## Store Listing Requirements

### Google Play
- [ ] App Icon: 512x512 PNG
- [ ] Feature Graphic: 1024x500 PNG  
- [ ] Screenshots: 2-8 per device type
- [ ] Short Description: max 80 characters
- [ ] Full Description: max 4000 characters
- [ ] Privacy Policy URL
- [ ] Contact email

### App Store
- [ ] App Icon: 1024x1024 PNG
- [ ] Screenshots: 6.7", 6.5", 5.5" sizes
- [ ] App Preview (optional)
- [ ] Description
- [ ] Keywords: max 100 characters
- [ ] Privacy Policy URL
- [ ] Support URL

---

## Version Management

To update version for new release:

1. Edit `app.json`:
   - `version`: "1.0.1" (user-visible)
   - `ios.buildNumber`: "2"
   - `android.versionCode`: 2

2. Or use auto-increment:
   ```bash
   eas build --auto-increment
   ```

---

© 2025 Nurik's Academy
