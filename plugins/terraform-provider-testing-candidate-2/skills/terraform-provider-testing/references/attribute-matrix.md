# Attribute and lifecycle test matrix

## Contents

- [How to use the matrix](#how-to-use-the-matrix)
- [Common lifecycle matrix](#common-lifecycle-matrix)
- [Primitive attributes](#primitive-attributes)
- [Collections](#collections)
- [Structured and collection-nested attributes](#structured-and-collection-nested-attributes)
- [Schema behavior](#schema-behavior)
- [Computed values](#computed-values)
- [Conditional matrices](#conditional-matrices)
- [CRUD, refresh, drift, and import](#crud-refresh-drift-and-import)

## How to use the matrix

`Plan` describes the expected provider-visible result. `Layer` is U (unit), A (acceptance), or B (both). `Import` says whether imported state should normally verify the value. Select representative rows based on provider/API behavior; do not multiply every type by every behavior.

## Common lifecycle matrix

| Attribute contract | Configuration transition | Expected plan and state | Layer | Import |
|---|---|---|---|---|
| Required, readable | absent → validation; valid create | Absent configuration fails before API; valid value persists/canonicalizes | A; U for custom validation | Yes |
| Optional scalar | omitted create | No diff after apply; state is null or documented provider/API default | A | If API returns it |
| Optional scalar | omitted → value A | In-place update unless replacement; state A | A | Yes |
| Optional scalar | A → B | In-place update; state B | A | Yes |
| Optional scalar | B → omitted | In-place update; state null/default, with no perpetual diff | A | If readable |
| Computed | create | Plan may be unknown; API-produced value becomes known in state | A | Yes |
| Computed | refresh/update | Read replaces prior state with current API value; drift is visible/stable | A; U mapping | Yes |
| Optional + computed | omitted → API value | Unknown or prior state during plan as modifier dictates; API/default value after apply | A | Yes |
| Optional + computed | configured → API canonical/generated result | Config is honored if contract says so; state follows documented canonical result without inconsistency | A | Yes |
| Sensitive | create/update | Same value semantics as its base type; CLI output is redacted | A only if provider wiring/risk merits | Yes, because stored |
| Write-only | create/update | May be configured but must not be persisted/read back; change reaches API; protocol/version requirements hold | B | No; ignore explicitly |
| Defaulted | omitted, explicit non-default, remove | Plan/state default when omitted; configured value wins; removal restores default | B for custom default; A for API default | If API-readable |
| Requires replacement | A → B | Plan has destroy/create replacement, not update; new remote identity/state after apply | B when custom, otherwise A | Yes for new object |

Required attributes do **not** need omitted-after-values, removal-to-null, or omitted-create success cases. Test missing configuration diagnostics and any validator boundaries. Terraform/Framework already enforce the required flag; acceptance coverage verifies schema wiring, while unit tests are useful only for custom validation or schema inspection already conventional in the repository.

## Primitive attributes

Apply the common lifecycle rows once per distinct mapping/semantic path, not blindly once per field.

| Type | General cases | Specialized cases only when present |
|---|---|---|
| String | empty versus non-empty if API distinguishes; Unicode and whitespace only when supported | case/whitespace normalization; enum/length/pattern; canonical IDs; empty-as-null conversion |
| Boolean | false and true, including omitted versus explicit false for optional fields | API default different from zero value; tri-state null/false/true mapping |
| Integer | zero, positive representative, negative if domain permits | min/max and adjacent values; overflow/conversion width; API unit conversion |
| Number | zero and representative exact decimal | precision/canonicalization and boundaries; avoid fragile string formatting assertions |
| Float | zero and representative fraction | tolerance/rounding, NaN/infinity rejection if reachable, API precision loss |

Unknown primitive values generally arise during plan from references or computed values. Do not test Core's propagation itself. Unit-test provider validators/modifiers that branch on unknown/null, and acceptance-test a real unknown only when it affects provider planning.

## Collections

Run the following baseline for every **distinct collection behavior**. It is often efficient to cover transitions in two acceptance tests: cardinality/null semantics and mutations.

| Scenario / transition | Expected plan and state | Layer | Import |
|---|---|---|---|
| omitted/null create | null or documented default; no perpetual diff | A | If API-readable |
| explicit `[]`/`{}` create | empty if API/provider preserves empty; otherwise documented normalization | A | If distinction survives API |
| empty → one → many | in-place changes and exact members | A | Yes |
| update existing element/value | intended element/value changes only | A; U expand/flatten | Yes |
| add then remove one | correct membership/cardinality | A | Yes |
| many → empty | remote and state completely cleared | A | Yes |
| populated → omitted | remote cleared/defaulted; state null/default, not stale | A | If readable |
| null/empty/unknown conversion | custom code produces no panic, invalid request, or false diff | U; A only for meaningful plan behavior | No for unknown |
| external member change | refresh reconciles and next plan reports drift as contract dictates | A | No |

Type-specific additions:

- **List:** assert index/order preservation; reorder and confirm whether it produces an update or API canonical order. If the API is unordered, a list is suspect—normalize deterministically or use a set and test no reorder diff.
- **Set:** configure reversed order and duplicates only where Terraform configuration can express them; assert order independence and uniqueness. Do not assert serialized order. Test stable element identity/hash for objects.
- **Map:** test key addition, value update, key removal, clearing, and re-omission. Include unusual valid keys if provider code parses keys.

Terraform Core guarantees ordinary list ordering, set uniqueness/order-insensitive comparison, and map key semantics. Provider tests should prove schema selection, conversion, API round trips, canonicalization, and object identity—not reimplement Core's tests.

## Structured and collection-nested attributes

### Single object / nested attribute

Test omitted/null when optional; minimal object; fully populated object; update one child; add/remove optional child; remove the object; child validator failure; and API omission of a child. Test unknown children only if custom conversion, validation, or modification observes them. A required parent does not imply every child is required—exercise child contracts independently.

### List nested

Apply list ordering plus: one/multiple objects, update a child in place, add/remove an object, clear/re-omit, and reorder. Assert stable mapping when the API assigns child IDs or reorders results.

### Set nested

Apply set semantics plus: update a child that participates in element identity, update one that does not, add/remove objects, clear/re-omit, and API reordering. A changed object often appears as remove+add; ensure that is intended and produces no perpetual diff.

### Map nested

Apply map key operations plus: update a child under an existing key, add/remove optional children, rename a key (remove+add), clear/re-omit, and verify API object keys round-trip.

Use unit tests heavily for object expand/flatten, especially null/unknown child handling. Acceptance-test representative nested transitions and all known API canonicalization/identity risks.

## Schema behavior

| Behavior | Scenario and transition | Expected plan/state | Layer | Import |
|---|---|---|---|---|
| Optional | four scalar transitions or collection baseline | null/default semantics remain stable | A | Usually |
| Computed | unknown plan → API value; refresh mutation/disappearance | current API truth, subject to explicit preservation rules | A | Yes |
| Optional + computed | omitted/configured/remove and API changes | configured-vs-generated precedence is documented and stable | A; U modifier | Yes |
| Sensitive | diagnostic/plan output handling if provider customizes it | redacted UI, still in state | Schema/unit or A | Yes |
| Write-only | create/change/remove; API rejects missing secret when relevant | never in state; request gets configured value | B | No |
| Default | omitted/override/remove | plan or post-read default restored | B custom; A integration | If readable |
| Replacement | initial value → changed value | replacement plan and create/delete lifecycle; Update not used | B custom; A | Yes |

## Computed values

Cover these only when possible under the API contract:

1. Create returns generated value: planned unknown becomes known.
2. Update changes a computed value (revision, timestamp, status): refreshed state changes.
3. Refresh changes it out of band: state adopts API value; configuration drift appears only where configurable.
4. API omits or nulls it: state becomes null unless a documented plan modifier/provider rule preserves prior state.
5. `UseStateForUnknown` or custom preservation: stable immutable values retain prior state during plan, but Read must still reconcile remote truth. Never use preservation to hide mutable drift.
6. Optional + computed configured value: prove whether API honors, canonicalizes, or supersedes it; removal returns control to API defaults.

Plan unknown propagation is Framework/Core behavior. Test provider-selected modifiers, provider consistency, and API mapping rather than generic unknown behavior.

## Conditional matrices

### Validators

For each provider-used or custom constraint, cover valid representatives and invalid diagnostics. For bounds test min, max, immediately inside, and immediately outside each boundary; add zero/negative/empty only if meaningful. Prefer unit tests for custom validator logic and one acceptance test for schema wiring.

Cross-attribute rules need truth-table coverage:

| Rule | Cases |
|---|---|
| conflicts-with | neither if allowed; A only; B only; both invalid |
| required-together | neither if allowed; all present; every meaningful partial set invalid |
| exactly-one-of | each field alone valid; none invalid; multiple invalid |
| at-least-one-of | each representative alone valid; multiple valid; none invalid |

Null and unknown must not cause premature errors during validation. Test that explicitly in custom validators. Do not test every value accepted by stock Framework validators.

### Plan modifiers

Test null, unknown, known unchanged, and known changed inputs for custom modifiers. Assert diagnostics and exact planned value. Acceptance-test user-visible effects:

- replacement modifier: use a plan-only step (`PlanOnly: true`) with an expected replacement/non-empty plan check, then apply and verify remote identity/lifecycle;
- state-for-unknown: unchanged config avoids a spurious unknown/diff, while Read still detects drift;
- normalization/default modifiers: planned value matches the eventual stable state.

### Normalization

Test input → canonical state on create, equivalent spelling/case/order producing an empty subsequent plan, update to a genuinely different value, refresh of API-canonical data, and import canonicalization. Put pure normalization tables in unit tests and prove one end-to-end case in acceptance tests.

### Remote API behavior

Add focused acceptance coverage only where the API has defaults, rejects empty values, drops fields, reorders collections, canonicalizes values, generates IDs/status, treats null differently from empty, delays consistency, or prohibits clearing/updating. Unit-test request construction for otherwise expensive/error branches.

## CRUD, refresh, drift, and import

| Operation | Prove | Usually not necessary |
|---|---|---|
| Create | request mapping, early/complete state, generated/default values, error diagnostics | Framework calling `Create` |
| Read/refresh | all readable fields reconcile; not-found removes resource; API null removes stale state | Generic state decoding |
| Update | changed fields map correctly; unchanged values preserved; clearing works; computed values refresh | One test per identical mutable scalar |
| Delete | correct ID/request; not-found is success; async deletion waits; destroy check finds nothing | Core removing state after success |
| Import | simple or custom ID parsing; `ImportStateVerify`; invalid/composite IDs; canonical state | Write-only/non-readable config reconstruction |
| Drift | external mutable change is detected; external deletion removes state and next plan recreates | Core's generic diff algorithm |

For refresh-only tests, use an acceptance `TestStep` without configuration only when supported by the harness pattern; more commonly mutate through the API in a `PreConfig`/`Config` boundary and run a step with the same configuration and refresh enabled. Verify the state immediately after refresh and, where relevant, the subsequent non-empty or empty plan.
