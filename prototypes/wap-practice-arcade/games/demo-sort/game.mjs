// Demo game for the 'sort' mechanic: four sort levels of beginner IT content. The validator's variety rule needs
// two mechanics for a 4-5 level game, so level 1 is a gentle 'gate' practice round. Not tied to a real program pack;
// course slugs and titles are fictional. Original wording; people and companies are fictional.
export default {
  id: 'demo-sort',
  title: 'Sort It Out',
  tagline: 'Quick sorting practice for people new to IT.',
  role: 'You are a new IT helper at Maple Row Community Center, putting tech things where they belong.',
  program: 'Demo: IT Basics',
  theme: {world: 'office', accent: '#2b7bb9', mood: 'day'},
  levels: [
    {
      id: 'safe-or-report',
      order: 1,
      courseSlug: 'demo-it-basics-1',
      courseTitle: 'Staying Safe Online',
      title: 'Open or Report?',
      skill: 'Spotting emails that are safe to open and ones to report',
      mechanic: 'gate',
      prop: 'envelope',
      takeaway: 'Slow down when an email pushes you to hurry, asks for a password, or comes from an address that is almost right. Report it instead of clicking.',
      prompt: 'Is this email safe to open, or should you report it?',
      actions: [
        {id: 'open', label: 'Safe to open'},
        {id: 'report', label: 'Report it'}
      ],
      items: [
        {title: 'Staff meeting moved to Thursday', facts: ['From: your manager, Priya Shah', 'Sent from the usual work address', 'No links or attachments'], answer: 'open', why: 'A routine note from a known sender at the right address, with nothing to click, is safe to read.'},
        {title: 'Your mailbox will be deleted today', facts: ['From: it-support@maple-row-helpdesk.test', 'Says "click in 1 hour", asks for your password', 'Real center mail ends in @maple-row.test'], answer: 'report', why: 'Hurry, a password request and an address that is almost right (it adds "-helpdesk" to maple-row.test) are phishing signs. Report it.'},
        {title: 'Lunch menu for next week', facts: ['From: the front desk, Leo Brandt', 'Menu pasted in the email body', 'Sent to the whole staff list'], answer: 'open', why: 'A coworker sharing plain text with the usual group is ordinary office mail. Nothing in it asks you to act fast.'},
        {title: 'You won a gift card', facts: ['From an address you have never seen', 'Asks for your bank details to pay a fee', 'You did not enter any contest'], answer: 'report', why: 'Prizes you never entered for, plus a request for bank details, mean a scam. Report it and delete it.'},
        {title: 'Invoice attached, please pay', facts: ['From: billing@supplies-help.test', 'Center has never used this supplier', 'Attachment is a .zip file'], answer: 'report', why: 'An unknown sender pushing a bill with a zipped attachment may hide harmful software. Report it, do not open the file.'},
        {title: 'Your volunteer schedule', facts: ['From: volunteers@maple-row.test', 'Same address as every month', 'Lists your shifts in the email'], answer: 'open', why: 'A familiar sender at the real address with your expected schedule is safe. No link or password is involved.'}
      ]
    },
    {
      id: 'computer-parts',
      order: 2,
      courseSlug: 'demo-it-basics-2',
      courseTitle: 'Inside a Computer',
      title: 'Parts of a Computer',
      skill: 'Sorting computer parts by the job they do',
      mechanic: 'sort',
      prop: 'chip',
      takeaway: 'Every part has one main job: input brings data in, output shows it, storage keeps it, and the processor works on it.',
      prompt: 'What job does this part do?',
      bins: [
        {id: 'input', label: 'Input'},
        {id: 'output', label: 'Output'},
        {id: 'storage', label: 'Storage'},
        {id: 'process', label: 'Processing'}
      ],
      items: [
        {label: 'Keyboard', answer: 'input', why: 'You type on a keyboard to send letters and commands into the computer, so it is an input device.', prop: 'crate'},
        {label: 'Webcam', note: 'Used for video calls', answer: 'input', why: 'A webcam captures video and sends it into the computer. Anything that brings data in is input.', prop: 'crate'},
        {label: 'Monitor', answer: 'output', why: 'A monitor shows you what the computer produces, so it is an output device.', prop: 'wireframe-card'},
        {label: 'Printer', answer: 'output', why: 'A printer takes data from the computer and puts it on paper. That is output.', prop: 'crate'},
        {label: 'Speakers', answer: 'output', why: 'Speakers turn the computer\'s sound data into sound you can hear, which makes them output.', prop: 'megaphone'},
        {label: 'Solid-state drive (SSD)', note: 'Keeps files when power is off', answer: 'storage', why: 'An SSD holds your files and programs even when the computer is off. That is storage.', prop: 'database-cylinder'},
        {label: 'USB flash drive', answer: 'storage', why: 'A flash drive saves files you can carry to another computer, so it is storage.', prop: 'crate'},
        {label: 'CPU', note: 'Central processing unit', answer: 'process', why: 'The CPU follows program instructions and does the calculations. It is the main processing part.', prop: 'chip'},
        {label: 'Graphics processor (GPU)', note: 'Builds the images for the screen', answer: 'process', why: 'A GPU does the math that builds each picture. The monitor only shows the result, so the GPU is processing.', prop: 'chip'}
      ]
    },
    {
      id: 'file-types',
      order: 3,
      courseSlug: 'demo-it-basics-3',
      courseTitle: 'Files and Folders',
      title: 'What Kind of File?',
      skill: 'Telling file types apart by their extension',
      mechanic: 'sort',
      prop: 'folder',
      takeaway: 'The letters after the dot tell you what a file holds and which app opens it. Be careful with program files from people you do not know.',
      prompt: 'What kind of file is this?',
      bins: [
        {id: 'doc', label: 'Document'},
        {id: 'image', label: 'Image'},
        {id: 'audio', label: 'Audio'},
        {id: 'program', label: 'Program'}
      ],
      items: [
        {label: 'report.docx', answer: 'doc', why: 'A .docx file is a word processing document, made of text and formatting.', prop: 'folder'},
        {label: 'notes.txt', note: 'Plain text, no formatting', answer: 'doc', why: 'A .txt file holds plain text. Any text editor can open it, so it counts as a document.', prop: 'folder'},
        {label: 'budget.pdf', answer: 'doc', why: 'A .pdf is a document format that looks the same on every device, often used for forms and reports.', prop: 'folder'},
        {label: 'team-photo.jpg', answer: 'image', why: 'A .jpg file is a photo or picture. Photo viewers and image editors open it.', prop: 'wireframe-card'},
        {label: 'logo.png', answer: 'image', why: 'A .png file is an image, often used for logos and screenshots because it keeps sharp edges.', prop: 'wireframe-card'},
        {label: 'voicemail.wav', answer: 'audio', why: 'A .wav file holds recorded sound, so it opens in a media player.', prop: 'megaphone'},
        {label: 'podcast.mp3', answer: 'audio', why: 'An .mp3 file is compressed audio, the common format for songs and podcasts.', prop: 'megaphone'},
        {label: 'setup.exe', note: 'Runs when you double-click it', answer: 'program', why: 'An .exe file is a program that runs on Windows. Only open one from a source you trust.', prop: 'code-block'},
        {label: 'installer.msi', answer: 'program', why: 'An .msi file installs software on Windows, so it is a program file. Treat unknown ones with care.', prop: 'code-block'}
      ]
    },
    {
      id: 'how-private',
      order: 4,
      courseSlug: 'demo-it-basics-4',
      courseTitle: 'Handling Information',
      title: 'How Private Is It?',
      skill: 'Sorting information by who is allowed to see it',
      mechanic: 'sort',
      prop: 'clipboard',
      takeaway: 'Ask who should see it. Public facts are fine to share, internal ones stay with staff, and confidential data stays with the few people who need it.',
      prompt: 'Who is allowed to see this?',
      bins: [
        {id: 'public', label: 'Anyone (Public)'},
        {id: 'internal', label: 'Staff only'},
        {id: 'confidential', label: 'Confidential'}
      ],
      items: [
        {label: 'Opening hours on the website', answer: 'public', why: 'Hours are already posted for everyone to see, so sharing them causes no harm.', prop: 'calendar-card'},
        {label: 'Job posting for a front desk role', note: 'Listed on the careers page', answer: 'public', why: 'A job ad is meant to reach as many people as possible, so it is public.', prop: 'megaphone'},
        {label: 'Published newsletter', note: 'Already mailed to members', answer: 'public', why: 'Once a newsletter goes out to members, its contents are public information.', prop: 'envelope'},
        {label: 'Next month\'s staff rota', answer: 'internal', why: 'A work schedule matters to staff, but outsiders do not need it. Keep it internal.', prop: 'calendar-card'},
        {label: 'Team phone list', note: 'Desk numbers for coworkers', answer: 'internal', why: 'Work contact numbers help coworkers reach each other but should not be posted for strangers.', prop: 'clipboard'},
        {label: 'Notes from a staff meeting', answer: 'internal', why: 'Meeting notes are for the team. They are not secret, but they are not for the public either.', prop: 'sticky-note'},
        {label: 'A member\'s home address', answer: 'confidential', why: 'Home addresses are personal data. Only staff who need them for a task should see them.', prop: 'folder'},
        {label: 'Donor card numbers', note: 'Saved from a payment form', answer: 'confidential', why: 'Payment card numbers can be used for fraud. They are confidential and must be locked down.', prop: 'database-cylinder'},
        {label: 'The Wi-Fi admin password', answer: 'confidential', why: 'An admin password controls the whole network. Only the people who manage it should know it.', prop: 'sticky-note'}
      ]
    },
    {
      id: 'storage-sizes',
      order: 5,
      courseSlug: 'demo-it-basics-5',
      courseTitle: 'Storage and Backups',
      title: 'How Big Is It?',
      skill: 'Matching everyday files to their usual storage size',
      mechanic: 'sort',
      prop: 'packet',
      takeaway: 'Each unit is about a thousand times the one before: kilobytes for text, megabytes for photos and songs, gigabytes for movies, terabytes for big backups.',
      prompt: 'About how big is this, usually?',
      bins: [
        {id: 'kb', label: 'Kilobytes (KB)'},
        {id: 'mb', label: 'Megabytes (MB)'},
        {id: 'gb', label: 'Gigabytes (GB)'},
        {id: 'tb', label: 'Terabytes (TB)'}
      ],
      items: [
        {label: 'A short plain-text note', answer: 'kb', why: 'A page of plain text is only a few thousand characters, which is a few kilobytes.', prop: 'sticky-note'},
        {label: 'A small contact list', note: '50 names in a spreadsheet', answer: 'kb', why: 'Fifty rows of names and numbers is a small amount of text, so it stays in the kilobytes.', prop: 'clipboard'},
        {label: 'A photo from a phone camera', answer: 'mb', why: 'A modern phone photo holds millions of tiny dots of color, so it is usually a few megabytes.', prop: 'wireframe-card'},
        {label: 'One song as an MP3', answer: 'mb', why: 'A typical song file is about 3 to 5 megabytes, so a few hundred songs fill one gigabyte.', prop: 'megaphone'},
        {label: 'A two-hour HD movie', answer: 'gb', why: 'High-definition video is large. A full movie usually takes a few gigabytes.', prop: 'packet'},
        {label: 'A large video game', note: 'Downloaded to a console', answer: 'gb', why: 'Modern games with detailed graphics often take tens of gigabytes of space.', prop: 'code-block'},
        {label: 'A one-hour video from a phone', answer: 'gb', why: 'Every second of video holds many full pictures, so an hour of phone video usually takes several gigabytes.', prop: 'packet'},
        {label: 'A full backup of every office PC', note: 'Copies all files from 20 computers', answer: 'tb', why: 'Copying every file from 20 computers adds up to thousands of gigabytes, which is terabytes.', prop: 'database-cylinder'},
        {label: 'A big external backup drive', note: 'Holds years of photos and video', answer: 'tb', why: 'Backup drives built to hold years of media are usually sold in terabytes, such as 2 TB or 4 TB.', prop: 'database-cylinder'}
      ]
    }
  ]
};
