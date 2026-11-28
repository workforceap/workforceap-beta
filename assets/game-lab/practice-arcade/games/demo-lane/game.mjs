// Demo game for the 'lane' (Steer) mechanic. Fictional courses; beginner IT content in original wording.
// Level 1 is a 'gate' level because the validator's variety rule needs 2 mechanics for a 5-level game.
export default {
  id: 'demo-lane',
  title: 'Courier Run',
  tagline: 'Steer a courier robot through the door with the right answer.',
  role: 'You guide a courier robot at Brightline Help Desk, racing answers through the right door.',
  program: 'Demo: Steer practice',
  theme: {world: 'office', accent: '#2b7bb9', mood: 'day'},
  levels: [
    {
      id: 'keep-or-report', order: 1,
      courseSlug: 'demo-course-1', courseTitle: 'Demo Course One: Working Safely Online',
      title: 'Keep or Report',
      skill: 'Spotting emails that should be reported',
      mechanic: 'gate', prop: 'envelope',
      takeaway: 'Pressure, odd links and surprise attachments are warning signs. When an email feels wrong, report it instead of clicking.',
      prompt: 'Is this email fine to keep, or should you report it?',
      actions: [{id: 'keep', label: 'Keep'}, {id: 'report', label: 'Report'}],
      items: [
        {title: 'Team lunch on Friday', facts: ['From your manager, Dana Ortiz', 'No links or attachments'], answer: 'keep', why: 'A known sender with no links and no requests is an ordinary message. Nothing here asks you to act or share data.'},
        {title: 'Your mailbox is full: sign in now', facts: ['Sender: it-help@mail-reset.test', 'Link text does not match its address'], answer: 'report', why: 'A sign-in link whose real address differs from its text is a classic phishing trick. Report it and do not click.'},
        {title: 'Invoice 4471 attached', facts: ['From a company you have never used', 'Attachment is invoice.zip'], answer: 'report', why: 'Surprise zip files from strangers often hide malware. Report the email instead of opening the file.'},
        {title: 'Updated holiday calendar', facts: ['From hr@brightline.example, your company', 'Same format as last year'], answer: 'keep', why: 'It comes from your own company domain and matches what you expect, so there is no warning sign here.'},
        {title: 'Gift card request from the CEO', facts: ['Asks you to buy gift cards quickly', 'Sent from a personal address'], answer: 'report', why: 'Urgent money requests from a boss on a personal address are a common scam. Check by phone, then report it.'},
        {title: 'Your password was changed', facts: ['You changed it yourself five minutes ago', 'A notice only, with no link'], answer: 'keep', why: 'A notice that matches something you just did, with nothing to click, is a normal security message.'}
      ]
    },
    {
      id: 'name-the-part', order: 2,
      courseSlug: 'demo-course-2', courseTitle: 'Demo Course Two: Inside the Computer',
      title: 'Name the Part',
      skill: 'Matching computer parts to the job they do',
      mechanic: 'lane', prop: 'chip',
      takeaway: 'Every part has one main job: the CPU thinks, RAM holds what is open, storage keeps files, and the power supply feeds them all.',
      questions: [
        {prompt: 'Which part carries out the instructions of every program you run?', options: ['CPU', 'Power supply', 'Case fan'], answer: 0, why: 'The CPU, or processor, works through program instructions. A faster CPU finishes more work each second.'},
        {prompt: 'Which part holds open apps while you work, and empties when the power is off?', options: ['Hard drive', 'RAM', 'Monitor'], answer: 1, why: 'RAM is short-term working memory. It is very fast, but it loses everything when the computer turns off.'},
        {prompt: 'Where do your files stay while the computer is switched off?', options: ['RAM', 'CPU cache', 'SSD'], answer: 2, why: 'An SSD or hard drive keeps files long term, so they are still there after a restart.'},
        {prompt: 'Which part turns wall power into the steady power the other parts need?', options: ['Power supply', 'Graphics card', 'Keyboard'], answer: 0, why: 'The power supply converts outlet power into the lower, steady voltages the motherboard and drives use.'},
        {prompt: 'Which board connects all the other parts so they can work together?', options: ['Monitor', 'Motherboard', 'Router'], answer: 1, why: 'The motherboard is the main circuit board. The CPU, RAM, drives and cards all plug into it.'},
        {prompt: 'Which part builds the picture on screen and speeds up video work?', options: ['Sound card', 'Network card', 'Graphics card'], answer: 2, why: 'The graphics card, or GPU, draws each frame sent to the screen and speeds up video and 3D work.'},
        {prompt: 'Which part keeps the processor from overheating?', options: ['Heat sink and fan', 'USB hub', 'Webcam'], answer: 0, why: 'A heat sink pulls heat away from the CPU and a fan pushes it out of the case. Dust makes both work worse.'}
      ]
    },
    {
      id: 'first-step', order: 3,
      courseSlug: 'demo-course-3', courseTitle: 'Demo Course Three: Everyday Troubleshooting',
      title: 'First Step First',
      skill: 'Choosing a sensible first step for common problems',
      mechanic: 'lane', prop: 'ticket',
      takeaway: 'Start with the simple, safe step that fits the clue in front of you. Big fixes come later, only if small ones fail.',
      questions: [
        {prompt: 'A web page looks broken right after the site was updated.', options: ['Clear the cache', 'Replace the screen', 'Buy more RAM'], answer: 0, why: 'Old saved copies of a page can clash with the new version. Clearing the browser cache loads fresh files.'},
        {prompt: 'A laptop is slow and has not been restarted in three weeks.', options: ['Reinstall Windows', 'Restart it', 'Replace the battery'], answer: 1, why: 'A restart clears stuck programs and finishes waiting updates. Try the simple, safe step before anything drastic.'},
        {prompt: 'A user says the printer is offline. Its power light is off.', options: ['Update the driver', 'Reset the network', 'Check the power cable'], answer: 2, why: 'No power light means no power. Check the cable and the outlet before looking at any software.'},
        {prompt: 'Wi-Fi works on every phone in the office but not on one laptop.', options: ['Reset laptop Wi-Fi', 'Restart the router', 'Call the provider'], answer: 0, why: 'If every other device connects, the router is fine. Start with the one laptop that has the problem.'},
        {prompt: 'A user forgot their password and is locked out.', options: ['Share your password', 'Verify, then reset it', 'Make a new account'], answer: 1, why: 'Confirm the person is who they say they are, then reset the password. Never share or reuse passwords.'},
        {prompt: 'An app froze and will not close with the X button.', options: ['Unplug the computer', 'Delete the app', 'End it in Task Manager'], answer: 2, why: 'Task Manager can end a stuck app safely. Pulling the power risks losing other unsaved work.'},
        {prompt: 'No sound from the speakers, and the volume icon shows a slash.', options: ['Unmute the volume', 'Replace the speakers', 'Reinstall the OS'], answer: 0, why: 'A slash on the volume icon means sound is muted. Turn it back on before trying anything bigger.'}
      ]
    },
    {
      id: 'network-words', order: 4,
      courseSlug: 'demo-course-4', courseTitle: 'Demo Course Four: Networking Basics',
      title: 'Network Words',
      skill: 'Recognizing basic networking terms',
      mechanic: 'lane', prop: 'packet',
      takeaway: 'Names become addresses through DNS, DHCP hands out addresses, routers move traffic between networks and firewalls decide what may pass.',
      questions: [
        {prompt: 'What turns a name like portal.example into a number address?', options: ['DNS', 'USB', 'HDMI'], answer: 0, why: 'DNS works like a phone book for networks: it looks up the IP address that belongs to a name.'},
        {prompt: 'Which device passes traffic between the office network and the internet?', options: ['Monitor', 'Router', 'Printer'], answer: 1, why: 'A router links networks together and sends each piece of traffic toward where it is going.'},
        {prompt: 'Which of these is a valid IPv4 address?', options: ['portal.example', '00-1A-2B-3C-4D-5E', '192.0.2.15'], answer: 2, why: 'An IPv4 address is four numbers from 0 to 255 split by dots. The others are a name and a hardware address.'},
        {prompt: 'What gives each device an IP address automatically when it joins?', options: ['DHCP', 'FTP', 'A firewall'], answer: 0, why: 'DHCP lends an address to each device that joins, so nobody has to type network settings by hand.'},
        {prompt: 'What checks traffic and blocks connections that break the rules?', options: ['A switch', 'A firewall', 'A modem'], answer: 1, why: 'A firewall compares traffic with a set of rules and stops whatever is not allowed in or out.'},
        {prompt: 'Which kind of network covers just one building, like a single office?', options: ['WAN', 'The internet', 'LAN'], answer: 2, why: 'A LAN is a local area network inside one place. A WAN links networks across cities or countries.'},
        {prompt: 'Which cable plugs a desktop into a network jack in the wall?', options: ['Ethernet cable', 'HDMI cable', 'Power cord'], answer: 0, why: 'Ethernet cables carry network data over a wired link, which is usually steadier than Wi-Fi.'}
      ]
    },
    {
      id: 'safe-habits', order: 5,
      courseSlug: 'demo-course-5', courseTitle: 'Demo Course Five: Security Habits',
      title: 'Safe Habits',
      skill: 'Picking the safer choice in everyday security',
      mechanic: 'lane', prop: 'envelope',
      takeaway: 'Small habits stop most attacks: long passphrases, a second sign-in check, a locked screen, prompt updates and a report when something feels off.',
      questions: [
        {prompt: 'Which of these is the strongest password?', options: ['Password123', 'Blue-Kettle-Rain-42', 'Your birthday'], answer: 1, why: 'A long passphrase made of several unrelated words is hard to guess but still easy for you to remember.'},
        {prompt: 'An unexpected email says your account closes today unless you sign in by its link.', options: ['Click the link', 'Report as phishing', 'Forward to friends'], answer: 1, why: 'Pressure plus a sign-in link is a classic phishing sign. Report it, and go to the site yourself if worried.'},
        {prompt: 'What adds a second check, like a code on your phone, when you sign in?', options: ['MFA', 'Cookies', 'Autofill'], answer: 0, why: 'Multi-factor authentication means a stolen password alone is not enough for someone to get in.'},
        {prompt: 'You find a USB stick in the parking lot. What do you do?', options: ['Plug it in to look', 'Hand it to IT', 'Use it for backups'], answer: 1, why: 'Unknown drives can carry malware that runs when plugged in. Give it to IT and never test it yourself.'},
        {prompt: 'You are leaving your desk for lunch. What should you do first?', options: ['Leave it open', 'Turn off the monitor', 'Lock the screen'], answer: 2, why: 'Locking the screen keeps others out while you are away. A dark monitor still leaves your session open.'},
        {prompt: 'A pop-up says your PC is infected and tells you to call a number now.', options: ['Close it, tell IT', 'Call the number', 'Pay for the fix'], answer: 0, why: 'Real security tools never ask you to phone a stranger. It is a scam, so close the window and tell IT.'},
        {prompt: 'Why install software updates soon after they come out?', options: ['They change colors', 'They fix security gaps', 'They free up RAM'], answer: 1, why: 'Updates often patch weaknesses that attackers already know about. Waiting leaves the door open longer.'}
      ]
    }
  ]
};
