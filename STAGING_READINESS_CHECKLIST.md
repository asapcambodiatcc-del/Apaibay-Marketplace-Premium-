# Apaibay Marketplace Premium — Staging Firebase Isolation & Readiness Plan (Phase 2.3.1)

**Status:** Isolation Architecture Implemented & Verified Offline — No Cloud Resources Created & No Rules Published  
**Payment Mode Lock:** `PAYMENT_ENVIRONMENT=sandbox`  
**Branding & Runtime Preserved:** Apaibay `#FF6A00`, React/Vite + Node.js/Express + Firebase Admin SDK

---

## 1. Preserved Production Firebase Configuration (Unchanged)

Stored in `firebase-applet-config.json` and untouched for production builds:
- **Production Firebase Project ID:** `apaibay-marketplace-premium`
- **Production Named Firestore Database ID:** `ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892`
- **Production Storage Bucket:** `apaibay-marketplace-premium.firebasestorage.app`
- **Production Auth Domain:** `apaibay-marketplace-premium.firebaseapp.com`
- **Production Custom Domain (Locked / Untouched):** `apaibay.com`

---

## 2. Proposed Dedicated Staging Firebase Configuration (Isolated)

Create a **separate, dedicated Firebase/GCP project** for Staging so staging traffic, synthetic test data, Auth users, and KYC test files never touch production resources:

- **Proposed Staging Project ID:** `apaibay-marketplace-staging` *(or equivalent non-production Firebase project ID owned by the user)*
- **Proposed Staging Firestore Database ID:** `(default)` or dedicated named database (e.g., `apaibay-staging-db`) in the staging project
- **Proposed Staging Storage Bucket:** `apaibay-marketplace-staging.firebasestorage.app`
- **Proposed Staging Auth Domain:** `apaibay-marketplace-staging.firebaseapp.com`
- **Dedicated Staging Service Account:** Separate IAM service account created **inside** the staging project only (never reuse the production service account)
- **Dedicated Staging Secrets:** Separate `KYC_VIEW_TOKEN_SECRET` (>= 32 random chars), never shared with production

---

## 3. Code-Level Environment Isolation Guarantees

Implemented in `server/config/firebaseEnvironment.ts`, `server/repositories/serverFirestore.ts`, `server.ts`, `src/services/firebase/envConfig.ts`, and `src/services/firebase/config.ts`:

1. **Zero Fallback to Production in Staging:**
   - When `APP_ENV=staging` (backend) or `VITE_APP_ENV=staging` (frontend build), fallback to `firebase-applet-config.json` is strictly disabled.
   - Missing any required staging variable (`FIREBASE_PROJECT_ID`, `FIREBASE_FIRESTORE_DATABASE_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_AUTH_DOMAIN`, or frontend `VITE_FIREBASE_*`) causes an explicit isolation failure (`isolation_violation` / startup halt / HTTP `503` on `/api/health/ready`).
2. **Production Identifier Blocklist in Staging:**
   - Staging explicitly rejects any backend or frontend config value referencing `apaibay-marketplace-premium`, `ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892`, `apaibay-marketplace-premium.firebasestorage.app`, or `apaibay-marketplace-premium.firebaseapp.com`.
3. **Credential `project_id` Alignment Enforcement:**
   - Service account JSON (`FIREBASE_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS`) `project_id` must match the target environment's `projectId`.
   - Production credentials supplied to `APP_ENV=staging` (or staging credentials supplied to `APP_ENV=production`) are immediately rejected.
4. **Frontend / Backend Project Alignment:**
   - If `VITE_APP_ENV` / `VITE_FIREBASE_*` are present in the container environment alongside server variables, cross-environment mixing is rejected.
5. **Staging Live-Payment Lock:**
   - `APP_ENV=staging` combined with `PAYMENT_ENVIRONMENT=production` is rejected at boot.

---

## 4. Required Staging Render Environment Variables

| Variable | Scope | Staging Value / Requirement | Production Value / Requirement |
|---|---|---|---|
| `APP_ENV` | Runtime | `staging` | `production` |
| `NODE_ENV` | Runtime | `production` | `production` |
| `PAYMENT_ENVIRONMENT` | Runtime | `sandbox` *(enforced)* | `sandbox` *(locked until merchant go-live)* |
| `PAYMENT_DEFAULT_PROVIDER` | Runtime | `sandbox` | `sandbox` |
| `APP_URL` | Runtime | `https://<staging-render-service>.onrender.com` | Production origin |
| `ALLOWED_ORIGINS` | Runtime | Optional comma-separated staging origins | Production origins |
| `FIREBASE_PROJECT_ID` | Runtime | `apaibay-marketplace-staging` | Omit or match prod |
| `FIREBASE_FIRESTORE_DATABASE_ID` | Runtime | Staging Firestore DB ID | Omit or match prod |
| `FIREBASE_STORAGE_BUCKET` | Runtime | `apaibay-marketplace-staging.firebasestorage.app` | Omit or match prod |
| `FIREBASE_AUTH_DOMAIN` | Runtime | `apaibay-marketplace-staging.firebaseapp.com` | Omit or match prod |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Staging project service account JSON | Production service account JSON |
| `KYC_VIEW_TOKEN_SECRET` | Secret | Dedicated >=32-char staging random secret | Dedicated >=32-char prod secret |
| `VITE_APP_ENV` | Build | `staging` | `production` (or omit) |
| `VITE_FIREBASE_PROJECT_ID` | Build | `apaibay-marketplace-staging` | *(From `firebase-applet-config.json`)* |
| `VITE_FIREBASE_API_KEY` | Build | Staging Web App API Key | *(From `firebase-applet-config.json`)* |
| `VITE_FIREBASE_AUTH_DOMAIN` | Build | `apaibay-marketplace-staging.firebaseapp.com` | *(From `firebase-applet-config.json`)* |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | Build | Staging Firestore DB ID | *(From `firebase-applet-config.json`)* |
| `VITE_FIREBASE_STORAGE_BUCKET` | Build | `apaibay-marketplace-staging.firebasestorage.app` | *(From `firebase-applet-config.json`)* |
| `VITE_FIREBASE_APP_ID` | Build | Staging Web App ID | *(From `firebase-applet-config.json`)* |
| `ABA_PAYWAY_*`, `BAKONG_KHQR_*`, `WING_*`, `NOWPAYMENTS_*` | Runtime | **Blank / Unset** | **Blank / Unset in sandbox** |

---

## 5. Firebase Auth & Rules Compatibility Notes (No Console Changes Made)

- **Firebase Auth Authorized Domains (Staging Project Only):**
  - Enable Google Sign-In & Email/Password inside the **staging** Firebase project (`apaibay-marketplace-staging`).
  - Add `<staging-render-service>.onrender.com` under **Authentication → Settings → Authorized domains** in the **staging** project.
  - Do **not** add staging Render domains to `apaibay-marketplace-premium`, and do **not** attach `apaibay.com` to staging.
- **Rules Compatibility Review:**
  - `firestore.rules` uses dynamic `$(database)` path resolution (`exists(/databases/$(database)/documents/admins/$(request.auth.uid))`) and bootstrap email `asapcambodia.tcc@gmail.com` (`email_verified == true`) — **100% compatible** with any dedicated staging Firebase project and Firestore database ID.
  - `storage.rules` uses dynamic `match /b/{bucket}/o` — **100% compatible** with any dedicated staging Storage bucket.
  - Neither file contains hardcoded production project IDs or bucket names.

---

## 6. Synthetic Data Policy (Zero Production Data Copy)

- **STRICT PROHIBITION:** Never export or copy production customer, seller, order, payment, payout, or KYC documents/binaries into Staging.
- Seed Staging using synthetic catalog fixtures and synthetic test accounts only (`stg_test_*`), verified with `PAYMENT_ENVIRONMENT=sandbox`.

---

## 7. Rollback Plan

1. **Render Staging Service:** Revert to previous Render deploy or disable service; no production Firebase collections or domains are referenced when `APP_ENV=staging`.
2. **Rules Snapshot:** Export existing staging rules before any future publish step.
3. **Secret Rotation:** Rotate staging `KYC_VIEW_TOKEN_SECRET` or revoke the staging service account without affecting production keys.
