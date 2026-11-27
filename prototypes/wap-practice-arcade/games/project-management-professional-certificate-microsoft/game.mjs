export default {
  id: 'project-management-professional-certificate-microsoft',
  title: 'Launch Plan',
  tagline: 'Short practice breaks for new project coordinators.',
  role: 'You are the project coordinator at Harbor Light Community Trust, launching a free homework help hub.',
  program: 'Project Management Professional Certificate (Microsoft)',
  theme: {world: 'office', accent: '#a47f38', mood: 'day'},
  levels: [
    {
      id: 'scope-check', order: 1,
      courseSlug: 'pm-course-1', courseTitle: 'Project Management Foundations',
      title: 'Scope Check',
      skill: 'Telling agreed scope apart from new requests',
      mechanic: 'gate', prop: 'clipboard',
      scene: 'The charter for the homework help hub is signed. Requests are already landing in your inbox.',
      takeaway: 'Work listed in the charter is in scope. New ideas go through change control so the sponsor can weigh the cost and time.',
      prompt: 'Is this in the agreed scope, or a change?',
      actions: [{id: 'scope', label: 'In scope'}, {id: 'change', label: 'Change request'}],
      items: [
        {title: 'Print flyers for the kickoff night', facts: ['Charter lists a kickoff night for families', 'Flyers are listed under promotion'], answer: 'scope', why: 'The charter already includes the kickoff night and its flyers. Doing agreed work does not need a change request.'},
        {title: 'Add a third library site', facts: ['Charter names two library sites', 'Sponsor has not agreed to a third'], answer: 'change', why: 'The charter covers two sites. A third site means new cost and time, so it needs change control (steps to approve a change).'},
        {title: 'Text reminders before each event', facts: ['A volunteer suggested a text reminder', 'Charter lists reminders for every event'], answer: 'scope', why: 'Reminders are already in the charter. A volunteer asking for agreed work does not make it a change.'},
        {title: 'Add weekday evening sessions', facts: ['Charter says Saturday sessions only', 'A parent group asked for evenings'], answer: 'change', why: 'New session days are new work. Check the cost and staffing impact, then let the sponsor decide.'},
        {title: 'Build the family sign-up page', facts: ['Charter lists an online sign-up page', 'The design is in the approved plan'], answer: 'scope', why: 'The sign-up page is a listed deliverable. It is part of the agreed scope.'},
        {title: 'Give each child a free tablet', facts: ['Not mentioned in the charter', 'A donor suggested it on a call'], answer: 'change', why: 'A donor idea is not agreed scope, and it adds big cost. Log it and let the sponsor weigh it.'},
        {title: 'Offer the sign-up page in Spanish', facts: ['Charter says the page is English only', 'The translation would take a few days'], answer: 'change', why: 'A second language was not agreed. It adds design and writing work, so it needs a change request first.'}
      ]
    },
    {
      id: 'plan-the-launch', order: 2,
      courseSlug: 'pm-course-2', courseTitle: 'Initiating and Planning Projects',
      title: 'Plan the Launch',
      skill: 'Putting planning and scheduling steps in a logical order',
      mechanic: 'order', prop: 'blueprint',
      scene: 'Your sponsor wants a kickoff night and a clear plan for the hub. You start building both.',
      takeaway: 'A good plan lists what you must deliver, breaks it into tasks, then puts the tasks in order. Some tasks cannot start until another one ends.',
      rounds: [
        {prompt: 'Plan the kickoff night. Put the steps in order.', steps: ['Agree on the event date', 'Book the hall for that date', 'Send invitations with date and place', 'Confirm the headcount', 'Hold the event'], why: 'The date comes first, then the booking that holds it, then invitations that name the hall. Replies give the headcount before the night.'},
        {prompt: 'Build the project plan. Put the steps in order.', steps: ['Get the sponsor to sign the charter', 'List what the project must deliver', 'Break each deliverable into tasks', 'Put the tasks in order with dates', 'Share the plan with the team'], why: 'Know what you must deliver, split it into tasks, then order the tasks and add dates. You can only share a plan that exists.'}
      ]
    },
    {
      id: 'track-the-numbers', order: 3,
      courseSlug: 'pm-course-3', courseTitle: 'Project Scheduling and Cost Management',
      title: 'Track the Numbers',
      skill: 'Reading earned value, cost, schedule and critical path basics',
      mechanic: 'lane', prop: 'chart-folder',
      scene: 'Six weeks in, the sponsor asks if the hub project is on time and on budget. You open your numbers.',
      takeaway: 'Compare what you planned, what you earned and what you spent. Anything that slips on the critical path moves the end date.',
      questions: [
        {prompt: 'Less work is done than planned. Is the schedule index (SPI) below or above 1?', options: ['Below 1', 'Above 1', 'Exactly 1'], answer: 0, why: 'SPI (schedule performance index) is earned value divided by planned value. Less work done than planned gives a result below 1.'},
        {prompt: 'Work done is worth $50. You spent $60. Cost status?', options: ['On budget', 'Over budget', 'Under budget'], answer: 1, why: 'You paid more than the work was worth. That means the project is over budget.'},
        {prompt: 'Cost variance is which sum?', options: ['Earned minus actual', 'Planned minus actual', 'Actual plus planned'], answer: 0, why: 'Cost variance is earned value (EV) minus actual cost (AC). A negative result means over budget.'},
        {prompt: 'Work done is worth $80 but $100 was planned. Schedule status?', options: ['Behind plan', 'Ahead of plan', 'On plan'], answer: 0, why: 'Schedule variance is earned value minus planned value: 80 minus 100 is negative 20. That means behind schedule.'},
        {prompt: 'What is the critical path?', options: ['Cheapest task list', 'Shortest chain', 'Longest task chain'], answer: 2, why: 'The critical path is the longest chain of linked tasks. It sets the earliest the project can finish.'},
        {prompt: 'A task on the critical path slips 2 days. The end date...', options: ['Stays the same', 'Ends 2 days later', 'Ends 2 days sooner'], answer: 1, why: 'Critical path tasks have no spare time. A 2-day slip pushes the whole finish out by 2 days.'},
        {prompt: 'Which index compares work done to money spent?', options: ['SPI', 'EAC', 'CPI'], answer: 2, why: 'CPI (cost performance index) is earned value divided by actual cost. It shows the value you get for each dollar spent.'}
      ]
    },
    {
      id: 'risk-response', order: 4,
      courseSlug: 'pm-course-4', courseTitle: 'Managing Project Risks, Changes and Stakeholders',
      title: 'Risk Response',
      skill: 'Matching a risk response to the right strategy',
      mechanic: 'sort', prop: 'sticky-note',
      scene: 'In a risk workshop, your team lists what could go wrong. Now you decide how to respond.',
      takeaway: 'Four common responses to a threat are avoid, mitigate, transfer and accept. Pick one on purpose and write it down.',
      prompt: 'Which response strategy is this?',
      bins: [{id: 'avoid', label: 'Avoid'}, {id: 'reduce', label: 'Mitigate'}, {id: 'transfer', label: 'Transfer'}, {id: 'accept', label: 'Accept'}],
      items: [
        {label: 'Drop the outdoor stage', note: 'Rain can no longer affect it', answer: 'avoid', why: 'Taking the risky part out of the plan removes the threat completely. That is avoiding the risk.'},
        {label: 'Train a backup tutor', note: 'One tutor might leave', answer: 'reduce', why: 'A backup does not stop a tutor leaving, but it makes the loss much smaller. That mitigates (reduces) the risk.'},
        {label: 'Buy cancellation insurance', note: 'Covers the kickoff night', answer: 'transfer', why: 'Insurance moves the money loss to the insurer. Passing the impact to another party is transferring.'},
        {label: 'Live with a tiny, cheap risk', note: 'Watch it, take no other action', answer: 'accept', why: 'When a risk is small and cheap to live with, you can choose to accept it. You note it and keep watching, but plan no other action.'},
        {label: 'Use a proven tool instead', note: 'The new tool might fail on launch day', answer: 'avoid', why: 'Choosing the proven tool removes the risk of the untested one. Eliminating the cause is avoiding.'},
        {label: 'Weekly check-ins with vendor', note: 'The vendor often runs late', answer: 'reduce', why: 'Regular check-ins lower the chance of a surprise delay. Making a risk less likely is mitigating it.'},
        {label: 'Fixed-price printer contract', note: 'The printer pays any overrun', answer: 'transfer', why: 'With a fixed price, extra cost falls on the printer. The money impact moves to another party.'},
        {label: 'Handle a printer jam if it hits', note: 'Small problem, deal with it if it occurs', answer: 'accept', why: 'You choose to deal with the small problem only if it occurs. Planning no action in advance is accepting.'},
        {label: 'Test the sign-up page early', note: 'To find faults before launch', answer: 'reduce', why: 'Early testing makes launch-day faults less likely. That lowers the chance of the risk, so it mitigates it.'}
      ]
    },
    {
      id: 'team-talk', order: 5,
      courseSlug: 'pm-course-5', courseTitle: 'Project Leadership, Communication and Stakeholder Management',
      title: 'Team Talk',
      skill: 'Choosing how to handle people and communication problems',
      mechanic: 'gate', prop: 'megaphone',
      scene: 'The hub team is tired and a few things are off. Each problem needs a different kind of conversation.',
      takeaway: 'Talk to people one at a time before you bring them together. Fix communication to fit your audience, and escalate only what you cannot resolve.',
      prompt: 'What is the best next step?',
      actions: [{id: 'private', label: 'Talk one-on-one'}, {id: 'channel', label: 'Change channel'}, {id: 'escalate', label: 'Escalate'}],
      items: [
        {title: 'Two leads argue over priorities', facts: ['Work has stalled between them', 'You have not spoken to each one alone'], answer: 'private', why: 'Talking to each person first shows the real worry behind their stance. Then a joint talk can focus on solutions.'},
        {title: 'Sponsor is surprised at meetings', facts: ['Weekly status email is rarely opened', 'Sponsor answers quickly to phone calls'], answer: 'channel', why: 'A plan that is not reaching people must change. Use the format and channel the sponsor actually responds to.'},
        {title: 'Volunteer reports harassment', facts: ['A volunteer says a teammate made unwanted comments', 'The trust has a written conduct policy'], answer: 'escalate', why: 'Harassment reports belong with leaders who own the conduct policy. Do not try to settle it yourself.'},
        {title: 'Tutor keeps missing deadlines', facts: ['Three deadlines missed this month', 'Nobody has asked why yet'], answer: 'private', why: 'Ask in private to find the cause, such as overload or unclear goals. Then agree on steps and support.'},
        {title: 'Shift changes get missed', facts: ['Changes sit in a long monthly email', 'Most volunteers read their texts quickly'], answer: 'channel', why: 'The message is not reaching its readers. Send short, timely texts, which is the channel they already read.'},
        {title: 'Leads still deadlocked on budget', facts: ['You spoke with both and mediated', 'Only the sponsor controls the extra budget'], answer: 'escalate', why: 'You have tried to resolve it, and the decision is beyond your authority. Take it to the sponsor with the options.'},
        {title: 'Quiet volunteer skips sessions', facts: ['Usually very reliable', 'Looked tired at the last session'], answer: 'private', why: 'A private, friendly chat finds out what is wrong before you assume anything.'},
        {title: 'Partner never answers email', facts: ['They answer questions in group chat', 'Their team lead prefers short messages'], answer: 'channel', why: 'Switch to the channel and style they use. A message only helps if the reader sees it.'}
      ]
    },
    {
      id: 'sprint-run', order: 6,
      courseSlug: 'pm-course-6', courseTitle: 'Agile Project Management',
      title: 'Sprint Run',
      skill: 'Recalling basic Agile and Scrum terms and roles',
      mechanic: 'lane', prop: 'calendar-card',
      scene: 'Your team tries Scrum for the tutoring app. On day one, everyone has a question about who does what.',
      takeaway: 'Scrum works in short sprints with a ranked backlog and a team that plans only what it can finish at its steady pace.',
      questions: [
        {prompt: 'Who decides the order of the product backlog?', options: ['Scrum Master', 'Product Owner', 'Tester'], answer: 1, why: 'The Product Owner ranks the backlog so the most valuable work comes first.'},
        {prompt: 'What do you call a big, vague backlog item that must be split up?', options: ['Epic', 'Story', 'Retro'], answer: 0, why: 'An epic is large work. A story is small and specific. Split an epic into stories before the team plans it.'},
        {prompt: 'What do you call a short, fixed block of time for work?', options: ['Backlog', 'Epic', 'Sprint'], answer: 2, why: 'A sprint is a short time box, often one to four weeks, in which the team finishes a set of work.'},
        {prompt: 'Which Scrum event is for talking about how to improve?', options: ['Daily stand-up', 'Retrospective', 'Sprint planning'], answer: 1, why: 'A retrospective looks back on how the team worked and picks improvements for the next sprint.'},
        {prompt: 'Past sprints each finished about 30 story points. Plan the next one for...', options: ['60 points', '45 points', 'About 30 points'], answer: 2, why: 'Story points score the size of work. About 30 is your steady pace (velocity). Planning far above it means unfinished work.'},
        {prompt: 'Who helps the team follow Scrum and clears blockers?', options: ['Scrum Master', 'Product Owner', 'Sponsor'], answer: 0, why: 'The Scrum Master coaches the team on Scrum and helps remove what is slowing them down.'},
        {prompt: 'A user story is written from whose point of view?', options: ['The developer\'s', 'The manager\'s', 'The user\'s'], answer: 2, why: 'A user story says what a user wants and why. That keeps the team focused on value to real people.'}
      ]
    },
    {
      id: 'tools-of-the-trade', order: 7,
      courseSlug: 'pm-course-7', courseTitle: 'Microsoft Project & Power BI for Project Managers',
      title: 'Tools of the Trade',
      skill: 'Connecting Microsoft Project and Power BI terms to their meaning',
      mechanic: 'match', prop: 'database-cylinder',
      scene: 'You will build the schedule in Microsoft Project, then show status to the sponsor in Power BI.',
      takeaway: 'Microsoft Project holds the plan and its baseline. Power BI turns that data into simple visuals that answer whether you are on track.',
      rounds: [
        {prompt: 'Match each Microsoft Project term to its meaning.', pairs: [['Baseline', 'A saved copy of the original plan'], ['Gantt chart', 'Task bars laid out on a timeline'], ['Dependency', 'A link where one task waits on another'], ['Critical path', 'Chain of tasks that sets the end date'], ['Resource', 'A person or item assigned to tasks']], why: 'The baseline lets you measure drift. The Gantt chart shows the plan, dependencies link tasks, and the critical path sets the finish.'},
        {prompt: 'Match each Power BI term to its meaning.', pairs: [['Dashboard', 'A page of key visuals for quick status'], ['Card visual', 'Shows one key number, like days late'], ['Drill-down', 'Click to see the detail behind a total'], ['Slicer', 'A control that filters the other visuals']], why: 'A good dashboard shows the main status first. Cards show key numbers, slicers filter, and drill-down gives detail when someone asks.'}
      ]
    },
    {
      id: 'wrap-it-up', order: 8,
      courseSlug: 'pm-course-8', courseTitle: 'Project Management Capstone',
      title: 'Wrap It Up',
      skill: 'Reviewing a whole project from start to close',
      mechanic: 'order', prop: 'folder',
      scene: 'The hub is open. Before the team review, you walk through how the whole project ran, from start to close.',
      takeaway: 'Measure against the baseline and report simply. When something slips, check the impact first, then let the sponsor decide.',
      rounds: [
        {prompt: 'Run a weekly check on the hub. Put the steps in order.', steps: ['Compare progress with the baseline', 'Work out cost and schedule variance', 'See if a slip hits the critical path', 'Tell the sponsor in one dashboard card'], why: 'You need the baseline to measure drift. Variances show a slip, then the critical path shows if it moves the end date. Then you report it simply.'},
        {prompt: 'A vendor is late. Put the response in order.', steps: ['Spot that the vendor is late', 'Check the effect on the end date', 'Bring the sponsor your options', 'Update the plan to match the choice', 'Send the team the new schedule'], why: 'Notice it, measure the impact, then let the sponsor choose. Change the plan to match the choice, and only then can you share the new dates.'},
        {prompt: 'Close out the project. Put the steps in order.', steps: ['Hold a lessons learned session', 'Write up the lessons learned report', 'Archive the records, report included', 'Declare the project closed'], why: 'The session finds the lessons, the report captures them, and the archive keeps them for future projects. Close only once the records are safe.'}
      ]
    }
  ]
};
