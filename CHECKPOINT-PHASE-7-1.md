# CHECKPOINT PHASE 7.1: SAFE SANDBOX ENVIRONMENT CONFIGURATION & CLOUD RUN DEPLOYMENT PREPARATION

**Apaibay Marketplace Premium**  
**Execution Date:** September 27, 2026  
**Status:** **READY FOR CLOUD RUN STAGING DEPLOYMENT**  
**Target Project:** `apaibay-marketplace-premium`  
**Target Firestore Database:** `ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892`  
**Active Payment Environment:** `sandbox` (`PAYMENT_ENVIRONMENT=sandbox`)  
**Production Payment Credentials:** **ABSENT & NOT REQUIRED**  
**Total Automated Regression Tests Passed:** **380 / 380 (100% Pass Rate)**  
**TypeScript Typecheck:** **0 Errors (`tsc --noEmit`)**  
**Production Build Status:** **SUCCESSFUL (`dist/index.html` & `dist/server.cjs`)**  

---

## 1. Executive Summary

Phase 7.1 successfully configured and verified the safe sandbox staging architecture for **Apaibay Marketplace Premium**, ensuring zero risk of accidental production payment execution and zero exposure of sensitive credentials. A robust, server-side environment validation layer was implemented to enforce strict safety policies:
1. **Sandbox Safe Startup:** When `PAYMENT_ENVIRONMENT=sandbox`, the application starts cleanly and runs in complete safety with zero merchant credentials required.
2. **Production Fail-Closed Guard:** When `PAYMENT_ENVIRONMENT=production`, the application immediately halts and refuses to activate unless all required production credentials for verified payment providers are present.
3. **Provider Readiness Gates:**
   - **ABA PayWay:** `DOCUMENTATION_VERIFIED_PENDING_MERCHANT` (v1 purchase API, SHA-512 cryptographic signature verification).
   - **Bakong KHQR:** `DOCUMENTATION_VERIFIED_PENDING_MERCHANT` (NBC EMVCo standard KHQR generation, CRC16 checksum verification).
   - **Wing Bank:** `NOT_VERIFIED` — permanently and strictly blocked from production activation and live transaction execution.
4. **Cloud Run Containerization:** Container configuration verified with Node.js 20 Alpine, unprivileged `node` user execution, dynamic `PORT` binding on `0.0.0.0`, and graceful `SIGTERM`/`SIGINT` termination.

---

## 2. Environment Architecture & Secret Leak Prevention Audit

| Inspection Item | Verification Result | Implementation Evidence |
| :--- | :--- | :--- |
| **Server-only Env Vars** | **VERIFIED** | All payment gateway secrets are parsed exclusively in Node.js backend (`PaymentConfigService`) via `process.env`. |
| **Client Bundle Security** | **VERIFIED** | Zero references to payment secrets or backend env vars in `src/`. `grep -rn "process.env" src/` and `grep -rn "VITE_" src/` return 0 results. |
| **Git & Docker Exclusion** | **VERIFIED** | `.dockerignore` excludes `.env*`, `node_modules`, `dist`. `.gitignore` excludes `.env*` while maintaining the safe `.env.example` template. |
| **Safe Template (`.env.example`)**| **VERIFIED** | Formatted with empty placeholders for `ABA_PAYWAY_API_KEY`, `BAKONG_KHQR_API_KEY`, `WING_API_KEY`, and webhook secrets. Zero real credentials. |
| **Firestore Security** | **VERIFIED** | No credentials, private tokens, or service account secrets stored in Firestore. All payment records protected by server-authoritative rules. |
| **Public API Leaks** | **VERIFIED** | `GET /api/payments/config` exposes only provider names, sandbox flags, and readiness status. String audits confirm zero `apiKey`, `merchantSecret`, or `privateKey` leaks. |

---

## 3. Server-Side Environment Validation Layer

The new `PaymentConfigService.validateEnvironment()` engine evaluates runtime safety upon server boot and within the container readiness probe (`GET /api/health/ready`):

```typescript
export interface EnvironmentValidationReport {
  valid: boolean;
  environment: PaymentEnvironment;
  isSandbox: boolean;
  isProduction: boolean;
  message: string;
  errors: string[];
  warnings: string[];
  providers: {
    provider: PaymentProvider;
    name: string;
    readinessStatus: ProviderReadinessStatus;
    isConfigured: boolean;
    missingKeys: string[];
    allowedInEnvironment: boolean;
    error?: string;
  }[];
}
```

### Operational Modes:
- **`PAYMENT_ENVIRONMENT=sandbox`:**
  - `valid = true`
  - Safe sandbox simulation active.
  - Zero live gateway calls permitted.
  - Absence of live credentials produces informative warning, never failure.
- **`PAYMENT_ENVIRONMENT=production`:**
  - `valid = false` if required provider credentials (`ABA_PAYWAY_MERCHANT_ID`, `ABA_PAYWAY_API_KEY`, etc.) are absent.
  - Server startup in production throws a critical safety gate error:
    `[CRITICAL SAFETY GATE] Production payment environment startup halted: Production payment mode failed closed...`
  - Wing Bank integration is barred from production activation.

---

## 4. Payment Gateway Safety Status

```
   +-------------------------------------------------------------+
   |             Apaibay Payment Gateway Safety Gate             |
   +-------------------------------------------------------------+
                                  |
            +---------------------+---------------------+
            |                                           |
    [SANDBOX MODE]                              [PRODUCTION MODE]
   PAYMENT_ENVIRONMENT=sandbox                PAYMENT_ENVIRONMENT=production
            |                                           |
    Safe Simulation                             Strict Fail-Closed Check
            |                                           |
   +--------+--------+                  +---------------+---------------+
   |                 |                  |               |               |
[ABA PayWay]    [Bakong KHQR]     [ABA PayWay]    [Bakong KHQR]    [Wing Bank]
SANDBOX OK       SANDBOX OK       Req: Merchant   Req: NBC Key     BLOCKED
(Pending Mcht)   (Pending Mcht)   & API Key       & Webhook Secret (NOT_VERIFIED)
```

1. **ABA PayWay:**
   - **Status:** `DOCUMENTATION_VERIFIED_PENDING_MERCHANT`
   - **Sandbox Behavior:** Permitted for simulated card and QR flows.
   - **Production Behavior:** Requires verified `ABA_PAYWAY_MERCHANT_ID` and `ABA_PAYWAY_API_KEY`. Fails closed if missing.
2. **Bakong / KHQR:**
   - **Status:** `DOCUMENTATION_VERIFIED_PENDING_MERCHANT`
   - **Sandbox Behavior:** Permitted for simulated NBC KHQR scan & pay.
   - **Production Behavior:** Requires NBC partner bank credentials. Fails closed if missing.
3. **Wing Bank:**
   - **Status:** `NOT_VERIFIED`
   - **Policy:** **PERMANENTLY BLOCKED**. Proprietary specification unverified. Live adapter strictly throws `PRODUCTION_ACTIVATION_BLOCKED`. Webhook endpoint returns HTTP 403 Forbidden.

---

## 5. Cloud Run Container Readiness & Health Probes

### Health Probes:
- **`GET /api/health`:** Liveness heartbeat for load balancers (`{ "status": "ok", "service": "apaibay-commerce-backend" }`).
- **`GET /api/health/live`:** Kube/Cloud Run liveness probe (`{ "status": "alive" }`).
- **`GET /api/health/ready`:** Detailed readiness verification probe returning:
  - Container uptime
  - Environment status (`sandbox`)
  - Validation state (`valid: true`)
  - Active provider readiness statuses
  - Safety gate active indicator

### Container Configuration:
- **Dockerfile:** Multi-stage build (`node:20-alpine`), unprivileged `USER node`, exposes port `3000`, runs `npm start`.
- **Dynamic Port:** Server dynamically reads `process.env.PORT` (defaults to 3000) and binds to `0.0.0.0`.
- **Graceful Shutdown:** Intercepts `SIGTERM` and `SIGINT` to gracefully drain inflight commerce connections.
- **Reverse Proxy Trust:** Configured with `app.set('trust proxy', 1)` for Cloud Run HTTPS ingress.

---

## 6. Comprehensive Automated Regression Test Results

| Phase | Test Suite Name | Test Count | Result |
| :--- | :--- | :---: | :---: |
| **Phase 4B** | Commerce Security & Pricing Integrity | 33 | **33 / 33 PASS** |
| **Phase 5A** | Authoritative Payment Intent & Order Flow | 79 | **79 / 79 PASS** |
| **Phase 5B** | Multi-Gateway Adapters, Webhooks & Replay Defense | 56 | **56 / 56 PASS** |
| **Phase 5C** | Official Payment Verification & Wing Blockade | 29 | **29 / 29 PASS** |
| **Phase 6** | Cloud Run & App Hosting Staging Verification | 66 | **66 / 66 PASS** |
| **Phase 7** | Staging Smoke Test Suite | 45 | **45 / 45 PASS** |
| **Phase 7.1** | Safe Sandbox Config & Cloud Run Environment Validation | 72 | **72 / 72 PASS** |
| **TOTAL** | **All Automated Test Suites** | **380** | **380 / 380 PASS (100%)** |

---

## 7. Cloud Run Staging Deployment Prerequisites

Before executing a live `gcloud run deploy` command in an external deployment pipeline, the following prerequisite checklist must be satisfied:

1. **Platform Authentication:** Deployment agent or engineer must be authenticated via `gcloud auth login` or workload identity federation.
2. **Project Target:** Active project must be set to `apaibay-marketplace-premium`.
3. **API Enablement:** Cloud Run Admin API (`run.googleapis.com`) and Artifact Registry (`artifactregistry.googleapis.com`) must be enabled on the GCP project.
4. **IAM Identity:** The Cloud Run service account must hold least-privilege IAM roles (`Cloud Datastore User` for Firestore database access).
5. **Runtime Environment:** `PAYMENT_ENVIRONMENT=sandbox` must be configured in Cloud Run service environment variables. Zero live payment secrets should be set in staging.
6. **Container Build:** Container built from Dockerfile (`gcloud builds submit --tag gcr.io/apaibay-marketplace-premium/backend`).

---

## 8. Conclusion

**Apaibay Marketplace Premium** is fully prepared, tested, and locked down for safe non-production Cloud Run staging deployment. Live payment execution is disabled, the Wing Bank blockade is maintained, and secret containment is 100% verified across 380 automated tests.
