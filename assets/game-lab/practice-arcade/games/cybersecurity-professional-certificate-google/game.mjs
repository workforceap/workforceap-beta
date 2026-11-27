// Breach Watch: practice breaks for the Networking and Cybersecurity Professional Certificate.
// One level per course, in course order. Original wording; people, companies and addresses are fictional.
export default {
  id: 'cybersecurity-professional-certificate-google',
  title: 'Breach Watch',
  tagline: 'Night-shift practice breaks for new security analysts.',
  role: 'You are the night-shift security analyst at Harborview Logistics, reading alerts and deciding what to do.',
  program: 'Networking and Cybersecurity Professional Certificate (Net+, Sec+)',
  theme: {world: 'server-room', accent: '#1c7fa6', mood: 'night'},
  levels: [
    {
      id: 'cia-check',
      order: 1,
      courseSlug: 'cybersecurity-course-1',
      courseTitle: 'Foundations of Cybersecurity',
      title: 'CIA Check',
      skill: 'Spotting which part of the CIA triad an incident harms',
      mechanic: 'sort',
      prop: 'folder',
      scene: 'Your first night shift starts. Your lead hands you a stack of old incident notes to sort.',
      takeaway: 'Confidentiality keeps data private, integrity keeps it accurate, and availability keeps it reachable when people need it.',
      prompt: 'Which part of the CIA triad did this incident harm?',
      bins: [
        {id: 'conf', label: 'Confidentiality'},
        {id: 'integ', label: 'Integrity'},
        {id: 'avail', label: 'Availability'}
      ],
      items: [
        {label: 'Pay file emailed to wrong vendor', note: 'It held staff bank details', answer: 'conf', why: 'Private data reached someone who should not see it. Keeping data away from the wrong people is confidentiality.'},
        {label: 'Visitor photographs a screen', note: 'The screen showed customer names', answer: 'conf', why: 'Someone without permission now has private information. That is a loss of confidentiality, even though nothing changed.'},
        {label: 'Password list posted online', note: 'Stolen from the staff portal', answer: 'conf', why: 'Secret login data is now public. Exposing secrets breaks confidentiality.'},
        {label: 'Insider raises an invoice total', note: 'Changed from 500 to 5,000', answer: 'integ', why: 'The data is still there, but it is no longer accurate. Unapproved changes to data harm integrity.'},
        {label: 'Attacker edits shop prices', note: 'Every item now costs 1 cent', answer: 'integ', why: 'The site still works and nothing secret leaked, but the data was changed without permission. That is integrity.'},
        {label: 'Log entries edited to hide tracks', answer: 'integ', why: 'Logs only help if you can trust them. Changing them without permission breaks their integrity.'},
        {label: 'Ransomware locks shipping records', note: 'Files encrypted, none copied out', answer: 'avail', why: 'Staff cannot open the records they need to ship orders. When authorized people cannot reach data, availability is harmed.'},
        {label: 'Traffic flood takes site offline', answer: 'avail', why: 'Customers cannot reach the site at all. A flood of traffic that knocks a service down attacks availability.'},
        {label: 'Power cut stops the server room', note: 'No backup power was set up', answer: 'avail', why: 'Nothing was stolen or changed, but no one can use the systems. That is a loss of availability.'}
      ]
    },
    {
      id: 'risk-playbook',
      order: 2,
      courseSlug: 'cybersecurity-course-2',
      courseTitle: 'Play It Safe: Manage Security Risks',
      title: 'Risk Playbook',
      skill: 'Connecting framework and control terms to what they mean',
      mechanic: 'match',
      prop: 'clipboard',
      scene: 'An audit is coming. Your lead wants you to know the words in the security plan before the auditors ask.',
      takeaway: 'Frameworks give the plan and controls do the work. A SIEM shows you what is happening, and a playbook tells you what to do about it.',
      rounds: [
        {prompt: 'Match each NIST Cybersecurity Framework function to what it covers.', pairs: [['Identify', 'Know your assets and their risks'], ['Protect', 'Put safeguards in place'], ['Detect', 'Notice security events when they happen'], ['Respond', 'Take action on a detected incident'], ['Recover', 'Get normal operations back afterward']], why: 'These functions follow the life of a risk: know what you have, guard it, notice trouble, act on it, then restore what was hurt.'},
        {prompt: 'Match each type of security control to its job.', pairs: [['Preventive', 'Stops an incident before it happens'], ['Detective', 'Finds an incident while it happens'], ['Corrective', 'Fixes the damage after an incident'], ['Deterrent', 'Makes an attacker not want to try']], why: 'A lock prevents, an alarm detects, a patch that fixes the hole corrects, and a warning sign deters. Good plans mix all four.'},
        {prompt: 'Match each security term to its meaning.', pairs: [['SIEM', 'Gathers and reviews logs in one place'], ['Playbook', 'Step-by-step guide for one incident type'], ['Least privilege', 'Only the access a job really needs'], ['Risk', 'Likelihood of harm times its impact']], why: 'Risk tells you what to fix first, a SIEM helps you see events, a playbook tells you what to do, and least privilege limits damage.'}
      ]
    },
    {
      id: 'firewall-watch',
      order: 3,
      courseSlug: 'cybersecurity-course-3',
      courseTitle: 'Connect and Protect: Networks and Network Security',
      title: 'Firewall Watch',
      skill: 'Deciding what to do with network traffic at the firewall',
      mechanic: 'gate',
      prop: 'packet',
      scene: 'It is 2 AM. Traffic is crossing the Harborview firewall, and the rule check lands on your screen.',
      takeaway: 'Allow traffic with a business need, block what breaks the rules, and escalate anything that hints a machine inside is already hacked.',
      prompt: 'Allow it, block it, or escalate a possible break-in?',
      actions: [
        {id: 'allow', label: 'Allow'},
        {id: 'block', label: 'Block'},
        {id: 'escalate', label: 'Escalate'}
      ],
      items: [
        {title: 'HTTPS to the public web shop', facts: ['From the internet to 203.0.113.10', 'Port 443, the shop\'s public website'], answer: 'allow', why: 'A public shop has to accept secure web traffic from customers. HTTPS on port 443 to the shop is the business working as planned.'},
        {title: 'Name lookup from an office PC', facts: ['To internal DNS server 192.0.2.53', 'Port 53, a normal name lookup'], answer: 'allow', why: 'Computers use DNS to turn names into addresses. A lookup to the company\'s own DNS server is everyday traffic.'},
        {title: 'Staff member joins the VPN', facts: ['To the company VPN gateway', 'Password and two-step login check passed'], answer: 'allow', why: 'The VPN is the approved way to work from outside, and this person proved who they are. Let it through.'},
        {title: 'Telnet login to a router', facts: ['From the internet, port 23', 'Telnet sends passwords as plain text'], answer: 'block', why: 'Telnet is not encrypted, so anyone watching can read the password. Outside Telnet to a router should never be allowed.'},
        {title: 'Remote desktop to a staff PC', facts: ['From the internet, port 3389', 'Rule: remote desktop only over the VPN'], answer: 'block', why: 'Remote desktop open to the internet is a common way in for attackers. The rule says VPN only, so block it.'},
        {title: 'Inbound from a blocklisted address', facts: ['From 198.51.100.66 to the web shop', 'Address is on the threat blocklist'], answer: 'block', why: 'The address is known to be bad and it is still outside. Blocking it at the edge stops it before it reaches anything.'},
        {title: 'Server calls a known malware host', facts: ['Outbound from the file server', 'To an address known to control malware'], answer: 'escalate', why: 'A server reaching out to a malware control host is likely infected already. Blocking is not enough; incident response must check it.'},
        {title: 'Office PC probes hundreds of ports', facts: ['From 192.0.2.44 to other office PCs', 'IT has no scan scheduled tonight'], answer: 'escalate', why: 'An inside PC scanning its neighbors suggests an attacker is already in and looking around. Escalate so the PC can be checked.'}
      ]
    },
    {
      id: 'command-line-run',
      order: 4,
      courseSlug: 'cybersecurity-course-4',
      courseTitle: 'Tools of the Trade: Linux and SQL',
      title: 'Command Line Run',
      skill: 'Picking the right Linux command or SQL clause for a task',
      mechanic: 'lane',
      prop: 'code-block',
      scene: 'A login alert needs a closer look. You open a Linux terminal and the access log database.',
      takeaway: 'A few Linux commands and SQL clauses go a long way: find the right file, search it, check permissions, and filter the rows you need.',
      questions: [
        {prompt: 'In Linux, show which folder you are in right now.', options: ['pwd', 'ls', 'rm'], answer: 0, why: 'pwd means print working directory. It shows the full path of the folder you are in.'},
        {prompt: 'Search the file auth.log for lines with the word "failed".', options: ['cat', 'grep', 'mkdir'], answer: 1, why: 'grep searches text and prints only the lines that match. cat would print the whole file.'},
        {prompt: 'Change the read, write and run permissions on a file.', options: ['ls', 'cd', 'chmod'], answer: 2, why: 'chmod changes a file\'s permissions. ls can show permissions but cannot change them.'},
        {prompt: 'Move into the /var/log folder.', options: ['cd /var/log', 'pwd /var/log', 'grep /var/log'], answer: 0, why: 'cd means change directory. It moves you into the folder you name.'},
        {prompt: 'A file shows -rwxr-x---. What can its group do?', options: ['Read and write', 'Read and execute', 'Nothing at all'], answer: 1, why: 'After the first dash, the letters come in three sets: owner, group, other. The group set is r-x, so read and execute but no write.'},
        {prompt: 'In SQL, keep only rows where status is \'failed\'.', options: ['order by', 'from', 'where'], answer: 2, why: 'A where clause filters rows so only the ones that meet your condition come back.'},
        {prompt: 'In SQL, sort the login rows by time, newest first.', options: ['order by time desc', 'order by time asc', 'group by time'], answer: 0, why: 'order by sorts the results. desc means descending, so the latest times come first; asc would put the oldest first.'},
        {prompt: 'In SQL, link a logins table to an employees table by employee ID.', options: ['where', 'join', 'limit'], answer: 1, why: 'A join links two tables on a shared column, such as an employee ID, so you see both in one result.'}
      ]
    },
    {
      id: 'know-the-pieces',
      order: 5,
      courseSlug: 'cybersecurity-course-5',
      courseTitle: 'Assets, Threats, and Vulnerabilities',
      title: 'Know the Pieces',
      skill: 'Telling assets, threats and vulnerabilities apart',
      mechanic: 'sort',
      prop: 'block',
      scene: 'Harborview is planning its online store growth. You are building the list of what to protect and from what.',
      takeaway: 'An asset is what you protect, a threat is what could harm it, and a vulnerability is the weakness a threat could use.',
      prompt: 'Is this an asset, a threat, or a vulnerability?',
      bins: [
        {id: 'asset', label: 'Asset'},
        {id: 'threat', label: 'Threat'},
        {id: 'vuln', label: 'Vulnerability'}
      ],
      items: [
        {label: 'Customer payment database', prop: 'database-cylinder', answer: 'asset', why: 'It holds valuable, private data the company must protect. Anything of value to the business is an asset.'},
        {label: 'Employee laptops', prop: 'chip', answer: 'asset', why: 'Laptops are equipment the company owns and relies on, and they hold company data. That makes them assets.'},
        {label: 'Source code for the store app', prop: 'code-block', answer: 'asset', why: 'The code took time and money to build and could be stolen or changed. Valuable information is an asset too.'},
        {label: 'Crime group sending phishing', answer: 'threat', why: 'A group trying to trick staff is something that could cause harm. People or events that could cause harm are threats.'},
        {label: 'River flood near the data center', answer: 'threat', why: 'Threats are not only people. A natural event that could damage systems is also a threat.'},
        {label: 'Former worker seeking revenge', note: 'Left angry and made threats last week', answer: 'threat', why: 'A person who might choose to cause harm is a threat. A weakness they could use, like an old password, would be the vulnerability.'},
        {label: 'Missing security patches', note: 'On the public web server', answer: 'vuln', why: 'A missing patch is a known weakness an attacker could use. Weaknesses are vulnerabilities, not threats.'},
        {label: 'Default admin password unchanged', answer: 'vuln', why: 'Default passwords are easy to look up. Leaving one in place is a weakness waiting to be used.'},
        {label: 'Staff never trained on phishing', answer: 'vuln', why: 'People who do not know the warning signs are easier to trick. A gap in training is a vulnerability.'},
        {label: 'Server room door left unlocked', answer: 'vuln', why: 'The open door is a weakness that lets a threat walk in. Physical gaps count as vulnerabilities too.'}
      ]
    },
    {
      id: 'incident-drill',
      order: 6,
      courseSlug: 'cybersecurity-course-6',
      courseTitle: 'Sound the Alarm: Detection and Response',
      title: 'Incident Drill',
      skill: 'Putting incident response steps in the right order',
      mechanic: 'order',
      prop: 'clipboard',
      scene: 'The SIEM lights up with a malware alert on a warehouse PC. Time to work the response in order.',
      takeaway: 'Check first, contain before you clean, save evidence before you wipe, and always finish by recording what you learned.',
      rounds: [
        {prompt: 'Put the incident response life cycle in order.', steps: ['Prepare plans, people and tools', 'Detect and analyze the event', 'Contain the incident', 'Remove the threat and recover', 'Review lessons learned'], why: 'You prepare before anything happens, confirm the event, stop it spreading, remove the cause and restore service, then learn from it.'},
        {prompt: 'A PC has malware. Put the response steps in order.', steps: ['Confirm the alert is real', 'Cut the PC off the network', 'Make a forensic copy of the drive', 'Wipe and reinstall the system', 'Give the clean PC back'], why: 'Confirm before acting, isolate so it cannot spread, and copy the drive before wiping, because wiping destroys the evidence.'},
        {prompt: 'Triage a new SIEM alert. Put the steps in order.', steps: ['Read the alert and its details', 'Search logs for related events', 'Decide: real incident or false alarm', 'Record the verdict in the ticket'], why: 'Start with what the alert says, gather more evidence, make the call based on that evidence, then write the call down.'}
      ]
    },
    {
      id: 'script-sprint',
      order: 7,
      courseSlug: 'cybersecurity-course-7',
      courseTitle: 'Automate Cybersecurity Tasks with Python',
      title: 'Script Sprint',
      skill: 'Choosing the Python tool that fits a log-checking task',
      mechanic: 'lane',
      prop: 'code-block',
      scene: 'Reading firewall logs by hand takes all night. You start a Python script to flag busy IP addresses.',
      takeaway: 'Loops repeat work, if statements make decisions, dictionaries count things, and regular expressions find patterns in text.',
      questions: [
        {prompt: 'Run the same check on every line of a log file.', options: ['for loop', 'if statement', 'print()'], answer: 0, why: 'A for loop repeats the same code for each item, so it can visit every line in turn.'},
        {prompt: 'Flag an IP address only when it has over 100 attempts.', options: ['for loop', 'if statement', 'import'], answer: 1, why: 'An if statement runs code only when a condition is true, such as a count above 100.'},
        {prompt: 'Keep a count of attempts for each IP address.', options: ['string', 'boolean', 'dictionary'], answer: 2, why: 'A dictionary stores key and value pairs, so each IP can be a key with its count as the value.'},
        {prompt: 'Pull every IP-shaped piece of text out of a line.', options: ['re.findall()', 'len()', 'print()'], answer: 0, why: 're.findall() uses a regular expression, a text pattern, and returns every match it finds.'},
        {prompt: 'Open a log file so it closes by itself when you are done.', options: ['input()', 'with open()', 'type()'], answer: 1, why: 'A with block closes the file for you when the block ends, even if an error happens.'},
        {prompt: 'Split the text "user,ip,time" into three parts.', options: ['.upper()', '.strip()', '.split(",")'], answer: 2, why: 'split() cuts a string wherever it finds the given character and returns a list of the pieces.'},
        {prompt: 'Turn the text "42" into a number you can compare.', options: ['str()', 'int()', 'len()'], answer: 1, why: 'int() converts text made of digits into a whole number, so you can compare it with 100.'},
        {prompt: 'Wrap code in a named block you can reuse.', options: ['import', 'if', 'def'], answer: 2, why: 'def defines a function. You give it a name and can call it again whenever you need it.'}
      ]
    },
    {
      id: 'shift-handoff',
      order: 8,
      courseSlug: 'cybersecurity-course-8',
      courseTitle: 'Put It to Work: Prepare for Cybersecurity Jobs',
      title: 'Shift Handoff',
      skill: 'Deciding which alerts to close, handle, or escalate',
      mechanic: 'gate',
      prop: 'ticket',
      scene: 'Your last hour on shift. The alert queue is full, and the incident lead is on call if you need them.',
      takeaway: 'Close what the evidence shows is normal, handle what your playbook covers, and escalate anything that touches sensitive data or key systems.',
      prompt: 'False alarm, handle it with the playbook, or escalate to the lead?',
      actions: [
        {id: 'close', label: 'False alarm'},
        {id: 'handle', label: 'Handle it'},
        {id: 'escalate', label: 'Escalate'}
      ],
      items: [
        {title: 'Traffic spike to the backup server', facts: ['Every night at 2 AM, same size', 'Matches the scheduled nightly backup'], answer: 'close', why: 'The traffic matches a known, scheduled job, night after night. Note it and close the alert as normal activity.'},
        {title: 'Port scan from 192.0.2.15', facts: ['Source is the IT team\'s scanner', 'Runs every Monday night, as scheduled'], answer: 'close', why: 'The scan is approved and confirmed by its owner. It is expected activity, so close it and note who confirmed it.'},
        {title: 'Login from a new laptop', facts: ['Employee got a new laptop today', 'They confirmed the login by phone'], answer: 'close', why: 'The new device explains the alert and the person confirmed it was them. There is nothing harmful to act on.'},
        {title: 'Phishing email reported by staff', facts: ['Logs show no one clicked the link', 'Playbook: analyst removes it and blocks sender'], answer: 'handle', why: 'Nobody was caught and your playbook covers this case. Remove the email, block the sender, and record it.'},
        {title: 'Missing patch on a test laptop', facts: ['No company data on the laptop', 'Playbook: analyst opens a patch ticket'], answer: 'handle', why: 'This is a low risk weakness with a clear routine step. Open the patch ticket yourself and move on.'},
        {title: 'Malware found on the HR file server', facts: ['Antivirus could not remove it', 'Server holds staff personal records'], answer: 'escalate', why: 'Active malware on a server with personal data is a serious incident. Escalate so the lead can start a full response.'},
        {title: 'Admin login from two countries', facts: ['Two logins 15 minutes apart', 'Account has full admin rights'], answer: 'escalate', why: 'Two countries 15 minutes apart is impossible travel for one person. It may be a stolen login on an admin account, so the lead should check now.'},
        {title: 'Customer data sent to unknown site', facts: ['Large upload from the order database', 'Destination is not a known partner'], answer: 'escalate', why: 'This looks like data theft from a key system. Escalate at once so the lead can contain it and judge the impact.'}
      ]
    }
  ]
};
