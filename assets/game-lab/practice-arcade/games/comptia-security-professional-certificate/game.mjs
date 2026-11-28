// Lockdown: practice breaks for the CompTIA Security+ Professional Certificate.
// Original wording; people and companies are fictional.
export default {
  id: 'comptia-security-professional-certificate',
  title: 'Lockdown',
  tagline: 'Short practice breaks for new security techs on the night shift.',
  role: 'You are the new security tech at Kestrel Freight, locking down its systems one job at a time.',
  program: 'CompTIA Security+ Professional Certificate',
  theme: {world: 'server-room', accent: '#c0392b', mood: 'night'},
  levels: [
    {
      id: 'firewall-checkpoint',
      order: 1,
      courseSlug: 'comptia-security-course-1',
      courseTitle: 'Network Security Fundamentals',
      title: 'Firewall Checkpoint',
      skill: 'Deciding which connections the firewall should let through',
      mechanic: 'gate',
      prop: 'packet',
      scene: 'Kestrel Freight keeps its public website in a DMZ, a buffer zone between the internet and the inside; you judge each connection.',
      takeaway: 'Allow only what a job needs, and block the rest. The public reaches the DMZ, never the inside, and the DMZ gets only narrow paths in.',
      prompt: 'Should this connection be let through?',
      actions: [{id: 'allow', label: 'Allow'}, {id: 'block', label: 'Block'}],
      items: [
        {title: 'Customer opens the shop website', facts: ['From: the internet', 'To: web server in the DMZ', 'Port 443 (HTTPS)'], answer: 'allow', why: 'The DMZ exists so the public can reach the web server. Secure web traffic on port 443 is exactly what that server offers.'},
        {title: 'Outsider reaches for the file server', facts: ['From: the internet', 'To: file server on the internal network'], answer: 'block', why: 'Inside systems are never reached straight from the internet. Outside traffic stops at the DMZ, a buffer zone for public servers.'},
        {title: 'Web server looks up an order', facts: ['From: web server in the DMZ', 'To: order database on the inside', 'Rule: this server, database port only'], answer: 'allow', why: 'The site needs this one database, so a narrow rule allows just this server on just this port. That is least privilege.'},
        {title: 'Web server reaches for the HR share', facts: ['From: web server in the DMZ', 'To: HR file share on the inside', 'The website never uses HR files'], answer: 'block', why: 'A DMZ server gets only what its job needs. If it were hacked, extra paths inside would let the attacker spread.'},
        {title: 'Admin login from unknown address', facts: ['From: an unknown address online', 'To: the web server admin login', 'Policy: admins log in from the office only'], answer: 'block', why: 'Attackers hunt for admin logins facing the internet so they can guess passwords. Policy keeps admin access inside.'},
        {title: 'Email arrives for the company', facts: ['From: the internet', 'To: mail server in the DMZ', 'Port 25 (email delivery)'], answer: 'allow', why: 'The mail server sits in the DMZ to take in mail from outside. Accepting delivery on port 25 is its whole job.'},
        {title: 'Odd traffic on an unused port', facts: ['From: 203.0.113.50', 'To: web server, port 6667', 'No rule matches this traffic'], answer: 'block', why: 'A good firewall ends with a deny-all rule. Anything no rule allows is dropped, so unknown traffic never gets in.'},
        {title: 'Known attack aimed at the website', facts: ['From: 198.51.100.23', 'To: web server, port 443', 'Intrusion prevention: known attack'], answer: 'block', why: 'An IPS (intrusion prevention system) checks traffic against known attack patterns. A match gets dropped, even on an open port.'}
      ]
    },
    {
      id: 'name-the-threat',
      order: 2,
      courseSlug: 'comptia-security-course-2',
      courseTitle: 'Security Threats and Vulnerabilities',
      title: 'Name the Threat',
      skill: 'Connecting common threats to how they work',
      mechanic: 'match',
      prop: 'code-block',
      scene: 'A threat briefing lands on your desk, and before you act you need to know what each threat is.',
      takeaway: 'Name a threat by how it works: how it gets in, how it spreads, and what it does. The right name points to the right response.',
      rounds: [
        {prompt: 'Match each kind of malware to how it behaves.', pairs: [['Trojan', 'Looks useful but hides harmful code'], ['Worm', 'Spreads across networks on its own'], ['Virus', 'Rides inside files, spreads when run'], ['Ransomware', 'Locks your files and demands payment'], ['Spyware', 'Secretly watches you and reports back']], why: 'A disguise means a Trojan. Spreading with no help means a worm. Needing a file to run means a virus. Ransomware and spyware are named for what they do.'},
        {prompt: 'Match each social engineering trick to how it reaches people.', pairs: [['Phishing', 'Fake email sent to many people'], ['Spear phishing', 'Fake email aimed at one named person'], ['Vishing', 'Scam phone call to get your info'], ['Smishing', 'Scam text message with a link'], ['Tailgating', 'Following staff through a locked door']], why: 'Social engineering tricks people, not machines. The name tells you the route: mass email, a personal target, a voice call, a text, or a door.'},
        {prompt: 'Match each threat term to its meaning.', pairs: [['Zero-day', 'A flaw attackers use before any fix'], ['Attack vector', 'The route used, like email or a USB'], ['Threat intelligence', 'Shared news about active attackers'], ['Indicator (IoC)', 'A clue that a system was breached'], ['Backdoor', 'Secret access that skips the login']], why: 'These words help you talk about risk. An IoC (indicator of compromise) is a clue, like a strange outbound connection, that a system was breached.'}
      ]
    },
    {
      id: 'harden-the-fleet',
      order: 3,
      courseSlug: 'comptia-security-course-3',
      courseTitle: 'System Hardening and Endpoint Security',
      title: 'Harden the Fleet',
      skill: 'Putting patching, cleanup and hardening steps in order',
      mechanic: 'order',
      prop: 'clipboard',
      scene: 'Your work list tonight: a missing patch, a laptop with malware, and office PCs that are all set up differently.',
      takeaway: 'Hardening is a routine: change default passwords, turn off what you do not use, test patches, contain malware first, and check that each fix held.',
      rounds: [
        {prompt: 'Servers lack a patch for a flaw attackers are using now. Put the steps in order.', steps: ['Get the patch from the vendor', 'Test it quickly on a test server', 'Install it on the live servers', 'Rescan to confirm it applied', 'Record the fix in the ticket'], why: 'An urgent patch still gets a quick test so it cannot break live servers, then goes out fast. A rescan proves it is really there before you close the job.'},
        {prompt: 'Endpoint protection flags malware on a laptop. Put your response in order.', steps: ['Cut the laptop off the network', 'Capture evidence of what it did', 'Remove it or reimage the laptop', 'Reconnect it and keep watching'], why: 'Cutting the laptop off stops the spread. Save the evidence of what the malware did before you wipe anything, then clean the laptop, and watch it closely once it is back.'},
        {prompt: 'Every office PC should be set up the same secure way. Put the steps in order.', steps: ['List what the PCs are used for', 'Write a baseline: unused services off', 'Push it out with Group Policy', 'Scan PCs to see if they match', 'Fix any PC that drifted'], why: 'You cannot cut what is not needed until you know what the PCs do. Each unused service is one more way in, so the baseline turns them off. Group Policy applies it.'}
      ]
    },
    {
      id: 'key-master',
      order: 4,
      courseSlug: 'comptia-security-course-4',
      courseTitle: 'Cryptography and Secure Communications',
      title: 'Key Master',
      skill: 'Picking the right tool to keep data secret and unchanged',
      mechanic: 'lane',
      prop: 'envelope',
      scene: 'A Kestrel Freight developer asks you to review a new app before launch, and each choice is about keeping its data safe.',
      takeaway: 'Encryption hides data, hashing proves it did not change, and signatures prove who sent it. Use the tool that fits the job.',
      questions: [
        {prompt: 'How should the app store user passwords?', options: ['Plain text', 'Salted slow hash', 'Base64 encoding'], answer: 1, why: 'A slow hash with a random salt makes stolen passwords very hard to crack. Base64 is just a format anyone can undo.'},
        {prompt: 'The login page loads over http://. What fixes it?', options: ['Switch to HTTPS', 'Add login lockout', 'Stronger passwords'], answer: 0, why: 'Plain HTTP sends passwords as readable text. HTTPS uses TLS to encrypt them on the way. Lockouts and stronger passwords do not stop that.'},
        {prompt: 'You need to prove a downloaded file was not changed.', options: ['Check its size', 'Run a virus scan', 'Compare its hash'], answer: 2, why: 'Any edit gives a file a very different hash. A size check or virus scan can miss small edits. A match with the published hash proves it is unchanged.'},
        {prompt: 'You must encrypt a large backup drive quickly. Which kind fits?', options: ['Symmetric', 'Asymmetric', 'Hashing'], answer: 0, why: 'Symmetric encryption uses one key and is fast, so it suits big data. Asymmetric is much slower, and a hash cannot be undone.'},
        {prompt: 'You want to send Dana a file only she can open. Encrypt it with...', options: ['Your public key', "Dana's public key", "Dana's private key"], answer: 1, why: "Anyone may use Dana's public key to lock a file, but only her private key can unlock it. Dana keeps her private key secret."},
        {prompt: 'You want to prove an email came from you and was not altered.', options: ['A hash alone', 'A shared password', 'Digital signature'], answer: 2, why: 'A digital signature is made with your private key. Others check it with your public key, which proves you sent it unchanged.'},
        {prompt: 'Who signs a website certificate to vouch that the site owns its name?', options: ['The site itself', 'A trusted CA', 'The web browser'], answer: 1, why: 'A certificate authority (CA) checks that the owner controls the name, then signs the certificate. Browsers trust certificates signed by known CAs.'},
        {prompt: 'A site shows a padlock and https://. What does that tell you?', options: ['Link is encrypted', 'Site is honest', 'Site is virus-free'], answer: 0, why: 'The padlock only means the connection is encrypted. A scam site can get a certificate too, so still check where you are.'}
      ]
    }
  ]
};
