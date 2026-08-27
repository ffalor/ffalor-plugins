# Schema Behavior and Plan Modifier Testing

How each behavior flag on an attribute changes what needs testing: required,
optional, computed, optional plus computed, sensitive, write-only, defaults,
replacement, plan modifiers, and normalization.

Attribute-type rows live in `references/attribute-matrix.md` and
`references/collections-matrix.md`. Cross-attribute relationships live in
`references/validators.md`.

## Contents

1. [The null contract in depth](#the-null-contract-in-depth)
2. [Required](#required)
3. [Optional](#optional)
4. [Computed](#computed)
5. [Optional plus computed](#optional-plus-computed)
6. [Defaults](#defaults)
7. [Sensitive](#sensitive)
8. [Write-only](#write-only)
9. [Attributes that require replacement](#attributes-that-require-replacement)
10. [Plan modifiers](#plan-modifiers)
11. [Normalization](#normalization)

## The null contract in depth

The provider deliberately makes null the only representation of "unset". Two
mechanisms cooperate, and understanding both is what makes the matrix rows
predictable.

**Validators close the configuration side.** `fwvalidators.StringNotWhitespace()`
means a practitioner can supply null or a real value, never `""`. Size
validators on lists and sets mean null or at least one element, never `[]`.

**flex closes the API side.** `flex.StringPointerToFramework` and
`flex.StringValueToFramework` map `""` and nil to `types.StringNull()`.
`flex.FlattenStringValueSet` and `FlattenStringValueList` map `[]` to a null
collection.

Neither works alone. Without the validator, a practitioner writes `""`, flex
converts the read-back to null, and Terraform reports a mismatch. Without flex,
the API's `""` lands in state where the config held null, and Terraform reports
the mirror-image mismatch. CONTRIBUTING.md "State Consistency with flex and
Validators" has the provider-side detail.

What this changes in the matrices:

| Row you might expect | What it actually is here |
|---|---|
| unset optional string is `""` | `knownvalue.Null()` |
| unset optional collection is empty | `knownvalue.Null()` |
| `description = ""` is a valid state | an `ExpectError` row |
| `tags = []` is a valid state | an `ExpectError` row |
| distinguish null from empty in state | not reachable for optional attributes; do not spend steps on it |

The one exception is computed collections on data sources, which return empty
rather than null so that `length()`, `contains()`, and `for_each` work. See
`references/data-sources.md`.

When you find an attribute that violates this contract, the finding is a
provider bug to fix, not an assertion to loosen. A test asserting
`StringExact("")` on an optional attribute encodes the bug.

## Required

Terraform Core rejects a config that omits a required attribute, before the
provider is invoked. Do not spend an acceptance step proving it.

What is left to test:

- the configured value round-trips (baseline step 1)
- changing it updates in place, or forces replacement, whichever the schema and
  API dictate (baseline step 5, or the replacement `TestCase` below)
- provider-owned validity rules on the value, which are validator work

Scenarios that simply do not apply: omitted, removed, returning to null, and any
notion of a default.

## Optional

Fully covered by the four universal rows in `references/attribute-matrix.md`:
omitted, configured, changed, removed. Row 4, removal returning to null, is the
one that finds real bugs, and it is free because the baseline lifecycle's last
step performs it for every optional attribute at once.

## Computed

Computed without Optional means the practitioner cannot set the value. Core
errors on a config that tries, so that is not a provider test either.

| # | Scenario | How to test | Where |
|---|---|---|---|
| 1 | API supplies a value at create | `knownvalue.NotNull()`, or a regex when the shape is known and the value is not | baseline step 1 |
| 2 | Unknown during planning | `plancheck.ExpectUnknownValue(...)` in `ConfigPlanChecks.PreApply` on a step that changes something else | one existing step, no extra cost |
| 3 | Stable across an unrelated update | `statecheck.CompareValue(compare.ValuesSame())` accumulated across steps | baseline steps 1, 3, 5 |
| 4 | Changes after an update | `statecheck.CompareValue(compare.ValuesDiffer())` across the steps that should change it | baseline steps 3 and 5 |
| 5 | Changes after refresh, drift from an out-of-band edit | mutate remotely in `PreConfig`, then a `RefreshState` step | separate `TestCase`, see `references/import-refresh-drift.md` |
| 6 | Disappears from API responses | see below | separate `TestCase` |

Rows 3 and 4 are opposites and each attribute needs exactly one of them. An `id`
must be the same across every step; a `last_updated` must differ after an
update. Getting this wrong is how a resource silently recreates itself in
production while its tests stay green.

The framework marks computed attributes that are null in config as unknown
whenever the plan differs, which is what makes row 2 observable:

```go
ConfigPlanChecks: resource.ConfigPlanChecks{
    PreApply: []plancheck.PlanCheck{
        plancheck.ExpectUnknownValue(resourceName, tfjsonpath.New("last_updated")),
        plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionUpdate),
    },
},
```

**Row 6, values disappearing.** If the API stops returning a field it previously
returned, `.wrap()` writes null into a computed attribute. On refresh that is
legal and simply shows as drift, but during apply it can produce "Provider
produced inconsistent result after apply" when the plan carried a known value,
and it can produce a plan that never converges. This is worth a `TestCase` only
when you have evidence the API does it, for example a field that is populated
asynchronously. The shape is an out-of-band mutation followed by a refresh step
and a plan assertion; see `references/import-refresh-drift.md`.

## Optional plus computed

The awkward case, and the one most often tested wrongly.

`Optional` plus `Computed` means the practitioner may set the value, and when
they do not, provider logic or the API supplies it. The critical consequence:
**a null configuration is not a request to clear the value.** When the attribute
disappears from config, the framework marks it unknown at plan time and the
provider writes whatever it resolves at apply, which is normally the value the
API still holds. So removing an optional-plus-computed attribute from config
usually leaves the old value in place.

| # | Scenario | Expected result | Where |
|---|---|---|---|
| 1 | Omitted, with a `Default` | the default, deterministically | baseline step 1 |
| 2 | Omitted, no `Default` | whatever the API supplies; assert the **documented** value, not null | baseline step 1 |
| 3 | Configured explicitly | the configured value exactly, overriding default or API value | baseline step 3 |
| 4 | Changed | the new value, in place | baseline step 5 |
| 5 | Removed, with a `Default` | back to the default | baseline step 6 |
| 6 | Removed, no `Default` | the prior value is retained; assert that, and say so in the attribute's description | baseline step 6 |
| 7 | Unknown at plan time after removal | `plancheck.ExpectUnknownValue` | fold into step 6 |
| 8 | Remote drift | refresh adopts the remote value with no plan diff, because config is null and there is nothing to differ | `references/import-refresh-drift.md` |

Row 6 is where tests written from habit fail. `knownvalue.Null()` after removal
is correct for a plain `Optional` attribute and wrong for
`Optional` plus `Computed`. Determine which the schema declares before writing
the assertion.

Row 6 is also a design smell worth flagging in review: if an attribute can never
be cleared once set, practitioners have no way back, and the usual fix is to
drop `Computed` (so null means null) or to add a `Default` (so removal is
deterministic). Prefer plain `Optional` unless the API genuinely supplies a value
the provider cannot predict.

## Defaults

A `Default` requires `Computed`, and the framework applies it during planning
whenever the configuration value is null, immediately before computed nulls
become unknown.

| Row | Assertion | Where |
|---|---|---|
| Omitted yields the default | `knownvalue.Bool(true)`, `Int32Exact(50)`, and so on | baseline step 1 |
| Explicit non-default value wins | the configured value | baseline step 3 |
| Removal returns to the default | the default again, not null | baseline step 6 |
| Nested member default | a new nested element omitting that member gets the default | baseline step 3, see `references/collections-matrix.md` |

The framework guarantees the mechanism, so these rows test that **the value you
chose is the value users get**, which is the part that can be wrong. Pin the
literal default rather than `NotNull()`: the whole point of a default is that it
is a specific documented value, and a changed default is a breaking change for
existing configurations. A test pinning the literal turns that into a visible
failure instead of a silent diff for every user.

## Sensitive

`Sensitive: true` affects display, not storage: the value is still written to
state. Two rows:

| Row | Assertion | Where |
|---|---|---|
| Marked sensitive in state | `statecheck.ExpectSensitiveValue(resourceName, tfjsonpath.New("api_token"))` | baseline step 3 |
| Marked sensitive in the plan | `plancheck.ExpectSensitiveValue(...)` | only when the plan display matters, usually skip |

State-level sensitivity requires Terraform 1.4.6 or later, so gate the test
case:

```go
TerraformVersionChecks: []tfversion.TerraformVersionCheck{
    tfversion.SkipBelow(tfversion.Version1_4_6),
},
```

If the API does not return the secret on read, the value cannot round-trip
through import; add it to `ImportStateVerifyIgnore`. Consider whether the
attribute should be write-only instead.

## Write-only

`WriteOnly: true` requires Terraform 1.11 or later, must be paired with
`Required` or `Optional`, cannot be `Computed`, and is not permitted on set
attributes, set nested attributes, or set nested blocks. The framework nullifies
the value in the plan and in state for every RPC, so the provider reads it from
configuration rather than plan.

| # | Row | Assertion | Where |
|---|---|---|---|
| 1 | Configured value is absent from state | `knownvalue.Null()` even though the config sets it | one step in a write-only `TestCase` |
| 2 | Changing only the write-only value produces no plan | `plancheck.ExpectEmptyPlan()` | next step in the same `TestCase` |
| 3 | Changing the paired trigger attribute does produce an update, and the new secret reaches the API | `ResourceActionUpdate` plus whatever proves the API accepted it | next step |
| 4 | Import leaves it null | `ImportStateVerify` passes with no ignore entry, since state is null before and after | an import step |
| 5 | Write-only under `RequiresReplace` always forces replacement | `ResourceActionDestroyBeforeCreate` | only if the schema does this |

Row 2 is the defining behavior and the reason write-only arguments need a design
partner: because they can never produce a diff on their own, the provider has no
way to know the secret changed. The provider must pair the write-only attribute
with a trigger, either a version or keepers attribute, or a hash kept in private
state. Row 3 tests that pairing, and a resource with a write-only argument and no
trigger has a functional gap that a test cannot paper over.

```go
resource.ParallelTest(t, resource.TestCase{
    TerraformVersionChecks: []tfversion.TerraformVersionCheck{
        tfversion.SkipBelow(tfversion.Version1_11_0),
    },
    // ...
})
```

## Attributes that require replacement

Verify both the plan and the lifecycle. A plan check alone proves Terraform
intends to replace; it does not prove the replacement works.

```go
func TestAccWidget_requiresReplace(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"

    // The id must change: that is what "replacement" means observably.
    idChanged := statecheck.CompareValue(compare.ValuesDiffer())

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            {
                Config: testAccWidgetConfig_region(rName, "us-1"),
                ConfigStateChecks: []statecheck.StateCheck{
                    idChanged.AddStateValue(resourceName, tfjsonpath.New("id")),
                },
            },
            {
                Config: testAccWidgetConfig_region(rName, "us-2"),
                ConfigPlanChecks: resource.ConfigPlanChecks{
                    PreApply: []plancheck.PlanCheck{
                        plancheck.ExpectResourceAction(resourceName,
                            plancheck.ResourceActionDestroyBeforeCreate),
                    },
                },
                ConfigStateChecks: []statecheck.StateCheck{
                    testAccCheckWidgetExists(resourceName),
                    idChanged.AddStateValue(resourceName, tfjsonpath.New("id")),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("region"),
                        knownvalue.StringExact("us-2")),
                },
            },
        },
    })
}
```

Notes:

- `ResourceActionDestroyBeforeCreate` is the default replacement action.
  `ResourceActionCreateBeforeDestroy` only appears when the practitioner opts in
  with the `create_before_destroy` meta-argument, which a provider test normally
  does not set.
- Pairing the plan check with a `ValuesDiffer` comparer on `id` is what turns
  "Terraform said it would replace" into "it actually replaced". Without it a
  provider that reuses the same remote object passes the plan check.
- The mirror-image test matters just as much: an attribute the API **can** update
  in place must not carry `RequiresReplace()`. The baseline lifecycle's
  `ResourceActionUpdate` plan check on step 5 covers that for every other
  attribute at once.
- `RequiresReplaceIf()` and `RequiresReplaceIfConfigured()` add a condition, so
  they need one step per branch: one where the condition holds and replacement is
  planned, one where it does not and an in-place update is planned. Unit test the
  condition logic itself.

## Plan modifiers

| Modifier | What to test | Where |
|---|---|---|
| `UseStateForUnknown()` | the value is identical across steps that change other attributes | `CompareValue(compare.ValuesSame())` across baseline steps |
| `RequiresReplace()` and variants | see above | separate `TestCase` |
| Custom modifier | every branch of its decision logic | **unit**, by constructing a request and asserting the response |
| Custom modifier | each user-visible outcome | one acceptance step per outcome |

`UseStateForUnknown()` is only correct on attributes that genuinely never change
for the life of the resource: `id`, `created_at`, `created_by`. Putting it on
something the API updates, such as `last_updated` or a version counter, makes
the plan claim the old value will persist and then hands Terraform a different
value at apply, which surfaces as "Provider produced inconsistent result after
apply". Two tests guard this: a `ValuesSame` comparer on the truly immutable
attributes, and a `ValuesDiffer` comparer on the ones that must change after an
update.

Custom plan modifiers are much cheaper to unit test than to drive through
configs, because a unit test can construct exactly the request shape each branch
needs, including the null-state creation case and the null-plan destroy case
that plan modifiers must handle:

```go
func TestNormalizePriorityModifier(t *testing.T) {
    t.Parallel()

    tests := map[string]struct {
        state, config, plan types.Int32
        expected            types.Int32
    }{
        "create leaves plan untouched": {
            state: types.Int32Null(), config: types.Int32Value(5),
            plan: types.Int32Value(5), expected: types.Int32Value(5),
        },
        // one case per branch
    }
    // ...
}
```

Reserve acceptance coverage for the outcome a practitioner would notice.

## Normalization

Normalization is either provider-side or API-side, and they are tested
differently.

**Provider-side** (a helper lowercases, trims, sorts, or canonicalizes before
sending, or after reading): unit test the helper across the interesting inputs.
That is where the logic lives and where the cases are cheap. Then add one
acceptance step that configures a non-canonical value and asserts the canonical
result, to prove the helper is actually wired into `.wrap()` or the expand path.

**API-side** (the API returns a different form than was sent): only an acceptance
test can find it, and finding it is the point, because it is the most common
cause of a permanent diff. The step is:

```go
{
    // API upper-cases this identifier on write.
    Config: testAccWidgetConfig_code(rName, "abc-123"),
    ConfigStateChecks: []statecheck.StateCheck{
        statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("code"),
            knownvalue.StringExact("ABC-123")),
    },
},
```

If that step passes but the following plan is non-empty, the provider needs
normalization on the way in, a `Computed` marking, or a custom type that treats
the two forms as semantically equal. The built-in empty-final-plan check reports
this without any assertion at all, which is why every step is a normalization
test whether or not you write one.
