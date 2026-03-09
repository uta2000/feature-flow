# Tool Selector Heuristics — Unit Tests

## Feature Count Detection Tests

### Test: Single feature detected
Input: "add a logout button"
Expected: feature_count = 1, signal = 0

### Test: Two features detected
Input: "build payments and invoicing"
Expected: feature_count = 2, signal = +0.1

### Test: Four features detected
Input: "create payments, billing, analytics, dashboards"
Expected: feature_count = 4, signal = +0.3

### Test: Complex description with 5 features
Input: "build payments system, billing, invoices, subscription management, and admin dashboard"
Expected: feature_count >= 5, signal = +0.3

## Scope Keyword Detection Tests

### Test: "from scratch" detected
Input: "build complete app from scratch"
Expected: scope_keyword_found = true, signal = +0.4

### Test: "complete app" detected
Input: "build complete app for SaaS"
Expected: scope_keyword_found = true, signal = +0.4

### Test: "full system" detected
Input: "implement full system for payment processing"
Expected: scope_keyword_found = true, signal = +0.4

### Test: No scope keywords
Input: "add a new button"
Expected: scope_keyword_found = false, signal = 0

## Timeline Detection Tests

### Test: Hours timeline (feature-flow)
Input: "build this in a few hours"
Expected: timeline_type = "hours", signal = -0.1

### Test: Weeks timeline (GSD)
Input: "build this over 2-3 weeks"
Expected: timeline_type = "weeks", signal = +0.2

### Test: Months timeline (GSD)
Input: "build this in a month"
Expected: timeline_type = "months", signal = +0.2

### Test: No timeline mentioned
Input: "build a feature"
Expected: timeline_type = "none", signal = 0

## Confidence Scoring Tests

### Test: Simple feature (1 feature, no keywords, hours)
Input: "add logout button in a couple hours"
Expected: confidence = 0.0-0.2 (🟢 feature-flow)

### Test: Multi-feature moderate complexity
Input: "build payments and billing features over 2 weeks"
Expected: confidence = 0.4-0.6 (🟡 GSD-recommended)

### Test: Large from-scratch project
Input: "build complete SaaS from scratch with payments, billing, analytics, dashboards over 2 months"
Expected: confidence = 0.7+ (🔴 GSD-strongly-recommended)

### Test: Explicit 5+ features
Input: "create feature A, feature B, feature C, feature D, feature E"
Expected: confidence = 0.3+ (at least in neutral/GSD range)
