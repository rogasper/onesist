# Error Catalog & Standardization

Standard error format and code catalog for consistent API error responses.

---

## Error Envelope

All error responses use the same JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields failed validation",
    "details": [
      {
        "field": "email",
        "message": "Email format is invalid",
        "value": null
      }
    ],
    "traceId": "abc-123-def-456",
    "timestamp": "2026-04-15T08:30:00Z"
  }
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error.code` | string | Yes | Machine-readable error code (see catalog below) |
| `error.message` | string | Yes | Human-readable summary |
| `error.details` | array | Conditional | Field-level validation errors (for 422) or additional context |
| `error.traceId` | string | Recommended | Correlation ID for debugging / log lookup |
| `error.timestamp` | string | Recommended | ISO 8601 timestamp of error |

### Simple Error (no details)

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User with id 'abc-123' not found",
    "traceId": "abc-123-def-456",
    "timestamp": "2026-04-15T08:30:00Z"
  }
}
```

---

## Error Code Naming Convention

Format: `SCREAMING_SNAKE_CASE`

**Pattern:** `{CATEGORY}_{SPECIFIC_ERROR}`

| Category | Prefix | Examples |
|----------|--------|----------|
| Validation | `VALIDATION_` | `VALIDATION_ERROR`, `VALIDATION_REQUIRED_FIELD` |
| Authentication | `AUTH_` | `AUTH_INVALID_TOKEN`, `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_CREDENTIALS` |
| Authorization | `FORBIDDEN_` | `FORBIDDEN_ACCESS`, `FORBIDDEN_ROLE_INSUFFICIENT` |
| Resource | `RESOURCE_` | `RESOURCE_NOT_FOUND`, `RESOURCE_ALREADY_EXISTS` |
| Business Logic | `BUSINESS_` | `BUSINESS_RULE_VIOLATION`, `BUSINESS_MAX_LIMIT_REACHED` |
| Conflict | `CONFLICT_` | `CONFLICT_EMAIL_EXISTS`, `CONFLICT_VERSION_MISMATCH` |
| Rate Limit | `RATE_LIMIT_` | `RATE_LIMIT_EXCEEDED`, `RATE_LIMIT_ACCOUNT_LOCKED` |
| System | `SYSTEM_` | `SYSTEM_INTERNAL_ERROR`, `SYSTEM_SERVICE_UNAVAILABLE` |
| Integration | `INTEGRATION_` | `INTEGRATION_EMAIL_FAILED`, `INTEGRATION_PAYMENT_ERROR` |

---

## HTTP Status Code Mapping

### Client Errors (4xx)

| Status | When to Use | Typical Error Codes |
|--------|-------------|-------------------|
| **400** | Malformed request, invalid JSON, bad params | `VALIDATION_ERROR`, `VALIDATION_INVALID_FORMAT` |
| **401** | Missing or invalid auth token | `AUTH_INVALID_TOKEN`, `AUTH_TOKEN_EXPIRED` |
| **403** | Valid auth but insufficient permission | `FORBIDDEN_ACCESS`, `FORBIDDEN_ROLE_INSUFFICIENT` |
| **404** | Resource not found | `RESOURCE_NOT_FOUND` |
| **409** | Conflict (duplicate, version mismatch) | `CONFLICT_EMAIL_EXISTS`, `CONFLICT_VERSION_MISMATCH` |
| **422** | Valid JSON but business rule violation | `BUSINESS_RULE_VIOLATION`, `VALIDATION_REQUIRED_FIELD` |
| **429** | Rate limit exceeded | `RATE_LIMIT_EXCEEDED`, `RATE_LIMIT_ACCOUNT_LOCKED` |

### Server Errors (5xx)

| Status | When to Use | Typical Error Codes |
|--------|-------------|-------------------|
| **500** | Unexpected server error | `SYSTEM_INTERNAL_ERROR` |
| **502** | Upstream service error | `SYSTEM_SERVICE_UNAVAILABLE` |
| **503** | Service temporarily unavailable | `SYSTEM_MAINTENANCE` |

**Rule:** Never expose stack traces or internal details in 5xx responses.

---

## Validation Error Format (422 / 400)

For field-level validation errors, use `details` array:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Email format is invalid",
        "value": null
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters with uppercase, lowercase, and number",
        "value": null
      },
      {
        "field": "phone_number",
        "message": "Phone number must start with 08 and be 10-13 digits",
        "value": "12345"
      }
    ]
  }
}
```

### Detail Object

| Field | Type | Description |
|-------|------|-------------|
| `field` | string | JSON path of invalid field (e.g., `"address.city"`) |
| `message` | string | Human-readable error for this specific field |
| `value` | any | The invalid value received (`null` if sensitive) |

---

## Common Error Codes Catalog

### Authentication & Authorization

| Code | HTTP | Message Template |
|------|------|-----------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | "Invalid email or password" |
| `AUTH_INVALID_TOKEN` | 401 | "Invalid or malformed authentication token" |
| `AUTH_TOKEN_EXPIRED` | 401 | "Authentication token has expired" |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | "Invalid or expired refresh token" |
| `FORBIDDEN_ACCESS` | 403 | "You do not have permission to access this resource" |
| `FORBIDDEN_ROLE_INSUFFICIENT` | 403 | "Role '{role}' does not have permission for this action" |
| `RATE_LIMIT_ACCOUNT_LOCKED` | 429 | "Account locked due to too many failed attempts. Try again in {minutes} minutes" |

### Resource

| Code | HTTP | Message Template |
|------|------|-----------------|
| `RESOURCE_NOT_FOUND` | 404 | "{Resource} with id '{id}' not found" |
| `RESOURCE_ALREADY_EXISTS` | 409 | "{Resource} already exists" |
| `CONFLICT_EMAIL_EXISTS` | 409 | "Email '{email}' is already registered" |
| `CONFLICT_VERSION_MISMATCH` | 409 | "Resource was modified by another request. Please refresh and retry" |

### Business Logic

| Code | HTTP | Message Template |
|------|------|-----------------|
| `BUSINESS_RULE_VIOLATION` | 422 | "Operation violates business rule: {rule}" |
| `BUSINESS_INVALID_STATUS_TRANSITION` | 422 | "Cannot transition from '{current}' to '{target}' status" |
| `BUSINESS_MAX_LIMIT_REACHED` | 422 | "Maximum limit of {limit} reached for {resource}" |
| `BUSINESS_OPERATION_NOT_ALLOWED` | 422 | "This operation is not allowed in the current state" |

### Validation

| Code | HTTP | Message Template |
|------|------|-----------------|
| `VALIDATION_ERROR` | 400 | "Request validation failed" (+ details array) |
| `VALIDATION_REQUIRED_FIELD` | 422 | "Field '{field}' is required" |
| `VALIDATION_INVALID_FORMAT` | 400 | "Field '{field}' has invalid format" |
| `VALIDATION_VALUE_TOO_LONG` | 400 | "Field '{field}' exceeds maximum length of {max}" |
| `VALIDATION_VALUE_OUT_OF_RANGE` | 400 | "Field '{field}' must be between {min} and {max}" |

### System & Integration

| Code | HTTP | Message Template |
|------|------|-----------------|
| `RATE_LIMIT_EXCEEDED` | 429 | "Rate limit exceeded. Retry after {seconds} seconds" |
| `SYSTEM_INTERNAL_ERROR` | 500 | "An unexpected error occurred. Please try again later" |
| `SYSTEM_SERVICE_UNAVAILABLE` | 503 | "Service temporarily unavailable. Please try again later" |
| `INTEGRATION_EMAIL_FAILED` | 502 | "Failed to send email. Please retry or contact support" |
| `INTEGRATION_PAYMENT_ERROR` | 502 | "Payment gateway error. Please retry or use another method" |

---

## Error vs Business Error

| Type | HTTP | Example | Action |
|------|------|---------|--------|
| **Technical error** | 4xx/5xx | Malformed JSON, server crash | Fix code / retry |
| **Business error** | 422 | "Order cannot be cancelled after shipping" | User changes input |
| **Expected conflict** | 409 | Email already registered | User uses different email |

**Rule:** Business errors (422) are **expected flows**, not bugs. They should have clear user-facing messages.

---

## Per-Project Customization

Create `assets/templates/api_error_envelope.json` with project-specific additions:

```json
{
  "project_specific_codes": {
    "SUBSCRIPTION_EXPIRED": { "http": 403, "message": "Your subscription has expired" },
    "INSUFFICIENT_CREDITS": { "http": 422, "message": "Insufficient credits to perform this action" }
  }
}
```

---

## Quality Checklist

- [ ] All endpoints document possible error codes
- [ ] Error envelope shape is consistent across all endpoints
- [ ] No sensitive data in error messages (no stack traces, no internal IDs)
- [ ] Validation errors include field-level details
- [ ] Error codes use consistent naming convention (SCREAMING_SNAKE_CASE)
- [ ] HTTP status codes match error semantics (409 for conflict, 422 for business rule)
- [ ] `traceId` present for debugging
- [ ] 5xx errors are generic (no internal details leaked)
