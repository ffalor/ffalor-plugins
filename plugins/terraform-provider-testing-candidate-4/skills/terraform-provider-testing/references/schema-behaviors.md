# Schema Behaviors, Validators, and Plan Modifiers

## Contents

1. Behavior overview
2. Required and optional
3. Computed and optional+computed
4. Defaults
5. Sensitive and write-only
6. Replacement
7. Validators and attribute relationships
8. Plan modifiers
9. Normalization and API behavior
10. What not to test

## 1. Behavior overview

| Behavior | Baseline scenario | Specialized scenarios | Primary layer | Import |
|---|---|---|---|---|
| Required | Valid create; mutable update or replacement | Omission/schema diagnostic once; custom validation | Acceptance + custom-validator unit | Yes if reconstructable |
| Optional | Omit, set, update, remove | Null/empty distinction, API default | Acceptance; unit conversion as needed | Conditional |
| Computed | Unknown on create, API value after apply | Refresh change, disappearance/null, stable prior-state modifier | Acceptance | Yes |
| Optional+computed | Unconfigured API choice; configured value | Config/API interaction, drift in both modes, removal to API choice | Acceptance + modifier unit | Yes if readable |
| Defaulted | Omitted uses default; configured overrides; remove restores default | Custom dynamic default and nested defaults | Acceptance wiring + custom-default unit | Conditional |
| Sensitive | Value works and is marked sensitive | Nested propagation and output handling | Representative acceptance | Yes if readable; still stored |
| Write-only | Config consumed; plan/state null | Update trigger, replacement, nested restrictions | Acceptance + request unit | No for secret value |
| Requires replacement | Change produces replacement plan and applied recreation | Conditional replacement, omission/removal | Both plan and lifecycle acceptance | Identity relevant |

## 2. Required and optional

### Required

Appropriate coverage:

| Scenario | Config transition | Plan | State/API | Layer |
|---|---|---|---|---|
| Valid create | absent → `required = A` | Create | A or allowed canonical representation; API received A | Acceptance |
| Valid update | A → B | Update or replace | B and correct identity behavior | Acceptance |
| Omitted | absent → `required = ∅` | Configuration/schema error before apply | No resource created | One acceptance/config validation smoke test when useful |
| Invalid value | valid shape → validator-invalid value | Diagnostic before API call | No mutation | Unit custom validator; representative acceptance |

Do not test omission for each required attribute. The framework enforces `Required`. Test per-attribute omission only when:

- Schema is generated dynamically and wiring is risky.
- The provider supplies a custom diagnostic or relationship.
- A regression showed the field was accidentally marked optional.

Removing a required value is not a valid update scenario. To test a reset, the schema must be optional or expose an explicit reset value.

### Optional

Use the four-step minimum:

1. Create omitted → null or documented provider/API default.
2. Create configured A → A/canonical A.
3. Update A → B → B/canonical B.
4. Remove B → omitted → null/default.

Add explicit null, empty, unknown, validation, normalization, and replacement only when behavior exists. Confirm request omission versus explicit clear when the API distinguishes them.

## 3. Computed and optional+computed

### Computed

| Scenario | Transition/setup | Expected plan | Expected state after apply/refresh | Layer | Import |
|---|---|---|---|---|---|
| Create-generated | Create resource | Unknown unless provider can safely plan it | API-generated value | Acceptance | Yes |
| Update changes computed | Mutable config A → B | Unknown, prior state, or known planned value according to modifier | New API value | Acceptance | Yes |
| Stable computed identity | Update unrelated field | Prior state may be used only if immutable | Same value | Acceptance with cross-step compare | Yes |
| Refresh changes value | Modify API-derived field or wait for API change | Refresh updates state; next plan contract-specific | New value | Acceptance | Yes |
| Drift dependency | Computed change affects configured behavior | Non-empty plan only if design requires | Consistent dependent state | Acceptance |
| API value disappears | API returns missing/null | Refresh succeeds or returns explicit diagnostic | Null or documented fallback/prior-state preservation | Unit flatten + acceptance if API can produce it | Conditional |
| Unknown propagation | Value depends on apply | Unknown at plan path | Known after apply | Plan + state acceptance | No |

Prior-state preservation is not automatically correct. Use it only when the value is known not to change for the operation. A volatile status, timestamp, policy, or server-derived field should refresh rather than be hidden.

### Optional+computed

This behavior has two modes and both need coverage.

| Scenario | Config transition | Expected plan | Expected state/API | Layer | Import |
|---|---|---|---|---|---|
| API-selected create | `attr = ∅` | Default known, unknown, or prior-state logic per schema | API/provider-selected value | Acceptance | Yes if readable |
| Configured create | `attr = A` | A known | A, subject to Terraform consistency contract | Acceptance | Yes |
| Configured update | A → B | Update/replace | B | Acceptance | Yes |
| Remove configuration | B → ∅ | Update/reset/unknown according to API | New API-selected/default value, not stale B unless documented | Acceptance | Yes if readable |
| Unconfigured refresh change | Remotely change API-selected value | Refresh accepts new API value | New value, no perpetual diff | Acceptance | Yes |
| Configured drift | Remotely change away from A | Refresh observes remote value; subsequent plan restores A or follows documented API-authoritative rule | Contract-specific final state | Acceptance | Yes |
| API value disappears | API stops returning value | Refresh | Null/default/prior only by explicit contract | Both for subtle mapping | Conditional |

Terraform consistency rules generally require a known configured value to remain consistent through plan and apply. Do not silently replace configured A with API-canonical B unless the schema uses a supported semantic-equality/custom-type strategy or other framework-compliant design. An empty final plan is the acceptance criterion.

## 4. Defaults

Framework resource defaults are applied during planning when configuration is null, before null computed attributes are marked unknown.

| Scenario | Transition | Expected plan | Expected state/API | Layer | Import |
|---|---|---|---|---|---|
| Omitted create | `attr = ∅` | Default D known unless custom default defers | D; API receives D if provider sends it | Acceptance wiring | Conditional |
| Explicit override | ∅/D → A | Update or create with A | A | Acceptance |
| Change override | A → B | Update | B | Acceptance |
| Remove override | B → ∅ | Update/no-op/replacement per schema | D restored | Acceptance |
| Custom default success | null config with deterministic inputs | Planned custom D | D | Unit + acceptance wiring |
| Custom default error | triggering config | Diagnostic; no apply | No mutation | Unit; acceptance only for user-visible integration |
| Parent/nested defaults | Parent null or child null | Parent then child default order honored | Complete expected object | Unit custom logic + representative acceptance |

Do not unit-test `stringdefault.StaticString` or other built-in defaults. Test that the provider attached the intended default and that removal returns to it. Unit-test custom defaults, including null/unknown inputs, diagnostic paths, and deterministic behavior.

An API default is not the same as a framework default. When the provider omits the request field and reads an API-selected value, model and test it as computed or optional+computed behavior.

## 5. Sensitive and write-only

### Sensitive

`Sensitive` redacts display; it does not remove data from plan/state.

| Scenario | Expected result | Layer |
|---|---|---|
| Configured sensitive value | API receives it; state value works; sensitivity metadata is set | Representative acceptance |
| Update/remove | Same lifecycle as underlying optional/required type | Acceptance only when provider/API logic exists |
| Nested sensitivity | Sensitive path/parent is correctly marked | Acceptance wiring |
| Logs/diagnostics | Secret never appears in test output or provider logs | Code review + targeted unit failure tests without real secret |

Use `statecheck.ExpectSensitiveValue` / `plancheck.ExpectSensitiveValue` with the Terraform version gate required by the selected testing API. Avoid exact secret assertions if failures could print the value.

### Write-only

Write-only arguments require Terraform 1.11+ and are managed-resource-only:

- They must also be optional or required.
- They cannot be computed.
- Plan and state are always null.
- Read cannot reconstruct them; import verification must ignore the write-only value.
- Set and set-nested write-only attributes are unsupported.
- If a single/list/map nested attribute is write-only, all children must be write-only.

| Scenario | Configuration transition | Expected plan | Expected state/API | Layer |
|---|---|---|---|---|---|
| Required create | secret absent resource → configured secret | Resource create; write-only path null in plan artifacts | API effect succeeds; write-only state null | B |
| Optional omitted | no secret configured | No secret use | State null; API unchanged/default | A when provider branch matters |
| Optional configured | omitted → configured secret | Write-only value alone normally cannot diff | Provider consumes config; state remains null | B |
| Version/keeper update | secret + version 1 → new secret + version 2 | Update driven by version/keeper | API secret changes; state only contains trigger | B |
| Replacement | write-only attribute with `RequiresReplace` | Replacement when configured according to modifier semantics | Old object removed, new object created; state secret null | A |
| Ephemeral value | write-only config receives ephemeral expression | Valid plan/apply | Provider consumes value without persistence | A |

Retrieve write-only values from `req.Config`, not plan. Verify the remote effect through a non-secret observable (version, authentication success, checksum held only by a fake client) and never echo the secret into managed state merely to test it.

## 6. Replacement

Each replacement attribute requires two proofs.

### Plan proof

1. Apply config A.
2. Run a plan-only step for config B.
3. Assert `plancheck.ExpectResourceAction(address, plancheck.ResourceActionReplace)`.
4. Optionally assert the changed planned value and whether create-before-destroy applies.

### Lifecycle proof

1. Apply A and record identity with `statecheck.CompareValue(compare.ValuesDiffer())` across steps.
2. Apply B.
3. Assert new identity, expected B state, new remote object exists, and the old object is gone.
4. Require final no-op plan.

| Replacement scenario | Transition | Expected plan | Layer |
|---|---|---|---|
| Simple immutable attribute | A → B | Replace, never Update | Acceptance plan + apply |
| Optional immutable set | ∅ → A | Replace after initial creation if value changes from null | Acceptance |
| Optional immutable removed | A → ∅ | Replace if null is a different immutable value | Acceptance |
| Conditional modifier | A → B satisfying predicate | Replace | Unit modifier + acceptance |
| Conditional non-replace | A → B outside predicate | Update/no-op | Unit modifier + acceptance |
| Configured-only replacement | Unconfigured API/default changes | No unintended replacement | Unit + acceptance |

Testing only the final changed ID is insufficient: an implementation could incorrectly delete/recreate inside Update. Testing only the plan is insufficient: lifecycle cleanup might still leak the old object.

## 7. Validators and attribute relationships

Validator diagnostics are configuration-time behavior and are not import-relevant. Import becomes relevant only to the valid attribute value’s ordinary lifecycle, as defined in the behavior matrix.

### Scalar/range validator matrix

| Scenario | Example value | Expected result | Layer |
|---|---|---|---|
| Ordinary valid | midpoint | No diagnostic | Unit custom validator; representative acceptance |
| Exact minimum | min | Valid if inclusive, invalid if exclusive | Unit |
| Immediately inside minimum | min + smallest meaningful step | Valid | Unit |
| Immediately outside minimum | min - step | Diagnostic | Unit |
| Exact maximum | max | Valid if inclusive, invalid if exclusive | Unit |
| Immediately inside maximum | max - step | Valid | Unit |
| Immediately outside maximum | max + step | Diagnostic | Unit |
| Null | null | Usually skip unless required relationship applies | Unit custom |
| Unknown | unknown | Usually defer, do not reject | Unit custom |
| Wrong semantic format | invalid enum/regex/identifier | Diagnostic at correct path | Unit + one acceptance wiring |

For strings, “step” may be one character of length or the smallest invalid lexical case. For floats/numbers, choose a value the API/framework can represent reliably.

Do not duplicate exhaustive tests for HashiCorp-provided built-in validators. Verify custom validator logic exhaustively and attach one representative acceptance failure when schema wiring matters.

### Cross-attribute relationship matrix

Assume attributes `a` and `b`.

| Relationship | Config cases | Expected plan | Layer |
|---|---|---|---|
| Conflicting | neither; a only; b only; a+b | First three valid as contract allows; a+b diagnostic | Unit custom validator + acceptance invalid wiring |
| Required together | neither; a+b valid; a only; b only | neither and both valid; one-sided cases diagnostic | Unit + representative acceptance |
| Exactly one of | neither; a only; b only; both | only a/only b valid; neither/both diagnostic | Unit + representative acceptance |
| At least one of | neither; a only; b only; both | all except neither valid | Unit + representative acceptance |
| Conditional requirement | trigger false/no dependent; trigger true/dependent; trigger true/no dependent | Missing dependent diagnostic only in triggering case | Unit + representative acceptance |
| Value relationship | min ≤ max; min > max; null/unknown combinations | Invalid known relationship diagnosed; unknown generally deferred | Unit custom + acceptance |

Test diagnostic path, summary/detail stability only if it is a documented provider contract, and confirm invalid configurations make no API call in fake-client unit/integration tests.

## 8. Plan modifiers

Plan-modifier tests inherit import relevance from the affected attribute. The modifier itself is not exercised during import; imported state must still produce the documented next plan.

### Common modifiers

| Modifier/logic | Scenarios | Plan assertions | State assertions |
|---|---|---|---|
| `RequiresReplace` | unchanged; A → B; null ↔ configured when valid | No-op for unchanged; Replace for change | Applied identity differs |
| `RequiresReplaceIf` | predicate false and true; null/unknown | Update/no-op versus Replace | Lifecycle matches each branch |
| `RequiresReplaceIfConfigured` | unconfigured API value; configured change | No accidental replacement when unconfigured | Configured change replaces |
| `UseStateForUnknown` | create, update with planned unknown, config unknown, prior null | Create stays unknown; safe update copies prior state only in allowed cases | Final state remains correct |
| Custom normalization/planning | canonical and noncanonical values; null/unknown; create/update/destroy | Framework-consistent planned value and diagnostics | Empty final plan |

Pure unit tests should invoke custom modifier interfaces with request/response values for:

- Resource create (null prior raw state)
- Update (known prior state)
- Destroy (null proposed raw plan)
- Known, null, and unknown config/plan/state values
- Diagnostic and replacement branches

Acceptance tests prove framework ordering and full plan action. Built-in modifiers need provider acceptance coverage for their intended effect, not unit reimplementation tests.

### Nested caveat

Prior state under list/set nested attributes is not automatically realigned after element reorder/removal. Any child plan modifier using prior state needs focused tests for:

- Removing the first/middle element
- Reordering a list
- Set element identity changes
- Unknown nested values

Prefer collection-level logic or stable map keys if correct alignment cannot be guaranteed.

## 9. Normalization and API behavior

Normalization is provider/API-owned and warrants both value and no-diff assertions.

| Scenario | Config transition | Expected plan/state | Layer | Import |
|---|---|---|---|---|
| Create noncanonical | `" Foo "` | Apply succeeds only under framework-consistent design; state canonical if supported | B | Yes |
| Equivalent spelling update | canonical ↔ equivalent form | No-op or documented update, never perpetual diff | A | Yes |
| API sorts list | configured unsorted list | Canonical sorted state only if schema/semantics support it; final no-op | B | Yes |
| API deduplicates | configured duplicates | Set or provider semantic design prevents diff | B | Yes |
| API rounds number | high precision → API precision | Canonical value/tolerance; final no-op | B | Yes |
| API supplies default | omitted config | API value stored with computed semantics | A | Yes |
| API clears missing field | configured → API null | Drift/reset contract applied | B | Conditional |

Do not “fix” consistency errors by copying configuration into state when the API disagrees. Model the API’s semantics with the correct type, computed behavior, semantic equality, plan modifier, or schema redesign.

## 10. What not to test

Skip provider tests that only prove:

- Required attributes are generally required.
- List values retain configuration order in Terraform.
- Set values are unordered and unique.
- Map keys address their values.
- Built-in framework validators reject the values their own upstream tests cover.
- Built-in static defaults return the literal passed to them.
- Write-only framework plumbing nulls state, unless verifying provider version/wiring.
- Sensitive means encrypted or absent from state—it does not.
- HCL type checking rejects a string where a number schema is declared.

Add provider tests when custom schema construction, provider logic, remote API behavior, or a regression makes any of these boundaries provider-owned.
