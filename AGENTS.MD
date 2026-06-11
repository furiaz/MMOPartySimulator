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

When describing behavior, bugs, plans, tickets, tests, or code comments:

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
- When browser/manual verification uses the production preview client:
  - Always run the build from `client/` first:
    - `npm run build`
  - Always restart the production preview on port 4173 after rebuilding:
    - `npm run preview -- --host 127.0.0.1 --port 4173`
  - Verify `http://127.0.0.1:4173/` responds before telling the user to test it.
  - Do not rely on an already-running preview server after a rebuild unless it has been confirmed to be serving the fresh `dist/` output.
  - If port 4173 is occupied by an unrelated process, stop and ask before using another port.
- Build systems before UI when possible

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


---
## Documentation Companion Ticket Rule

Whenever a GitHub Issue ticket is created for implementation work, also create one companion documentation ticket for the same topic.

Do not create a companion documentation ticket for documentation-only tickets.

The documentation ticket should cover:

- Updating relevant project documentation after or alongside the implementation
- Any changes needed in GDD.md, GTD.md, README files, comments, or other supporting docs
- Confirming whether no documentation change is needed

The documentation ticket must:

- Reference the implementation ticket
- Use the next available ticket number
- Use the standard ticket title format
- Be added to the GitHub Project board
- Be moved to Design Stage unless the user says otherwise
- Use an appropriate documentation label
The documentation ticket should also inherit all non-completion labels from the implementation ticket.

When copying labels from the implementation ticket to the documentation ticket:

- Copy scope/category labels such as `enhancement`, `feature`, `bug`, `New System`, or similar.
- Also apply the appropriate documentation label.
- Do NOT copy workflow/status labels such as `Completed`.
- If the implementation ticket has no scope/category label, apply only the appropriate documentation label.


Do not edit GDD.md, GTD.md, or AGENTS.md automatically. If those documents need changes, ask the user to make or approve those updates.

## Protected Documentation Edit Approval Rule

Codex must not edit AGENTS.md, GDD.md, or GTD.md unless the user explicitly says one of:

- "Approve editing AGENTS.md"
- "Approve editing GDD.md"
- "Approve editing GTD.md"
- "You may edit [exact protected document name]"

General requests such as "fix the documentation", "update the docs", "do issue X", or "execute the documentation ticket" are not enough approval to edit protected documents.

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

## Ticket Workflow Rules

Before making any code, asset, or documentation changes:

- A GitHub Issue ticket must exist first.
- No implementation work may begin without a ticket.
- Tickets must be created from an implementation plan.
- Brainstorming, design exploration, research, recommendations, and searches do not authorize code changes.
- If the user asks for ideas, designs, plans, recommendations, or searches, do not implement changes unless they explicitly approve a ticket and request implementation.
- If no ticket exists, stop before editing and ask to create one.

Each ticket should include:

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

- Reference the ticket number in the work summary.
- Keep changes scoped to the ticket.
- Do not expand into future systems unless the ticket explicitly includes them.
- Update or close the ticket when the work is complete.
Ticket titles must use the format:

- [Ticket 0001]: Short descriptive title
- [Ticket 0002]: Short descriptive title

Future idea cards may use normal descriptive titles while they are in Dragons Vault or Todo.
When a future idea is promoted into Design Stage or Implementation scope, rename it to the next ticket number before implementation work begins.

For companion documentation tickets, Codex must not apply the `Completed` label unless the user explicitly says the documentation ticket is complete.

When the linked implementation ticket moves to In Progress, the companion documentation ticket should be moved to Design Stage.

Codex may review documentation impact and leave comments on the documentation ticket, including:
- Documentation files that may need updates
- Protected documentation changes that require explicit approval
- Proposed text for the user to apply manually
- Confirmation that no documentation change appears necessary

However, documentation review comments do not complete the documentation ticket.

The documentation companion ticket should only receive the `Completed` label after the user explicitly confirms that documentation was updated manually or that no documentation update is needed.

Acceptable user wording includes:
- "Documentation ticket is complete"
- "Mark the documentation ticket completed"
- "Docs are updated, complete the documentation ticket"
- "No docs needed, complete the documentation ticket"

If the user has not explicitly approved completion, leave the documentation ticket in Design Stage or the user-requested project status, and do not apply `Completed`.


## Ticket Number Validation Rule

Before any implementation work begins, verify that the active GitHub Issue title starts with the standard ticket format:

- [Ticket 0001]: Short descriptive title

If the active issue does not already have a ticket number:

1. Search all GitHub Issues in this repository for titles matching `[Ticket 000N]:`.
2. Extract all existing ticket numbers.
3. Find the highest existing ticket number.
4. Assign the active issue the next available number:
   - highest existing number + 1
5. Rename the active issue to:
   - `[Ticket 000N]: Short descriptive title`
6. Before renaming, search again and confirm no other issue already uses that ticket number.
7. If a duplicate ticket number is found, do not proceed until the duplicate is resolved.

Ticket numbers must be unique across all GitHub Issues, regardless of whether the issue is open or closed.

Do not guess the next ticket number from GitHub issue numbers. GitHub issue numbers and ticket numbers are separate.

## Plan Review Gate

After an initial implementation plan is created, Codex must automatically act as a reviewer before creating the implementation ticket.

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

If the review finds conflicts with GDD.md or GTD.md, Codex must stop and ask for confirmation before creating the ticket.

Only after the Final Reviewed Plan exists may Codex create the implementation ticket and companion documentation ticket.

## Execution Plan Workflow

When the user asks for an execution plan:

- Create a clear initial implementation plan first.
- Before creating any GitHub Issue ticket, run the Plan Review Gate.
- Revise the implementation plan based on the Plan Review Gate findings.
- Create the GitHub Issue ticket from the reviewed implementation plan.
- Use the next available ticket number in this title format:
  - [Ticket 0001]: Short descriptive title
- Also create the required companion documentation ticket.
- Link the documentation ticket to the implementation ticket.
- Add both issues to the GitHub Project board.
- Move both issues to Design Stage unless the user says otherwise.
- Apply an appropriate non-documentation label to the implementation ticket based on scope, such as feature, bug, enhancement, or New System.
- Apply an appropriate documentation label to the companion documentation ticket.

When the user later asks to execute an approved ticket or plan:

- Move the GitHub Project item to In Progress before implementation begins.
- Keep implementation scoped to the ticket.
- Reference the ticket number in the work summary.
- Run the verification plan from the ticket.
- After implementation and verification are complete, move the GitHub Project item to Manual Review.
- After implementation and verification are complete, apply the `Completed` label to the GitHub Issue.
- This Manual Review step applies to the implementation ticket only. It does not apply to the companion documentation ticket unless the user explicitly requests that move.
- After implementation and verification are complete, Codex may comment on the companion documentation ticket with documentation impact notes, but must not move the documentation ticket to Manual Review or apply `Completed` unless the user explicitly requests it.
- Completion notes should list the main files changed, verification performed, and confirm the `Completed` label was applied to the GitHub Issue.
- Do not move the ticket to Done unless the user explicitly approves completion after review.
- Before implementation, verify the active issue title already starts with [Ticket 000N]:.
- If it does not, automatically promote/rename the issue using the Ticket Number Validation Rule before editing code.


## Rollback / Traceability Rules

For each implementation ticket:

- Keep changes scoped so the ticket can be reviewed or reverted independently.
- Mention the ticket number in the commit message when committing related work.
- Avoid mixing unrelated tickets in the same commit.
- If multiple tickets are implemented together, explain why in the ticket and commit message.
- Completion notes should list the main files changed and any verification performed.
- If rollback is needed, prefer reverting the commit associated with the ticket instead of manually undoing unrelated code.

## Explicit Quick Fix Exception

Codex may skip GitHub Issue ticket creation only when the user explicitly labels the request as a quick fix and explicitly says to ignore or skip issue creation.

Acceptable user wording includes phrases like:

- "Quick fix: rename typo from X to Y, ignore issue creation"
- "Small fix, skip ticket"
- "No issue needed, just fix this typo"
- "Quick fix only, do not create a ticket"

If the user says something broad such as "let's do this", "go ahead", "implement this", or "fix this" without explicitly saying to skip issue/ticket creation, Codex must follow the normal ticket workflow before making changes.

Quick fixes must remain narrowly scoped and low-risk. They may include typos, obvious naming mistakes, formatting, comments, lint-only fixes, or minor UI text corrections.

Quick fixes must not include gameplay behavior changes, design decisions, balance changes, architecture changes, map/content changes, protected documentation edits, persistence/backend changes, or anything requiring GDD/GTD alignment.

If a requested quick fix appears to involve design or behavior, Codex must stop and ask whether to create a normal implementation ticket instead.
