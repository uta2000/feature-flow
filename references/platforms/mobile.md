# Mobile Platform — Lifecycle Adjustments

Adjustments to the feature development lifecycle when the project targets iOS, Android, or both.

**Core principle:** You can't take it back. A bad web deploy is reverted in 30 seconds. A bad mobile release means submit a fix, wait 1-3 days for App Store review, and hope users update.

## Lifecycle Step Changes

### Steps Promoted to Required

| Step | Web | Mobile | Why |
|------|-----|--------|-----|
| Feature flags | Recommended | **Required** | Can kill features server-side without app update |
| API contract testing | Good practice | **Required** | Old app versions call new API — breaking changes break everyone who hasn't updated |
| Migration dry-run | Recommended | **Required** | Backend migration breaking old app versions is a production incident you can't hotfix |
| Rollback planning | Standard section | **Expanded, required** | "Revert deploy" doesn't work — need multi-version compatibility strategy |

### Steps Added

| Step | Insert After | Purpose |
|------|-------------|---------|
| **Beta testing** | Final verification (step 12) | TestFlight (iOS) / Play Console (Android) internal testing on real devices |
| **App Store review** | PR / Merge (step 13) | Human-driven gate: submission, review, potential rejection, resubmission |
| **Device matrix testing** | Implementation (step 10) | Test across minimum OS versions, screen sizes, device types |

### Steps with Expanded Scope

| Step | Additional Mobile Requirements |
|------|-------------------------------|
| **Spike** | Test on real devices, not just simulators. Verify native module compatibility. |
| **Design verification** | Check backward compatibility with v(N-1) app version. Verify API versioning. |
| **Implementation plan** | Include feature flag strategy, rollback plan, device test matrix, API versioning. |
| **Code review** | Dependency audit (native module versions, binary size impact), platform-specific code review. |
| **Post-deploy verification** | Crash reports (Crashlytics, Sentry), ANR rates, store ratings, staged rollout monitoring. |

## Design Document — Additional Sections for Mobile

### Feature Flag Strategy (Required)

```markdown
## Feature Flag Strategy

- **Flag name:** `enable_[feature_name]`
- **Default:** `false` (disabled until verified in production)
- **Kill switch:** Feature can be fully disabled server-side without app update
- **Rollout plan:** 1% → 10% → 50% → 100% with monitoring between each stage
- **Cleanup:** Remove flag after 2 release cycles of stable operation
```

### Rollback Plan (Required)

```markdown
## Rollback Plan

- **Server-side:** Feature flag set to `false` disables the feature immediately
- **API compatibility:** v(N-1) app version works with the new backend (verified)
- **Migration reversibility:** [reversible/irreversible] — [details of rollback approach]
- **If irreversible:** [what compensating action is available]
```

### API Versioning (Required when API changes)

```markdown
## API Versioning

- **Affected endpoints:** [list]
- **Versioning approach:** [header-based / URL-based / query param]
- **Backward compatibility:** v(N-1) clients receive [current behavior / deprecation notice]
- **Sunset timeline:** Old version supported for [N] release cycles
```

### Device Compatibility

```markdown
## Device Compatibility

- **Minimum iOS version:** [version]
- **Minimum Android API level:** [level]
- **New OS APIs used:** [list, with availability checks]
- **Screen sizes tested:** [list]
- **Accessibility:** VoiceOver (iOS) and TalkBack (Android) tested
```

## Verification Checks — Mobile-Specific

### Backward Compatibility

- [ ] **API backward compatibility:** Old app version (v N-1) works with the new backend
- [ ] **Schema backward compatibility:** Database migration doesn't break queries from old app versions
- [ ] **Feature flag fallback:** When feature flag is off, the app behaves as if the feature doesn't exist (no empty screens, no broken navigation)
- [ ] **Deep link compatibility:** Existing deep links still resolve correctly after the change

### Store Compliance

- [ ] **Privacy manifest (iOS):** Data collection and API usage reasons declared
- [ ] **App Tracking Transparency:** If tracking, ATT prompt is implemented
- [ ] **Content rating:** New content doesn't change the app's content rating
- [ ] **In-app purchase rules:** If monetizable, follows store guidelines (no linking to external payment)
- [ ] **Minimum OS support:** Feature doesn't raise the minimum OS version without deliberate decision

### Release Process

- [ ] **Staged rollout configured:** Android Play Console staged rollout (not full release)
- [ ] **TestFlight/Play Console beta tested:** At least one internal tester has verified the feature on a real device
- [ ] **Crash-free rate monitored:** Baseline crash-free rate recorded before release for comparison
- [ ] **Revert plan documented:** Team knows how to disable the feature server-side within minutes

## Beta Testing Checklist

Before creating a PR for a mobile feature:

- [ ] Tested on minimum supported iOS version
- [ ] Tested on minimum supported Android API level
- [ ] Tested on small screen (iPhone SE / compact Android)
- [ ] Tested on large screen (iPad / tablet)
- [ ] Tested with slow network (3G simulation)
- [ ] Tested with no network (airplane mode)
- [ ] Tested with accessibility enabled (VoiceOver / TalkBack)
- [ ] Feature flag on/off transitions work without restart
- [ ] Deep links into the feature work from cold start
