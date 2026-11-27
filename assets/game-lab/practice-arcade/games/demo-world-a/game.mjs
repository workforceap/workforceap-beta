// Demo game that previews four worlds built for the kit: server-room, warehouse, clinic and factory.
// A game has a single theme.world (there is no per-level world), so every level renders in the first world
// (server-room). The scene lines after level 1 are therefore worded so they do not claim a place on screen. To preview
// another world or mood, open play.html?game=demo-world-a&world=<id>&mood=<day|dusk|night>. One short level per world topic; the
// variety rule for a 4-level game needs at least 2 mechanics, so the last level is a 'sort'. A few items carry their
// own prop (item.prop) to show the extra prop set.
// Original wording; people and companies are fictional; addresses use RFC 5737 ranges.
export const PREVIEW_WORLDS = ['server-room', 'warehouse', 'clinic', 'factory'];

export default {
  id: 'demo-world-a',
  title: 'World Tour A',
  tagline: 'A quick tour of four workplaces, one practice break each.',
  role: 'You are a new hire rotating through four job sites in your first week at Northfield Works.',
  program: 'Kit demo (worlds A)',
  theme: {world: 'server-room', accent: '#2b7bb9', mood: 'day'},
  levels: [
    {
      id: 'rack-alerts',
      order: 1,
      courseSlug: 'demo-course-1',
      courseTitle: 'Demo: Data Center Basics',
      title: 'Rack Alerts',
      skill: 'Deciding which server room alerts need action now',
      scene: 'Your first shift in the server room. Alerts pop up on the big screen at the back.',
      mechanic: 'gate',
      prop: 'database-cylinder',
      takeaway: 'Act on alerts that put service or safety at risk, and log the rest so patterns show up over time.',
      prompt: 'An alert pops up. Act on it now, or log it for later?',
      actions: [
        {id: 'act', label: 'Act now'},
        {id: 'log', label: 'Log it'}
      ],
      items: [
        {title: 'Rack 12 inlet air is 41 C', facts: ['Normal is about 24 C', 'Rising for 10 minutes'], answer: 'act', why: 'Hot inlet air means the servers can overheat and shut down. Check the cooling for that row right away.'},
        {title: 'One of two power feeds is down', facts: ['Server 198.51.100.20 now on one feed', 'No backup feed left'], answer: 'act', why: 'With only one feed left, the next power blip takes the server down. Restore the second feed now.'},
        {title: 'Disk 80% full on a test box', facts: ['Grows about 1% a week', 'Test server only'], answer: 'log', why: 'Slow growth on a test box is not urgent. Log it so someone plans a cleanup before it fills.'},
        {title: 'Door badge reader beeped twice', facts: ['Badge holder: Priya Nand, staff', 'Door opened normally'], answer: 'log', why: 'A known staff member got in normally. Logging is enough; nothing is at risk.'},
        {title: 'Water sensor wet under row C', facts: ['Sensor sits under the raised floor', 'Row C holds live servers'], answer: 'act', why: 'Water near live power and servers is a safety and outage risk. Respond now and call facilities.'},
        {title: 'Fan speed up 5% on rack 3', facts: ['Temps still normal', 'Busy hour started'], answer: 'log', why: 'Fans speeding up a little during a busy hour is normal. Note it and watch for a trend.'}
      ]
    },
    {
      id: 'dock-check',
      order: 2,
      courseSlug: 'demo-course-2',
      courseTitle: 'Demo: Warehouse Receiving',
      title: 'Dock Check',
      skill: 'Accepting or holding deliveries at the receiving dock',
      scene: 'Day two of your rotation. The receiving team asks you to check today\'s deliveries.',
      mechanic: 'gate',
      prop: 'barcode-box',
      takeaway: 'Match every delivery to its order and check its condition before it goes on a shelf.',
      prompt: 'A pallet rolls in from the dock. Accept it or hold it?',
      actions: [
        {id: 'accept', label: 'Accept'},
        {id: 'hold', label: 'Hold'}
      ],
      items: [
        {title: '20 cases, order PO-4471', facts: ['Count matches the order', 'Boxes dry and sealed'], answer: 'accept', why: 'The count matches and the boxes are in good shape. Scan it in and send it to putaway.'},
        {title: 'Pallet with crushed corner', prop: 'pallet', facts: ['Two boxes dented', 'Label still readable'], answer: 'hold', why: 'Damage must be checked and noted before you sign. Hold it and photograph the damage.'},
        {title: 'No order number on the label', facts: ['From Lakeview Supply', 'Nobody expects it today'], answer: 'hold', why: 'Without an order to match, you cannot confirm it is ours. Hold it until purchasing confirms.'},
        {title: '12 cartons, order PO-4502', facts: ['Order said 12 cartons', 'Seal number matches'], answer: 'accept', why: 'Count and seal match the paperwork, so the delivery is complete. Accept and scan it.'},
        {title: 'Frozen goods arrive soft', facts: ['Should be frozen solid', 'Truck cooler was off'], answer: 'hold', why: 'Thawed frozen goods may be unsafe. Hold them and report the problem to the carrier.'},
        {title: 'Office paper, 40 boxes', prop: 'pallet', facts: ['Order PO-4510 says 40', 'Shrink wrap intact'], answer: 'accept', why: 'Everything matches and the wrap is intact. Accept it and move it to storage.'}
      ]
    },
    {
      id: 'front-desk',
      order: 3,
      courseSlug: 'demo-course-3',
      courseTitle: 'Demo: Medical Office Basics',
      title: 'Front Desk',
      skill: 'Choosing the right next step for a clinic front desk request',
      scene: 'Day three of your rotation. You cover front desk requests for the clinic team.',
      mechanic: 'gate',
      prop: 'chart-folder',
      takeaway: 'Check identity before sharing anything, and send clinical questions to clinical staff.',
      prompt: 'A request reaches the front desk. What do you do?',
      actions: [
        {id: 'help', label: 'Handle it'},
        {id: 'verify', label: 'Verify first'},
        {id: 'nurse', label: 'Ask a nurse'}
      ],
      items: [
        {title: 'Patient wants to book a checkup', prop: 'calendar-card', facts: ['Returning patient, Leo Marsh', 'Open slots next week'], answer: 'help', why: 'Booking a routine visit is front desk work. Offer a slot and confirm the time.'},
        {title: 'Caller asks for test results', facts: ['Says she is the patient', 'Calling from an unknown number'], answer: 'verify', why: 'Results are private. Confirm who is calling with the clinic identity steps before sharing anything.'},
        {title: 'Patient asks if a rash is serious', facts: ['Rash started yesterday', 'Wants advice now'], answer: 'nurse', why: 'Judging symptoms is clinical work. Bring in a nurse instead of guessing.'},
        {title: 'Visitor asks to see a chart', facts: ['Says he is the patient\'s brother', 'No consent form on file'], answer: 'verify', why: 'Family members need the patient\'s consent on file. Check before showing any records.'},
        {title: 'Patient needs a parking pass', facts: ['Has an appointment today', 'Passes are at the desk'], answer: 'help', why: 'A parking pass for a booked patient is a simple desk task. Hand it over.'},
        {title: 'Caller feels dizzy after new pills', prop: 'pillbottle', facts: ['Started medicine two days ago', 'Asks if she should stop'], answer: 'nurse', why: 'Medicine side effects need clinical advice. Transfer the call to a nurse right away.'},
        {title: 'Patient updates home address', facts: ['Shows photo ID', 'Moved last month'], answer: 'help', why: 'With ID shown, updating contact details is routine desk work. Update the record.'}
      ]
    },
    {
      id: 'line-sort',
      order: 4,
      courseSlug: 'demo-course-4',
      courseTitle: 'Demo: Factory Floor Safety',
      title: 'Line Sort',
      skill: 'Sorting factory floor issues by who should handle them',
      scene: 'Day four of your rotation. The line lead asks you to route issues to the right people.',
      mechanic: 'sort',
      prop: 'gear',
      takeaway: 'Stop the line for danger, call maintenance for broken machines, and send quality issues to the quality team.',
      prompt: 'Who should handle this issue on the line?',
      bins: [
        {id: 'stop', label: 'Stop the line'},
        {id: 'maint', label: 'Maintenance'},
        {id: 'quality', label: 'Quality team'}
      ],
      items: [
        {label: 'Guard door left open', note: 'Robot cell is running', answer: 'stop', why: 'An open guard near a moving robot can injure someone. Stop the line first.'},
        {label: 'Conveyor belt squeals', note: 'Still running normally', answer: 'maint', why: 'A noisy belt is a machine problem, not an emergency. Call maintenance to check it.'},
        {label: 'Parts have rough edges', note: 'Five in the last batch', answer: 'quality', why: 'A pattern of bad parts is a quality issue. The quality team checks the batch.'},
        {label: 'Oil spill in the walkway', note: 'Near the main aisle', answer: 'stop', why: 'A slip hazard in a walkway needs action now. Stop work nearby and clean it up.'},
        {label: 'Air tool losing pressure', prop: 'valve', note: 'Slows down each hour', answer: 'maint', why: 'A tool that is wearing out needs repair. Maintenance can fix the air line.'},
        {label: 'Label printed off-center', note: 'Every box this morning', answer: 'quality', why: 'Off-center labels on every box are a product defect. Send it to the quality team.'},
        {label: 'Worker hand near pinch point', note: 'Machine is moving', answer: 'stop', why: 'A hand near a moving pinch point is an injury about to happen. Stop the line.'},
        {label: 'Indicator lamp burned out', note: 'On the control cabinet', answer: 'maint', why: 'A dead lamp is a small repair. Ask maintenance to replace it.'}
      ]
    }
  ]
};
