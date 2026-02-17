# Web Platform — Lifecycle Adjustments

Adjustments to the feature development lifecycle when the project is a web application.

**Core principle:** Deployments are fast and reversible. A bad deploy is reverted in seconds. This means the lifecycle can be lighter on rollback planning and feature flags, but shouldn't skip them entirely.

## Lifecycle Step Adjustments

| Step | Status | Notes |
|------|--------|-------|
| Feature flags | Recommended | Useful for gradual rollouts and A/B testing, not strictly required |
| API contract testing | Good practice | Important if the web app has mobile clients or third-party API consumers |
| Migration dry-run | Recommended | Important for large tables or destructive migrations, skippable for small additions |
| Rollback planning | Standard | Usually "revert the Vercel/Netlify deploy" — document exceptions |
| Beta testing | Optional | Staging environment or preview deploy serves this purpose |
| App store review | N/A | Not applicable |
| Device matrix testing | Browser testing | Test major browsers (Chrome, Firefox, Safari) and mobile viewport |

## Design Document — Web-Specific Sections

### Browser Compatibility (When relevant)

```markdown
## Browser Compatibility

- **Target browsers:** [list, e.g., "last 2 versions of Chrome, Firefox, Safari, Edge"]
- **Known limitations:** [features that don't work in specific browsers]
- **Polyfills needed:** [list, or "none"]
```

### SEO Considerations (When relevant)

```markdown
## SEO Considerations

- **New pages indexed:** [yes/no — if yes, meta tags and OG tags needed]
- **URL structure:** [follows existing patterns, no conflicts with existing routes]
- **Server rendering:** [SSR/SSG/ISR — which and why]
```

## Verification Checks — Web-Specific

### Performance

- [ ] **Core Web Vitals:** New feature doesn't degrade LCP, FID, or CLS
- [ ] **Bundle size:** New dependencies don't significantly increase client bundle
- [ ] **Lazy loading:** Heavy components or routes use dynamic imports
- [ ] **Image optimization:** Images use Next.js Image component or equivalent

### Security

- [ ] **CSP headers:** New inline scripts or external resources are allowed by Content Security Policy
- [ ] **CORS:** New API routes called from client have appropriate CORS headers
- [ ] **XSS prevention:** User input is sanitized before rendering
- [ ] **CSRF protection:** State-changing requests are protected

### Accessibility

- [ ] **Keyboard navigation:** New interactive elements are keyboard accessible
- [ ] **Screen readers:** Semantic HTML, ARIA labels where needed
- [ ] **Color contrast:** Text meets WCAG AA contrast ratio (4.5:1)
- [ ] **Focus management:** Modal and dialog focus is trapped and restored correctly

### Responsive Design

- [ ] **Mobile viewport:** Feature works on 375px width (iPhone SE)
- [ ] **Tablet viewport:** Feature works on 768px width
- [ ] **Desktop:** Feature works on 1280px+ width
- [ ] **Touch targets:** Interactive elements are at least 44x44px on mobile

## Rollback Strategy

Web rollback is typically straightforward:

1. **Vercel/Netlify:** Redeploy previous commit or use "instant rollback" feature
2. **Database migrations:** Plan forward-only migrations or ensure reversibility
3. **Feature flags:** If using flags, disable the feature server-side
4. **CDN cache:** Invalidate if static assets were updated

**When rollback is NOT simple:**
- Database migration that drops a column or changes data
- Third-party integration that has already sent webhooks or emails
- User data that has already been created under the new schema
