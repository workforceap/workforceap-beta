# WAP Practice prototype: Follow a request through the local network

Original, unassigned local demo. Not a course lesson. Provider lesson ID is none. No course credit.

- Lesson ID: `wap-practice-local-network-v1`
- Content and rubric: `2026-11-10.v1`
- Review status stays `not-reviewed`
- No app routes, packages, database, or network calls

Open `index.html` through a local static server. A `file://` URL is blocked by Chromium.

```bash
python3 -m http.server 56326 --bind 127.0.0.1
node lesson.test.js
```

`lesson.js` holds the fictional cases, answer key, and rubric. `app.js` is the page. The five checks are path, roles, diagnosis, safety, and verification, each 0, 1, or 2. Writing is stored for a person and is not graded.

Case A is a client DNS mismatch. Case B is a changed gateway and does not accept the Case A answer. Saved attempts stay on this device only. If storage fails or is unreadable, the page keeps the current tab's work and says it was not saved.

Branch base for this worktree is `f423e80dc` (May), not current master `0dfc171a4`. This folder does not import that older app.

Not done here: screen-reader walkthrough, instructional review, assignment, and publication.
