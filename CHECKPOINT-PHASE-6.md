# CHECKPOINT: PHASE 6 — CLOUD RUN / FIREBASE APP HOSTING DEPLOYMENT PREPARATION & STAGING VERIFICATION
**Apaibay Marketplace Premium**  
**Date:** March 2026  
**Status:** COMPLETED & VERIFIED (263 TOTAL REGRESSION TESTS PASSED, 0 FAILED)

---

## 1. Executive Summary

Phase 6 hardens and finalizes the deployment architecture of Apaibay Marketplace Premium for containerized server execution on **Google Cloud Run** and **Firebase App Hosting**, while conducting rigorous staging verification across the complete commerce and payment pipeline.

### Critical Safety Invariants Maintained:
- **PAYMENT_ENVIRONMENT=sandbox**: Live payments are strictly disabled. Zero real money or live payment transactions can occur.
- **Zero Secret Exposure**: Zero production merchant credentials, API keys, passwords, private keys, or certificates are stored in code, committed to git, or exposed to the client.
- **Production Safety Gate**: Gateways without verified official documentation (Wing Bank) remain strictly blocked (`NOT_VERIFIED`). Documented gateways (ABA PayWay, Bakong KHQR) require explicit production merchant credentials from Cloud Secret Manager before any live payment can be processed.
- **Server Authoritative Security**: All pricing, intent generation, state machine transitions, and webhook processing remain strictly enforced on the server.

---

## 2. Test Suite & Verification Results

| Test Suite | File | Tests Run | Passed | Failed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 4B Commerce Security** | `scripts/test-commerce-security.ts` | 33 | 33 | 0 | **PASS** |
| **Phase 5A Payment Foundation** | `scripts/test-phase5a-payments.ts` | 79 | 79 | 0 | **PASS** |
| **Phase 5B Multi-Gateway Architecture** | `scripts/test-phase5b-payments.ts` | 56 | 56 | 0 | **PASS** |
| **Phase 5C Official Payment Verification** | `scripts/test-phase5c-payments.ts` | 29 | 29 | 0 | **PASS** |
| **Phase 6 Staging & Deployment Verification** | `scripts/test-phase6-staging-verification.ts` | 66 | 66 | 0 | **PASS** |
| **TypeScript Typecheck (`tsc --noEmit`)** | Whole codebase | - | - | 0 errors | **PASS** |
| **Production Build (`npm run build`)** | `dist/` bundle & server | - | - | 0 errors | **PASS** |
| **Grand Total Full Regression** | All Suites | **263** | **263** | **0** | **PASS** |

---

## 3. Deployment Architecture & Infrastructure Hardening

### 3.1. Server Entry Point & Process Configuration (`server.ts`)
- **Environment Variable Loading**: Explicit `dotenv.config()` loaded on server startup for seamless environment variable propagation.
- **Reverse Proxy Trust**: Enabled `app.set('trust proxy', 1)` to correctly resolve client protocol, IP, and headers behind Cloud Run and Firebase App Hosting load balancers.
- **Dynamic Port Resolution**: Adapts automatically to container environments via `process.env.PORT ? parseInt(process.env.PORT, 10) : 3000`, falling back gracefully to port 3000.
- **Request Safety Limits**: Strict JSON body parsing limit (`limit: '1mb'`) and CORS header restrictions.
- **Global Error Handling**: Production-safe error middleware prevents leaking internal database or system stack traces to callers.

### 3.2. Container Orchestration & Probes
- **`GET /api/health`**: General service health and timestamp endpoint.
- **`GET /api/health/live`**: Fast liveness probe for Kubernetes and Cloud Run health monitoring (returns HTTP 200 `{ status: 'alive' }`).
- **`GET /api/health/ready`**: Comprehensive readiness probe verifying:
  - Service runtime readiness
  - Payment isolation environment (`sandbox`)
  - Active status of Production Safety Gate
  - Provider readiness status breakdown (`sandbox`: `PRODUCTION_READY`, `aba_payway`: `DOCUMENTATION_VERIFIED_PENDING_MERCHANT`, `khqr`: `DOCUMENTATION_VERIFIED_PENDING_MERCHANT`, `wing`: `NOT_VERIFIED`)
  - Server uptime seconds and ISO timestamp
- **Graceful Shutdown**:
  - Traps `SIGTERM` and `SIGINT` signals issued by Cloud Run / container orchestrators.
  - Closes active server socket, completes in-flight requests, and terminates cleanly with exit code 0.

### 3.3. Production Containerization Artifacts
1. **`Dockerfile`**:
   - Multi-stage build based on lightweight, secure `node:20-alpine`.
   - Stage 1 (`builder`): Compiles Vite SPA frontend and bundles Node.js/Express server using `esbuild`.
   - Stage 2 (`runner`): Production-only dependencies (`npm install --omit=dev`), runs as unprivileged `node` user (`USER node`), exposes port 3000, and launches via `CMD ["npm", "start"]`.
2. **`.dockerignore`**:
   - Strictly excludes `node_modules`, `.git`, `.env*` secrets, and temporary build outputs.
3. **`apphosting.yaml`**:
   - Configures Firebase App Hosting container resources: CPU: 1, Memory: 512MiB, Concurrency: 80, Min instances: 0 (scale-to-zero), Max instances: 10.
   - Enforces `PAYMENT_ENVIRONMENT: sandbox`.

---

## 4. Secret Management & Cloud Configuration Mapping

### 4.1. Secret Manager Mapping Guide
For future live activation (Phase 7+), all secrets must be provisioned in **Google Cloud Secret Manager** and injected into Cloud Run as container environment variables:

| Environment Variable | Secret Manager Secret Name | Target Gateway | Classification |
| :--- | :--- | :--- | :--- |
| `ABA_PAYWAY_MERCHANT_ID` | `apaibay-aba-merchant-id` | ABA PayWay | Public Identifier (Merchant ID) |
| `ABA_PAYWAY_API_KEY` | `apaibay-aba-api-key` | ABA PayWay | Secret (HMAC-SHA512 Signing Key) |
| `ABA_PAYWAY_WEBHOOK_SECRET` | `apaibay-aba-webhook-secret`| ABA PayWay | Secret (Pushback Verification Key) |
| `BAKONG_KHQR_MERCHANT_ID` | `apaibay-bakong-merchant-id` | Bakong KHQR | Public Identifier (Account ID) |
| `BAKONG_KHQR_API_KEY` | `apaibay-bakong-api-key` | Bakong KHQR | Secret (NBC Open API Token) |
| `BAKONG_KHQR_WEBHOOK_SECRET` | `apaibay-bakong-webhook-sec` | Bakong KHQR | Secret (Callback HMAC Key) |

*Note: Wing Bank credentials will NOT be accepted until official API documentation is provided and verified.*

---

## 5. Staging Verification Summary

The complete end-to-end simulated flow was verified:
1. **Cart & Pricing**: Authoritative server pricing verified without client forgery.
2. **Intent Lifecycle**: Payment Intent created in `pending`, transitioned through `processing` to `paid`.
3. **Idempotency**: Identical requests with same idempotency key return cached results without double charge.
4. **Sandbox Gateway Simulation**: Complete approval and decline simulation verified.
5. **Webhook Security**: Constant-time signature verification, replay protection, and discrepancy checks verified.
6. **ABA PayWay Simulation**: HMAC-SHA512 payload and check-transaction hashing verified.
7. **Bakong KHQR Simulation**: EMVCo Tag construction and CRC16 checksum computation verified.
8. **Reconciliation**: 0 discrepancies found across staging records.
