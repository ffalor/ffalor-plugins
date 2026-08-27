# Pull Request Review Checklist

Use this when reviewing test changes or self-reviewing before opening a PR. Items
are ordered by how often they are the actual problem.

Findings here are almost always fixable in the test. Where an item points at the
resource implementation instead, say so in the review rather than loosening the
test: a weakened assertion is a defect that ships.

Judge the diff against this checklist and the schema, not against the other test
files in the package. "It matches how the neighbouring resource does it" is not a
justification when the neighbour is one of the files this checklist exists to
correct.

## Coverage

- [ ] Every attribute in the schema appears in at least one assertion. An
      attribute nothing asserts is an attribute nobody knows works.
- [ ] Every optional attribute is driven through the full arc: omitted, set,
      changed, removed. The removal step exists and is not the one that got
      trimmed for time.
- [ ] Computed attributes are asserted for stability or change, whichever is
      correct: identifiers with `compare.ValuesSame()`, modification timestamps
      with `compare.ValuesDiffer()`.
- [ ] Every collection is exercised with more than one element, and one step adds,
      removes, and mutates elements together.
- [ ] Nested objects have a step where an optional member is removed while its
      siblings stay.
- [ ] Import steps follow each distinct state, not only the last one.
- [ ] A `_disappears` test exists, proving `Read` removes a deleted resource from
      state instead of erroring.
- [ ] `Read` treats an empty resource list like a 404, and `Delete` treats a 404 as
      success. See `references/error-contract.md`.
- [ ] Attributes with `RequiresReplace()` have a test asserting
      `ResourceActionDestroyBeforeCreate` **and** a changed `id`.
- [ ] A sweeper exists and filters on `sweep.ResourcePrefix` or the UUID prefix.
- [ ] Validators have unit tests covering boundaries, and one acceptance
      `ExpectError` step proving each is attached to the right attribute.

## Correctness of assertions

- [ ] Unset optional attributes assert `knownvalue.Null()`, not `StringExact("")`
      and not `ListSizeExact(0)`.
- [ ] `Optional` plus `Computed` attributes assert the documented post-removal
      behavior, which is normally the retained or default value rather than null.
- [ ] Attributes with a `Default` assert the literal default value, not
      `NotNull()`.
- [ ] Set attributes are asserted with `SetExact` or `SetPartial`, never by
      `AtSliceIndex`.
- [ ] Float assertions either use exactly representable values or
      `knownvalue.Float64Func` with a tolerance.
- [ ] `ExpectError` patterns name the attribute and are not `.*` or an empty
      pattern.
- [ ] `ExpectError` steps carry no state checks, since nothing was created.
- [ ] Computed collections on data sources assert an empty collection rather than
      null when there are no results.
- [ ] Plural data sources assert membership, not an exact count, unless the filter
      makes the count deterministic.
- [ ] Data source tests compare every exposed attribute against the resource with
      `CompareValuePairs`.

## Cost

- [ ] Scenarios are consecutive steps of one `TestCase` wherever they can share a
      created resource, rather than separate `TestCase`s.
- [ ] Validator boundaries live in unit tests, not in acceptance steps.
- [ ] Expand, flatten, `.wrap()`, filter, sort, and import-ID parsing have unit
      tests; those cases are not driven through Terraform.
- [ ] No step exists solely to re-prove Terraform Core or framework behavior:
      missing required attribute, type mismatch, set deduplication, unknown
      propagation.
- [ ] No step exists solely to assert an empty final plan; the framework already
      fails a step whose final plan is non-empty.
- [ ] Separate `TestCase`s each earn their existence by needing different steps,
      not by being conceptually distinct.

## Current APIs

- [ ] Assertions use `ConfigStateChecks` with `statecheck`, not the legacy `Check`
      field with `resource.TestCheck*`.
- [ ] `Check` and `ConfigStateChecks` are not mixed in the same step.
- [ ] `resource.TestCheckFunc` appears only where its type is required:
      `CheckDestroy`, `ImportStateCheck`, `ImportStateIdFunc`.
- [ ] Plan assertions use `plancheck` through `ConfigPlanChecks` or
      `RefreshPlanChecks`.
- [ ] `resource.ParallelTest` is used unless the test genuinely cannot run
      concurrently.
- [ ] Import steps use `ImportStateVerify: true` with the default import kind. No
      step pairs `ImportStateVerify` or `ImportStatePersist` with
      `ImportStateKind: resource.ImportBlockWithID`, which the module rejects.
- [ ] Features with a minimum Terraform version are gated with
      `TerraformVersionChecks`: 1.4.6 for `ExpectSensitiveValue` in state, 1.11
      for write-only arguments.

## Structure and naming

- [ ] `TestAcc<Resource>_<scenario>`; `TestAcc<Resource>DataSource_<scenario>`;
      `TestAcc<Resource>_<attribute>_<value>` when a value is pinned.
- [ ] Test names describe behavior, not tickets. The exception is
      `TestAcc<Resource>_regressionGH<issue>` with a doc comment linking the
      report.
- [ ] Config helpers are named `testAcc<Resource>Config_<description>` and sit at
      the bottom of the file.
- [ ] Near-identical config helpers differing by one literal are collapsed into
      one parameterized helper.
- [ ] Configs use indexed format verbs (`%[1]q`) and contain no `provider` block.
- [ ] Resource addresses use the `.test` label and are held in `resourceName` /
      `dataSourceName` variables.
- [ ] Unit tests live in the `_test.go` file beside the code they cover, not in a
      catch-all file. Unexported symbols are reached through `export_test.go`
      aliases.
- [ ] Resource-specific helpers stay in that resource's test file rather than
      being added to `internal/acctest`.

## Hygiene

- [ ] Names come from `acctest.RandomResourceName()`, so the resource is
      sweepable and parallel runs do not collide.
- [ ] No hardcoded tenant-specific values: CIDs, host group IDs, policy IDs,
      sensor versions.
- [ ] Extra environment requirements go through `acctest.PreCheck` with the
      matching `acctest.OptionalEnvVar`, so the failure message says what is
      missing.
- [ ] Dependencies are created by the test's own config, and every step's config
      keeps the dependencies the resource still needs so nothing is destroyed out
      from under it mid-update.
- [ ] `CheckDestroy` distinguishes not-found from other errors by error type, not
      by matching message text.
- [ ] `ImportStateVerifyIgnore` entries each have a real justification: a value
      that legitimately changes, or one the API does not return. Entries hiding a
      `Read` gap are removed and `Read` is fixed.

## Red flags

Each of these usually means the test is encoding a bug rather than catching it.

| Symptom | Likely cause |
|---|---|
| `knownvalue.StringExact("")` on an optional attribute | flex usage missing in `.wrap()`, or a missing validator |
| `ImportStateVerifyIgnore` growing to silence a failure | `Read` does not populate the attribute |
| `ExpectNonEmptyPlan: true` outside a disappears or drift test | a permanent diff being tolerated |
| A `_basic` test with no removal step | the highest-value assertion is missing |
| `NotNull()` where a specific value is knowable | the assertion passes for the wrong reasons |
| `knownvalue.Bool(true)` for a boolean but never `false` | the `omitempty` zero-value bug is untested |
| An acceptance step per validator boundary | unit tests are missing |
| `UseStateForUnknown()` on an attribute the API updates | plan and apply will disagree |
