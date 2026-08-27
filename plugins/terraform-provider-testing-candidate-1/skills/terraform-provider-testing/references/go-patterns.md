# Idiomatic Go Patterns

## Contents

1. [Acceptance lifecycle](#acceptance-lifecycle)
2. [Collection assertions](#collection-assertions)
3. [Replacement planning](#replacement-planning)
4. [Validation](#validation)
5. [Import and drift](#import-and-drift)
6. [Version and API cautions](#version-and-api-cautions)

Imports and exact symbols evolve. Confirm examples against the repository's
`github.com/hashicorp/terraform-plugin-testing` version and official
[state-check](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/state-checks/resource)
and [plan-check](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/plan-checks)
documentation.

## Acceptance lifecycle

```go
func TestAccWidget_lifecycle(t *testing.T) {
	t.Parallel()
	name := acctest.RandStringFromCharSet(12, acctest.CharSetAlphaNum)
	address := "example_widget.test"
	sameID := statecheck.CompareValue(compare.ValuesSame())

	resource.ParallelTest(t, resource.TestCase{
		PreCheck:                 func() { testAccPreCheck(t) },
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		CheckDestroy:             testAccCheckWidgetDestroy,
		Steps: []resource.TestStep{
			{
				// Optional description omitted.
				Config: testAccWidgetConfig(name, nil),
				ConfigStateChecks: []statecheck.StateCheck{
					stateCheckWidgetExists(address),
					statecheck.ExpectKnownValue(address, tfjsonpath.New("name"), knownvalue.StringExact(name)),
					statecheck.ExpectKnownValue(address, tfjsonpath.New("description"), knownvalue.Null()),
					sameID.AddStateValue(address, tfjsonpath.New("id")),
				},
			},
			{
				Config: testAccWidgetConfig(name, ptr("first")),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction(address, plancheck.ResourceActionUpdate),
					},
				},
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue(address, tfjsonpath.New("description"), knownvalue.StringExact("first")),
					sameID.AddStateValue(address, tfjsonpath.New("id")),
				},
			},
			{
				Config: testAccWidgetConfig(name, ptr("second")),
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue(address, tfjsonpath.New("description"), knownvalue.StringExact("second")),
					sameID.AddStateValue(address, tfjsonpath.New("id")),
				},
			},
			{
				Config: testAccWidgetConfig(name, nil),
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue(address, tfjsonpath.New("description"), knownvalue.Null()),
					sameID.AddStateValue(address, tfjsonpath.New("id")),
				},
			},
			{
				ResourceName:      address,
				ImportState:       true,
				ImportStateVerify: true,
			},
		},
	})
}

func testAccWidgetConfig(name string, description *string) string {
	descriptionHCL := ""
	if description != nil {
		descriptionHCL = fmt.Sprintf("\n  description = %q", *description)
	}
	return fmt.Sprintf(`
resource "example_widget" "test" {
  name = %[1]q%[2]s
}
`, name, descriptionHCL)
}
```

Do not call `t.Parallel()` in addition to `resource.ParallelTest` if the target
repository treats that as redundant; follow its convention. `CompareValue`
accumulates values across steps and proves an update did not replace identity.

## Collection assertions

```go
statecheck.ExpectKnownValue(address, tfjsonpath.New("ordered_rules"),
	knownvalue.ListExact([]knownvalue.Check{
		knownvalue.StringExact("first"),
		knownvalue.StringExact("second"),
	}))

statecheck.ExpectKnownValue(address, tfjsonpath.New("labels"),
	knownvalue.SetExact([]knownvalue.Check{
		knownvalue.StringExact("blue"),
		knownvalue.StringExact("green"),
	}))

statecheck.ExpectKnownValue(address, tfjsonpath.New("tags"),
	knownvalue.MapExact(map[string]knownvalue.Check{
		"env":  knownvalue.StringExact("test"),
		"team": knownvalue.StringExact("provider"),
	}))
```

For a list-nested object, assert an index with
`tfjsonpath.New("rules").AtSliceIndex(0).AtMapKey("name")`. For set-nested
objects, prefer `SetExact`, `SetPartial`, or a custom membership check; an
index is not stable. Assert null and empty distinctly with `knownvalue.Null()`
and the appropriate empty `ListExact`, `SetExact`, or `MapExact`.

## Replacement planning

```go
{
	Config:   testAccWidgetConfigImmutable(name, "scope-b"),
	PlanOnly: true,
	ConfigPlanChecks: resource.ConfigPlanChecks{
		PreApply: []plancheck.PlanCheck{
			// Use the replacement action supported by the pinned testing version.
			plancheck.ExpectResourceAction(address, plancheck.ResourceActionReplace),
		},
	},
}
```

Follow with an apply step and compare identity using
`statecheck.CompareValue(compare.ValuesDiffer())`. If the pinned release uses
separate destroy/create replacement constants or a different check, adapt to
that API—never weaken the assertion to merely `ExpectNonEmptyPlan`.

## Validation

```go
func TestAccWidget_validationName(t *testing.T) {
	resource.ParallelTest(t, resource.TestCase{
		PreCheck:                 func() { testAccPreCheck(t) },
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		Steps: []resource.TestStep{{
			Config:      testAccWidgetConfigInvalidName(""),
			ExpectError: regexp.MustCompile(`(?i)name.+at least 1`),
		}},
	})
}
```

Keep diagnostic matching specific enough to prove the right rule but resilient
to harmless framework prefixes. Table-test a custom validator directly:

```go
func TestNameValidator(t *testing.T) {
	tests := map[string]struct {
		value       types.String
		wantErrors  int
	}{
		"unknown skips semantic validation": {types.StringUnknown(), 0},
		"null handled by required schema":    {types.StringNull(), 0},
		"minimum":                            {types.StringValue("a"), 0},
		"below minimum":                      {types.StringValue(""), 1},
	}
	// Construct the framework validator request/response type used by the
	// pinned Framework version; assert diagnostics count, severity, and path.
}
```

## Import and drift

Basic import:

```go
{
	ResourceName:      address,
	ImportState:       true,
	ImportStateVerify: true,
	// Ignore only values the read API cannot reconstruct.
	ImportStateVerifyIgnore: []string{"write_only_token"},
}
```

Prefer no ignore list. For composite IDs, unit-test the parser with valid,
empty, missing-part, extra-part, and escaping cases, then acceptance-test one
valid and one malformed import.

For drift, use a custom `statecheck.StateCheck` or `PreConfig` callback to
mutate/delete through the API, followed by a refresh-only or same-config step.
Assert refreshed state and `RefreshPlanChecks`; do not mutate `.tfstate`.

## Version and API cautions

- `ConfigStateChecks` is preferred over legacy `Check`; do not mix both in one
  step. `CheckDestroy` remains a legacy `TestCheckFunc` hook.
- Assert sensitivity with `statecheck.ExpectSensitiveValue`; gate the Terraform
  CLI version required by the check.
- Gate write-only tests with `tfversion.SkipBelow` for the feature's minimum
  Terraform version and assert state null plus a safe remote effect.
- `ImportStateKind: resource.ImportBlockWithID` can test import blocks when the
  pinned testing version supports it; ordinary CLI import remains useful.
- Use Protocol 6 factories for Framework providers unless the provider actually
  serves Protocol 5.
