# CareOClock — Home Health Risk Assessment Platform

CareOClock is an AI-assisted Clinical Decision Support System (CDSS) designed for twice-daily, patient-initiated home health risk assessment for elderly care across three personas: **Patient**, **Caregiver**, and **Doctor**.

---

## 🏗️ Architecture & Services

CareOClock is organized as a monorepo containing three core services:

```
CareOClock/
├── client/        # React + Vite frontend (Port 5173)
├── server/        # Node.js + Express backend API (Port 5000)
└── ai-engine/     # Python + FastAPI AI risk scoring microservice (Port 8000)
```

---

## 🚀 Quick Start & Local Execution

### Prerequisites
- **Node.js**: v18+ (v20 LTS recommended) & `npm`
- **Python**: v3.10+ (v3.11 / v3.14 compatible) & `pip`
- **MongoDB**: Local MongoDB instance or free MongoDB Atlas cluster

---

### 1. AI Engine (`/ai-engine`) — Python + FastAPI

The AI risk microservice runs Layer 1 clinical early warning logic and Layer 2 personalized baseline anomaly detection.

```bash
cd ai-engine

# 1. Create and activate virtual environment (optional but recommended)
python -m venv .venv
# On Windows PowerShell:
.venv\Scripts\Activate.ps1
# On macOS/Linux:
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy environment configuration
cp .env.example .env

# 4. Start AI engine dev server (Runs on http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```

- **Healthcheck**: `GET http://localhost:8000/health`
- **API Documentation**: `http://localhost:8000/docs`

---

### 2. Backend Server (`/server`) — Node.js + Express

The core backend API manages authentication, RBAC, MongoDB persistence, and routes requests to the AI engine.

```bash
cd server

# 1. Install dependencies
npm install

# 2. Copy environment configuration
cp .env.example .env

# 3. Start development server (Runs on http://localhost:5000)
npm run dev
```

- **Healthcheck**: `GET http://localhost:5000/health`

---

### 3. Frontend Client (`/client`) — React + Vite

The mobile-first interface for patients and caregivers, and the triage dashboard for doctors.

```bash
cd client

# 1. Install dependencies
npm install

# 2. Start development server (Runs on http://localhost:5173)
npm run dev
```

- **Application URL**: `http://localhost:5173`

---

## 🧪 Linting & Quality Standards

Every service includes automated code quality checks:

### Run All Linting Locally

```bash
# Client (ESLint)
cd client && npm run lint

# Server (ESLint)
cd server && npm run lint

# AI Engine (Flake8 + Black)
cd ai-engine && flake8 . && black --check .
```

---

## 🛡️ Security & Constraints
- **Role-Based Access Control (RBAC)** is strictly enforced server-side. Caregiver accounts receive `403 Forbidden` on all clinical write routes.
- **Explainability**: No risk score is ever shown without a plain-language explanation attached.
- **Latency Budget**: End-to-end AI prediction round trip operates under **<800ms**.

## How to Run and Test
# 1. Start AI Engine (Port 8000)
cd ai-engine
uvicorn app.main:app --reload --port 8000

# 2. Start Backend Server (Port 5000)
cd server
npm run dev

# 3. Start Frontend Client (Port 5173)
cd client
npm run dev

