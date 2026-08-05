# Questivo Admin CMS — Build Spec

**Scope of truth:** everything below is grounded in the five surveys plus direct verification of `server-qusestivo/package.json`, `questivo/src/lib/premium.ts`, `.env.example` (152 lines, zero storage/redis keys), `src/routes/*`, and the figure-writing scripts. Where a claim is "impossible," it was checked, not assumed.

**Repo roots**
- API: `C:/Users/LSE/Downloads/Questivo/server-qusestivo`
- Web + admin SPA: `C:/Users/LSE/Downloads/Questivo/questivo`
- Figure blobs (in git): `C:/Users/LSE/Downloads/Questivo/pyq-figures`

---

## A. What already exists and should be kept

### A1. Backend — keep and build on

| Asset | Path | Why it survives |
|---|---|---|
| Admin auth middleware | `server-qusestivo/src/middleware/adminIdentifier.js` | Correct shape already: cookie→bearer fallback, `jwt.verify`, **DB re-read of role on every request** (so demotion is instant). Only the role comparison at `:42` needs replacing with a permission check. Do not rewrite it. |
| Admin controller CRUD | `server-qusestivo/src/controllers/adminController.js` | 23 working handlers. Users/categories/topics/sessions/questions list+detail+delete are all real and correct enough to extend. Keep the `{success, data, meta}` envelope. |
| Admin router | `server-qusestivo/src/routes/adminRoutes.js` | Single mount point with a blanket guard — the right place to layer `requirePermission()` per route. |
| PYQ read stack | `src/controllers/pyqController.js`, `src/lib/pyqProfile.js`, `src/lib/pyqDifficulty.js`, `src/lib/pyqGenerator.js` | The facet/filter engine over `PreviousYearQuestion` is the CMS's question browser. `pyqDifficulty.js` (measured difficulty from ≥8 attempt responses) is the *only* honest difficulty signal — keep it, do not replace it with an authored column as the primary. |
| ESM rate-limit pattern | `src/routes/pyqRoutes.js:29-56` | The one working `import rateLimit from "express-rate-limit"` usage. Copy this shape; **do not** revive `src/middleware/rateLimiter.js` / `advancedRateLimiter.js`. |
| Error utilities (unused but correct) | `src/utills/errorHandler.js` — `AppError:2`, `handlePrismaError:34`, `getStatusCodeFromPrismaError:62`, `asyncHandler:98` | Already written, zero call sites. Wire it up rather than writing a new one. |
| Joi validator factory | `src/middleware/messageValidator.js` | Correct logic (`abortEarly:false` → 400 `{success:false,errors}`); only needs `module.exports` → `export default`. |
| Explicit-field update handlers | `src/controllers/categoryController.js:115-122`, `src/controllers/topicController.js:132-139` | The only two update handlers **not** vulnerable to mass assignment. Use them as the template for rewriting the four `data: req.body` handlers. |
| Prisma adapter client | `src/prismaClient.js` | Keep; needs `max` on the pool and `log` trimmed, not replacement. |
| Figure/import CLI scripts | `scripts/linkPyqFigures.mjs`, `scripts/convertJeeMain*.mjs`, `scripts/convertJeeAdvancedAllen.mjs`, `scripts/pruneFigures.mjs`, `src/lib/pyqImport.js` | The entire content pipeline. The CMS wraps these; it does not replace them. |
| Admin bootstrap | `scripts/upsertAdmin.mjs` | Only way `superadmin` is ever set. Keep as the break-glass path. |

### A2. Frontend — keep and build on

| Asset | Path | Notes |
|---|---|---|
| Transport | `questivo/src/lib/api.ts` | Keep the axios instance + `withCredentials`. Add: interceptors (401→signin, 403→toast), timeout, `handleApiError` widened to `data.error?.message \|\| data.message \|\| data.error`. |
| Route guard | `questivo/src/componenets/AdminRequireAuth.tsx` | Keep; extend to store the returned `user.role` in context instead of discarding the `/verify` body. |
| Shell | `questivo/src/componenets/AdminLayout.tsx` | Keep sidebar/drawer/`<Toaster>`. `SidebarItem` (`:11-46`) becomes permission-aware. |
| Math renderer | `questivo/src/componenets/SafeMathRenderer.tsx` | Essential — every question preview in the CMS needs it. |
| Print engine | `SessionDetailsPage.tsx:31-227` (`triggerNativePrint`) | ~190 lines of tuned KaTeX print CSS. Extract to `lib/print.ts` verbatim; do not re-derive. |
| Confirm dialog | `SessionsPage.tsx:62-111` (`showDeleteConfirmation`) | Already parameterized `(count, onConfirm)`. Promote to `componenets/admin/ConfirmDialog.tsx` and delete every `window.confirm`. |
| Selection helpers | `SessionsPage.tsx:44-58` + `CategoriesPage.tsx:237-245` | Duplicated; extract one `useRowSelection(items)` hook (fixing the filter bug, §A3). |
| Design conventions | Card `bg-white rounded-xl shadow-sm border border-gray-100`, header strip, table classes, badge pills | Already consistent across 9 files. Freeze these into `componenets/admin/ui/*` — do **not** introduce shadcn/a new design system mid-flight. |

### A3. Bugs to fix *while* extracting, not later

These are cheap and they are in the components you're about to lift:
- `Dashboard.tsx:9` `bg-opacity-10` is dead in Tailwind v4 → stat icons are invisible. Use `bg-blue-500/10`.
- `animate-in` / `slide-in-from-*` / `animate-enter` / `animate-leave` / `scrollbar-hide` compile to nothing (no plugin installed). Either install `tw-animate-css` or delete the classes — do not ship a "polished" CMS built on no-op animations.
- `PendingUsersPage.tsx:63` — `flex` on a `<td>` breaks the column algorithm.
- `UsersPage.tsx:51` — search is not `encodeURIComponent`'d; `PendingUsersPage.tsx:25` — email path param not encoded (`a+b@x.com` deletes the wrong row).
- `UsersPage.tsx:64-67` — changing `search` doesn't reset `page` to 1.
- `CategoriesPage.tsx:237-240` — "select all" selects `topics`, table renders `filteredTopics`; bulk delete removes invisible rows. **Data-loss bug.**
- `CategoriesPage.tsx:120-122, 254-256` — `.toLowerCase()` on nullable `code` throws mid-render.
- `SessionDetailsPage.tsx:332-333` — unguarded `session.questions.map` / `session.answers.find` after the author already guarded at `:232`.
- `SessionDetailsPage.tsx:37-38, 222` — print classes and injected `<style>` are never cleaned up; they leak into the rest of the SPA session.
- `meta` contract mismatch: `UsersPage` reads `meta.pages`, `SessionsPage` reads `meta.total`. Backend `getAdminStats`/`getSessions` emits `{total, page}` with **no `pages`** → `SessionsPage` renders "Page 1 of NaN". Fix on the server (always emit `{total, page, limit, pages}`) and on both clients.

---

## B. Schema changes required

All additions to `C:/Users/LSE/Downloads/Questivo/server-qusestivo/prisma/schema.prisma`. Only things the surveys proved absent are listed.

### B1. Roles — enum + revocation (replaces `role String`)

```prisma
enum UserRole {
  USER
  SUPPORT         // read users, resend/clear OTP, no deletes
  CONTENT_EDITOR  // author questions/papers/taxonomy; cannot publish
  REVIEWER        // approve + publish content; no user or billing writes
  ADMIN           // everything except role grants above self, and purge
  SUPERADMIN      // role grants, audit retention, danger zone
}

model User {
  // ... existing fields unchanged ...
  role          UserRole  @default(USER)   // was: String @default("user")
  tokenVersion  Int       @default(0)      // bump to invalidate all JWTs for this user
  disabledAt    DateTime?                  // soft-suspend without deleting
  lastLoginAt   DateTime?

  auditEvents      AuditLog[]        @relation("AuditActor")
  bookmarks        Bookmark[]
  questionStates   UserQuestionState[]
  subscriptions    Subscription[]
  payments         Payment[]
  resumeAnalyses   ResumeAnalysis[]   // NEW relation, see B8
  interviewSessions InterviewSession[] // NEW relation, see B8
  courseRequests   CourseRequest[]    // NEW relation, see B8

  @@index([role])
  @@index([createdAt])
}
```

Migration is a data migration, not additive. Existing values are exactly `user | admin | superadmin` (verified in the survey across `adminIdentifier.js:42`, `insertDemoData.js`, `upsertAdmin.mjs`, and the frontend dropdown):

```sql
CREATE TYPE "UserRole" AS ENUM ('USER','SUPPORT','CONTENT_EDITOR','REVIEWER','ADMIN','SUPERADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING (
  CASE lower("role")
    WHEN 'superadmin' THEN 'SUPERADMIN'
    WHEN 'admin'      THEN 'ADMIN'
    ELSE 'USER'
  END::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
```

**Deliberately NOT proposed: `Role` / `Permission` / `RolePermission` / `UserRole` join tables.** Six roles over ~60 endpoints does not justify a runtime-editable permission engine, and a DB-driven matrix means every request either joins three tables or reads a cache you now have to invalidate across instances (which you cannot do today — see §E4). Ship the matrix as a frozen object in `src/lib/permissions.js`. Revisit only if a customer needs custom roles.

### B2. Monetization — ledger-first, PSP-ready

There is **no payment provider, no payment code, and no payment dependency** anywhere (verified: zero hits for `razorpay|stripe|paypal|cashfree|phonepe|paytm|subscriptionId|isPremium|planId|billingCycle` across `server-qusestivo/src`, `prisma/`, `questivo/src`, and both `package.json`s). Today's monetization is literally a phone number: `questivo/src/lib/premium.ts:26` `PREMIUM_CONTACT_PHONE` + `PREMIUM_UNLOCKED = false`.

So model what actually happens (an offline sale someone records by hand), with a shape a PSP can later write into unchanged.

```prisma
enum PlanInterval { MONTH   QUARTER  YEAR  LIFETIME }
enum SubscriptionStatus { TRIALING  ACTIVE  PAST_DUE  CANCELED  EXPIRED }
enum PaymentSource { MANUAL  RAZORPAY  STRIPE }   // MANUAL is the only one wired at launch
enum PaymentStatus { PENDING  CAPTURED  FAILED  REFUNDED }

model Plan {
  id            String       @id @default(uuid())
  code          String       @unique          // "pro-monthly"
  name          String
  description   String?
  priceMinor    Int                            // paise/cents — never Float for money
  currency      String       @default("INR")
  interval      PlanInterval
  features      Json         @default("{}")    // { mockGenerator: true, pyqSolutions: true, ... }
  isActive      Boolean      @default(true)
  sortOrder     Int          @default(0)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  subscriptions Subscription[]
  @@index([isActive, sortOrder])
}

model Subscription {
  id            String             @id @default(uuid())
  userId        String
  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  planId        String
  plan          Plan               @relation(fields: [planId], references: [id])
  status        SubscriptionStatus @default(ACTIVE)
  startsAt      DateTime           @default(now())
  endsAt        DateTime?                        // null = LIFETIME
  canceledAt    DateTime?
  cancelReason  String?
  grantedById   String?                          // admin who granted a MANUAL sub
  note          String?            @db.Text
  externalRef   String?                          // PSP subscription id, later
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  payments      Payment[]
  @@index([userId, status])
  @@index([status, endsAt])
  @@index([planId, createdAt])
}

model Payment {
  id             String        @id @default(uuid())
  userId         String
  user           User          @relation(fields: [userId], references: [id], onDelete: Restrict)
  subscriptionId String?
  subscription   Subscription? @relation(fields: [subscriptionId], references: [id])
  amountMinor    Int
  currency       String        @default("INR")
  source         PaymentSource @default(MANUAL)
  status         PaymentStatus @default(CAPTURED)
  externalId     String?                          // gateway payment id
  reference      String?                          // UPI txn ref / bank ref typed by admin
  paidAt         DateTime
  recordedById   String?                          // admin who entered it
  refundedMinor  Int           @default(0)
  note           String?       @db.Text
  createdAt      DateTime      @default(now())
  @@unique([source, externalId])
  @@index([paidAt])
  @@index([userId, paidAt])
  @@index([status, paidAt])
}

model WebhookEvent {                              // create now, consume when a PSP lands
  id          String   @id @default(uuid())
  source      String
  externalId  String
  type        String
  payload     Json
  processedAt DateTime?
  error       String?  @db.Text
  createdAt   DateTime @default(now())
  @@unique([source, externalId])
  @@index([processedAt])
}
```

Entitlement is **derived**, never denormalized onto `User`: `hasActiveSubscription(userId)` = any `Subscription` where `status IN (TRIALING, ACTIVE)` and (`endsAt IS NULL OR endsAt > now()`). One indexed query, no sync bugs. `premium.ts:PREMIUM_UNLOCKED` becomes a server-checked entitlement.

### B3. Audit log

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  actorId     String?
  actor       User?    @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)
  actorEmail  String?                          // denormalized: survives actor deletion
  actorRole   UserRole?
  action      String                           // "user.role.change", "pyq.question.update", "payment.record"
  entityType  String                           // "User" | "PreviousYearQuestion" | "Subscription" | ...
  entityId    String?
  summary     String?                          // human line for the feed
  before      Json?
  after       Json?
  ip          String?
  userAgent   String?
  requestId   String?
  createdAt   DateTime @default(now())

  @@index([createdAt])
  @@index([entityType, entityId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

Written by one middleware wrapper, not by 60 handlers. `before`/`after` must be redacted for `passwordHash`, `otpHash`, `tokenVersion`.

### B4. Question version history + editorial state

The two question banks share **no base table, no interface, no FK**. Don't invent one. Use a discriminator.

```prisma
enum QuestionBank { PYQ  MOCK }        // PreviousYearQuestion | TestQuestion
enum ReviewStatus { DRAFT  IN_REVIEW  APPROVED  PUBLISHED  REJECTED  ARCHIVED }

model QuestionRevision {
  id          String       @id @default(uuid())
  bank        QuestionBank
  questionId  String                     // no FK: two possible parents
  version     Int
  snapshot    Json                       // full row as of this version
  changedKeys String[]     @default([])
  reason      String?
  editorId    String?
  editorEmail String?
  createdAt   DateTime     @default(now())
  @@unique([bank, questionId, version])
  @@index([bank, questionId, createdAt])
  @@index([editorId, createdAt])
}
```

Columns to add to `PreviousYearQuestion` (currently has **no `updatedAt` at all** — "when was this edited" is unanswerable today):

```prisma
  updatedAt     DateTime     @updatedAt
  version       Int          @default(1)
  reviewStatus  ReviewStatus @default(PUBLISHED)   // backfill existing rows as PUBLISHED
  publishedAt   DateTime?
  createdById   String?
  updatedById   String?
  reviewedById  String?
  deletedAt     DateTime?                          // soft delete
  @@index([reviewStatus, updatedAt])
  @@index([deletedAt])
```

`TestQuestion` has **no timestamps whatsoever**; add `createdAt`/`updatedAt`/`version`/`deletedAt` if you intend to edit AI-generated questions in the CMS. Honest note: `TestQuestion.optionA..optionD` are NOT NULL and there is no `questionType`, so **numerical/NAT questions are structurally unrepresentable in the mock bank**. Making them nullable + adding `questionType` is a separate, breaking change to the generator — scope it explicitly or declare the mock bank MCQ-only.

### B5. Bookmarks

```prisma
model Bookmark {
  id         String       @id @default(uuid())
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  bank       QuestionBank
  questionId String
  note       String?      @db.Text
  createdAt  DateTime     @default(now())
  @@unique([userId, bank, questionId])
  @@index([userId, createdAt])
  @@index([bank, questionId])
}
```

### B6. Wrong-question tracking / review notebook

Today the only signal is `markedForReview` — a `useState<Set<number>>` in `questivo/src/componenets/TestPage.tsx:102`, discarded on reload — plus `PyqAttempt.responses` (a Json blob) and `TestAnswer.isCorrect`. Neither is queryable as "this user's mistakes."

```prisma
enum MasteryState { NEW  WRONG  SHAKY  MASTERED }

model UserQuestionState {
  id             String       @id @default(uuid())
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  bank           QuestionBank
  questionId     String
  state          MasteryState @default(NEW)
  wrongCount     Int          @default(0)
  correctCount   Int          @default(0)
  streak         Int          @default(0)
  lastResult     Boolean?
  lastSeenAt     DateTime?
  nextReviewAt   DateTime?                    // spaced repetition; null = not scheduled
  markedForReview Boolean     @default(false) // persists TestPage's in-memory flag
  updatedAt      DateTime     @updatedAt
  @@unique([userId, bank, questionId])
  @@index([userId, state, nextReviewAt])
  @@index([userId, markedForReview])
  @@index([bank, questionId])
}
```

Populate on submit (`PyqAttempt` create path and `TestAnswer` writes). A one-off backfill from existing `PyqAttempt.responses` is possible and worth doing — it is the only history you have.

### B7. Tags and assets

```prisma
model Tag {
  id        String   @id @default(uuid())
  slug      String   @unique
  label     String
  kind      String   @default("topic")   // topic | skill | trap | source | qa
  color     String?
  createdAt DateTime @default(now())
  questions QuestionTag[]
  @@index([kind, label])
}

model QuestionTag {
  id         String       @id @default(uuid())
  tagId      String
  tag        Tag          @relation(fields: [tagId], references: [id], onDelete: Cascade)
  bank       QuestionBank
  questionId String
  createdAt  DateTime     @default(now())
  createdById String?
  @@unique([tagId, bank, questionId])
  @@index([bank, questionId])
}
```

```prisma
enum AssetKind    { FIGURE  OPTION  SOLUTION  BRAND  OTHER }
enum AssetStorage { GIT_CDN  DATA_URI  OBJECT_STORE }   // OBJECT_STORE unusable until §E2 is resolved

model Asset {
  id           String       @id @default(uuid())
  kind         AssetKind    @default(FIGURE)
  storage      AssetStorage @default(GIT_CDN)
  url          String                       // jsDelivr/raw.githubusercontent URL, or object key
  path         String?                      // repo-relative path, e.g. pyq-figures/2022/....png
  sha256       String?                      // dedupe + orphan detection
  bytes        Int?
  width        Int?
  height       Int?
  mimeType     String?
  altText      String?
  bank         QuestionBank?
  questionId   String?
  slot         String?                      // "Q" | "A" | "B" | "C" | "D" | "SOL"
  uploadedById String?
  createdAt    DateTime     @default(now())
  @@unique([sha256, storage])
  @@index([bank, questionId])
  @@index([kind, createdAt])
}
```

**Read §E2 before believing this gives you an upload button.** At launch `Asset` is an *inventory* of the ~15,278 PNGs already committed under `pyq-figures/`, backfilled by a script from `PreviousYearQuestion.questionImage/optionAImage/.../solutionImage`. It gives you orphan detection, reuse, and alt text. It does not give you write access to the CDN.

### B8. Non-negotiable fixes bundled into the same migration

```prisma
// FKs that are missing today — three user-owned datasets are unjoinable
model ResumeAnalysis   { userId String   user User @relation(fields:[userId], references:[id], onDelete: Cascade)  @@index([userId, createdAt]) }
model InterviewSession { userId String   user User @relation(fields:[userId], references:[id], onDelete: Cascade) }
model CourseRequest    { userId String?  user User? @relation(fields:[userId], references:[id], onDelete: SetNull) @@index([userId]) }

// Indexes that make every admin list view stop being a sequential scan
model TestSession { @@index([userId, createdAt])  @@index([createdAt])  @@index([examCategoryId]) }
model ExamTopic   { @@index([examCategoryId, order]) }
```

OTP throttle state (proven absent — grep for `lastOtpSentAt|otpAttempts|lockedUntil` returns nothing; a throttle **requires** a migration):

```prisma
model User {
  otpAttempts    Int       @default(0)
  otpLastSentAt  DateTime?
  otpLockedUntil DateTime?
}
model PendingUser {
  attempts     Int       @default(0)
  lastSentAt   DateTime?
  lockedUntil  DateTime?
}
```

**Not proposed, on purpose:** a `Chapter`/`Subject` table for PYQ. `PreviousYearQuestion.subject/topic/chapter/chapterId/subjectId` are free strings across ~15k rows with no FK; normalizing them is a data-cleaning project (fuzzy matching, human adjudication), not a migration. Ship a read-only *derived* taxonomy (`SELECT DISTINCT` + counts) in the CMS first; normalize once you know how dirty it actually is.

---

## C. Backend API surface

**Foundations that gate everything in this table** (see §F Phase 0): a global error handler + 404 handler in `server.js` (there is none — thrown `AppError`s currently return **HTML**, which breaks `res.json()` on the client), a Joi validation middleware on every write, and `requirePermission()` replacing the blanket `adminIdentifier` role check.

**Envelope:** keep `{ success: true, data, meta }`. Standardize `meta` to `{ total, page, limit, pages }` on *every* list (today `/users` emits `pages`, `/sessions` doesn't). Errors become `{ success: false, error: { code, message, fields? } }` — and `questivo/src/lib/api.ts:handleApiError` must be widened to `data.error?.message || data.message || data.error` or every error renders `[object Object]`.

RBAC key: `PUB` public · `AUTH` any signed-in user · `SUP` support+ · `ED` content_editor+ · `REV` reviewer+ · `ADM` admin+ · `SA` superadmin only.

### C1. Auth & admin session
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/verify` | [EXTEND] | SUP | Return `{id, role, permissions[], name, email}` — the frontend currently throws the body away. |
| `POST /api/admin/logout` | [NEW] | SUP | **Does not exist.** `AdminLayout.tsx:64` posts to it, the failure is swallowed at `:66`, and the cookie survives → user is still logged in. Must clear the cookie and bump `tokenVersion`. |
| `POST /api/admin/sessions/revoke/:userId` | [NEW] | ADM | Bump `tokenVersion`; kills all JWTs for that user. Requires `adminIdentifier.js` to compare `decoded.tokenVersion`. |

### C2. Users
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/users` | [EXTEND] | SUP | Add: `role`, `isVerified`, `disabled`, `hasSubscription`, `createdAfter/Before` filters; `sort`; validated `page`/`limit` (today `?limit=abc` → `take: NaN` → 500). |
| `GET /api/admin/users/:id` | [EXTEND] | SUP | **Strip `otpHash`, `otpExpiresAt`, `otpPurpose`** — `adminController.js:60` strips only `passwordHash`. Add subscription, bookmark count, attempt count, resume/interview counts (now joinable via B8). |
| `POST /api/admin/users` | [EXTEND] | ADM | Add Joi: email format, password min-length (**no `required` today**, `UsersPage.tsx:422` sends `password: ""`). |
| `PUT /api/admin/users/:id` | [EXTEND] | ADM | **P0 SECURITY.** `adminController.js:145` spreads `req.body` into `user.update`. Today an admin can set `role`, `otpHash`, `otpExpiresAt` on *any* account — i.e. forge an OTP login for anyone, or self-promote to superadmin. Replace with an explicit allow-list: `name, phone, bio, preferredMedium, isVerified`. |
| `PATCH /api/admin/users/:id/role` | [NEW] | SA | Separate, audited endpoint. Must reject self-demotion and last-superadmin demotion. |
| `PATCH /api/admin/users/:id/disable` | [NEW] | ADM | Soft suspend (`disabledAt`) — the safe alternative to delete. |
| `DELETE /api/admin/users/:id` | [EXTEND] | SA | Add self-delete and last-admin guards; audit; require typed-confirmation. |
| `POST /api/admin/users/:id/password-reset` | [NEW] | SUP | Admin-triggered reset mail. Never returns or sets a password. |
| `GET /api/admin/users/export` | [NEW] | ADM | Streamed CSV, capped, audited. |

### C3. Pending users / OTP ops
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/pending-users` | [EXTEND] | SUP | **P0:** currently `findMany` with no `select` → returns `passwordHash` **and `otpHash`** for every pending signup (`adminController.js:177`). Add `select`. Add pagination. |
| `DELETE /api/admin/pending-users/:email` | [EXTEND] | SUP | `encodeURIComponent` on the client; `decodeURIComponent` server-side. |
| `POST /api/admin/pending-users/:email/resend` | [NEW] | SUP | The page currently offers **no** approve and **no** resend — delete is the only action. |
| `POST /api/admin/users/:id/otp/clear` | [NEW] | SUP | Clears `otpLockedUntil`/`otpAttempts` after a support call. |

### C4. Taxonomy (categories / topics)
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET/POST /api/admin/categories`, `PUT/DELETE /api/admin/categories/:id` | [EXISTS] → [EXTEND] | ED (write), SUP (read) | `PUT` uses `data: req.body` (`:227`) — Prisma treats relation keys as nested writes, so `{"topics":{"deleteMany":{}}}` wipes every child topic. Allow-list to `{name, code, description, isActive}`. Delete must warn: `ExamTopic.onDelete: Cascade`. |
| `GET /api/admin/topics/category/:categoryId` | [EXISTS] | SUP | Fine. |
| `POST /api/admin/topics`, `PUT/DELETE /api/admin/topics/:id` | [EXISTS] → [EXTEND] | ED | Same allow-list fix at `:283`. |
| `POST /api/admin/topics/bulk` | [NEW] | ED | Replaces the client-side `Promise.all` over comma-split names (`CategoriesPage.tsx:164-171`) which reports partial failure as a bare "Some topics failed". Server returns `{created[], failed:[{name, reason}]}`. Also kills the `Math.random()*100` code generator at `:168` — server assigns collision-free codes. |
| `DELETE /api/admin/topics/bulk`, `PATCH /api/admin/topics/bulk/status` | [NEW] | ED | Same rationale. |
| `POST/PUT/PATCH /api/cate_topics/*` | **[DELETE]** | — | **P0 SECURITY.** `src/routes/topicRoutes.js:19,22,25` have **no middleware at all**. Anyone on the internet can create, rename, reorder, or deactivate any topic. They duplicate the guarded `/api/admin/topics` routes, so the guard is bypassable by URL choice. Remove the write routes; keep the two public GETs. |

### C5. PYQ question bank — the actual CMS
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/pyq/questions` | [NEW] | SUP | Paginated, faceted (exam/year/session/shift/subject/chapter/section/status/needsFigure/reviewStatus/tag/hasSolution). Reuses the index set on `PreviousYearQuestion`. |
| `GET /api/admin/pyq/questions/:id` | [NEW] | SUP | Full row + revisions + tags + assets + measured difficulty from `pyqDifficulty.js`. |
| `POST /api/admin/pyq/questions` | [NEW] | ED | Creates as `DRAFT`. |
| `PUT /api/admin/pyq/questions/:id` | [NEW] | ED | Field allow-list; writes a `QuestionRevision` + `AuditLog` in one transaction; bumps `version`. |
| `PATCH /api/admin/pyq/questions/:id/status` | [NEW] | REV | `DRAFT→IN_REVIEW→APPROVED→PUBLISHED`. Editors cannot self-publish. |
| `POST /api/admin/pyq/questions/:id/revert/:version` | [NEW] | REV | Restore from snapshot; creates a new revision (never rewrites history). |
| `DELETE /api/admin/pyq/questions/:id` | [NEW] | ADM | Soft (`deletedAt`). Hard delete: SA only. |
| `GET /api/admin/pyq/questions/:id/revisions` | [NEW] | SUP | |
| `POST /api/admin/pyq/questions/bulk/{tag,status,delete}` | [NEW] | ED / REV / ADM | Server-side batching with per-item result — never `Promise.all` from the browser. |
| `GET /api/admin/pyq/qa-queue` | [NEW] | ED | The triage list that already has data behind it: `status='needs_figure'`, `status='bonus'`, missing `correctAnswer`, missing `solution`, `needsFigure=true` with no image. |
| `GET /api/admin/pyq/taxonomy` | [NEW] | SUP | Derived `DISTINCT subject/chapter/chapterId` + counts. Read-only (see §B8 rationale). |

### C6. PYQ papers
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/pyq/papers` | [NEW] | SUP | List + question counts (manual aggregate — `PyqPaper` and `PreviousYearQuestion` have **no FK**, only matching `paperId` strings). |
| `GET /api/admin/pyq/papers/:id` | [NEW] | SUP | Includes `subjectCounts`, `needsFigureCount`, integrity report (declared `totalQuestions` vs actual rows). |
| `POST/PUT /api/admin/pyq/papers` | [NEW] | ED | |
| `PATCH /api/admin/pyq/papers/:id/publish` | [NEW] | REV | **`PyqPaper.isPublished` exists in the schema and has no write route anywhere.** Cheapest high-value endpoint in this document. |
| `POST /api/admin/pyq/import` | [NEW] | ADM | Wraps `src/lib/pyqImport.js`. Dry-run mode returning a diff before commit. Must call `clearPyqProfileCache()` — which only clears *one instance* (§E4). |

### C7. Mock engine (AI questions + sessions)
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/sessions` | [EXTEND] | SUP | Add `pages` to `meta`; add search by user email, date range, category filter, sort. Page has none today. |
| `GET /api/admin/sessions/:id` | [EXISTS] | SUP | Fine. |
| `DELETE /api/admin/sessions/:id` | [EXISTS] | ADM | |
| `POST /api/admin/sessions/bulk-delete` | [NEW] | ADM | Replaces the browser `Promise.all` at `SessionsPage.tsx:133`. |
| `POST/PUT/DELETE /api/admin/questions[/:id]` | [EXISTS] → [EXTEND] | ED | `POST` returns **200 instead of 201** (`:377`); `PUT` uses `data: req.body` (`:386`) — allow-list it. Add: `correctOption ∈ {A,B,C,D}`, `indexInSession` Int, session existence check. |

### C8. Tags, assets, bookmarks, review states
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET/POST/PUT/DELETE /api/admin/tags[/:id]` | [NEW] | ED | Merge endpoint (`POST /tags/:id/merge`) matters — tag sets get messy fast. |
| `GET /api/admin/assets` | [NEW] | SUP | Inventory + orphan report (asset with no question, question slot with no asset). |
| `PUT /api/admin/assets/:id` | [NEW] | ED | Alt text and slot re-assignment only. **No upload endpoint — see §E2.** |
| `GET /api/admin/users/:id/bookmarks` | [NEW] | SUP | |
| `GET /api/admin/users/:id/mistakes` | [NEW] | SUP | From `UserQuestionState`. |
| `GET/POST/DELETE /api/bookmarks` | [NEW] | AUTH | User-facing; the CMS reads what these write. |
| `POST /api/review-state/sync` | [NEW] | AUTH | Persists `TestPage.tsx:102`'s in-memory `markedForReview`. |

### C9. Billing (manual ledger)
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET/POST/PUT /api/admin/plans[/:id]` | [NEW] | ADM | |
| `GET /api/admin/subscriptions` | [NEW] | SUP | Filter by status/plan/expiry window. |
| `POST /api/admin/subscriptions` | [NEW] | ADM | Manual grant. Audited, `grantedById` recorded. |
| `PATCH /api/admin/subscriptions/:id/cancel` | [NEW] | ADM | |
| `GET/POST /api/admin/payments` | [NEW] | ADM | Hand-entered ledger rows. |
| `POST /api/admin/payments/:id/refund` | [NEW] | ADM | Records a refund; **does not move money** (§E1). |
| `GET /api/entitlements/me` | [NEW] | AUTH | Replaces `PREMIUM_UNLOCKED`. |
| `POST /api/webhooks/:provider` | [NEW-stub] | PUB+sig | Writes `WebhookEvent`, returns 200. Inert until a PSP exists. |

### C10. Analytics & dashboard
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/stats` | [EXTEND] | SUP | Counts only `user`, `testSession`, `examCategory` today. Add: pending users, PYQ question count, paper count, attempt count, active subscriptions, ledger revenue (manual-only, labelled as such). |
| `GET /api/admin/analytics/signups?range=` | [NEW] | SUP | Needs `@@index([createdAt])` on `User` (B8). |
| `GET /api/admin/analytics/attempts?range=` | [NEW] | SUP | From `PyqAttempt` — already indexed `[userId, kind, createdAt]`. |
| `GET /api/admin/analytics/question-performance` | [NEW] | ED | Per-question accuracy from `PyqAttempt.responses`; feeds the QA queue. The genuinely valuable one. |
| `GET /api/admin/analytics/revenue?range=` | [NEW] | ADM | **Reports the manual ledger only. Read §E1 before putting this on a dashboard.** |

### C11. Audit & ops
| Endpoint | Status | RBAC | Notes |
|---|---|---|---|
| `GET /api/admin/audit` | [NEW] | ADM | Filter by actor/action/entity/date. |
| `GET /api/admin/audit/entity/:type/:id` | [NEW] | SUP | "History" tab on every detail page. |
| `GET /api/admin/ops/health` | [EXTEND] | ADM | Fold in `/api/ai/health` and `/api/mail/health`, which today are gated by a plaintext `x-admin-token` header compared with `!==` — and that token is `Secret_Token`, **the JWT signing key**. Move both behind RBAC and delete the header gate. |
| `GET /api/admin/course-requests` | [EXTEND] | SUP | Exists at `pyqRoutes.js:103` behind the same shared-secret header, and is `async` with **no try/catch**. Move under `/api/admin`, add the try/catch. |
| `PATCH /api/admin/course-requests/:id` | [NEW] | SUP | Status transitions on the demand board. |

---

## D. Frontend modules

Root: `C:/Users/LSE/Downloads/Questivo/questivo/src`. Note the existing folder is spelled `componenets/` — keep the typo or rename it in one dedicated commit, not incidentally.

### D0. Shared layer (build first, everything depends on it)
`componenets/admin/ui/` — `Card`, `PageHeader`, `DataTable` (sorting, sticky header, column config, per-row actions), `Pagination`, `SearchInput`, `SegmentedFilter`, `Badge`, `Modal`, `ConfirmDialog` (lifted from `SessionsPage.tsx:62-111`), `EmptyState`, `Skeleton`, `FormField`. All extracted from classes already in use (§A2), so the CMS looks like the current admin on day one.
`lib/adminApi.ts` — typed client with interceptors; `hooks/usePaginatedList.ts` (page/search/sort/filter → URL query params, so lists are deep-linkable — nothing is today); `hooks/useRowSelection.ts` (fixing the filter/select-all data-loss bug); `context/PermissionContext.tsx` fed by `/verify`, plus a `<Can permission="...">` wrapper used by `SidebarItem`.

| Screen | Route | API | Replaces |
|---|---|---|---|
| **Dashboard** | `/admin` | `stats`, `analytics/signups`, `analytics/attempts`, `audit?limit=10` | `pages/Dashboard.tsx` — rewrite. Fix invisible stat icons (`bg-opacity-10`), make rows clickable, add an error state (today failures only `console.error`). |
| **Users list** | `/admin/users` | `GET/POST /users`, `PATCH role/disable`, `DELETE` | `pages/UsersPage.tsx` — extend. Add role/verified/subscription filters, sort, bulk actions, CSV export, URL-synced state, `page` reset on search, encoded query. |
| **User detail** | `/admin/users/:id` | `users/:id`, `subscriptions`, `bookmarks`, `mistakes`, `audit/entity/User/:id`, `password-reset` | `pages/UserProfilePage.tsx` — currently **display-only**. Becomes tabbed: Profile (editable) / Sessions / Attempts / Bookmarks & Mistakes / Billing / History. |
| **Pending signups** | `/admin/pending` | `pending-users`, `resend`, `DELETE` | `pages/PendingUsersPage.tsx` — extend. Add resend-OTP (the only action today is delete), pagination, fix the `<td class="flex">` layout break. |
| **Roles & access** | `/admin/access` | `users?role=`, `PATCH role`, `sessions/revoke` | **New.** No UI exists; `superadmin` is currently settable only via `scripts/upsertAdmin.mjs`. |
| **Taxonomy** | `/admin/taxonomy/:categoryId?` | categories + topics + bulk | `pages/CategoriesPage.tsx` — extend and **route the master/detail** (`selectedCategory` is local state at `:13`; refresh or Back drops you out). Fix select-all-vs-filter, null `code` crash, simultaneous loading+empty render. |
| **PYQ question browser** | `/admin/pyq/questions` | `pyq/questions` (faceted) | **New.** The centerpiece. Facet rail + virtualized table + `SafeMathRenderer` previews + saved views. |
| **PYQ question editor** | `/admin/pyq/questions/:id` | question, `PUT`, `status`, `revisions`, `revert`, tags, assets | **New.** Split-pane source/rendered preview, revision diff, tag picker, image slot manager (read-only until §E2). |
| **QA triage queue** | `/admin/pyq/qa` | `pyq/qa-queue`, `question-performance` | **New.** Worklist: missing figure, missing answer, missing solution, statistical outliers. Highest ROI screen — the data already exists. |
| **Papers** | `/admin/pyq/papers[/:id]` | papers, publish, integrity | **New.** Ships the unused `isPublished` flag. |
| **Import** | `/admin/pyq/import` | `pyq/import` (dry-run → commit) | **New.** UI over `pyqImport.js`. |
| **Mock sessions** | `/admin/sessions[/:id]` | sessions, bulk-delete | `pages/SessionsPage.tsx` + `SessionDetailsPage.tsx` — extend. Add search/filter/sort; guard `questions.map`/`answers.find`; extract and clean up the print engine. |
| **Tags** | `/admin/tags` | tags CRUD + merge | **New.** |
| **Media library** | `/admin/assets` | `assets`, orphan report | **New — browse/annotate only.** §E2. |
| **Billing** | `/admin/billing/{plans,subscriptions,payments}` | C9 | **New.** Every revenue figure carries a visible "manually recorded" label. |
| **Audit log** | `/admin/audit` | `audit` | **New.** Plus a History tab on user/question/paper detail. |
| **Ops** | `/admin/ops` | `ops/health`, `course-requests` | **New.** Replaces two `x-admin-token` curl endpoints. |

---

## E. Blocked / impossible — definitive rulings

### E1. Revenue metrics — **BLOCKED. There is no payment system of any kind.**

Not partial, not stubbed: **zero**. Verified independently of the surveys — `grep -riE "razorpay|stripe|paypal|cashfree|phonepe|paytm|subscriptionId|isPremium|premiumUntil|planId|billingCycle"` across `server-qusestivo/src`, `server-qusestivo/prisma`, and `questivo/src` returns nothing. Neither `package.json` contains a payment SDK. No migration mentions payment/order/subscription/invoice/transaction. `.env.example` (152 lines) has no gateway keys. Premium is one constant: `questivo/src/lib/premium.ts:35 PREMIUM_UNLOCKED = false`, whose own docstring says entitlement "would need a plan on the user record, which does not exist yet." The actual sales channel is `PREMIUM_CONTACT_PHONE` — a phone number.

Therefore MRR, ARR, churn, LTV, ARPU, conversion rate, cohort retention, failed-payment recovery, and refund reconciliation **cannot be computed, estimated, or backfilled**. There is no historical transaction data to derive them from, and there never was. Any dashboard tile showing them would be fabricated.

**Honest alternative:** ship §B2 + §C9 as a *manual ledger*. An admin records each phone/UPI sale as a `Payment` row and grants a `Subscription`. That yields real, auditable revenue-to-date, active-subscriber count, expiring-soon lists, and per-plan mix — all correct from the day someone starts typing them in, all zero before that. Label every revenue widget "manually recorded — not gateway-verified." Real MRR/churn arrives only after a PSP integration (Razorpay for INR), which is a separate project: gateway account, KYC, checkout UI, webhook endpoint with signature verification, idempotency, reconciliation. Estimate 2–3 weeks after the CMS, not inside it.

### E2. Image crop / compress / upload — **BLOCKED for upload. Crop and compress are fine; there is nowhere to put the result.**

There is **no blob storage configured**: no `@aws-sdk`, `aws-sdk`, `cloudinary`, `@google-cloud/storage`, or `supabase` in either `package.json` (verified), and `.env.example` has zero `S3|BUCKET|STORAGE|BLOB` keys (verified). What exists instead:

1. **~15,278 PNG crops committed to the git repo** under `pyq-figures/`, served over the jsDelivr GitHub CDN. `PreviousYearQuestion.questionImage/optionA..DImage/solutionImage` hold plain URL strings pointing there. They are written **only by CLI scripts** — `scripts/linkPyqFigures.mjs` (`--base https://cdn.jsdelivr.net/gh/...`), `scripts/convertJeeAdvancedAllen.mjs`, `scripts/pruneFigures.mjs`, `src/lib/pyqImport.js:294`. **No API route sets these fields.**
2. **Data URIs in the DB** — `diagramImage String? @db.Text`, populated by `src/lib/driveDiagrams.js` from Google Drive.
3. **`multer.memoryStorage()`** in `src/routes/resumeRoutes.js:11` and `src/routes/interviewRoutes.js:12` — files are parsed and discarded, never persisted.

An HTTP request cannot write to the CDN. Publishing a new figure means: write the file into the repo → `git commit` → `git push` → wait for jsDelivr to pick it up (and jsDelivr aggressively caches, so *replacing* a file at the same path is not reliably immediate). That is a deploy, not a save button. Anyone who tells you the CMS can have an upload button without new infrastructure is wrong.

**Honest alternatives, in order of cost:**
- **Now, zero infra:** crop and compress in the browser (`<canvas>` — free, no dependency), then persist the result as a data URI into the existing `@db.Text` column, capped hard at ~200 KB after compression. This *works today* and reuses the exact pattern `driveDiagrams.js` already writes. It bloats row size and is not CDN-cached — acceptable for the QA-queue long tail (fixing a few hundred `needsFigure=true` rows), not for a bulk migration.
- **Now, zero infra:** `Asset` (§B7) as a read-only inventory + orphan report over the existing 15k files. Genuinely useful; no upload.
- **~1 day + a paid account:** Cloudflare R2 or S3 + presigned PUT. This is the correct answer and it is small work — but it is **new infrastructure, new credentials, new cost, and a new failure mode**, and it must be a stated decision, not a surprise inside "build the CMS."

### E3. PDF / file manager — **BLOCKED, same root cause.**

`mupdf`, `pdfjs-dist`, and `pdf-parse-fork` are dependencies, but they are *parsers* used by the resume and PYQ-conversion pipelines. There is no `File`/`Document`/`Upload` model, no storage backend, and no route that persists an uploaded file. A "PDF manager" needs exactly the storage tier E2 says doesn't exist, plus a file table.

**Honest alternative:** the CMS can *generate* PDFs client-side today — the print engine at `SessionDetailsPage.tsx:31-227` already produces exam-quality paper output via `window.print()`, KaTeX fixes included. Generalize it to "export this paper / this question set as PDF" (browser print-to-PDF). That covers the realistic need (hand a paper to a student) without any storage. Storing, versioning, and re-serving uploaded PDFs waits for E2.

### E4. Horizontal scaling on Vercel — **BLOCKED, and the premise is wrong: the backend is not on Vercel.**

`questivo/vercel.json:38-42` rewrites `/api/:path*` → `https://questivo.onrender.com/api/:path*`. Vercel hosts only the static Vite build — no `functions`, no `builds`, no `api/` directory. `server-qusestivo/package.json:8` is `"start": "node server.js"`, a long-lived `server.listen` process with a Socket.IO server attached; Vercel's serverless model cannot host it, and there is no `/socket.io` rewrite — the browser connects to Render directly (`LiveInterviewPage.tsx:38`). Porting to Vercel functions would mean deleting the live-interview feature.

Even on Render, **N>1 is currently incorrect**, not merely inefficient:
- `src/agentic-mock-test/interviewSocket.js:11` `globalSessionMemory` — a `Map` holding interview history, the `aiBusy` mutex, and `timeRemaining`. A reconnect landing on another instance restarts the interview from turn one *and resets the timer to full*, because the join handler at `:105` never replays the `interviewMessage` rows it already writes. Entries are never deleted on disconnect (`:233`) — unbounded leak.
- `interviewSocket.js:12` `ttsBufferCache` — unbounded, uncapped audio Buffer map.
- `src/lib/aiClient.js:138` `modelCooldowns` + the `cred.disabled`/`cooldownUntil` mutations at `:83-84, 94, 123` — Groq 429s and key revocations are learned per-process; N instances each burn the same per-key daily quota independently, and `/api/ai/health` reports one instance's private view.
- `pyqRoutes.js:29,37,50` — three `rateLimit()` calls with the default in-process `MemoryStore`, so limits multiply by N.
- `src/prismaClient.js:18` — `new Pool()` with no `max` → 10 connections per process; N=4 is 40 connections, which Neon/Supabase will refuse.
- `authController.js:692` — a module-level `setInterval` firing on every instance, with no `unref()`, so it also blocks SIGTERM draining.
- No Redis anywhere: neither `package.json` has `redis`, `ioredis`, `rate-limit-redis`, or `@socket.io/redis-adapter`; `.env.example` has no Redis URL. **PostgreSQL is the only shared state in the system.**

And one thing is broken *right now, at one instance*: `app.set('trust proxy', ...)` is never called. Because all REST traffic arrives via the Vercel rewrite, `req.ip` is a Vercel edge IP, so `pyqRoutes.js:37`'s `max: 10` course requests/hour is a **single global bucket for the entire internet**. Fix this before anything else; use a hop count, not `trust proxy: true` (which lets anyone spoof `X-Forwarded-For`).

**Honest alternative:** scale vertically on Render first — it is genuinely sufficient for this traffic. To reach N>1 safely: (a) `trust proxy`; (b) rebuild interview history from the already-persisted `interviewMessage` rows and move `timeRemaining` to a server-side `startedAt` — this needs **no new infrastructure** and also fixes same-instance reconnects; (c) cap the pg pool and point `DATABASE_URL` at a pooler; (d) then, and only then, add Redis for the rate-limit store, the Socket.IO adapter, and AI credential health. Note that sticky sessions alone do not fix (b) — affinity breaks precisely on deploy and scale-in, which is when reconnects happen.

### E5. Other things that cannot honestly be built as asked

| Ask | Ruling | Honest alternative |
|---|---|---|
| One unified question list across both banks | **Impossible as a single query.** `TestQuestion` and `PreviousYearQuestion` share no base table, no interface, no FK; different column names, nullability, and semantics (`correctOption` vs `correctAnswer`). | Two tabs sharing one `DataTable` component, plus a `QuestionBank` discriminator on tags/bookmarks/revisions (§B4). A true union needs a data migration into a shared table — a rewrite of the mock generator, not a CMS feature. |
| "Who changed what" for existing content | **Impossible retroactively.** No audit table, no `createdBy`/`updatedBy` anywhere, and `PreviousYearQuestion`/`TestQuestion`/`TestSession`/`PyqAttempt` have **no `updatedAt` at all**. | History starts the day `AuditLog` ships. Say so in the UI: "History available from <date>." Do not backfill guesses. |
| Numerical/NAT questions in the mock bank | **Structurally impossible today.** `TestQuestion.optionA..optionD` are NOT NULL and there is no `questionType`. | PYQ bank already supports it (`questionType`, `correctAnswer`). Either restrict the mock CMS to MCQ or scope a separate breaking change to `TestQuestion` + the generator. |
| Authored per-question difficulty for PYQ | **Deliberately absent**, and re-adding it as the primary is a regression. `src/lib/pyqDifficulty.js` computes it from ≥8 real attempt responses; a hand-set column that's null for 15k rows filters to everything or nothing. | Show measured difficulty as primary, allow an optional `authoredDifficulty` override shown only where measured data is missing (<8 responses). |
| Safe chapter rename/merge for PYQ | **No referential integrity.** `subject`/`topic`/`chapter`/`chapterId` are free strings with no FK; a rename is a mass `UPDATE` with no rollback. | Read-only derived taxonomy first (§C5); a guarded rename tool that previews the affected row count, runs in a transaction, and writes an `AuditLog` — only after you've seen how dirty the strings actually are. |
| Real-time collaborative editing / presence in the CMS | **Not feasible.** Socket.IO exists but has no adapter, `cors: {origin:'*'}`, and every emit is `socket.emit` — rooms are created and never broadcast to. | Optimistic-concurrency instead: `If-Match` on `version`, 409 on conflict, "someone else edited this" dialog. Covers the actual risk (two editors clobbering each other) at ~1% of the cost. |

---

## F. Build order

Phases are dependency-ordered. Nothing in a later phase is safe to start before its predecessors land.

### Phase 0 — Security & correctness (blocking; ~3–5 days)
Do not build CMS features on top of these holes.
1. Remove the write routes from `src/routes/topicRoutes.js:19,22,25` — unauthenticated create/update/deactivate on any topic, reachable from the open internet.
2. Field allow-lists on all four `data: req.body` handlers (`adminController.js:152, 227, 283, 386`). The user one is a privilege-escalation and OTP-forgery vector.
3. `select` on `getPendingUsers` (`adminController.js:177`) and strip `otpHash`/`otpExpiresAt`/`otpPurpose` from `getUserById` (`:60`).
4. Global error handler + 404 handler in `server.js`, wired to the already-written `src/utills/errorHandler.js`. Fixes HTML-instead-of-JSON on every `AppError`, CORS rejection, and malformed-JSON body.
5. `app.set('trust proxy', <hop count>)` — the three live rate limiters are currently one global bucket.
6. Joi validation middleware (fix `src/middleware/messageValidator.js` to ESM) on every write; validated + clamped `page`/`limit` (today `?limit=abc` → 500, `?limit=1000000` dumps the table).
7. `POST /api/admin/logout` — it does not exist; logout currently does not log anyone out.
8. Delete `src/utills/db.js`, `src/middleware/rateLimiter.js`, `src/middleware/advancedRateLimiter.js` (CommonJS in an ESM package, unimported, and the first would create a second connection pool).
9. Stop logging secrets: `prismaClient.js:31` query logging in prod, `adminController.js:31`, `authMiddleware.js:6`, `authController.js:393, 405-415` (logs OTP hashes).

### Phase 1 — Foundation (blocking for every screen; ~1 week)
10. **Migration 1**: `UserRole` enum + `tokenVersion`/`disabledAt`/`lastLoginAt`; `AuditLog`; the missing FKs and indexes from §B8; OTP throttle columns.
11. `src/lib/permissions.js` (frozen role→permission matrix) + `requirePermission()` layered on `adminIdentifier.js`; `tokenVersion` check in the middleware.
12. Audit middleware — one wrapper, redacting secret fields.
13. Envelope + `meta` standardization across all list endpoints; `handleApiError` widened client-side.
14. OTP throttle + verify-attempt lockout on the seven auth surfaces, emitting `{message}` (not `{error}`) so `SignupPage.tsx:264-270` renders it; plus the resend/cooldown UI, which does not exist in any form today.
15. Frontend shared layer §D0: `ui/*`, `adminApi.ts`, `usePaginatedList`, `useRowSelection`, `PermissionContext`, `ConfirmDialog`. Fix the dead Tailwind classes here (§A3) — do it once, centrally.

### Phase 2 — Rebuild what exists, properly (~1 week)
16. Users list + user detail (tabbed, editable) + roles screen + pending signups with resend.
17. Taxonomy screen: routed master/detail, server-side bulk endpoints, select-all/filter fix, server-assigned topic codes.
18. Sessions list/detail: search, filters, sort, server-side bulk delete, guarded rendering, extracted print engine.
19. Dashboard rebuild on the extended `/stats`.
**Checkpoint:** at this point the existing admin is strictly better and nothing new has been promised. Ship it.

### Phase 3 — The actual CMS (~2 weeks)
20. **Migration 2**: `QuestionRevision`, `ReviewStatus`/`QuestionBank` enums, editorial columns + `updatedAt` on `PreviousYearQuestion`, `Tag`/`QuestionTag`, `Asset`.
21. PYQ question browser (faceted list) → question editor (revisions, revert, status workflow) → QA triage queue.
22. Papers list/detail + the `isPublished` write route (schema flag that has never had an endpoint).
23. Tags CRUD + merge; `Asset` backfill script + read-only media library with orphan report.
24. Import UI over `pyqImport.js` with dry-run diff.

### Phase 4 — User study state (~4–5 days)
25. **Migration 3**: `Bookmark`, `UserQuestionState`, `MasteryState`.
26. Write path on attempt submit (`PyqAttempt` create + `TestAnswer`); backfill `UserQuestionState` from existing `PyqAttempt.responses` — the only history that exists.
27. User-facing bookmark + review endpoints; persist `TestPage.tsx:102`'s in-memory `markedForReview`.
28. Admin read views on user detail.

### Phase 5 — Monetization, manual (~4–5 days)
29. **Migration 4**: `Plan`, `Subscription`, `Payment`, `WebhookEvent` + enums.
30. Billing screens; `GET /api/entitlements/me`; replace `premium.ts:PREMIUM_UNLOCKED` with a server-checked entitlement — this is the first time premium is actually enforced rather than promoted.
31. Revenue tiles fed **only** by the manual ledger, labelled as such.

### Phase 6 — Scale prep, only if traffic demands it (~1 week)
32. Rebuild interview history from `interviewMessage` rows; move `timeRemaining` to a server-side `startedAt`. No new infra; also fixes same-instance reconnects.
33. Cap the pg pool; point `DATABASE_URL` at a pooler; graceful SIGTERM (`server.close` + `io.close` + `prisma.$disconnect` + clear the interval); move the `pendingUser` sweeper to a cron.
34. Temp-WAV cleanup in a `finally` + `os.tmpdir()` (three orphaned `transient_speech_*.wav` files are checked into the repo right now); bound `ttsBufferCache`.
35. **Then** Redis, if and only if N>1: `rate-limit-redis` store, `@socket.io/redis-adapter`, shared AI credential health.

### Deferred / separate projects — do not let these leak into the CMS scope
- Razorpay integration (E1) — real MRR/churn.
- R2/S3 + presigned uploads (E2) — real media library, PDF manager.
- PYQ taxonomy normalization (`Subject`/`Chapter` tables) — a data-cleaning project.
- `TestQuestion` restructure for numerical questions — breaks the generator.