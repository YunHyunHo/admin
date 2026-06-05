<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Token-efficient workflow

When working in this repository, optimize for concise context use without skipping codebase understanding.

### Before coding

- Start by mapping only the relevant surface area with `rg`, `rg --files`, targeted `sed`, and nearby imports.
- Do not read broad files, full directories, or long command output unless the task requires it.
- For large or ambiguous work, first produce a short implementation plan after inspecting the current codebase.
- If the user describes an idea informally, normalize it into concrete steps, identify missing decisions, and then proceed step by step.

### Context compression

- Summarize findings instead of pasting long file contents or command output.
- When command output is long, report only the key failing lines, counts, filenames, stack frames, or status changes.
- Prefer structured summaries:
  - `Scope`: files and features involved.
  - `Finding`: what matters.
  - `Decision`: what will be changed.
  - `Verification`: command run and result.
- Use code-review or graph/context tools such as `code-review-graph`, RTK-style context maps, or similar utilities when available and useful, but keep their output summarized.

### Implementation loop

For non-trivial changes, work in this loop:

1. Inspect the relevant code paths.
2. Confirm the step plan.
3. Implement one focused step.
4. Run the smallest meaningful verification.
5. Summarize the result before moving to the next step.

### Verification

- Prefer focused checks before broad checks.
- If a command prints a lot, summarize the important result instead of including the full output.
- For frontend changes, verify the affected route or component visually when practical.
- If verification cannot be run, state the reason and the remaining risk.

### Editing discipline

- Keep changes scoped to the requested behavior.
- Follow existing project patterns before introducing new abstractions.
- Avoid unrelated refactors, formatting churn, and broad rewrites.
- Preserve user changes already present in the worktree.

## Scenario-based feedback handling

Do not treat user feedback as an isolated screen, field, or one-line bug by default. First identify the business scenario behind the feedback, then trace every place where the same entity is created, read, displayed, filtered, edited, or validated.

When the user reports a symptom such as "a domain account was created but is not visible", interpret it as an end-to-end consistency problem until proven otherwise. Check the creation path, database rows, API queries, UI tables, related settings pages, permissions, and server-side validation that depend on that entity.

### Feedback workflow

For non-trivial feedback:

1. Define the scenario in one sentence.
2. Identify the main entity and its identifiers, such as `domain_id`, `company_id`, `distributor_id`, `admin_id`, or mapping-table IDs.
3. Find the create/update path that writes the entity.
4. Find every read path that should expose it.
5. Compare UI filtering with server-side authorization and validation.
6. List inconsistencies before editing.
7. Fix the connected flow, not just the visible symptom.
8. Verify the scenario through the narrowest useful commands or screens.

### Scenario questions

Before implementing a feedback fix, answer these internally:

- What business scenario does this feedback belong to?
- Where does the scenario start, and what database rows should exist after it completes?
- Which pages, API routes, repository functions, and types read those rows?
- Are there mapping tables or derived rows that must also be created or updated?
- Do `MASTER`, top distributor, distributor, and domain admin roles see the correct scope?
- Does the UI filter use the same criteria as the server?
- Are nullable values, optional fields, and fallback display values handled consistently?
- What is the smallest reliable verification for this scenario?

## Domain scenario checklist

When feedback touches domain creation, domain visibility, domain accounts, distributor hierarchy, domain fees, or linked bank accounts, inspect the connected flow instead of only the named screen.

### Data model to check

- `companies`
- `domains`
- `admins`
- `admin_domain_mappings`
- `distributors`
- `fee_rates`
- `bank_accounts`
- charge request tables
- exchange request tables
- settlement-related tables

### Pages and features to check

- Domain list
- Domain management
- Admin account management
- Fee-rate management
- Bank account management
- Charge management
- Exchange management
- Settlement views

### Expected consistency

- A newly created domain account appears in every relevant domain view.
- A domain without a URL displays `-` wherever URL is shown.
- The domain's distributor and top distributor display according to the hierarchy.
- If a top distributor is selected and it has child distributors, downstream UI should expose or represent those child distributors where the workflow requires it.
- Fee-rate management can view and update the domain's commission settings using the same distributor/company scope.
- Bank-account linking only shows accounts available for that domain's `company_id` / `distributor_id`, plus explicitly global accounts when supported.
- Charge, exchange, and settlement features use the same domain/company/distributor scope as the domain views.
- Client-side filters and server-side validation enforce the same rules.

## Preferred user-prompt interpretation

If the user provides rough notes, requirements, or outside feedback, normalize them into a scenario plan before editing. A request like "this domain is not showing" should be treated as:

- create path correctness
- database relationship correctness
- API visibility correctness
- UI display correctness
- related feature consistency
- permission scope correctness
- verification plan

Keep user-facing summaries short. Do not paste long logs or full files back to the user; report the important finding, changed files, verification result, and remaining risk.
