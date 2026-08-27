# Validator and Cross-Attribute Testing

Validators are the cheapest thing in the provider to test exhaustively and the
most expensive thing to test through Terraform. This file is mostly about
keeping them on the cheap side.

## Contents

1. [The two-tier rule](#the-two-tier-rule)
2. [Unit testing a validator](#unit-testing-a-validator)
3. [Boundary rows](#boundary-rows)
4. [The wiring test](#the-wiring-test)
5. [Cross-attribute relationships](#cross-attribute-relationships)
6. [Writing ExpectError patterns](#writing-expecterror-patterns)
7. [Cases that need no provider test](#cases-that-need-no-provider-test)

## The two-tier rule

Split every validator into two tiers:

**Tier 1, unit tests, exhaustive.** Valid values, invalid values, every
boundary and one step either side, null, unknown, and any type-specific edge.
These run in milliseconds and cost nothing, so there is no reason to be
selective.

**Tier 2, one acceptance step, wiring only.** A single `ExpectError` step per
validator group proving the validator is attached to the schema at the right
path. This is the part a unit test cannot cover: a perfectly tested validator
attached to the wrong attribute, or omitted from the schema entirely, passes all
its unit tests and still ships broken.

The reason the split matters is that tier 1 rows are free and tier 2 rows are
not. Driving boundary values through Terraform costs a validate-and-plan cycle
each and tells you nothing the unit test did not already prove.

For validators from `terraform-plugin-framework-validators`
(`stringvalidator.LengthBetween`, `int32validator.Between`,
`setvalidator.SizeAtLeast`, and so on), tier 1 is already covered upstream by
that module's own tests. Only tier 2 applies: prove yours is wired up. Writing
unit tests for `stringvalidator.OneOf` re-tests HashiCorp's code.

For provider-owned validators in `internal/framework/validators`
(`StringNotWhitespace`, `CID`, `StringIsEmailAddress`, `SortField`,
`SetJoinedLengthAtMost`, `ListObjectUniqueString`,
`AtLeastOneNonEmptyAttribute`, and the `*Requires*` helpers), both tiers apply,
and tier 1 lives with the validator in `internal/framework/validators`.

## Unit testing a validator

Construct the request, call the method, inspect the diagnostics. Table-driven,
with the null and unknown cases present, because forgetting to return early on
null or unknown is the most common validator bug and it makes plans fail on
perfectly valid configurations.

```go
func TestStringNotWhitespace(t *testing.T) {
    t.Parallel()

    tests := map[string]struct {
        value       types.String
        expectError bool
    }{
        "null":            {value: types.StringNull(), expectError: false},
        "unknown":         {value: types.StringUnknown(), expectError: false},
        "empty":           {value: types.StringValue(""), expectError: true},
        "spaces only":     {value: types.StringValue("   "), expectError: true},
        "tab only":        {value: types.StringValue("\t"), expectError: true},
        "leading space":   {value: types.StringValue(" ok"), expectError: false},
        "valid":           {value: types.StringValue("ok"), expectError: false},
    }

    for name, test := range tests {
        t.Run(name, func(t *testing.T) {
            t.Parallel()

            req := validator.StringRequest{
                Path:           path.Root("description"),
                PathExpression: path.MatchRoot("description"),
                ConfigValue:    test.value,
            }
            resp := &validator.StringResponse{}

            fwvalidators.StringNotWhitespace().ValidateString(context.Background(), req, resp)

            if got := resp.Diagnostics.HasError(); got != test.expectError {
                t.Fatalf("expected error %t, got %t: %s", test.expectError, got, resp.Diagnostics)
            }
        })
    }
}
```

Null and unknown must not produce diagnostics. A value is unknown whenever it
references another resource's computed attribute, so a validator that errors on
unknown breaks any config that wires resources together, and no acceptance test
of literal values will ever catch it.

Path-based validators (`ConflictsWith`, `AlsoRequires`, and friends) read other
attributes through `req.Config`, so unit testing them requires building a
`tfsdk.Config` with a schema. That is enough friction that for path-based
validators the balance shifts: rely on the upstream module's tests for the
built-ins and put your effort into the tier 2 wiring steps below.

## Boundary rows

For any validator expressing a range or a length, tier 1 needs these rows. All
are unit tests.

| Row | Example for `LengthBetween(3, 64)` | Example for `Between(1, 10)` |
|---|---|---|
| Below the minimum | 2 characters | 0 |
| Exactly the minimum | 3 characters | 1 |
| Comfortably inside | 20 characters | 5 |
| Exactly the maximum | 64 characters | 10 |
| Above the maximum | 65 characters | 11 |
| Null | `types.StringNull()` | `types.Int32Null()` |
| Unknown | `types.StringUnknown()` | `types.Int32Unknown()` |

The immediately-inside and immediately-outside pairs are the whole point: an
off-by-one in a boundary is the defect this table exists to catch, and only those
four rows can see it.

For enumerations (`OneOf`), the rows are: each permitted value, one value
differing only in case, and one plainly invalid value. Case matters because
`OneOf` and `OneOfCaseInsensitive` behave differently and the choice is often
made carelessly.

For collection size validators, the rows are: zero elements, exactly the minimum,
exactly the maximum, one over.

## The wiring test

One `ExpectError` step per validator group. These fail during validate or plan,
so nothing is created and the cost is a Terraform run rather than a resource
lifecycle. Group them into a single `TestCase` with consecutive steps.

```go
func TestAccWidget_validation(t *testing.T) {
    rName := acctest.RandomResourceName()

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        Steps: []resource.TestStep{
            {
                Config:      testAccWidgetConfig_name(rName, "ab"),
                ExpectError: regexp.MustCompile(`Attribute name string length must be`),
            },
            {
                Config:      testAccWidgetConfig_description(rName, "   "),
                ExpectError: regexp.MustCompile(`Attribute description must not be`),
            },
            {
                Config:      testAccWidgetConfig_retryCount(rName, 42),
                ExpectError: regexp.MustCompile(`Attribute retry_count value must be between`),
            },
            {
                Config:      testAccWidgetConfig_emptyTags(rName),
                ExpectError: regexp.MustCompile(`Attribute tags set must contain at least`),
            },
        },
    })
}
```

Include the attribute name in the pattern. That is what makes this a wiring
test rather than a duplicate of the unit test: a validator attached to the wrong
attribute produces a diagnostic naming the wrong path, and the pattern fails.

Note there is no `CheckDestroy` here, because nothing is ever created.

## Cross-attribute relationships

Two ways to express these, and they produce different diagnostics, so know which
the schema uses before writing the pattern.

**Attribute-level**, from the typed validator packages, attached to one
attribute with `path.Expression` arguments:

| Validator | Meaning |
|---|---|
| `ConflictsWith(expressions...)` | this attribute and those paths cannot both be configured |
| `AlsoRequires(expressions...)` | if this attribute is configured, those paths must be too |
| `ExactlyOneOf(expressions...)` | exactly one of this attribute and those paths must be configured |
| `AtLeastOneOf(expressions...)` | at least one of this attribute and those paths must be configured |

**Resource-level**, from `resourcevalidator`, returned from the resource's
`ConfigValidators` method and covering a set of paths symmetrically:

| Validator | Meaning |
|---|---|
| `resourcevalidator.Conflicting(...)` | at most one of these paths configured |
| `resourcevalidator.RequiredTogether(...)` | all or none of these paths configured |
| `resourcevalidator.ExactlyOneOf(...)` | exactly one |
| `resourcevalidator.AtLeastOneOf(...)` | at least one |

Prefer the resource-level form for genuinely symmetric relationships. Declaring
`ConflictsWith` on one side only means the diagnostic depends on which attribute
the practitioner happened to set, which is confusing to users and awkward to
test.

Rows per relationship. All the invalid cases are `ExpectError` steps in the
validation `TestCase`; the valid cases are usually already covered by other
tests, so only add a step if no existing config exercises that combination.

| Relationship | Invalid case | Valid cases |
|---|---|---|
| Conflicting | both configured | each one alone; neither |
| Required together | one without the other, in each direction | both; neither |
| Exactly one of | none configured; more than one configured | each one alone |
| At least one of | none configured | each one alone; several together |

For mutually exclusive **configuration modes**, add a lifecycle `TestCase` rather
than only error steps, because the interesting behavior is switching between
them:

```go
func TestAccWidget_legacyConfig(t *testing.T) {
    // Step 1: create with legacy_config set; assert its members and that
    //         advanced_config is null.
    // Step 2: import round-trip.
    // Step 3: switch to advanced_config; assert legacy_config is now null
    //         and advanced_config's members are set.
}
```

Step 3 is the valuable one: switching modes exercises the update path where the
provider must clear one structure while populating the other, and a provider that
sends only the new structure leaves the old one live on the API. The
empty-final-plan check catches that without an explicit assertion.

## Writing ExpectError patterns

`ExpectError` takes a regular expression matched against the error output.

- **Anchor on the stable part.** Attribute path plus the validator's fixed
  phrasing survives wording tweaks; a full sentence copied from one run does not.
- **Escape metacharacters.** Diagnostics are full of parentheses, brackets, and
  dots. `regexp.QuoteMeta` is the safe way when you want a literal fragment.
- **Beware line wrapping.** Terraform wraps diagnostic text, so a pattern
  spanning what looks like one sentence can fail on an inserted newline. Match a
  short fragment, or use `(?s)` when you must span lines.
- **Never leave it empty or `.*`.** A pattern that matches anything turns the
  step into "some error happened", which passes when the resource fails for an
  entirely unrelated reason.
- **Do not add state checks to an `ExpectError` step.** Nothing was created, so
  there is nothing to assert.

## Cases that need no provider test

| Case | Why |
|---|---|
| Missing `Required` attribute | Terraform Core rejects it before the provider is called |
| Wrong type for an attribute | Core's schema type checking |
| Unknown attribute name in config | Core |
| A value that violates a built-in validator, tested for every boundary | the upstream validators module tests its own boundaries; you need only the wiring step |
| A custom type's own validation, such as an RFC3339 timestamp format | the type's tests cover it; test that the attribute uses the type |
| Set duplicate collapsing | Core deduplicates set elements |

Each of these consumes a Terraform run to re-prove someone else's code. Spend
those runs on provider and API behavior instead.
