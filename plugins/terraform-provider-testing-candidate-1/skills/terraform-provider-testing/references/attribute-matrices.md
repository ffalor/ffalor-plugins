# Attribute Test Matrices

## Contents

1. [How to use the matrices](#how-to-use-the-matrices)
2. [Primitive attributes](#primitive-attributes)
3. [Collections](#collections)
4. [Objects and nested attributes](#objects-and-nested-attributes)
5. [Schema behaviors](#schema-behaviors)
6. [Validators and relationships](#validators-and-relationships)
7. [What not to test](#what-not-to-test)

## How to use the matrices

Each selected case must record: scenario; `config A -> config B`; pre-apply
plan; post-apply/refresh state; unit, acceptance, or both; import relevance;
and behavior owner. “Acceptance” means a real Terraform CLI plus the provider;
use the real service where its behavior is the subject.

Apply the **general** row for a behaviorally equivalent group, then add only
the **conditional** rows whose logic exists. For example, five plain required
strings need not each repeat Core type checking, but each distinct request
mapping or API normalization still needs proof.

## Primitive attributes

| Type / case | Transition | Expected plan and state | Test level | Import | Owner / when needed |
|---|---|---|---|---|---|
| Optional scalar: general minimum | `omit -> value A -> value B -> omit` | Create/update/no replacement unless specified; state is null or documented default, A, B, then null/default | Acceptance | Verify if API returns it | Provider/API; required for string, bool, integer, number, float when independently mapped |
| Required scalar | minimal valid config | Create; exact state value | Acceptance | Usually verify | Provider mapping |
| Required omitted | remove attribute from otherwise valid config | Configuration/validation error; no apply or remote call | Acceptance or schema unit | No | Framework integration; one representative per diagnostic/rule, not every primitive |
| Boolean | `omit -> false -> true -> omit` | Distinguish explicit `false` from null/default; update remains stable | Acceptance | If readable | Provider/API pointer and zero-value handling |
| Integer | min, ordinary, max | Exact integer in plan/state | Unit boundaries + representative acceptance | If readable | Only if validator/API range or conversion exists |
| Number | representative exact values | Use number-aware assertion; stable conversion | Unit + acceptance when provider uses arbitrary precision | If readable | Provider conversion |
| Float | values exposing rounding plus ordinary value | Compare according to documented tolerance/canonical form, not fragile decimal formatting | Unit; acceptance if API round-trips | If readable | Only if float conversion/rounding/API precision exists |
| String empty/null | `omit -> "" -> omit` | Empty remains empty or validator rejects it; never silently conflate unless documented normalization | Unit + acceptance if mapping risk | If readable | Provider/API |
| Normalized primitive | raw value -> canonical equivalent | Plan may show configured raw value initially; state/API canonical value must yield documented stable plan behavior | Unit + acceptance | Yes if API reconstructs canonical form | Provider/API; only when normalization exists |
| API rejects a valid-schema value | valid HCL with remote-invalid value | Apply diagnostic; resource/state cleanup follows Create error policy | Acceptance | No | API; only known contract/edge cases |

`number` is Terraform's arbitrary-precision number concept; `Int64Attribute`
and `Float64Attribute` are common framework representations. Test the actual
schema and model conversion rather than inventing all three for one attribute.

## Collections

### General lifecycle for every mutable list, set, or map

| # | Scenario / transition | Expected plan and state | Level | Import |
|---|---|---|---|---|
| 1 | `omit` or explicit `null` | Create; null or documented API/provider default | Acceptance | Verify when readable |
| 2 | `omit -> []/{}` | Update if API distinguishes; state explicitly empty. If null and empty are intentionally equivalent, prove stable normalization once | Acceptance | Yes |
| 3 | `empty -> one` | Update; one exact element/entry | Acceptance | Yes |
| 4 | `one -> multiple` | Update; all expected elements/entries | Acceptance | Yes |
| 5 | mutate existing element/value | Update; only intended value changes, identity stable unless replace | Acceptance | Yes |
| 6 | add element/key | Update; old plus new | Acceptance | Yes |
| 7 | remove element/key | Update; retained values exact | Acceptance | Yes |
| 8 | values -> explicit empty | Update; empty state and API collection | Acceptance | Yes |
| 9 | values/empty -> omitted | Update if necessary; state null/default, or documented API canonical empty | Acceptance | Yes |
| 10 | unknown collection/expression | Plan preserves unknown or applies modifier behavior without invalid provider access | Plan unit/integration; acceptance only for material dependency flow | No before apply |
| 11 | null/unknown element or value | Valid only if Terraform type/schema permits it; provider must diagnose or map safely | Unit/integration | Rare |

Combine rows into a single sequential lifecycle test when cleanup and API cost
favor it. Explicit `null` can be generated with `null` or a conditional;
unknowns normally require a reference to a value known only after apply.

### Type-specific additions

| Type | Specialized scenario | Expected result | Level / when needed |
|---|---|---|---|
| List | reorder `[a,b] -> [b,a]` | Order change is visible and preserved, normalized, or rejected exactly as documented | Acceptance when provider/API handles order; Core ordering itself needs no test |
| List | update index `i` in nested object | Correct object changes; other indices and resource identity stable | Acceptance |
| Set | configure same members in different order | No diff after refresh; state membership independent of order | Acceptance when API reorders or element hashing/model conversion is involved |
| Set | duplicate primitive members | Core collapses duplicates; do not test unless provider adds diagnostics or nested identity is risky | Unit/acceptance only for provider behavior |
| Set nested | mutate an identity-defining field | Usually remove/add semantics; assert final membership, not an index | Acceptance |
| Set nested | API reorders/canonicalizes objects | Empty post-refresh plan and correct membership | Acceptance |
| Map | add key | New key/value present | Acceptance |
| Map | update existing key's value | Same key has new value | Acceptance |
| Map | remove key | Removed key absent, others retained | Acceptance |
| Map | clear all keys / omit | Empty or null/default per contract | Acceptance |
| Map nested | mutate field under one key | Only keyed object changes; other keys stable | Acceptance |

## Objects and nested attributes

| Shape | General cases | Conditional cases | Plan/state expectations | Level / import |
|---|---|---|---|---|
| Object / single nested | omitted, complete minimal object, update child, remove object | partial optional children, null child, computed child, normalization, cross-child rules | Parent and children preserve null/unknown distinctions; exact object after refresh | Acceptance; import if readable |
| List nested | collection general lifecycle plus update object at index and reorder | API sorting, computed children, per-element validation | Index/order semantics explicit; stable final plan | Acceptance; import relevant |
| Set nested | collection lifecycle plus add/remove/mutate object | identity/hash changes, API reorder, computed fields affecting identity | Assert membership with set checks, never fixed index; no phantom diffs | Acceptance; import relevant |
| Map nested | key lifecycle plus update child beneath a stable key | key normalization, computed children | Keyed object exact; unrelated keys stable | Acceptance; import relevant |

Do not exhaustively combine every child value. Cover each distinct conversion,
validator, plan modifier, API field, and identity rule at least once. If nested
objects are built by custom expand/flatten functions, table-test null, unknown,
empty, partial, and full values at unit level; acceptance-test representative
end-to-end transitions.

## Schema behaviors

| Behavior | Scenario / transition | Plan | State/refresh | Level | Import |
|---|---|---|---|---|---|
| Required | valid minimal; omit; invalid boundary | Create for valid; error for omit/invalid | Exact configured/API canonical value | Acceptance plus validator unit | Yes if readable |
| Optional | `omit -> A -> B -> omit` | Create/update/update; replace only if declared | null/default, A, B, null/default | Acceptance | Usually |
| Computed | create; update affecting it; refresh after API mutation; API stops returning value | Unknown on create unless modifier supplies a sound known value; update behavior per modifier | API value, changed value, drifted value, then null/retained only per contract | Acceptance; modifier unit | Usually essential |
| Optional + computed | omit; configure A; API canonicalizes/generates; change/remove; refresh | Omitted may be unknown or prior state; configured value must interact with modifier predictably | API default when omitted, configured/canonical value when set, documented result after removal | Both | Yes |
| Sensitive | plan/state metadata marks value sensitive; lifecycle still works | Sensitive flag present | Avoid clear-text test output; value may exist in state | Acceptance/integration | Usually ignore only if API cannot return it |
| Write-only | configure secret; change secret; omit if optional | Accepted in config/plan, never persisted; change may update/replace per schema | Must be null in state; verify remote effect indirectly | Acceptance with Terraform version gate; unit for mapping | Import cannot reconstruct; exclude from verify when necessary |
| Default | omit; explicit non-default; remove; API default changes if relevant | Omission resolves according to framework/provider default timing | Default, explicit, default; stable plan | Both | Verify reconstructed value or document ignore |
| Requires replacement | A create; plan B; apply B | Replacement action, never in-place update | New identity/value; old remote object absent | Plan integration + acceptance lifecycle | Verify new object |

### Computed detail checklist

Test only applicable promises:

- API-generated value is unknown during create planning and known after create.
- Update or refresh can change it without provider inconsistency.
- `UseStateForUnknown` (or a custom modifier) retains prior state only when it
  is semantically safe; unit-test null/unknown/known config, plan, and state.
- Configured value wins, API wins, or API canonicalizes for optional+computed—
  state the contract and assert it.
- Out-of-band remote changes appear on refresh and produce the intended next
  plan (repair, accept as computed, or replace).
- A missing API field maps to null, prior state, or a diagnostic according to
  contract. Never preserve stale state accidentally.

## Validators and relationships

| Rule | Cases | Expected result | Level |
|---|---|---|---|
| Enum/format | representative valid; each distinct invalid class | Valid plans; invalid has attribute-path diagnostic and no API call | Unit + representative acceptance |
| Min/max | exact min/max; immediately inside each boundary; immediately outside each boundary | Boundary/inside valid; outside invalid | Table-driven unit; acceptance only if schema wiring risk |
| Length/size | zero, min-1, min, min+1, max-1, max, max+1 as meaningful | Exact documented boundary behavior | Unit |
| Conflicts with | neither, A only, B only, both | Both errors; allowed combinations plan | Unit/integration; acceptance for provider custom logic |
| Required together | neither if allowed, all, each incomplete combination | Incomplete combinations error | Unit/integration |
| Exactly one of | each singleton; none; two or more | Singletons valid, others error | Unit/integration |
| At least one of | each singleton; multiple; none | Any nonempty combination valid; none errors | Unit/integration |
| Conditional semantic rule | truth-table rows that change outcome | Correct path diagnostic or plan | Unit + representative acceptance |

For standard framework validator libraries, do not retest their algorithms.
Test provider-selected parameters/boundaries and schema wiring. For custom
validators, unit-test null, unknown, valid, invalid, diagnostics, paths, and
all boundary/relationship truth-table rows. Acceptance tests confirm important
configuration errors occur before API mutation.

## What not to test

- HCL parsing or primitive type rejection already enforced by Terraform Core,
  unless diagnosing a regression in provider schema integration.
- Every permutation of type × Required/Optional/Computed.
- Set de-duplication or list positional semantics in isolation.
- Internals of HashiCorp's standard validators and plan modifiers.
- Every collection size when zero, one, many, and boundary values prove the
  behavior.
- Import of write-only input values the API cannot return.
- Remote behavior in mocked unit tests presented as proof of API compatibility.

Test the provider's choice, mapping, diagnostics, and interaction with those
guarantees instead.
