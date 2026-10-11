# WAP-04 stakeholder request reconciliation — 2026-10-11

Reviewed application revision: `f1ab436e1a6cbc834ad15ed3519aef2a9e4d4db5`.
This ledger reconciles the specific March 2 and March 11 requests with the current
public site and dated owner changes. It does not authorize restoring old copy over
newer approved decisions. No application source, logo, policy, enrollment mapping,
or provider configuration was changed by this reconciliation.

## Sources and coverage

| Ref | Exact message and attachment | Coverage |
| --- | --- | --- |
| S1 | [March 2, 21:32 UTC — Website Enhancements](https://mail.google.com/mail/u/0/#all/19cb078069d1d37f), message `19cb078069d1d37f`; **Workforce Advancement Project-Website Adjustments.docx** | Full six-page extraction and all five embedded screenshot images inspected. The images show the historical site; they are not current production screenshots. |
| S2 | [March 11, 06:30 UTC — Suggested changes for new website](https://mail.google.com/mail/u/0/#all/19cdb96de9e905cb), message `19cdb96de9e905cb`; **Workforce Advancement Project webbsite enhancements.docx** | Complete two-page extraction, all sixteen numbered requests. The sender's local header date is March 10; UTC date is March 11. The filename's spelling is retained here. |
| S3 | [March 11, 17:35 UTC — Slight Modifications](https://mail.google.com/mail/u/0/#all/19cddf85bb24e32d), message `19cddf85bb24e32d` | All three body requests inspected; no attachment. This is the later same-day correction to S2's founder wording and biography. |
| S4 | [March 2, 17:26 UTC — All Courses with Names and Syllabi Overview](https://mail.google.com/mail/u/0/#all/19caf976d57e4208), message `19caf976d57e4208`; **Workforce Advancement Training, Professional Certifcate Programs with Syllabus Overview-Final March 2026.docx** | Metadata read directly; supported attachment receipt supplied by the parallel catalog reviewer. All seventeen pages of extracted text cross-checked for program headings and proposals. Course reconciliation and current-provider access belong to WAP-02. |

Only the necessary requested business copy and source identifiers are retained.
No raw mailbox archive, personal signature, unrelated correspondence, attachment
payload, or credential is committed. This covers the four exact messages above,
not all stakeholder mail or all current operational agreements. The ChatGPT share
link inside S2 was not separately rendered; H1's actual implementation establishes
that the contemporaneous football request concerned the site wrapper.

Status meanings: **satisfied** means the requested behavior/content is present;
**partial** means some requested content is present but the whole request is not
established; **missing** requires evidence of an unmet request that remains current;
**superseded** names a later owner decision; **needs decision** identifies an
unresolved policy, factual, or operational question. An old requested phrase being
absent is not, by itself, a missing application fix.

## Dated implementation and owner decisions

| Ref | Receipt | Relevance |
| --- | --- | --- |
| H1 | [March 11 — a2ec51d97](https://github.com/workforceap/workforceap-beta/commit/a2ec51d97b0e84771479b1576a632ebe0d137ad1), **Implement 16 website enhancements**, owner coauthored | Implements all sixteen S2 items: site oval wrapper, heading/metadata, ten-step process, connector removal, eligibility copy, FAQ category, laptop text, provider logos, biography/name, and age wording. Its actual diff resolves the FAQ request as a category label; it retains FAQ navigation. |
| H2 | [March 11 — ffb8ef792](https://github.com/workforceap/workforceap-beta/commit/ffb8ef792be06fd2993feabf5eb99d87e4f0a3bb), **Update logo centering, homepage text, and leadership bio**, owner coauthored | Applies S3: uniform logo padding, removes inset line artifact, changes founder adjective to distinguished, adds requested biography facts. |
| H3 | [March 18 — 72cb01b73](https://github.com/workforceap/workforceap-beta/commit/72cb01b734ddd5bae1bd4ee1245bc1fbea9e1d0c), **How It Works phases**, owner coauthored | Introduces the later phase presentation after H1's ten-step display. |
| H4 | [March 21 — fe63c6beb](https://github.com/workforceap/workforceap-beta/commit/fe63c6beb9358b6ab02241a878572d94bce32575), **Homepage 10-star: simplify without sterilizing**, owner coauthored | Explicitly collapses mission/vision blocks and tightens the founder sentence to “a workforce leader”; it preserves Michael and prior organizations. The older distinguished sentence must not be silently restored. |
| H5 | [April 27 — 53f60e0c4](https://github.com/workforceap/workforceap-beta/commit/53f60e0c402332a931bddf22de9580c19418f9ad), **switch to oval logo asset**, owner authored | Replaces the earlier CSS-framed logo with the current oval asset. The website oval wrapper and logo oval are distinct requests. |
| H6 | [May 12 — 267870d9c](https://github.com/workforceap/workforceap-beta/commit/267870d9cde8483b2f6c8a97b43d15503319e880), **soften homepage journey into three phases**, owner authored | Explicitly replaces strict numbered homepage framing with Get Started → Train → Launch Your Career, revises labels/order, and aligns the detailed process to those phases. This supersedes S2's exact old order. |
| H7 | [June 24 — 2cdc35414](https://github.com/workforceap/workforceap-beta/commit/2cdc35414edf626694273bc8c7cb0561e32d6a0a), **Astro marketing front + Next.js back**, owner authored | Current marketing composition, metadata, eligibility FAQ, and phase content enter Astro. The June 25 full marketing overhaul follows in PR #2074. A framework migration alone is not used as proof of approval; the explicit H4/H6 decisions resolve founder/process precedence. |
| H8 | [June 1 — 9ba7555293](https://github.com/workforceap/workforceap-beta/commit/9ba7555293f91d7ddcb5ae0ac6cd5cb44ae3605b), **ChE / Texas A&M bio lead**, owner authored; [July 2 — 109c1af77](https://github.com/workforceap/workforceap-beta/commit/109c1af77398afcb9d57f14ec59b9b2acb844ec6), owner authored | Later credentials and public Astro biography/track-record wording. The active public data is `marketing/src/data/leadership.ts`; its expanded biography differs from the legacy `lib/content/leadership.ts`. |
| H9 | [September 22 — 2bce4373c](https://github.com/workforceap/workforceap-beta/commit/2bce4373c5081279299468349f232e09f6699fc6), **new banner statement**, PR #2473 | Explicitly replaces the English homepage mission with Mike Brown's later verbatim statement, citing the owner message. Preserve it over S1. |

This engineering reconciliation follows the dated historical owner decisions in
H4, H6, H8 and H9 when determining which older requests are superseded. The current
user confirmed only that Construction keeps its current wording pending verification.
This session does not establish new owner approval of mission, biography, admissions,
laptop or partnership policies.

## March 2 HOME / ABOUT US requests — S1

The document mixes older screenshots and replacement prose. Page references below
refer to the supplied six-page extraction, not pages on the deployed site.

| ID / location | Necessary request excerpt or precise intent | Current comparison | Status and acceptance/disposition |
| --- | --- | --- | --- |
| M2-01 · p1 headline | “EMPOWERING PEOPLE. ADVANCING FUTURES.” | [Home](../../marketing/src/pages/index.astro) renders both phrases as its H1. | **Satisfied.** Keep the two-part headline; local rendering confirms one H1. |
| M2-02 · p1 mission | Break systemic barriers through funded digital literacy, AI, occupational/professional training for underserved people, adult learners, and veterans. | Current Home mission is the later longer owner statement; [How It Works](../../marketing/src/pages/how-it-works.astro) still names veterans and adult learners. | **Superseded** by H9. Preserve the verbatim current mission and legitimate audience wording. |
| M2-03 · p2 HOME Vision & Mission | Wrap-around assessment, workforce readiness, résumé enhancement, occupational training, stackable pathways, certificates, placement assistance. | Those services appear across current How It Works phases and [What We Do](../../marketing/src/pages/what-we-do.astro); Home no longer has the old standalone block. | **Superseded** in presentation by H4/H6. Retain current service copy; no old block restoration. |
| M2-04 · p2 Programs paragraph | Bridge people/talent/skills/opportunity; training in Digital Literacy, AI, IT, Project Management, Medical Coding/HIT, Manufacturing, Production, Logistics, Core Construction. | [Programs](../../marketing/src/pages/programs.astro) and [current catalog](../../marketing/src/data/programs.ts) cover those subject areas under later approved titles. The full paragraph's partnership assertions are separate from subject coverage. | **Partial.** Subject coverage is present; current provider identity/relationship claims require the evidence in M2-05 and WAP-02. Do not restore obsolete course identities. |
| M2-05 · p2 partnership sentence / p3 Logos | US.Gov, DOL, State of Texas, TWC, Workforce Solutions Capital Area/Rural Capital Area, Coursera, AT&T, Google, Microsoft, IBM. | Home displays IBM, Google, Microsoft, AWS, CompTIA as credential-provider text. Existing assets alone do not establish current partnership or permission to display government/provider logos. | **Needs decision.** Owner supplies current relationship category and logo permission for each proposed organization; no implied government endorsement or new logo published. |
| M2-06 · p3 ABOUT / What We Do Vision & Mission | Same wrap-around services list as M2-03, requested for the other page. | What We Do now has workforce-experience, values, and career-support sections; detailed assessment/readiness/resources are on How It Works. | **Partial.** The service intent is covered across pages; exact former paragraph is absent. Retain current composition; confirm a new literal-paragraph requirement before replacing it. |
| M2-07 · p4 ABOUT mission | No-cost funded digital literacy, AI, occupational/professional training for underserved people, adult learners, veterans. | What We Do says scholarship/grant-funded access for qualifying members; Home uses H9's owner mission. | **Superseded** as exact copy by H7/H9. Preserve qualifying-member funding conditions rather than an unconditional no-cost offer. |
| M2-08 · p4 vision | Every individual/family, regardless of background/income/opportunity, can access skills and support for today's and tomorrow's workforce. | Current mission and How It Works inclusive audience copy express opportunity and support with pathway eligibility. | **Partial.** Inclusive intent is present; the exact universal-access sentence is absent. No new universal eligibility promise. |
| M2-09 · p5 leadership foundation | “over 50 years of shared” leadership experience. | Home, About, What We Do and public Michael biography state 25+ years of workforce experience. The requested 50-year combined-leadership measure differs from an individual's 25-year measure. | **Needs decision.** Confirm people, period, and calculation before publishing a combined statistic. Preserve current owner-authored 25+ wording. |
| M2-10 · p5 career-school history | Prior leadership created career schools, trained over a thousand students, with TWC Career Schools and Colleges approval. | Public biography lists leadership across agencies/nonprofits and former Consulting Solutions.Net ownership. It does not assert the full old school-approval sentence. | **Partial.** Historical affiliation is present; a new regulatory-approval/training-total claim needs identified schools, period and owner evidence. Do not imply approval of every current WorkforceAP program. |
| M2-11 · p5 consulting / school performance | Education/technology consulting, building schools, improving performance/reporting. | [Public leadership data](../../marketing/src/data/leadership.ts) contains Consulting Solutions.Net, technology-training experience, strategic planning, operational innovation and continuous improvement. | **Satisfied** in substance, with H8's later approved wording. Do not rewrite the biography from an older paraphrase. |
| M2-12 · p5 policy / reach | TWC policy, WIOA funding, Workforce Solutions partnerships; scalable statewide/nationwide/possibly worldwide model. | Current public pages describe national availability and conditional funding; [FAQ](../../marketing/src/pages/faq.astro) distinguishes funding review. | **Partial.** National scope/funding context is present; worldwide availability and blanket funding/partnership assertions are not established. Owner evidence is needed before expanding reach or guarantees. |
| M2-13 · p5 closing CTA | “Ready to JumpStart your Career?” | Current Home/About use application-first CTAs and retain working `/apply` links. | **Superseded** by H4/H7's later CTA composition. Preserve current application-first wording and destination. |
| M2-14 · p5 LEADERSHIP | Michael Brown, PMP; Executive Director, CEO. | Public data renders Michael A. Brown, PMP, ChE and Executive Director, CEO. | **Satisfied.** The more specific name/credentials follow S2/S3/H8; current role is retained. |
| M2-15 · p6 order | “switch Lakecia and Brandon spots in order.” | [Leadership](../../marketing/src/pages/leadership.astro) derives board order from public data; Lakecia precedes Brandon. The pre-Next `leadership.html` and March 9 migration already show that order. | **Partial.** Current order is established, but S1 does not name the intended final order and contains no before-image of those cards. Confirm a newly desired order before swapping them again. |

## March 11 numbered requests — S2

| ID / attachment item | Necessary request excerpt or precise intent | Current comparison | Status and acceptance/disposition |
| --- | --- | --- | --- |
| M11-01 · #1 | Horizontally shaped football instead of rectangle; supplied ChatGPT reference. | H1 implemented an elliptical **site wrapper**. Current Astro pages use the later full-width composition. This is distinct from S3's logo-centering request. | **Superseded** by H7 / June marketing overhaul. Do not silently reinterpret this as a new oval logo or wrap the current page in an ellipse. |
| M11-02 · #2 | “Virtual and Hybrid Occupation and Career Programs • Workforce Advancement Project” instead of Austin Career Programs. | H1 applied the requested title/badge then. Current [Layout](../../marketing/src/layouts/Layout.astro) and Home use the later nonprofit/credential framing, branded titles, and mission headline. | **Superseded** by H7's later composition and [current branded-title helper](../../lib/marketing/pageTitle.ts). Do not reintroduce an unverified delivery-mode claim in every page title. |
| M11-03 · #3 | Career-training intro includes Technology, Data, AI, Healthcare, Manufacturing and Skilled Trades. | H1 implemented the expanded list. Current catalog has those subject areas; later Home mission is different copy. | **Satisfied** for subject coverage; the old exact intro is superseded by H9. Keep Healthcare/Manufacturing/Trades represented in catalog, without replacing the verbatim mission. |
| M11-04 · #4 | Founder attribution naming Michael and Consulting Solutions.Net, Goodwill Career & Technical Academy, Austin Area Urban League, Universal Tech Movement, African American Youth Harvest Foundation; initially “veteran”. | H2 applies S3's distinguished correction; H4 later intentionally tightens the founder wording. Current public biography preserves Michael and those organizations' history. | **Superseded** by S3/H2, then H4/H8. No restoration of the former standalone homepage founder paragraph. Never replace veteran intake/status/audience fields. |
| M11-05 · #5 | Apply → Overview → Interview → Membership → Assessment → Workforce Readiness → Resources → Training → Certify → Job Placement Assistance, consistent in both areas. | H1 applied this sequence. H6 intentionally changes the detailed labels/order and presents three phases; current How It Works copies that later arrangement. Home now presents a shorter four-milestone summary. | **Superseded** by explicit H6. Preserve the current owner arrangement. The shorter summary and detailed milestones are recorded separately, not falsely called the same exact ten labels. |
| M11-06 · #6 | “What we do and Leadership Team Looks Great.” | Both destinations remain present, with later owner-approved content and layouts. | **Satisfied** as acceptance of those contemporary pages. It is not a request to freeze every future layout or authorize fabricated credentials. |
| M11-07 · #7 | Same ten steps on How It Works; remove vertical burgundy line. | H1 applies both. H3/H6 later introduce phase presentation. Current `.rail .line` is a neutral-border-to-transparent connector, not the former burgundy timeline. | **Superseded** in process presentation by H3/H6; the original burgundy-line removal is satisfied. Do not delete the later neutral phase connector as though it were the old artifact. |
| M11-08 · #8 | Six eligibility conditions: 16+, citizen/permanent resident, diploma/GED or in process, 100% completion commitment, placement-assistance participation, reliable internet/computer; no prior tech experience required. | H1 applied this FAQ paragraph. Current FAQ says requirements vary by pathway/funding, with staff review; [current apply](../../app/apply/ApplyEligibilityClient.tsx) includes under-18 applicants. It does not publish the former six conditions as a universal policy. | **Needs decision** before reinstating universal conditions. Owner supplies current admissions/funding requirements. Do not reduce valid work-authorization categories or remove guardian rules to match old prose. |
| M11-09 · #9 | FAQ button should say Job Placement Assistance. | H1's actual diff renames the **FAQ category** to Job Placement Assistance and retains FAQ navigation. Current Astro FAQ uses a Job Placement category and questions; `/faq` remains in navigation. | **Superseded** in exact label by H7's FAQ; original destination ambiguity was resolved by H1 as a category. No deletion of FAQ or new placement page from this historical instruction. |
| M11-10 · #10 | Used loaner laptop earned after successful certificate completion; Resources step/dropdown and bottom of home. | H1 published that benefit. Current How It Works says a high-performance loaner during training; current FAQ conditions laptop help on pathway/funding availability. Home has no old earned-laptop block. | **Needs decision.** Confirm availability, eligible pathways, specification, timing, return/ownership terms and whether “loaner” or “earned” is correct. Existing contradictory copy is recorded; no new entitlement/inventory claim published. |
| M11-11 · #11 | Industry-recognized certificates across IT Support, AI, Project Management, Cybersecurity, Healthcare and Skilled Trades; designed with employers for job readiness. | Current catalog, credential-provider text, and How It Works cover these areas and career support; current commitment panel explicitly excludes guaranteed placement and automatic exam enrollment. | **Satisfied** for subject/support intent. Preserve the distinction between coursework, professional certificates, exam eligibility and an actual credential; no job guarantee. |
| M11-12 · #12 | Add Microsoft and IBM alongside Coursera, AT&T and Google in trusted partners. | H1 adds their assets. Current Home includes Microsoft/IBM/Google credential-provider text; [public assets](../../public/images) contain Microsoft/IBM logos. The original five-logo trusted-partner strip is absent. | **Partial.** Microsoft/IBM are represented; a current contractual partnership/endorsement or new five-logo strip still needs owner evidence and permission. Do not equate provider credentials with an organizational partnership. |
| M11-13 · #13 | Chemical Engineering degree, Texas A&M University; name Michael A. Brown, PMP, ChE. | The active public biography, listing and detail page carry those exact name/credential/education facts. H8 separately documents later owner revisions. | **Satisfied.** Preserve the public source and exact supplied credentials; no new degrees or awards invented. |
| M11-14 · #14 | Where/who does `info@workforceAP.org` go to? | [Contact route](../../app/api/contact/route.ts) addresses contact mail to that mailbox; [public Contact](../../marketing/src/pages/contact.astro) links it. Code cannot identify its current mailbox members/forwarding rules or prove delivery. | **Needs decision.** Mailbox administrator confirms routing and responsibility. No sends, test contact submissions, forwarding changes or stakeholder contacts were performed. |
| M11-15 · #15 | “Occupational and Career training, certifications, and support. Explore programs and apply today.” | H1 updates the old top banner. The current Astro layout has later default description; Home's title is Empowering People / Advancing Futures. [English marketing messages](../../marketing/src/i18n/en.json) retain occupational/career terminology, but are not proof of rendered Home metadata. | **Superseded** in exact banner/title/description composition by H7/H9. Keep current rendered metadata; do not infer a visible fix from an unused translation string. |
| M11-16 · #16 | Replace age 18-and-up eligibility wording with 16-and-up. | H1 applied the original wording. Current apply supports under-18 age group; [school collection](../../lib/apply/schoolCollection.ts) and [signup](../../app/api/apply/signup/route.ts) deliberately retain an under-18 guardian boundary. | **Partial.** Under-18 applicants are supported; current universal minimum-age policy is not certified here. No global 18→16 replacement: guardian and age-band thresholds are separate contracts. |

## Later March 11 body corrections — S3

| ID / body item | Necessary request excerpt or precise intent | Current comparison | Status and acceptance/disposition |
| --- | --- | --- | --- |
| MOD-01 · #1 | Center logo better in oval and remove the slight small line. | H2 removes the old inset artifact; H5 adopts the oval asset. Current header/footer use `wap_logo.png`; the asset and local rendered header show centered artwork without that detached line. | **Satisfied.** Preserve current oval asset, its original proportions, and accessible home link. No raster manipulation or new logo. |
| MOD-02 · #2 | Distinguished instead of Veteran on first page; corrected founder sentence. | H2 applied the correction at the time. H4 intentionally replaces the phrase with “a workforce leader”; H7's Home no longer has the former founder block. | **Superseded** by H4's explicit owner wording. No founder adjective change is presently required, and veteran status remains valid. |
| MOD-03 · #3 | Supplied Michael A. Brown, PMP, ChE biography: business/project-management/education history; Texas A&M Chemical Engineering; Consulting Solutions.Net and named organizations; Celebration Church elder, Concordia board, 100 Black Men of Austin, Alpha Phi Alpha. | Active public biography retains requested credentials, organizational history and community facts, with later owner additions/reorganization in H8. | **Satisfied** in supplied facts; exact prose is superseded by H8. Preserve current public biography; the email supports requested copy, not independent verification of every credential or a license to invent others. |

## March 2 course attachment — S4 / WAP-02 boundary

The historical document has nineteen program headings. Current marketing and app
catalogs have twenty tracks. An old title is not an alias approval or authority to
change an existing learner's course keys. The current public source is
[marketing programs](../../marketing/src/data/programs.ts); the application source is
[app programs](../../lib/content/programs.ts). Later regulatory detail comes from
[twelve July syllabi and three August 27 amendments](../../shared/programSyllabi.ts),
with source-document hashes, and separately authored/fail-closed
[trade curricula](../../shared/programCurricula.ts).

The catalog reviewer reports current title/duration parity for all twenty tracks
at the reviewed base. Three separate unregulated course-list drifts (IT entry,
Net+, Sec+) are being corrected in WAP-02 by sharing the existing checked-in
[Coursera discovery snapshot](../../lib/coursera/courseraDiscoveredCatalog.ts).
That in-progress patch is not part of this commit and is not called deployed here.
Frozen current learner keys for the amended management/DBA programs are preserved.

| ID / source pages | Historical requested program / duration | Current disposition and acceptance |
| --- | --- | --- |
| C01 · p1 | Digital Literacy Empowerment Class · 6–7 weeks; device distribution and six-week classroom outline | **Superseded** by the [September DigitalLearn pathway](../../shared/digitalLiteracyPathway.ts). Preserve current public self-paced modules and explicit provider-sync limits; no device-distribution promise from the old outline. |
| C02 · p1–2 | Artificial Intelligence Professional Developer Certificate (IBM) · 3–5 months | **Superseded** by later approved AI/software catalog identities and syllabi. No one-to-one enrollment substitution is inferred. Preserve current AI/Software Developer and AI Practitioner identities. |
| C03 · p2 | AWS Cloud Technology Professional Certificate · 3–5 months | **Superseded** in exact curriculum/title authority by the July syllabus/current AWS Cloud Technology catalog entry. Preserve current public title and source hours. |
| C04 · p2–3 | CompTIA A+ Professional Certificate · 3–5 months | **Superseded** in curriculum detail by July source transcription. Do not replace its current contact-hour/course plan with the old outline. |
| C05 · p3 | CompTIA Networking+ Professional Certificate · 3–5 months | **Partial.** Current Net+ track exists with matching app/public title-duration; old course outline is not the current provider snapshot. WAP-02 owns the identified current course-list drift; no claim of live provider availability. |
| C06 · p3 | CompTIA Security+ Professional Certificate · 3–5 months | **Partial.** Current Sec+ track exists; WAP-02 owns the current three-vs-four course-list drift. Reconcile against the existing snapshot, preserving learner keys. |
| C07 · p4 | Cybersecurity Professional Certificate (Google) · 3–5 months | **Superseded** by the Networking and Cybersecurity approved amendment. Preserve its current title/syllabus and frozen legacy slug; do not restore the old eight-course track over the amendment. |
| C08 · p4 | Data Analytics Professional Certificate (Google) · 3–5 months | **Superseded** by the Management Analyst & Business Intelligence approved amendment. Preserve the current published title and stable existing learner keys. |
| C09 · p5 | Data Science Professional Certificate (IBM) · 3–5 months | **Superseded** by the Database Administrator (DBA) approved amendment. Do not rename historical learner keys from a marketing copy task. |
| C10 · p5–6 | Digital Marketing & E-Commerce · 3–5 months | **Superseded** in source-of-truth detail by its July syllabus; current track remains present. Keep current approved title/hours rather than copying March bullets. |
| C11 · p6 | IT Automation with Python · 3–5 months | **Satisfied** for current Google track, six-course outline and advertised duration. It is not one of the twelve July syllabus transcriptions; no current provider availability or enrollment is certified. |
| C12 · p6–7 | IT Support Professional Certificate (IBM) · 3–5 months | **Superseded** in course/hour authority by its July syllabus. The separate current IT Support and Entry-level Cybersecurity track is not silently merged into it; WAP-02 owns that other track's list drift. |
| C13 · p7 | Project Management Professional Certificate (Microsoft) · 3–5 months | **Superseded** in curriculum authority by July source transcription; current Microsoft track remains present. No automatic PMP exam/credential promise. |
| C14 · p7–8 | UX Design Professional Certificate (Google) · 3–5 months | **Superseded** by current approved User Experience & Interface Design title/syllabus. Preserve existing provider/learner linkage. |
| C15 · p8–9 | Software and Applications Developer Professional Certificate (IBM) · 4–6 months | **Superseded** by current AI and Software Developer approved title/curriculum/duration. Do not publish the historical calendar as a current offer. |
| C16 · p9–11 | Medical Coding and Health Information Technician · 5–7 months, hybrid/in-person, optional CPC/CCS/CAHIMS/Healthcare IT tracks | **Superseded** by current Medical Billing, Coding, and Health Information Technician approved syllabus. Do not restore unverified optional credentials or delivery-mode guarantees. |
| C17 · p11–13 | Certified Production Tech · 2–4 months, 160 clock hours, MSSC four-module credential | **Needs decision** for the old proposed hours/delivery/credential entitlement. Current trade curricula have explicit owner-verification gates; preserve published current wording until those gates and source facts are verified. |
| C18 · p13–15 | Certified Logistics Technician · 160 hours; hybrid/lab delivery; optional OSHA/forklift/Lean additions | **Needs decision** for the proposed delivery, optional credentials and hours. Keep current fail-closed curriculum/credential boundaries; no additions from this old outline. |
| C19 · p16–17 | Core Construction Skilled Trades Readiness · 8–12 weeks, electrical/HVAC/maintenance foundations | **Superseded** as the current calendar. On October 11 the user chose **Keep current** for the historical duration conflict. Preserve “5 hours per section”; publish neither 8–12 nor the handoff's conflicting 6–10 solely from old mail. |

Historical license allocations and “other free courses” are not current inventory,
funding eligibility, or provider access proof. Current Coursera catalog/seat read
access was unavailable to the catalog reviewer. No current-seat count, free-course
entitlement, external enrollment, or provider configuration change is certified.

## Current route and rendering evidence

The [production build pipeline](../../scripts/vercel-build.cjs) compiles Astro and
copies its output into Next `public/`. [Locale route policy](../../lib/i18n/config.ts),
[middleware](../../middleware.ts) and [Next redirects](../../next.config.ts) were
checked to identify the active public sources. The translated `Home.astro` and
message files are not proof that a particular deployed URL renders those strings.
Public biography source is the Astro data file, not the old Next biography alone.

An unchanged-source Astro build on this revision generated 70 pages. A serialized
local Chromium check visited `/`, `/about`, `/how-it-works`, `/leadership` and
`/leadership/michael-brown` at 375, 768 and 1440 pixels: **15/15 HTTP 200**, zero
page exceptions, no document horizontal overflow, and both house fonts loaded.
Capture measurements are in the [sanitized local render receipt](wap-04-stakeholder-render-2026-10-11.json).
Public-page screenshots and the build log remain outside Git at
`/workspace/artifacts/wap-stakeholder-copy-20261011/current/`. This was a localhost
Astro check with external analytics blocked; no form submissions, authentication,
emails, external enrollments or production data reads were performed.

Direct production requests from this execution environment failed at its configured
proxy with HTTP 403 before reaching the site; the proxy was not bypassed. The
available public web reader returned Home content crawled today, confirming the
current headline/mission and four-milestone summary. Its How It Works result was
cached two weeks old; the Michael detail URL was unavailable through that reader.
These are bounded text observations, not fresh live screenshots, compiled-Next
route acceptance, current provider verification, or five-role portal certification.

## Remaining owner work

1. Confirm the laptop policy and inventory; reconcile the current duration-loaner
   language with the historical earned-device request before publishing an entitlement.
2. Confirm current admissions/funding conditions and minimum age. Preserve the
   separate under-18 guardian boundary and valid work-authorization handling.
3. Verify any new government/provider partnership labels, logo permissions,
   combined experience totals, historical school approvals or international scope.
4. Have the mailbox administrator identify `info@workforceap.org`'s responsible
   recipients/forwarding rules. Application recipient code does not answer that question.
5. Complete WAP-02's scoped catalog parity fix and current-provider checks when
   authorized access exists. Keep the user's current Construction wording.

No unambiguous still-current editorial/design defect was established from these
four old requests after the owner-successor checks. In particular, this ledger is
not approval to roll back the mission, founder biography, phase arrangement,
modern marketing layout, eligibility policy, or current catalog to March copy.
