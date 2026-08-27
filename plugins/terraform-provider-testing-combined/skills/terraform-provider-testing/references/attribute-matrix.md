# Attribute Test Matrix: Primitives

Test rows for `StringAttribute`, `BoolAttribute`, `Int32Attribute`,
`Int64Attribute`, `Float32Attribute`, `Float64Attribute`, and
`NumberAttribute`.

Collections, objects, and nested attributes are in
`references/collections-matrix.md`. Behavior flags (required, optional,
computed, sensitive, write-only, defaults, replacement) are in
`references/schema-behaviors.md`.

## Contents

1. [How to read these matrices](#how-to-read-these-matrices)
2. [Universal rows: optional scalar](#universal-rows-optional-scalar)
3. [Universal rows: required scalar](#universal-rows-required-scalar)
4. [Conditional rows](#conditional-rows)
5. [Per-type notes](#per-type-notes)

## How to read these matrices

Each matrix splits into two kinds of row.

**Universal rows** apply to every attribute of that shape. They are almost
entirely absorbed by the baseline lifecycle `TestCase` in SKILL.md, so the
"Where" column names the baseline step that already discharges them. Absorbed
does not mean assumed: the step still needs the assertion for that attribute.

**Conditional rows** exist only when the schema or the API adds something: a
validator, a default, a plan modifier, a normalization rule, or a known API
quirk. If none of those apply, skip the row entirely. Adding conditional rows
"just in case" is how a matrix becomes unrunnable.

Column meanings:

- **Config transition**: what changes between the previous step and this one.
- **Plan**: what `ConfigPlanChecks.PreApply` should see. Blank means no plan
  assertion is worth its line; the built-in empty-final-plan check already
  covers the interesting failure.
- **State after apply**: the `ConfigStateChecks` assertion.
- **Where**: baseline step number, a named separate `TestCase`, or `unit`.
- **Import**: whether an import step after this state adds information.

## Universal rows: optional scalar

| # | Scenario | Config transition | Plan | State after apply | Where | Import |
|---|---|---|---|---|---|---|
| 1 | Omitted | attribute absent | create | `knownvalue.Null()` | baseline step 1 | yes |
| 2 | Configured | absent to a value | update | `knownvalue.StringExact("x")` and friends | baseline step 3 | yes |
| 3 | Changed | value to a different value | `ResourceActionUpdate` | the new value | baseline step 5 | no, step 4 already proved the shape |
| 4 | Removed | value back to absent | update | `knownvalue.Null()` | baseline step 6 | no |

Row 4 is the one people skip and the one that catches real bugs. It is where an
"inconsistent result after apply" surfaces because `.wrap()` wrote `""` into
state while the config held null, or because the API refuses to clear a field
and keeps returning the old value. If the API genuinely cannot clear the field,
that is a provider design problem to document, not a test to delete.

Row 1 for an attribute the API defaults on its own: assert the **documented API
default**, not null. Find out which it is before writing the assertion; guessing
here produces a test that passes for the wrong reason.

## Universal rows: required scalar

Rows 1 and 4 above do not apply. A required attribute cannot be omitted or
removed, and Terraform Core rejects a config missing it before the provider is
ever called. Writing an acceptance test for "missing required attribute errors"
tests Core, costs a Terraform run, and proves nothing about the provider.

| # | Scenario | Config transition | Plan | State after apply | Where | Import |
|---|---|---|---|---|---|---|
| 1 | Configured | initial create | create | the exact configured value | baseline step 1 | yes |
| 2 | Changed, in-place | value to a different value | `ResourceActionUpdate` | the new value | baseline step 5 | no |
| 3 | Changed, replacement | value to a different value | `ResourceActionDestroyBeforeCreate` | new value, **new id** | separate `TestCase`, see `references/schema-behaviors.md` | no |

Rows 2 and 3 are mutually exclusive per attribute: an attribute either updates
in place or forces replacement. Which one it is comes from the schema
(`RequiresReplace()`) and from what the API supports.

Configuration-error tests for a required attribute are worth writing only for
provider-owned rules, and they belong with the validators:
`references/validators.md`.

## Conditional rows

Add a row only when its trigger is present.

| Trigger | Row to add | Where |
|---|---|---|
| Any validator | valid value, invalid value, each boundary and one step either side, null and unknown handling | **unit**, on the validator itself |
| Any validator | one invalid config asserting the diagnostic surfaces | one `ExpectError` step, proves the validator is attached to the right attribute |
| `Default` | omitted config yields the default | baseline step 1 |
| `Default` | configured value overrides the default, then removal returns to the default | baseline steps 3 and 6 |
| `UseStateForUnknown()` | value is identical across an unrelated update | `statecheck.CompareValue(compare.ValuesSame())` across baseline steps 3 and 5 |
| `RequiresReplace()` | changing the value plans replacement | separate `TestCase` |
| Custom plan modifier | the modifier's decision under each branch it has | **unit** for the logic, one acceptance step per user-visible outcome |
| API normalizes the value (case, trim, sort, canonical form) | configure the non-canonical form, assert the canonical form in state | a step in the baseline lifecycle, or its own `TestCase` if it needs a distinct config |
| API derives the value from another attribute | assert the derived value, and that changing the source changes it | baseline steps 3 and 5 |
| API may omit the field from responses | see the disappearing-value row in `references/schema-behaviors.md` | as documented there |
| `Sensitive: true` | `statecheck.ExpectSensitiveValue` | baseline step 3 |
| `WriteOnly: true` | see `references/schema-behaviors.md` | as documented there |

## Per-type notes

### String

The default `Optional` string in this provider carries
`fwvalidators.StringNotWhitespace()`, which means `""` and whitespace-only
values are configuration errors, not states. So:

- there is no "explicitly empty string" state row; it is an `ExpectError` row
- unset is always `knownvalue.Null()`
- `knownvalue.StringExact("")` in an assertion is a sign the contract was
  misread

Worth a conditional row when the API is known to normalize: trailing whitespace,
letter case, URL trailing slashes, or a canonical identifier form. Configure the
non-canonical form and assert the canonical one, because that mismatch is
exactly what produces a permanent diff.

For a string with a format (timestamp, hash, email, CIDR), unit test the format
rule and use `knownvalue.StringRegexp` in acceptance tests rather than pinning a
value the API generates.

### Bool

Only two values, so rows 2 and 3 of the optional matrix together are exhaustive.
The trap is not coverage, it is serialization.

**Always assert that `false` survives a round trip.** gofalcon request models
frequently carry `omitempty` on bool fields, which silently drops `false` from
the request body, so the API keeps the previous value and the next plan shows a
permanent diff. The test that catches this is a step that sets the attribute to
`false` and asserts `knownvalue.Bool(false)`, with the following step's
empty-plan check confirming it stuck. If it fails, the fix is on the provider
side: override the generated request marshalling so the zero value is sent, and
leave the test as the thing that proves it now is.

The same reasoning makes `true` to `false` a more valuable transition than
`false` to `true`: only the first direction has to send a zero value.

For an `Optional` bool without `Computed`, all three of null, `true`, and
`false` are distinct and meaningful states. Do not collapse null and `false` in
assertions.

### Int32 and Int64

- Zero has the same `omitempty` hazard as `false`. If `0` is a legal value,
  assert a state where the attribute is `0`.
- Boundary testing belongs in a unit test of the validator: minimum, minimum
  minus one, maximum, maximum plus one. Four unit cases cost nothing; four
  acceptance steps cost minutes.
- All numeric known-value checks parse the state's `json.Number`, so
  `Int64Exact` will happily pass against an `Int32Attribute` holding an in-range
  value. Use the check matching the schema type for readability, but do not read
  a failure as a type mismatch; it is a value mismatch.
- `knownvalue.StringExact` against a numeric attribute fails with an explicit
  "expected json.Number" error. That error means the assertion is wrong, not the
  provider.

### Float32 and Float64

`Float64Exact` compares with `==`, no tolerance. If the API round-trips the
value through a different precision, an exact assertion fails on a value that is
functionally correct. Two options:

- assert an exact value only where the API is documented to preserve it
  verbatim, and choose test values that are exactly representable, such as
  `0.5`, `2.25`, `10.0`
- otherwise use `knownvalue.Float64Func` with your own tolerance:

```go
statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("threshold"),
    knownvalue.Float64Func(func(v float64) error {
        if math.Abs(v-0.15) > 1e-9 {
            return fmt.Errorf("expected ~0.15, got %v", v)
        }
        return nil
    }))
```

Add a conditional row when the API rounds or clamps: configure a value with more
precision than the API keeps and assert what comes back.

### Number

`NumberAttribute` is arbitrary precision and asserted with
`knownvalue.NumberExact(big.NewFloat(...))`. Reach for it only when the API
genuinely needs precision beyond 64 bits; otherwise `Int64Attribute` or
`Float64Attribute` gives a schema that is easier for practitioners and for
tests. When a resource does use it, add a conditional row for a value that would
lose precision as a float64, since preserving it is the entire reason the type
was chosen.
