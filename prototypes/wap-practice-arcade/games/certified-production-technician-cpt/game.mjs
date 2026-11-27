export default {
  id: 'certified-production-technician-cpt',
  title: 'Line Lead',
  tagline: 'Short practice breaks for new production technicians.',
  role: 'You are a new production technician at Ridgeway Components, learning every station on the line.',
  program: 'Certified Production Technician (CPT)',
  theme: {world: 'factory', accent: '#b8860b', mood: 'day'},
  levels: [
    {
      id: 'follow-the-flow', order: 1,
      courseSlug: 'cpt-course-1', courseTitle: 'Introduction to Manufacturing',
      title: 'Follow the Flow',
      skill: 'Telling raw material, work in process and finished goods apart',
      mechanic: 'sort', prop: 'crate',
      scene: 'Your first day at Ridgeway. Your lead walks you from the dock to shipping and asks where each item sits.',
      takeaway: 'Raw material becomes work in process, then finished goods. Knowing where an item sits tells you what happens to it next.',
      prompt: 'Where is this item in the production flow?',
      bins: [{id: 'raw', label: 'Raw material'}, {id: 'wip', label: 'In process'}, {id: 'finished', label: 'Finished goods'}],
      items: [
        {label: 'Coil of sheet steel at the dock', note: 'Not cut or shaped yet', answer: 'raw', why: 'Nothing has been done to the steel yet. It is raw material waiting to enter the process.'},
        {label: 'Bags of plastic pellets', note: 'Waiting to be melted and molded', answer: 'raw', why: 'The pellets still have to be melted and shaped into parts, so they are raw material.'},
        {label: 'Bundle of uncut aluminum bars', answer: 'raw', why: 'Bars that have not been cut or machined are raw material. Work on them has not started.'},
        {label: 'Brackets drilled, not yet painted', answer: 'wip', why: 'Some steps are done and some are left. A part partway through the steps is work in process.'},
        {label: 'Half-built pumps on the line', answer: 'wip', why: 'The pumps are being put together right now, so they are work in process, not products yet.'},
        {label: 'Welded frames awaiting inspection', answer: 'wip', why: 'Inspection is still one of the steps. Until the frames pass and are packed, they are work in process.'},
        {label: 'Boxed, labeled pumps on a pallet', note: 'Sitting in the shipping area', answer: 'finished', why: 'The pumps are built, packed and labeled for a customer. That makes them finished goods.'},
        {label: 'Painted brackets packed to ship', answer: 'finished', why: 'Every step is done and the order is packed. Finished goods are ready to ship.'},
        {label: 'Sealed cartons with a ship label', note: 'Inspected and ready to go', answer: 'finished', why: 'Inspected, sealed and labeled means no more work is planned. These are finished goods.'}
      ]
    },
    {
      id: 'in-or-out', order: 2,
      courseSlug: 'cpt-course-2', courseTitle: 'Blueprint Reading and Technical Drawing',
      title: 'In or Out?',
      skill: 'Checking measured parts against the tolerance on a drawing',
      mechanic: 'gate', prop: 'blueprint',
      scene: 'A bin of machined parts reaches your bench with the drawing clipped on top. Time to check the sizes.',
      takeaway: 'Work out the smallest and largest size the drawing allows, then compare. Outside that range, tag the part and hold it for quality.',
      prompt: 'Compare the size to the drawing. Pass the part, or tag and hold it?',
      actions: [{id: 'pass', label: 'Pass'}, {id: 'hold', label: 'Tag and hold'}],
      items: [
        {title: 'Bracket hole', facts: ['Drawing: 25.00 ±0.05 mm', 'You measure 25.03 mm'], answer: 'pass', why: 'Plus or minus 0.05 allows 24.95 to 25.05 mm. 25.03 is inside that range, so the hole passes.'},
        {title: 'Bracket hole, next part', facts: ['Drawing: 25.00 ±0.05 mm', 'You measure 24.92 mm'], answer: 'hold', why: 'The smallest size allowed is 24.95 mm, so 24.92 is too small. Tag it and set it aside. Quality decides what happens to it.'},
        {title: 'Shaft diameter', facts: ['Drawing: 50.00 +0.00 / -0.05 mm', 'You measure 50.02 mm'], answer: 'hold', why: 'The +0.00 means the shaft may never be bigger than 50.00 mm. At 50.02 it is too big, so it is held.'},
        {title: 'Shaft diameter, next part', facts: ['Drawing: 50.00 +0.00 / -0.05 mm', 'You measure 49.97 mm'], answer: 'pass', why: 'This tolerance allows 49.95 to 50.00 mm. 49.97 falls inside, so the shaft passes.'},
        {title: 'Plate length', facts: ['Drawing: 120.0 ±0.5 mm', 'You measure 120.4 mm'], answer: 'pass', why: 'The plate may be 119.5 to 120.5 mm long. 120.4 is just inside the top of that range.'},
        {title: 'Spacer width', facts: ['Drawing gives limits: 79.8 to 80.2 mm', 'You measure 80.3 mm'], answer: 'hold', why: 'Some drawings list the two limits instead of a plus and minus. 80.3 is above the 80.2 top limit, so it is out.'},
        {title: 'Locating pin', facts: ['Drawing: 10.00 +0.10 / -0.00 mm', 'You measure 9.98 mm'], answer: 'hold', why: 'The -0.00 means the pin may not be smaller than 10.00 mm. At 9.98 it is under size, so hold it.'}
      ]
    },
    {
      id: 'prove-the-program', order: 3,
      courseSlug: 'cpt-course-3', courseTitle: 'Machining and CNC Operations',
      title: 'Prove the Program',
      skill: 'Putting CNC setup and response steps in a safe order',
      mechanic: 'order', prop: 'gear',
      scene: 'The CNC mill has a new part program and a setup sheet. You run it for the very first time today.',
      takeaway: 'Never trust a new program or a new tool at full speed. Set offsets, test slowly, and check the first part before you run more.',
      rounds: [
        {prompt: 'Run a new part program for the first time. Put the steps in order.', steps: ['Read the setup sheet', 'Put the listed tools in holders', 'Measure and enter tool offsets', 'Dry run at a low feed rate', 'Run and measure the first part'], why: 'The setup sheet lists the tools. Each tool needs an offset, which tells the machine how long it is. A slow dry run catches a bad path. The first part proves the setup.'},
        {prompt: 'An end mill wears out mid-job. Put the tool change steps in order.', steps: ['Press feed hold to stop the axes', 'Stop the spindle, wait till still', 'Swap in the new end mill', 'Touch off to set its length offset', 'Check the depth on the next part'], why: 'Feed hold stops the axes, but the spindle keeps turning until you stop it. A new tool has a new length, so set its offset or every depth will be off.'},
        {prompt: 'Smoke and a loud squeal come from the cut. Put the steps in order.', steps: ['Hit E-stop to halt the machine', 'Wait for all motion to stop', 'Check the tool, coolant and part', 'Fix the cause before restarting'], why: 'Smoke and squealing mean something is wrong, like a broken tool or no coolant. Stop first, look only once it is still, and restart only after the cause is fixed.'}
      ]
    },
    {
      id: 'weld-words', order: 4,
      courseSlug: 'cpt-course-4', courseTitle: 'Welding Fundamentals',
      title: 'Weld Words',
      skill: 'Connecting weld defects, gear and symbols to what they mean',
      mechanic: 'match', prop: 'block',
      scene: 'You spend the morning in the weld bay, checking welds and drawings and helping the welders get set up.',
      takeaway: 'A weld symbol tells you where, what kind and how big. Any crack in a weld means hold the part.',
      rounds: [
        {prompt: 'Match each weld defect to what you would see.', pairs: [['Porosity', 'Tiny gas holes trapped in the weld'], ['Undercut', 'A groove melted into the metal edge'], ['Crack', 'A split in the weld or nearby metal'], ['Spatter', 'Small metal drops stuck beside it'], ['Lack of fusion', 'Weld metal not joined to the base']], why: 'Each defect looks different: gas holes, an edge groove, a split, stray drops, or metal that never joined. A crack is never accepted, so hold that part.'},
        {prompt: 'Match each piece of welding safety gear to its job.', pairs: [['Welding helmet', 'Protects the welder\'s eyes and face'], ['Welding screen', 'Protects people walking nearby'], ['Leather gloves', 'Protect hands from heat and sparks'], ['Fume extraction', 'Pulls smoke away from your breathing'], ['Fire watch', 'A person who watches for spark fires']], why: 'The arc gives off strong light, heat, sparks and fumes. Each piece of gear blocks one of those, for the welder or for others nearby.'},
        {prompt: 'Match each weld symbol part. The corner is where the arrow meets the reference line.', pairs: [['Arrow', 'Points to the joint to weld'], ['Triangle', 'Make a fillet weld'], ['Number left of triangle', 'Size of the weld'], ['Circle at the corner', 'Weld all the way around'], ['Flag at the corner', 'Weld it in the field, not the shop']], why: 'A weld symbol packs the whole job into one small drawing: where to weld, what kind, how big, and where it is done.'}
      ]
    },
    {
      id: 'read-the-chart', order: 5,
      courseSlug: 'cpt-course-5', courseTitle: 'Quality Control and Inspection',
      title: 'Read the Chart',
      skill: 'Deciding when a control chart calls for action',
      mechanic: 'gate', prop: 'chart-folder',
      scene: 'You keep the control chart for a drilled hole. Every hour you plot a new point and decide what it means.',
      takeaway: 'Random ups and downs inside the limits are normal, so leave them alone. A point outside, a long run or a steady trend means something changed.',
      prompt: 'Read the control chart. Leave the process alone or investigate?',
      actions: [{id: 'leave', label: 'Leave it alone'}, {id: 'investigate', label: 'Investigate'}],
      items: [
        {title: 'Points bounce around the center', facts: ['All points inside the control limits', 'Ups and downs mixed, no pattern'], answer: 'leave', why: 'Every process varies a little. Random points inside the limits mean it is stable, so there is nothing to fix.'},
        {title: 'One point above upper control limit', facts: ['The 20 points before it were normal'], answer: 'investigate', why: 'A point outside a control limit is very unlikely by chance. Something changed, so look for the cause.'},
        {title: 'Nine points in a row above center', facts: ['All of them inside the limits'], answer: 'investigate', why: 'A long run on one side is not random. The process average has likely shifted, even before any point goes outside.'},
        {title: 'Seven points, each higher than last', facts: ['Still inside the limits'], answer: 'investigate', why: 'A steady climb is a trend, often from something like tool wear. Find it now, before parts go out of tolerance.'},
        {title: 'Operator wants to adjust the machine', facts: ['Last point a bit above center', 'Chart shows no run or trend'], answer: 'leave', why: 'One point above center is normal variation. Adjusting a stable process adds more variation instead of less.'},
        {title: 'New operator took over at noon', facts: ['Points before and after look alike', 'All inside limits, no pattern'], answer: 'leave', why: 'A change of people could cause a shift, but the chart shows none. Let the data decide, not the guess.'}
      ]
    },
    {
      id: 'safe-or-stop', order: 6,
      courseSlug: 'cpt-course-6', courseTitle: 'Safety and OSHA Compliance',
      title: 'Safe or Stop?',
      skill: 'Choosing the safe move when a hazard shows up on the floor',
      mechanic: 'gate', prop: 'hardhat',
      scene: 'You walk the press and conveyor area at the start of second shift. A few things need a call.',
      takeaway: 'Lock out before you reach into any machine, and test that it will not start. Report hazards and near misses, even when no one was hurt.',
      prompt: 'What is the safe next move?',
      actions: [{id: 'proceed', label: 'Safe to proceed'}, {id: 'lockout', label: 'Lock out first'}, {id: 'report', label: 'Stop and report'}],
      items: [
        {title: 'Jam inside the conveyor', facts: ['You need to reach past the guard', 'Belt is stopped but still powered', 'You are trained to lock out this belt'], answer: 'lockout', why: 'A stopped machine can start without warning. Lock out every energy source before any part of you goes inside.'},
        {title: 'Coworker says it is off, go ahead', facts: ['You must reach into the press', 'No lock is on it yet'], answer: 'lockout', why: 'Someone else saying it is off does not protect you. Put on your own lock and tag before you reach in.'},
        {title: 'Blade change on the slitter', facts: ['Planned maintenance task', 'Machine has power and an air line', 'You are trained to lock out this machine'], answer: 'lockout', why: 'Servicing means lockout, and that covers air too, not just electricity. Isolate and lock every source.'},
        {title: 'Your locks are on the slitter', facts: ['Power and air both locked out', 'Air line bled down to zero', 'Start button tried: nothing moves'], answer: 'proceed', why: 'Every source is locked, stored energy is released and the try-out shows it will not start. Put the start control back to off, then begin the work.'},
        {title: 'Normal run at your own station', facts: ['All guards in place', 'Safety glasses and ear plugs on', 'Pre-shift check done'], answer: 'proceed', why: 'Guards on, PPE on and checks done is how a normal run should look. You are clear to work.'},
        {title: 'Press brake guard on a shelf', facts: ['The guard was taken off the press', 'Operator is about to start a run'], answer: 'report', why: 'A machine must never run without its guard. Ask the operator to wait and get the supervisor to have it refitted.'},
        {title: 'Part flew out of a lathe', facts: ['It just missed a coworker', 'No one was hurt'], answer: 'report', why: 'A near miss shows a real hazard. Reporting it gets the cause fixed before the next one hurts someone.'},
        {title: 'Unlabeled jug of liquid', facts: ['Found at your workbench', 'No label and no safety data sheet'], answer: 'report', why: 'Never use a chemical you cannot identify. Report it so it can be identified, labeled and stored safely.'}
      ]
    },
    {
      id: 'lean-tools', order: 7,
      courseSlug: 'cpt-course-7', courseTitle: 'Lean Manufacturing Principles',
      title: 'Lean Tool Run',
      skill: 'Matching a lean tool or waste to a problem on the floor',
      mechanic: 'lane', prop: 'clipboard',
      scene: 'Your lead hands you a list of problems from the floor walk and asks which lean tool or waste fits each one.',
      takeaway: 'Lean starts with seeing waste. Each tool targets one kind: 5S for searching, SMED for changeovers, poka-yoke for mistakes, kanban for overproduction.',
      questions: [
        {prompt: 'Tools are scattered and people hunt for them every shift.', options: ['5S', 'SMED', 'Kanban'], answer: 0, why: '5S gives every tool a marked home and keeps the area that way, so no one wastes time searching.'},
        {prompt: 'A changeover between products takes 90 minutes. You want it shorter.', options: ['Poka-yoke', 'SMED', '5S'], answer: 1, why: 'SMED is the method for cutting changeover time, so the line can switch products more often in smaller batches.'},
        {prompt: 'A part can go into the fixture backward. You want it to fit only one way.', options: ['Kanban', 'Kaizen event', 'Poka-yoke'], answer: 2, why: 'Poka-yoke means error-proofing: a guide or shape that makes the mistake impossible to make.'},
        {prompt: 'A card goes back to the station before you, asking it to make 20 more.', options: ['Kanban', 'Value stream map', '5S'], answer: 0, why: 'Kanban is a pull signal. The station makes parts only when the next step asks, which stops overproduction.'},
        {prompt: 'You want to see every step and every wait from raw material to shipping.', options: ['SMED', 'Value stream map', 'Poka-yoke'], answer: 1, why: 'A value stream map shows the whole flow, so you can see that most of the time is often waiting, not work.'},
        {prompt: 'A team spends a few focused days improving one work area.', options: ['Kanban', 'Andon light', 'Kaizen event'], answer: 2, why: 'Kaizen means continuous improvement. A kaizen event is a short, focused push to improve one area.'},
        {prompt: 'Operators stand idle while a machine resets. Which waste is this?', options: ['Waiting', 'Overproduction', 'Defects'], answer: 0, why: 'People or parts sitting idle is the waste of waiting. No value is added while they wait.'},
        {prompt: 'In 5S, which step removes items nobody needs from the area?', options: ['Sort', 'Shine', 'Sustain'], answer: 0, why: 'Sort is the first S. You clear out what is not needed before you set a place for what is left.'}
      ]
    },
    {
      id: 'shift-review', order: 8,
      courseSlug: 'cpt-course-8', courseTitle: 'Production Technology Capstone',
      title: 'Full Shift Review',
      skill: 'Choosing the first move for safety, quality and improvement issues',
      mechanic: 'sort', prop: 'clipboard',
      scene: 'You cover a full shift as acting line lead. Reports come in from every station and each one needs a first move.',
      takeaway: 'Safety comes first, then contain bad parts, then improve the process. Knowing which kind of problem you face tells you the first move.',
      prompt: 'What is your first move?',
      bins: [{id: 'safety', label: 'Make it safe'}, {id: 'hold', label: 'Hold the parts'}, {id: 'idea', label: 'Log an idea'}],
      items: [
        {label: 'Solvent can open by a grinder', note: 'Sparks land a few feet away', answer: 'safety', why: 'Flammable vapor near sparks can catch fire. Move the can away and close it before anything else.'},
        {label: 'Coworker reaching into a jam', note: 'Belt has no lock on it', answer: 'safety', why: 'Reaching into a machine that is not locked out can cost a hand. Stop them first, then lock out.'},
        {label: 'Oil puddle in a busy aisle', note: 'Forklifts and people pass here', answer: 'safety', why: 'A slip hazard where people walk comes first. Block it off, report it and get it cleaned up.'},
        {label: '3 of 10 holes over tolerance', note: 'Found at your inspection check', answer: 'hold', why: 'Contain first: tag and hold the bad parts and stop more from being made, then look for the cause.'},
        {label: 'Pockets 0.3 mm too deep', note: 'Every part since the CNC tool swap', answer: 'hold', why: 'The same error on every part points to the new tool. Hold those parts, then check its length offset.'},
        {label: 'Checked and unchecked parts mixed', note: 'No way to tell which are which', answer: 'hold', why: 'If you cannot tell good parts from unchecked ones, hold them all until they are inspected.'},
        {label: 'Long walk for raw material', note: 'Every hour, no safety risk', answer: 'idea', why: 'Extra walking is motion waste. It is not urgent, so log it as an improvement idea, like moving the material closer.'},
        {label: 'Bins of parts nobody has used', note: 'Blocking a shelf for months', answer: 'idea', why: 'Unneeded items crowd the area. The Sort step of 5S clears them out, so log it as an idea.'},
        {label: 'Crew idle while an oven resets', note: 'About 3 minutes each cycle', answer: 'idea', why: 'Idle time is the waste of waiting. Log it so the team can rework the job around the reset.'}
      ]
    }
  ]
};
