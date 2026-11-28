// Clean Claim: practice breaks for the Medical Billing, Coding, and Health Information Technician program.
// Original wording. Cedar Grove Clinic and every patient and caller are fictional. Practice only, not graded.
export default {
  id: 'health-information-technology-mchit',
  title: 'Clean Claim',
  tagline: 'Short practice breaks for new medical billing and coding staff.',
  role: 'You are a billing and coding trainee at Cedar Grove Clinic, getting each claim right the first time.',
  program: 'Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)',
  theme: {world: 'clinic', accent: '#2e8b6a', mood: 'day'},
  levels: [
    {
      id: 'chart-schedule-bill',
      order: 1,
      courseSlug: 'mchit-course-1',
      courseTitle: 'Introduction to Health Information Technology',
      title: 'Chart, Schedule or Bill',
      skill: 'Sorting clinic tasks into the systems that handle them',
      mechanic: 'sort',
      prop: 'folder',
      scene: 'It is your first morning at Cedar Grove Clinic, and a stack of tasks lands on your desk.',
      takeaway: 'Health facts go in the patient chart, visits go on the schedule, and money goes through billing. Knowing where data lives helps keep it accurate.',
      prompt: 'Which part of the clinic system handles this?',
      bins: [
        {id: 'chart', label: 'Patient chart'},
        {id: 'schedule', label: 'Scheduling'},
        {id: 'billing', label: 'Billing'}
      ],
      items: [
        {label: 'Doctor\'s note from today\'s visit', answer: 'chart', why: 'A visit note is clinical information. It belongs in the patient\'s electronic health record (EHR), the digital chart.'},
        {label: 'Results of a blood test', answer: 'chart', why: 'Lab results describe the patient\'s health, so they are filed in the chart where the doctor can review them.'},
        {label: 'Record of a flu shot given today', answer: 'chart', why: 'Shots a patient has had are part of their health history. They go in the chart so every provider can see them.'},
        {label: 'Book a follow-up in two weeks', answer: 'schedule', why: 'Booking a future visit is a scheduling task. It reserves a time slot with the right provider.'},
        {label: 'Move a visit from Monday to Friday', answer: 'schedule', why: 'Changing an appointment time is done in scheduling, so the provider\'s calendar stays correct.'},
        {label: 'Reminder calls for tomorrow', answer: 'schedule', why: 'Reminder lists come from the appointment calendar. They help cut down on missed visits.'},
        {label: 'Send a claim to the health plan', answer: 'billing', why: 'A claim is a bill sent to the patient\'s health plan for the care given. That is billing work.'},
        {label: 'Record a payment the patient made', answer: 'billing', why: 'Payments are posted to the patient\'s account in billing, so the balance owed stays correct.'},
        {label: 'Statement of what the patient owes', answer: 'billing', why: 'A statement shows charges, payments and the amount still due. Billing creates and sends it.'}
      ]
    },
    {
      id: 'word-parts',
      order: 2,
      courseSlug: 'mchit-course-2',
      courseTitle: 'Medical Terminology and Anatomy',
      title: 'Word Parts',
      skill: 'Connecting medical word parts to their meanings',
      mechanic: 'match',
      prop: 'chart-folder',
      scene: 'A doctor\'s note is full of long medical words. You break each one into parts to read it.',
      takeaway: 'Split a long term into prefix, root and suffix. Each part has a meaning, and together they tell you what the doctor wrote.',
      rounds: [
        {prompt: 'Match each prefix (the start of a word) to its meaning.', pairs: [['hyper-', 'Above normal'], ['hypo-', 'Below normal'], ['tachy-', 'Fast'], ['brady-', 'Slow'], ['peri-', 'Around']], why: 'Prefixes change the meaning of a word. Hypertension is high blood pressure and hypotension is low. Tachycardia is a fast heartbeat and bradycardia is slow.'},
        {prompt: 'Match each suffix (the end of a word) to its meaning.', pairs: [['-ectomy', 'Surgical removal'], ['-itis', 'Inflammation'], ['-ology', 'Study of'], ['-algia', 'Pain'], ['-scopy', 'Looking inside with a scope']], why: 'The suffix often shows if a term is a procedure or a condition. Appendectomy is a removal, but appendicitis is inflammation. That changes the code.'},
        {prompt: 'Match each root (the body part) to its meaning.', pairs: [['cardi/o', 'Heart'], ['nephr/o', 'Kidney'], ['gastr/o', 'Stomach'], ['hepat/o', 'Liver'], ['oste/o', 'Bone']], why: 'The root names the body part. Put the parts together: nephrectomy is removal of a kidney, and hepatitis is inflammation of the liver.'}
      ]
    },
    {
      id: 'records-request',
      order: 3,
      courseSlug: 'mchit-course-3',
      courseTitle: 'Health Information Management',
      title: 'Records Room',
      skill: 'Putting records release and retention steps in order',
      mechanic: 'order',
      prop: 'chart-folder',
      scene: 'A patient wants a copy of her records, and the old file room needs clearing out.',
      takeaway: 'Records work follows a careful path: confirm who is asking, release only what is needed, and document every release and every destruction.',
      rounds: [
        {prompt: 'A patient asks for a copy of her own records. Put the steps in order.', steps: ['Receive the patient\'s request', 'Verify the patient\'s identity', 'Gather the records she asked for', 'Send them by a secure method', 'Log what was sent and when'], why: 'Confirm who is asking before you pull any records. Send only what was requested, then keep a log so the release can be traced later.'},
        {prompt: 'Some paper records are past the time they must be kept. Put the steps in order.', steps: ['List records past retention', 'Check none are on legal hold', 'Shred them securely', 'Document what was destroyed'], why: 'A legal hold means records must be kept for a lawsuit or review, even past the usual time. Check first, destroy securely, then keep proof of what was destroyed.'}
      ]
    },
    {
      id: 'chart-builder',
      order: 4,
      courseSlug: 'mchit-course-4',
      courseTitle: 'Electronic Health Records (EHR)',
      title: 'Chart Builder',
      skill: 'Placing visit details in the right part of the EHR',
      mechanic: 'sort',
      prop: 'chart-folder',
      scene: 'Before coding, you review today\'s visit in the EHR and check that each detail sits in the right section.',
      takeaway: 'Put each detail in its own structured field. An allergy typed into a free-text note may not trigger the EHR\'s safety alerts.',
      prompt: 'Which part of the EHR does this belong in?',
      bins: [
        {id: 'vitals', label: 'Vitals'},
        {id: 'allergy', label: 'Allergies'},
        {id: 'meds', label: 'Medications'},
        {id: 'problems', label: 'Problem list'}
      ],
      items: [
        {label: 'Blood pressure 124/80', note: 'Measured at today\'s visit', answer: 'vitals', why: 'Blood pressure taken at the visit is a vital sign. Entered in vitals, it can be tracked over time.'},
        {label: 'Pulse 72 beats per minute', answer: 'vitals', why: 'Pulse is a vital sign. The vitals section keeps each reading with its date so changes are easy to spot.'},
        {label: 'Penicillin causes hives', answer: 'allergy', why: 'A drug reaction goes in the allergy section. There it can warn the doctor if that drug is ever prescribed.'},
        {label: 'Latex gloves cause a rash', answer: 'allergy', why: 'Allergies are not only to drugs. Recording a latex allergy lets staff pick safe gloves and supplies.'},
        {label: 'Shellfish causes throat swelling', answer: 'allergy', why: 'Food allergies belong in the allergy list too, so every provider sees them before care.'},
        {label: 'Takes metformin twice a day', answer: 'meds', why: 'A medicine the patient takes now belongs in the medication list, along with how often it is taken.'},
        {label: 'Low-dose aspirin every morning', note: 'Bought over the counter', answer: 'meds', why: 'Medicines bought without a prescription still go on the medication list. They can interact with other drugs.'},
        {label: 'Type 2 diabetes, ongoing', answer: 'problems', why: 'The problem list holds the patient\'s ongoing health conditions, so every visit starts with the full picture.'},
        {label: 'Asthma since childhood', answer: 'problems', why: 'A long-term condition like asthma belongs on the problem list, not in today\'s readings.'},
        {label: 'Long-term hypertension', note: 'A diagnosis, not today\'s reading', answer: 'problems', why: 'Hypertension is an ongoing diagnosis of high blood pressure. Today\'s reading goes in vitals; the condition goes on the problem list.'}
      ]
    },
    {
      id: 'share-or-stop',
      order: 5,
      courseSlug: 'mchit-course-5',
      courseTitle: 'Healthcare Law, Ethics & HIPAA',
      title: 'Share or Stop',
      skill: 'Deciding when patient information can be shared',
      mechanic: 'gate',
      prop: 'envelope',
      scene: 'The front desk phone and fax are busy, and every request involves patient information.',
      takeaway: 'Patients get their records. Providers and plans get only what care or payment needs. Most others need written permission. Report slips to the privacy officer.',
      prompt: 'Can you share this, must you decline, or should you report it?',
      actions: [
        {id: 'share', label: 'Share'},
        {id: 'decline', label: 'Decline'},
        {id: 'report', label: 'Report it'}
      ],
      items: [
        {title: 'Patient wants a copy of her chart', facts: ['She shows photo ID at the front desk', 'She is asking for her own records'], answer: 'share', why: 'Patients have a right to get copies of their own health records. Checking ID makes sure they go to the right person.', prop: 'chart-folder'},
        {title: 'Specialist asks for recent lab results', facts: ['Our doctor referred the patient there', 'They need the labs to treat the patient'], answer: 'share', why: 'HIPAA allows sharing with another provider for the patient\'s treatment. No separate signed form is needed for that.'},
        {title: 'Health plan asks about one visit', facts: ['They need it to process this claim', 'They ask only about this visit'], answer: 'share', why: 'Sharing with the patient\'s health plan so a claim can be paid is allowed. Send only what the claim needs.'},
        {title: 'Employer asks why a worker was seen', facts: ['Caller is the patient\'s boss', 'No signed authorization on file'], answer: 'decline', why: 'An employer is not part of the patient\'s treatment or payment. Without a signed authorization (the patient\'s written permission), share nothing.'},
        {title: 'Caller says she is the patient\'s sister', facts: ['She wants his test results', 'His file says: share with no one'], answer: 'decline', why: 'The patient asked that no one get his information. Being family does not give automatic access to records.'},
        {title: 'Company asks to buy patient emails', facts: ['It wants to send ads for its vitamins', 'No patient has signed a form'], answer: 'decline', why: 'Using patient information for outside marketing needs each patient\'s written authorization. Without it, the answer is no.'},
        {title: 'Clinic laptop stolen from a car', facts: ['It holds patient files', 'Files were not encrypted (scrambled)'], answer: 'report', why: 'Lost patient data that was not scrambled may be a breach. Tell the privacy officer, who handles privacy problems, right away.'},
        {title: 'Lab report faxed to the wrong number', facts: ['A stranger\'s office called to tell you', 'The report shows the patient\'s name'], answer: 'report', why: 'Patient information reached the wrong person. Report it to the privacy officer, who decides what steps and notices are needed.'}
      ]
    },
    {
      id: 'code-set-sprint',
      order: 6,
      courseSlug: 'mchit-course-6',
      courseTitle: 'Medical Coding: ICD-10 and CPT',
      title: 'Code Set Sprint',
      skill: 'Choosing the right code set and following basic coding rules',
      mechanic: 'lane',
      prop: 'clipboard',
      scene: 'Today\'s visit notes are ready for coding. You pick the code set that fits each detail.',
      takeaway: 'ICD-10-CM codes say why the patient was seen. CPT codes say what the provider did. Code only what the note documents.',
      questions: [
        {prompt: 'The note says the patient has asthma. Which code set describes it?', options: ['ICD-10-CM', 'CPT', 'Neither code set'], answer: 0, why: 'ICD-10-CM is the code set for diagnoses. Its codes describe what is wrong with the patient and why care was needed.'},
        {prompt: 'The doctor removes a mole during the visit. Which code set reports the removal?', options: ['ICD-10-CM', 'Neither code set', 'CPT'], answer: 2, why: 'CPT is the code set for services and procedures. Removing a mole is something the provider did, so it gets a CPT code.'},
        {prompt: 'An outpatient note says "confirmed broken wrist" after an X-ray. What do you code?', options: ['Wrist pain', 'Broken wrist', 'Nothing yet'], answer: 1, why: 'Once the provider confirms a diagnosis, you code that diagnosis. You no longer code the symptoms that led to it.'},
        {prompt: 'A claim has a CPT code but no ICD-10-CM code. What is the claim missing?', options: ['Reason for care', 'The service done', 'Provider name'], answer: 0, why: 'The CPT code shows what was done. The health plan also needs a diagnosis code to show why that care was needed.'},
        {prompt: 'An outpatient note says "possible flu" and lists fever and cough. What do you code?', options: ['Flu', 'Fever and cough', 'Nothing yet'], answer: 1, why: 'In outpatient coding, a possible or probable diagnosis is not coded. Code the signs and symptoms the note documents.'},
        {prompt: 'You see an add-on code for extra work during a procedure. How is it reported?', options: ['With its main code', 'On its own', 'On a later claim'], answer: 0, why: 'An add-on code describes extra work done along with a main procedure. It is never reported by itself.'},
        {prompt: 'The schedule listed a test, but the doctor\'s note never mentions it. Can you code it?', options: ['Yes, it was booked', 'No, not documented', 'Yes, if routine'], answer: 1, why: 'Code only what the provider documented. If a test seems missing from the note, ask the provider instead of guessing.'},
        {prompt: 'The note says "sprain of the right ankle." Which sprain code fits best?', options: ['Ankle, no side', 'Right ankle', 'Left ankle'], answer: 1, why: 'Pick the most specific code the note supports. The note names the right side, so a code without a side leaves out detail.'}
      ]
    },
    {
      id: 'claim-journey',
      order: 7,
      courseSlug: 'mchit-course-7',
      courseTitle: 'Revenue Cycle Management',
      title: 'Claim Journey',
      skill: 'Putting the steps of the revenue cycle in order',
      mechanic: 'order',
      prop: 'clipboard',
      scene: 'Your billing lead asks you to trace a claim from check-in all the way to payment.',
      takeaway: 'Many denials can be prevented early. Correct registration, insurance checks and approvals before the visit save rework after it.',
      rounds: [
        {prompt: 'Follow one visit from check-in to payment. Put the steps in order.', steps: ['Register patient, check insurance', 'Provider documents the visit', 'Code the visit from the note', 'Submit the claim to the payer', 'Post the payment to the account'], why: 'Each step needs the one before it. Codes come from the note, the claim carries the codes, and payment is posted only after the payer (the health plan) pays.'},
        {prompt: 'A claim came back denied. Put the steps in order.', steps: ['Read the reason for the denial', 'Find the cause and plan the fix', 'Send a corrected claim or appeal', 'Follow up until it is paid'], why: 'Start with the reason. Some denials need a corrected claim, others an appeal. After resending, keep tracking it so the money owed does not sit unpaid.'},
        {prompt: 'A test needs the health plan\'s approval first. Put the steps in order.', steps: ['Provider orders the test', 'Check if the plan needs approval', 'Send the prior authorization request', 'Receive the plan\'s approval', 'Perform the test'], why: 'Prior authorization means getting the plan\'s OK before the service. Doing the test first risks a denial the clinic may not be able to collect on.'}
      ]
    },
    {
      id: 'clean-claim-check',
      order: 8,
      courseSlug: 'mchit-course-8',
      courseTitle: 'Capstone: HIT Practice Simulation',
      title: 'Clean Claim Check',
      skill: 'Checking a claim from intake to coding before it goes out',
      mechanic: 'gate',
      prop: 'folder',
      scene: 'It is the end of the day, and a batch of claims waits for your final check before sending.',
      takeaway: 'A clean claim has correct patient and insurance details and codes the note supports. Catch errors before you submit, not after a denial.',
      prompt: 'Is this claim ready to submit, or what must be fixed first?',
      actions: [
        {id: 'submit', label: 'Submit claim'},
        {id: 'info', label: 'Fix registration'},
        {id: 'code', label: 'Fix coding'}
      ],
      items: [
        {title: 'Office visit for Rosa Diaz', facts: ['Insurance checked today: active', 'Codes match the signed note', 'Claim checker found no errors'], answer: 'submit', why: 'Active coverage, codes backed by the note and a clean check mean the claim is ready. Clean claims get paid faster.'},
        {title: 'Add-on code with its main code', facts: ['Main procedure code is on the claim', 'The note documents the extra work', 'Name and birth date match the card'], answer: 'submit', why: 'An add-on code is correct when its main procedure is on the same claim and the note supports the extra work.'},
        {title: 'Member ID is one digit off', facts: ['ID on the claim: 4471-0', 'ID on the insurance card: 4477-0'], answer: 'info', why: 'The health plan cannot match a wrong member ID to the patient, so the claim will bounce. Copy the ID exactly from the card.'},
        {title: 'Insurance plan has ended', facts: ['Health plan says coverage ended last month', 'Today\'s visit: after the end date', 'Patient brought a new insurance card'], answer: 'info', why: 'A claim to a plan that has ended will be denied. Update the insurance from the new card, verify it, then bill the new plan.'},
        {title: 'Birth month does not match', facts: ['Registration form: born in March', 'Claim: born in May'], answer: 'info', why: 'Health plans match patients by name, birth date and member ID. A wrong birth date can get the claim rejected, so fix the record first.'},
        {title: 'Knee X-ray, headache diagnosis', facts: ['Procedure: X-ray of the left knee', 'Only diagnosis on claim: headache'], answer: 'code', why: 'The diagnosis must show why the service was needed. A headache does not explain a knee X-ray. Find the reason in the note, or ask the provider.'},
        {title: 'Visit level higher than the note', facts: ['Coded as a complex visit', 'Note shows one short, simple problem'], answer: 'code', why: 'Coding a higher level than the note supports is called upcoding. Code only the level the documentation backs up.'},
        {title: 'Note and claim, different organs', facts: ['Note: appendectomy done today', 'Claim procedure: tonsil removal'], answer: 'code', why: 'The suffix -ectomy means removal, and append- points to the appendix. The claim must report the removal the note actually documents.'}
      ]
    }
  ]
};
