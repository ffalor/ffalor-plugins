# Pull-request review checklist

## Scope and ownership

- [ ] Repository instructions and relevant resource/data-source implementation were read.
- [ ] The test plan distinguishes Core, Framework, provider, and remote API behavior.
- [ ] Coverage is risk-based rather than a Cartesian product.
- [ ] Every provider branch, mapping path, prior regression, and documented API quirk has representative coverage.

## Lifecycle

- [ ] Minimal create and fully relevant configured create are covered.
- [ ] Read maps every readable field and refresh produces stable state.
- [ ] Mutable fields update and can be cleared/removed.
- [ ] Delete is verified remotely; not-found and eventual consistency are handled where applicable.
- [ ] Import verifies all readable state, with every ignore justified.
- [ ] External drift and disappearance are tested when the API permits safe mutation/deletion.

## Attributes

- [ ] Optional scalars cover omitted, configured, changed, and removed-to-null/default.
- [ ] Required attributes omit inapplicable removal/omitted-success cases and cover configuration/validation errors.
- [ ] Primitive edge cases match domain rules, including zero/false/empty distinctions where relevant.
- [ ] Collections cover omitted, empty, one, many, update, add, remove, clear, and re-omit.
- [ ] Lists cover ordering, sets cover order independence/uniqueness, and maps cover key operations.
- [ ] Null/empty/unknown conversion is tested wherever custom code observes it.
- [ ] Objects/nested collections cover child changes, parent removal, cardinality, identity, and API reordering/canonicalization.

## Schema behavior

- [ ] Computed fields cover create output, refresh/update changes, plan unknown/prior-state behavior, drift, and API disappearance as applicable.
- [ ] Optional+computed fields prove configured-versus-generated precedence and removal behavior.
- [ ] Defaults cover omission, override, and restoration.
- [ ] Sensitive fields are not mistaken for write-only fields.
- [ ] Write-only inputs reach create/update but never readable state; import ignores are explicit.
- [ ] Replacement fields have an explicit replacement plan assertion and applied lifecycle test.
- [ ] Custom plan modifiers cover null, unknown, unchanged, changed, diagnostics, and user-visible effects.
- [ ] Normalization reaches a stable empty plan and behaves on refresh/import.

## Validation and relationships

- [ ] Valid and invalid cases exist.
- [ ] Bounds include min/max and immediately inside/outside values.
- [ ] Custom validators handle null and unknown without premature errors.
- [ ] Conflicts, required-together, exactly-one-of, and at-least-one-of rules have compact truth-table coverage when implemented.
- [ ] Stock Framework behavior is not redundantly exhaustively retested.

## Test quality

- [ ] Pure conversions/validators/modifiers use focused table-driven unit tests.
- [ ] Terraform plan/state/API contracts use acceptance tests.
- [ ] Acceptance tests use unique names, safe cleanup, stable assertions, and no ordering dependency.
- [ ] Tests use current `ProtoV6ProviderFactories`, `TestCase`/`TestStep`, plan checks, and import verification supported by pinned dependencies.
- [ ] No fixed sleeps, brittle generated-value assertions, set index assertions, or unjustified import ignores exist.
- [ ] Test/config helper names expose the scenario and transitions remain readable.
- [ ] Focused unit and acceptance tests, formatting, linting, and broader test suites were run or limitations documented.

## Data sources

- [ ] Lookup inputs, state mapping, nested computed output, sensitive output, and not-found/error diagnostics are covered.
- [ ] Resource-only CRUD, replacement, and import checks were not copied onto a data source.
