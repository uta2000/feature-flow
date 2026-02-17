# React Native — Stack-Specific Checks

Additional verification checks when the project uses React Native.

## Verification Checks

### Native Bridge & Compatibility

- [ ] **Native module compatibility:** Third-party native modules support both iOS and Android at the required versions.
- [ ] **New Architecture (Fabric/TurboModules):** If using New Architecture, verify libraries support it. Many older libraries only support the bridge.
- [ ] **Hermes engine:** Verify libraries work with Hermes. Some rely on JSC-specific features (Intl, certain Proxy behavior).
- [ ] **Expo compatibility:** If using Expo, verify native modules are available in Expo Go or require a custom dev client.
- [ ] **Linking/autolinking:** Native modules must be linked. Check if `pod install` (iOS) and Gradle sync (Android) succeed.

### Platform-Specific Code

- [ ] **Platform files:** Features that differ per platform use `.ios.tsx` / `.android.tsx` or `Platform.select()`.
- [ ] **Permission models:** iOS and Android handle permissions differently (camera, location, notifications, etc.). Design covers both.
- [ ] **Navigation patterns:** iOS uses push/swipe-back, Android uses back button. Navigation handles both.
- [ ] **Keyboard behavior:** iOS keyboard avoidance differs from Android. Forms must handle both.
- [ ] **Status bar:** iOS and Android handle status bar differently (notch, dynamic island, status bar height).

### Performance & Size

- [ ] **Bundle size impact:** New dependencies increase app download size. Check size of new libraries.
- [ ] **Startup time:** New initialization code (providers, SDK init) affects cold start time.
- [ ] **List performance:** Long lists must use FlatList/SectionList with proper `keyExtractor` and `getItemLayout`.
- [ ] **Image handling:** Large images must be cached and resized. Don't load full-resolution images in lists.
- [ ] **Memory leaks:** Subscriptions, timers, and event listeners must be cleaned up on unmount.

### Offline & Storage

- [ ] **AsyncStorage limits:** AsyncStorage has a 6MB default limit on Android. Large data needs SQLite or file storage.
- [ ] **Offline behavior:** Features that require network should gracefully degrade offline (loading states, cached data, queue for retry).
- [ ] **Background sync:** Data modified offline needs sync logic when network returns. Handle conflicts.
- [ ] **Secure storage:** Sensitive data (tokens, credentials) must use SecureStore or Keychain, not AsyncStorage.

### Push Notifications

- [ ] **APNs (iOS) + FCM (Android):** Both platforms need separate configuration.
- [ ] **Permission request timing:** iOS shows permission dialog once — request at the right moment, not on app launch.
- [ ] **Background vs foreground handling:** Notification behavior differs when app is in foreground vs background vs killed.
- [ ] **Deep linking:** Notification taps should deep link to the right screen. Handle deep links when app is cold-started.

### App Store / Play Store Requirements

- [ ] **Privacy manifest (iOS):** iOS requires privacy manifest declaring data usage and API reasons.
- [ ] **Minimum OS version:** Features using newer OS APIs must check availability or raise minimum deployment target.
- [ ] **Export compliance:** Encryption usage must be declared for both stores.
- [ ] **App Tracking Transparency (iOS):** Tracking requires ATT permission prompt.

## Common React Native Gotchas

| Gotcha | Impact | Fix |
|--------|--------|-----|
| Library doesn't support Hermes | Runtime crash on production builds | Check Hermes compatibility before adopting |
| AsyncStorage >6MB on Android | Silent write failures | Use SQLite for large datasets |
| Missing iOS permission in Info.plist | App crashes when requesting permission | Add required `NS*UsageDescription` keys |
| FlatList without keyExtractor | Poor scroll performance, wrong items | Add stable keyExtractor |
| Navigation state lost on Android back | User exits app unexpectedly | Handle hardware back button |
| Expo Go missing native module | Works in dev, crashes in production | Use custom dev client |

## Risky Assumptions (for Spike)

| Assumption | How to Test |
|-----------|-------------|
| Library works with Hermes | Build release APK, test core functionality |
| Library works with Expo | Test in custom dev client (not Expo Go) |
| Feature works on minimum OS version | Test on oldest supported device/emulator |
| Offline mode handles this data | Test with airplane mode during operation |
| Push notification arrives reliably | Send test notifications in all app states |
| Native module links correctly | Run `pod install` + Gradle sync, build both platforms |
