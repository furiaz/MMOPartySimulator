# AGENTS.md

## Project Overview
This is a browser-based game built with:
- React + Vite (frontend)
- TypeScript (shared logic)
- Future backend: Node.js + Fastify (server-authoritative, not yet implemented)

The game will support autoplay/idle mechanics with optional active player control.

---

## Coding Principles

- Keep code simple and modular
- Avoid overengineering
- Prefer small, focused functions
- Use clear naming (no abbreviations unless standard)
- Separate UI from game logic

---

## File Structure Rules

- UI components stay in React components
- Game logic should be isolated (eventually moved to a separate module/system)
- Do NOT mix rendering logic with simulation logic

---

## Codex Instructions (IMPORTANT)

When making changes:

- Only modify what is requested
- Do NOT rewrite entire files unless explicitly asked
- Prefer minimal diffs over large changes
- Explain changes briefly if not obvious

---

## Development Workflow

- Work in small steps
- One system at a time
- Test frequently in browser
- Keep features isolated before combining systems

---

## Performance & Tokens

- Avoid long explanations
- Avoid repeating known context
- Focus only on the current task
- Do not include unnecessary code

---

## Future Systems (high-level)

- Player system
- Enemy system
- Combat system
- Loot system
- Party system
- Autoplay/AI behavior
- UI systems

(Do NOT implement all at once — build incrementally)