# React Change Log — Web → Mobile Sync

This folder tracks changes made to the **web version** (React/Vite) of CTrend so that equivalent changes can be ported to the **mobile version** (React Native) later.

## How to use

Each time a meaningful change is made to the web version, create a new markdown file here:

```
react_change/
  YYYY-MM-DD_short-description.md
```

## File naming convention

```
2026-05-30_feed-post-card-redesign.md
2026-06-01_auth-google-oauth.md
```

## File template

Copy this structure for each new entry:

```md
# [Feature / Change Name]

**Date:** YYYY-MM-DD
**Web files changed:** list the files

## What changed on web

Short description of what was added, fixed, or refactored.

## Mobile implementation instructions

Step-by-step guidance for replicating this in the React Native codebase:

1. ...
2. ...

## Notes / gotchas

Anything that behaves differently between web and mobile (navigation, styling, APIs, etc.)
```
