# Schema Behavior

## Contents

1. Required and optional
2. Computed and optional+computed
3. Defaults
4. Sensitive and write-only
5. Replacement
6. Validators and relationships
7. Plan modifiers
8. Normalization and API authority

## 1. Required and optional

### Required

- Prove minimal valid create and update/replacement mapping.
- Test omission once when schema wiring is risky, generated, or previously regressed; the Framework owns ordinary `Required` enforcement.
- Exhaustively unit-test provider-owned validators and cross-attribute rules, including null and unknown handling.
- Do not invent remove-to-null success for a required field.
- A required field that import cannot reconstruct deserves explicit design review and may require an import ignore only when unavoidable.

### Optional

Use the four-transition minimum for each distinct provider/API behavior:

1. Create omitted to null or documented default.
2. Create/configure A to A or supported canonical A.
3. Update A to B.
4. Remove B to omitted, returning to null/default/reset.

Add explicit null, empty, unknown, normalization, validation, or replacement cases only when the implementation or API distinguishes them.

## 2. Computed and optional+computed

### Computed

Cover applicable promises:

- Create planning marks a server-generated value unknown unless it can be planned safely.
- Apply makes it known.
- Update and refresh reproduce current API truth.
- An API value becoming absent clears stale state or follows an explicit preservation/error contract.
- Import reconstructs stable readable values. Volatile values may require a justified ignore or non-exact assertion.

`UseStateForUnknown` is appropriate only when the prior value is safe for the planned operation. It must not conceal statuses, timestamps, or other fields that can legitimately change during Read.

### Optional+computed

Test both modes:

| Mode | Scenarios |
|---|---|
| Unconfigured/API-selected | Create omitted, API value after apply, API drift accepted on refresh, API value disappears, import if readable. |
| Configured | Create A, update A to B, remote drift, removal returning control to API/default, import if readable. |

State the authority contract explicitly. A configured known value generally cannot be silently replaced by API-canonical B unless the schema uses a framework-supported semantic-equality or planning design. The acceptance criterion is a stable final plan.

## 3. Defaults

Distinguish three mechanisms:

- Framework static default: planning supplies D when configuration is null.
- Custom provider default: custom default logic supplies a planned value and diagnostics.
- API default: provider omits the request field and Read returns an API-selected value; model this as computed or optional+computed behavior, not merely a framework default.

Test omission, explicit override, changed override, and removal back to the default. Unit-test custom default success/error, null/unknown inputs, dependencies, and nested default ordering. Do not unit-test the implementation of HashiCorp's built-in static defaults.

## 4. Sensitive and write-only

### Sensitive

`Sensitive` controls display metadata; the value remains in plan/state.

- Prove the value reaches the API only when provider mapping is material.
- Add representative `statecheck.ExpectSensitiveValue` or plan sensitivity coverage when provider wiring is at risk.
- Gate JSON sensitivity checks to Terraform 1.4.6+ when required by the pinned testing library.
- Import only when Read can reconstruct the value; sensitivity itself does not decide import relevance.
- Never print or exact-assert a real secret where a failing check could expose it.

### Write-only

Write-only arguments require Terraform 1.11+ and apply only to managed-resource arguments.

- The attribute must also be required or optional and cannot be computed.
- Values are available from configuration, not persisted plan/state.
- Set and set-nested write-only attributes are unsupported.
- A write-only single/list/map nested parent requires write-only children.
- Import cannot reconstruct the secret value.

Test required create or optional omission, provider request effect, null state artifacts, and the configured trigger used for later changes. Since no prior value exists, use a version/keeper attribute or secure private-state hash to determine change intent. Verify through a safe observable API result, synthetic authentication, or fake-client checksum—not by echoing the secret into state.

## 5. Replacement

Each distinct replacement rule needs two proofs, which can share one applied step:

1. Pre-apply plan action is `ResourceActionReplace` or the contractual create/destroy order.
2. Applied lifecycle changes identity and removes the old remote object.

Also test null/configured transitions and both branches of conditional replacement where supported. Identical built-in modifiers may share representative lifecycle coverage, but every separately wired replacement attribute should have enough coverage to catch accidental omission.

Do not accept only an ID change: Update could incorrectly delete/recreate internally. Do not accept only a replacement plan: cleanup may leak the prior object.

## 6. Validators and relationships

For custom scalar/range validators table-test:

- Ordinary valid value.
- Exact minimum/maximum.
- Immediately inside and outside each boundary.
- Distinct invalid semantic classes.
- Null and unknown, which normally defer unless a relationship can be decided.
- Diagnostic severity/path; exact prose only when contractual.

For relationships cover the complete truth table implemented:

| Rule | Cases |
|---|---|
| Conflicts with | Neither if allowed, A only, B only, both invalid. |
| Required together | Neither if allowed, all present, each meaningful partial set invalid. |
| Exactly one of | Each singleton valid, none invalid, multiple invalid. |
| At least one of | Each representative singleton and multiple valid, none invalid. |
| Conditional requirement | Trigger inactive, active with dependent, active without dependent. |
| Value relationship | Valid/invalid known pairs plus null/unknown combinations. |

Acceptance-test representative wiring and confirm invalid configuration cannot mutate the API. Do not reproduce the exhaustive upstream tests for stock validators.

## 7. Plan modifiers

Unit-test custom modifiers with create/update/destroy raw state and known/null/unknown configuration, plan, and prior state. Assert planned value, diagnostics, and replacement flags.

| Modifier | Required proof |
|---|---|
| `RequiresReplace` | Unchanged no-op; change replacement; applied identity and cleanup. |
| Conditional replace | Predicate false and true; null/unknown behavior. |
| `RequiresReplaceIfConfigured` | Unconfigured API value does not replace; configured change replaces. |
| `UseStateForUnknown` | Create remains unknown; safe update uses prior state only in intended cases; Read still refreshes remote truth. |
| Custom normalization/default | Planned canonical/default value and stable state; diagnostics. |

Child modifiers under list/set nesting do not automatically receive realigned prior state after element removal or reorder. Test removal/reorder/identity changes or move logic to a stable collection/key level.

## 8. Normalization and API authority

Normalization needs both value and no-diff proof:

- Noncanonical create produces supported canonical state.
- Equivalent spelling/order produces no perpetual diff.
- A genuinely different value still updates.
- Refresh and import produce the same canonical representation.
- API sorting, deduplication, rounding, defaults, and omissions use schema semantics that Terraform can represent consistently.

Never conceal API disagreement by copying configuration into state. Fix the schema, custom type/semantic equality, plan behavior, or API mapping so the stable contract is explicit.
