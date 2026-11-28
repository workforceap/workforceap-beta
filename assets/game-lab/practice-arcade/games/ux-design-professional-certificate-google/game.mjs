export default {
  id: 'ux-design-professional-certificate-google',
  title: 'Sketch to Ship',
  tagline: 'Quick practice breaks from first interview to tested design.',
  role: 'You are a junior UX designer at Brightfield Studio, taking a community app from research to tested design.',
  program: 'User Experience & Interface Design Professional Certificate',
  theme: {world: 'studio', accent: '#c2456e', mood: 'day'},
  levels: [
    {
      id: 'who-does-what', order: 1,
      courseSlug: 'ux-design-course-1', courseTitle: 'Foundations of User Experience (UX) Design',
      title: 'Who Does What',
      skill: 'Telling research, structure and visual look apart in design work',
      mechanic: 'sort', prop: 'sticky-note',
      scene: 'It is your first day at Brightfield. The team is starting Corner Commons, an app for neighbors to find local help.',
      takeaway: 'Good UX starts with people. Research shows what they need, structure organizes it, and the visual look comes last on top of both.',
      prompt: 'Which part of the design job is this?',
      bins: [{id: 'research', label: 'Research'}, {id: 'structure', label: 'Structure'}, {id: 'look', label: 'Visual look'}],
      items: [
        {label: 'Interview five neighbors', answer: 'research', why: 'Talking with real people shows what they need. That is research, and it comes before design choices.'},
        {label: 'Pick the button colors', answer: 'look', why: 'Colors change how the screen looks. That is the visual layer, often called UI design.'},
        {label: 'Decide the screen after sign-up', note: 'How screens connect', answer: 'structure', why: 'Choosing what comes next sets the path a person takes. That is flow, part of the structure of the app.'},
        {label: 'Watch a neighbor find the pantry', answer: 'research', why: 'Watching how people do a task today shows what is hard for them. Observing real behavior is research.'},
        {label: 'Choose a font for headings', answer: 'look', why: 'A font is a visual choice. It changes the look, not how the app is organized.'},
        {label: 'Group menu links into sections', note: 'Which links go together', answer: 'structure', why: 'Deciding where things live so people can find them is organizing the app, which is structure.'},
        {label: 'Read survey answers from neighbors', answer: 'research', why: 'Survey answers are information collected from users. Reading them helps you learn what people need.'},
        {label: 'Draw icons for the tab bar', answer: 'look', why: 'Icons are pictures on the screen. Drawing them is visual design work.'},
        {label: 'Map the steps to join an event', note: 'From first tap to done', answer: 'structure', why: 'Planning each step of a task is flow design. It decides how the experience is organized.'}
      ]
    },
    {
      id: 'notes-to-needs', order: 2,
      courseSlug: 'ux-design-course-2', courseTitle: 'Start the UX Design Process: Empathize, Define, and Ideate',
      title: 'Notes to Needs',
      skill: 'Telling observations, problem statements and ideas apart',
      mechanic: 'gate', prop: 'sticky-note',
      scene: 'You have finished five interviews about volunteer shifts. The wall is covered in sticky notes.',
      takeaway: 'Keep notes in order: what you saw, then the need behind it, then ideas. A problem statement names who needs what and why, without naming a fix.',
      prompt: 'Is this an observation, a need statement or an idea?',
      actions: [{id: 'observation', label: 'Observation'}, {id: 'problem', label: 'Need statement'}, {id: 'idea', label: 'Idea'}],
      items: [
        {title: 'Neighbor: "Which shifts need help?"', facts: ['Said out loud during an interview', 'A real quote from a user'], answer: 'observation', why: 'It records what a user said. An observation is a fact you saw or heard, before you explain it.'},
        {title: 'Busy volunteers need to find shifts fast', facts: ['Because their free time is small', 'Names who needs what, and why'], answer: 'problem', why: 'It names a user, a need and a reason, and it does not say what to build. That makes it a problem statement.'},
        {title: 'Add a map that shows open shifts', facts: ['Describes a feature to build', 'Came up in a team brainstorm'], answer: 'idea', why: 'A feature to build is a solution. Ideas are welcome, but they come after the problem is clear.'},
        {title: 'Two people scrolled past the shift list', facts: ['Seen while watching them use the app', 'Cause still unknown'], answer: 'observation', why: 'You saw this happen, but you do not yet know why. A behavior without a cause is an observation.'},
        {title: 'Send a text when a shift near you opens', facts: ['A feature someone suggested', 'Describes what the app would do'], answer: 'idea', why: 'This is a possible solution. It is worth keeping for later, but it is not a statement of the problem.'},
        {title: 'Survey: 4 of 5 check shifts at night', facts: ['Taken from survey answers', 'Says when, not why'], answer: 'observation', why: 'It reports what users told you, without explaining it. Recording facts first keeps your guesses out of the data.'},
        {title: 'Parents need shifts that fit school days', facts: ['Because childcare hours are limited', 'Came from three parent interviews'], answer: 'problem', why: 'It follows the pattern of user, need and because. It describes the need without saying how to meet it.'},
        {title: 'Shift leads need to see who is missing', facts: ['Because late no-shows leave gaps', 'Said in two lead interviews'], answer: 'problem', why: 'It names a user, a need and a reason. It says nothing about how to solve it, so it is a problem statement.'}
      ]
    },
    {
      id: 'sketch-the-flow', order: 3,
      courseSlug: 'ux-design-course-3', courseTitle: 'Build Wireframes and Low-Fidelity Prototypes',
      title: 'Sketch the Flow',
      skill: 'Putting wireframing and design process steps in order',
      mechanic: 'order', prop: 'wireframe-card',
      scene: 'The shift-list idea is chosen. Before any software, you sketch rough screens. Wireframes are simple screen layouts.',
      takeaway: 'Start rough and cheap. Sketch on paper, move to wireframes, link screens into a prototype, then let people try it before adding polish.',
      rounds: [
        {prompt: 'Turn an idea into a rough clickable prototype. Put the steps in order.', steps: ['Sketch the screens on paper', 'Pick the strongest sketches', 'Build digital wireframes in Figma', 'Link the screens with taps', 'Let people try the clickable flow'], why: 'Rough paper ideas come first, because they are cheap to change. Screens must exist before you can link them, and you test last.'},
        {prompt: 'Build a rough prototype in Figma. Put the steps in order.', steps: ['Add a frame for each screen', 'Place a button on screen one', 'Link the button to screen two', 'Open the prototype preview', 'Tap through the flow to test it'], why: 'A button needs a screen to sit on, and a link needs a button and a target screen. You can only tap through once the link exists.'}
      ]
    },
    {
      id: 'watch-and-learn', order: 4,
      courseSlug: 'ux-design-course-4', courseTitle: 'Conduct UX Research and Test Early Concepts',
      title: 'Watch and Learn',
      skill: 'Running a usability test and acting on what you see',
      mechanic: 'lane', prop: 'clipboard',
      scene: 'Five neighbors will try your clickable prototype while you run the test. Watch what they do, and do not help.',
      takeaway: 'In a usability test, watch and ask, do not help. Fix first what stopped several people, because those problems matter most.',
      questions: [
        {prompt: 'A tester cannot find the Save button. What do you do?', options: ['Point it out', 'Let them look', 'Hint with a smile'], answer: 1, why: 'Their struggle is the finding. If you help, you hide the problem you came to discover.'},
        {prompt: 'You want to hear what the tester is thinking as they work.', options: ['Think aloud', 'Time every tap', 'Read their notes'], answer: 0, why: 'Thinking aloud lets you hear what they expect. That explains why they do what they do.'},
        {prompt: 'Three of five testers failed the same task. How urgent is it?', options: ['Low, skip it', 'Medium, wait', 'High, fix first'], answer: 2, why: 'A problem that stops most testers is high priority. Severity and how often it happens decide the order.'},
        {prompt: 'Which task prompt does not hint at the answer?', options: ['Keep job for later', 'Save is easy, yes?', 'Tap the heart'], answer: 0, why: 'A neutral task names the goal without the button\'s words or hints. The other two lead the tester toward an answer.'},
        {prompt: 'Why test a rough prototype this early?', options: ['Code is nearly done', 'Fixes cost less', 'Art can be skipped'], answer: 1, why: 'Changing a sketch takes minutes. The same fix in a polished design or in code costs much more.'},
        {prompt: 'What does a usability test mainly check?', options: ['Brand is popular', 'Code runs fast', 'Tasks get done'], answer: 2, why: 'A usability test looks at how easily real people reach their goals using the design.'},
        {prompt: 'Why use the same tasks with every tester?', options: ['It saves printing', 'Results are comparable', 'Testers ask less'], answer: 1, why: 'Same tasks let you compare results across people. Then you can see which problems repeat.'}
      ]
    },
    {
      id: 'polish-the-parts', order: 5,
      courseSlug: 'ux-design-course-5', courseTitle: 'Create High-Fidelity Designs and Prototypes in Figma',
      title: 'Polish the Parts',
      skill: 'Connecting Figma and accessibility terms to what they mean',
      mechanic: 'match', prop: 'wireframe-card',
      scene: 'Testing went well. Now you turn the wireframes into polished screens that developers will build next week.',
      takeaway: 'Reusable components and shared styles keep a design consistent. Accessibility choices like contrast and captions let more people use it.',
      rounds: [
        {prompt: 'Match each Figma term to what it means.', pairs: [['Component', 'A reusable part that updates everywhere'], ['Color style', 'Saved color others can reuse by name'], ['Variant', 'A state of a component, like pressed'], ['Prototype link', 'A tap that jumps to another screen'], ['Handoff', 'Giving developers the final designs']], why: 'Components and styles keep the file consistent. Links make it clickable, and handoff passes the finished design to the builders.'},
        {prompt: 'Match each accessibility term to its meaning.', pairs: [['Contrast', 'Brightness gap of text and background'], ['Alt text', 'A written description of an image'], ['Touch target', 'The area a finger can tap'], ['Captions', 'Text that shows spoken words in video'], ['Screen reader', 'Software that reads the screen aloud']], why: 'Each term removes a barrier. Contrast helps low vision, alt text and captions give text versions of images and sound, and big targets help fingers tap.'}
      ]
    },
    {
      id: 'fit-every-screen', order: 6,
      courseSlug: 'ux-design-course-6', courseTitle: 'Responsive Web Design in Adobe XD',
      title: 'Fit Every Screen',
      skill: 'Choosing how a layout should adapt to screen width',
      mechanic: 'gate', prop: 'wireframe-card',
      scene: 'Corner Commons also needs a website. You check each layout at phone, tablet and desktop widths.',
      takeaway: 'Responsive design adapts to the space available. Stack content in one column when it gets tight, and fold long menus into a single menu button.',
      prompt: 'What should the layout do at this width? (px = pixels)',
      actions: [{id: 'keep', label: 'Keep layout'}, {id: 'stack', label: 'Stack content'}, {id: 'collapse', label: 'Collapse menu'}],
      items: [
        {title: 'Three cards on a desktop screen', facts: ['Screen is about 1200 px wide', 'Each card is 300 px with space to spare'], answer: 'keep', why: 'There is plenty of room and the text reads well. A good layout does not change when nothing is wrong.'},
        {title: 'Three cards on a phone', facts: ['Screen is 360 px wide', 'Three cards squeezed side by side', 'Text breaks into one word per line'], answer: 'stack', why: 'Three columns will not fit on a narrow screen. Stacking the cards in one column keeps the text readable.'},
        {title: 'Seven menu links on a phone', facts: ['Screen is 375 px wide', 'Links run off the right edge', 'Stacked, they would fill the screen'], answer: 'collapse', why: 'A long menu will not fit across a phone. A menu button, often shown as three lines, keeps every link one tap away.'},
        {title: 'Two-column job list on a tablet', facts: ['Screen is 768 px wide', 'Each column is wide enough to read easily'], answer: 'keep', why: 'Two columns still have enough width. There is no need to change a layout that already works.'},
        {title: 'Photo beside text on a phone', facts: ['Screen is 360 px wide', 'Photo takes half the width', 'Text is squeezed into a thin strip'], answer: 'stack', why: 'Putting the photo above the text gives each its own full width. That is how content reflows on small screens.'},
        {title: 'Menu bar on a small tablet', facts: ['Links wrap onto three lines', 'Menu now covers half the screen', 'Stacking them would cover more'], answer: 'collapse', why: 'A menu that eats most of the screen pushes content out of view. A menu button frees that space and keeps every link one tap away.'},
        {title: 'Two form fields side by side on a phone', facts: ['Each field is about 150 px wide', 'Typing and tapping feel cramped'], answer: 'stack', why: 'Fields stacked one above the other have full width, which makes them easier to read, tap and fill in.'},
        {title: 'Two menu links on a phone', facts: ['Screen is 360 px wide', 'Both links fit in one row and are easy to tap'], answer: 'keep', why: 'Two short links fit in one row, so they need no menu button. Only change a layout that is actually cramped.'}
      ]
    },
    {
      id: 'job-fair-showcase', order: 7,
      courseSlug: 'ux-design-course-7', courseTitle: 'Design a User Experience for Social Good & Prepare for Jobs',
      title: 'Job Fair Showcase',
      skill: 'Reviewing the whole design process and sharing it well',
      mechanic: 'lane', prop: 'clipboard',
      scene: 'The Corner Commons app is ready. At a job fair, a panel asks you to walk them through your case study.',
      takeaway: 'Show your thinking, not just final screens. Start with real people, design so everyone can use it, and be honest about what you would change.',
      questions: [
        {prompt: 'Which portfolio piece best shows how you think?', options: ['Final screens only', 'A list of tools', 'Case study'], answer: 2, why: 'A case study shows the problem, your choices and what you learned. That is the skill employers look for.'},
        {prompt: 'Some app users read little English. What helps most?', options: ['Icons plus words', 'Slang and idioms', 'A long help page'], answer: 0, why: 'Pictures next to short words reduce how much reading people need. Plain language and more languages also help.'},
        {prompt: 'A recruiter asks what you would change. Best answer?', options: ['Say it is perfect', 'Fix and reason', 'Ask the panel'], answer: 1, why: 'A specific change with a reason shows honest reflection and learning, which employers value.'},
        {prompt: 'You design for busy families. What is the first step?', options: ['Pick the colors', 'Make final screens', 'Ask the families'], answer: 2, why: 'You learn needs by asking the people you design for. Colors and screens come after you understand them.'},
        {prompt: 'A coworker says your form labels are hard to read in sunlight. What should you check?', options: ['Page speed', 'Text contrast', 'Font name'], answer: 1, why: 'Contrast is the brightness gap between text and background. Too small a gap is hard to read in bright light or with low vision.'},
        {prompt: 'Your table does not fit on a small phone. What helps?', options: ['Stack each row', 'Shrink the text', 'Hide the data'], answer: 0, why: 'Stacking each row into its own block adapts the layout to the space while keeping all the information readable.'},
        {prompt: 'Which line names what users need, with no fix?', options: ['Add a help chat', 'Make it nicer', 'Parents need help'], answer: 2, why: 'A need names a person and a difficulty. The other two describe something to build, and one is too vague to act on.'},
        {prompt: 'Why show a failed first idea in a case study?', options: ['It fills space', 'It shows learning', 'It shows luck'], answer: 1, why: 'A first idea that failed, and what you changed after testing, shows how you learn. Employers value that more than a perfect story.'}
      ]
    }
  ]
};
