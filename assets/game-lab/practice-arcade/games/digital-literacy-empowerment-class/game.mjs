export default {
  id: 'digital-literacy-empowerment-class',
  title: 'Click Confident',
  tagline: 'Short practice breaks for new computer users.',
  role: 'You are a new volunteer at the Maple Street Tech Help Table, helping neighbors with computers and scams.',
  program: 'Workforce AP Digital Literacy Course',
  theme: {world: 'office', accent: '#2b7bb9', mood: 'day'},
  levels: [
    {
      id: 'safe-or-risky', order: 1,
      courseSlug: 'digital-literacy-course-1', courseTitle: 'Computer Basics',
      title: 'Safe or Risky?',
      skill: 'Telling safe online habits from risky ones',
      mechanic: 'gate', prop: 'block',
      scene: 'A neighbor sits down at the help table and tells you about her week online.',
      takeaway: 'Never share your password, and never call a number from a pop-up. When you are unsure, ask someone you trust.',
      prompt: 'Is this safe or risky?',
      actions: [{id: 'safe', label: 'Safe'}, {id: 'risky', label: 'Risky'}],
      items: [
        {title: 'Pop-up says: Virus found, call now', facts: ['It covers the whole screen', 'It shows a phone number to call', 'It says you must act right away'], answer: 'risky', why: 'Pop-ups like this try to scare you into calling scammers. Close the tab and ask a helper instead of calling.'},
        {title: 'Looking up library hours', facts: ['You typed the library address yourself', 'The page only shows opening times'], answer: 'safe', why: 'You chose the website and nothing asks for secrets. Typing an address yourself is a safe way to get to a site.'},
        {title: 'Email says verify your login now', facts: ['It says your account closes today', 'The link asks you to type your password'], answer: 'risky', why: 'Real companies do not ask for your password through an email link. Do not click it. Show it to a helper or your IT contact.'},
        {title: 'Signing out on a library computer', facts: ['Other people use this computer too', 'You are done reading your email', 'You click Sign out and close the window'], answer: 'safe', why: 'Signing out on a shared computer keeps the next person from seeing your account. This is a good habit.'},
        {title: 'Posting a neighbor\'s home address', facts: ['A group page is open to everyone', 'The neighbor did not say you could'], answer: 'risky', why: 'Other people\'s private details are theirs to share. Posting them in public can put them at risk.'},
        {title: 'Three random words as a password', facts: ['Plus a number, and only you know it', 'You do not use it anywhere else'], answer: 'safe', why: 'A long mix of unrelated words is hard to guess and easy to remember. Keeping it private and using it for one account keeps it strong.'},
        {title: 'Free program from a random site', facts: ['A pop-up said, Download this now, it is free', 'You have never heard of the maker'], answer: 'risky', why: 'Free programs from unknown sites can hide harmful software. Ask a helper before you download anything.'},
        {title: 'Replying kindly to a neighbor\'s post', facts: ['She posted a photo of her garden', 'Your comment says it looks lovely'], answer: 'safe', why: 'Being kind and respectful online is good manners. It does not share secrets or risk your account.'}
      ]
    },
    {
      id: 'browser-basics', order: 2,
      courseSlug: 'digital-literacy-course-2', courseTitle: 'Internet Basics',
      title: 'Browser Basics',
      skill: 'Using a web browser and searching with key words',
      mechanic: 'lane', prop: 'chip',
      scene: 'A new neighbor just got a laptop and wants to get on the internet. Help her find her way around.',
      takeaway: 'Learn a few tools well: the address bar, back, refresh, new tab and bookmark. Short, clear key words give the best search results.',
      questions: [
        {prompt: 'Which one is a web browser?', options: ['Notepad', 'Chrome', 'Calculator'], answer: 1, why: 'Chrome is a browser, the program you use to visit websites. Notepad and Calculator do other jobs.'},
        {prompt: 'Where do you type a web address?', options: ['Bookmark bar', 'Tab title', 'Address bar'], answer: 2, why: 'The address bar sits at the top of the browser. Type the website name there and press Enter.'},
        {prompt: 'You want to return to the page you just left. Which one?', options: ['Back arrow', 'Refresh', 'Close tab'], answer: 0, why: 'The back arrow takes you to the last page you saw. Refresh would only reload this page.'},
        {prompt: 'A page looks stuck. What do you use?', options: ['Bookmark', 'New tab', 'Refresh'], answer: 2, why: 'Refresh loads the page again, which often clears up a stuck or out-of-date page.'},
        {prompt: 'You want a second page and want to keep this one. Which one?', options: ['New tab', 'Refresh', 'Close tab'], answer: 0, why: 'A new tab opens another page beside this one. Both stay open so you can switch between them.'},
        {prompt: 'You want to save a page to find it fast later. Which one?', options: ['Zoom', 'Bookmark', 'Back arrow'], answer: 1, why: 'A bookmark saves the page in a list, so you can return in one click without searching again.'},
        {prompt: 'You want opening hours for Elm Library. Best search?', options: ['library', 'hours', 'Elm Library hours'], answer: 2, why: 'Key words that name the place and what you need give better results. One word alone is too vague.'},
        {prompt: 'The words on screen look stretched. Where do you fix it?', options: ['Sound settings', 'Display settings', 'Printer settings'], answer: 1, why: 'Display settings control how big and sharp the screen looks. Right-click the desktop to open them.'}
      ]
    },
    {
      id: 'send-it-right', order: 3,
      courseSlug: 'digital-literacy-course-3', courseTitle: 'Email Basics',
      title: 'Send It Right',
      skill: 'Writing and sending an email in the right order',
      mechanic: 'order', prop: 'envelope',
      scene: 'A neighbor is new to email and a bit nervous. You sit beside her while she sends a file, answers a message and writes to a job center.',
      takeaway: 'Take email one step at a time. Begin with a polite greeting and finish with a closing and your name. Read it over before you press Send.',
      rounds: [
        {prompt: 'Send a file by email. Put the steps in order.', steps: ['Open a new message', 'Click the paper clip icon', 'Pick the file from your computer', 'Wait for the file to finish loading', 'Click Send'], why: 'You need a message before you can attach to it. Attach, let the file finish loading, then send.'},
        {prompt: 'Answer an email you got. Put the steps in order.', steps: ['Open and read the whole email', 'Click Reply', 'Type your answer', 'Click Send'], why: 'Read the whole message first so you answer what was asked. Reply opens the writing box. Your answer goes out only when you click Send.'},
        {prompt: 'Write a polite note to Ms. Reyes. Put it in order.', steps: ['Greeting: Dear Ms. Reyes,', 'Who you are and your question', 'Closing: Best regards,', 'Your full name'], why: 'A polite email opens with a greeting, then gives your message. It ends with a closing and then your name.'}
      ]
    },
    {
      id: 'scam-sorter', order: 4,
      courseSlug: 'digital-literacy-course-4', courseTitle: 'Cybersecurity Basics: Online Scams and Fraud',
      title: 'Scam Sorter',
      skill: 'Recognizing common scams and the signs they share',
      mechanic: 'sort', prop: 'folder',
      scene: 'Neighbors bring you texts, calls and emails they are not sure about, and you help sort them.',
      takeaway: 'Scammers rush you and ask for money up front, gift cards or bank details. Stop, and ask someone you trust.',
      prompt: 'What kind of message is this?',
      bins: [{id: 'prize', label: 'Fake prize'}, {id: 'official', label: 'Fake bank/gov'}, {id: 'job', label: 'Fake job'}, {id: 'fine', label: 'Looks fine'}],
      items: [
        {label: 'Text: win a gift card, pay $25 fee', answer: 'prize', why: 'A real prize never costs you money. Paying a fee to win something is a classic scam.'},
        {label: 'Call: pay your taxes in gift cards', note: 'Caller says you will be arrested', answer: 'official', why: 'Real government offices do not take gift cards or threaten to arrest you by phone. This is someone pretending to be a government office.'},
        {label: 'Email: $500 a week, reship parcels', note: 'You need no skills', answer: 'job', why: 'Reshipping means getting packages at home and mailing them on. Scammers often use it to move stolen goods, so you could get in legal trouble.'},
        {label: 'Email: your library books are in', note: 'You reserved them; no link, no payment', answer: 'fine', why: 'You asked for this message and it asks for no money or secrets. It matches something you did.'},
        {label: 'Form asks bank number first', note: 'Job form, before any interview', answer: 'job', why: 'A real employer does not need your bank details before hiring you. Scammers use them to steal your money.'},
        {label: 'Call: banker asks for your PIN', answer: 'official', why: 'Banks never ask for your PIN. Hang up and call the number on your bank card.'},
        {label: 'Pop-up: visitor 1,000 wins a phone', answer: 'prize', why: 'Surprise prizes for something you never entered are bait. Scammers want your details or a small payment.'},
        {label: 'Email: library card renewal due', note: 'Says: renew at the desk or the library site', answer: 'fine', why: 'It asks for no money, link or password. It tells you to use a place you already trust, which is what a real notice does.'},
        {label: 'Text: you owe a fine, pay by link', note: 'Says it is from a government office', answer: 'official', why: 'A surprise text demanding a fine is a common trick. Do not click. Look up the office yourself and call or visit its real site.'}
      ]
    }
  ]
};
