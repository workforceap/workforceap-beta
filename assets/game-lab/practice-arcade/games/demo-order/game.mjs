// Demo game for the 'order' mechanic. Level 1 is a short 'gate' level so the game meets the variety rule
// (4-5 levels need 2 mechanics); levels 2-5 all use 'order'. Original wording; people and companies are fictional.
export default {
  id: 'demo-order',
  title: 'Step by Step',
  tagline: 'Practice putting IT jobs in the right order.',
  role: 'You are a new technician at Brightline Help Desk, learning the steps behind every job.',
  program: 'IT Support Professional Certificate (demo)',
  theme: {world: 'office', accent: '#ad2c4d', mood: 'day'},
  levels: [
    {
      id: 'tier-one-or-up',
      order: 1,
      courseSlug: 'it-support-course-1',
      courseTitle: 'Introduction to Technical Support',
      title: 'Handle or Escalate?',
      skill: 'Knowing which tickets Tier 1 can close on its own',
      mechanic: 'gate',
      prop: 'ticket',
      takeaway: 'Tier 1 owns routine, documented fixes. Anything that affects many people, or needs special access, goes up to the team that owns it.',
      prompt: 'Can you close this ticket yourself, or does it go up?',
      actions: [{id: 'handle', label: 'Handle it'}, {id: 'escalate', label: 'Escalate'}],
      items: [
        {title: 'Forgot email password', facts: ['Caller verified by a callback', 'Reset steps are in the runbook'], answer: 'handle', why: 'A verified reset with a written runbook is routine Tier 1 work. Do it, then note it in the ticket.'},
        {title: 'Whole floor has no Wi-Fi', facts: ['Nine people reported it', 'Started ten minutes ago'], answer: 'escalate', why: 'An outage that hits many people is bigger than one desk. Send it to the network team right away.'},
        {title: 'Mouse pointer will not move', facts: ['Wireless mouse', 'Battery light is blinking red'], answer: 'handle', why: 'A blinking low battery light points to a dead battery. Swap it and check that the pointer moves.'},
        {title: 'Server asks for admin approval', facts: ['User wants a new shared folder', 'Needs permissions only admins can grant'], answer: 'escalate', why: 'Granting server permissions is outside Tier 1 access. Pass it to the admins with the details written down.'},
        {title: 'Printer shows "out of paper"', facts: ['Tray is empty', 'Paper is in the supply closet'], answer: 'handle', why: 'Refilling paper is simple and safe. Fix it, then confirm that a test page prints.'},
        {title: 'Strange login attempts overnight', facts: ['Twelve failed sign-ins at 3 a.m.', 'Different countries each time'], answer: 'escalate', why: 'Odd login patterns may be an attack. Security needs to see it, so escalate and do not try to fix it alone.'}
      ]
    },
    {
      id: 'help-desk-flow',
      order: 2,
      courseSlug: 'it-support-course-2',
      courseTitle: 'Help Desk Processes and Workflows',
      title: 'Ticket Life Cycle',
      skill: 'Putting the steps of a support job in order',
      mechanic: 'order',
      scene: 'Monday at Brightline Help Desk. Dana Ortiz is locked out, and a new ticket just landed in your queue.',
      takeaway: 'Each step needs the one before it. Find the account, prove who is asking, then reset. Understand the problem before you fix it, and test before you close.',
      rounds: [
        {prompt: 'A coworker is locked out. Put the reset steps in order.', steps: ['Look up their account', 'Call the phone number on file', 'Start a password reset', 'Send the one-time link', 'Check they can sign in'], why: 'The account gives you the number on file. Calling it proves who is asking, so only then reset, send the link, and confirm they can sign in.'},
        {prompt: 'A new ticket arrives. Work it from start to finish.', steps: ['Read what the user wrote', 'Ask questions to find the cause', 'Try the most likely fix', 'Test that it works', 'Close it with clear notes'], why: 'Your questions build on what the user wrote. A fix needs a cause, a test needs a fix, and you close only what you have tested.'}
      ]
    },
    {
      id: 'no-power',
      order: 3,
      courseSlug: 'it-support-course-3',
      courseTitle: 'Hardware Troubleshooting Basics',
      title: 'Nothing Turns On',
      skill: 'Working a hardware job one step at a time',
      mechanic: 'order',
      scene: 'The repair bench at Brightline. A dead desktop, a laptop due for an update, and a worn-out battery.',
      takeaway: 'Hardware jobs run in a chain: each step uses what the last one gave you. Power first, data safe before changes, and test before you hand it back.',
      rounds: [
        {prompt: 'A desktop will not turn on. Work through it in order.', steps: ['Plug in the power cable', 'Press the power button', 'Count the beeps it makes', 'Look up that beep code', 'Replace the part the code names'], why: 'Power has to be connected before the button can do anything. The beeps only come after you press it, and the code tells you which part to replace.'},
        {prompt: 'Update a laptop safely. Put the steps in order.', steps: ['Back up your files', 'Install the update', 'Restart when asked', 'Check that your apps still work'], why: 'Back up before you change anything. The update asks for a restart, and only after the restart can you see whether your apps still work.'},
        {prompt: 'Replace a laptop battery. Put the steps in order.', steps: ['Shut down and unplug it', 'Remove the bottom cover', 'Disconnect the old battery', 'Connect the new battery', 'Put the cover back on', 'Charge it and power it on'], why: 'Never open a laptop that is on. The cover hides the battery, the old one comes out before the new one goes in, and you close it before you power up.'}
      ]
    },
    {
      id: 'web-page-trip',
      order: 4,
      courseSlug: 'it-support-course-4',
      courseTitle: 'Introduction to Computer Networking',
      title: 'A Page Appears',
      skill: 'Following data across a network from start to finish',
      mechanic: 'order',
      scene: 'A coworker asks how a page or an email actually gets to them. Walk the trip with them, hop by hop.',
      takeaway: 'Network trips run in order: a name becomes an address, a request travels out, and the answer comes back to be shown.',
      rounds: [
        {prompt: 'You type a web address. How does the page arrive?', steps: ['You type the web address', 'DNS finds the server address', 'The browser calls the server', 'The server sends the page back', 'The browser draws the page'], why: 'A name has to become an address before anyone can be contacted. Then the page travels back and is drawn.'},
        {prompt: 'You email a coworker. How does the message reach them?', steps: ['You press Send', 'Your mail server receives it', 'It looks up their mail server', 'It hands the message over', 'Their mail app downloads it'], why: 'Your server must have the message before it can find where it goes. Their server must hold it before their app can download it.'}
      ]
    },
    {
      id: 'phish-response',
      order: 5,
      courseSlug: 'it-support-course-5',
      courseTitle: 'Security Basics for IT Support',
      title: 'Spot and Report',
      skill: 'Responding calmly to a suspicious email and locking down an account',
      mechanic: 'order',
      scene: 'An odd email lands in your inbox, and a new hire needs their first account set up safely.',
      takeaway: 'Pause before you act, report before you delete so security can look, and add each lock in the order the account allows.',
      rounds: [
        {prompt: 'A strange email asks you to "verify your account".', steps: ['Stop and do not click anything', 'Check the sender address', 'Report it to the security team', 'Delete it once security replies'], why: 'Pause first so nothing gets clicked. The sender address tells you it is fake, security needs the message to look at it, and it goes only after they reply.'},
        {prompt: 'Protect a new account. Put the steps in order.', steps: ['Pick a long, unique password', 'Turn on two-step sign-in', 'Save the recovery codes', 'Sign out, then sign in to test'], why: 'Two-step sign-in needs a password to protect, and it shows the recovery codes when you turn it on. Save them before you test that it all works.'}
      ]
    }
  ]
};
