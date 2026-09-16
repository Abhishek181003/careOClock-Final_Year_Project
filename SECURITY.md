# CareOClock Backend Security Specification (Phase 10)

## 1. Architectural Security Overview & Threat Model

CareOClock is an elderly remote health-monitoring platform handling confidential physiological telemetry, medication adherence records, and diagnostic reports. The security architecture enforces defense-in-depth across the transport, application, network, and database layers:

- **Strict Server-Side Role-Based Access Control (NFR1)**: Zero client-side trust. All endpoints validate cryptographically signed JWT tokens and enforce role-based authorization (`patient`, `doctor`, `caregiver`).
- **Resource-Level Authorization (C-1 IDOR Defense)**: Direct object reference queries require verified multi-party clinical relationships (patient self, assigned doctor, or actively linked caregiver). Unrelated access attempts are rejected with uniform `404 Not Found` responses to defeat user enumeration.
- **Statutory Privacy Framework**: Architecture complies with the Digital Personal Data Protection (DPDP) Act, 2023 (Sections 11 & 12) for data subject access, portability, and audited erasure tracking.

---

## 2. HTTP Security Headers (Helmet.js)

The Express gateway enforces hardened HTTP security headers on all incoming and outgoing connections via Helmet.js:

- **Content-Security-Policy (CSP)**: Restricts script, style, font, and connect origins to `'self'`. Disallows insecure inline scripts and disables object execution (`object-src 'none'`).
- **X-Frame-Options (`DENY`)**: Completely forbids framing across all domains to prevent clickjacking attacks.
- **Strict-Transport-Security (HSTS)**: Mandates HTTPS for a minimum of 1 year (`max-age=31536000`), enforcing `includeSubDomains` and `preload`.
- **X-Content-Type-Options (`nosniff`)**: Prohibits MIME type sniffing to mitigate drive-by download and malicious media execution vectors.
- **Referrer-Policy (`strict-origin-when-cross-origin`)**: Protects URL-embedded query data from leaking across origin boundaries.
- **X-XSS-Protection (`1; mode=block`)**: Activates legacy browser cross-site scripting filters.
- **X-DNS-Prefetch-Control (`off`)**: Prevents speculative DNS prefetching from leaking user health-browsing patterns.

---

## 3. Strict CORS Policy (Zero Wildcards)

- **Prohibition of Wildcard (`*`)**: Wildcard origins are strictly forbidden in both production and development configurations.
- **Explicit Whitelist Verification**: Incoming `Origin` headers are validated against an explicit whitelist of trusted frontend origins (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:8000`, `http://127.0.0.1:8000`, `http://localhost:5000`, `http://127.0.0.1:5000` or `process.env.ALLOWED_ORIGINS`).
- **Unauthorized Origin Handling**: Requests originating from unapproved domains are rejected with `403 Forbidden` (`CORS blocked for unauthorized origin`).
- **Credentials Handling**: Configured with `credentials: true` and preflight response caching (`maxAge: 86400`).

---

## 4. Rate Limiting (OWASP API4:2023)

To mitigate brute-force credential stuffing, dictionary attacks, and denial-of-service (DoS) vectors, multi-tier rate limiting is enforced:

| Tier | Endpoints | Window | Max Requests | Violation Action |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication Limiter** | `/api/auth/login`, `/api/auth/register` | 15 Minutes | 30 requests / IP | `429 Too Many Requests` (15m lockout) |
| **Clinical Limiter** | `/api/clinical/*`, `/api/medicines/*`, `/api/reports/*` | 1 Minute | 120 requests / IP | `429 Too Many Requests` |
| **Global API Limiter** | All `/api/*` endpoints | 15 Minutes | 300 requests / IP | `429 Too Many Requests` |

*Note: In automated test environments (`NODE_ENV === 'test'`), rate limits are bypassed unless the request carries the explicit verification header `x-test-rate-limit: true`.*

---

## 5. Input Sanitization & NoSQL Injection Defense

- **Recursive Key Inspection**: The global `sanitizeInput` middleware scans every incoming request body (`req.body`), query string (`req.query`), and route parameter (`req.params`).
- **Forbidden Operators**: Any object key that starts with `$` (MongoDB query operators like `$gt`, `$ne`, `$where`, `$regex`, `$in`) or contains a period `.` (path traversal notation) is detected as an injection attempt.
- **Strict Rejection**: Injection attempts are rejected immediately with `400 Bad Request`:
  ```json
  {
    "error": "Malformed or prohibited query operator detected",
    "message": "Input contains forbidden NoSQL injection characters ('$' or '.')"
  }
  ```
- **Security Audit Logging**: Every detected injection attempt is recorded in the security audit collection with IP, user-agent, route, and payload origin.

---

## 6. Dedicated Clinical Audit Logging (`AuditLog`)

Every state-changing clinical action produces an append-only audit trail in MongoDB recording:
- **Who**: Requesting `userId` and authenticated `role`.
- **What**: Canonical action enum (`CLINICAL_WRITE_VITALS`, `CLINICAL_WRITE_PRESCRIPTION`, `MEDICINE_CREATED`, `MEDICINE_DOSE_LOGGED`, `REPORT_UPLOADED`, `REPORT_DELETED`).
- **When**: Cryptographic server timestamp (`Date.now`).
- **Details**: Resource identifiers, affected patient ID, medication ID, or document metadata.
- **Client Metadata**: Remote IP address and `User-Agent`.

Audit logs are indexed on `{ userId: 1, action: 1 }` and `{ timestamp: -1 }` for forensic tracing and regulatory auditing.

---

## 7. Privacy by Design: Identity & Telemetry Decoupling

To prevent correlation and identity theft in the event of partial data leakage, CareOClock strictly decouples personal identity from clinical telemetry across both database schemas and API responses:

1. **Database Schema Segregation**:
   - **Identity Profile (`User`)**: Stores authentication credentials, full name (`displayName`), email, and password hash.
   - **Clinical Baseline (`Patient`)**: Stores age, biological sex, height, weight, and clinical conditions. References `userId` and `assignedDoctorId` as abstract ObjectIds.
   - **Health Telemetry (`Vitals`, `Prediction`, `Medicine`, `MedicalReport`)**: Stores raw vitals, risk tiers, medication inventories, and diagnostic files. These collections never store patient names, email addresses, or phone numbers.
2. **API Layer Isolation**:
   - Caregivers querying vitals history (`GET /api/clinical/vitals`) receive raw readings linked only to abstract patient ObjectIds without contact credentials.
   - Caregivers checking user status (`GET /api/auth/me`) receive only the patient's `displayName` — never raw health readings joined with contact details.
   - Combined identity and health readings are restricted strictly to the assigned treating physician (`doctor`) who holds verified clinical authorization for both.

---

## 8. Automated Security Verification

The automated security test suite (`server/tests/phase10_security.test.js`) verifies all Phase 10 controls:

```bash
# Run Phase 10 Security Suite
cd server
node --test tests/phase10_security.test.js

# Run Full Regression Suite
npm test
```
