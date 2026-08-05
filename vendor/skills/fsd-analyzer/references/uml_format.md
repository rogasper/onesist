# UML Diagram Output Format (PlantUML)

Generate **PlantUML** diagrams from FSD so users can paste them into [PlantUML](https://plantuml.com/plantuml), [PlantText](https://www.planttext.com/), or any PlantUML-compatible renderer.

All UML output goes inside a **` ```plantuml `** fenced code block for easy copy-paste.

## Diagram Types

### 1. Sequence Diagram (API / Interaction Flow)

Use for: endpoint flow, service-to-service interaction, user journey.

```plantuml
@startuml
autonumber
skinparam maxMessageSize 150
skinparam ParticipantPadding 10

actor "User" as U
participant "API Gateway" as API
participant "Service" as S
database "DB" as DB

U -> API: POST /api/v1/users
activate API
API -> API: Validate JWT & role
API -> S: createUser(payload)
activate S
S -> S: Validate input (email unique, password policy)
S -> DB: INSERT INTO users (...)
activate DB
DB --> S: OK (user_id)
deactivate DB
S --> API: 201 { id, email, full_name }
deactivate S
API --> U: 201 Created
deactivate API

== Error: duplicate email ==
U -> API: POST /api/v1/users (duplicate email)
activate API
API -> S: createUser(payload)
activate S
S -> DB: INSERT ...
activate DB
DB --> S: ERROR unique_violation
deactivate DB
S --> API: 409 { error: "EMAIL_ALREADY_EXISTS" }
deactivate S
API --> U: 409 Conflict
deactivate API
@enduml
```

### 2. Class Diagram (Entity / Data Model)

Use for: entity relationships, alternative visual for ERD.

```plantuml
@startuml
skinparam classAttributeIconSize 0
skinparam linetype ortho

class users {
  * id : UUID <<PK>>
  --
  email : VARCHAR(255) <<UNIQUE>>
  password_hash : VARCHAR(255)
  full_name : VARCHAR(100)
  phone_number : VARCHAR(20)
  role : ENUM(admin, user)
  status : ENUM(active, inactive, pending)
  address : JSONB
  --
  created_at : TIMESTAMP
  updated_at : TIMESTAMP
  deleted_at : TIMESTAMP <<nullable>>
}

class login_history {
  * id : UUID <<PK>>
  --
  user_id : UUID <<FK>>
  ip_address : VARCHAR(45)
  user_agent : TEXT
  login_time : TIMESTAMP
  status : ENUM(success, failed)
}

class email_verification {
  * id : UUID <<PK>>
  --
  user_id : UUID <<FK>>
  token : VARCHAR(255) <<UNIQUE>>
  expires_at : TIMESTAMP
  verified_at : TIMESTAMP <<nullable>>
}

users "1" -- "0..*" login_history : "has"
users "1" -- "0..*" email_verification : "has"
@enduml
```

### 3. Activity Diagram (Business Flow / Workflow)

Use for: multi-step business process, approval flow, state-dependent logic.

```plantuml
@startuml
start

:User submits registration form;
:Validate input (email, password, phone);

if (Valid?) then (No)
  :Return 400 validation errors;
  stop
else (Yes)
  :Check email uniqueness;
  if (Email exists?) then (Yes)
    :Return 409 EMAIL_ALREADY_EXISTS;
    stop
  else (No)
    :Hash password (bcrypt);
    :INSERT INTO users;
    :Generate email verification token;
    :Send verification email;
    :Return 201 Created;
    stop
  endif
endif
@enduml
```

### 4. State Diagram (Entity Lifecycle)

Use for: status transitions, entity lifecycle (e.g. order status, user status).

```plantuml
@startuml
skinparam backgroundColor #FEFEFE

[*] --> pending : User registers

pending --> active : Email verified
pending --> inactive : Admin deactivates (cleanup)

active --> inactive : Admin deactivates
active --> active : User updates profile

inactive --> active : Admin reactivates
inactive --> inactive : Cannot login

active --> [*]
inactive --> [*]
@enduml
```

### 5. Component Diagram (System Architecture)

Use for: high-level system integration, microservices overview.

```plantuml
@startuml
skinparam componentStyle uml2

package "Frontend" {
  [Web App]
  [Mobile App]
}

package "Backend" {
  [API Gateway] as GW
  [User Service]
  [Notification Service]
  [Auth Service]
}

database "PostgreSQL" as DB
database "Redis" as Cache
cloud "Email Provider" as Email

[Web App] --> GW
[Mobile App] --> GW
GW --> [Auth Service]
GW --> [User Service]
GW --> [Notification Service]
[User Service] --> DB
[Auth Service] --> Cache
[Notification Service] --> Email
@enduml
```

### 6. Use Case Diagram

Use for: actor vs system capability mapping from FSD requirements.

```plantuml
@startuml
left to right direction
skinparam packageStyle rectangle

actor "User" as U
actor "Admin" as A

rectangle "User Management System" {
  usecase "Register" as UC1
  usecase "Login" as UC2
  usecase "View Profile" as UC3
  usecase "Update Profile" as UC4
  usecase "List Users" as UC5
  usecase "View User Detail" as UC6
  usecase "Activate/Deactivate User" as UC7
}

U --> UC1
U --> UC2
U --> UC3
U --> UC4
A --> UC2
A --> UC5
A --> UC6
A --> UC7
@enduml
```

## When to generate which diagram

| FSD Content | Diagram | Priority |
|-------------|---------|----------|
| Endpoint flow, API interaction | Sequence | **Always** (per endpoint group) |
| Data entities, relationships | Class | **Always** (alongside ERD/DBML) |
| Multi-step business process | Activity | When FSD has workflow/approval |
| Status transitions | State | When entity has lifecycle |
| System integrations | Component | When FSD mentions external systems |
| Actor capabilities | Use Case | When scoping with BA |

## Output rules

1. Each diagram type in its own **` ```plantuml `** fenced block.
2. Use `@startuml` / `@enduml` wrappers (required by PlantUML renderer).
3. Name relationships and transitions with **business meaning** (not just column names).
4. Include **error/alternative paths** in sequence and activity diagrams when FSD specifies them.
5. Match **entity/field names** exactly with ERD (consistency).
6. Match **endpoint paths** exactly with spec_api (consistency).
7. For large systems, split into **multiple diagrams** per module/feature rather than one giant diagram.

## File naming

| Diagram | Typical filename |
|---------|------------------|
| Sequence | `uml_sequence_<feature>.md` or inline in `spec_api.md` |
| Class | `uml_class_<feature>.md` or inline in `erd.md` |
| Activity | `uml_activity_<feature>.md` |
| State | `uml_state_<entity>.md` |
| Component | `uml_component_<system>.md` |
| Use Case | `uml_usecase_<module>.md` |

## Quality checklist

- [ ] Every endpoint group has a sequence diagram or is explicitly grouped
- [ ] Entity names and field names match ERD exactly
- [ ] Endpoint paths match spec_api exactly
- [ ] Error paths documented in sequence/activity when FSD specifies them
- [ ] Status values in state diagram match ERD enum/status column
- [ ] Diagrams are split per feature/module (not one giant diagram)
- [ ] Each diagram is in a ` ```plantuml ` fence with `@startuml` / `@enduml`
