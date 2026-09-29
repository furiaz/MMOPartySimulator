# MMO Party Simulator

**A party based idle exploration RPG about guiding a growing expedition through a dangerous new land.**

[Play the current public build](https://furiaz.github.io/MMOPartySimulator/)  
[View development issues](https://github.com/furiaz/MMOPartySimulator/issues)

> MMO Party Simulator is an early playable prototype under active development.

## About the Game

MMO Party Simulator puts you in charge of an adventuring party rather than a single hero.

Party members move through the world, fight enemies, gather resources, complete quests, recover from danger, and grow stronger. The player guides the expedition by assigning roles, choosing classes, managing equipment, setting priorities, and giving direct commands when intervention is needed.

The game is designed for low input play while still giving the player meaningful control over party decisions.

## Core Experience

* Build and manage a party of companions
* Assign Defender, Fighter, Support, and Gatherer roles
* Choose a leader who guides party movement and intent
* Explore maps, follow objectives, and travel between areas
* Fight enemies through readable autonomous party behavior
* Gather resources and manage a shared inventory
* Complete quests and earn experience, items, and Crowns
* Develop companions through levels, classes, skills, and equipment
* Give direct commands when the party needs help
* Save progress locally and gain supported offline progress

Roles define companion priorities rather than strict limitations. A companion can still react to danger or help with another task when the situation requires it.

## Current Prototype Features

The current prototype includes:

* Autonomous party movement and formation behavior
* Combat, healing, protection, and gathering systems
* Party roles, party order, and leader selection
* Companion levels, stats, classes, skills, and equipment
* Quests, points of interest, and guided travel
* Shared inventory, wallet, key items, and bank storage
* Merchant and Smith interactions
* Guild, Inn, Farm, and Livestock systems
* Resource collection and enemy item drops
* Local browser saves with import and export support
* Offline progress for supported activities
* A rendered world built with PixiJS
* Development tools for testing game systems

Many systems are still prototypes. Content, balance, presentation, and save compatibility may change during development.

## How to Play

1. Open the public build.
2. Start a new file or continue a local save.
3. Assign roles to define how each companion should behave.
4. The party will follow the leader.
5. Choose objectives, quests, or travel destinations.
6. Let the party act on its current priorities.
7. Use direct commands when you want immediate control.
8. Improve the party through levels, classes, skills, equipment, and new companions.

Direct commands take priority over normal autonomous behavior.

## Running the Project Locally

### Requirements

* Node.js 24
* npm

### Setup

```bash
git clone https://github.com/furiaz/MMOPartySimulator.git
cd MMOPartySimulator/client
npm ci
npm run dev
```

Open the local address shown by Vite.

### Useful Commands

Run the automated tests:

```bash
npm test
```

Create a production build:

```bash
npm run build
```

Run the code quality checks:

```bash
npm run lint
```

Preview the production build:

```bash
npm run preview
```

## Technology

* React
* TypeScript
* Vite
* PixiJS
* Vitest

A future server authoritative backend is planned with Node.js and Fastify. The current prototype runs in the browser.

## Project Documentation

Detailed design and technical rules are maintained separately:

* [Game Design Document](GDD.MD)
* [Game Technical Document](GTD.MD)
* [Contributor and Agent Instructions](AGENTS.MD)

## Development Workflow

Development is organized through focused GitHub Issues and temporary ticket branches.

Before contributing:

1. Review the existing issues.
2. Discuss or create a focused implementation ticket.
3. Read the project documentation.
4. Keep interface code separate from game simulation logic.
5. Keep changes small, testable, and limited to the approved scope.

## Feedback

Bug reports and focused suggestions are welcome through [GitHub Issues](https://github.com/furiaz/MMOPartySimulator/issues).

When reporting a problem, include what happened, what you expected, and any steps that reproduce it.

## License

No open source license is currently included. Please do not reuse the code or game assets without permission.