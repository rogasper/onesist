# Comprehensive External MCP Server Integration & Security Architecture

## Overview
This Pull Request introduces a robust, production-grade Model Context Protocol (MCP) integration framework into **Onesist**, empowering agents to seamlessly discover, connect, test, and execute tools across external MCP servers (such as GitHub, Figma, Miro, Monday, and custom providers). 

The implementation spans database schema migrations, secure OAuth 2.0 PKCE authentication with dynamic client registration, GitHub CLI token bridging, namespaced tool execution with strict read-only policy enforcement, an immersive Kumo-styled management UI panel, and localized provider brand assets.

---

## Key Features & Architecture

### 1. Database Schema & Persistence (`mcpServers` Table)
- **Table Definition (`src/server/db/schema.ts`)**: Introduces the `mcp_servers` table supporting comprehensive configuration fields:
  - `id`: Primary key (UUID/cuid).
  - `name`: Unique server identifier used for tool namespacing (`<server>__<tool>`).
  - `preset`: Provider preset category (`github`, `figma`, `miro`, `monday`, `custom`).
  - `transport`: Communication protocol (`stdio`, `sse`, `streamable`).
  - `endpoint`: Remote URL or command string.
  - `authKind`: Authentication mechanism (`none`, `header`, `oauth`).
  - `authHeader`: HTTP authorization header configuration.
  - `authValue`: Encrypted/serialized credential payload (e.g., OAuth tokens bundle).
  - `readOnly`: Boolean flag enforcing read-only safety policies.
  - `enabled`: Toggle state for agent tool availability.
  - `instructions`: Optional custom instructions injected into agent prompts.
  - `toolCount`, `lastStatus`, `lastError`, `lastTestedAt`: Telemetry and diagnostic tracking fields.

### 2. API & CRUD Layer (`src/server/routes/mcp-servers.ts`)
- **RESTful Endpoints**:
  - `GET /api/mcp-servers`: Retrieve all configured external MCP servers.
  - `POST /api/mcp-servers`: Create a new server configuration with unique name validation.
  - `PUT /api/mcp-servers/:id`: Update existing server settings, clearing stale credential references.
  - `DELETE /api/mcp-servers/:id`: Terminate active MCP connections and remove server records.
  - `POST /api/mcp-servers/:id/test`: Perform end-to-end connectivity checks, tool introspection, and update status telemetry.
  - `POST /api/mcp-servers/oauth/begin`: Initiate OAuth 2.0 authorization flows.
  - `POST /api/mcp-servers/oauth/result`: Poll pending OAuth authentication results.

### 3. OAuth 2.0 with PKCE & Dynamic Client Registration (`oauth.ts`, `credentials.ts`)
- **Protocol Security (`src/server/mcp/oauth.ts`)**:
  - Implements OAuth 2.0 specification with Proof Key for Code Exchange (PKCE) via `@ai-sdk/mcp`.
  - Supports **Dynamic Client Registration** for providers that support it (e.g., Miro, Monday).
  - Handles fallback detection for providers lacking registration endpoints (e.g., Figma returning 403 / GitHub).
  - **Separation of Acquisition & Persistence**: Acquired credentials (OAuth token bundles or API headers) are stored in an in-memory pending map with a 30-minute TTL. Nothing is written to the database until explicit user confirmation (`Simpan`), ensuring unsaved edits or cancellation (`Batal`) leave zero trace.
- **Credential Hand-off (`src/server/mcp/credentials.ts`)**: Opaque reference tokens link frontend connection requests securely without leaking tokens to the browser DOM.

### 4. GitHub CLI (`gh`) Token Bridging (`src/server/gh.ts`)
- **Zero-Config GitHub Auth (`src/server/mcp/gh.ts`)**:
  - Because GitHub does not publish dynamic client registration endpoints, standard OAuth browser flows are bypassed.
  - Instead, the integration **bridges tokens directly from the local GitHub CLI (`gh`)** (`gh auth token` and `gh auth status`).
  - Verifies CLI installation, user account authentication status, scopes, and token validity seamlessly, providing instant 46-tool access for GitHub MCP.

### 5. Agent Tool Namespacing & Read-Only Policy Enforcement (`tools.ts`, `client.ts`)
- **Namespacing & Prefixing (`src/server/mcp/client.ts`)**:
  - Automatically namespaces all discovered MCP tools using the `<server>__<tool>` convention (e.g., `github__get_repo`, `figma__get_file`).
  - Supports turn-based multi-server loading and optional server mention filtering via `%servername` in chat prompts.
- **Security & Read-Only Enforcement (`src/server/agent/tools.ts`)**:
  - `isExternalTool(name)` detects namespaced MCP tools.
  - `isServerReadOnly(name)` checks the server's configured read-only policy.
  - Prevents subagents from accessing mutating capabilities (`MUTATING_TOOLS`), safeguarding external systems against unauthorized state changes.

### 6. UI Management Panel (`McpServersPanel.tsx`, Presets & Brand Assets)
- **Settings Interface (`src/components/settings/McpServersPanel.tsx`)**:
  - Interactive preset selection supporting **GitHub**, **Figma**, **Miro**, **Monday**, and **Custom** configurations.
  - Auto and manual configuration mode switching.
  - Real-time connection testing with live tool count reporting and error diagnostics.
  - Clean modal/panel transitions with dirty-state change protection.
- **Official Brand Logos (`public/images/mcp/`)**:
  - Added high-fidelity vector brand SVGs for all supported providers:
    - `public/images/mcp/github.svg`
    - `public/images/mcp/figma.svg`
    - `public/images/mcp/miro.svg`
    - `public/images/mcp/monday.svg`
    - `public/images/mcp/custom.svg`

### 7. Redesigned Kumo-Styled OAuth Callback Page
- **Immersive Redirect View (`src/server/routes/mcp-servers.ts`)**:
  - Designed an exquisite Kumo dark-theme glassmorphism callback landing page (`#09090b` base, `#18181b` elevated cards, `#6d7cff` brand accents).
  - Features dynamic success/failure status badges, animated pulse checkmarks / warning icons, live 2-second auto-close countdown timer, and a responsive manual close action.

---

## Testing & Verification
- Comprehensive unit and integration test suites:
  - `src/server/mcp/external-mcp.test.ts`
  - `src/server/mcp/oauth.test.ts`
  - `src/server/mcp/gh.test.ts`
  - `src/server/mcp/token.test.ts`
  - `src/server/routes/mcp.test.ts`
- Verified end-to-end tool execution, OAuth token exchange, and CLI token bridging across mock and live environments.
