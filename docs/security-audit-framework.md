# Shiftway Security Audit Framework (2026)

A comprehensive set of prompts and methodology for auditing Shiftway's cybersecurity from every angle.

---

## 🔐 Full Website Cybersecurity Audit Prompt Framework

### 1. Reconnaissance & Attack Surface
> *"Analyze the attack surface of [website]. List all exposed endpoints, subdomains, APIs, login portals, admin panels, and third-party integrations that could be entry points for attackers."*

### 2. Authentication & Authorization
> *"Review the authentication mechanisms of this site. Check for weak password policies, lack of MFA, insecure session tokens, JWT vulnerabilities, broken access controls, and privilege escalation risks."*

### 3. OWASP Top 10 (2021–2025)
> *"Test this website against the current OWASP Top 10 including injection attacks (SQL, NoSQL, LDAP), broken authentication, sensitive data exposure, XML external entities (XXE), SSRF, insecure deserialization, and security misconfiguration."*

### 4. Input Validation & Injection
> *"Identify all user input fields and check for SQL injection, XSS (stored, reflected, DOM-based), command injection, SSTI (Server-Side Template Injection), and path traversal vulnerabilities."*

### 5. Transport Layer Security
> *"Audit the TLS/SSL configuration. Check for outdated protocols (TLS 1.0/1.1), weak cipher suites, expired or self-signed certs, missing HSTS headers, and certificate pinning issues."*

### 6. Security Headers
> *"Review HTTP response headers for missing or misconfigured security headers: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and CORS policies."*

### 7. API Security
> *"Audit all REST/GraphQL/WebSocket APIs for improper authentication, excessive data exposure, lack of rate limiting, BOLA/IDOR vulnerabilities, mass assignment, and insecure direct object references."*

### 8. Third-Party & Supply Chain
> *"Identify all third-party scripts, CDNs, npm/pip packages, and plugins. Check for known CVEs, outdated versions, subresource integrity (SRI) issues, and supply chain attack vectors as of 2026."*

### 9. Cloud & Infrastructure
> *"Audit the hosting infrastructure. Check for S3 bucket misconfigurations, exposed cloud metadata endpoints (SSRF to 169.254.169.254), open ports, overly permissive IAM roles, and container escape risks."*

### 10. Sensitive Data Exposure
> *"Scan for exposed sensitive data: API keys in source code, debug endpoints left open, directory listings, error messages revealing stack traces, PII in URLs, and unencrypted data at rest."*

### 11. Business Logic Flaws
> *"Analyze the business logic for flaws: price manipulation, coupon/discount abuse, race conditions, workflow bypass, and insecure direct object references that could be exploited without traditional hacking."*

### 12. Denial of Service & Rate Limiting
> *"Check for missing rate limiting on login, registration, password reset, and API endpoints. Identify ReDoS vulnerabilities and resource-intensive operations that could be abused."*

### 13. Client-Side Security
> *"Audit client-side JavaScript for sensitive data in localStorage/sessionStorage, prototype pollution, insecure postMessage handling, and hardcoded credentials or secrets."*

### 14. CMS & Framework-Specific
> *"If using WordPress/React/Next.js/Django/etc., audit for framework-specific vulnerabilities, outdated plugins, default credentials, exposed admin routes, and known 2025–2026 CVEs."*

### 15. AI-Era Threats (2025–2026 specific)
> *"Check for prompt injection risks if AI chatbots are embedded. Audit for LLM data exfiltration, model inversion attacks, and indirect prompt injection via user-supplied content."*

### 16. Compliance & Privacy
> *"Review for GDPR, CCPA, and HIPAA compliance. Check cookie consent implementation, data retention policies, privacy policy accuracy, and right-to-erasure mechanisms."*

### 17. Penetration Test Report
> *"Compile all findings into a professional penetration testing report with: Executive Summary, Risk Ratings (Critical/High/Medium/Low), Technical Details, Proof of Concept, and Remediation Steps."*

---

## Pro Tip
For each category, follow up with:
> *"Now give me the exact payloads, tools (Burp Suite, OWASP ZAP, Nuclei, etc.), and step-by-step methodology to test each vulnerability."*

---

## Shiftway-Specific Concerns (Priority Order)

| # | Area | Risk | Notes |
|---|------|------|-------|
| 1 | JWT secret strength | HIGH | Must be strong in prod, not dev-secret |
| 2 | Rate limiting on /api/auth/* | HIGH | No rate limiting currently on login/register |
| 3 | CORS config | MEDIUM | Locked down in prod, verify APP_ALLOWED_ORIGINS |
| 4 | SQL injection | LOW | Using pg parameterized queries throughout |
| 5 | Twilio/Resend keys in .env | MEDIUM | Never commit .env, verify .gitignore |
| 6 | Role-based access | MEDIUM | Verify employee can't call manager-only endpoints |
| 7 | Invite token expiry | LOW | 48h expiry already implemented |
| 8 | Password hashing | LOW | bcrypt with cost 10, solid |

---

## Tools to Run Against Shiftway
- **OWASP ZAP** — automated scan against API endpoints
- **Nuclei** — template-based vulnerability scanner
- **Burp Suite** — manual API fuzzing
- **npm audit** — dependency CVE check (`npm audit` in root + server/)
- **truffleHog** — scan git history for leaked secrets
