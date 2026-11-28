// Site Ready: practice breaks for the Core Construction Training Certificate.
// Original wording; people and companies are fictional. Practice only, not graded.
export default {
  id: 'core-construction-training-certificate',
  title: 'Site Ready',
  tagline: 'Short practice breaks for new construction crew members.',
  role: 'You are a new crew member at Cedar Ridge Builders, learning the job site one task at a time.',
  program: 'Core Construction Training Certificate',
  theme: {world: 'site', accent: '#c98a00', mood: 'day'},
  levels: [
    {
      id: 'who-does-what',
      order: 1,
      courseSlug: 'construction-course-1',
      courseTitle: 'Introduction to Construction Industry',
      title: 'Who Does What',
      skill: 'Telling apart the main roles on a construction project',
      mechanic: 'sort',
      prop: 'hardhat',
      scene: 'On day one at Cedar Ridge Builders, foreman Rosa Delgado asks if you know who does what.',
      takeaway: 'The owner pays, the architect designs, and the general contractor (GC) runs the site. Subcontractors do one trade and take direction from the GC.',
      prompt: 'Who does this job: owner, architect, general contractor (GC) or sub?',
      bins: [
        {id: 'owner', label: 'Owner'},
        {id: 'architect', label: 'Architect'},
        {id: 'gc', label: 'GC'},
        {id: 'sub', label: 'Subcontractor'}
      ],
      items: [
        {label: 'Pays for the whole project', answer: 'owner', why: 'The owner funds the project and will own the finished building. Everyone else is hired, directly or indirectly, by the owner.'},
        {label: 'Hires the general contractor', answer: 'owner', why: 'The owner signs the main building contract with the GC. The GC then hires the subcontractors.'},
        {label: 'Decides what they want built', note: 'For example, a clinic with six rooms', answer: 'owner', why: 'The owner sets the goal and the needs. The architect then turns those needs into a design.'},
        {label: 'Draws the building plans', answer: 'architect', why: 'The architect designs the building and produces the drawings that every trade builds from.'},
        {label: 'Explains what the design intends', note: 'When a drawing is unclear', answer: 'architect', why: 'Questions about the design go up through the GC to the architect, because the architect made the drawings.'},
        {label: 'Sets the daily site schedule', answer: 'gc', why: 'The GC plans who works where and when, so trades do not get in each other\'s way.'},
        {label: 'Hires the subcontractors', answer: 'gc', why: 'The GC brings in subcontractors for each trade and manages their work on site.'},
        {label: 'Settles which trade goes first', note: 'Plumber and concrete crew disagree', answer: 'gc', why: 'Sequencing the trades is the GC\'s job. Send the argument to the GC instead of settling it on your own.'},
        {label: 'Installs the wiring and outlets', answer: 'sub', why: 'Wiring is one trade. An electrical company does it as a subcontractor and takes its work orders from the GC.'},
        {label: 'Does one trade, like plumbing', answer: 'sub', why: 'Subcontractors are specialists. Each one handles a single trade, such as plumbing, electrical or drywall.'}
      ]
    },
    {
      id: 'scale-and-math',
      order: 2,
      courseSlug: 'construction-course-2',
      courseTitle: 'Blueprint Reading and Construction Math',
      title: 'Scale and Math Run',
      skill: 'Reading drawing scales and doing quick site math',
      mechanic: 'lane',
      prop: 'blueprint',
      scene: 'Rosa hands you a floor plan and a tape measure so you can work out real sizes and a flooring order.',
      takeaway: 'Use the scale to turn drawing inches into real feet. When ordering material, add a waste allowance and always round up.',
      questions: [
        {prompt: 'Scale: 1/4 inch = 1 foot. A wall on the plan is 3 inches long. Real length?', options: ['3 feet', '12 feet', '6 feet'], answer: 1, why: 'At this scale, each inch on paper stands for 4 feet. So 3 inches times 4 is 12 feet.'},
        {prompt: 'Scale: 1/2 inch = 1 foot. A line on the plan is 5 inches long. Real length?', options: ['10 feet', '5 feet', '2.5 feet'], answer: 0, why: 'At this scale, each inch on paper stands for 2 feet. So 5 inches times 2 is 10 feet.'},
        {prompt: 'A room is 10 feet by 12 feet. How much floor area is that?', options: ['22 sq ft', '44 sq ft', '120 sq ft'], answer: 2, why: 'Area is length times width. 10 times 12 is 120 square feet.'},
        {prompt: 'Baseboard goes all the way around a 10 ft by 12 ft room. Ignore doors. How many feet?', options: ['120 feet', '44 feet', '22 feet'], answer: 1, why: 'Trim runs around the edge, so add all four walls: 10 + 12 + 10 + 12 = 44 feet. That distance around is the perimeter.'},
        {prompt: 'How many inches is 3 feet 6 inches?', options: ['42 inches', '36 inches', '39 inches'], answer: 0, why: 'There are 12 inches in a foot. 3 feet is 36 inches, plus 6 more makes 42 inches.'},
        {prompt: 'A floor needs 200 sq ft of tile. Add 10% for cuts and waste. How much to order?', options: ['200 sq ft', '210 sq ft', '220 sq ft'], answer: 2, why: '10% of 200 is 20. Adding it gives 220 square feet, so you do not run short when cuts leave scraps.'},
        {prompt: 'Each box covers 25 sq ft. You need 220 sq ft. What is the fewest boxes that covers it?', options: ['8 boxes', '9 boxes', '11 boxes'], answer: 1, why: '220 divided by 25 is 8.8. You cannot buy part of a box, so round up to 9. Rounding down leaves you short.'},
        {prompt: 'Which length is longer?', options: ['3/4 inch', '5/8 inch', '1/2 inch'], answer: 0, why: '3/4 is the same as 6/8, which is more than 5/8. Changing fractions to the same bottom number makes them easy to compare.'}
      ]
    },
    {
      id: 'safe-or-stop',
      order: 3,
      courseSlug: 'construction-course-3',
      courseTitle: 'Construction Safety and OSHA-10',
      title: 'Safe or Stop',
      skill: 'Spotting hazards and knowing when to stop work and report',
      mechanic: 'gate',
      prop: 'hardhat',
      scene: 'On the morning walk-through, Rosa asks you to spot which crews are set up safely and which are not.',
      takeaway: 'If fall protection, eye protection, guards or labels are missing, stop and report it. Speaking up is part of the job, not a favor.',
      prompt: 'Is this safe to start, or do you stop and report it?',
      actions: [
        {id: 'go', label: 'Go ahead'},
        {id: 'stop', label: 'Stop & report'}
      ],
      items: [
        {title: 'Scaffold work, harness not here', facts: ['Platform is high, with no guardrails', 'Harness is still in the truck', 'You are told to start now'], answer: 'stop', why: 'With no guardrails, you need a harness on and tied off before you climb. A fall takes a second; waiting a few minutes costs nothing.'},
        {title: 'Roof edge work', facts: ['Harness inspected and fits snugly', 'Lanyard clipped to an approved anchor'], answer: 'go', why: 'An inspected harness tied to an approved anchor is proper fall protection. You can start the work.'},
        {title: 'Climbing a ladder to a landing', facts: ['Ladder checked, no damage found', 'Set on firm, level ground', 'Secured at top, extends past landing'], answer: 'go', why: 'An inspected ladder on solid footing, tied off and reaching past the landing, is set up the right way to climb.'},
        {title: 'Coworker grinding steel', facts: ['Sparks are flying toward his face', 'He has no safety glasses on'], answer: 'stop', why: 'Flying sparks and chips can blind someone. Tell him to stop and put on eye protection, and tell the foreman if he will not.'},
        {title: 'Using a labeled sealant', facts: ['Container is clearly labeled', 'SDS is on file at the site', 'Wearing the gloves the SDS lists'], answer: 'go', why: 'The label and SDS tell you the hazards and the protection to use. With the right gloves on, the job can go ahead.'},
        {title: 'Unmarked barrel in storage', facts: ['No label on the barrel', 'No safety data sheet (SDS) for it'], answer: 'stop', why: 'Treat an unknown chemical as dangerous. Do not open or sniff it. Keep people away and tell your supervisor.'},
        {title: 'Saw guard wedged open', facts: ['Blade guard is propped up', 'Coworker says it cuts faster'], answer: 'stop', why: 'The guard keeps hands off the blade. Ask him to restore it, and tell the supervisor if he refuses.'},
        {title: 'Cutting with a circular saw', facts: ['Guard moves freely', 'Safety glasses and ear protection on', 'Cord checked, no damage'], answer: 'go', why: 'A working guard, a good cord and the right protective gear mean the saw is ready to use safely.'}
      ]
    },
    {
      id: 'tool-setup',
      order: 4,
      courseSlug: 'construction-course-4',
      courseTitle: 'Hand and Power Tools',
      title: 'Tool Setup',
      skill: 'Putting power saw setup steps in a safe order',
      mechanic: 'order',
      prop: 'toolbox',
      scene: 'You are cutting casings for twelve doorways, but first the miter saw needs a new angle and a fresh blade.',
      takeaway: 'Unplug before you adjust or change anything on a power tool. Lock settings tight, then test on scrap before the real cut.',
      rounds: [
        {prompt: 'Set the miter saw for a 45 degree casing cut. Put the steps in order.', steps: ['Unplug the saw', 'Unlock the miter angle', 'Set it to 45 and lock it', 'Plug in, test cut on scrap', 'Cut the door casing'], why: 'Never adjust a saw that has power. Lock the angle so it cannot slip, and check it on scrap before you cut the real piece.'},
        {prompt: 'The saw blade is dull. Put the blade change steps in order.', steps: ['Unplug the saw', 'Press blade lock, loosen bolt', 'Swap blade, arrow matches saw', 'Tighten bolt, check the guard', 'Plug in and test'], why: 'Unplug first. The blade lock is a button that stops the blade turning while you loosen the bolt. The arrow on the new blade must point the same way as the one on the saw.'}
      ]
    },
    {
      id: 'concrete-and-block',
      order: 5,
      courseSlug: 'construction-course-5',
      courseTitle: 'Concrete and Masonry Fundamentals',
      title: 'Concrete and Block',
      skill: 'Matching concrete and masonry terms and fixes to what they mean',
      mechanic: 'match',
      prop: 'block',
      scene: 'The crew pours a garage slab today and lays a block wall tomorrow, so Rosa checks that you know the words.',
      takeaway: 'Extra water weakens concrete, and new concrete must stay damp to gain strength. In masonry, check plumb often and fix small errors early.',
      rounds: [
        {prompt: 'Match each concrete term to its meaning.', pairs: [['Curing', 'Keeping new concrete damp for strength'], ['Rebar', 'Steel bars that strengthen concrete'], ['Formwork', 'Molds that hold wet concrete in shape'], ['Slump', 'How stiff or runny fresh concrete is'], ['Water-cement ratio', 'Water compared to cement in the mix']], why: 'Forms hold the shape, rebar adds strength, and slump shows how wet the mix is. More water for the same cement makes weaker concrete.'},
        {prompt: 'Match each masonry term to its meaning.', pairs: [['Mortar', 'Paste that bonds blocks together'], ['Course', 'One full row of blocks or bricks'], ['Plumb', 'Straight up and down'], ['Level', 'Flat and even from side to side'], ['Joint', 'The mortar-filled gap between blocks']], why: 'Mortar is the material and a joint is where it sits. Plumb is vertical, level is horizontal, and walls go up one course at a time.'},
        {prompt: 'Match each problem to the right response.', pairs: [['Mix arrives too stiff', 'Tell the foreman; do not add water'], ['Hot, windy pour day', 'Cover the slab to hold in moisture'], ['Block wall drifting', 'Check plumb often and fix it early'], ['Wet concrete on skin', 'Rinse it off, then tell the foreman']], why: 'Added water weakens the mix. Fast drying robs concrete of the water it needs. Plumb errors grow with height. Wet concrete burns skin; gloves and boots prevent it.'}
      ]
    },
    {
      id: 'frame-it-up',
      order: 6,
      courseSlug: 'construction-course-6',
      courseTitle: 'Carpentry and Framing Basics',
      title: 'Frame It Up',
      skill: 'Naming the parts of a framed wall and checking it for square',
      mechanic: 'lane',
      prop: 'pallet',
      scene: 'The framing crew is building an exterior wall with a door and a window. Rosa calls out parts as you go.',
      takeaway: 'A header carries the load over an opening into the jack studs beside it. Check every wall for square and plumb before you brace it.',
      questions: [
        {prompt: 'The beam above a door opening that carries the load around it.', options: ['Header', 'Bottom plate', 'Cripple stud'], answer: 0, why: 'Cutting studs for an opening breaks the load path. The header picks up that load and passes it to the studs on each side.'},
        {prompt: 'The full-height studs on each side of a door opening.', options: ['Jack studs', 'King studs', 'Cripple studs'], answer: 1, why: 'King studs run the full height from bottom plate to top plate, right beside the opening.'},
        {prompt: 'The shorter studs that the header sits on.', options: ['King studs', 'Cripple studs', 'Jack studs'], answer: 2, why: 'Jack studs sit against the king studs and hold up the ends of the header. They carry its load down.'},
        {prompt: 'Short studs between a window sill and the bottom plate.', options: ['Cripple studs', 'King studs', 'Headers'], answer: 0, why: 'Cripple studs are short studs that fill in above or below an opening to support the sill or give a nailing surface.'},
        {prompt: 'The most common stud spacing in house walls.', options: ['24 in on center', '16 in on center', '12 in on center'], answer: 1, why: 'On center means middle of one stud to middle of the next. 16 inches divides evenly into 4-foot-wide sheets, so sheet edges land on a stud.'},
        {prompt: '3-4-5 check: 3 ft along one side, 4 ft along the other. Diagonal if square?', options: ['7 feet', '6 feet', '5 feet'], answer: 2, why: 'A square corner makes a 3-4-5 triangle. If the diagonal is not 5 feet, push the top of the wall sideways until it is, then brace it.'},
        {prompt: 'The board laid flat along the bottom of a wall frame.', options: ['Top plate', 'Bottom plate', 'Header'], answer: 1, why: 'The bottom plate is the base of the wall. Studs are nailed to it, and it is fastened to the floor.'},
        {prompt: 'The tool you use to check that a wall stands plumb.', options: ['Level', 'Chalk line', 'Tape measure'], answer: 0, why: 'A level shows when something is truly vertical or horizontal. A chalk line marks straight lines, and a tape measures length.'}
      ]
    },
    {
      id: 'rough-in-ready',
      order: 7,
      courseSlug: 'construction-course-7',
      courseTitle: 'Electrical and Plumbing Basics',
      title: 'Rough-In Ready',
      skill: 'Putting rough-in work and trade safety steps in order',
      mechanic: 'order',
      prop: 'valve',
      scene: 'You help the electrical and plumbing subs rough in a new house, putting pipes and wires inside the open walls.',
      takeaway: 'Walls stay open until the rough-in inspection passes. Before electrical work, the power is shut off, locked out and tested by a qualified person.',
      rounds: [
        {prompt: 'Put these stages of building a wall in order.', steps: ['Frame the walls', 'Rough in pipes and wires', 'Pass the rough-in inspection', 'Install insulation', 'Hang the drywall'], why: 'The inspector must see the pipes and wires before anything covers them. Closing walls early means tearing them open again.'},
        {prompt: 'The electrician locks out a circuit and you help. Put the safety steps in order.', steps: ['Turn off the breaker', 'Lock and tag the breaker', 'Electrician tests wires are dead', 'Do the work', 'Remove the lock when done'], why: 'The lock keeps anyone from turning power back on. Only the electrician tests the wires, with a proper tester, because the wrong breaker is easy to pick.'},
        {prompt: 'Join a plastic (PVC) drain pipe to a fitting. Put the steps in order.', steps: ['Cut pipe square, scrape off burrs', 'Dry-fit pipe and fitting', 'Apply primer to both', 'Apply cement to both', 'Push in, twist, hold still'], why: 'Burrs are rough bits the saw leaves that spoil the seal. Dry-fit means test the fit without glue. Primer readies the plastic so the cement bonds.'}
      ]
    },
    {
      id: 'site-ready-review',
      order: 8,
      courseSlug: 'construction-course-8',
      courseTitle: 'Construction Readiness Capstone',
      title: 'Site Ready Review',
      skill: 'Judging when to go ahead and when to stop and ask on the job',
      mechanic: 'gate',
      prop: 'clipboard',
      scene: 'In your first full week at Cedar Ridge, Rosa watches how you handle each call on your own.',
      takeaway: 'Go ahead when the checks are done and the work is approved. Stop and ask when safety, structure or the plan is in doubt.',
      prompt: 'Go ahead, or stop and ask before you act?',
      actions: [
        {id: 'go', label: 'Go ahead'},
        {id: 'ask', label: 'Stop and ask'}
      ],
      items: [
        {title: 'Driver offers to add water', facts: ['Concrete arrives stiffer than ordered', 'No one in charge has approved water'], answer: 'ask', why: 'Extra water makes concrete weaker. Only the engineer can approve a mix change, so tell the foreman and wait.'},
        {title: 'Ready to hang drywall', facts: ['Pipes and wires are roughed in', 'Inspector signed off the rough-in', 'Insulation is in; foreman says start hanging'], answer: 'go', why: 'The rough-in passed inspection, the insulation is in, and the foreman gave the word, so the walls can be closed.'},
        {title: 'Big hole in a bearing stud', facts: ['Plumber wants a 3 inch hole', 'The stud holds up the floor above'], answer: 'ask', why: 'A big hole can weaken a stud that holds up the floor above. Do not cut. Tell the GC, who decides how to route the pipe or gets the right approval.'},
        {title: 'A task you have never done', facts: ['Senior carpenter says figure it out', 'No one has shown you how'], answer: 'ask', why: 'Ask for a quick demo and confirm the safety steps. Asking is professional and prevents costly or unsafe mistakes.'},
        {title: 'Cutting a door casing', facts: ['Measured twice, mark checked', 'Saw guard works', 'Safety glasses on'], answer: 'go', why: 'The cut is measured and marked, the saw is safe, and you have eye protection. Make the cut.'},
        {title: 'Bracing a new wall', facts: ['3-4-5 diagonal reads exactly 5 ft', 'Foreman says brace it'], answer: 'go', why: 'An exact 5 foot diagonal means the corner is square. Brace the wall so it stays that way.'},
        {title: 'Ladder with a bent rung', facts: ['One rung is bent', 'It is the only ladder nearby'], answer: 'ask', why: 'A damaged ladder can fail under you. Tag it so no one uses it, tell the foreman, and wait for a safe one.'},
        {title: 'End-of-shift cleanup', facts: ['Scrap is blocking a walkway', 'Foreman asks the crew to clean up'], answer: 'go', why: 'Clear walkways prevent trips and falls. Cleanup is every crew member\'s job, and doing it well gets noticed.'}
      ]
    }
  ]
};
