# CrowdStrike Repository Overlay

Apply this reference when the repository module is `github.com/crowdstrike/terraform-provider-crowdstrike`.

## Sources of truth

Read `AGENTS.md` and the relevant `CONTRIBUTING.md` sections before modifying tests. For testing work, also read sections governing the code under test: Error Handling, Resource Schema Patterns, Validation, State Consistency, model wrapping, diagnostics, and Early State Updates.

The repository uses:

- Terraform Plugin Framework and the versions pinned in `go.mod`.
- `gofalcon` for every Falcon API call; never add direct HTTP test clients.
- Terraform framework types in provider models.
- `internal/acctest` for shared acceptance-test configuration.
- `internal/testconfig` for the initialized Falcon client.
- `internal/sweep` for sweeper registration and test ownership prefixes.

## Acceptance-test skeleton

Prefer the repository helpers instead of defining local provider factories or credential checks:

```go
func TestAccWidgetResource_lifecycle(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"

    resource.ParallelTest(t, resource.TestCase{
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        PreCheck:                 func() { acctest.PreCheck(t) },
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            // Scenario steps.
        },
    })
}
```

Include `acctest.ProviderConfig` in generated HCL when nearby tests do so. Use `acctest.ConfigCompose` for multiple resources and `acctest.RandomResourceName` or the shared UUID/hash helpers so resources are unique and sweepable.

Do not call `t.Parallel()` around `resource.ParallelTest`.

## Falcon API checks

- Use the initialized client exposed by `internal/testconfig` and generated `gofalcon` service clients/models.
- Match not-found using the same typed/error helpers as the resource implementation. Do not treat any API error as absence.
- Verify request effects through Falcon Read/List APIs when Terraform state might echo configured values.
- Reuse production finders and waiters where possible so tests exercise the real convergence contract.
- Keep credentials and secret values out of errors, logs, state checks, and fixtures.

## Required error-contract coverage

The repository's CRUD methods use `internal/tferrors`. When a changed method has these branches, cover them at the cheapest controllable layer:

| Branch | Expected behavior |
|---|---|
| API error on Create/Update | Error diagnostic with operation and required scopes; 404 remains an error. |
| Read 404 | Not-found warning, resource removed from state, next plan recreates. |
| Delete 404 | Success because the object is already absent. |
| Other Read/Delete error | Diagnostic; never silently remove state or claim deletion. |
| Nil response or payload | `NewEmptyResponseError`; no panic. |
| Payload-level errors | Payload diagnostic before empty-resource handling. |
| Empty expected resources | `NewEmptyResponseError`. |

Acceptance tests normally prove the real not-found and deletion lifecycle. Unit tests or existing fake seams should cover rare nil/payload/error branches that cannot be induced safely against Falcon.

## State consistency and early state

- Exercise optional fields that use `flex`: omitted create, configured value, change, and removal back to null/default. This protects the validator-plus-normalization contract described in `CONTRIBUTING.md`.
- Table-test wrap/expand helpers when they branch on null, unknown, empty collections, or nil API pointers.
- When Create sets an ID before follow-up API operations, test that a later failure still leaves enough state for Terraform to delete the remote object. Prefer a unit/integration seam when the failure cannot be safely induced in acceptance.
- Do not copy configuration into state merely to hide API disagreement; assert the stable API-normalized contract and final empty plan.

## Repository layout and commands

- Put acceptance tests beside the implementation in `internal/<package>/..._test.go`.
- Put reusable test configuration/client helpers in existing shared packages rather than creating duplicates.
- Add sweepers under `internal/sweep` and use its ownership prefix. Sweep only development/test accounts.
- Never edit generated `/docs` as part of testing work.

Run proportionally to the change:

```bash
make test
PKG=<package> make acctest
TESTARGS="-run TestAccSpecificTest" PKG=<package> make acctest
make fmt-check
make lint
```

Acceptance tests require `FALCON_CLIENT_ID`, `FALCON_CLIENT_SECRET`, and optionally `FALCON_CLOUD`. Report when credentials prevented execution; do not weaken assertions to compensate.
