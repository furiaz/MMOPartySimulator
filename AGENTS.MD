# AGENTS.md

## Project Overview
This is a browser-based game built with:
- React + Vite (frontend)
- TypeScript (shared logic)
- Future backend: Node.js + Fastify (server-authoritative, not yet implemented)

The game is primarily idle/AFK, with optional active player control.

For game design, refer to GDD.md  
For technical architecture, refer to GTD.md

---

## Coding Principles

- Keep code simple and modular
- Avoid overengineering
- Prefer small, focused functions
- Use clear naming (no unnecessary abbreviations)
- Separate UI from game logic at all times

---

## File Structure Rules

- UI must stay inside React components
- Game logic must stay inside src/game/
- Do NOT mix rendering logic with simulation logic

---

## File and Asset Organization Rules

### Project File Placement

- Put new files in the existing folder that owns the same responsibility.
- Reuse the nearest established structure before creating a new folder.
- Keep React UI and UI-only rendering code under `client/src/` and keep simulation rules, state changes, and game systems under `client/src/game/`.
- Keep renderer-specific code with the existing renderer files and keep reusable game logic independent from React, PixiJS, and asset dimensions.
- Keep repository tooling, tests, configuration, and documentation with the existing files of the same type.
- Do not create generic dumping folders such as `misc`, `temp`, `new`, `final`, or issue-number folders.
- Do not duplicate a file into multiple project folders to avoid choosing an owner.
- Generated output, review sheets, source art, alternates, rejected variants, and retired files must not remain in the runtime project unless they are directly required to build, test, or run the game.

### Runtime Assets

- `client/public/assets/` contains only assets required by the current game at build time or runtime.
- Place runtime assets in the nearest existing semantic folder for their owner and purpose. Create a new semantic folder only when no current folder fits.
- New asset directory names must use lowercase kebab-case. Do not mass-rename legacy paths without a dedicated GitHub Issue.
- Do not create issue-number folders under `client/public/assets/`.
- Asset references must match Git-tracked path casing exactly and must follow the project's base-path-aware URL convention rather than assuming deployment at a domain root.
- A case-only rename on a case-insensitive filesystem is not complete until Git records the old path removal and the new path addition.

### External Asset Library

- The full asset Library lives outside this repository at the portable sibling path `../AssetList/Library`.
- The Library is a source, reference, mirror, and archive location. It must never be required to build, test, preview, deploy, or run the game.
- Every asset in `client/public/` must have an exact-copy mirror at `../AssetList/Library/Used assets/MMOPartySimulator/client/public/` using the same project-relative path and filename.
- Maintain `../AssetList/Library/Used assets/MMOPartySimulator/used-assets-manifest.csv` with the project path, Library path, byte size, SHA-256 hash, and category for every mirrored runtime asset.
- Raw source files, alternates, rejected variants, retired assets, unused assets, review sheets, and historical generation inputs belong in the appropriate Library collection, not in the runtime project.
- Preserve existing top-level Library source and reference collections. Do not reorganize or rename them automatically.

### Asset Lifecycle

- When adding a runtime asset: place it in the correct project folder, add its exact mirror, update the used-assets manifest, add or update the code reference, and verify the served asset.
- When replacing or removing a runtime asset: audit references first, archive a Git-tracked outgoing file under `../AssetList/Library/Unused assets/MMOPartySimulator/tracked/` using its original project-relative path, and update `../AssetList/Library/Unused assets/MMOPartySimulator/archive-manifest.csv` with its source kind, original path, archive path, byte size, SHA-256 hash, and reason.
- Use the existing `local-only/` archive subtree only for outgoing files that were never Git-tracked.
- Verify an archived copy by size and SHA-256 before deleting the project source. If the archive destination already exists with a different hash, stop and report the conflict.
- Remove retired files from the Used assets mirror and regenerate or update both affected manifests.
- For bulk moves or renames, keep a migration manifest with old path, new path, size, and hash so every move is auditable.
- Verify project-to-Used-mirror path parity, byte sizes, hashes, exact path casing, stale code references, the client build, a fresh production preview, and representative HTTP asset responses. For bulk asset changes, verify all affected served asset URLs.

---

## Codex Instructions (IMPORTANT)

Before making any changes:

- ALWAYS read:
  - AGENTS.md (this file)
  - GDD.md (game design rules)
  - GTD.md (technical architecture rules)

These documents define expected behavior and must be respected.
You are not to edit those documents. Ask the user to do it.

---

When making changes:

- Only modify what is requested
- Do NOT rewrite entire files unless explicitly asked
- Prefer minimal diffs over large changes
- Do NOT change project structure without being asked
- Do NOT assume missing systems - ask or keep it minimal


---

Behavior Alignment Rules:

- Game behavior must match GDD.md
- System implementation must match GTD.md
- If code conflicts with GDD/GTD:
  - prefer aligning code to those documents
  - do NOT invent new behavior without instruction


---

## Terminology Rules

Use precise party behavior terminology:

- `Gatherer` means the assigned Gatherer role only.
- `gathering` means the current action/state of collecting a resource.
- `collector` means any companion currently gathering or assigned to gather a resource whose role is not Gatherer.

When describing behavior, bugs, plans, issues, tests, or code comments:

- Do not call a non-Gatherer-role companion a Gatherer just because they are gathering.
- Say `collector` for non-Gatherer-role companions gathering resources.
- Say `Gatherer-role companion` or `Gatherer` only when referring to the actual Gatherer role.
- If role and current task both matter, state both clearly, such as `Defender collector`, `Fighter collector`, or `Gatherer-role companion gathering`.

`collector` is terminology only. It is not a new role value and must not be implemented as a role unless explicitly requested.

---

Debugging / Fixing:

- Prefer small, targeted fixes over system rewrites
- Identify root cause before modifying code
- Do NOT introduce large refactors unless explicitly requested

---

## Development Workflow

- Work in small steps
- One system at a time
- Test frequently
- After any client code change, before telling the user the change is ready:
  - Run the build from `client/`:
    - `npm run build`
  - Restart the production preview on port 4173:
    - `npm run preview -- --host 127.0.0.1 --port 4173`
  - Verify `http://127.0.0.1:4173/` responds.
  - Do not rely on an already-running preview server after a rebuild. It must be restarted or explicitly confirmed to be serving the fresh `dist/` output.
  - If port 4173 is occupied by an unrelated process, stop and ask before using another port.
  - The final response must say whether the build passed, whether the preview was restarted, and whether the local URL responded.
- Build systems before UI when possible

---

## Branch and Release Workflow

### Permanent Branches

- This repository has exactly two permanent branches:
  - `main` is the integration branch for reviewed development work and the base for normal issue branches.
  - `live` is the production branch and must represent the exact version intended to be publicly playable.
- Only `live` may trigger the production GitHub Pages deployment.
- Work on `main` or any temporary branch must not change the public game until an approved release is merged into `live`.
- Do not implement issue changes directly on `main` or `live`.
- Protect `main` and `live` from force pushes and deletion. Require their configured checks and pull-request workflow when repository settings support it.
- A second-account approval must not be required while the repository has only one active maintainer. Manual review and explicit user authorization are still required.

### Issue Branches

- Create a temporary branch for each approved leaf implementation issue.
- Start normal issue branches from the latest `main`.
- Codex-created branches must use `codex/issue-<issue-number>-short-description`, using the GitHub Issue number.
- Keep each branch scoped to its issue so it can be reviewed and reverted independently.
- Merge a completed issue branch into `main` through a pull request only after issue verification, Manual Review, and explicit user authorization for the pull request and merge.
- Delete temporary branches only after their work is safely integrated and the user explicitly authorizes deletion.

### Releases

- Promote a release with a pull request from `main` into `live`.
- A release must pass the configured build and deployment checks and receive explicit user authorization before merge.
- Deploy the public site from the merged `live` commit only. Do not deploy pull-request heads, issue branches, or `main` to the production GitHub Pages site.
- Record the deployed commit in the release summary so the public version is traceable.
- Roll back production by reverting the responsible release commit or promoting a known-good commit through the reviewed release workflow. Do not rewrite `live` history.

### Production Hotfixes

- Create an approved hotfix branch from `live` only when the public build needs an urgent isolated fix.
- Merge the verified hotfix into `live` through the protected release workflow.
- Immediately forward-port the same hotfix into `main` through a separate pull request so the permanent branches do not diverge.

This workflow does not grant Git authorization. The Explicit Git Authorization Required rules below still apply to every commit, push, pull request, and merge.

---

## Performance & Tokens

- Avoid long explanations
- Avoid repeating known context
- Focus only on the current task
- Do not include unnecessary code

---

## World Structure

- The final world is divided into large zones/fields
- Zones are connected via teleport points
- Each zone is a separate map space
- Entities will eventually include a zoneId in addition to position (x, y)
- Prototype/debug map transitions may exist only when documented in GDD.md and GTD.md
- Do not implement the final zone system, persistent zone state, or a full teleport network unless explicitly requested


## Map Creation Rules

- Rooms must be large enough for party members and enemies to move without clogging
- Every room must be reachable from every other room
- Connect rooms with open passages, not doors
- Do not place passages close to map edges
- Do not place entities inside walls or directly against walls

### Conflict Resolution Rule

- If prompt instructions conflict with GDD.md or GTD.md:
  - STOP
  - Explain the conflict clearly
  - Ask for confirmation before proceeding
- Do NOT guess or silently override behavior


Do not edit GDD.md, GTD.md, or AGENTS.md automatically. If those documents need changes, ask the user to make or approve those updates.

## Protected Documentation Edit Approval Rule

Codex must not edit AGENTS.md, GDD.md, or GTD.md unless the user explicitly says one of:

- "Approve editing AGENTS.md"
- "Approve editing GDD.md"
- "Approve editing GTD.md"
- "You may edit [exact protected document name]"

General requests such as "fix the documentation", "update the docs", or "do issue X" are not enough approval to edit protected documents.

If protected documentation appears to need updates, Codex must:
1. Identify the needed documentation change.
2. Ask for explicit approval naming the exact protected document.
3. Wait for approval before editing.
4. If approval is not given, provide proposed text for the user to apply manually.

## Documentation Patch Format Rule

When the user asks for a documentation update, documentation change, wording change, or proposed edit to any document, Codex must default to a paste-ready patch format unless the user explicitly asks Codex to edit the file directly.

For documentation update instructions, Codex must show:

- Exactly what text to remove, in a fenced text block
- Exactly what text to paste, in a fenced text block
- Where to place the pasted text
- Any optional follow-up replacement as a separate remove/paste pair

The fenced blocks must be safe for copying:

- Use fenced code blocks labeled `text`
- Use fences long enough that nested code, scripts, Markdown, or backticks inside the content cannot break the block
- Do not place assistant commentary inside the remove or paste blocks
- Do not let instructions leak into the document content
- Keep explanatory notes outside the fenced blocks

If no existing text should be removed, Codex must say where to insert the new text and provide only the paste block.

This rule does not override protected documentation approval rules. Codex still must not directly edit AGENTS.md, GDD.md, or GTD.md without explicit approval naming the exact protected document.
---

## Issue Workflow Rules

Before making any code, asset, or documentation changes:

- A GitHub Issue must exist first.
- No implementation work may begin without an issue.
- Implementation issues must be created from an implementation plan.
- Brainstorming, design exploration, research, recommendations, and searches do not authorize code changes.
- If the user asks for ideas, designs, plans, recommendations, or searches, do not implement changes unless they explicitly approve an issue and request implementation.
- If no issue exists, stop before editing and ask to create one.

Each implementation issue should include:

- What will happen
- What will change
- Objectives
- Goals
- Success criteria
- GDD/GTD alignment
- Out of scope
- Implementation notes
- Verification plan

When implementation begins:

- Reference the GitHub Issue number in the work summary, such as `Issue #641`.
- Keep changes scoped to the issue.
- Do not expand into future systems unless the issue explicitly includes them.
- Update or close the issue when the work is complete.

Issue titles should be short, descriptive, and must not repeat the GitHub Issue number.

Future idea issues may use normal descriptive titles while they are in Dragons Vault or Todo. Promotion into Design Stage or implementation scope does not require a title prefix or a second identifier.

## GitHub Issue Identification Rule

- The GitHub Issue number assigned by GitHub is the only canonical work identifier.
- Refer to work as `Issue #<number>` in plans, summaries, branches, commits, pull requests, and related documentation.
- Do not create, assign, validate, or maintain a separate work-number sequence.
- Before implementation, verify the target GitHub Issue number and URL.
- Existing historical titles, branches, commits, and references do not need retroactive renaming.

## Issue Hierarchy / Epic Workflow Rules

Large systems should be organized as an issue hierarchy instead of one giant implementation issue.

Issue hierarchy terms:

- Parent epic: a tracking/planning issue for a whole feature set.
- Child epic: a tracking/planning issue for one major area of the parent feature.
- Leaf implementation issue: an executable issue with a narrow implementation scope.
- Future placeholder issue: a staged future idea that should not be implemented until dependencies are complete and the user approves execution.

Parent epics and child epics:

- Must not be executed directly unless the user explicitly asks to update planning/status only.
- Must include `Parent` and/or `Children` sections where applicable.
- Should summarize scope, goals, child issues, dependencies, and out-of-scope items.
- Should stay on the project board while child work is active.
- Should not receive a documentation companion issue unless they directly require documentation work.

Leaf implementation issues:

- Must include `Parent` when part of an epic hierarchy.
- Must include `Depends On` when another issue must be completed first.
- Must include specific implementation scope, out-of-scope items, and verification plan.
- Must be independently reviewable and reversible.
- Are the only issue type Codex should execute by default.

Before executing an issue in an issue hierarchy:

- Verify the target issue is a leaf implementation issue.
- Check all `Depends On` issues.
- Stop and report blocked dependencies if required prerequisite issues are not complete or explicitly approved to proceed.
- Keep changes scoped to the leaf issue even if the parent epic describes broader behavior.

For large feature requests:

- If the request touches multiple systems, Codex must propose a parent/child issue tree before creating implementation issues.
- Shared foundation work should be split from feature-specific work.
- MVP issues should be separated from upgrade, cleanup, expansion, and future-depth issues.
- Future placeholder issues should remain in Todo or Dragons Vault until promoted.

## Plan Review Gate

After an initial implementation plan is created, Codex must automatically act as a reviewer before creating the implementation issue.

The review must inspect the plan for:

- Predicted runtime behavior
- Likely bugs, edge cases, or missing states
- Conflicts with GDD.md, GTD.md, or AGENTS.md
- Scope creep beyond the requested change
- UI/game logic separation problems
- Overengineering or unnecessary abstractions
- Simpler and cleaner implementation structure
- Future compatibility with documented systems without implementing future systems early
- Focused verification needed to prove the change works

The review must prefer:

- Small, direct implementation steps
- Clear ownership boundaries
- Existing project patterns
- Minimal diffs
- Future-friendly structure only when it makes the current code clearer

The review must not:

- Add new behavior not requested by the user
- Expand the implementation into future systems
- Rewrite architecture unnecessarily
- Treat "future proof" as permission to overengineer
- Override GDD.md or GTD.md

The Plan Review Gate output must include:

- Predicted Behavior
- Risks / Flaws
- Cleaner Structure
- Required Plan Changes
- Final Reviewed Plan

If the review finds conflicts with GDD.md or GTD.md, Codex must stop and ask for confirmation before creating the issue.

Only after the Final Reviewed Plan exists may Codex create the implementation issue.

## Execution Plan Workflow

When the user asks for an execution plan:

- Create a clear initial implementation plan first.
- Before creating any implementation issue, run the Plan Review Gate.
- Revise the implementation plan based on the Plan Review Gate findings.
- For small scoped work, create one leaf implementation issue from the reviewed implementation plan.
- For large multi-system work, create a parent epic, child epics when useful, and focused leaf implementation issues from the reviewed implementation plan.
- Add the implementation issue to the GitHub Project board.
- Move the implementation issue to Design Stage unless the user says otherwise.
- Apply an appropriate non-documentation label to the implementation issue based on scope, such as feature, bug, enhancement, or New System.

When the user later asks to execute an approved issue or plan:

- Move the GitHub Project item to In Progress before implementation begins.
- Keep implementation scoped to the issue.
- Reference the GitHub Issue number in the work summary.
- Run the verification plan from the issue.
- After implementation and verification are complete, move the GitHub Project item to Manual Review.
- After implementation and verification are complete, apply the `Completed` label to the GitHub Issue.
- Completion notes should list the main files changed, verification performed, and confirm the `Completed` label was applied to the GitHub Issue.
- Do not move the issue to Done unless the user explicitly approves completion after review.
- Before implementation, verify the active GitHub Issue number and URL.
- If the active issue is a parent epic or child epic, do not implement code from it directly. Ask which leaf implementation issue should be executed, or summarize the next unblocked leaf issues.
- If the active issue has a `Depends On` section, verify those dependencies before moving the issue to In Progress.


## Rollback / Traceability Rules

For each implementation issue:

- Keep changes scoped so the issue can be reviewed or reverted independently.
- Mention the GitHub Issue number in the commit message only when the user has explicitly authorized a commit.
- Avoid mixing unrelated issues in the same commit.
- If multiple issues are implemented together, explain why in the issues and commit message.
- Completion notes should list the main files changed and any verification performed.
- If rollback is needed, prefer reverting the commit associated with the issue instead of manually undoing unrelated code.

## Explicit Git Authorization Required

Codex must never commit, merge, push, or create a pull request without explicit user authorization for that exact git action.

Implementation approval is not git authorization.

The following kinds of user messages authorize implementation only, not commits, merges, pushes, or pull requests:

- "let's do this"
- "lets do this"
- "go ahead"
- "implement this"
- "PLEASE IMPLEMENT THIS PLAN"
- "fix this"
- "looks good"
- "ok"

Acceptable git authorization must explicitly name the requested git action, such as:

- "commit this"
- "commit these changes"
- "push this branch"
- "create a PR"
- "merge this PR"
- "commit and open a PR"

If the user has not explicitly authorized the specific git action:

- Do not stage files.
- Do not commit.
- Do not push.
- Do not create a pull request.
- Do not merge.
- Leave completed implementation changes in the working tree for user review.
- Report verification results and the current working-tree status instead.

When Codex handles git workflow:

- Review `git status` before staging.
- Stage only files that belong to the active issue.
- Do not stage, commit, revert, or discard unrelated user changes.
- Use commit messages that reference the active GitHub Issue number.
- Push the branch and create a pull request when the user has asked Codex to handle the full git workflow for that task.
- Keep GitHub Issue and Project status updates aligned with the issue workflow rules.
- Always tell the user when commits, merges, or pull requests are created or performed.
- For every commit, merge, or pull request, report the exact summary/title used and the description/body used. If there was no description/body, say that explicitly.

Explicit git authorization does not bypass issue creation, protected documentation approval, verification, review, rollback, or conflict-resolution rules.

## Explicit Quick Fix Exception

Codex may skip GitHub Issue creation only when the user explicitly labels the request as a quick fix and explicitly says to ignore or skip issue creation.

Acceptable user wording includes phrases like:

- "Quick fix: rename typo from X to Y, ignore issue creation"
- "Small fix, skip issue"
- "No issue needed, just fix this typo"
- "Quick fix only, do not create an issue"

If the user says something broad such as "let's do this", "go ahead", "implement this", or "fix this" without explicitly saying to skip issue creation, Codex must follow the normal issue workflow before making changes.

Quick fixes must remain narrowly scoped and low-risk. They may include typos, obvious naming mistakes, formatting, comments, lint-only fixes, or minor UI text corrections.

Quick fixes must not include gameplay behavior changes, design decisions, balance changes, architecture changes, map/content changes, protected documentation edits, persistence/backend changes, or anything requiring GDD/GTD alignment.

If a requested quick fix appears to involve design or behavior, Codex must stop and ask whether to create a normal implementation issue instead.
