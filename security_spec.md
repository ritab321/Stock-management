# Security Specification — Pramanik Stock Manager

## 1. Data Invariants
1. **Verified Staff Gate**: Every read and write on business collections (`products`, `stock_batches`, `suppliers`, `shops`, `purchases`, `purchase_items`, `sales`, `sale_items`, `stock_movements`, `payments`, `returns`, `audit_logs`, `settings`) requires `request.auth != null && request.auth.token.email_verified == true` AND either the bootstrapped Owner email (`pramanikdigitalpoint@gmail.com`) or an active `users/{uid}` profile with `active == true`.
2. **Prevent Self-Assigned Privilege Escalation**: Users cannot assign themselves `'owner'` or arbitrary roles during signup. `users/{uid}` creation is strictly gated by `staff_invites` created by the Owner (except the bootstrapped Owner email). Only the Owner can update `role` or `active` on any user.
3. **PII Isolation**: `users/{uid}` documents (containing email and phone) can only be read by the user themselves, Managers, or the Owner. `staff_invites` can only be read by the Owner or the invited email address (`email_verified == true`).
4. **Immutable Financial & Audit History**:
   - `payments` cannot be deleted (`allow delete: if false` except Owner removing explicitly tagged `isDemo == true` test records). Reversals are tracked via `status: 'reversed'` + `reversalReason` + `reversedBy`, restricted to `owner` and `accounts`.
   - `stock_movements` and `audit_logs` cannot be updated (`allow update: if false`). Demo cleanup by Owner is scoped strictly to `existing().isDemo == true`.
5. **Strict Schema & Volumetric Limits**: Every document write validates required keys, allowed keys (`hasOnly`), string `.size()` bounds, regex-safe IDs (`^[a-zA-Z0-9_\\-]+$`), numeric sanity, and `request.time` server timestamps (`createdAt == request.time`, `updatedAt == request.time`).
6. **Role-Scoped Writes**:
   - `Sales Staff` cannot create/update `purchases`, `suppliers`, `settings`, or reverse `payments`.
   - `Stock Manager` cannot create/update `sales`, `payments`, or `settings`.
   - `Accounts Staff` cannot modify `settings` or `users` roles.
   - Only `Owner` can toggle `settings.allowNegativeStock`, manage `users`/`staff_invites`, or clear `isDemo` data.

## 2. Adversarial "Dirty Dozen" Test Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: Read `/products/prod_1` with `auth == null`.
2. **Unverified Email Spoof**: Write `/users/uid_x` with `email: "pramanikdigitalpoint@gmail.com"` and `email_verified: false`.
3. **Self-Privilege Escalation**: Non-owner creates `/users/uid_x` with `role: "owner"` without an owner-issued invite.
4. **Role Tampering on Update**: Sales staff updates `/users/uid_sales` changing `role` from `"sales"` to `"owner"`.
5. **Ghost / Shadow Field Injection**: Manager creates `/products/prod_1` with an undeclared field `adminOverride: true`.
6. **ID Poisoning**: Owner creates `/shops/${'a'.repeat(200)}` (exceeding 128 chars or containing invalid chars `$`, `/`, `@`).
7. **Timestamp Forgery**: Manager creates `/sales/sale_1` with client-forged `createdAt` not equal to `request.time`.
8. **Unauthorized Payment Deletion**: Accounts or Sales staff attempts `delete` on a real (`isDemo: false`) `/payments/pay_1`.
9. **Unauthorized Payment Reversal**: Sales staff attempts `update` on `/payments/pay_1` to set `status: "reversed"`.
10. **Sales Staff Purchase Injection**: Sales staff attempts `create` on `/purchases/pur_1`.
11. **Stock Manager Setting Tampering**: Stock manager attempts `update` on `/settings/business_profile` setting `allowNegativeStock: true`.
12. **Audit Log Tampering**: Manager attempts `update` on `/audit_logs/log_1` to alter `details`.
