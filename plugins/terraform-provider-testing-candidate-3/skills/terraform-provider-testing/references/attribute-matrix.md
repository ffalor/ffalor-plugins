# Attribute Matrix

## Contents

1. How to use the matrix
2. Scalar lifecycle
3. Primitive specialization
4. Collection lifecycle
5. List, set, and map specialization
6. Objects and nested attributes
7. Null, empty, and unknown
8. Consolidation rules

## 1. How to use the matrix

For each selected row record the configuration transition, expected plan action, state and remote result, test layer, import relevance, and behavior owner. Select rows by distinct provider/API behavior; never multiply every Terraform type by every schema flag.

Shorthand:

- `∅`: omitted from configuration.
- `null`: explicit Terraform null.
- `[]` / `{}`: explicit empty collection.
- `A -> B`: sequential configurations sharing state.
- **U**, **A**, **B**: pure Go unit, acceptance, or both.

## 2. Scalar lifecycle

Apply once per behaviorally distinct optional scalar path.

| Scenario | Transition | Expected action | Expected state/API | Layer | Import |
|---|---|---|---|---|---|
| Omitted create | absent resource to `attr = ∅` | Create | Null or documented provider/API default; request omission verified when material | A; U if request branches | If readable |
| Configured create | absent resource to A | Create | A or supported canonical form; API received A | A; U for mapping | If readable |
| Update | A to B | Update unless replacement contract | Same identity; state/API B | A | If readable |
| Remove | B to `∅` | Update, no-op, or replacement per contract | Null/default/reset value; API field cleared or omitted correctly | B when clearing is subtle | If readable |
| Explicit null | A to `null` | Usually same as omission | Documented null result | Only if provider/API distinguishes it | If readable |
| Unknown input | known to expression unknown during plan | Unknown or safe prior-state preservation | Apply resolves without premature conversion | U custom logic; A material flow | No before apply |

Required scalars keep configured create and update/replacement rows. Omission is a configuration error, not a successful lifecycle transition. Test a representative required-wiring error only when useful; test every provider-owned validator or relationship branch.

## 3. Primitive specialization

Add these only when the provider or API gives the value special meaning.

| Type | General proof | Conditional proof | Skip |
|---|---|---|---|
| String | Omit/configure/change/remove; API read-back | Empty versus null, whitespace/case/Unicode normalization, enum/format/length boundary, generated or create-only value | Generic UTF-8 and HCL string behavior |
| Boolean | Omitted, false, true, removal | Tri-state null/false/true, API default inversion, one-way enablement | Boolean truth semantics |
| Integer | Representative value and lifecycle | Zero/negative, exact and adjacent bounds, API width/overflow, unit conversion | HCL arithmetic |
| Number | Exact representative decimals | Values beyond 64-bit, scale/precision, API canonicalization | Framework arbitrary-precision internals |
| Float | Representative fraction and lifecycle | API rounding/tolerance, precision loss, bounds | Exact equality when API is approximate |

For booleans, `false -> true -> false` can cover both update directions. Still test omission separately when null and false differ. For floating values, assert the documented canonical value or unit-test tolerance, then require a stable final plan.

## 4. Collection lifecycle

Apply to lists, sets, and maps when the API/provider owns the transition.

| Scenario | Transition | Expected result | Layer | Import |
|---|---|---|---|---|
| Omitted/null create | absent to `∅`/`null` | Null/default; request omission when significant | A; U mapping | If readable |
| Explicit empty | absent to `[]`/`{}` | Empty or documented canonical result | A; U clearing request | If distinction survives |
| One element | absent/empty to one | Correct complete element | A | Yes |
| Multiple elements | one to many | Exact membership/cardinality; documented order | A | Yes |
| Update element/value | A to B in retained element/key | Only intended value changes | A; U conversion | Yes |
| Add | one to many | Prior values preserved, new value present | A | Yes |
| Remove | many to fewer | Removed value absent, retained values complete | A | Yes |
| Clear | populated to empty | Remote entries cleared; state empty/canonical | B when request semantics are subtle | If readable |
| Re-omit | populated/empty to `∅` | Null/default or canonical empty, never stale | B | If readable |
| Unknown collection/element | known to unknown expression | Safe propagation; no panic or invalid request | U; A only when provider logic sees it | No |
| External member drift | mutate through API | Refresh and following plan honor authority contract | A | No |

Do not execute every row for every collection. Combine cardinality and mutation transitions when they share one remote object and remain understandable.

## 5. List, set, and map specialization

### Lists

- Reorder only when order is API-significant or the API may reorder unexpectedly.
- Update a nested child by index and verify siblings remain unchanged.
- If an unordered API repeatedly changes list order, the schema may need deterministic normalization or a set.
- Terraform Core already preserves list order; do not test that fact alone.

### Sets

- Assert membership with `knownvalue.SetExact`, `SetPartial`, size checks, or custom membership checks; never index a set.
- Test reversed API order only when conversion or API nondeterminism could create a diff.
- Test duplicates only when provider normalization/custom types change equality; Core owns ordinary set deduplication.
- For nested sets, identify which fields participate in element equality. A child change may correctly appear as remove/add.
- Write-only set and set-nested attributes are unsupported; treat them as invalid schema, not a lifecycle case.

### Maps

- Add a key, update a value under a stable key, remove a key, clear, and re-omit when distinct request paths exist.
- Verify unrelated keys remain unchanged.
- Test unusual valid keys or key normalization only when provider code parses or canonicalizes them.
- Core owns ordinary key addressing.

## 6. Objects and nested attributes

### Single object or single nested

Test applicable cases:

- Omitted/null parent.
- Minimal and fully populated object.
- Update one child while siblings remain stable.
- Remove an optional child.
- Remove the whole object.
- API-computed child becomes known.
- API-omitted child becomes null/default rather than stale.
- Unknown parent/child only when custom code observes it.

Table-test custom expand/flatten logic with null and unknown parent, optional null children, full values, nil API children, empty API subobjects, diagnostics, and normalization.

### List nested

Apply list lifecycle plus child update, add/remove object, reorder when meaningful, clear/re-omit, computed children, and prior-state-sensitive modifiers after element removal or reorder.

### Set nested

Apply set lifecycle plus add/remove object, equality-defining child changes, API reordering, normalization collision, and computed child identity risks. Do not place write-only children under set nesting.

### Map nested

Apply map lifecycle plus child update under a stable key, key rename as remove/add, sibling preservation, API key round trip, clear, and re-omit.

If nested remote children have independent identity and CRUD, reconsider modeling them as separate Terraform resources rather than hiding that lifecycle inside normalization.

## 7. Null, empty, and unknown

| Value | Provider concern | Test rule |
|---|---|---|
| Null/omitted | No practitioner value; request omission or API default | Test when request mapping, clearing, or defaults depend on absence. |
| Empty | Explicit zero elements or empty string | Test when API clear differs from omission/default. |
| Unknown | Final value unavailable during plan | Unit-test every custom branch; acceptance-test only material dependency flows. |

Conversion helpers must branch before calling methods such as `ElementsAs` or reading scalar values from null/unknown data. Construct framework null and unknown values in unit tests whenever custom code handles them.

## 8. Consolidation rules

- Group attributes sharing endpoint, conversion helper, mutability, null/empty contract, and API semantics into one minimal/full/update/remove flow.
- Split replacement-only, write-only, custom validator/default/modifier, distinct endpoint, destructive clearing, and known regression behavior.
- Use one representative primitive to prove generic collection plumbing; add tests for object conversion, API ordering, patch semantics, and element identity.
- Do not repeat built-in validator internals, schema-flag enforcement, HCL type checking, Core list/set/map semantics, or static default implementation.
- Expand coverage for leakage, destructive clearing, drift, replacement, secrets, and prior regressions because their failure cost is high.
