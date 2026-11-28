// AI Flight School: one practice level per course of the AI Practitioner Professional Certificate (AWS).
// Original wording; people and organisations are fictional. Practice only, not graded.
export default {
  id: 'ai-practitioner-professional-certificate-aws',
  title: 'AI Flight School',
  tagline: 'Short practice missions for new AI practitioners.',
  role: 'You are a trainee AI practitioner at Skylark Academy, flying practice missions for local clients.',
  program: 'AI Practitioner Professional Certificate (AWS)',
  theme: {world: 'cloud', accent: '#4a63d6', mood: 'night'},
  levels: [
    {
      id: 'rule-or-learning',
      order: 1,
      courseSlug: 'ai-practitioner-course-1',
      courseTitle: 'Introduction to Artificial Intelligence (AI)',
      title: 'Rule or Learning?',
      skill: 'Telling fixed-rule automation apart from machine learning',
      mechanic: 'gate',
      prop: 'robot-head',
      scene: 'On your first day, flight lead Rosa Patel points at eight office systems and asks which ones actually learn.',
      takeaway: 'A fixed rule does the same thing every time. Machine learning finds patterns in examples and uses them on new cases.',
      prompt: 'Does this system follow a fixed rule or learn from examples?',
      actions: [
        {id: 'rule', label: 'Fixed rule'},
        {id: 'learn', label: 'Learns from data'}
      ],
      items: [
        {title: 'Routes emails that say "cancel"', facts: ['Rule: any email with "cancel" goes to the desk', 'It only changes if someone edits it'], answer: 'rule', why: 'A hand-written if-then rule is automation. It does the same thing every time and never learns from examples.'},
        {title: 'Spam filter that keeps improving', facts: ['Trained on mail people marked as spam', 'Catches new spam it has never seen'], answer: 'learn', why: 'It found patterns in labeled examples and applies them to new mail. Learning from examples is machine learning.'},
        {title: 'Late fee added after 30 days', facts: ['Billing policy typed into the system', 'Same result for every account'], answer: 'rule', why: 'The system just applies a set policy. Nothing is learned from past data, so this is rules-based automation.'},
        {title: 'Photo app that spots cats', facts: ['Shown thousands of tagged photos', 'Uses a neural network with many layers'], answer: 'learn', why: 'Deep learning is a kind of machine learning that uses many-layer neural networks. It learned "cat" from examples.'},
        {title: 'Reminder text sent at 9 a.m.', facts: ['Scheduled once by a staff member', 'Goes out at the same time every day'], answer: 'rule', why: 'A timer that fires on a schedule is simple automation. It does not look at data or get better over time.'},
        {title: 'Used car price estimator', facts: ['Built from records of past sales', 'Gets better as more sales are added'], answer: 'learn', why: 'It learns how price relates to age, miles and model from past sales. More examples usually make it more accurate.'},
        {title: 'Account locks after 5 bad tries', facts: ['Limit set by IT', 'Works the same for every user'], answer: 'rule', why: 'A fixed limit chosen by a person is a rule. The system is not learning anything from the login attempts.'},
        {title: 'Chatbot that writes new replies', facts: ['Trained on huge amounts of text', 'Writes replies no one wrote in advance'], answer: 'learn', why: 'Generative AI is built with machine learning. It learned language patterns from text, so it can write new replies.'}
      ]
    },
    {
      id: 'build-the-flight-plan',
      order: 2,
      courseSlug: 'ai-practitioner-course-2',
      courseTitle: 'Artificial Intelligence: An Overview',
      title: 'Build the Flight Plan',
      skill: 'Putting the life cycle of an AI system in order',
      mechanic: 'order',
      prop: 'clipboard',
      scene: 'City director Theo Lind meets an AI vendor tomorrow and asks how an AI system goes from idea to daily use.',
      takeaway: 'Set the goal, get the data, train, then test against the goal before anyone relies on it. Keep watching after launch.',
      rounds: [
        {prompt: 'Your team is building an AI system. Put the life cycle steps in order.', steps: ['Define the goal and how to measure it', 'Collect and clean the data', 'Train the model', 'Evaluate it against the goal', 'Deploy it for daily use'], why: 'The goal decides which data you need. You train on that data, and you only deploy once testing shows the system meets the goal.'},
        {prompt: 'How does a neural network learn from one example? Put the steps in order.', steps: ['Feed in a labeled example', 'Network makes a guess', 'Compare the guess to the right answer', 'Adjust the connection weights'], why: 'The network guesses, measures how far off it was, then nudges its weights to do a bit better. Repeating this many times is training.'},
        {prompt: 'A deployed model starts making more mistakes. Put the steps in order.', steps: ['Notice the error rate rising', 'Find what changed in the data', 'Retrain with fresh data', 'Re-evaluate before going live again'], why: 'You cannot fix what you have not noticed or explained. After retraining, test again so you do not ship a new problem.'}
      ]
    },
    {
      id: 'pre-flight-checklist',
      order: 3,
      courseSlug: 'ai-practitioner-course-3',
      courseTitle: 'Introduction to Digital Transformation Part 1',
      title: 'Pre-Flight Checklist',
      skill: 'Sorting the parts of a plan for an AI-driven change',
      mechanic: 'sort',
      prop: 'chart-folder',
      scene: 'A training center wants to add AI to intake next quarter, so you sort the planning notes before kickoff.',
      takeaway: 'A real AI change needs four things: a clear strategy, a better customer experience, data you can trust, and people ready to run it.',
      prompt: 'Which part of the AI change plan does this note belong to?',
      bins: [
        {id: 'strategy', label: 'Strategy'},
        {id: 'customer', label: 'Customer'},
        {id: 'data', label: 'Data'},
        {id: 'people', label: 'People & roles'}
      ],
      items: [
        {label: 'Agree on what success looks like', answer: 'strategy', why: 'Deciding what the change must achieve is strategy. Every other choice in the plan should serve that goal.'},
        {label: 'Tie the change to our mission', answer: 'strategy', why: 'Strategy explains why this change matters for the organization, not just which tool to buy.'},
        {label: 'Map each step a new member takes', answer: 'customer', why: 'Walking through the member\'s journey shows where AI could make the experience better or worse.'},
        {label: 'Ask members what frustrates them', answer: 'customer', why: 'Customer experience starts with the people you serve. Their pain points tell you what is worth fixing.'},
        {label: 'Check member records are complete', answer: 'data', why: 'An AI tool is only as good as the records it uses. Gaps and errors in the data become wrong answers.'},
        {label: 'Find where intake info is stored', note: 'Some is on paper, some in a database', answer: 'data', why: 'Before AI can use information, you need to know where it lives and whether it can be reached.'},
        {label: 'Name who fixes a wrong AI answer', answer: 'people', why: 'Someone has to own mistakes. Clear roles are part of the organization\'s ability to lead the change.'},
        {label: 'Train staff to step in for the bot', answer: 'people', why: 'Staff need the skills to step in when the tool cannot help. That readiness is a people capability.'}
      ]
    },
    {
      id: 'cleared-for-ai',
      order: 4,
      courseSlug: 'ai-practitioner-course-4',
      courseTitle: 'AI For All',
      title: 'Cleared for AI?',
      skill: 'Spotting good everyday tasks for AI and tasks a person must own',
      mechanic: 'gate',
      prop: 'clipboard',
      scene: 'An office supervisor, Ana Ruiz, hands you a list of tasks and asks which ones AI could help with.',
      takeaway: 'AI is a strong helper for low-risk drafts and sorting that a person checks. High-stakes calls about people stay with people.',
      prompt: 'Is this a good task for AI help, or should a person own it?',
      actions: [
        {id: 'help', label: 'Good AI task'},
        {id: 'human', label: 'Keep it human'}
      ],
      items: [
        {title: 'Draft weekly meeting summaries', facts: ['A person reviews before sharing', 'Notes are routine and internal'], answer: 'help', why: 'Routine drafts that a person checks are a classic good use. AI saves time and the reviewer catches mistakes.'},
        {title: 'Make the final hiring decision', facts: ['No person would review it', 'Decides whether someone gets a job'], answer: 'human', why: 'Decisions that change a person\'s life need human judgment and someone accountable. AI can support but not decide alone.'},
        {title: 'Fill gaps in a grant report', facts: ['Source documents are missing', 'The tool would have to guess the facts'], answer: 'human', why: 'AI fills gaps with fluent guesses that can be false. A person must find the real facts first.'},
        {title: 'Sort the shared inbox by topic', facts: ['Hundreds of routine emails a day', 'Staff can re-sort any mistakes'], answer: 'help', why: 'High volume, low risk and easy to correct make sorting a good fit. Mistakes cost little and are quick to fix.'},
        {title: 'Answer a personnel complaint', facts: ['Sensitive and confidential', 'Needs a manager\'s judgment'], answer: 'human', why: 'Complaints about people need care, context and a manager who owns the outcome. That is not a job to hand to a tool.'},
        {title: 'First draft of a job posting', facts: ['HR supplies the facts', 'HR edits the final wording'], answer: 'help', why: 'AI can turn supplied facts into a clean draft. HR stays in control of the final words.'},
        {title: 'Brainstorm names for an event', facts: ['Low stakes', 'The team picks the winner'], answer: 'help', why: 'Brainstorming is low risk and the team makes the choice. AI just widens the list of ideas.'},
        {title: 'Tell a client: claim approved', facts: ['No one has checked the case', 'A wrong answer could cost them money'], answer: 'human', why: 'A confident wrong answer here could hurt the client. A person must check the case before anyone is told.'}
      ]
    },
    {
      id: 'build-or-buy',
      order: 5,
      courseSlug: 'ai-practitioner-course-5',
      courseTitle: 'AI Concepts and Strategy',
      title: 'Build or Buy',
      skill: 'Framing build-or-buy choices and the return on an AI project',
      mechanic: 'lane',
      prop: 'chart-folder',
      scene: 'Leadership asks whether to build or buy an assistant for routine emails, and you steer through their questions.',
      takeaway: 'Buy for common needs, build only for unique ones you can support, and always name an owner who measures the return.',
      questions: [
        {prompt: 'A 5-person team with no engineers needs email drafts next month.', options: ['Buy a ready tool', 'Build a model', 'Hire researchers'], answer: 0, why: 'Building takes time and skills this team does not have. A routine need like drafting is well served by tools that already exist.'},
        {prompt: 'A firm has unique data, its own ML team, and no tool on the market fits.', options: ['Buy any chatbot', 'Build its own', 'Skip the project'], answer: 1, why: 'Building makes sense when the need is unusual, the data is yours, and you have the people to build and run it.'},
        {prompt: 'Which is a usable way to measure return on an AI tool?', options: ['Model size', 'Vendor rating', 'Hours saved weekly'], answer: 2, why: 'Return compares value with cost. Time saved on a named task can be measured and set against the cost to run the tool.'},
        {prompt: 'Return on investment compares the value you gain with the...', options: ['Number of users', 'Size of the model', 'Total cost'], answer: 2, why: 'ROI is value against cost. Cost includes the tool plus the staff time to set it up and run it.'},
        {prompt: 'The tool is bought. Who should check whether it pays off?', options: ['The vendor', 'A named owner', 'The IT help desk'], answer: 1, why: 'A project without an owner drifts. Someone inside the organization must track whether the promised value shows up.'},
        {prompt: 'After three months the tool saves no time. Best next step?', options: ['Wait another year', 'Review and adjust', 'Buy a second tool'], answer: 1, why: 'Managing an AI project includes a review point and a way to change course when the return does not appear.'}
      ]
    },
    {
      id: 'final-approach',
      order: 6,
      courseSlug: 'ai-practitioner-course-6',
      courseTitle: 'AI for Professional Communication',
      title: 'Final Approach',
      skill: 'Checking AI-drafted messages before they reach people',
      mechanic: 'gate',
      prop: 'envelope',
      scene: 'A partner\'s training cohort is delayed, and the AI-drafted updates you asked for are now on your desk.',
      takeaway: 'AI can draft, but you own the message. Check every fact, fix the tone, and send only what you can stand behind.',
      prompt: 'You used AI to draft this. Is it ready, or does it need fixing first?',
      actions: [
        {id: 'ready', label: 'Ready to send'},
        {id: 'fix', label: 'Fix it first'}
      ],
      items: [
        {title: 'Delay notice to a partner', facts: ['Draft blames the partner for the slip', 'Your team actually missed a handoff'], answer: 'fix', why: 'The draft gets the facts wrong. Correct the record, keep a respectful tone, and send only what is true.'},
        {title: 'Agenda for Thursday\'s meeting', facts: ['Every topic matches your notes', 'You added the decisions to confirm'], answer: 'ready', why: 'You checked it against your notes and shaped it yourself. A reviewed agenda is a good use of an AI draft.'},
        {title: 'Three-slide status update', facts: ['Slide 2 still shows placeholder numbers', 'The other slides match your notes'], answer: 'fix', why: 'Placeholder numbers look real to the audience. Replace them with your actual figures before you present.'},
        {title: 'Meeting recap email', facts: ['Lists a person who was not there', 'Everything else matches your notes'], answer: 'fix', why: 'One invented detail makes the whole record wrong. Remove the attendee who was not there, then send.'},
        {title: 'Thank-you note to a volunteer', facts: ['You checked the name and event date', 'The tone sounds like you'], answer: 'ready', why: 'Facts checked and voice right: the note is yours now. AI saved you time on the first draft.'},
        {title: 'Project update for your director', facts: ['You checked each claim against notes', 'You can explain every point if asked'], answer: 'ready', why: 'If you can back up every claim and explain it, the update is professionally yours, even if AI helped write it.'},
        {title: 'Reply to an upset client', facts: ['Promises a refund you do not offer', 'Tone is calm and polite'], answer: 'fix', why: 'A polite tone does not fix a false promise. Remove the refund offer and say only what your team can deliver.'},
        {title: 'Summary of a public report', facts: ['Each point matches the report', 'A link to the full report is included'], answer: 'ready', why: 'Every point is checked against the source, and readers can see the original. It is ready to share.'}
      ]
    },
    {
      id: 'flight-terms',
      order: 7,
      courseSlug: 'ai-practitioner-course-7',
      courseTitle: 'Understand and Apply Artificial Intelligence Fundamentals',
      title: 'Ground School Terms',
      skill: 'Connecting machine learning terms to what they mean',
      mechanic: 'match',
      prop: 'database-cylinder',
      scene: 'Ground school today: a manager has labeled applications and unlabeled comments, and needs the words to talk about both.',
      takeaway: 'Labels make learning supervised. No labels means finding groups. Test on held-back data, and keep watching after launch.',
      rounds: [
        {prompt: 'Match each learning term to what it means.', pairs: [['Supervised ML', 'Learns from examples with known answers'], ['Unsupervised ML', 'Finds groups in data with no answers'], ['Label', 'The known answer tagged on an example'], ['Test data', 'Examples held back to check the model']], why: 'Supervised learning needs labels, the known answers. Unsupervised learning finds structure without them. Test data is kept aside so the check is fair.'},
        {prompt: 'Match each evaluation and deployment term to its meaning.', pairs: [['Accuracy', 'Share of predictions that are right'], ['Overfitting', 'Great on training data, weak on new data'], ['Model drift', 'Good at launch, then slips over time'], ['Human review', 'A person checks results before use']], why: 'Accuracy and overfitting tell you how good a model is before launch. Drift and human review are about keeping it safe and useful after launch.'}
      ]
    },
    {
      id: 'generate-or-predict',
      order: 8,
      courseSlug: 'ai-practitioner-course-8',
      courseTitle: 'AI for Business: Generation & Prediction',
      title: 'Generate or Predict',
      skill: 'Telling generation requests apart from prediction requests',
      mechanic: 'gate',
      prop: 'cloud-node',
      scene: 'A small employer sends a stack of AI requests. You tag each one before it goes to the right team.',
      takeaway: 'Generation makes new content like text, images or code. Prediction gives a forecast, score or category based on past data.',
      prompt: 'Is this request generation or prediction?',
      actions: [
        {id: 'gen', label: 'Generation'},
        {id: 'pred', label: 'Prediction'}
      ],
      items: [
        {title: 'Welcome text for new members', facts: ['Output: a short, friendly message'], answer: 'gen', why: 'The tool writes brand-new text. Making content like messages is generation.'},
        {title: 'Who may miss the next milestone', facts: ['Uses past attendance records', 'Output: a likelihood for each member'], answer: 'pred', why: 'It estimates a future outcome from past data. A likelihood or score is prediction, not new content.'},
        {title: 'Icon for a job fair flyer', facts: ['Output: a new image'], answer: 'gen', why: 'Creating a new picture is generation. The output is content, not a forecast.'},
        {title: 'Enrollment for next month', facts: ['Based on past enrollment', 'Output: one number for next month'], answer: 'pred', why: 'A forecast of a future number from past patterns is prediction.'},
        {title: 'Starter code for a sheet formula', facts: ['Output: a few lines of code'], answer: 'gen', why: 'Writing code is generation too. The tool produces new content a person then tests.'},
        {title: 'Is this email spam?', facts: ['Output: "spam" or "not spam"'], answer: 'pred', why: 'Picking a category for an item is classification, a kind of prediction.'},
        {title: 'Description of a new course', facts: ['Output: a paragraph of promo text'], answer: 'gen', why: 'A new paragraph of text is generated content. A person still checks it against the real course.'},
        {title: 'Send a ticket to the right team', facts: ['Learned from past tickets', 'Output: one of five team names'], answer: 'pred', why: 'Choosing one of a fixed set of teams is classification. It predicts the best category from past examples.'}
      ]
    },
    {
      id: 'turbulence-check',
      order: 9,
      courseSlug: 'ai-practitioner-course-9',
      courseTitle: 'Artificial Intelligence: Ethics & Societal Challenges',
      title: 'Turbulence Check',
      skill: 'Naming the ethics issue in an automated decision',
      mechanic: 'sort',
      prop: 'folder',
      scene: 'An automated screener is turning down more applicants from one neighborhood. You review the case file.',
      takeaway: 'Ask four questions: Is it fair? Can we explain it? Who owns the outcome? Are we protecting personal data?',
      prompt: 'Which ethics issue does this raise first?',
      bins: [
        {id: 'fairness', label: 'Fairness'},
        {id: 'transparency', label: 'Transparency'},
        {id: 'accountability', label: 'Accountability'},
        {id: 'privacy', label: 'Privacy'}
      ],
      items: [
        {label: 'Denials far higher in one area', note: 'Same qualifications, different neighborhood', answer: 'fairness', why: 'Similar people getting worse results because of where they live points to bias. Check the data and the model.'},
        {label: 'Hiring model trained on past hires', note: 'Past hires were mostly men', answer: 'fairness', why: 'A model learns the patterns in its data. If past choices were skewed, the model can repeat that bias.'},
        {label: 'Staff cannot explain a denial', note: 'The applicant asks why', answer: 'transparency', why: 'People affected by a decision deserve a clear reason. A system no one can explain is a transparency problem.'},
        {label: 'Applicants not told AI scores them', answer: 'transparency', why: 'Being open that an automated tool is part of the decision is a basic part of transparency.'},
        {label: '"The model decided, not us"', note: 'Said by the team that runs the tool', answer: 'accountability', why: 'The organization that uses a tool still owns its results. Blaming the software is an accountability gap.'},
        {label: 'No one assigned to review appeals', answer: 'accountability', why: 'Someone must be responsible for checking and correcting contested results. Without an owner, errors stand.'},
        {label: 'Applications pasted in a chatbot', note: 'A public tool with no data agreement', answer: 'privacy', why: 'Sending personal records to a tool with no reason to hold them exposes private data. Share only what is needed.'},
        {label: 'Every field kept forever', note: 'Kept "just in case," with no stated need', answer: 'privacy', why: 'Good privacy means collecting only what you need and not keeping it longer than necessary.'}
      ]
    },
    {
      id: 'chat-cockpit',
      order: 10,
      courseSlug: 'ai-practitioner-course-10',
      courseTitle: 'ChatGPT — Foundations',
      title: 'Chat Cockpit',
      skill: 'Using ChatGPT well and knowing its limits',
      mechanic: 'lane',
      prop: 'robot-head',
      scene: 'A colleague, Kofi Mensah, wants ChatGPT to turn this week\'s public workshop notes into a staff briefing.',
      takeaway: 'Give ChatGPT a clear task, source, reader and format. Check what it says against the source, and keep private data out.',
      questions: [
        {prompt: 'ChatGPT gives a workshop date that is not in your notes.', options: ['Check your notes', 'Trust it', 'Ask it twice'], answer: 0, why: 'Fluent answers can still be made up. Compare the date to your notes before the briefing goes out.'},
        {prompt: 'A made-up answer that sounds confident is often called a...', options: ['Bug report', 'Hallucination', 'Time-out'], answer: 1, why: 'Language models predict likely words, so they can produce false details that sound sure. That is a hallucination.'},
        {prompt: 'You ask for the summary as five bullets. That part of the prompt sets the...', options: ['Training data', 'Model size', 'Output format'], answer: 2, why: 'Telling the model the shape you want, like five bullets, sets the output format. It makes results easier to use.'},
        {prompt: 'Adding a couple of sample answers to your prompt is called...', options: ['Few-shot prompting', 'Fine-tuning', 'Overfitting'], answer: 0, why: 'Examples inside the prompt show the pattern you want. Fine-tuning changes the model itself with extra training.'},
        {prompt: 'A coworker wants to paste a client\'s private case notes for a public summary.', options: ['Paste all of it', 'Leave them out', 'Paste only names'], answer: 1, why: 'A public summary does not need private case data. Pasting it in exposes information the task never required.'},
        {prompt: 'The first answer is too vague. What should you try next?', options: ['Accept it as is', 'Shorten the prompt', 'Add detail and ask'], answer: 2, why: 'Vague prompts get vague answers. Add the source, reader and format you want, then ask again.'},
        {prompt: 'Which job fits ChatGPT best?', options: ['Final legal ruling', 'Draft a staff memo', 'Medical diagnosis'], answer: 1, why: 'Drafting text for a person to review is a strength. High-stakes legal or medical calls need qualified people.'}
      ]
    },
    {
      id: 'recon-mission',
      order: 11,
      courseSlug: 'ai-practitioner-course-11',
      courseTitle: 'ChatGPT for Beginners: Using AI for Market Research',
      title: 'Recon Mission',
      skill: 'Putting a ChatGPT market research task in order',
      mechanic: 'order',
      prop: 'chart-folder',
      scene: 'A local employer wants a one-page look at two competitors before a hiring push. You plan the recon.',
      takeaway: 'Start with a clear question, ask specific prompts, and check every claim against a source before it becomes a deliverable.',
      rounds: [
        {prompt: 'Put the steps of a ChatGPT market research task in order.', steps: ['Define the business question', 'Write specific research prompts', 'Review ChatGPT\'s draft findings', 'Check each claim against a source', 'Write the one-page analysis'], why: 'The question shapes the prompts, the prompts produce findings, and only checked findings belong in the final page.'},
        {prompt: 'ChatGPT made a competitor table. Put the checking steps in order.', steps: ['Read the table ChatGPT made', 'List every claim in the table', 'Find a real source for each claim', 'Fix or remove unsupported claims', 'Share the checked table'], why: 'ChatGPT can state facts, and even sources, that are made up. List every claim, confirm each with a real source, fix the table, then share it.'}
      ]
    },
    {
      id: 'handbook-radio',
      order: 12,
      courseSlug: 'ai-practitioner-course-12',
      courseTitle: 'AI Fundamentals with Claude',
      title: 'Handbook Radio Check',
      skill: 'Judging Claude\'s answers against a long source document',
      mechanic: 'gate',
      prop: 'robot-head',
      scene: 'Staff keep asking about a long program handbook, so you give it to Claude and review each answer it gives.',
      takeaway: 'Give Claude the whole source, ask it to answer from that source, and keep only answers that match it.',
      prompt: 'Claude answered a handbook question. Use the answer or re-prompt?',
      actions: [
        {id: 'use', label: 'Use it'},
        {id: 'reprompt', label: 'Re-prompt'}
      ],
      items: [
        {title: 'Answer on sick-day rules', facts: ['Quotes section 4 of the handbook', 'You checked: the quote is exact'], answer: 'use', why: 'The answer comes straight from the source and you confirmed it. That is exactly what you want to pass on.'},
        {title: 'Answer on overtime approval', facts: ['Contradicts the section you supplied', 'Sounds very confident'], answer: 'reprompt', why: 'The handbook wins, not the confident tone. Ask Claude to quote the section and answer only from it.'},
        {title: '"The handbook does not cover this"', facts: ['You searched: it really does not', 'Claude suggests asking HR'], answer: 'use', why: 'Saying a source does not cover something is honest and useful. It is far better than a made-up rule.'},
        {title: 'Answer on remote work', facts: ['You pasted only a one-page excerpt', 'The rule asked about is on another page'], answer: 'reprompt', why: 'Claude answers from the text you give it, so it can miss or guess a rule on a page you left out. Give it the full handbook.'},
        {title: 'Answer gives a filing deadline', facts: ['No such deadline is in the handbook'], answer: 'reprompt', why: 'An invented detail is a failed answer. Re-prompt to stick to the handbook and check the result again.'},
        {title: 'Summary of the leave policy', facts: ['Each point matches the handbook', 'Gives the page for each point'], answer: 'use', why: 'Every point is tied to a page you can check. A sourced summary like this is safe to share.'},
        {title: 'Asked to make up a rule', facts: ['A manager wanted a rule not in the handbook', 'Claude declined and showed the real rule'], answer: 'use', why: 'Claude is trained to follow written principles, such as being honest. Refusing to make up policy is the helpful answer.'}
      ]
    },
    {
      id: 'pipeline-patrol',
      order: 13,
      courseSlug: 'ai-practitioner-course-13',
      courseTitle: 'Sales with AI',
      title: 'Pipeline Patrol',
      skill: 'Connecting sales AI uses to the problems they solve',
      mechanic: 'match',
      prop: 'chart-folder',
      scene: 'The placement team\'s list of employer partners is messy. You map where AI can help before the quarterly review.',
      takeaway: 'Scoring ranks leads, call analysis finds themes, forecasting estimates results, and pipeline tools track stages. People own the relationships.',
      rounds: [
        {prompt: 'Match each sales AI use to what it does.', pairs: [['Lead scoring', 'Ranks leads most likely to convert'], ['Call analysis', 'Finds themes and follow-ups in calls'], ['Sales forecasting', 'Estimates next quarter\'s sales'], ['Pipeline management', 'Tracks each deal through its stages']], why: 'Each use answers a different question: who to call next, what was said, what is coming, and where each deal stands.'},
        {prompt: 'Match each sales problem to the AI use that helps first.', pairs: [['Dozens of unranked leads', 'Lead scoring'], ['Call notes disagree', 'Call analysis'], ['Funder wants an estimate', 'Sales forecasting'], ['Deal stages unknown', 'Pipeline management']], why: 'Match the tool to the gap: unranked leads need scoring, messy calls need analysis, future numbers need a forecast, lost track needs pipeline tools.'}
      ]
    },
    {
      id: 'campaign-sort',
      order: 14,
      courseSlug: 'ai-practitioner-course-14',
      courseTitle: 'AI for Marketing',
      title: 'Campaign Control',
      skill: 'Sorting AI marketing tasks into campaign stages',
      mechanic: 'sort',
      prop: 'megaphone',
      scene: 'A training program needs more career-changers to apply. You sort the AI tasks on the campaign board.',
      takeaway: 'Pick the right audience, create content that speaks to them, then use the results to improve the next send.',
      prompt: 'Which campaign stage is this AI task part of?',
      bins: [
        {id: 'segment', label: 'Segment'},
        {id: 'content', label: 'Create content'},
        {id: 'optimize', label: 'Optimize'}
      ],
      items: [
        {label: 'Group contacts by career goal', answer: 'segment', why: 'Splitting the audience into groups with shared traits is segmentation. Each group can get its own message.'},
        {label: 'Leave out people already enrolled', answer: 'segment', why: 'Choosing who should not get the campaign is part of defining the audience, which is segmentation.'},
        {label: 'Pick contacts who live nearby', note: 'Classes meet in person downtown', answer: 'segment', why: 'Choosing who gets the campaign by where they live is segmentation. Only people who can reach the classes should get it.'},
        {label: 'Draft three email subject lines', answer: 'content', why: 'Writing new subject lines is content generation. A person still picks and edits the best one.'},
        {label: 'Write a short social media post', answer: 'content', why: 'Producing the words people will read is content creation, whether AI drafts it or a person does.'},
        {label: 'Create an image for the flyer', answer: 'content', why: 'A new image for the campaign is generated content. Check that it fits the message and the audience.'},
        {label: 'Change the button after low clicks', note: 'People open the email but do not click', answer: 'optimize', why: 'Changing the campaign based on how people responded is optimization. Low clicks point to the call to action.'},
        {label: 'Send version A and version B', note: 'Keep whichever gets more sign-ups', answer: 'optimize', why: 'Comparing two versions and keeping the winner is a classic way to optimize a campaign with real results.'},
        {label: 'Move send time after low opens', answer: 'optimize', why: 'Adjusting when you send based on open results is optimization. You learn from the data and try again.'}
      ]
    },
    {
      id: 'crm-autopilot',
      order: 15,
      courseSlug: 'ai-practitioner-course-15',
      courseTitle: 'Salesforce Certified AI Associate Certification',
      title: 'CRM Autopilot',
      skill: 'Telling predictive CRM AI from generative CRM AI',
      mechanic: 'lane',
      prop: 'database-cylinder',
      scene: 'A CRM admin asks when Salesforce AI should predict who will reply and when it should draft the reply.',
      takeaway: 'Predictive AI scores and ranks from CRM history. Generative AI drafts new text. Both depend on clean data and a person in charge.',
      questions: [
        {prompt: 'Rank which contacts are most likely to reply, based on CRM history.', options: ['Generative AI', 'Predictive AI', 'Rule-based filter'], answer: 1, why: 'Ranking by likely outcome uses patterns in past records. That is predictive AI, not text generation.'},
        {prompt: 'Draft the wording of a reply email inside the CRM.', options: ['Generative AI', 'Predictive AI', 'Data cleanup'], answer: 0, why: 'Writing new text is generative AI. A person still checks the draft before it goes to a customer.'},
        {prompt: 'A score says a contact is unlikely to reply. What should you do?', options: ['Delete the contact', 'Use it as a signal', 'Never call them'], answer: 1, why: 'A prediction is a hint to help people plan, not a final decision. Keep the record and use your judgment.'},
        {prompt: 'CRM records have duplicates and blank fields. AI predictions will be...', options: ['Less reliable', 'More accurate', 'Unaffected'], answer: 0, why: 'AI learns from the data it is given. Messy or missing records lead to weaker predictions, so clean data comes first.'},
        {prompt: 'CRM stands for customer relationship...', options: ['Monitoring', 'Management', 'Marketing'], answer: 1, why: 'A customer relationship management system keeps the records of every contact, deal and conversation in one place.'},
        {prompt: 'Before AI-drafted emails go to customers, who checks them?', options: ['The model itself', 'The customer', 'A team member'], answer: 2, why: 'A person stays accountable for what customers receive. The model cannot vouch for its own facts.'},
        {prompt: 'Which one is a predictive CRM use?', options: ['Summarize a case', 'Score win chance', 'Draft an email'], answer: 1, why: 'Scoring how likely a deal is to close is a prediction from past data. Summaries and emails are generated text.'}
      ]
    },
    {
      id: 'aws-hangar',
      order: 16,
      courseSlug: 'ai-practitioner-course-16',
      courseTitle: 'AWS Artificial Intelligence Practitioner',
      title: 'The AWS Hangar',
      skill: 'Matching AWS AI services, prompt parts and responsible AI ideas',
      mechanic: 'match',
      prop: 'cloud-node',
      scene: 'A hiring manager tours the hangar with you and asks what each AWS AI service is for.',
      takeaway: 'Use SageMaker for your own models and Bedrock for foundation models, write clear prompts, and keep fairness and access in the plan.',
      rounds: [
        {prompt: 'Match each AWS service to what it is for.', pairs: [['Amazon SageMaker', 'Build and train your own ML models'], ['Amazon Bedrock', 'Use foundation models for generative AI'], ['Amazon Rekognition', 'Find objects and faces in images'], ['Amazon Transcribe', 'Turn speech into text'], ['Amazon Polly', 'Turn text into lifelike speech']], why: 'SageMaker is the workshop for your own models, Bedrock serves ready foundation models, and the others are ready-made services for images and speech.'},
        {prompt: 'You write a prompt for a Bedrock model. Match each prompt part to its job.', pairs: [['Clear task', 'Say exactly what you want done'], ['Context', 'Give the facts the model should use'], ['Output format', 'Name the answer shape, like a list'], ['Examples', 'Show a sample of the style you want']], why: 'A prompt with a clear task, the right facts, a set format and a sample gives a better first draft, so you spend less time fixing it.'},
        {prompt: 'Match each responsible AI or security idea to its meaning.', pairs: [['Fairness', 'Similar results for similar people'], ['Explainability', 'Being able to say why a model decided'], ['Least privilege', 'Give only the access a job needs'], ['Guardrails', 'Filters that block unsafe content']], why: 'Responsible AI covers fair and explainable results. Security and governance cover who can reach the data and what the model may say.'}
      ]
    },
    {
      id: 'wings-check',
      order: 17,
      courseSlug: 'ai-practitioner-course-17',
      courseTitle: 'Lab, Project, and Test Preparation',
      title: 'Mission Review',
      skill: 'Reviewing AI plans with everything from the program',
      mechanic: 'gate',
      prop: 'clipboard',
      scene: 'On your last mission, Rosa Patel hands you eight project plans and asks which are cleared to go.',
      takeaway: 'Good AI work checks facts, protects private data, tests before and after launch, and keeps a person accountable.',
      prompt: 'Is this plan cleared to go, or should it hold?',
      actions: [
        {id: 'go', label: 'Cleared to go'},
        {id: 'hold', label: 'Hold'}
      ],
      items: [
        {title: 'Briefing with private case notes', facts: ['Task: summarize public workshop notes', 'Plan: paste a client\'s private notes too'], answer: 'hold', why: 'The task does not need private data. Leave the case notes out and summarize only the public notes.'},
        {title: 'AI draft of a partner update', facts: ['Every fact checked against your notes', 'You can explain each point'], answer: 'go', why: 'A checked draft you can stand behind is ready. AI helped with the words; you own the facts.'},
        {title: 'Screener with an unexplained gap', facts: ['One area is denied far more often', 'The team wants to launch anyway'], answer: 'hold', why: 'An unexplained gap between groups may be bias. Find the cause before the tool affects real people.'},
        {title: 'Buy a drafting tool', facts: ['Small team, routine drafting need', 'An owner and a review date are set'], answer: 'go', why: 'Buying fits a common need and a small team. A named owner and a review date keep the project on track.'},
        {title: 'Market page with ChatGPT facts', facts: ['Competitor facts came from ChatGPT', 'None of them were checked'], answer: 'hold', why: 'Unchecked claims can be made up. Verify each fact with a source before the page counts as a deliverable.'},
        {title: 'Use lead scores to plan calls', facts: ['Scores rank who to call first', 'Reps still decide and can call anyone'], answer: 'go', why: 'Scores used as a signal, with people still deciding, is a sound way to use predictive AI in sales.'},
        {title: 'Model tested once, then launched', facts: ['No plan to watch results after launch', 'Real data changes every season'], answer: 'hold', why: 'Models can drift as real data changes. Add a plan to watch results after launch, and to retrain when they slip, before you go live.'},
        {title: 'Draft emails with Amazon Bedrock', facts: ['A foundation model writes first drafts', 'Staff review each one before sending'], answer: 'go', why: 'Bedrock is a fit for generative drafting, and a human review step keeps the messages accurate.'}
      ]
    }
  ]
};
