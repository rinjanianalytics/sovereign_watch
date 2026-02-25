# AGENTS.md - AI Developer Guide

> **CRITICAL:** This file is the authoritative source for AI agents working on this project. Read this first.

## 1. Project Context
**Sovereign Watch** is a distributed intelligence fusion platform.
- **Frontend**: React (Vite), Tailwind CSS.
  - **Mapping**: Hybrid Architecture supporting **Mapbox GL JS** OR **MapLibre GL JS** (dynamic import based on env), overlaid with **Deck.gl** v9.
  - Source: `frontend/src/components/map/TacticalMap.tsx`
- **Backend**: FastAPI (Python), Redpanda Connect (in `backend/api/` and `backend/ingestion/`)
- **Infrastructure**: Docker Compose, localized dev environment.

## 2. Mandatory Rules (from `.agent/rules/GEMINI.md`)

### 🛡️ Container-First Development
- **NEVER** run `npm`, `node`, `python`, `pip` on the host machine directly unless instructed.
- **ALWAYS** use Docker Compose or run inside the dev container.
- **Exception**: Scripts in `.agent/scripts/` are designed to run on the host if Python 3 is available, but prefer container execution for build steps.

### 🏗️ Architectural Invariants
- **Communication**: All inter-service communication use **TAK Protocol V1 (Protobuf)**. No ad-hoc JSON.
- **Rendering**: Hybrid Architecture (WebGL2 for visuals). Do not downgrade to Leaflet.
- **State**: Backend uses `Redpanda` (Kafka-compatible) for event streaming.

### 📝 Documentation & Change Tracking
- **File**: `docs/jules_changes.md`
- **Requirement**: You **MUST** append a new entry for all significant features, bug fixes, and architectural changes.
- **Format**: Include the **Date** and follow the existing structure:
  - **Issue**: Description of the problem or feature request.
  - **Solution**: High-level approach taken.
  - **Changes**: Specific files modified and logic implemented.
  - **Verification**: Tests run and results observed.
  - **Benefits**: Impact on the project (e.g., performance, security, maintainability).

## 3. Agent Role Routing (Token Optimization)
**Do NOT read the entire `.agent/` directory.** It contains ~400k tokens.
Instead, read **ONLY** the specific file for your current task:

| Task Type | Read This File |
|-----------|----------------|
| **Frontend / UI** | `.agent/agents/frontend-specialist.md` |
| **Backend / API** | `.agent/agents/backend-specialist.md` |
| **Database / SQL** | `.agent/agents/database-architect.md` |
| **Mobile / React Native** | `.agent/agents/mobile-developer.md` |
| **Testing / QA** | `.agent/agents/test-engineer.md` |
| **Security / Auth** | `.agent/agents/security-auditor.md` |
| **DevOps / Docker** | `.agent/agents/devops-engineer.md` |
| **Debugging** | `.agent/agents/debugger.md` |

> **Note**: These files contain specific "Skills" (e.g., `clean-code`, `react-patterns`). Apply those principles.

## 4. Verification & Quality Gates
Before declaring a task complete, you **MUST** run the appropriate verification.

### ⚡ Quick Checks (Run these!)
The `checklist.py` script is the master validator. **You must target the correct subdirectory.**

```bash
# 1. Project-wide Sanity Check
python3 .agent/scripts/checklist.py .

# 2. Frontend Specific Lint/Test (Ensure npm install first!)
# python3 .agent/skills/lint-and-validate/scripts/lint_runner.py frontend
# OR manually:
# cd frontend && npm run lint && npm run test

# 3. Backend Specific Lint/Test (Target specific service!)
python3 .agent/skills/lint-and-validate/scripts/lint_runner.py backend/api
python3 .agent/skills/lint-and-validate/scripts/lint_runner.py backend/ingestion/aviation_poller
# OR manually:
# cd backend/api && ruff check .
```

### 🔒 Security Scan
Run this before any major commit or if touching auth/secrets:
```bash
python3 .agent/skills/vulnerability-scanner/scripts/security_scan.py .
```

## 5. Directory Structure Map
```
.
├── .agent/           # Antigravity Framework (DO NOT READ RECURSIVELY)
├── frontend/         # React Application (Vite)
│   ├── src/          # Source Code
│   └── package.json  # Frontend Dependencies
├── backend/          # Microservices Root
│   ├── api/          # FastAPI Server (has requirements.txt)
│   ├── ingestion/    # Data Ingestion Services
│   └── database/     # Database Migrations
├── docker-compose.yml
└── AGENTS.md         # This file
```

## 6. Common Issues & Fixes
- **Lint Runner "No Linters Found"**: This happens if you target a directory without `package.json` or `requirements.txt`. Target the specific service folder (e.g., `backend/api`).
- **"Token Wastage"**: If you feel overwhelmed by context, stop reading `.agent/` files and focus only on the specific specialist file listed in Section 3.
