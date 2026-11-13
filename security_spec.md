# HospitalOS Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Strict Ownership & PII Isolation**: Every document across `/wards`, `/beds`, `/patients`, `/doctors`, `/appointments`, `/medicines`, `/lab_tests`, and `/bills` must belong to the authenticated user (`ownerId == request.auth.uid`) with a verified email (`request.auth.token.email_verified == true`).
2. **Immutable Metadata**: `ownerId`, `id`, and `createdAt` can never be mutated during an `update` operation.
3. **Temporal Integrity**: `createdAt` must equal `request.time` on `create`, and `updatedAt` must equal `request.time` on both `create` and `update`.
4. **Strict Key & Size Boundaries**: Every write must match the exact key allowlist (`hasAll` + `hasOnly`) and respect string length / numeric bounds defined in `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Creating a patient with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Creating a ward with `email_verified == false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing**: Creating a bed with `ownerId: "victim-uid"` when authenticated as `"attacker-uid"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Updating a bed with an undeclared field `{"is_occupied": true, "isAdmin": true}` -> `PERMISSION_DENIED`.
5. **Cross-Tenant PII Read**: Reading `/patients/pat-1` owned by another user -> `PERMISSION_DENIED`.
6. **Blanket List Query Scraping**: Listing `/patients` without `where("ownerId", "==", uid)` -> `PERMISSION_DENIED`.
7. **ID Poisoning Attack**: Creating a document with a 500-character ID or invalid characters -> `PERMISSION_DENIED`.
8. **Value Poisoning on Update**: Updating `medicines.stock_quantity` with a string `"unlimited"` -> `PERMISSION_DENIED`.
9. **Immortal Field Mutation**: Attempting to modify `createdAt` or `ownerId` during an update -> `PERMISSION_DENIED`.
10. **Forged Client Timestamp**: Sending a backdated `createdAt` or `updatedAt` that does not equal `request.time` -> `PERMISSION_DENIED`.
11. **Invalid Status Enum**: Setting `bills.paid_status` to `"Forgiven"` (outside `['Unpaid', 'Partial', 'Paid']`) -> `PERMISSION_DENIED`.
12. **Resource Exhaustion String**: Sending a 10KB string into `patients.diagnosis` (max 200 chars) -> `PERMISSION_DENIED`.
