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

Debugging / Fixing:

- Prefer small, targeted fixes over system rewrites
- Identify root cause before modifying code
- Do NOT introduce large refactors unless explicitly requested

---

## Development Workflow

- Work in small steps
- One system at a time
- Test frequently
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

## Execution Plan Workflow

When the user asks for an execution plan:

- Create a clear implementation plan first.
- After the plan is created, automatically create a GitHub Issue ticket from that plan.
- Use the next available ticket number in this title format:
  - [Ticket 0001]: Short descriptive title
- Add the issue to the GitHub Project board.
- Move the issue to Design Stage.
- Apply an appropriate label based on scope, such as feature, bug, documentation, enhancement, or New System.

When the user later asks to execute an approved ticket or plan:

- Move the GitHub Project item to In Progress before implementation begins.
- Keep implementation scoped to the ticket.
- Reference the ticket number in the work summary.
- Run the verification plan from the ticket.
- After implementation and verification are complete, move the GitHub Project item to Manual Review.
- Do not move the ticket to Done unless the user explicitly approves completion after review.



## Rollback / Traceability Rules

For each implementation ticket:

- Keep changes scoped so the ticket can be reviewed or reverted independently.
- Mention the ticket number in the commit message when committing related work.
- Avoid mixing unrelated tickets in the same commit.
- If multiple tickets are implemented together, explain why in the ticket and commit message.
- Completion notes should list the main files changed and any verification performed.
- If rollback is needed, prefer reverting the commit associated with the ticket instead of manually undoing unrelated code.
