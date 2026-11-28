// Demo game for the 'match' mechanic. One 'gate' warm-up (the validator requires at least two mechanics for 4-5
// levels), then four 'match' levels. Original wording; people and companies are fictional.
export default {
  id: 'demo-match',
  title: 'Cable Crew',
  tagline: 'Connect the terms and tools every new IT helper needs.',
  role: 'You are a new helper at Brightline Help Desk, plugging the right idea into the right place.',
  program: 'IT Basics Practice Demo',
  theme: {world: 'office', accent: '#ad2c4d', mood: 'day'},
  levels: [
    {
      id: 'safe-or-risky',
      order: 1,
      courseSlug: 'demo-course-1',
      courseTitle: 'Working Safely with Technology',
      title: 'Safe or Risky?',
      skill: 'Spotting messages and requests that look risky',
      mechanic: 'gate',
      prop: 'envelope',
      takeaway: 'Check who asked, where a link really goes and whether the request makes sense. Never share a password with anyone who contacts you first.',
      prompt: 'Does this look safe or risky?',
      actions: [{id: 'safe', label: 'Looks safe'}, {id: 'risky', label: 'Looks risky'}],
      items: [
        {title: 'Reset link you asked for', facts: ['You clicked "Forgot password" a minute ago', 'Link goes to login.brightline.example', 'No attachment'], answer: 'safe', why: 'You started the reset and the link goes to the company site. A reset email you asked for is normal.'},
        {title: 'Prize notice from a stranger', facts: ['You never entered a contest', 'Asks for a small fee to claim it', 'Link goes to claim-now.test'], answer: 'risky', why: 'Surprise prizes that ask for money are a classic trick. Delete it and do not click the link.'},
        {title: 'Update prompt in Settings', facts: ['Shown inside the system Settings app', 'Asks to restart tonight', 'No links or downloads'], answer: 'safe', why: 'An update offered inside the Settings app comes from the computer itself. Restarting tonight is a normal request.'},
        {title: 'Caller asking for your password', facts: ['Says they are from IT', 'You did not expect the call', 'Wants your password to "verify" you'], answer: 'risky', why: 'Real IT staff never need your password. Hang up and call the help desk number you already know.'},
        {title: 'USB drive found outside', facts: ['No label on it', 'Nobody has claimed it', 'A passer-by says to plug it in'], answer: 'risky', why: 'Unknown drives can carry harmful files. Hand it to IT instead of plugging it in.'},
        {title: 'Invite from a known coworker', facts: ['Dana Ortiz, from your own team', 'Weekly meeting at the usual time', 'Sent through the company calendar'], answer: 'safe', why: 'Known sender, usual time and the real calendar all fit together. Nothing here asks for secrets or money.'}
      ]
    },
    {
      id: 'parts-of-a-computer',
      order: 2,
      courseSlug: 'demo-course-2',
      courseTitle: 'Computer Hardware Basics',
      title: 'Parts of a Computer',
      skill: 'Connecting computer parts to the job each one does',
      scene: 'A new hire at Brightline asks what is inside the box on their desk. Label each part before you show them around.',
      mechanic: 'match',
      prop: 'chip',
      takeaway: 'Every part has one main job: thinking, remembering, storing, connecting, showing and taking input.',
      rounds: [
        {prompt: 'Connect each inside part to its job.', pairs: [['CPU', 'Runs the instructions'], ['RAM', 'Short-term memory while it is on'], ['Storage drive', 'Keeps files when power is off'], ['Motherboard', 'The board that links every part']], why: 'The CPU thinks, RAM holds what you are using right now, the drive keeps files for later, and the motherboard joins them all.'},
        {prompt: 'Connect each device to what it does for you.', pairs: [['Monitor', 'Shows you what is happening'], ['Keyboard', 'Lets you type letters and numbers'], ['Mouse', 'Moves the pointer on screen'], ['Power supply', 'Sends electricity to the parts'], ['Printer', 'Puts a document on paper']], why: 'Output devices show or print results, input devices send your actions in, and the power supply feeds everything.'}
      ]
    },
    {
      id: 'network-words',
      order: 3,
      courseSlug: 'demo-course-3',
      courseTitle: 'Networks and the Internet',
      title: 'Network Words',
      skill: 'Connecting common network terms to their meaning',
      scene: 'Dana Ortiz is drawing the office network on the whiteboard and wants the right word on every line.',
      mechanic: 'match',
      prop: 'packet',
      takeaway: 'Learn the vocabulary first: a router connects networks, an address names a device, and speed has two parts, bandwidth and delay.',
      rounds: [
        {prompt: 'Connect each network word to its meaning.', pairs: [['Router', 'Joins your network to the internet'], ['Wi-Fi', 'Network signal sent through the air'], ['Ethernet cable', 'A wired link to the network'], ['IP address', 'A number that names a device']], why: 'A router is the doorway to the internet. Wi-Fi and Ethernet are two ways to reach it, and every device gets an address.'},
        {prompt: 'Connect each word about direction and speed to its meaning.', pairs: [['Download', 'Copy a file from the internet to you'], ['Upload', 'Send a file from you to the internet'], ['Bandwidth', 'How much data can move at once'], ['Latency', 'The delay before data arrives']], why: 'Download and upload describe direction. Bandwidth is the size of the pipe and latency is the wait before anything flows.'}
      ]
    },
    {
      id: 'first-fix',
      order: 4,
      courseSlug: 'demo-course-4',
      courseTitle: 'Supporting Users',
      title: 'Problem and First Fix',
      skill: 'Connecting a common problem to the first thing to check',
      scene: 'Monday morning, and five calls are waiting in the queue. Give each caller the quickest first check.',
      mechanic: 'match',
      prop: 'ticket',
      takeaway: 'Start with the simplest check for each symptom. Many problems end at a loose cable, a switch or a typo.',
      rounds: [
        {prompt: 'Connect each problem to the first check.', pairs: [['Screen is black', 'Check the monitor cable and power'], ['No Wi-Fi', 'Make sure airplane mode is off'], ['Printer will not print', 'Check paper and the print queue'], ['Computer is very slow', 'Close programs you are not using'], ['Cannot sign in', 'Check caps lock and the username']], why: 'The first check is the cheapest and most common cause: a cable, a switch, an empty tray, a crowded memory or a typo.'},
        {prompt: 'Connect each support word to its meaning.', pairs: [['Tier 1', 'First contact for simple fixes'], ['Tier 2', 'Deeper problems passed up from Tier 1'], ['Ticket', 'The written record of a problem'], ['Knowledge base', 'Saved how-to articles for common fixes']], why: 'Tier 1 handles the easy cases, Tier 2 takes the harder ones, each problem lives in a ticket, and a knowledge base saves the answers.'}
      ]
    },
    {
      id: 'account-safety',
      order: 5,
      courseSlug: 'demo-course-5',
      courseTitle: 'Staying Secure Online',
      title: 'Account Safety Words',
      skill: 'Connecting security words to what they protect you from',
      scene: 'Security week at Brightline: help the team poster explain each safety word in plain language.',
      mechanic: 'match',
      prop: 'folder',
      takeaway: 'Long unique passwords, a second proof, updates and backups cover most everyday risks. Phishing is the trick they guard against.',
      rounds: [
        {prompt: 'Connect each safety word to its meaning.', pairs: [['Strong password', 'Long and not used anywhere else'], ['MFA', 'A second proof, like a phone code'], ['Phishing', 'A fake message meant to trick you'], ['Update', 'A patch that closes a known hole'], ['Backup', 'A saved copy you can restore']], why: 'A strong password and MFA guard the door, updates fix weak spots, backups let you recover, and phishing is the trick to watch for.'},
        {prompt: 'Connect each situation to the safe move.', pairs: [['Odd link in an email', 'Do not click; check who sent it'], ['Public Wi-Fi at a cafe', 'Avoid banking or work sign-ins'], ['Lost work laptop', 'Tell IT right away so they can lock it'], ['Coworker asks for login', 'Say no and offer to request access']], why: 'Check before you click, keep sign-ins off open networks, never share a login, and report a lost device fast so it can be locked.'}
      ]
    }
  ]
};
