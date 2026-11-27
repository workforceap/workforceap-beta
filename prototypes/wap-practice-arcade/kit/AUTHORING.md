# Authoring a WAP Practice Arcade game

This guide is for the agents who write the 20 program games. You write **data only**: one file,
`games/<program-slug>/game.mjs`. The kit (engine, shell, worlds, mechanics) does everything else.

A learner finishes a Coursera course, opens the matching level, and plays a short practice break
(about two minutes) on a phone. Learners are adults, and many are new to tech. Every word you write is read on a small
screen by someone who may be nervous about getting it wrong. Write so they can win by thinking, not by guessing.

Working examples: `games/help-desk-demo/game.mjs` (two `gate` levels) and any of the 20 program games under `games/`.

---

## 1. The workflow

1. Read the curriculum pack: `data/source/<program-slug>.json`. Use `programSlug`, `programTitle` and, for each course,
   `order`, `courseSlug`, `courseTitle`, `skillLabels`, `syllabusDescription` and `scenarioPrompt` as **topic input only**.
   Never paste its quiz text, explanations or scenario wording. Write your own.
2. Make one level per course, in course order (`order` 1..n, matching the pack).
3. Pick a mechanic per level that fits the skill (section 4), respecting the variety rule.
4. Write the file, then run:
   ```
   node tools/validate.mjs <program-slug>
   node tools/smoke.mjs <program-slug>
   ```
   Fix every error. Read the warnings and fix them too unless you have a real reason.
5. Look at the screenshots in `evidence/<program-slug>/` (map, coach, play per level, wrong, results, wide, text mode).
   If anything reads as cramped, confusing or wrong, change the words.

Run everything from the arcade root with Node 24. No installs, no network.

---

## 2. Game definition (frozen schema)

`game.mjs` must import nothing and be importable in plain Node. It is a default-exported object:

```js
export default {
  id: 'it-support-professional-certificate-ibm', // folder name = programSlug in data/source
  title: 'Help Desk Hero',                         // <= 28 chars, the game name
  tagline: 'Quick practice breaks for new IT support techs.', // <= 80
  role: 'You are a new Tier 1 tech at Brightline Help Desk, sorting out what lands in the queue.', // <= 110, one sentence
  program: 'IT Support Professional Certificate (IBM)', // shown small; use programTitle
  theme: {world: 'office', accent: '#ad2c4d', mood: 'day'}, // mood optional: 'day' | 'dusk' | 'night'
  levels: [ /* one per course, see below */ ]
};
```

Every level has these base fields, plus a payload for its mechanic:

```js
{
  id: 'ticket-triage',           // unique in the game, lowercase slug (a-z, 0-9, hyphens), <= 40
  order: 1,                      // 1..n, equals the array position + 1 and the course order
  courseSlug: 'it-support-course-1',
  courseTitle: 'Introduction to Technical Support', // copy exactly from the pack
  title: 'Ticket Triage',        // <= 32
  skill: 'Choosing the right next step for a help desk ticket', // <= 70; shown after "You will practice:"
  mechanic: 'gate',              // 'gate' | 'sort' | 'order' | 'lane' | 'match'
  prop: 'ticket',                // optional; the 3D item that moves (section 5). Must be a listed prop id.
  scene: 'A user at the front desk says their screen went black. You take the call.', // optional, <= 150; one
                                 // sentence that sets the scene, shown on the card before the level starts
  takeaway: 'Define the problem before you fix it. ...', // <= 160, one or two sentences on the results screen
  // ...payload for the mechanic
}
```

`skill` must not start with "You will practice" (the UI adds it). Write it as a gerund phrase: "Choosing...",
"Spotting...", "Putting ... in order".

### Variety rule
- 6 or more levels: at least 3 different mechanics.
- 4 or 5 levels: at least 2 different mechanics.
- 1 to 3 levels: no rule (still prefer variety).

---

## 3. Limits (the validator enforces these)

| Field | Limit |
|---|---|
| game.title / tagline / role | 28 / 80 / 110 chars |
| level.title / skill / takeaway / scene? | 32 / 70 / 160 / 150 chars |
| **gate** | prompt <= 80; actions 2-3 of `{id, label <= 16}`; items 6-8 of `{title <= 40, facts: 1-3 strings <= 52, answer: action id, why <= 150, prop?}`; every action is the answer at least once; no action is the answer for more than 70% of items |
| **sort** | prompt <= 80; bins 3-4 of `{id, label <= 18}`; items 8-10 of `{label <= 34, note? <= 52, answer: bin id, why <= 150, prop?}`; every bin used at least once |
| **order** | rounds 2-3 of `{prompt <= 90, steps: 4-6 strings <= 44 in the CORRECT order, why <= 170}` |
| **lane** | questions 6-8 of `{prompt <= 90, options: exactly 3 strings <= 22, answer: 0-2, why <= 150}`; the correct index must vary |
| **match** | rounds 2-3 of `{prompt <= 90, pairs: 4-5 of [left <= 24, right <= 40], why <= 170}`; lefts unique and rights unique within a round |

Ids (`action.id`, `bin.id`) are short lowercase words, <= 24 chars. Labels must be unique within a level.
Warnings (not errors) flag: unknown fields (typos), a `why` under 25 chars, a `why` that only repeats the answer,
ALL CAPS text, stacked exclamation marks, duplicate titles.

The kit shuffles items, options and pairs for you with a seed. Write them in any order (except `order` steps, which
you list in the correct order).

---

## 4. The five mechanics, with one complete example level each

### gate (label "Decide"): judge each incoming item
Items roll toward a checkpoint one at a time. The player reads the card (title + 1-3 facts) and picks one action.
Best for: triage, approve/deny, allow/block, safe/unsafe, "which kind is this", "what is the next step".
Each item must carry the evidence that decides it. Facts are clues, not decoration.

```js
{
  id: 'hardware-or-software', order: 2,
  courseSlug: 'it-support-course-2', courseTitle: 'Introduction to Hardware and Operating Systems',
  title: 'Hardware or Software?',
  skill: 'Telling hardware faults apart from software problems',
  mechanic: 'gate', prop: 'clipboard',
  takeaway: 'Let the evidence lead. Noise, heat, damage or no power point to hardware. Trouble that starts after an install, update or settings change points to software.',
  prompt: 'Where does the evidence point: hardware or software?',
  actions: [{id: 'hardware', label: 'Hardware'}, {id: 'software', label: 'Software'}],
  items: [
    {title: 'Clicking sound, files will not open', facts: ['Laptop was dropped last week', 'A steady clicking comes from inside', 'Some files give read errors'], answer: 'hardware', why: 'Clicking after a drop is a classic sign of a failing hard drive. Back up what you can and plan a drive replacement.'},
    {title: 'Pop-ups after a free download', facts: ['Browser home page changed by itself', 'Started right after installing a tool', 'Hardware tests pass'], answer: 'software', why: 'Trouble that began right after an install points to that program. Remove it and scan for unwanted software.'},
    {title: 'No lights when power is pressed', facts: ['Outlet works fine for a lamp', 'Charger light stays off'], answer: 'hardware', why: 'No lights at all on a working outlet points to the charger or power parts. Try a known good charger next.'},
    {title: 'One app crashes when it opens', facts: ['Every other app runs fine', 'Crashes began after that app updated'], answer: 'software', why: 'One app failing right after its own update is a software problem. Repair or reinstall that app first.'},
    {title: 'Loud fan, then sudden shutdowns', facts: ['Case is hot to the touch', 'Air vents are packed with dust'], answer: 'hardware', why: 'Heat plus clogged vents means the cooling parts cannot keep up. Clean the vents and check the fan.'},
    {title: 'Clock and menus suddenly wrong', facts: ['Clock is two hours off', 'Started after a settings sync'], answer: 'software', why: 'Time zone and language are operating system settings. Fix them in Settings; nothing physical is broken.'}
  ]
}
```

### sort (label "Sort"): send each item to the right bin
One item at a time; the player picks one of 3-4 bins. Best for: categories (data types, risk levels, document types,
who owns this). Use `note` for one short clue when the label alone is not enough.

```js
{
  id: 'data-types', order: 3,
  courseSlug: 'example-course-3', courseTitle: 'Example Course Three',
  title: 'Sort the Data',
  skill: 'Recognizing common kinds of data in a spreadsheet',
  mechanic: 'sort', prop: 'folder',
  takeaway: 'Knowing the kind of data in a column tells you what you can do with it: add numbers, sort dates, group categories.',
  prompt: 'What kind of data is this?',
  bins: [{id: 'number', label: 'Number'}, {id: 'date', label: 'Date'}, {id: 'text', label: 'Category'}],
  items: [
    {label: 'Order total: 48.20', answer: 'number', why: 'A money amount is a number you can add up or average across orders.'},
    {label: 'Ship date: 2026-03-14', answer: 'date', why: 'A calendar day is a date, so you can sort it in time order or count days between.'},
    {label: 'Region: North', answer: 'text', why: 'Region names are categories. You group or filter by them; you do not add them.'},
    {label: 'Units sold: 12', answer: 'number', why: 'A count of units is a number, so totals and averages make sense.'},
    {label: 'Signup day: May 2', note: 'Written out in words', answer: 'date', why: 'Even written in words, a day of the year is a date value.'},
    {label: 'Plan: Premium', answer: 'text', why: 'Plan names are labels for groups of customers, which makes them a category.'},
    {label: 'Customer ID: C-1042', note: 'Has letters and a dash', answer: 'text', why: 'IDs label a record. You never do math on them, so treat them as text, not numbers.'},
    {label: 'Discount: 15%', answer: 'number', why: 'A percentage is a number you can compare and calculate with.'}
  ]
}
```

### order (label "Order"): put steps in order
Each round shows 4-6 shuffled steps; the player taps them in the right sequence. List `steps` in the **correct**
order. Best for: procedures, life cycles, troubleshooting sequences. Every step must clearly come before or after its
neighbours; avoid steps that could be swapped without harm.

```js
{
  id: 'troubleshooting-steps', order: 4,
  courseSlug: 'example-course-4', courseTitle: 'Example Course Four',
  title: 'Steps in Order',
  skill: 'Putting a troubleshooting process in the right order',
  mechanic: 'order', prop: 'clipboard',
  takeaway: 'Work the problem in order: understand it, test an idea, fix it, check it, then write it down.',
  rounds: [
    {prompt: 'A user cannot print. Put the troubleshooting steps in order.', steps: ['Ask what happens and when it started', 'Check the printer is on and has paper', 'Restart the print queue', 'Print a test page with the user', 'Note the fix in the ticket'], why: 'Start by understanding the problem, try the simplest checks first, confirm the fix with the user, then record it.'},
    {prompt: 'Set up a new laptop for a hire. Put the steps in order.', steps: ['Unbox and check for damage', 'Install system updates', 'Add the company apps', 'Sign in with the new user', 'Hand over and show the basics'], why: 'Check the hardware first, update before adding apps, and hand over only once the user can sign in.'}
  ]
}
```

### lane (label "Steer"): steer into the right answer
A runner moves forward; three lanes show three short options; the player steers into the right one. Best for quick
recall: terms, tools, "which one fits". Options are <= 22 chars, so they must be short nouns or phrases.
Vary the correct index across questions (the validator rejects the same index everywhere).

```js
{
  id: 'pick-the-tool', order: 5,
  courseSlug: 'example-course-5', courseTitle: 'Example Course Five',
  title: 'Pick the Tool',
  skill: 'Matching a common task to the right tool',
  mechanic: 'lane', prop: 'chip',
  takeaway: 'Each tool has a job. Picking the right one first saves time for you and the user.',
  questions: [
    {prompt: 'You need to see which apps are using the most memory.', options: ['Task Manager', 'Disk Cleanup', 'Paint'], answer: 0, why: 'Task Manager lists running apps and how much memory each one uses.'},
    {prompt: 'A user wants to free space taken by old temporary files.', options: ['Calculator', 'Disk Cleanup', 'Snipping Tool'], answer: 1, why: 'Disk Cleanup finds and removes temporary files that are safe to delete.'},
    {prompt: 'You want to check whether a site at 192.0.2.10 answers.', options: ['Notepad', 'File Explorer', 'ping'], answer: 2, why: 'ping sends a small test message and shows whether the address replies.'},
    {prompt: 'You need a picture of an error to attach to a ticket.', options: ['Snipping Tool', 'Registry Editor', 'ping'], answer: 0, why: 'A screenshot from the Snipping Tool shows exactly what the user saw.'},
    {prompt: 'A user cannot find a file they saved this morning.', options: ['Task Manager', 'File Explorer search', 'Disk Cleanup'], answer: 1, why: 'File Explorer search can find files by name or by the date they changed.'},
    {prompt: 'You need to see the IP address of this computer.', options: ['Paint', 'Calculator', 'ipconfig'], answer: 2, why: 'ipconfig shows the network settings, including the computer\'s IP address.'}
  ]
}
```

### match (label "Connect"): connect pairs
Each round shows 4-5 left items and their shuffled right items; the player taps a left, then its partner on the right.
Best for: term to meaning, symptom to cause, role to duty. Each left must have exactly one partner that fits; no right
should fit two lefts.

```js
{
  id: 'match-the-terms', order: 6,
  courseSlug: 'example-course-6', courseTitle: 'Example Course Six',
  title: 'Match the Terms',
  skill: 'Connecting cloud terms to what they mean',
  mechanic: 'match', prop: 'packet',
  takeaway: 'Cloud services differ by how much they manage for you: hardware, platform, or the whole app.',
  rounds: [
    {prompt: 'Match each cloud service model to what it gives you.', pairs: [['IaaS', 'Virtual servers you manage yourself'], ['PaaS', 'A platform to run your own code'], ['SaaS', 'A finished app you just sign in to'], ['On-premises', 'Hardware in your own building']], why: 'The further from on-premises you go, the more the provider manages: servers, then platform, then the whole app.'},
    {prompt: 'Match each term to its meaning.', pairs: [['Region', 'A geographic area with data centers'], ['Scaling', 'Adding or removing capacity'], ['Uptime', 'Share of time a service is working'], ['Backup', 'A saved copy you can restore']], why: 'These words come up in every cloud plan: where it runs, how it grows, how reliable it is, and how you recover.'}
  ]
}
```

---

## 5. Worlds, moods, accents and props

**World ids** (`theme.world`): `office`, `server-room`, `warehouse`, `clinic`, `factory`, `site` (construction job
site), `studio` (design / media), `cloud`, `lab`. Pick the place where the program's job happens. All nine worlds are
built; an unknown world id fails validation.

**Mood** (`theme.mood`, optional): `day` (default, brightest and clearest; use it unless the program has a reason),
`dusk`, `night`.

**Accent** (`theme.accent`): one `#rrggbb` color for the item ring, card edge and props. Pick a mid-dark color that
reads on white (for example `#ad2c4d` crimson, `#2b7bb9` blue, `#4a9b4f` green, `#8a5a2b` brown, `#6b4fa0` purple,
`#1f7a7a` teal). Avoid pale or neon colors.

**Prop ids** (`level.prop`, the moving 3D item). Core set (`kit/props.mjs`): `ticket`, `packet`, `envelope`,
`crate`, `folder`, `chip`, `clipboard`, `block`. Extra set (`kit/props2.mjs`): `pallet`, `hardhat`, `toolbox`,
`pillbottle`, `chart-folder`, `barcode-box`, `gear`, `valve`, `blueprint`, `code-block`, `database-cylinder`,
`cloud-node`, `robot-head`, `megaphone`, `shopping-bag`, `wireframe-card`, `calendar-card`, `sticky-note`. An unknown
id fails validation. In `gate` and `sort` levels a single item may carry its own `prop` to override the level's
prop (for example a `hardhat` item and a `toolbox` item in the same sort level); use it only when the item really is
that thing. Match the prop to the thing being judged: support tickets `ticket`, network traffic
`packet`, email or letters `envelope`, shipments `crate` or `pallet`, records and documents `folder`, hardware
`chip`, checklists and work orders `clipboard`, code `code-block`, data stores `database-cylinder`, anything else
`block`.

---

## 6. Writing rules

1. **Plain words.** Short sentences, everyday words, no jargon the course has not taught. Define a term the first
   time if you must use it. Aim for a reader who is new to the field.
2. **One idea per item.** Each item, question or pair tests one thing. If you need "and" to say what it tests, split it.
3. **Unambiguous answers.** A careful learner who knows the course must always land on the same answer. If an expert
   could argue for another action, add a fact that rules it out or drop the item.
4. **Evidence, not trivia.** For `gate` and `sort`, the facts must point to the answer. Do not hide the deciding clue,
   and do not include a fact that points the other way unless the why explains it.
5. **Different evidence each time.** Within a level, no two items should be decided by the same clue.
6. **A why that teaches.** The `why` says the reason and, where useful, the next action: "Clicking after a drop is a
   classic sign of a failing drive. Back up what you can." Never just "Because it is hardware." It is shown to everyone
   who got it wrong, so it must make sense on its own.
7. **Balanced answers.** Spread answers across actions/bins; avoid long runs of the same answer. Make the wrong
   options plausible, never silly.
8. **Calm tone.** No exclamation stacks, no ALL CAPS, no emoji, no blame ("You failed"). The UI already says
   "Not quite" and "Right".
9. **Fictional and safe content.** Fictional people and companies (for example Dana Ortiz, Brightline Help Desk,
   Northwind Clinic). Network addresses only from RFC 5737: `192.0.2.x`, `198.51.100.x`, `203.0.113.x`. Domains only
   `.test` or `.example` (for example `billing.example`, `login-help.test`). No real brands as the subject of an item,
   no real people.
10. **Original wording.** Never copy course-provider text, quiz items, or the pack's quiz/explanations. Read for topic,
    then write fresh.
11. **Practice, not credit.** Never say or imply the game is graded, counts for credit or proves certification.
12. **First level is a gentle practice round.** It is always untimed. Make it the easiest level of the game.
13. **Fit the phone.** Titles under about 34 chars and facts under about 45 read on one line at 360px wide. The limits
    are maximums, not targets.

---

## 7. Common mistakes (and what the validator says)

| Mistake | Result |
|---|---|
| `order` values out of sequence or starting at 0 | error `levels[i].order ... expected i+1` |
| Level count or courseSlug/courseTitle not matching the pack | error from validate's pack check |
| `skill` starts with "You will practice:" | reads twice on screen; remove the prefix |
| `answer` uses a label ("Fix it now") instead of an id ("fix") | error `answer ... is not one of the action ids` |
| One action is the answer for 6 of 8 items | error `more than 70%` |
| A bin or action never used | error `never the answer` |
| `lane` answers all `1` | error `the correct index is the same for every question` |
| `lane.options` with 2 or 4 entries | error `needs exactly 3` |
| `order` steps listed shuffled | the game marks the wrong order as correct; list steps in the right order |
| Two `match` rights that both fit one left | ambiguous; no validator error, so check by reading |
| `facts` as a single string instead of an array | error `must be an array` |
| `why` of a few words | warning `very short why`; explain the reason |
| Field typo like `answers` or `fact` | warning `unknown field (typo?)` and the field is ignored |
| Same mechanic for every level of a 6-level game | error from the variety rule |
| Real company domains or public IPs | not caught by the validator; use `.example`/`.test` and RFC 5737 |
| Importing anything in `game.mjs` | Node import breaks validate; the file must be plain data |

---

## 8. What the player sees (so you can write for it)

- **Hub (`index.html`):** one card per program game, grouped by category, with stars earned and a "Levels by course"
  list that links straight to each level.
- **Map:** game title, role line, program, total stars; one card per level ("After course N", course title, level
  title, skill, mechanic label, best stars). The first unplayed level is marked "Next up".
- **Coach card:** your `scene` line (if you wrote one), level title, "You will practice: <skill>", 2-3 how-to steps
  from the mechanic, Start.
- **Play:** progress ("3 of 7"), 3 hearts, the 3D scene, and a bottom sheet with the card (your `title` and up to 3
  `facts`), your `prompt`, and one numbered button per choice. The same words also appear on signs in the 3D scene
  (gate pads, sort bins, lane doors, order tiles, match plates), so short labels read best: aim for sort bins of 14
  characters or fewer, lane options of 18 or fewer, order steps of 38 or fewer and match terms of 20 or fewer. Timed
  levels (all but the first) give about 20 seconds per decision unless the player turns the timer off.
- **Right:** a short green note with your `why` that fades after about a second, and from three right answers in a
  row a "3 in a row" chip. **Wrong or out of time:** the scene shows what went wrong, then a sheet with "Not quite",
  the right answer, your `why`, and Got it.
- **Results:** stars (3 = no mistakes), "You practiced: <skill>", your `takeaway`, the best streak, and a review of
  every miss with its right answer and `why`. The third mistake ends the round; retrying is free.
- **Per-item props:** in gate and sort levels an item with its own `prop` shows that 3D object in place of the
  level's prop.

Test URL while writing: `node tools/serve.mjs` then open `http://127.0.0.1:8770/play.html?game=<id>`
(add `&level=<level-id>` to jump to a level, `&text=1` for text mode, `&world=`, `&mood=`, `&accent=rrggbb` or
`&quality=low|medium|high` to preview another look). Stop the server when done.

Developers changing the kit itself: see `kit/KIT.md`.
