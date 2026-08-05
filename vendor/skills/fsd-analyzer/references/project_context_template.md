# Project Context Template

Template for creating `project_context.md` in your project root. Fill this once per project so the SA agent has consistent conventions across all FSD sections.

---

## How to Use

1. Copy this template to your project root as `project_context.md`
2. Fill in values relevant to your project
3. `@`-reference it alongside FSD and master files in your prompts

**Prompt example:**

```
@project_context.md @MASTER_ERD.md @MASTER_SPEC_API.md @fsd_section_4.md
```

---

## Template

```markdown
# Project Context: {Project Name}

## General

| Field | Value |
|-------|-------|
| Project Name | {name} |
| Description | {one-line description} |
| Team | {team name / department} |
| SA | {name} |
| Start Date | {date} |

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend Language | {e.g., Node.js, Go, Java, Python} | {version} |
| Backend Framework | {e.g., Express, Gin, Spring Boot, FastAPI} | {version} |
| Database | {e.g., PostgreSQL, MySQL, MongoDB} | {version} |
| Cache | {e.g., Redis, Memcached} | {version} |
| Message Queue | {e.g., RabbitMQ, Kafka} | {version} |
| Frontend Framework | {e.g., React, Vue, Next.js} | {version} |
| State Management | {e.g., Redux, Zustand, Pinia} | {version} |
| Mobile | {e.g., React Native, Flutter, native} | {version} |
| API Style | REST / GraphQL / gRPC | — |
| ORM | {e.g., Prisma, TypeORM, Sequelize, GORM} | {version} |

## Environments

| Environment | URL Pattern | DB | Notes |
|-------------|-------------|----|-------|
| Development | `http://localhost:3000` | Local | — |
| Staging | `https://staging.example.com` | Staging DB | Mirrors prod schema |
| UAT | `https://uat.example.com` | UAT DB | BA/PO testing |
| Production | `https://api.example.com` | Prod DB | — |

## API Conventions

| Convention | Value |
|-----------|-------|
| Base URL | `/api/v1/` |
| Versioning | URI path (`/v1/`, `/v2/`) |
| JSON Field Naming | camelCase |
| URL Naming | kebab-case, plural resources |
| Auth Pattern | JWT Bearer token |
| Token Expiry | Access: {n} min, Refresh: {n} days |
| Response Envelope | `{ "data": ..., "meta": ... }` |
| Error Envelope | See `references/error_catalog.md` |
| Pagination | `page` / `perPage` / `meta` |
| Rate Limiting | {n} requests/minute per IP |

## Database Conventions

| Convention | Value |
|-----------|-------|
| Table Prefix | `mst_` (master), `trn_` (transaction), `ref_` (reference) |
| Column Naming | snake_case |
| Primary Key | UUID (auto-generated) |
| Audit Fields | `created_at`, `created_by`, `updated_at`, `updated_by` |
| Soft Delete | `deleted_at` (nullable timestamp) |
| Timestamps | `timestamptz` (UTC) |
| Enum Storage | `VARCHAR` with CHECK constraint or lookup table |
| JSON Storage | `JSONB` for flexible schema fields |

## Authentication & Authorization

| Field | Value |
|-------|-------|
| Auth Library | {e.g., passport.js, jose, spring security} |
| Password Hashing | bcrypt (cost factor: 12) |
| JWT Signing Algorithm | RS256 / HS256 |
| Role Storage | Column in users table / separate roles table |
| Permission Model | Role-based (RBAC) / Attribute-based (ABAC) |
| Token Storage (FE) | Memory (access) + HttpOnly cookie (refresh) |

## Third-Party Integrations

| Service | Purpose | API Docs | Environment |
|---------|---------|----------|-------------|
| {e.g., SendGrid} | Email delivery | {link} | All |
| {e.g., Midtrans} | Payment gateway | {link} | Staging + Prod |
| {e.g., AWS S3} | File storage | {link} | All |
| {e.g., Firebase} | Push notifications | {link} | Prod |

## Code Repository

| Field | Value |
|-------|-------|
| Repository | {URL} |
| Branch Strategy | {e.g., GitFlow, trunk-based} |
| Main Branch | {e.g., `main`, `master`} |
| CI/CD | {e.g., GitHub Actions, GitLab CI, Jenkins} |
| Deploy Method | {e.g., Docker, serverless, VM} |

## Naming Rules (Custom)

<!-- Add any project-specific naming rules below -->

| Item | Rule | Example |
|------|------|---------|
| Feature modules | {kebab-case} | `user-management/` |
| API endpoint files | {kebab-case} | `user-controller.ts` |
| Database migrations | {timestamp_name} | `20260415_add_phone_to_users.sql` |
| Task files | {task_fsd_name} | `task_fsd_user_mgmt.md` |
```

---

## Quality Checklist

- [ ] Tech stack matches actual project
- [ ] Database conventions documented (prefix, audit fields, soft delete)
- [ ] API conventions documented (naming, versioning, envelope)
- [ ] Auth pattern specified
- [ ] Third-party integrations listed with doc links
- [ ] Environments listed with URLs
- [ ] Team members who should review are identified
