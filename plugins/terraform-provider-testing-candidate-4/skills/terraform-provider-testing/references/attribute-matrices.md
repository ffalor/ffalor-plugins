# Attribute Lifecycle Matrices

## Contents

1. How to use the matrices
2. Common scalar lifecycle
3. Primitive specialization
4. Collection lifecycle
5. List, set, and map specialization
6. Null, empty, and unknown
7. Objects and nested attributes
8. Collection-nested attributes
9. Consolidation rules

## 1. How to use the matrices

Use these shorthands in a test plan:

- `∅`: attribute omitted from configuration
- `null`: explicit Terraform null
- `[]` / `{}`: explicit empty collection
- `A → B`: sequential configurations in the same test
- “State” includes the documented provider/API default when null is not the contract.

The layer column uses:

- **U**: pure Go unit test
- **A**: acceptance test against Terraform and the remote API
- **B**: both

Import is **yes** only when Read/import can reconstruct the value. “Conditional” means add the assertion when the attribute is remotely readable, part of identity, or a prior import bug.

Specialization tables extend the nearest full lifecycle matrix. When they omit plan, layer, or import columns, inherit those expectations from the base row; the specialized row exists only to add type-specific behavior.

## 2. Common scalar lifecycle

Apply this matrix once per behaviorally distinct optional scalar path. String, bool, integer, arbitrary-precision number, and float share these lifecycle transitions.

| Scenario | Configuration transition | Expected plan | Expected state/API | Layer | Import |
|---|---|---|---|---|---|
| Omitted create | absent resource → `attr = ∅` | Create; attr null, planned default, or unknown for API default | Null or documented provider/API default; request omits field when omission matters | B when request mapping branches, otherwise A | Conditional |
| Configured create | absent resource → `attr = A` | Create with A known unless custom planning changes it | A or documented canonical form; API received A | A; U for expansion | Yes if readable |
| Update | `A → B` | Update unless replacement contract | Same identity; state/API B or canonical B | A | Yes if readable |
| Remove | `B → ∅` | Update/no-op/replacement per contract | Null or documented default; API field cleared/reset/omitted | B when clear semantics are subtle | Conditional |
| Explicit null | `A → null` | Usually same as omission for optional attr | Same documented result as null contract | Only if provider/API distinguishes or past regression | Conditional |
| Unknown input | known config → expression unknown during plan | Planned unknown or prior state only when valid modifier applies | Apply resolves and sends final known value | A when provider logic handles unknown; U for custom modifier | No |

At minimum, every mutable optional scalar with provider/API behavior must prove the first four rows. Consolidate equivalent scalars into one lifecycle test when they use identical mapping and API semantics, but make all affected attributes visible in assertions.

### Required scalar adaptation

For a required scalar:

- Keep configured create and update/replacement rows.
- Omitted create, remove-to-omitted, and null-as-absence are invalid configuration rather than lifecycle operations.
- Add one omission/configuration-error test for the resource schema when useful, not one per required field. Terraform/framework own the general rule.
- Add every provider-supplied validator boundary and cross-attribute diagnostic that can fail.
- Import remains relevant when the value is readable or derivable. A required attribute that cannot be reconstructed by import is a schema/design warning.

## 3. Primitive specialization

Run specialized rows only when the schema, provider, or API gives the value special meaning.

| Type | Generally useful provider scenarios | Specialized scenarios when applicable | Usually not a provider test |
|---|---|---|---|
| String | Omitted/configured/update/remove; API canonical read-back | Empty string versus null; whitespace/case normalization; Unicode; enum; format/regex; length boundaries; create-only name; server-generated string | UTF-8/string expression semantics; built-in validator internals |
| Boolean | Omitted/configured; false → true; true → false; remove | API tri-state where null differs from false; one-way enablement; default inversion | Terraform boolean truth semantics |
| Integer | Omitted/configured; A → B; remove | Zero, negative, min/max, immediately inside/outside bounds, unit conversion, overflow at API type boundary | Int32/Int64 arithmetic or HCL parsing |
| Number | Omitted/configured; A → B; remove | Values beyond 64-bit, fractional precision, exact decimal conversion, boundary/scale rules | Arbitrary-precision implementation already guaranteed by framework |
| Float32/Float64 | Omitted/configured; A → B; remove | API rounding, tolerance, serialization precision, min/max, values just inside/outside; state canonicalization preventing perpetual diffs | IEEE behavior, unsupported NaN/infinity syntax, exact equality when API is approximate |

For float-like APIs, do not assert a decimal the API cannot preserve. Assert the documented canonical value or tolerance in unit conversion tests, then ensure the acceptance test reaches an empty final plan.

For booleans, a single `false → true → false` lifecycle can cover both update directions. If omitted means false, still test omission separately when request omission or remote defaults are provider/API-owned.

## 4. Collection lifecycle

Apply to list, set, and map. Replace `[A]` notation with map syntax as needed.

| # | Scenario | Configuration transition | Expected plan | Expected state/API | Layer | Import |
|---:|---|---|---|---|---|---|
| 1 | Omitted/null | absent resource → `items = ∅` or `null` | Create; null/default/unknown per contract | Null or documented default; API omission verified if meaningful | B when mapping branches, otherwise A | Conditional |
| 2 | Explicit empty | absent resource → `items = []` / `{}` | Create with known empty collection unless normalized | Empty or documented API canonical result | A; U for request mapping | Yes if readable |
| 3 | One element | absent resource → `[A]` | Create | One element with correct value/shape | A | Yes |
| 4 | Multiple elements | absent resource → `[A,B]` | Create | All values present; ordering semantics honored | A | Yes |
| 5 | Update element | `[A,B] → [A,C]` | Update or replace per API/schema | Existing element updated; no stale B | A | Yes |
| 6 | Add element | `[A] → [A,B]` | Update | A preserved, B added | A | Yes |
| 7 | Remove element | `[A,B] → [B]` | Update | A absent, B preserved | A | Yes |
| 8 | Remove all | `[A] → []` | Update/reset | Explicit empty result; remote entries cleared | B when empty request is special | Conditional |
| 9 | Omit after values | `[A] → ∅` | Update/reset/no-op/replacement per contract | Null/default, distinct from empty when documented | B | Conditional |
| 10 | Unknown collection | known → expression unknown during plan | Unknown collection or valid prior-state preservation | Apply resolves full collection | A for custom planning/API behavior | No |
| 11 | Null/unknown element | collection includes null/unknown element where type permits | Framework/provider diagnostics or unknown propagation | No panic/data loss; contract-specific | U for conversion; A only if practitioner can produce it meaningfully | No |

Do not run every row for every collection. The baseline is omitted, empty, one, multiple, add/update/remove, clear, and omit-after-values when the API distinguishes those operations. Combine transitions in one sequential test when identity should remain stable.

## 5. List, set, and map specialization

### Lists

Lists are ordered. Add:

| Scenario | Transition | Expected plan/state | Layer |
|---|---|---|---|
| Reorder | `[A,B] → [B,A]` | Update if order is API-significant; no perpetual diff after API read | A |
| API reorders unexpectedly | Configure `[A,B]`; API reads `[B,A]` | Either provider preserves/canonicalizes documented order or schema should be a set; final plan must match contract | B |
| Index-specific nested update | Change child at index 1 | Only intended element changes; plan modifiers do not consume misaligned prior state | B for custom modifiers, otherwise A |

Core already preserves list order. Test ordering because the provider or API might reorder, sort, or misuse the type.

### Sets

Sets are unordered and unique. Add:

| Scenario | Transition | Expected plan/state | Layer |
|---|---|---|---|
| Reorder-only config | `{A,B} → {B,A}` | No-op | One set with A and B | A only when provider normalization/element identity is risky |
| Duplicate input | `{A,A}` | Core collapses equal values before provider | One A | No provider test unless custom type/normalization changes equality |
| Add/remove | `{A,B} → {B,C}` | Update | B retained, A removed, C added | A |
| API order varies | Repeated Read returns different order | No diff | Same logical set | A when API is nondeterministic |
| Nested element identity changes | Change a field participating in object equality | Remove/add semantics may occur | Correct remote object update or replacement | B; carefully model immutable identity |

Do not assert set elements by index. Use exact/partial set checks or collection membership.

Write-only arguments are not supported for set attributes or set nested attributes. Treat such a schema as invalid rather than designing lifecycle tests for it.

### Maps

Use stable keys and independently exercise key and value behavior:

| Scenario | Transition | Expected plan/state | Layer |
|---|---|---|---|
| Add key | `{a=A} → {a=A,b=B}` | Update | b added, a preserved | A |
| Update value | `{a=A} → {a=B}` | Update | a becomes B | A |
| Remove key | `{a=A,b=B} → {b=B}` | Update | a absent | A |
| Clear | `{a=A} → {}` | Update/reset | Empty map or canonical API result | B when API distinguishes empty |
| Omit after values | `{a=A} → ∅` | Contract-specific | Null/default or cleared map | B |
| Key normalization | `{"A"=v}` → API canonical key | Empty final plan; collision behavior diagnosed | B only if provider/API normalizes keys |

Core guarantees map key addressing. Test key operations because request patch semantics and API clearing are provider/API-owned.

## 6. Null, empty, and unknown

| Value form | Meaning to preserve | Test rule |
|---|---|---|
| Null/omitted | Practitioner supplied no collection/object/scalar | Test whenever provider omits a request field, API supplies a default, or removal resets behavior |
| Empty | Practitioner explicitly supplied zero elements/empty string | Test when API clear differs from omission/default |
| Unknown | Final value is unavailable during plan | Unit-test custom logic for safe propagation; acceptance-test references and plan checks when plan behavior matters |

Never call `ElementsAs`, `ValueString`, or similar conversion paths on unknown/null without an explicit branch. Unit tests should construct `types.ListNull`, `types.ListUnknown`, and equivalents for every conversion helper that branches on these states.

Do not force an acceptance test for impossible shapes. For example, an unknown element may only arise through interpolation; if the provider has no custom logic and framework propagation is sufficient, upstream coverage is enough.

## 7. Objects and nested attributes

Distinguish:

- `ObjectAttribute`: one object with type-only child definitions and limited per-child schema behavior.
- `SingleNestedAttribute`: one structured value with child attributes that can have their own validators, plan modifiers, descriptions, and behaviors.

Prefer nested attributes for new schemas when per-child behavior is needed.

### Single object / single nested matrix

| Scenario | Configuration transition | Expected plan | Expected state/API | Layer | Import |
|---|---|---|---|---|---|
| Omitted object | absent → `settings = ∅` | Create with null/default/unknown | Null or API-generated object | B when flatten/expand branches | Conditional |
| Populated object | absent → `settings = {mode=A, enabled=true}` | Create | Full child state; API received intended fields | A; U for conversion | Yes |
| Update child | mode A → B | Update or replace based on child | Same parent identity unless replacement | A | Yes |
| Remove optional child | child A → omitted, object remains | Update/reset | Child null/default; siblings preserved | B | Conditional |
| Remove whole object | populated → null/omitted | Update/reset | Whole object null/default; API structure cleared | B | Conditional |
| API adds/computes child | configured object → Read result with computed child | Planned unknown then known state | Child populated without inconsistency | A | Yes if readable |
| API omits child | prior child value → API missing/null | Refresh | Null, default, or explicitly preserved prior state by contract | B | Conditional |
| Unknown object/child | value references computed expression | Unknown at correct path | Apply resolves without conversion error | B for custom logic | No |

For nested required children, test a valid populated object and any custom validation. Do not duplicate framework-owned omission errors for every child.

### Structured conversion unit tests

Table-test:

- Entire object null and unknown
- Each optional child null
- All children populated
- API omits a child
- API returns an empty sub-object
- Provider normalization/canonicalization
- Diagnostics returned by `types.ObjectValueFrom` / `Set` paths

## 8. Collection-nested attributes

Apply the collection matrix plus nested child updates.

### List nested

- Omitted, empty, one object, multiple objects
- Update one child in an existing index
- Add/remove an object
- Reorder objects when order is meaningful
- Remove all and omit after values
- Unknown list/object/child
- Prior-state-sensitive plan modifiers after removal/reorder: framework does not realign prior state under list/set nesting

### Set nested

- Omitted, empty, one object, multiple unique objects
- Add/remove object
- Update a child and determine whether it changes set identity
- Reordered API responses must be a no-op
- Duplicate logical objects and normalization collisions only when provider/API equality differs
- No write-only fields in a set nested attribute

### Map nested

- Omitted, empty, one keyed object, multiple keyed objects
- Add key, update child at key, remove key, clear, omit after values
- Key is stable identity; assert siblings and other keys remain unchanged
- Unknown map/object/child when custom logic handles it

### Collection-nested scenario table

| Scenario | Example transition | Plan | State/API | Layer |
|---|---|---|---|---|
| Nested update | `[{name=A,size=1}] → [{name=A,size=2}]` | Update or replace according to child | Correct object changed, siblings preserved | A |
| Add nested object | one → two objects | Update | Both objects complete | A |
| Remove nested object | two → one | Update | Removed remote child absent | A |
| Clear nested collection | populated → empty | Update/reset | Remote children cleared | B |
| Omit after values | populated → omitted | Contract-specific | Null/default versus empty documented | B |
| API canonicalizes children | API sorts/defaults child fields | Final no-op | Canonical state | B |
| Nested replacement child | immutable child A → B | Replace parent or child resource per schema | Identity change and cleanup verified | A |

If remote children have independent CRUD and identity, reconsider modeling them as separate Terraform resources. Tests should not normalize away a modeling conflict.

## 9. Consolidation rules

- Group scalar attributes that share expansion, flattening, mutability, and API semantics into one minimal → full → updated → removed sequence.
- Split when an attribute is replacement-only, has a custom validator/modifier/default, is write-only, uses different API endpoints, or has distinct null/empty behavior.
- For collections, one representative element type can prove generic collection plumbing. Add specialized tests for object conversion, API ordering, patch semantics, and element identity.
- Do not repeat tests for `StringAttribute` versus `Int64Attribute` merely because their Go types differ; repeat only if conversion, boundary, or API behavior differs.
- Do not acceptance-test every built-in validator boundary. Unit-test provider custom validators; use one representative acceptance diagnostic to prove schema wiring.
- Do not test Terraform Core’s set deduplication or map/list syntax unless a provider custom type or normalization rule changes the result.
- Always expand the matrix for regressions, destructive clearing, replacement, write-only handling, and drift because failures there are costly.
