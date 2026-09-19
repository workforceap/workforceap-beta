// Truth-locked blog content copied VERBATIM from /home/claw/workforceap/prisma/seed-blog.ts
// (the Next /blog route reads these posts from Postgres via Prisma — a server dep —
// so the canonical seed data is mirrored here as plain data for static Astro generation).
// Do not edit copy: this is the source of truth for the marketing /blog route.

export type BlogPost = {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  authorName: string;
  published: boolean;
  publishedAt: string; // ISO date (UTC) — matches seed `new Date('YYYY-MM-DD')`
  content: string;
  heroImage?: string;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'breaking-into-tech-starting-over',
    title: 'Breaking Into Tech: What No One Tells You About Starting Over',
    category: 'Career Tips',
    heroImage:
      '/images/blog/1522071820081-009f0129c71c.jpg',
    excerpt:
      "The hardest part isn't learning to code — it's believing the door is open for you.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-01',
    content: `Starting over is terrifying. Whether you're 28 or 48, walking away from what you know to chase something new takes a kind of courage most people underestimate.

But here's what the job postings don't tell you: the tech industry has a massive entry-level gap. Companies need help desk technicians, junior data analysts, IT support specialists, and cybersecurity analysts — and they're not finding enough qualified people.

That's where certifications change the game. A Google Cybersecurity Certificate or CompTIA A+ doesn't just teach you skills — it signals to an employer that you took initiative, completed a rigorous program, and know the fundamentals. That signal matters more than a four-year degree for many of these roles.

The mental shift required is real. You'll feel like a beginner again. You'll compare yourself to people who've been in tech for years. But the people who make it through are the ones who stop waiting to feel ready and just start.

WorkforceAP exists for exactly this moment. We provide the structure, support, and credentials to help you take that first step — and we don't let you take it alone.`,
  },
  {
    slug: 'google-cybersecurity-certificate-worth-it',
    title: "What Is Google's Cybersecurity Certificate — And Is It Worth It?",
    category: 'Program Spotlight',
    heroImage:
      '/images/blog/1550751827-4bd374c3f58b.jpg',
    excerpt:
      "Six months. No experience required. A job title that commands $75K+. Here's what you need to know.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-05',
    content: `Google's Cybersecurity Professional Certificate is one of the most talked-about credentials in the workforce development space right now — and for good reason.

In roughly 3–5 months (at 10 hours per week), you'll cover the fundamentals of cybersecurity: risk management, network security, Linux, SQL, Python scripting, and incident response. The program is designed for absolute beginners. No prior tech experience required.

**What you'll earn:** Upon completion, you receive the Google Cybersecurity Certificate, which is recognized by hundreds of employers through Google's employer consortium.

**What employers pay:** Entry-level cybersecurity roles in Texas typically start between $75,000 and $112,000 depending on the specific title and organization.
**Is it worth it?** If you're willing to put in the work, yes. The certificate alone won't get you hired — but paired with the interview prep, resume support, and job placement assistance WorkforceAP provides, it becomes a real career launchpad.

The 8-course curriculum includes hands-on labs, portfolio projects, and exam prep. By the end, you'll have the skills and credentials to pursue roles like Security Analyst, SOC Analyst, or IT Security Specialist.`,
  },
  {
    slug: 'from-warehouse-to-it-support-marcus-story',
    title: "From Warehouse to IT Support: Marcus's Story",
    category: 'Success Stories',
    heroImage:
      '/images/blog/1523240795612-9a054b0db644.jpg',
    excerpt:
      "He spent 12 years in logistics. Six months later, he's a certified IT technician with a new career trajectory.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-10',
    content: `Marcus spent 12 years working in logistics and warehouse management in the Austin area. He was good at his job — but after a facility closure in 2024, he found himself at a crossroads.

"I always liked technology," Marcus said. "I was always the guy people called when something broke. I just never thought I could make a career out of it."

At 34, Marcus enrolled in the CompTIA A+ program through WorkforceAP. He committed to 10 hours a week around his part-time schedule.

Five months later, he passed both CompTIA A+ Core exams on his first attempt.

Within six weeks of certification, Marcus accepted a Help Desk Technician role at an Austin-area managed services provider — a 40% increase over his previous warehouse salary.

"The hardest part was believing I could actually do it," he said. "WorkforceAP made it real. The structure, the support — I didn't feel like I was doing it alone."

Marcus is now pursuing his CompTIA Network+ certification and has his eye on a systems administrator role within two years.`,
  },
  {
    slug: '5-certifications-under-6-months',
    title: '5 High-Demand Certifications You Can Earn in Under 6 Months',
    category: 'Career Tips',
    excerpt:
      "The job market rewards speed and credentials. Here are the five certs employers are hiring for right now.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-12',
    content: `The fastest path from unemployed to employed in tech isn't a four-year degree — it's a targeted certification. Here are five credentials employers are actively hiring for, all completable in under six months.

**1. Google Cybersecurity Professional Certificate**
3–5 months | Research occupational pay and entry requirements in our [career and salary guide](/salary-guide).
Covers network security, Linux, Python, and incident response. One of the most recognized entry-level cybersecurity credentials on the market.

**2. CompTIA A+**
3–5 months | Research occupational pay and entry requirements in our [career and salary guide](/salary-guide).
The gold standard for IT support and help desk roles. Two exams covering hardware, networking, operating systems, and security fundamentals.

**3. AWS Cloud Technology (Amazon)**
3–5 months | Research occupational pay and entry requirements in our [career and salary guide](/salary-guide).
Cloud is everywhere. This program covers AWS architecture, DevOps, Python, and data analytics — and Amazon's name on your resume opens doors.

**4. Database Administrator (DBA) Professional Certificate (IBM)**
3–5 months | Research occupational pay and entry requirements in our [career and salary guide](/salary-guide).
SQL, Python, Linux, ETL, database security, backup and recovery, and performance tuning for database-administration careers.

**5. Google Project Management Certificate**
3–5 months | Research occupational pay and entry requirements in our [career and salary guide](/salary-guide).
Agile, Scrum, risk management, and MS Project. Project management credentials transfer across industries — tech, healthcare, construction, and more.

All five programs are available through WorkforceAP. Qualifying applicants may be eligible for funded enrollment.`,
  },
  {
    slug: 'austin-best-city-launch-tech-career',
    title: 'Why Austin Is One of the Best Cities to Launch a Tech Career',
    category: 'Local',
    excerpt:
      "Dell, Tesla, Apple, Google — Austin's tech scene is booming. Here's how to get in.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-15',
    content: `Austin has quietly become one of the most important tech hubs in the United States — and if you live here, that's an opportunity you shouldn't ignore.

In the past decade, the Austin metro has seen explosive growth in technology employment. Dell has been here for decades. Tesla, Apple, Google, Oracle, and dozens of high-growth startups have all established major presences in the area. The result: a surging demand for tech workers at every level.

The challenge is that many of these opportunities go to experienced professionals from other cities. Entry-level Austin residents — especially those from underserved communities — often don't have the credentials to compete.
That's exactly what WorkforceAP is built to fix.

Our programs are specifically designed for Austin-area residents who want to break into tech, healthcare, or skilled trades. We provide industry-recognized certifications, wrap-around support, and job placement assistance — all geared toward connecting Austin talent with Austin employers.

The demand is here. The jobs are here. The only thing standing between you and a career in tech is the right credential and the right support system.

We're ready when you are.`,
  },
  {
    slug: 'michael-brown-workforce-leader-austin',
    title: "Michael Brown: The Man Behind Austin's Workforce Development Movement",
    category: 'Success Stories',
    excerpt: "For over 25 years, Michael Brown has been quietly transforming careers across Austin. Here's the story behind WorkforceAP.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-16',
    content: `Michael Brown, PMP, has spent more than 25 years doing work that most cities don't notice until it's gone — building pipelines from poverty to prosperity, one certification at a time.

A recognized workforce development leader in the Austin metro area, Brown has led career training programs at some of the city's most impactful organizations: Goodwill Career & Technical Academy, Austin Area Urban League, Universal Tech Movement, and the African American Youth Harvest Foundation. In his first year leading Goodwill's Career & Technical Academy, he engineered a $700,000 revenue turnaround. At Austin Area Urban League, he built a workforce unit that generated $500,000 in first-year revenue.
His approach has always been the same: meet people where they are, give them the skills the market actually needs, and stay with them through the finish line.

"The credential is just the beginning," Brown has said. "What we're really doing is changing someone's relationship with possibility."

WorkforceAP is the culmination of that philosophy — a program that combines industry-recognized certifications from Google, IBM, Microsoft, and Amazon with the wrap-around services that Brown has spent decades refining: assessment, workforce readiness, loaner laptops, and job placement assistance.

With 19 programs spanning technology, healthcare, manufacturing, and skilled trades, WorkforceAP is designed for Austin's underserved communities, adult learners, and veterans — the people who have historically been left out of the city's economic boom.

The work continues. And if Brown's track record is any indication, the results will speak for themselves.`,
  },
  {
    slug: 'top-20-cities-launch-tech-career',
    title: 'The 20 Best Cities to Launch a Tech Career in 2026',
    category: 'Career Tips',
    excerpt: 'From Austin to Atlanta, these are the metros where certified tech workers are in highest demand — and where you can build a career from the ground up.',
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-17',
    content: `The tech job market isn't just in Silicon Valley anymore. As remote work reshapes hiring and companies expand into secondary markets, certified tech workers have more geographic opportunity than ever before.

Here are 20 cities where the demand for entry-level certified professionals is growing fastest:

**1. Austin, TX** — Dell, Tesla, Apple, and a booming startup scene make Austin one of the top tech markets in the country. Strong demand for IT support, cybersecurity, and data roles.

**2. Dallas-Fort Worth, TX** — Corporate headquarters, financial services, and healthcare systems drive massive demand for IT and data professionals.
**3. Atlanta, GA** — A rising tech hub with strong fintech, cybersecurity, and logistics sectors.

**4. Nashville, TN** — Healthcare tech is booming. Health IT professionals are in short supply.

**5. Phoenix, AZ** — Rapid corporate relocation has created a surge in IT and cybersecurity hiring.

**6. Charlotte, NC** — Financial services and logistics drive strong demand for data and IT roles.

**7. Raleigh-Durham, NC** — Research Triangle is a magnet for biotech, pharma, and tech companies needing data talent.

**8. Denver, CO** — Strong in cybersecurity, cloud, and aerospace tech.

**9. Columbus, OH** — Finance, insurance, and retail tech create steady IT and data analyst demand.

**10. Indianapolis, IN** — Manufacturing tech and healthcare IT are growing rapidly.
**11. San Antonio, TX** — Military and government cybersecurity contracts drive consistent demand.

**12. Tampa, FL** — Financial services and healthcare create strong IT support and cybersecurity pipelines.

**13. Jacksonville, FL** — Logistics, finance, and healthcare fuel steady IT hiring.

**14. Kansas City, MO** — Agriculture tech and financial services create niche demand for data and IT.

**15. Louisville, KY** — Healthcare and logistics IT are growing faster than local talent supply.

**16. Memphis, TN** — Supply chain and logistics technology is a standout opportunity.

**17. Birmingham, AL** — Healthcare systems and manufacturing create underserved IT demand.
**18. Oklahoma City, OK** — Energy sector digital transformation is driving cybersecurity and data hiring.

**19. El Paso, TX** — Manufacturing, military, and cross-border trade fuel strong IT support demand.

**20. Detroit, MI** — Automotive tech transformation is creating massive demand for manufacturing IT and data professionals.

The common thread: industry certifications from Google, IBM, CompTIA, Amazon, and Microsoft are recognized by employers in every one of these markets. You don't need a four-year degree — you need the right credential and the confidence to apply.

WorkforceAP trains and supports members for careers in these markets and beyond. Qualifying participants complete training at no cost.`,
  },
  {
    slug: 'bringing-manufacturing-back-america',
    title: "Bringing Manufacturing Back: Why Skilled Trades Are America's Next Big Opportunity",
    category: 'Career Tips',
    excerpt: "Reshoring is real. Billions in new factories are coming online — and they need certified workers who aren't here yet.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-18',
    content: `Something is shifting in American manufacturing — and it's creating one of the biggest workforce opportunities in decades.

Driven by federal investment, supply chain restructuring, and national security concerns, companies are bringing production back to American soil at a pace not seen in a generation. Semiconductor fabrication plants, EV battery factories, steel mills, and advanced manufacturing facilities are being built from Texas to Michigan — and they all need one thing: skilled workers.

The problem? There aren't enough of them.

According to the Manufacturing Institute, the U.S. faces a shortage of 2.1 million manufacturing workers by 2030. The average age of a skilled tradesperson is over 44. Retirement is accelerating the gap. And traditional vocational pipelines have been underfunded for years.
This is where the opportunity lives.

**What the jobs actually pay:**
- Production Technician: $48K–$70K starting
- CNC Machinist: $52K–$78K
- Quality Control Technician: $50K–$72K
- Logistics & Supply Chain Specialist: $55K–$78K
- Construction Safety Specialist (OSHA-10): $48K–$68K

These aren't dead-end jobs. They're the foundation of careers in advanced manufacturing, industrial management, and operations technology — industries that are growing, not shrinking.

**The certification path:**
You don't need four years of college to get in the door. Programs like the Certified Production Technician (CPT) certificate, OSHA-10, and Certified Logistics Technician (CLT) are industry-recognized credentials that employers hire directly against. Most can be completed in 3–5 months.

WorkforceAP offers training in Production Technology, Logistics & Supply Chain, and Construction Readiness — all designed for people entering manufacturing for the first time. Qualifying participants complete training at no cost.
The reshoring wave is here. The factories are being built. The question is whether American workers will be trained and ready when the doors open.

We're making sure ours are.`,
  },
  {
    slug: 'what-reshoring-means-for-workers',
    title: "What 'Reshoring' Means for Workers Like You",
    category: 'Career Tips',
    excerpt:
      "Supply chains are coming home. Factories are being built on American soil. The workers who get certified now are the ones who get hired first.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-19',
    content: `You may have heard the word "reshoring" in the news lately. But what does it actually mean for someone trying to build a career?

Here's the short version: for decades, American companies outsourced manufacturing overseas — to China, Mexico, Vietnam — chasing lower costs. Then COVID hit. Global supply chains collapsed. Companies couldn't get the parts, goods, and materials they needed. The lesson was brutal and clear: depending on the other side of the world is a fragile strategy.

So now the factories are coming back.

**What reshoring means in practice:**
Semiconductor plants in Arizona. EV battery factories in Georgia and Tennessee. Steel mills in Pennsylvania. Pharmaceutical manufacturing returning to the Midwest. The federal government is investing billions to accelerate this shift through the CHIPS Act, the Inflation Reduction Act, and infrastructure bills. These aren't political promises — the construction permits are filed, the ground is being broken.

**What reshoring needs: workers.**
Every one of these facilities needs a workforce. Production technicians. Quality control specialists. Logistics coordinators. Supply chain analysts. Construction crews. IT support staff. The jobs are not going to experienced workers from other countries — they're going to trained Americans who are ready when the doors open.

That's the opportunity.

**The certification path:**
You don't need a four-year degree to walk through that door. The Certified Production Technician (CPT), OSHA-10, Certified Logistics Technician (CLT), and CompTIA certifications are exactly what these employers hire against. They're recognized, they're attainable in 3–5 months, and they signal to an employer that you know the fundamentals.

WorkforceAP offers training in Production Technology, Logistics & Supply Chain, and Construction Readiness — all designed for people entering these industries for the first time. Qualifying participants complete training at no cost.

The reshoring wave is not coming. It's here. The question is whether you'll be ready when the hiring starts.

We're making sure our members are.`,
  },
  {
    slug: 'supply-chain-disruption-best-job-market-manufacturing',
    title: "Supply Chain Disruption Created the Best Job Market in Manufacturing History — Are You Ready?",
    category: 'Career Tips',
    excerpt:
      "COVID broke global supply chains. Companies are rebuilding domestically at a pace not seen in generations. Here's how to position yourself to benefit.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-20',
    content: `Something unprecedented happened during the pandemic: the global supply chain broke.

Factories shut down. Container ships sat at anchor. Semiconductors ran out. Car lots emptied. Baby formula disappeared from shelves. The entire global manufacturing system — built on the assumption that cheap overseas production plus just-in-time delivery always works — revealed its fatal flaw.

And out of that crisis, something remarkable is emerging: the most significant reshoring of American manufacturing in modern history.

**The numbers are staggering.**
According to the Reshoring Initiative, the U.S. brought back more manufacturing jobs in 2022 and 2023 than in the previous decade combined. Companies that once thought "Made in America" was a premium they couldn't afford are now realizing it's a risk management strategy they can't afford to skip.

**What this means for the workforce:**
The Manufacturing Institute estimates a shortage of 2.1 million manufacturing workers by 2030. Companies are building the factories. They can't find the workers. That gap is an opportunity — but only for people who are trained and credentialed.

**The certifications that open the door:**
- **Certified Production Technician (CPT)** — the entry point for advanced manufacturing roles, covering CNC operations, quality control, and lean manufacturing
- **Certified Logistics Technician (CLT)** — covers the supply chain, inventory, transportation, and warehouse systems that keep these facilities running
- **OSHA-10 Construction** — required baseline credential for construction and facility work
- **CompTIA A+ / Network+** — manufacturing facilities run on technology; IT support is needed at every site

All completable in 3–5 months. All recognized by employers nationwide.

**The equity dimension:**
Here's what doesn't get talked about enough: reshoring creates jobs in the communities where factories are built. If those communities don't have a trained local workforce, the jobs go to workers from elsewhere. Workforce development isn't charity — it's how communities capture the economic benefit of the manufacturing comeback.

WorkforceAP exists to make sure Austin-area residents, adult learners, and veterans are ready when that opportunity arrives.

Qualifying participants complete training at no cost. The window is open right now.`,
  },
  {
    slug: 'equity-reshore-movement-workforce-development',
    title: "Equity and the Reshore Movement: Why Workforce Development Has Never Mattered More",
    category: 'Career Tips',
    excerpt:
      "Reshoring creates jobs — but only communities with trained workers benefit. That's the gap workforce development is built to close.",
    authorName: 'WorkforceAP Team',
    published: true,
    publishedAt: '2026-03-21',
    content: `The reshoring movement is one of the most significant economic shifts in a generation. Factories are coming back to American soil. Supply chains are being rebuilt domestically. Billions in federal investment are flowing into manufacturing, construction, and technology infrastructure.

But here's the uncomfortable truth: economic opportunity doesn't distribute itself equally.

When a semiconductor plant opens in a new city, it needs thousands of workers. The company will hire from wherever the trained talent exists. If the local community doesn't have it, the jobs go elsewhere — to workers who relocate, or to contractors who bring their own crews. The community gets the factory but not the economic benefit.
This is exactly why workforce development is not a social service. It's an economic infrastructure investment.

**The equity gap in workforce training:**
For decades, career training in America has been unequally distributed. Four-year university pathways — expensive, time-consuming, and inaccessible to many — have been treated as the default. Vocational and certification programs have been underfunded and stigmatized.

The result: underserved communities, adult learners without degrees, veterans transitioning out of service, and low-income workers have been systematically excluded from the economic mainstream — not because of lack of ability or drive, but because of lack of access to training.

**The WorkforceAP mission:**
WorkforceAP was founded on a simple premise: access to quality career training should not depend on your zip code, your income, or your background.

Our programs — spanning technology, healthcare, manufacturing, and skilled trades — are specifically designed for people who have been left out of traditional pathways. We provide industry-recognized certifications, wrap-around support, resume assistance, job placement help, and access to the tools you need to compete.

The reshoring wave is creating a once-in-a-generation opportunity to close workforce equity gaps. New factories need workers. New supply chains need logistics specialists. New construction projects need certified tradespeople.

The question is not whether the jobs will be there. They will. The question is whether the people who have historically been locked out of opportunity will be trained and ready to take them.
That's the work. And it has never mattered more than it does right now.

Qualifying participants complete training at no cost. Apply today.`,
  },
];

// --- Default-image fallback (mirrors lib/blog/defaultImages.ts) -------------
// Deterministic category+slug → curated Unsplash image, used when a post has no heroImage.
type DefaultImage = { url: string; alt: string };

const IMAGE_POOLS: Record<string, DefaultImage[]> = {
  'Career Tips': [
    { url: '/images/blog/1507679799987-c73779587ccf.jpg', alt: 'Professional in business attire' },
    { url: '/images/blog/1521737711867-e3b97375f902.jpg', alt: 'Team collaborating at a table' },
    { url: '/images/blog/1454165804606-c3d57bc86b40.jpg', alt: 'Person working on laptop with notes' },
    { url: '/images/blog/1573497019940-1c28c88b4f3e.jpg', alt: 'Confident professional smiling' },
    { url: '/images/blog/1522202176988-66273c2fd55f.jpg', alt: 'Group of people learning together' },
  ],
  'Program Spotlight': [
    { url: '/images/blog/1517694712202-14dd9538aa97.jpg', alt: 'Laptop with code on screen' },
    { url: '/images/blog/1531482615713-2afd69097998.jpg', alt: 'Classroom training session' },
    { url: '/images/blog/1581091226825-a6a2a5aee158.jpg', alt: 'Person using technology for learning' },
    { url: '/images/blog/1516321318423-f06f85e504b3.jpg', alt: 'Digital learning environment' },
    { url: '/images/blog/1488590528505-98d2b5aba04b.jpg', alt: 'Computer screen with data' },
  ],
  Local: [
    { url: '/images/blog/1449824913935-59a10b8d2000.jpg', alt: 'City downtown aerial view' },
    { url: '/images/blog/1517248135467-4c7edcad34c4.jpg', alt: 'Local community gathering space' },
    { url: '/images/blog/1497366811353-6870744d04b2.jpg', alt: 'Modern office in urban setting' },
    { url: '/images/blog/1577962917302-cd874c4e31d2.jpg', alt: 'Community members at local event' },
    { url: '/images/blog/1486325212027-8081e485255e.jpg', alt: 'Downtown buildings and street' },
  ],
  'Success Stories': [
    { url: '/images/blog/1552664730-d307ca884978.jpg', alt: 'Team celebrating a win' },
    { url: '/images/blog/1529156069898-49953e39b3ac.jpg', alt: 'Graduates tossing caps in the air' },
    { url: '/images/blog/1560439514-4e9645039924.jpg', alt: 'Professional shaking hands' },
    { url: '/images/blog/1521737604893-d14cc237f11d.jpg', alt: 'Diverse team working together' },
    { url: '/images/blog/1519389950473-47ba0277781c.jpg', alt: 'People using laptops at desks' },
  ],
  News: [
    { url: '/images/blog/1497366811353-6870744d04b2.jpg', alt: 'Newspaper and coffee' },
    { url: '/images/blog/1495020689067-958852a7765e.jpg', alt: 'News on a digital screen' },
    { url: '/images/blog/1557804506-669a67965ba0.jpg', alt: 'Conference presentation' },
    { url: '/images/blog/1526628953301-3e589a6a8b74.jpg', alt: 'Data dashboard on monitor' },
    { url: '/images/blog/1551836022-d5d88e9218df.jpg', alt: 'Press microphones at event' },
  ],
  General: [
    { url: '/images/blog/1523240795612-9a054b0db644.jpg', alt: 'Students studying together' },
    { url: '/images/blog/1434030216411-0b793f4b4173.jpg', alt: 'Person writing in notebook' },
    { url: '/images/blog/1516321497487-e288fb19713f.jpg', alt: 'Workshop with laptops open' },
    { url: '/images/blog/1542744173-8e7e53415bb0.jpg', alt: 'Business meeting in progress' },
    { url: '/images/blog/1531545514256-b1400bc00f31.jpg', alt: 'People collaborating on whiteboard' },
  ],
};

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) - h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getDefaultImage(category: string | null | undefined, slug: string | null | undefined): DefaultImage {
  const pool = IMAGE_POOLS[category ?? ''] ?? IMAGE_POOLS['General'];
  const index = hashSlug(slug ?? '') % pool.length;
  return pool[index];
}

/** Resolve a post's hero/card image: real heroImage if set, else the deterministic default. */
export function resolveHeroImage(post: Pick<BlogPost, 'heroImage' | 'category' | 'slug' | 'title'>): { src: string; alt: string } {
  const h = post.heroImage?.trim();
  if (h) return { src: h, alt: `Cover image for ${post.title}` };
  const fallback = getDefaultImage(post.category, post.slug);
  return { src: fallback.url, alt: fallback.alt };
}

/** Format a publish date the same way the Next site does: numeric M/D/YYYY in UTC. */
export function formatPublishedDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

/** Published posts, newest first (mirrors the listing query order). */
export function getPublishedPosts(): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.published).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

/** Distinct categories in listing order. */
export function getCategories(): string[] {
  const seen = new Set<string>();
  for (const p of getPublishedPosts()) {
    if (p.category) seen.add(p.category);
  }
  return Array.from(seen);
}

/** Up to `take` related posts in the same category (excludes the current slug), newest first. */
export function getRelatedPosts(slug: string, category: string, take = 3): BlogPost[] {
  return getPublishedPosts()
    .filter((p) => p.slug !== slug && p.category === category)
    .slice(0, take);
}
