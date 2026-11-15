# Packet Quest

Original local WAP Practice prototype. `providerLessonId` is null. It is not reviewed, not course credit, and not connected to production.

Open `index.html` through a local static server. No dependencies, external assets, AI calls, accounts, or student data.

## Play

- Stage 1: tap Client, Switch, Server, then Launch packet.
- Stage 2: repair the glitching DNS, run a DNS lookup, then send a separate page request through Client, Switch, Router, Server.
- Stage 3: repair the wrong gateway. Ping can succeed while the web service is still down; repair Server before the page request.
- Keyboard: Tab to a device and press Enter. Press P to pause. Text mode replaces the map with the same actions.
- Retry restores full lives. Sound defaults off. Progress is validated in localStorage under `packet-quest-v1`.

Run `node --test prototypes/wap-practice-game/rules.test.mjs` from the worktree.
