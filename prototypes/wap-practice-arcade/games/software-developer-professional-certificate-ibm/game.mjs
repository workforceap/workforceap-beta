export default {
  id: 'software-developer-professional-certificate-ibm',
  title: 'Ship It',
  tagline: 'Short practice breaks for new software developers.',
  role: 'You are a junior developer at Tidewater Labs, helping a small team ship ShiftBoard, a job board web app.',
  program: 'AI and Software Developer Professional Certificate (IBM)',
  theme: {world: 'studio', accent: '#6b4fa0', mood: 'dusk'},
  levels: [
    {
      id: 'phase-sorter', order: 1,
      courseSlug: 'software-dev-course-1', courseTitle: 'Introduction to Software Engineering',
      title: 'Phase Sorter',
      skill: 'Placing everyday team tasks in the right SDLC phase',
      mechanic: 'sort', prop: 'clipboard',
      scene: 'In your first week at Tidewater Labs, your lead asks you to tag each card on a messy task board with its phase.',
      takeaway: 'Software moves through phases: find out what is needed, design it, build and test it, then keep it healthy after launch.',
      prompt: 'Which phase of the software life cycle (SDLC) is this task in?',
      bins: [
        {id: 'requirements', label: 'Requirements'},
        {id: 'design', label: 'Design'},
        {id: 'testing', label: 'Testing'},
        {id: 'maintenance', label: 'Maintenance'}
      ],
      items: [
        {label: 'Ask recruiters what they need', note: 'Before any code is planned', answer: 'requirements', why: 'Finding out what users need comes first. Requirements tell the team what the app must do.'},
        {label: 'Write down what sign-up must do', answer: 'requirements', why: 'A clear list of what a feature must do is a requirement. It guides the design and the tests later.'},
        {label: 'Agree on the must-have features', note: 'Before design starts', answer: 'requirements', why: 'Deciding what the app must do, before anyone designs it, is requirements work. The rest of the project builds on that list.'},
        {label: 'Draw how the app parts connect', note: 'Browser, server and database', answer: 'design', why: 'Deciding the main parts and how they talk to each other is architecture, which is design work.'},
        {label: 'Plan the database tables', answer: 'design', why: 'Choosing how data is stored is a design choice made before the code is written.'},
        {label: 'Try a wrong password on login', note: 'Making sure it is rejected', answer: 'testing', why: 'Checking that the app behaves correctly, even with bad input, is testing. It catches bugs before users do.'},
        {label: 'Run every check before release', answer: 'testing', why: 'Running all the checks before release is testing. It catches bugs while they are still cheap to fix, before real users hit them.'},
        {label: 'Fix a bug reported after launch', answer: 'maintenance', why: 'Work on an app that is already live, like fixing a reported bug, is maintenance.'},
        {label: 'Patch a library in the live app', note: 'It has a known security hole', answer: 'maintenance', why: 'Keeping a live app safe and up to date is ongoing maintenance, long after the first release.'}
      ]
    },
    {
      id: 'page-parts', order: 2,
      courseSlug: 'software-dev-course-2', courseTitle: 'Introduction to HTML, CSS, & JavaScript',
      title: 'Page Parts',
      skill: 'Telling which job HTML, CSS or JavaScript should do',
      mechanic: 'sort', prop: 'code-block',
      scene: 'A bakery that hires through ShiftBoard wants a simple landing page, and you split the to-do list across HTML, CSS and JavaScript.',
      takeaway: 'HTML is the content and structure, CSS is the look and layout, and JavaScript adds behavior when things happen.',
      prompt: 'Which language should handle this?',
      bins: [
        {id: 'html', label: 'HTML'},
        {id: 'css', label: 'CSS'},
        {id: 'js', label: 'JavaScript'}
      ],
      items: [
        {label: 'Add a heading with the shop name', answer: 'html', why: 'Headings are page content and structure, so they are written in HTML with a tag like h1.'},
        {label: 'Add a link to the contact page', answer: 'html', why: 'A link is part of the page structure. HTML makes it with an a tag.'},
        {label: 'Add alt text for screen readers', answer: 'html', why: 'The alt text on an img tag is HTML. Screen readers read it out for people who cannot see the photo.'},
        {label: 'Make all links dark purple', answer: 'css', why: 'Colors are about how the page looks, and CSS controls the look.'},
        {label: 'Stack the cards on narrow phones', answer: 'css', why: 'A CSS media query can change the layout at small screen widths. That is the heart of responsive design.'},
        {label: 'Add space around the Order button', answer: 'css', why: 'Spacing like padding and margin is layout, which belongs in CSS.'},
        {label: 'Show a thank-you without a reload', note: 'After the form is submitted', answer: 'js', why: 'JavaScript can stop the default page reload when a form is sent, then show a message on the page.'},
        {label: 'Count items as they go in a cart', answer: 'js', why: 'Updating a number each time someone acts is behavior, and behavior is the job of JavaScript.'},
        {label: 'Greet users by time of day', note: 'Good morning or good evening', answer: 'js', why: 'Reading the clock and choosing a message is logic that runs in the browser, so it needs JavaScript.'}
      ]
    },
    {
      id: 'branch-and-merge', order: 3,
      courseSlug: 'software-dev-course-3', courseTitle: 'Getting Started with Git and GitHub',
      title: 'Branch and Merge',
      skill: 'Putting everyday Git and GitHub steps in the right order',
      mechanic: 'order', prop: 'code-block',
      scene: 'You are adding search to ShiftBoard while a teammate fixes a bug in the same code, so you work on a branch.',
      takeaway: 'Work on a branch, commit and push it, then let a pull request and a review guard main. Fix conflicts by editing, then commit.',
      rounds: [
        {prompt: 'Save a small change to GitHub. Put the steps in order.', steps: ['Edit the file', 'Stage it with git add', 'Commit it with a message', 'Push it with git push'], why: 'Git only saves what you stage, a commit records the staged change, and a push sends your commits to GitHub.'},
        {prompt: 'Add the search feature with a team review. Put the steps in order.', steps: ['Create a feature branch', 'Commit your work on it', 'Push the branch to GitHub', 'Open a pull request', 'Merge after it is approved'], why: 'Your commits must be on the branch before you push it, and a pull request needs the branch on GitHub. Merging comes only after review.'},
        {prompt: 'Your pull shows a merge conflict. Put the steps in order.', steps: ['Run git pull and see a conflict', 'Open the file with the markers', 'Edit it to the right combined code', 'Stage the file with git add', 'Commit to finish the merge'], why: 'Git cannot guess which change is right. You pick the final code by hand, then stage and commit to finish the merge.'}
      ]
    },
    {
      id: 'python-sprint', order: 4,
      courseSlug: 'software-dev-course-4', courseTitle: 'Python for Data Science, AI & Development',
      title: 'Python Sprint',
      skill: 'Recalling Python data types, structures and basic tools',
      mechanic: 'lane', prop: 'code-block',
      scene: 'Your lead wants a summary of ShiftBoard job posts from a big CSV file, so you warm up on Python basics first.',
      takeaway: 'Know your types and structures: lists keep order, tuples stay fixed, dictionaries map keys to values, and try/except catches errors.',
      questions: [
        {prompt: 'What type is the value 3.5 in Python?', options: ['float', 'int', 'str'], answer: 0, why: 'A number with a decimal point is a float. An int is a whole number, and str is text.'},
        {prompt: 'You need to store each name with its email. Which structure fits?', options: ['list', 'tuple', 'dictionary'], answer: 2, why: 'A dictionary maps keys to values, so you can look up an email by the name.'},
        {prompt: 'Which structure cannot be changed after you create it?', options: ['list', 'tuple', 'dictionary'], answer: 1, why: 'A tuple is fixed once made. Lists and dictionaries can have items added, changed or removed.'},
        {prompt: "What does 'Hi' + ' there' give?", options: ['an error', 'Hi+there', 'Hi there'], answer: 2, why: 'Using + on two strings joins them into one string. The space inside the second string stays.'},
        {prompt: 'A script crashes when the CSV file is missing. What handles it?', options: ['try / except', 'a for loop', 'print()'], answer: 0, why: 'A try block runs the risky code, and except catches the error so you can show a clear message.'},
        {prompt: 'What does 7 // 2 give in Python?', options: ['3.5', '3', '4'], answer: 1, why: 'The // operator divides and drops the remainder, so 7 // 2 is 3. A single / would give 3.5.'},
        {prompt: "jobs = ['dev', 'qa', 'ops']. What is jobs[1]?", options: ['dev', 'qa', 'ops'], answer: 1, why: 'Python counts list positions from 0, so jobs[0] is dev and jobs[1] is qa.'},
        {prompt: 'In pandas, how do you total the applications for each job category?', options: ['groupby + sum', 'sort_values', 'head'], answer: 0, why: 'groupby puts rows with the same category together, and sum adds up the applications in each group.'}
      ]
    },
    {
      id: 'react-links', order: 5,
      courseSlug: 'software-dev-course-5', courseTitle: 'Developing Front-End Apps with React',
      title: 'React Links',
      skill: 'Connecting React ideas to what they do and how to fix them',
      mechanic: 'match', prop: 'wireframe-card',
      scene: 'You are building the ShiftBoard job list in React, and it must update as users type in the search box.',
      takeaway: 'Props come in from the parent and state lives inside. To change state, hand the setter a new value instead of editing the old one.',
      rounds: [
        {prompt: 'Match each React idea to what it means.', pairs: [['Component', 'A reusable piece of the screen'], ['Props', 'Data a parent passes to a child'], ['State', 'Data a component keeps and can change'], ['useEffect', 'Runs work like a fetch after render'], ['JSX', 'HTML-like code written inside JavaScript']], why: 'A screen is built from components. Props flow in from the parent, state lives inside, and useEffect handles work outside rendering.'},
        {prompt: 'Match each problem in the job list to its fix.', pairs: [['Array edited by push', 'Pass a new array to the setter'], ['Input ignores typing', 'Add onChange that updates the state'], ['Fetch every render', 'Give useEffect a dependency array'], ['Missing key warning', 'Give each list item a unique key']], why: 'React spots a new array, not an edited one. An input with a value needs onChange to change. With no dependency list, an effect runs every render. Keys tell items apart.'}
      ]
    },
    {
      id: 'status-check', order: 6,
      courseSlug: 'software-dev-course-6', courseTitle: 'Developing Back-End Apps with Node.js and Express',
      title: 'Status Check',
      skill: 'Choosing the right HTTP status code for an Express API reply',
      mechanic: 'gate', prop: 'packet',
      scene: 'Requests are hitting the new ShiftBoard Express API, and you decide what each route should answer.',
      takeaway: 'Every request needs a reply. 200 means it worked, 404 means the thing is not there, and 401 means the caller is not logged in.',
      prompt: 'Which status code should the job board API send back?',
      actions: [
        {id: 'ok', label: '200 OK'},
        {id: 'notfound', label: '404 Not Found'},
        {id: 'unauth', label: '401 Unauthorized'}
      ],
      items: [
        {title: 'GET /jobs/42', facts: ['Job 42 is in the database', 'Anyone may view this route'], answer: 'ok', why: 'The job exists and no login is needed, so the API sends it back with 200.'},
        {title: 'GET /jobs?title=welder', facts: ['A public search route', 'No jobs match, so the list is empty'], answer: 'ok', why: 'The search worked; it just found nothing. Send 200 with an empty list. 404 is for one missing thing, like a job id.'},
        {title: 'GET /me', facts: ['A valid login token is sent', 'That user record is found'], answer: 'ok', why: 'The auth middleware accepts the token and the record exists, so the handler replies with 200.'},
        {title: 'GET /jobs/999', facts: ['The route exists', 'No job has id 999'], answer: 'notfound', why: 'The route is fine but the record is missing. Send 404 so the request does not just hang.'},
        {title: 'GET /jbos', facts: ['The path has a typo', 'No route matches it'], answer: 'notfound', why: 'No route handles this path, so Express replies with 404.'},
        {title: 'PUT /jobs/7', facts: ['Auth middleware guards this route', 'The request has no token'], answer: 'unauth', why: 'Without a token the caller is not logged in. The middleware stops the request with 401.'},
        {title: 'POST /jobs', facts: ['This route needs a login token', 'The token sent has expired'], answer: 'unauth', why: 'An expired token no longer proves who the caller is, so the middleware answers 401.'}
      ]
    },
    {
      id: 'model-to-page', order: 7,
      courseSlug: 'software-dev-course-7', courseTitle: 'Django Application Development with SQL and Databases',
      title: 'Model to Page',
      skill: 'Putting Django and SQL steps in the right order',
      mechanic: 'order', prop: 'database-cylinder',
      scene: 'ShiftBoard now needs to track applicants and jobs in Django, and you build it from the database up to the page.',
      takeaway: 'After you change a model, run makemigrations and then migrate, or the database will not know about the change.',
      rounds: [
        {prompt: 'You add a phone field to the Applicant model. Put the steps in order.', steps: ['Add the field in models.py', 'Run makemigrations', 'Run migrate', 'Query the new phone field'], why: 'makemigrations writes the change down, and migrate applies it to the database. Until then, a query on the field fails.'},
        {prompt: 'A browser asks for the job list page. Put the steps in order.', steps: ['Browser requests /jobs/', 'urls.py sends it to a view', 'The view gets jobs from the model', 'A template turns them into HTML', 'Django sends the page back'], why: 'The URL picks the view, the view gets the data, the template turns that data into HTML, and only then can the page go back.'},
        {prompt: 'Write a SQL query for welding jobs, sorted by title. Put the parts in order.', steps: ['select title, city', 'from jobs', "where category = 'welding'", 'order by title'], why: 'SQL needs its clauses in a set order: what to show, which table, which rows, and then how to sort them.'}
      ]
    },
    {
      id: 'container-terms', order: 8,
      courseSlug: 'software-dev-course-8', courseTitle: 'Introduction to Containers w/ Docker, Kubernetes & OpenShift',
      title: 'Container Yard',
      skill: 'Connecting Docker and Kubernetes terms to what they do',
      mechanic: 'match', prop: 'crate',
      scene: 'The ShiftBoard API worked on your laptop but failed on the server, so your team is moving it into containers.',
      takeaway: 'An image packs the app and everything it needs, so it runs the same anywhere. Kubernetes keeps the right number of copies running.',
      rounds: [
        {prompt: 'Match each Docker term to what it is.', pairs: [['Dockerfile', 'Written steps to build an image'], ['Image', 'The app packed with all it needs to run'], ['Container', 'A running copy of an image'], ['Registry', 'A place to store and share images'], ['FROM line', 'Names the base image to build on']], why: 'You write a Dockerfile, build an image from it, and run the image as a container. Registries let others pull the same image.'},
        {prompt: 'Match each Kubernetes term to what it does.', pairs: [['Pod', 'Smallest unit that runs containers'], ['Node', 'A machine that runs pods'], ['Deployment', 'Keeps the wanted number of pods running'], ['Service', 'A steady address for a group of pods'], ['Secret', 'Holds passwords outside the image']], why: 'Pods run on nodes. A Deployment replaces pods that crash, a Service gives them one address, and Secrets keep passwords out of images.'}
      ]
    },
    {
      id: 'call-or-queue', order: 9,
      courseSlug: 'software-dev-course-9', courseTitle: 'Application Development using Microservices and Serverless',
      title: 'Call or Queue',
      skill: 'Deciding when a service should call directly or send to a queue',
      mechanic: 'gate', prop: 'cloud-node',
      scene: 'ShiftBoard is being split into small services. You decide how each one should talk to the others.',
      takeaway: 'Call directly when the caller must wait for the answer. Use a queue when the work can happen later, so one service being down does not stop the rest.',
      prompt: 'Call the other service directly, or put a message on a queue?',
      actions: [
        {id: 'call', label: 'Call directly'},
        {id: 'queue', label: 'Use a queue'}
      ],
      items: [
        {title: 'Check a password at sign-in', facts: ['The user waits on the sign-in screen', 'Sign-in cannot go on without a yes or no'], answer: 'call', why: 'The caller needs the answer right now to continue, so a direct call fits.'},
        {title: 'Show pay range on a job page', facts: ['The candidate is looking at the job', 'The page needs the number to finish'], answer: 'call', why: 'The page cannot finish without the number, so it asks the pay service directly and waits.'},
        {title: 'Check a job is still open', facts: ['Apply cannot go through until it is known'], answer: 'call', why: 'Applying depends on the answer. Waiting on a direct call is the right trade here.'},
        {title: 'Load a profile page', facts: ['The page stays blank until data arrives'], answer: 'call', why: 'Nothing can be shown without the data, so the page calls the profile service directly.'},
        {title: 'Email a candidate who applied', facts: ['The applicant does not wait for the email', 'The email service is sometimes down'], answer: 'queue', why: 'With a queue, applications still go through while email is down. The email goes out when it is back.'},
        {title: 'Scan a large uploaded resume', facts: ['A big file can take minutes', 'The user only needs "upload received"', 'A serverless function does the scan'], answer: 'queue', why: 'Long work should not block the user. The queue hands each upload to the function, which runs in the background.'},
        {title: 'Update search after a new post', facts: ['The poster is done once it saves', 'Search can catch up a bit later'], answer: 'queue', why: 'Nobody waits on this step, so an event on a queue lets the search service catch up on its own time.'},
        {title: 'Tell three services a job was filled', facts: ['Billing, email and reports all care', 'The hiring step should not wait on them'], answer: 'queue', why: 'One event on a queue reaches every service that cares, and the hiring step moves on without waiting.'}
      ]
    }
  ]
};
