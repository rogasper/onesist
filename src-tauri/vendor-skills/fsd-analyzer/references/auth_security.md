# Authentication & Security Specification

Template for documenting auth flows, role/permission models, and security requirements derived from FSD.

---

## Auth Pattern Selection

| Pattern | Use When | Token Type |
|---------|----------|------------|
| **JWT (stateless)** | Standard REST API, mobile apps | Access token + Refresh token |
| **JWT + Redis blacklist** | Need token revocation (logout, deactivate) | JWT checked against Redis blacklist |
| **OAuth2 (Authorization Code)** | Third-party login (Google, SSO) | Bearer token from OAuth provider |
| **API Key** | Service-to-service, webhook callbacks | Static key in header |
| **Session-based** | Server-rendered apps, strict security | Session cookie + CSRF token |

Document the chosen pattern in `project_context.md`.

---

## JWT Token Specification

### Token Pair

| Token | Purpose | Expiry | Storage |
|-------|---------|--------|---------|
| **Access Token** | API authentication | Short (15min - 24h) | Memory (FE) / Secure storage (mobile) |
| **Refresh Token** | Obtain new access token | Long (7d - 30d) | HttpOnly cookie or secure storage |

### JWT Payload

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "admin",
  "permissions": ["users:read", "users:write"],
  "iat": 1713168000,
  "exp": 1713254400,
  "iss": "your-app-name",
  "jti": "unique-token-id"
}
```

### Refresh Flow

```
1. Client sends POST /auth/refresh with refresh token
2. Server validates refresh token
3. If valid → return new access token + new refresh token (rotation)
4. If invalid/expired → 401, client must re-login
5. Old refresh token invalidated (prevents reuse)
```

### Token Revocation

| Event | Action |
|-------|--------|
| User logout | Add access token JTI to blacklist (until expiry) + delete refresh token |
| User deactivated | Blacklist all tokens for user (via Redis `user:{id}:tokens:*`) |
| Password changed | Blacklist all tokens for user |
| Security breach | Rotate JWT secret (invalidates all tokens) |

---

## Role-Permission Matrix

### Template

```markdown
## Role-Permission Matrix

| Permission | Admin | User (own) | User (others) | Guest |
|------------|-------|------------|---------------|-------|
| users:list | ✅ | ❌ | ❌ | ❌ |
| users:read | ✅ | ✅ | ❌ | ❌ |
| users:create | ✅ | ❌ | ❌ | ❌ |
| users:update | ✅ | ✅ | ❌ | ❌ |
| users:delete | ✅ | ❌ | ❌ | ❌ |
| users:activate | ✅ | ❌ | ❌ | ❌ |
| profile:read | ✅ | ✅ (own) | ❌ | ❌ |
| profile:update | ✅ | ✅ (own) | ❌ | ❌ |
```

### Permission Naming Convention

Format: `{resource}:{action}`

| Action | Meaning |
|--------|---------|
| `list` | View list of resources |
| `read` | View single resource detail |
| `create` | Create new resource |
| `update` | Modify existing resource |
| `delete` | Remove resource (soft/hard) |
| `activate` | Change status (activate/deactivate) |
| `export` | Download/export data |

### Ownership Check

When permission is scoped to "own" (e.g., `profile:update`):

```
1. Extract user_id from JWT
2. Compare with target resource user_id
3. If match → allow
4. If not match AND user has admin permission → allow
5. Otherwise → 403 Forbidden
```

---

## Security Requirements

### Password Policy

| Rule | Value |
|------|-------|
| Minimum length | 8 characters |
| Must contain | Uppercase, lowercase, digit |
| Must not contain | Username, email, common passwords |
| Hashing algorithm | bcrypt (cost factor ≥ 12) |
| Max login attempts | 5 |
| Lock duration | 15 minutes |
| Password history | Last 5 passwords (optional) |

### Brute Force Protection

```markdown
1. Track failed login attempts per email + IP
2. After 5 failures → lock account for 15 min
3. Incremental backoff: 5→15min, 10→1h, 20→24h
4. Notify user via email after 5+ failures
5. Admin can manually unlock
```

### Rate Limiting

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| Login / Register | 5 requests | 1 minute |
| Password reset | 3 requests | 1 minute |
| General API | 100 requests | 1 minute |
| Export / heavy operations | 10 requests | 1 minute |

### Data Protection

| Category | Rule |
|----------|------|
| **PII fields** | Never log plain text; mask in responses when not needed |
| **Password** | Hash only (never decryptable); never return in any response |
| **Token** | Never expose in URL; use header or HttpOnly cookie |
| **Sensitive data** | Encrypt at rest for: national ID, financial data, health data |
| **Audit log** | Log who accessed what PII, when (compliance requirement) |

### Input Validation

| Type | Rules |
|------|-------|
| String | Max length, allowed characters, sanitize XSS |
| Email | RFC 5322 format + MX record check (optional) |
| Phone | Country-specific format regex (e.g., `^08[0-9]{8,11}$` for Indonesia) |
| UUID | Validate format v4 |
| Numeric | Min/max range, integer vs float |
| Date | ISO 8601, valid range, not future/past as needed |
| File upload | Max size, allowed MIME types, virus scan |

---

## Auth Flow Documentation Template

Document this per endpoint group in `spec_api.md`:

```markdown
### Auth Requirements: {Module}

**Authentication:** Required (JWT Bearer token)
**Authorization:** Role-based (see matrix)

**Flow:**
1. Client includes `Authorization: Bearer {token}` header
2. API Gateway validates token signature + expiry
3. Check user role against required permission
4. If ownership check needed → compare `token.sub` with resource `user_id`
5. On failure → 401 (invalid/expired token) or 403 (insufficient permission)

**Public endpoints (no auth):**
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/forgot-password

**Admin-only endpoints:**
- GET /users (list all)
- PATCH /users/{id}/status (activate/deactivate)
```

---

## CORS & Headers

```
Access-Control-Allow-Origin: {allowed_origins}
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Accept
Access-Control-Max-Age: 86400
Access-Control-Allow-Credentials: true
```

## Security Headers (Response)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
X-XSS-Protection: 1; mode=block
```

---

## Quality Checklist

- [ ] Auth pattern documented and consistent across all endpoints
- [ ] Role-permission matrix covers all actions in FSD
- [ ] Ownership checks documented for user-scoped resources
- [ ] Password policy meets security requirements
- [ ] Brute force protection defined for login
- [ ] Rate limiting configured per endpoint group
- [ ] Sensitive fields never returned in response (password, hash, etc.)
- [ ] Input validation rules documented per field type
- [ ] CORS policy configured for frontend origin
- [ ] Security headers present in all responses
- [ ] Token revocation flow documented
