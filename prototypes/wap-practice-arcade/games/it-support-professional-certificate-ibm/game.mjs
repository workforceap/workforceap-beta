export default {
  id: 'it-support-professional-certificate-ibm',
  title: 'Help Desk Hero',
  tagline: 'Quick practice breaks for new IT support techs.',
  role: 'You are a new Tier 1 tech at Brightline Help Desk, helping users one ticket at a time.',
  program: 'IT Support Professional Certificate (IBM)',
  theme: {world: 'office', accent: '#ad2c4d', mood: 'day'},
  levels: [
    {
      id: 'ticket-triage', order: 1,
      courseSlug: 'it-support-course-1', courseTitle: 'Introduction to Technical Support',
      title: 'Ticket Triage',
      skill: 'Choosing the right next step for a help desk ticket',
      mechanic: 'gate', prop: 'ticket',
      scene: 'It is your first morning at Brightline. Tickets are landing in your queue, and each one needs a next step.',
      takeaway: 'Define the problem first. Fix what is clear and routine. Escalate when a fix keeps failing or the cause is out of your reach.',
      prompt: 'What is the best next step for this ticket?',
      actions: [{id: 'ask', label: 'Ask questions'}, {id: 'fix', label: 'Try a fix'}, {id: 'escalate', label: 'Escalate'}],
      items: [
        {title: 'My email is not working', facts: ['No error message was given', 'Not clear which part fails', 'No time given for when it stopped'], answer: 'ask', why: 'A vague report could mean many problems. Ask what happens, what the error says and when it last worked before you try anything.'},
        {title: 'Account locked after bad tries', facts: ['Too many wrong passwords locked it', 'Caller identity is confirmed', 'Unlocking is a standard Tier 1 task'], answer: 'fix', why: 'The cause is known and the fix is routine. Unlock the account and note it in the ticket. More questions or an escalation would waste time.'},
        {title: 'Printer jam, fourth time this month', facts: ['Closed as fixed three times', 'Each fix lasted only a few days', 'Nobody has found the cause'], answer: 'escalate', why: 'Repeat tickets mean earlier fixes treated the symptom. Escalate means pass it to Tier 2, the senior techs, so they can find the root cause.'},
        {title: 'Blank screen on a laptop', facts: ['User did not say if the power light is on', 'Not clear if an external monitor is used', 'No error was mentioned'], answer: 'ask', why: 'The report leaves out the clues that tell causes apart. Ask about the power light and the monitor before you try a fix.'},
        {title: 'Whole floor cannot sign in', facts: ['Forty users affected at once', 'Started ten minutes ago', 'Error says the sign-in service is down'], answer: 'escalate', why: 'Many users failing at once points to a shared system, not one computer. Escalate now with these facts so Tier 2 can act.'},
        {title: 'Mouse pointer will not move', facts: ['Wireless mouse', 'Its battery light is off', 'Spare batteries are on the desk'], answer: 'fix', why: 'The cause is plain: dead batteries. Swap them in and check that the pointer moves. That is faster than asking more questions.'}
      ]
    },
    {
      id: 'parts-and-tools', order: 2,
      courseSlug: 'it-support-course-2', courseTitle: 'Introduction to Hardware and Operating Systems',
      title: 'Parts and Tools',
      skill: 'Matching computer parts and Windows tools to the problem',
      mechanic: 'lane', prop: 'chip',
      scene: 'A user at the front desk says a Windows PC is slow and noisy. You check the parts and tools you know.',
      takeaway: 'Know what each part does. Full memory points to RAM, heat points to cooling, and Task Manager shows what is running.',
      questions: [
        {prompt: 'Which one of these is an operating system?', options: ['Excel', 'Notepad', 'Windows'], answer: 2, why: 'Windows is an operating system. It manages the hardware and runs apps. Excel and Notepad are apps that run on top of it.'},
        {prompt: 'Which part runs the instructions that programs give the computer?', options: ['The CPU', 'The power supply', 'The case fan'], answer: 0, why: 'The CPU is the processor. It carries out program instructions, so people often call it the brain of the computer.'},
        {prompt: 'Which part keeps your files when the power is off?', options: ['RAM', 'A storage drive', 'The CPU'], answer: 1, why: 'A storage drive keeps files with no power. RAM is the short-term memory a PC uses while it works, and it is cleared at shutdown.'},
        {prompt: 'You want to see which apps use the most memory.', options: ['Disk Cleanup', 'Device Manager', 'Task Manager'], answer: 2, why: 'Task Manager lists running apps and shows how much memory and processor time each one uses.'},
        {prompt: 'Memory stays nearly full and the PC is slow. What fixes the cause?', options: ['Adding more RAM', 'A new network card', 'A louder fan'], answer: 0, why: 'When RAM is full, Windows slows down. More RAM gives programs room to work. Closing apps only helps for a while.'},
        {prompt: 'A laptop is hot and loud, and its vents are packed with dust. What first?', options: ['Reinstall Windows', 'Add more RAM', 'Clean the vents'], answer: 2, why: 'Dust blocks airflow, so the fan cannot cool the laptop. Cleaning the vents removes the cause. Software and memory are not the problem.'},
        {prompt: 'A PC shows a blue screen about memory twice this week. What do you test first?', options: ['The power supply', 'The RAM', 'The network card'], answer: 1, why: 'A memory management blue screen often means faulty memory. Windows Memory Diagnostic can test the RAM before you replace anything.'}
      ]
    },
    {
      id: 'isolate-and-query', order: 3,
      courseSlug: 'it-support-course-3', courseTitle: 'Introduction to Software, Programming, and Databases',
      title: 'Isolate and Query',
      skill: 'Isolating an app problem and reading a simple SQL query',
      mechanic: 'order', prop: 'database-cylinder',
      scene: 'An HR app crashes for one person on the team. You narrow it down, then check the data it uses.',
      takeaway: 'Change one thing at a time to find where a problem lives.',
      rounds: [
        {prompt: 'An app crashes for one user only. Put the isolating steps in order.', steps: ['Get the error and when it happens', 'Sign in as the user on a working PC', 'See if the crash follows the account', "Fix the account or the user's PC", 'Have the user retry the task'], why: 'Learn the exact error first. Then sign in as the user on a PC that works. If the crash follows the account, fix the account. If not, fix their PC. Then confirm.'},
        {prompt: 'Put the parts of this SQL query in the order SQL expects.', steps: ['select name, city', 'from customers', "where city = 'Lakeview'", 'order by name'], why: 'A column is a field to show. A row is one record. The query reads in that order: columns, table, rows to keep, then the sort.'}
      ]
    },
    {
      id: 'sort-the-network', order: 4,
      courseSlug: 'it-support-course-4', courseTitle: 'Introduction to Networking and Storage',
      title: 'Sort the Network',
      skill: 'Telling network types, cables, drives and addresses apart',
      mechanic: 'sort', prop: 'packet',
      scene: 'Five people cannot reach the shared drive. First you sort out the basic network and storage terms.',
      takeaway: 'Name the piece before you troubleshoot it. Networks have a size, cables carry data, drives store it, and addresses say who is who.',
      prompt: 'Which group does this belong to?',
      bins: [{id: 'network', label: 'Network type'}, {id: 'cable', label: 'Cable'}, {id: 'storage', label: 'Storage drive'}, {id: 'address', label: 'Address'}],
      items: [
        {label: 'LAN', note: 'Connects devices in one office', answer: 'network', why: 'A local area network covers a small place such as one office or building.'},
        {label: 'SSD', note: 'No moving parts inside', answer: 'storage', why: 'A solid-state drive stores files on memory chips. It has no spinning parts, so it is fast and quiet.'},
        {label: 'Twisted-pair cable', note: 'Pairs of copper wires', answer: 'cable', why: 'Twisted-pair copper cable is the common cable behind office network ports.'},
        {label: 'MAC address', note: 'Built into the network card', answer: 'address', why: 'A MAC address is a hardware address set on a network card. It names that one device on the local network.'},
        {label: 'HDD', note: 'Has spinning platters', answer: 'storage', why: 'A hard disk drive stores files on spinning platters. It keeps data with the power off, like an SSD, but it is slower.'},
        {label: 'IP address: 203.0.113.25', answer: 'address', why: 'An IP address identifies a device on a network so data knows where to go.'},
        {label: 'WAN', note: 'Links sites far apart', answer: 'network', why: 'A wide area network joins faraway sites, such as offices in different cities.'},
        {label: 'Fiber-optic', note: 'Sends data as pulses of light', answer: 'cable', why: 'Fiber-optic cable carries data as light through thin glass strands, which works well over long runs.'}
      ]
    },
    {
      id: 'spot-the-risk', order: 5,
      courseSlug: 'it-support-course-5', courseTitle: 'Introduction to Cybersecurity Essentials',
      title: 'Spot the Risk',
      skill: 'Responding safely to security requests at the help desk',
      mechanic: 'gate', prop: 'envelope',
      scene: 'The phone and chat are busy. Some requests are routine, and some are traps that need a careful answer.',
      takeaway: 'Never give out or reset a password on someone else\'s word. If credentials or data may be exposed, stop the damage first and report it.',
      prompt: 'What is the safest response?',
      actions: [{id: 'contain', label: 'Stop the damage'}, {id: 'refuse', label: 'Refuse'}, {id: 'help', label: 'Help normally'}],
      items: [
        {title: 'Password typed on a fake page', facts: ['Link came in an email from "IT"', 'User typed the password, then felt unsure', 'Account is still active'], answer: 'contain', why: 'The attacker may already have a working password. Reset or disable the account first, then report the email to security.'},
        {title: 'Caller wants a user password', facts: ['Says they are from IT Security', 'Knows the employee ID and manager name', 'Wants the password to verify the account'], answer: 'refuse', why: 'Real IT staff never ask for a password. An ID and a manager name are easy to find, so they prove nothing. Refuse and report the call.'},
        {title: 'User wants to change own password', facts: ['User is signed in on their own PC', 'Identity is not in doubt', 'Policy lets users change their own'], answer: 'help', why: 'The owner is asking about their own account, and policy allows it. Show them how to pick a long, unique password and change it.'},
        {title: 'Laptop lost on a trip', facts: ['Disk was not encrypted', 'Holds customer contracts', 'User left it in a taxi'], answer: 'contain', why: 'An unencrypted laptop with customer data is a possible breach. Wipe it remotely if you can, reset the account and tell security.'},
        {title: 'Chat asks you to reset a password', facts: ['A coworker asks for someone else\'s account', 'The account owner has not asked', 'No ID check was done'], answer: 'refuse', why: 'A reset needs proof that the account owner is asking. Do not act on a third party\'s word. Ask the owner to contact you.'},
        {title: 'Unexpected attachment was opened', facts: ['File came from an unknown sender', 'Antivirus showed a warning', 'Laptop is on the office network'], answer: 'contain', why: 'A possible infection can spread over the network. Disconnect the laptop, then report it so security can scan and clean it.'},
        {title: 'Help turning on two-step sign-in', facts: ['Company policy offers it', 'User asks for setup steps'], answer: 'help', why: 'Two-step sign-in adds a second proof, so a stolen password alone is not enough. Walk the user through the setup.'}
      ]
    },
    {
      id: 'cloud-match-up', order: 6,
      courseSlug: 'it-support-course-6', courseTitle: 'Introduction to Cloud Computing',
      title: 'Cloud Match-Up',
      skill: 'Connecting cloud terms to what they mean and who handles what',
      mechanic: 'match', prop: 'cloud-node',
      scene: 'A department manager asks you to explain cloud services in plain words. You get your terms straight first.',
      takeaway: 'Pick the cloud model by how much you want to manage. With any model, you still decide who may see your data and keep a backup.',
      rounds: [
        {prompt: 'Match each cloud term to its meaning.', pairs: [['IaaS', 'Rented servers you set up yourself'], ['PaaS', 'A platform to run your own app'], ['SaaS', 'A finished app you sign in to'], ['Hybrid cloud', 'Public and private cloud used together']], why: 'IaaS gives you the machines, PaaS gives you a place to run code, and SaaS gives you the whole app. Hybrid mixes two kinds of cloud.'},
        {prompt: 'Match each cloud term to what it means.', pairs: [['Provider', 'Keeps the data center hardware running'], ['Customer', 'Sets file access and plans backups'], ['Public cloud', 'Cloud services shared by many customers'], ['Private cloud', 'Cloud used by only one organization']], why: 'The provider runs the hardware. The customer sets access and plans backups. A public cloud is shared by many customers, and a private cloud is not.'},
        {prompt: 'Match each need to the best cloud model.', pairs: [['Cloud email', 'SaaS'], ['Run code, no servers', 'PaaS'], ['Full OS control', 'IaaS'], ['Servers on site', 'On-premises']], why: 'A ready-made app fits SaaS. Running your code without managing servers fits PaaS. Full OS control needs IaaS. Your own hardware on site is on-premises.'}
      ]
    },
    {
      id: 'case-closed', order: 7,
      courseSlug: 'it-support-course-7', courseTitle: 'Technical Support Case Studies and Capstone Project',
      title: 'Case Closed',
      skill: 'Reviewing earlier courses on a real case, from call to close',
      mechanic: 'order', prop: 'folder',
      scene: 'You have a tough case on your desk. Use what you learned in every course, from the first check to the final notes.',
      takeaway: 'Review what you know: scope the problem, contain security risks fast, and write it down so the next tech solves it faster.',
      rounds: [
        {prompt: 'Five users cannot open the shared drive, but one coworker can. Work the case.', steps: ['List which users cannot connect', 'Compare them with the working user', 'Find the rule blocking their segment', 'Fix the rule and test the drive', 'Record the cause in the ticket'], why: 'Scope the problem, compare with a user who works, find what differs, fix and test it, then write it down so the next tech is faster.'},
        {prompt: 'A user typed a password on a fake page. Contain the risk.', steps: ['Confirm the user typed the password', 'Reset the password at once', 'Sign out all open sessions', 'Have the user sign in again'], why: 'Reset first so the stolen password stops working. Then end old sessions so the attacker is kicked out, and have the user sign in with the new password.'},
        {prompt: 'You solved a tough case. Wrap it up well.', steps: ['Confirm the root cause', 'Roll out the lasting fix', 'Check with the user it holds', 'Write a knowledge base article', 'Close the ticket'], why: 'The article should describe a fix that is proven, so write it after the user confirms. Close the ticket last, once everything is recorded.'}
      ]
    }
  ]
};
