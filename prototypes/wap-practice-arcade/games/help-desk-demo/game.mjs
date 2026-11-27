// Demo game that proves the kit: two 'gate' levels after the first two courses of the
// IT Support Professional Certificate (IBM). Original wording; people and companies are fictional.
export default {
  id: 'help-desk-demo',
  title: 'Help Desk Hero',
  tagline: 'Quick practice breaks for new IT support techs.',
  role: 'You are a new Tier 1 tech at Brightline Help Desk, sorting out what lands in the queue.',
  program: 'IT Support Professional Certificate (IBM)',
  theme: {world: 'office', accent: '#ad2c4d', mood: 'day'},
  levels: [
    {
      id: 'ticket-triage',
      order: 1,
      courseSlug: 'it-support-course-1',
      courseTitle: 'Introduction to Technical Support',
      title: 'Ticket Triage',
      skill: 'Choosing the right next step for a help desk ticket',
      mechanic: 'gate',
      scene: 'Monday, 9:00. You open the Brightline queue on your first solo shift, and new tickets roll in one after another.',
      prop: 'ticket',
      takeaway: 'Define the problem before you fix it. Fix what Tier 1 owns, and send repeat problems or wide outages up to the team that can solve them.',
      prompt: 'You are Tier 1. What is the right next step for this ticket?',
      actions: [
        {id: 'fix', label: 'Fix it now'},
        {id: 'ask', label: 'Ask first'},
        {id: 'escalate', label: 'Escalate'}
      ],
      items: [
        {title: 'Locked out after 5 password tries', facts: ['User: Dana Ortiz, Sales', 'Identity confirmed by a callback', 'Unlock steps are in the Tier 1 runbook'], answer: 'fix', why: 'A verified lockout with runbook steps is routine Tier 1 work. Unlock it now and note what you did in the ticket.'},
        {title: '"My computer is broken"', facts: ['No error message given', 'User did not say what changed', 'Coworkers on the same floor are fine'], answer: 'ask', why: '"Broken" could mean a dozen things. Ask what happens, what the screen says and when it last worked before you try a fix.'},
        {title: 'Same printer jam, fourth time', facts: ['Fourth ticket this month', 'Each time the jam was just cleared', 'Same printer on Floor 2'], answer: 'escalate', why: 'Repeat tickets mean the root cause was never fixed. Send it to Tier 2 for a deeper look instead of clearing it a fifth time.'},
        {title: 'Mailbox almost full', facts: ['Inbox is at 99% of its limit', 'User asks how to free up space', 'Archive steps are in the help articles'], answer: 'fix', why: 'A documented fix you can walk the user through is Tier 1 work. Help them archive old mail and close the ticket.'},
        {title: 'Nobody can open shared files', facts: ['Twelve staff report the same error', 'Started ten minutes ago', 'Tier 1 has no access to the file server'], answer: 'escalate', why: 'Many users hit at once on a system you cannot reach is an outage. Escalate right away to the team that runs the server.'},
        {title: '"The app is slow sometimes"', facts: ['Which app: not stated', 'No times or examples given'], answer: 'ask', why: 'Without the app name and when it happens you cannot test anything. Gather those details first, then troubleshoot.'},
        {title: 'New hire needs a second monitor', facts: ['Monitor is in stock', 'Desk setup is a standard Tier 1 task', 'Manager approved it by email'], answer: 'fix', why: 'An approved, standard setup with parts in stock is a quick Tier 1 win. Schedule it and confirm with the user when done.'}
      ]
    },
    {
      id: 'hardware-or-software',
      order: 2,
      courseSlug: 'it-support-course-2',
      courseTitle: 'Introduction to Hardware and Operating Systems',
      title: 'Hardware or Software?',
      skill: 'Telling hardware faults apart from software problems',
      mechanic: 'gate',
      scene: 'Week two. Broken laptops and odd errors land on your bench, each with a note from the user.',
      prop: 'clipboard',
      takeaway: 'Let the evidence lead. Noise, heat, damage or no power point to hardware. Trouble that starts after an install, update or settings change points to software.',
      prompt: 'Where does the evidence point: hardware or software?',
      actions: [
        {id: 'hardware', label: 'Hardware'},
        {id: 'software', label: 'Software'}
      ],
      items: [
        {title: 'Clicking sound, files will not open', facts: ['Laptop was dropped last week', 'A steady clicking comes from inside', 'Some files give read errors'], answer: 'hardware', why: 'Clicking after a drop is a classic sign of a failing hard drive. Back up what you can and plan a drive replacement.'},
        {title: 'Pop-ups after a free download', facts: ['Browser home page changed by itself', 'Started right after installing a tool', 'Hardware tests pass'], answer: 'software', why: 'Trouble that began right after an install points to that program. Remove it and scan for unwanted software.'},
        {title: 'No lights when power is pressed', facts: ['Outlet works fine for a lamp', 'Charger light stays off', 'Laptop worked yesterday'], answer: 'hardware', why: 'No lights at all on a working outlet points to the charger or power parts. Try a known good charger next.'},
        {title: 'One app crashes when it opens', facts: ['Every other app runs fine', 'Crashes began after that app updated', 'Error mentions a missing file'], answer: 'software', why: 'One app failing right after its own update is a software problem. Repair or reinstall that app first.'},
        {title: 'Loud fan, then sudden shutdowns', facts: ['Case is hot to the touch', 'Air vents are packed with dust', 'Shuts down during heavy work'], answer: 'hardware', why: 'Heat plus clogged vents means the cooling parts cannot keep up. Clean the vents and check that the fan spins freely.'},
        {title: 'Slow ever since an update', facts: ['Big update installed two days ago', 'Memory and disk tests pass', '30 programs launch at startup'], answer: 'software', why: 'Passing hardware tests and a crowded startup list point to software. Trim startup programs and review the update.'},
        {title: 'Lines across the screen', facts: ['Lines show even on the startup logo', 'Lines shift when the lid is moved'], answer: 'hardware', why: 'Lines before Windows even loads, which change as the lid moves, point to the screen or its cable, not the system.'},
        {title: 'Clock and menus suddenly wrong', facts: ['Clock is two hours off', 'Menus switched to another language', 'Started after a settings sync'], answer: 'software', why: 'Time zone and language are operating system settings. Fix them in Settings; nothing physical is broken.'}
      ]
    }
  ]
};
