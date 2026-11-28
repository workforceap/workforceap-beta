export default {
  id: 'ai-professional-developer-certificate-ibm',
  title: 'Prompt Workshop',
  tagline: 'Short practice breaks on using AI well, and safely, at work.',
  role: 'You are the AI helper at Cedar Street Supply, a small company, guiding teams to use AI well and safely.',
  program: 'AI Professional Practitioner Certificate',
  theme: {world: 'lab', accent: '#7a55c7', mood: 'dusk'},
  levels: [
    {
      id: 'software-stages', order: 1,
      courseSlug: 'ai-dev-course-1', courseTitle: 'Introduction to Software Engineering',
      title: 'Software Stages',
      skill: 'Placing common tasks in the right software stage',
      mechanic: 'sort', prop: 'clipboard',
      scene: 'Cedar Street Supply is building a small AI feature, and the team asks you which stage each task belongs to.',
      takeaway: 'Software moves through plan, build, test and run-and-fix stages. An AI feature needs clear goals up front and watching long after launch.',
      prompt: 'Which stage of building software is this?',
      bins: [{id: 'plan', label: 'Plan'}, {id: 'build', label: 'Build'}, {id: 'test', label: 'Test'}, {id: 'run', label: 'Run and fix'}],
      items: [
        {label: 'Write the sign-in page code', answer: 'build', why: 'Writing the working parts of the app is the build stage.'},
        {label: 'Fix a bug a customer reported', note: 'The app has been live for weeks', answer: 'run', why: 'Once an app is live, fixing problems that people report is part of keeping it running.'},
        {label: 'Write down what the app must do', answer: 'plan', why: 'Planning means agreeing on goals and needs before any code. Clear needs also tell you when the work is done.'},
        {label: 'Check that the totals add up', note: 'Done before the app goes live', answer: 'test', why: 'Checking results against what you expect is testing. It catches mistakes before launch.'},
        {label: 'Connect the app to its database', answer: 'build', why: 'Linking the parts of the app together is building work.'},
        {label: 'Notice the AI giving worse answers', note: 'The app has been live for months', answer: 'run', why: 'Real-world data changes over time, so an AI feature can slowly get worse. Watching for that is ongoing care after launch.'},
        {label: 'Try the app with sample data', note: 'Looking for bugs before anyone uses it', answer: 'test', why: 'Testing means trying the app on purpose to find problems before real users do.'},
        {label: 'Choose who the app is for', answer: 'plan', why: 'Knowing the users comes first. It shapes every later choice, so it belongs in planning.'}
      ]
    },
    {
      id: 'is-it-an-ai-job', order: 2,
      courseSlug: 'ai-dev-course-2', courseTitle: 'Introduction to Artificial Intelligence (AI)',
      title: 'Is It an AI Job?',
      skill: 'Telling when AI, plain rules or more data fits a job',
      mechanic: 'gate', prop: 'robot-head',
      scene: 'Teams keep asking, "Can AI do this?" You look at each job and say what fits it.',
      takeaway: 'Use fixed rules when the steps never change. Use AI when many examples show a pattern. With no past examples, collect data first.',
      prompt: 'What fits this job best?',
      actions: [{id: 'ai', label: 'Use AI'}, {id: 'rules', label: 'Use fixed rules'}, {id: 'data', label: 'Get data first'}],
      items: [
        {title: 'Spot spam in the support inbox', facts: ['20,000 past emails are marked spam or not', 'Spammers keep changing their wording'], answer: 'ai', why: 'Thousands of emails marked spam or not give a model plenty to learn from, and the wording keeps changing. Fixed rules would fall behind.'},
        {title: 'Warn before a machine breaks', facts: ['Sensors were installed two days ago', 'No breakdown has ever been recorded'], answer: 'data', why: 'There is almost nothing to learn from yet. Keep recording readings and breakdowns first, then think about a model.'},
        {title: 'Add up an invoice total', facts: ['The math is the same every time', 'An exact answer is needed'], answer: 'rules', why: 'When the steps are known and never change, plain rules are exact and cheap. AI would only add risk.'},
        {title: 'Look up a customer discount tier', facts: ['A chart maps yearly spend to a tier', 'The chart is the company rule'], answer: 'rules', why: 'The answer is already written in a chart. Looking it up is a rule, so AI adds nothing.'},
        {title: 'Read handwriting on old forms', facts: ['Every writer has a different style', '40,000 scans are paired with typed text'], answer: 'ai', why: 'Handwriting varies too much for rules. Many paired examples let a model learn the pattern.'},
        {title: 'Predict which clients will quit', facts: ['No records of past clients were kept', 'Nobody noted who left or why'], answer: 'data', why: 'A model learns from past examples with known results. With no history, the first job is collecting data.'},
        {title: 'Check a 5-digit ZIP code', facts: ['Millions of forms are filed each year', 'The format never changes'], answer: 'rules', why: 'A fixed format is a simple rule. Big volume does not mean you need AI.'},
        {title: 'Estimate delivery times', facts: ['Three years of trips with real times', 'Weather and traffic change every day'], answer: 'ai', why: 'Many factors interact, and there is plenty of past data. A model can learn patterns that simple rules could not cover.'}
      ]
    },
    {
      id: 'words-and-safeguards', order: 3,
      courseSlug: 'ai-dev-course-3', courseTitle: 'Generative AI: Introduction and Applications',
      title: 'Words and Safeguards',
      skill: 'Connecting generative AI words to safe habits',
      mechanic: 'match', prop: 'envelope',
      scene: 'Cedar Street Supply helps job seekers with AI-drafted cover letters. You explain the words and the safeguards.',
      takeaway: 'Generative AI can write fast, but it can invent facts and copy bias. A person should always check the draft before it goes out.',
      rounds: [
        {prompt: 'Match each word to its meaning.', pairs: [['Prompt', 'The instructions you give the AI'], ['Hallucination', 'Made-up facts that sound real'], ['Training data', 'Examples the AI learned from'], ['Bias', 'Unfair patterns copied from data'], ['Human review', 'A person checks it before it is used']], why: 'These words come up in every conversation about AI writing: what you ask, what it learned from, what can go wrong, and who checks.'},
        {prompt: 'Match each risk to a good safeguard.', pairs: [['Invented facts', 'Check every claim against records'], ['Private details', 'Share only what the letter needs'], ['Generic letters', 'Add the client\'s own story'], ['Unfair wording', 'Read it for bias and rewrite']], why: 'Each risk has its own habit: check the facts, share only the private details the task needs, make the writing personal, and read for fairness.'}
      ]
    },
    {
      id: 'fix-the-prompt', order: 4,
      courseSlug: 'ai-dev-course-4', courseTitle: 'Generative AI: Prompt Engineering Basics',
      title: 'Fix the Prompt',
      skill: 'Choosing the right fix for a weak prompt',
      mechanic: 'gate', prop: 'sticky-note',
      scene: 'Coworkers bring you prompts that give weak results. You decide what to add to each one.',
      takeaway: 'Give context when the AI lacks facts, show examples when a style is hard to describe, and state a rule to set limits or format.',
      prompt: 'What would fix this prompt best?',
      actions: [{id: 'context', label: 'Give context'}, {id: 'examples', label: 'Show examples'}, {id: 'rule', label: 'State the rule'}],
      items: [
        {title: 'Cover letter sounds generic', facts: ['The prompt says only: write a cover letter', 'The AI knows nothing about the job or person'], answer: 'context', why: 'The AI cannot guess details it was never told. Add the job, the person\'s skills and who will read it.'},
        {title: 'Tone never matches your team', facts: ['Your team\'s notes are short and warm', 'The style is hard to explain in words', 'You have two real notes to copy'], answer: 'examples', why: 'A style is easier to show than to describe. Paste the two real notes and ask for the same feel.'},
        {title: 'Summary adds the AI\'s opinions', facts: ['The AI keeps judging the company', 'You want only what the customer wrote'], answer: 'rule', why: 'Say it plainly: summarize only what the customer wrote, with no opinions. Clear limits are followed better than hints.'},
        {title: 'Answer is about the wrong plan', facts: ['The company sells two plans', 'The prompt never says which plan'], answer: 'context', why: 'The AI had to guess. Naming the plan, and what it includes, gives it the facts it needs.'},
        {title: 'Answer runs three long paragraphs', facts: ['You need a single word', 'The prompt never limits the length'], answer: 'rule', why: 'Set the format in the prompt, such as "Answer with one word only." Without a limit the AI chooses its own length.'},
        {title: 'Tickets sorted inconsistently', facts: ['"Refund" and "Billing" get mixed up', 'Words alone have not fixed it', 'You have 3 tickets already sorted by hand'], answer: 'examples', why: 'Showing a few tickets with the right label teaches the pattern. The AI can then copy it on new tickets.'}
      ]
    },
    {
      id: 'python-pit-stop', order: 5,
      courseSlug: 'ai-dev-course-5', courseTitle: 'Python for Data Science, AI & Development',
      title: 'Python Pit Stop',
      skill: 'Matching data tasks to the right Python tool',
      mechanic: 'lane', prop: 'database-cylinder',
      scene: 'You are cleaning a customer feedback table in Python. In the code, df is the table and pd is pandas.',
      takeaway: 'pandas has a ready-made tool for common table jobs: read, clean, check and save. Pick the right one instead of writing it by hand.',
      questions: [
        {prompt: 'Load a CSV file into a pandas table.', options: ['pd.open_csv()', 'pd.table_csv()', 'pd.read_csv()'], answer: 2, why: 'pd.read_csv() reads a CSV file and gives you a table, called a DataFrame, to work with.'},
        {prompt: 'Remove spaces around the text in a column.', options: ['df[\'a\'].strip()', 'df[\'a\'].str.strip()', 'strip(df[\'a\'])'], answer: 1, why: 'A pandas column needs the .str prefix to use text tools on every entry. Plain .strip() works only on one string.'},
        {prompt: 'Drop the rows that have empty values.', options: ['df.dropna()', 'df.fillna()', 'df.sort()'], answer: 0, why: 'dropna() removes rows with missing values. fillna() fills the gaps instead of removing the rows.'},
        {prompt: 'Save a table to a CSV file without row numbers.', options: ['to_csv(index=False)', 'save_csv()', 'export(no_index)'], answer: 0, why: 'to_csv() writes the file. Setting index=False stops it adding an extra column of row numbers.'},
        {prompt: 'Show only the first five rows of a table.', options: ['df.top()', 'df.start()', 'df.head()'], answer: 2, why: 'head() shows the first rows, five by default. It is a quick way to peek at your data.'},
        {prompt: 'Count how many rows a table has.', options: ['count(df)', 'len(df)', 'df.rows()'], answer: 1, why: 'len() gives the number of rows in a table, just as it gives the length of a list.'},
        {prompt: 'Run fast math on a big array of numbers.', options: ['Flask', 'NumPy', 'Matplotlib'], answer: 1, why: 'NumPy is built for fast math on arrays of numbers. Flask builds web apps, and Matplotlib draws charts.'},
        {prompt: 'Repeat the same step for every item in a list.', options: ['for loop', 'if statement', 'import'], answer: 0, why: 'A for loop runs a step once for each item. An if statement only makes a choice, and import loads code.'}
      ]
    },
    {
      id: 'route-to-response', order: 6,
      courseSlug: 'ai-dev-course-6', courseTitle: 'Developing AI Applications with Python and Flask',
      title: 'Route to Response',
      skill: 'Putting a Flask AI route\'s steps in order',
      mechanic: 'order', prop: 'packet',
      scene: 'You build a small web service that reads a job post and returns its skills. JSON is a simple text format for data.',
      takeaway: 'Check the input before using it, give outside calls a time limit, and keep secrets out of the code. Tell callers clearly when something is down.',
      rounds: [
        {prompt: 'A Flask route answers one web address. Put this job-post skills route in order.', steps: ['The client sends the job post as JSON', 'The route reads the JSON data', 'The code checks the text is not empty', 'The code sends the text to the AI', 'The route returns the skills as JSON'], why: 'Data has to arrive before it is read, be checked before it is used, and be processed before an answer goes back.'},
        {prompt: 'The AI service stops answering. Put the safe handling steps in order.', steps: ['Send the request with a time limit', 'No reply arrives before the limit', 'Catch the timeout in your code', 'Return 503: try again later'], why: 'The time limit lets you notice the problem. Your code catches it, and 503 tells the client the service is unavailable for now.'},
        {prompt: 'An API key is a secret password for a service. Put the safe setup steps in order.', steps: ['Create an API key with the provider', 'Put the key in an environment variable', 'Read it in code with os.environ', 'Call the AI service using that key'], why: 'The key must exist before it is stored, stored before it is read, and read before it can be used. This keeps it out of your code.'}
      ]
    },
    {
      id: 'chatbot-pipeline', order: 7,
      courseSlug: 'ai-dev-course-7', courseTitle: 'Building Generative AI-Powered Applications with Python',
      title: 'Chatbot Pipeline',
      skill: 'Placing chatbot pipeline tasks in the right step',
      mechanic: 'sort', prop: 'folder',
      scene: 'Cedar Street Supply wants a chatbot that answers from its guides. A chunk is a small piece of text.',
      takeaway: 'A chatbot prepares its documents, finds the best pieces for a question, then writes from them. Keep private data safe on every trip outside.',
      prompt: 'Where does this chatbot task belong?',
      bins: [{id: 'prepare', label: 'Prepare docs'}, {id: 'find', label: 'Find chunks'}, {id: 'write', label: 'Write answer'}, {id: 'protect', label: 'Protect data'}],
      items: [
        {label: 'Match the question to chunks', answer: 'find', why: 'When a question comes in, the chatbot searches the stored chunks for the ones closest in meaning.'},
        {label: 'Hide a client name in a question', note: 'Before it goes to an outside AI service', answer: 'protect', why: 'Private details should not be sent to an outside service if the answer does not need them.'},
        {label: 'Split long files into small chunks', answer: 'prepare', why: 'Documents are cut into chunks and stored ahead of time, so the chatbot can find just the right piece later.'},
        {label: 'Write a reply from those chunks', answer: 'write', why: 'Answering from the found chunks keeps the reply tied to the organization\'s own documents.'},
        {label: 'Add a new guide so it can be found', note: 'The guide was added to the docs last week', answer: 'prepare', why: 'A new document is invisible to the chatbot until it is chunked and stored. That work happens before any question.'},
        {label: 'Return the few best matches', note: 'Not the whole library', answer: 'find', why: 'Sending only the best few matches keeps the answer focused on what the question needs.'},
        {label: 'Confirm data may go to a vendor', note: 'Before the vendor\'s AI sees it', answer: 'protect', why: 'Sending personal data to another company can break privacy rules. Check that you are allowed and that users know.'},
        {label: 'Admit when chunks lack the answer', note: 'Rather than guessing', answer: 'write', why: 'An honest "I could not find that" is better than an invented answer. This rule shapes the reply.'},
        {label: 'Turn each chunk into numbers', note: 'The numbers capture what the chunk means', answer: 'prepare', why: 'Turning chunks into numbers ahead of time is what makes search by meaning possible later.'}
      ]
    },
    {
      id: 'check-the-ai-code', order: 8,
      courseSlug: 'ai-dev-course-8', courseTitle: 'Generative AI: Elevate your Software Development Career',
      title: 'Check the AI Code',
      skill: 'Reviewing AI help and AI work with care',
      mechanic: 'lane', prop: 'code-block',
      scene: 'A teammate used AI to write code and asks you to look it over before it joins the app.',
      takeaway: 'AI can speed you up, but you stay responsible. Give clear prompts, understand and test what you ship, and protect secrets and private data.',
      questions: [
        {prompt: 'AI wrote code you do not understand. What do you do before sharing it?', options: ['Read and test it', 'Use it as is', 'Ship it and watch'], answer: 0, why: 'If you cannot explain code, you cannot fix it when it breaks. Read it and test it before it goes in.'},
        {prompt: 'During review you see an API key typed into the AI-written code. Where should it go?', options: ['Inside the code', 'In a team chat', 'Env variable'], answer: 2, why: 'Keys written into code can leak through shared history. An environment variable keeps the secret out of the code.'},
        {prompt: 'Before pasting customer notes into an outside AI tool, you should...', options: ['Paste it all in', 'Strip private info', 'Rename the file'], answer: 1, why: 'Customer details should not leave your organization unless needed and allowed. Take out names and IDs first.'},
        {prompt: 'An AI assistant suggests a library function that does not exist. What is this?', options: ['Hallucination', 'Data drift', 'A slow query'], answer: 0, why: 'AI can invent names that look real. Check the docs or run the code before trusting a suggested function.'},
        {prompt: 'AI-written code passes every test. What still needs to happen?', options: ['Ship it now', 'Ask AI to retest', 'Human review'], answer: 2, why: 'Tests only cover what someone thought to check. A person can spot slow designs and risky choices the tests miss.'},
        {prompt: 'You need sign-in code for the app. What is the safer choice?', options: ['Write your own', 'Trusted library', 'Any online post'], answer: 1, why: 'Sign-in code is easy to get wrong. A trusted, widely checked library has already been tested by many people.'},
        {prompt: 'You ask AI for code. Which request will work best?', options: ['Describe the goal', 'Write me an app', 'Just say: fix it'], answer: 0, why: 'AI cannot read your mind. Say what the code must do, the language and the inputs, and you get a closer result.'},
        {prompt: 'A hiring manager asks how you use AI at work. Best answer?', options: ['AI writes it all', 'I check every line', 'I never use AI'], answer: 1, why: 'Employers want people who use AI to go faster but still understand and own the result. Checking every line shows that.'}
      ]
    }
  ]
};
