# Frontend Task Cards (task_fe.md)

Template for **frontend-specific** developer task cards. Use alongside `references/task_format.md` for backend tasks, or standalone when the FSD primarily affects the frontend.

---

## When to Create FE Tasks

| Signal | Action |
|--------|--------|
| FSD describes new pages/screens | Create FE task per page |
| FSD describes UI changes to existing pages | Create FE update task |
| API spec has new endpoints that FE needs to consume | Create FE integration task |
| FSD mentions filters, search, pagination in UI | Create FE data-table task |
| FSD mentions multi-step forms/wizards | Create FE form task |

---

## Task Card Structure

### Summary Table

```markdown
## Task FE-{n}: {Page/Feature Name}

| Field | Detail |
|-------|--------|
| Screen/Page | {route path or page name} |
| Type | New Page / Update / Bug Fix |
| Figma Reference | {link} or "N/A" |
| Priority | High / Medium / Low |
| Story Point | {1/2/3/5/8} (1 SP = 4 hours) |
| Depends On | Task IDs (BE endpoints must be ready) |
| Status | New / In Progress / Ready for QA |
```

### Detail Sections

#### 1. Page Description

```markdown
### Page Description

Brief description of what this page does and its purpose in the user flow.

**Route:** `/admin/users`
**Access:** Admin only (redirect to login if not authenticated)
**Layout:** Admin layout with sidebar
```

#### 2. Component Breakdown

```markdown
### Component Breakdown

| Component | Type | Description |
|-----------|------|-------------|
| `UserListPage` | Page | Main container, handles data fetching |
| `UserTable` | Organism | Data table with sort/filter/pagination |
| `UserFilter` | Molecule | Filter sidebar/dropdown (role, status, date range) |
| `UserSearchBar` | Molecule | Search input (by name, email) |
| `UserDetailModal` | Organism | Modal showing user details + login history |
| `StatusBadge` | Atom | Badge component for user status |
| `Pagination` | Molecule | Reusable pagination component |
```

#### 3. API Integration

```markdown
### API Integration

| Action | Method | Endpoint | Trigger | Expected Response |
|--------|--------|----------|---------|-------------------|
| Load users | GET | `/api/v1/users?page=1&perPage=20` | On mount / filter change | Paginated user list |
| Search users | GET | `/api/v1/users?search={query}` | On search submit | Paginated user list |
| Filter users | GET | `/api/v1/users?role={role}&status={status}` | On filter apply | Paginated user list |
| Get user detail | GET | `/api/v1/users/{id}` | On row click | Single user object |
| Change status | PATCH | `/api/v1/users/{id}/status` | On toggle click | Updated user object |
| Export users | GET | `/api/v1/users/export?format=xlsx` | On export click | File download |

### Request/Response Examples

#### GET /api/v1/users (List)

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "John Doe",
      "role": "user",
      "status": "active",
      "createdAt": "2026-04-15T08:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 20,
    "totalPages": 5,
    "totalItems": 95,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```
```

#### 4. State Management

```markdown
### State Management

| State | Type | Location | Description |
|-------|------|----------|-------------|
| `users` | Global / Local | Store or component | List of users from API |
| `pagination` | Local | Component | page, perPage, total |
| `filters` | Local | Component | Current filter values |
| `searchQuery` | Local | Component | Search input value |
| `selectedUser` | Local | Component | User for detail modal |
| `isLoading` | Local | Component | Loading state for table |
| `isModalOpen` | Local | Component | Detail modal visibility |

### Data Flow

1. Component mounts → dispatch fetchUsers({ page: 1, perPage: 20 })
2. API response → update `users` state + `pagination` meta
3. User changes filter → dispatch fetchUsers({ ...filters, page: 1 })
4. User clicks page 3 → dispatch fetchUsers({ page: 3, ...filters })
5. User clicks row → set `selectedUser` → open modal
6. User toggles status → PATCH → refresh list
```

#### 5. UI States

```markdown
### UI States

| State | Display |
|-------|---------|
| **Loading** | Skeleton table rows or spinner |
| **Empty** | "No users found" illustration + "Try adjusting filters" |
| **Error** | Error banner with retry button |
| **Success** | Table with data, pagination controls |
| **Search active** | Highlight matching text in results |
| **Filter active** | Badge showing active filter count, "Clear filters" button |

### Error Handling

| Error Code | UI Response |
|-----------|-------------|
| 401 | Redirect to login page |
| 403 | Show "Access Denied" page |
| 404 | Show "Not Found" page |
| 429 | Show toast: "Too many requests. Please wait." |
| 500 | Show error banner with "Retry" button |
| Network error | Show offline banner with auto-retry |
```

#### 6. Acceptance Criteria

```markdown
### Acceptance Criteria

- [ ] Page loads with paginated user table (20 rows default)
- [ ] Sorting works by clicking column headers (email, name, created_at)
- [ ] Filter by role and status works correctly
- [ ] Date range filter works (created_at range)
- [ ] Search by name and email works with debounce (300ms)
- [ ] Clicking a row opens detail modal with user info + last 10 logins
- [ ] Admin can activate/deactivate user with confirmation dialog
- [ ] Deactivation requires reason (textarea, min 10 chars)
- [ ] Export button downloads XLSX file
- [ ] Loading skeleton shows during API calls
- [ ] Empty state shows when no results
- [ ] Error state shows with retry on API failure
- [ ] Responsive: table scrolls horizontally on mobile
- [ ] Page is accessible (keyboard nav, ARIA labels)
```

---

## FE Task Template (Minimal)

```markdown
## Task FE-{n}: {Title}

| Field | Detail |
|-------|--------|
| Screen | {route} |
| Type | {New/Update} |
| SP | {n} ({n×4}h) |
| Depends On | {BE task IDs} |

### Components
{List components}

### API Calls
{Table: action, method, endpoint, trigger}

### Acceptance Criteria
- [ ] {criteria 1}
- [ ] {criteria 2}
```

---

## FE + BE Task Dependency Pattern

```markdown
## Dependency Example

BE-T1: DB Migration for users table
  ↓
BE-T2: GET /api/v1/users (list endpoint)
  ↓
FE-T1: User List Page (depends on BE-T2)
  ↓
BE-T3: PATCH /api/v1/users/{id}/status
  ↓
FE-T2: User Status Toggle (depends on BE-T3 + FE-T1)
```

**Rule:** FE tasks should list which BE task IDs they depend on. This enables parallel planning (FE can start mock/stub while BE is in progress).

---

## Story Point Guide for FE Tasks

| SP | Hours | FE Criteria |
|----|-------|-------------|
| 1 SP | 4h | Simple static page, no API call, reuse existing components |
| 2 SP | 8h | Page with 1-2 API calls, standard table or form, no complex state |
| 3 SP | 12h | Page with multiple API calls, filters, search, pagination, modal |
| 5 SP | 20h | Complex page with multi-step form, state management, error handling |
| 8 SP | 32h | Full feature module (multiple pages, shared state, routing, integration) |

---

## Quality Checklist

- [ ] Every screen/page in FSD has an FE task
- [ ] API integration table maps to spec_api endpoints
- [ ] Component breakdown is implementation-ready
- [ ] UI states documented (loading, empty, error, success)
- [ ] Acceptance criteria are QA-testable
- [ ] Dependencies on BE tasks are explicit
- [ ] Story point estimate reflects complexity
- [ ] Figma reference included when available
- [ ] Responsive behavior documented
- [ ] Error handling per error code documented
