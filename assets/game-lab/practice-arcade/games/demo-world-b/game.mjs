// Demo game for previewing the site, studio, cloud and lab worlds. It uses the first world (site);
// the world-preview procedure temporarily points theme.world at each other world id.
// Original wording; people and companies are fictional.
export default {
  id: 'demo-world-b',
  title: 'World Preview B',
  tagline: 'A tour of the site, studio, cloud and lab settings.',
  role: 'You are a new team member at Fernhill Works, learning the daily calls on four different teams.',
  program: 'Kit preview program',
  theme: {world: 'site', accent: '#ad2c4d', mood: 'day'},
  levels: [
    {
      id: 'site-checks',
      order: 1,
      courseSlug: 'preview-course-1',
      courseTitle: 'Preview Course 1',
      title: 'Morning Site Checks',
      skill: 'Deciding if a site task is safe to start',
      mechanic: 'gate',
      prop: 'clipboard',
      takeaway: 'Check the hazard first. Start routine work, pause anything unsafe, and ask the lead when the plan is unclear.',
      prompt: 'What is the right call for this task?',
      actions: [
        {id: 'go', label: 'Start work'},
        {id: 'stop', label: 'Pause it'},
        {id: 'ask', label: 'Ask lead'}
      ],
      items: [
        {title: 'Stack bricks on a flat pad', facts: ['Ground is level and dry', 'Pallet is rated for the load'], answer: 'go', why: 'Level ground and a rated pallet make this routine work. Start, and keep the walkway clear.'},
        {title: 'Climb a ladder with a cracked rail', facts: ['Crack is near the top step', 'A spare ladder is in the shed'], answer: 'stop', why: 'A cracked ladder can fail under weight. Tag it out and swap in the spare before anyone climbs.'},
        {title: 'Drawing shows two beam heights', facts: ['Plan A says 3 m', 'Plan B says 3.5 m'], answer: 'ask', why: 'Two plans disagree, so guessing risks costly rework. Ask the lead which drawing is current.'},
        {title: 'Set out cones around the lift area', facts: ['Cones are in the cage', 'Lift starts in ten minutes'], answer: 'go', why: 'Marking the zone is a standard step you can do now. It keeps people out before the lift begins.'},
        {title: 'Lift beam near a loose power line', facts: ['Line sags about 4 m up', 'Crane arm reaches 6 m'], answer: 'stop', why: 'Cranes and live lines are a deadly mix. Pause the lift until the line is made safe.'},
        {title: 'New label on a paint tin', facts: ['Label shows an unfamiliar symbol', 'Safety sheet is not on site'], answer: 'ask', why: 'You cannot judge a hazard you cannot read. Ask the lead for the safety sheet before opening the tin.'}
      ]
    },
    {
      id: 'studio-review',
      order: 2,
      courseSlug: 'preview-course-2',
      courseTitle: 'Preview Course 2',
      title: 'Design Review Round',
      skill: 'Giving a clear next step on a design draft',
      mechanic: 'gate',
      prop: 'folder',
      takeaway: 'Good feedback names one clear next step: approve what works, revise what is unclear, and flag what breaks the brief.',
      prompt: 'What should happen to this draft?',
      actions: [
        {id: 'ok', label: 'Approve'},
        {id: 'edit', label: 'Revise'},
        {id: 'flag', label: 'Flag it'}
      ],
      items: [
        {title: 'Poster with a clear headline', facts: ['Text is easy to read', 'Colors match the brand guide'], answer: 'ok', why: 'It is readable and on brand. Approve it and move on to the next piece.'},
        {title: 'Flyer with tiny grey text', facts: ['Body text is 6 pt', 'Light grey on white'], answer: 'edit', why: 'Readers will struggle with small, faint text. Ask for a larger size and a darker color.'},
        {title: 'Logo copied from another brand', facts: ['Looks like a known company mark', 'Designer says it is just inspiration'], answer: 'flag', why: 'Copying another mark risks legal trouble. Flag it to the lead before it goes any further.'},
        {title: 'Banner with a wrong event date', facts: ['Brief says 12 May', 'Draft says 21 May'], answer: 'edit', why: 'A simple mistake with a simple fix. Send it back with the correct date.'},
        {title: 'Brochure that fits the brief', facts: ['Three pages as asked', 'Photos are cleared for use'], answer: 'ok', why: 'It meets every point in the brief. Approve it.'},
        {title: 'Photo with a stranger clearly visible', facts: ['No signed permission', 'Used on the cover'], answer: 'flag', why: 'Using a photo of a person without their permission is a risk. Flag it and ask for a cleared photo.'}
      ]
    },
    {
      id: 'cloud-routing',
      order: 3,
      courseSlug: 'preview-course-3',
      courseTitle: 'Preview Course 3',
      title: 'Cloud Request Routing',
      skill: 'Choosing how to handle a cloud service request',
      mechanic: 'gate',
      prop: 'packet',
      takeaway: 'Match the response to the risk: approve routine requests, limit anything broad, and deny what has no clear need.',
      prompt: 'How should this request be handled?',
      actions: [
        {id: 'allow', label: 'Allow'},
        {id: 'limit', label: 'Limit'},
        {id: 'deny', label: 'Deny'}
      ],
      items: [
        {title: 'Read access to one report file', facts: ['Requested by the finance analyst', 'Needed for month-end'], answer: 'allow', why: 'Narrow access for a clear job is fine. Allow it.'},
        {title: 'Admin rights on every project', facts: ['Requested by an intern', 'No reason given'], answer: 'deny', why: 'Full admin everywhere with no reason is far too broad. Deny it.'},
        {title: 'Write access to the whole storage area', facts: ['Team only needs one folder', 'Request is from a team lead'], answer: 'limit', why: 'The need is real but the scope is too wide. Limit it to the one folder.'},
        {title: 'Open a test server to the internet', facts: ['Holds no real customer data', 'Needed for a two-day demo'], answer: 'limit', why: 'Two days with no real data is a small risk, so limit the access to the demo days and review it after.'},
        {title: 'Restart a stuck app service', facts: ['Owner of the app asked', 'Standard runbook step'], answer: 'allow', why: 'A routine step from the owner is safe. Allow it.'},
        {title: 'Share a database key by chat', facts: ['Sent from an unknown account', 'Asks to skip the ticket'], answer: 'deny', why: 'Unknown sender and a skipped process are warning signs. Deny it and report it.'}
      ]
    },
    {
      id: 'lab-data-types',
      order: 4,
      courseSlug: 'preview-course-4',
      courseTitle: 'Preview Course 4',
      title: 'Sort the Lab Data',
      skill: 'Recognizing common kinds of data in a lab sheet',
      mechanic: 'sort',
      prop: 'folder',
      takeaway: 'Knowing the kind of data in a column tells you what you can do with it: add numbers, sort dates, group categories.',
      prompt: 'What kind of data is this?',
      bins: [
        {id: 'number', label: 'Number'},
        {id: 'date', label: 'Date'},
        {id: 'text', label: 'Category'}
      ],
      items: [
        {label: 'Sample weight: 48.2 g', answer: 'number', why: 'A weight is a measured amount, so you can add it up or take an average.'},
        {label: 'Test date: 2026-03-14', answer: 'date', why: 'A calendar day is a date, so you can sort it in time order or count days between.'},
        {label: 'Batch: North field', answer: 'text', why: 'Batch names are categories. You group or filter by them; you do not add them.'},
        {label: 'Readings taken: 12', answer: 'number', why: 'A count of readings is a number, so totals and averages make sense.'},
        {label: 'Started: May 2', note: 'Month written as a word', answer: 'date', why: 'Even written in words, a day of the year is a date value.'},
        {label: 'Result: Passed', answer: 'text', why: 'Pass and fail are labels for groups of samples, which makes them a category.'},
        {label: 'Shelf: Cold room B', note: 'Names a storage place', answer: 'text', why: 'A shelf name is a category. You group samples by it; you do not add it up.'},
        {label: 'Moisture: 15%', answer: 'number', why: 'A percentage is a number you can compare and calculate with.'}
      ]
    }
  ]
};
