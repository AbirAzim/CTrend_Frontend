# Skills Reference

Skills are slash commands that give Claude a structured playbook to follow.
Type them directly in the Claude Code prompt.

---

## `/debug-issue` — Trace a bug systematically

**File:** `~/.claude/skills/debug-issue.md` (global)

Uses the knowledge graph to trace call chains, execution flows, and recent
changes instead of manually reading files.

**When to use:**
- Something is broken and you don't know where to look
- An error message doesn't point to an obvious file
- A feature stopped working after a recent change

**How to invoke:**

```
/debug-issue <describe the symptom>
```

**Examples:**

```
/debug-issue votes are not persisting after the page reloads

/debug-issue FeedPostCard throws "Cannot read properties of undefined" on mount

/debug-issue the POST_VOTE_UPDATED subscription stops receiving events after ~30 seconds
```

**What Claude will do:**
1. Search the graph for code related to your symptom
2. Trace callers and callees around the suspected area
3. Check recent git changes that may have caused the regression
4. Show the impact radius of the suspected file
5. Pinpoint the root cause with a fix suggestion

---

## `/explore-codebase` — Map unfamiliar code before touching it

**File:** `~/.claude/skills/explore-codebase.md` (global)

Gives you an architecture overview, community map, and execution flows without
opening a single file manually.

**When to use:**
- Starting work in a part of the codebase you haven't touched before
- Wanting to understand how two systems connect (e.g. auth → Apollo → feed)
- Planning a new feature and needing to know what already exists

**How to invoke:**

```
/explore-codebase <what you want to understand>
```

**Examples:**

```
/explore-codebase how does authentication flow from login to Apollo headers

/explore-codebase what handles the feed scroll and refresh logic

/explore-codebase where does a vote go from the UI click to the GraphQL mutation
```

**What Claude will do:**
1. Pull graph stats and architecture overview
2. Identify relevant communities (auth, feed, components, etc.)
3. Trace the execution path end-to-end using flows
4. Show you exactly which files and functions are involved
5. Give a readable summary — no raw file dumps

---

## `/review-changes` — Risk-scored review of your current diff

**File:** `~/.claude/skills/review-changes.md` (global)

Runs a structured code review on everything in your current git diff —
grouped by risk level, with test coverage gaps and a merge recommendation.

**When to use:**
- Before committing a significant change
- Before opening a pull request
- After a big refactor to catch anything missed

**How to invoke:**

```
/review-changes
```

No arguments needed. Claude picks up the current git diff automatically.

**Output format:**
- **High risk** — changes with wide blast radius or no test coverage
- **Medium risk** — changes that affect shared utilities or types
- **Low risk** — isolated, well-scoped changes
- **Merge recommendation** — go / go with caveats / hold

**Example output structure:**

```
HIGH RISK
- src/lib/apolloClient.ts: auth header injection changed — affects every query
  Tests: none found. Suggest: manual verify login + protected route flow.

MEDIUM RISK
- src/components/FeedPostCard.tsx: optimistic vote logic updated
  Tests: none. Suggest: test both UP/DOWN paths and subscription reconciliation.

LOW RISK
- src/lib/formatRelativeTime.ts: edge case for <1 min added
  Self-contained utility — low blast radius.

RECOMMENDATION: Go with caveats — manually verify auth and voting before merging.
```

---

## `/refactor-safely` — Rename, clean up, or restructure without breaking things

**File:** `~/.claude/skills/refactor-safely.md` (global)

Uses the graph to preview all locations affected by a rename or deletion,
find dead code, and apply changes safely.

**When to use:**
- Renaming a function, type, or file that is used in many places
- Cleaning up unused exports or dead code before a release
- Decomposing a large function into smaller ones

**How to invoke:**

```
/refactor-safely <describe what you want to change>
```

**Examples:**

```
/refactor-safely rename mapGqlPostToFeedView to mapPostToView

/refactor-safely find all dead code in src/lib and remove it

/refactor-safely split the FeedPostCard component — it's doing too much

/refactor-safely rename FeedPostView type to PostViewModel across the codebase
```

**What Claude will do:**
1. Suggest refactoring candidates from the graph
2. Preview every file and line that would be affected (no surprises)
3. Check the impact radius before touching anything
4. Apply the rename/delete only after you confirm the preview
5. Run `detect_changes` after to verify the result

---

## `/grill-me` — Stress-test a plan before you build it

**File:** `CTrend_frontend/grill-me/SKILL.md` (this project only)

Interviews you relentlessly about a design or plan — one question at a time,
each with a recommended answer — until every decision branch is resolved.

**When to use:**
- You have a feature idea and want to catch blind spots before coding
- You're unsure about a technical design and want structured pushback
- You want to think through tradeoffs before committing to an approach

**How to invoke:**

```
/grill-me <describe your plan or idea>
```

**Examples:**

```
/grill-me I want to add a notifications system to CTrend

/grill-me I want to replace Apollo Client with React Query

/grill-me I'm planning to add a "Trending" feed tab that ranks posts by vote velocity

/grill-me I want to add end-to-end tests using Playwright
```

**What Claude will do:**
1. Ask you one focused question at a time about your plan
2. Provide its own recommended answer for each question
3. Walk the full decision tree — data model → API → UI → edge cases
4. Surface dependencies between decisions (e.g. "this choice constrains that one")
5. Continue until every branch is resolved and you have a complete design

---

## `/improve-architecture` — Analyse structure and produce a safe improvement plan

**File:** `~/.claude/skills/improve-architecture.md` (global)

Maps the current architecture using the knowledge graph, identifies coupling
problems, bloated files, and fragile dependencies, then produces a prioritised
plan with an ordered list of safe changes.

**When to use:**
- The codebase feels hard to navigate or extend
- You suspect tight coupling between modules
- A file or component has grown too large
- You want a health check before a major new feature

**How to invoke:**

```
/improve-architecture <area or goal>
```

**Examples:**

```
/improve-architecture the feed and voting logic feels tangled

/improve-architecture I want to make the auth flow easier to swap out

/improve-architecture find the worst coupling problems in src/components

/improve-architecture the whole codebase — give me a full structural health check
```

**What Claude will do:**
1. Pull architecture overview and community map
2. Find large functions, bridge nodes (fragile coupling), and hub nodes (over-depended files)
3. Surface knowledge gaps and structural weaknesses
4. Produce a **Problems → Plan → First Step** output
5. Each planned change comes with effort and risk ratings
6. The first step is always the safest, highest-value change to make right now

---

## Quick Reference

| Skill | Command | When |
|---|---|---|
| Debug a bug | `/debug-issue <symptom>` | Something is broken |
| Understand code | `/explore-codebase <question>` | Before touching unfamiliar code |
| Review a diff | `/review-changes` | Before committing / opening PR |
| Rename or clean up | `/refactor-safely <what to change>` | Structural code changes |
| Stress-test a plan | `/grill-me <your idea>` | Before building something new |
| Improve architecture | `/improve-architecture <area or goal>` | Structural health check + improvement plan |
