# Collection and Nested Attribute Test Matrix

Rows for `ListAttribute`, `SetAttribute`, `MapAttribute`, `ObjectAttribute`,
`SingleNestedAttribute`, `ListNestedAttribute`, `SetNestedAttribute`, and
`MapNestedAttribute`.

Read `references/attribute-matrix.md` first for the universal-versus-conditional
row convention and the column meanings; this file uses the same structure.

## Contents

1. [Shared collection rows](#shared-collection-rows)
2. [Null, empty, and unknown](#null-empty-and-unknown)
3. [List](#list)
4. [Set](#set)
5. [Map](#map)
6. [Object and single nested](#object-and-single-nested)
7. [List nested](#list-nested)
8. [Set nested](#set-nested)
9. [Map nested](#map-nested)
10. [Collapsing all of this into steps](#collapsing-all-of-this-into-steps)

## Shared collection rows

These apply to every collection kind. As with scalars, the baseline lifecycle in
SKILL.md absorbs nearly all of them, because a single step can add, remove, and
mutate elements at once.

| # | Scenario | Config transition | State after apply | Where | Import |
|---|---|---|---|---|---|
| 1 | Omitted | attribute absent | `knownvalue.Null()` | baseline step 1 | yes |
| 2 | Explicitly empty | `tags = []` | **configuration error** when a size validator is present; otherwise an empty collection | `ExpectError` step, or unit test on the validator | no |
| 3 | One element | absent to a single element | size 1 and the element's value | baseline step 3 | yes |
| 4 | Several elements | absent to two or more | exact contents | baseline step 3 | yes |
| 5 | Update an element | change one element's value in place | the changed contents | baseline step 5 | no |
| 6 | Add an element | append one | size grows, old elements intact | baseline step 5 | no |
| 7 | Remove an element | drop one | size shrinks, survivors intact | baseline step 5 | no |
| 8 | Remove all elements | to `[]` | configuration error with a size validator; otherwise empty | same as row 2 | no |
| 9 | Omitted after having values | attribute removed entirely | `knownvalue.Null()` | baseline step 6 | no |

Rows 5, 6, and 7 fit in **one** step: change one element, append one, drop one,
and assert the resulting collection exactly. Splitting them across three steps
triples the cost and proves nothing extra, because the assertion is on the final
contents either way.

Row 9 is the highest-value collection row. It is where a provider that flattens
the API's `[]` into an empty collection instead of null produces "inconsistent
result after apply". See the null contract in SKILL.md.

## Null, empty, and unknown

Three distinct states, and only some are reachable in this provider.

**Null.** The attribute is absent from config, or the API returned nothing and
`flex.FlattenStringValueSet` / `FlattenStringValueList` mapped `[]` to null.
This is the normal unset state and the thing to assert with
`knownvalue.Null()`.

**Empty.** A zero-length collection that is not null. For an `Optional`
collection carrying a size validator, a practitioner cannot configure this, so
it is an `ExpectError` row rather than a state row. For a `Computed` collection
on a data source, empty is the **correct** unset representation, because
`length()`, `contains()`, and `for_each` all fail on null. See
`references/data-sources.md`.

**Unknown.** The collection's value is not known at plan time. Terraform
produces this when the collection references another resource's computed
attribute, so it is only reachable in a test that wires two resources together:

```go
{
    Config: testAccWidgetConfig_tagsFromOtherResource(rName),
    ConfigPlanChecks: resource.ConfigPlanChecks{
        PreApply: []plancheck.PlanCheck{
            plancheck.ExpectUnknownValue(resourceName, tfjsonpath.New("tags")),
        },
    },
},
```

Add that row only when the resource realistically consumes another resource's
output, for example host group IDs or policy IDs. Unknown handling inside
validators and plan modifiers is far cheaper to unit test: build a request with
an unknown value and assert the code returns early without diagnostics.

## List

Order is part of a list's value. Two consequences:

| Trigger | Row | Where |
|---|---|---|
| Always | reorder the elements without changing membership; the plan must be non-empty and state must match the new order | one extra baseline step, or fold the reorder into the mutate step |
| API sorts or canonicalizes order | configure an order the API will not preserve and assert the order the API returns | separate step, since this is the setup for a permanent diff |

The reorder row matters because it distinguishes a genuine list from a set
modeled as a list. If reordering produces no diff, or produces a diff that never
converges, the schema type is wrong and no amount of test tuning fixes it.

Lists preserve duplicates. If the API allows duplicate entries and the provider
models them as a list, assert that a config with duplicates round-trips with
both entries present:

```go
statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("rules"),
    knownvalue.ListSizeExact(2)),
```

Use `knownvalue.ListExact` when the exact order matters, and
`knownvalue.ListPartial(map[int]knownvalue.Check{0: ...})` when only some
positions do.

## Set

Order is not part of a set's value, which removes rows and adds one.

| Trigger | Row | Where |
|---|---|---|
| Always | reorder elements in config; the plan must be **empty** | one cheap step with `plancheck.ExpectEmptyPlan()` |
| API returns elements in an unstable order | the empty-plan step above already catches it | same step |
| API permits duplicate values | do **not** model as a set; see below | schema review, not a test |

The reorder-produces-no-plan step is worth its cost once per resource that has a
set attribute, because an unstable-order permanent diff is a common and
confusing bug for practitioners, and this is the only assertion that catches it
directly.

Terraform Core collapses duplicate values in a set config, so "duplicates are
deduplicated" tests Core, not the provider. The provider-side risk runs the other
way: if the API returns duplicates and the provider flattens them into a set,
elements are silently lost and the plan never converges. When that is possible,
the collection must be a list, and the duplicate-preservation row above belongs
in the list section.

Assert with `knownvalue.SetExact([]knownvalue.Check{...})`, whose element order
in your Go slice is irrelevant, or `knownvalue.SetPartial` for membership only.
`acctest.StringSetOrNull(...)` builds the equivalent `types.Set` in unit tests.

## Map

Maps are keyed, so element identity is stable and the interesting rows are about
keys.

| # | Scenario | Config transition | State after apply | Where |
|---|---|---|---|---|
| 1 | Add a key | add one entry | new key present, existing keys unchanged | baseline step 5 |
| 2 | Update a value | change one entry's value | that key's new value, others unchanged | baseline step 5 |
| 3 | Remove a key | drop one entry | key absent, `MapSizeExact` reduced | baseline step 5 |
| 4 | Clear all keys | to `{}` | configuration error with a size validator; otherwise empty | `ExpectError` step |

Rows 1 through 3 collapse into one step. Navigate with
`tfjsonpath.New("labels").AtMapKey("env")` and assert whole maps with
`knownvalue.MapExact` or `knownvalue.MapPartial`.

Add a conditional row when the API constrains keys: reserved prefixes,
case-insensitive keys, or a maximum key count. Key-format rules are validator
work and belong in a unit test.

## Object and single nested

`ObjectAttribute` is type-only and cannot carry per-attribute validators,
defaults, or plan modifiers on its members. `SingleNestedAttribute` can. Prefer
single nested; the framework docs say so, and it is also far more testable,
since each member gets its own conditional rows.

| # | Scenario | Config transition | State after apply | Where |
|---|---|---|---|---|
| 1 | Object omitted | absent | `knownvalue.Null()` on the whole object | baseline step 1 |
| 2 | Object present, optional members omitted | absent to a minimal object | required members set, optional members null, members with defaults at their default | baseline step 3 |
| 3 | Object present, all members set | minimal to full object | `knownvalue.ObjectExact(...)` | baseline step 3 |
| 4 | One member changed | change a single member | only that member changes | baseline step 5 |
| 5 | One optional member removed | drop a member from the object | that member null, siblings unchanged | baseline step 5 |
| 6 | Object removed entirely | back to absent | `knownvalue.Null()` | baseline step 6 |

Row 5 is easy to overlook and catches partial-update bugs where the provider
sends the whole nested structure and the API keeps the removed member's old
value.

Each member is itself an attribute: apply `references/attribute-matrix.md` to it,
including its conditional rows. That is why deeply nested structures get
expensive, and why member-level validators should be unit tested rather than
driven through configs.

Assert whole objects with `ObjectExact` when the object is small and fully
determined, and `ObjectPartial` when the API fills in members you do not want to
pin.

## List nested

A list of objects. It inherits every list row (order matters, duplicates
preserved) plus every object row per element.

| Trigger | Row | Where |
|---|---|---|
| Always | change a field inside an existing element without touching the others | baseline step 5, asserted with `tfjsonpath.New("rules").AtSliceIndex(0).AtMapKey("priority")` |
| Always | remove a middle or first element from a multi-element list | its own step, see below |
| Nested member has a `Default` | a new element omitting that member gets the default | baseline step 3 |
| Nested member has a plan modifier | the modifier's behavior when elements shift | its own step, see below |

The remove-a-leading-element row deserves its own step because of a documented
framework caveat: list and set nested structures are index-based, and neither
Terraform nor the framework realigns prior state when elements are removed or
reordered. A two-element list whose first element is deleted still hands element
zero's prior state to the remaining element's plan modifiers and defaults. Any
nested plan modifier or default that reads prior state can produce wrong values
here, and only a test that actually shifts indices finds it.

```go
{
    // rules = [A, B]  ->  rules = [B]
    Config: testAccWidgetConfig_rulesSecondOnly(rName),
    ConfigStateChecks: []statecheck.StateCheck{
        statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("rules"),
            knownvalue.ListExact([]knownvalue.Check{
                knownvalue.ObjectExact(map[string]knownvalue.Check{
                    "action":   knownvalue.StringExact("deny"),
                    "priority": knownvalue.Int32Exact(50),
                }),
            })),
    },
},
```

## Set nested

A set of objects. Element identity is the **entire object**, which changes what
"update an element" means: modifying any field is a remove plus an add, not an
in-place edit. Consequences for tests:

- there is no stable index, so `AtSliceIndex` assertions are unreliable; assert
  the whole set with `SetExact`, or membership with `SetPartial`
- `plancheck.ExpectResourceAction` still reports an in-place `Update` of the
  parent resource; the churn is inside the set, so do not expect replacement
- the reorder-produces-no-plan row from the set section applies
- write-only arguments are not permitted under set nested attributes or set
  nested blocks, so no write-only rows exist here

Add a conditional row when the API treats one field of the object as a key, for
example a rule name that must be unique. That is a uniqueness validator
(`fwvalidators.ListObjectUniqueString` for the list case), unit tested, plus one
`ExpectError` step proving it is wired up.

## Map nested

A map of objects, keyed by practitioner-chosen strings. This is the most
test-friendly nested collection: keys give stable identity, so element updates
are genuinely in-place and assertions are unambiguous.

Combine the map rows with the object rows:

```go
statecheck.ExpectKnownValue(resourceName,
    tfjsonpath.New("rules").AtMapKey("ingress").AtMapKey("priority"),
    knownvalue.Int32Exact(10)),
```

One step can add a key, update a field under an existing key, and drop a key.
Assert the whole map with `MapExact` when the set of keys is fully determined.

## Collapsing all of this into steps

Read as a list, this file implies dozens of rows. In practice a resource with
several collections needs roughly this many acceptance steps beyond the baseline
lifecycle:

| Extra step | Justification | Skip when |
|---|---|---|
| Reorder a set, expect empty plan | catches unstable-order permanent diffs | the resource has no set attribute |
| Reorder a list, expect non-empty plan and new order | confirms order is genuinely significant | the resource has no list attribute whose order the API respects |
| Shift indices in a list nested attribute | catches index-misalignment bugs in nested defaults and plan modifiers | no list nested attribute, or no nested defaults or plan modifiers |
| One `ExpectError` step per empty-collection validator | proves the validator is attached | validators covered by unit tests **and** a single `ExpectError` step already covers the group |

Everything else belongs inside the six baseline steps. The way to keep this
affordable is to make step 3 rich (every collection populated with two or more
elements) and step 5 busy (every collection simultaneously gaining, losing, and
mutating an element), rather than to add steps.
