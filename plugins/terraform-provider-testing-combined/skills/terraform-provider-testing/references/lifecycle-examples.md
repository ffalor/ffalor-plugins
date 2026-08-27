# Lifecycle Pattern and Worked Examples

The baseline lifecycle from SKILL.md, written out, plus the supporting helpers
every resource test file needs. Every other reference file assumes the example
schema below.

## Contents

1. [Example schema](#example-schema)
2. [Worked baseline lifecycle](#worked-baseline-lifecycle)
3. [Config helpers](#config-helpers)
4. [Custom state checks](#custom-state-checks)
5. [CheckDestroy](#checkdestroy)
6. [Test dependencies](#test-dependencies)
7. [Regression tests](#regression-tests)

## Example schema

```go
resp.Schema = schema.Schema{
    Attributes: map[string]schema.Attribute{
        "id": schema.StringAttribute{
            Computed:      true,
            PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
        },
        "name": schema.StringAttribute{
            Required:   true,
            Validators: []validator.String{stringvalidator.LengthBetween(3, 64)},
        },
        "description": schema.StringAttribute{
            Optional:   true,
            Validators: []validator.String{fwvalidators.StringNotWhitespace()},
        },
        "enabled": schema.BoolAttribute{
            Optional: true,
            Computed: true,
            Default:  booldefault.StaticBool(true),
        },
        "region": schema.StringAttribute{
            Required:      true,
            PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
        },
        "retry_count": schema.Int32Attribute{
            Optional:   true,
            Validators: []validator.Int32{int32validator.Between(1, 10)},
        },
        "tags": schema.SetAttribute{
            Optional:    true,
            ElementType: types.StringType,
            Validators:  []validator.Set{setvalidator.SizeAtLeast(1)},
        },
        "rules": schema.ListNestedAttribute{
            Optional: true,
            NestedObject: schema.NestedAttributeObject{
                Attributes: map[string]schema.Attribute{
                    "action":   schema.StringAttribute{Required: true},
                    "priority": schema.Int32Attribute{Optional: true, Computed: true,
                        Default: int32default.StaticInt32(50)},
                },
            },
        },
        "api_token": schema.StringAttribute{Optional: true, Sensitive: true},
        "created_at": schema.StringAttribute{Computed: true},
        "last_updated": schema.StringAttribute{Computed: true},
    },
}
```

## Worked baseline lifecycle

Six steps carry the omitted / set / updated / removed rows for every optional
attribute at once, plus import round-trips at each distinct shape. Comments
mark which matrix rows each step discharges.

```go
func TestAccWidget_basic(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"

    // Same id across every step proves no accidental replacement.
    idUnchanged := statecheck.CompareValue(compare.ValuesSame())

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            {
                // Required only. Optionals omitted; optional+computed take defaults.
                Config: testAccWidgetConfig_basic(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    testAccCheckWidgetExists(resourceName),
                    idUnchanged.AddStateValue(resourceName, tfjsonpath.New("id")),

                    // Computed: set by the API.
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("id"), knownvalue.NotNull()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("created_at"), knownvalue.NotNull()),

                    // Required: exactly what was configured.
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("name"), knownvalue.StringExact(rName)),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("region"), knownvalue.StringExact("us-1")),

                    // Optional and omitted: null, never "" and never an empty collection.
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("description"), knownvalue.Null()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("retry_count"), knownvalue.Null()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("tags"), knownvalue.Null()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("rules"), knownvalue.Null()),

                    // Optional+computed: the documented default.
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("enabled"), knownvalue.Bool(true)),
                },
            },
            {
                ResourceName:            resourceName,
                ImportState:             true,
                ImportStateVerify:       true,
                ImportStateVerifyIgnore: []string{"last_updated"},
            },
            {
                // Every optional set. Collections carry several elements.
                Config: testAccWidgetConfig_full(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    testAccCheckWidgetExists(resourceName),
                    idUnchanged.AddStateValue(resourceName, tfjsonpath.New("id")),

                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("description"),
                        knownvalue.StringExact("managed by terraform")),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("enabled"), knownvalue.Bool(false)),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("retry_count"), knownvalue.Int32Exact(5)),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("tags"),
                        knownvalue.SetExact([]knownvalue.Check{
                            knownvalue.StringExact("prod"),
                            knownvalue.StringExact("critical"),
                        })),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("rules"),
                        knownvalue.ListExact([]knownvalue.Check{
                            knownvalue.ObjectExact(map[string]knownvalue.Check{
                                "action":   knownvalue.StringExact("allow"),
                                "priority": knownvalue.Int32Exact(10),
                            }),
                            knownvalue.ObjectExact(map[string]knownvalue.Check{
                                "action":   knownvalue.StringExact("deny"),
                                "priority": knownvalue.Int32Exact(50), // nested default
                            }),
                        })),
                    statecheck.ExpectSensitiveValue(resourceName, tfjsonpath.New("api_token")),
                },
            },
            {
                ResourceName:            resourceName,
                ImportState:             true,
                ImportStateVerify:       true,
                ImportStateVerifyIgnore: []string{"last_updated", "api_token"},
            },
            {
                // Separate step: ImportStateVerify cannot be combined with a
                // plannable import block, so prove the import-block workflow
                // plans no changes on its own.
                ResourceName:    resourceName,
                ImportState:     true,
                ImportStateKind: resource.ImportBlockWithID,
                ImportPlanChecks: resource.ImportPlanChecks{
                    PreApply: []plancheck.PlanCheck{
                        plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionNoop),
                    },
                },
            },
            {
                // Mutate: change scalars, update one element, add one, remove one,
                // change a nested field. In-place, not replacement.
                Config: testAccWidgetConfig_updated(rName),
                ConfigPlanChecks: resource.ConfigPlanChecks{
                    PreApply: []plancheck.PlanCheck{
                        plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionUpdate),
                    },
                },
                ConfigStateChecks: []statecheck.StateCheck{
                    idUnchanged.AddStateValue(resourceName, tfjsonpath.New("id")),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("description"),
                        knownvalue.StringExact("updated")),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("tags"),
                        knownvalue.SetExact([]knownvalue.Check{
                            knownvalue.StringExact("prod"),   // kept
                            knownvalue.StringExact("staging"), // added; "critical" removed
                        })),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("rules"),
                        knownvalue.ListSizeExact(1)),
                    statecheck.ExpectKnownValue(resourceName,
                        tfjsonpath.New("rules").AtSliceIndex(0).AtMapKey("priority"),
                        knownvalue.Int32Exact(99)),
                },
            },
            {
                // Every optional removed again. Optionals return to null;
                // optional+computed returns to its default.
                Config: testAccWidgetConfig_basic(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    idUnchanged.AddStateValue(resourceName, tfjsonpath.New("id")),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("description"), knownvalue.Null()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("retry_count"), knownvalue.Null()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("tags"), knownvalue.Null()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("rules"), knownvalue.Null()),
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("enabled"), knownvalue.Bool(true)),
                },
            },
        },
    })
}
```

Notes on the shape:

- The final step is where "inconsistent result after apply" bugs surface. If
  `.wrap()` writes `""` where the config has null, or `[]` where the config has
  no collection, this step fails. That is the single highest-value step in the
  file, so never drop it to save time.
- `ConfigPlanChecks.PreApply` with `ResourceActionUpdate` is the cheap way to
  catch an accidental `RequiresReplace` or an unstable computed value. It costs
  nothing extra: the plan runs regardless.
- The reused `idUnchanged` comparer turns "did this silently recreate the
  resource?" into one line per step.
- Do not mix the legacy `Check` field with `ConfigStateChecks` in the same step.

## Config helpers

Helpers live at the bottom of the file, use indexed verbs, and are parameterized
rather than duplicated. `%[1]q` quotes and escapes; `%[1]s` interpolates raw.

```go
func testAccWidgetConfig_basic(name string) string {
    return fmt.Sprintf(`
resource "crowdstrike_widget" "test" {
  name   = %[1]q
  region = "us-1"
}
`, name)
}

func testAccWidgetConfig_full(name string) string {
    return fmt.Sprintf(`
resource "crowdstrike_widget" "test" {
  name        = %[1]q
  region      = "us-1"
  description = "managed by terraform"
  enabled     = false
  retry_count = 5
  tags        = ["prod", "critical"]
  api_token   = "s3cret"

  rules = [
    { action = "allow", priority = 10 },
    { action = "deny" },
  ]
}
`, name)
}
```

When several tests need the same value varied, take it as a parameter instead of
writing near-identical helpers:

```go
// One helper, not testAccWidgetConfig_md5 / _sha256 / _domain.
func testAccIndicatorConfig_type(name, iocType, value string) string {
    return fmt.Sprintf(`
resource "crowdstrike_ioc" "test" {
  name  = %[1]q
  type  = %[2]q
  value = %[3]q
}
`, name, iocType, value)
}
```

## Custom state checks

Built-in state checks only see Terraform state. To assert what the **API**
holds, implement `statecheck.StateCheck`. Keep the exists check separate so
every step can reuse it, which is the pattern the official testing docs
recommend.

A small shared lookup keeps the implementations short:

```go
func stateResourceAtAddress(state *tfjson.State, address string) (*tfjson.StateResource, error) {
    if state == nil || state.Values == nil || state.Values.RootModule == nil {
        return nil, fmt.Errorf("no state available")
    }
    for _, r := range state.Values.RootModule.Resources {
        if r.Address == address {
            return r, nil
        }
    }
    return nil, fmt.Errorf("not found in state: %s", address)
}
```

### Exists

```go
type widgetExistsCheck struct {
    resourceAddress string
}

func (c widgetExistsCheck) CheckState(ctx context.Context, req statecheck.CheckStateRequest, resp *statecheck.CheckStateResponse) {
    rs, err := stateResourceAtAddress(req.State, c.resourceAddress)
    if err != nil {
        resp.Error = err
        return
    }

    id, ok := rs.AttributeValues["id"].(string)
    if !ok || id == "" {
        resp.Error = fmt.Errorf("%s: no id in state", c.resourceAddress)
        return
    }

    params := widgets.NewGetWidgetsParamsWithContext(ctx)
    params.Ids = []string{id}

    if _, err := testconfig.GetTestClient().Widgets.GetWidgets(params); err != nil {
        resp.Error = fmt.Errorf("widget %s not found via API: %w", id, err)
    }
}

func testAccCheckWidgetExists(resourceAddress string) statecheck.StateCheck {
    return widgetExistsCheck{resourceAddress: resourceAddress}
}
```

### Disappears

Deletes the object out of band so the next plan must propose recreation rather
than erroring. See `references/import-refresh-drift.md` for the full
`_disappears` test.

```go
type widgetDisappearsCheck struct {
    resourceAddress string
}

func (c widgetDisappearsCheck) CheckState(ctx context.Context, req statecheck.CheckStateRequest, resp *statecheck.CheckStateResponse) {
    rs, err := stateResourceAtAddress(req.State, c.resourceAddress)
    if err != nil {
        resp.Error = err
        return
    }

    params := widgets.NewDeleteWidgetsParamsWithContext(ctx)
    params.Ids = []string{rs.AttributeValues["id"].(string)}

    if _, err := testconfig.GetTestClient().Widgets.DeleteWidgets(params); err != nil {
        resp.Error = fmt.Errorf("deleting widget out of band: %w", err)
    }
}

func testAccCheckWidgetDisappears(resourceAddress string) statecheck.StateCheck {
    return widgetDisappearsCheck{resourceAddress: resourceAddress}
}
```

## CheckDestroy

`TestCase.CheckDestroy` is typed `resource.TestCheckFunc`, so this is the one
place where the legacy check signature is still correct rather than legacy. It
runs once after all steps and the final destroy.

```go
func testAccCheckWidgetDestroy(s *terraform.State) error {
    client := testconfig.GetTestClient()

    for _, rs := range s.RootModule().Resources {
        if rs.Type != "crowdstrike_widget" {
            continue
        }

        params := widgets.NewGetWidgetsParamsWithContext(context.Background())
        params.Ids = []string{rs.Primary.ID}

        _, err := client.Widgets.GetWidgets(params)
        if err == nil {
            return fmt.Errorf("widget %s still exists", rs.Primary.ID)
        }

        // Match by error type, never by message text.
        var notFound *widgets.GetWidgetsNotFound
        if !errors.As(err, &notFound) {
            return fmt.Errorf("checking widget %s: %w", rs.Primary.ID, err)
        }
    }

    return nil
}
```

Distinguish "gone" from "the call failed" by error type. Treating every error as
"gone" makes `CheckDestroy` pass when the API is simply unreachable.

## Test dependencies

A resource that needs another resource creates it in its own config so the test
runs against a clean account:

```go
func testAccWidgetConfig_withHostGroup(name string) string {
    return fmt.Sprintf(`
resource "crowdstrike_host_group" "test" {
  name        = %[1]q
  type        = "static"
  description = "acceptance test"
}

resource "crowdstrike_widget" "test" {
  name           = %[1]q
  region         = "us-1"
  host_group_ids = [crowdstrike_host_group.test.id]
}
`, name)
}
```

Watch the dependency lifecycle across steps. If an update step drops the
dependency from the config, Terraform may destroy it while the resource under
test still references it, and the step fails on a dangling reference. Keep any
dependency the resource still needs present in every step's config, even when
the attribute pointing at it changes.

## Regression tests

A bug fix ideally lands as two commits: first the failing regression test, then
the fix. A reviewer can then check out the first commit to confirm the test
really reproduces the bug, and advance to see it pass.

Name the test for the issue and link the report in a doc comment, since tracing
it back to the report is the point.

```go
// TestAccWidget_regressionGH1234 covers https://github.com/CrowdStrike/terraform-provider-crowdstrike/issues/1234
// The API returned duplicate rules on read, which the provider deduplicated,
// producing a permanent diff.
func TestAccWidget_regressionGH1234(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            {
                Config: testAccWidgetConfig_duplicateRules(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("rules"),
                        knownvalue.ListSizeExact(2)),
                },
            },
        },
    })
}
```

The empty-final-plan guarantee does the heavy lifting here: a permanent-diff bug
fails the step without any assertion at all.
