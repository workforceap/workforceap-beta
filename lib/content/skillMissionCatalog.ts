// lib/content/skillMissionCatalog.ts

export type QuizQuestion = {
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
};

export type SkillMissionDefinition = {
  key: string;
  courseSlug: string;
  programSlug: string;
  programTitle: string;
  courseTitle: string;
  missionName: string;
  missionTagline: string;
  primaryAxis: string;
  skillLabels: string[];
  scenarioPrompt: string;
  evidenceHint: string;
  quizQuestions: QuizQuestion[];
  estimatedMinutes: number;
};

const SKILL_MISSION_CATALOG: SkillMissionDefinition[] = [

  // ─── PROGRAM 1: Workforce AP Digital Literacy Course ───────────────────────

  {
    key: "digital-literacy-empowerment-class:mission:digital-literacy-course-1",
    courseSlug: "digital-literacy-course-1",
    programSlug: "digital-literacy-empowerment-class",
    programTitle: "Workforce AP Digital Literacy Course",
    courseTitle: "Computer Basics",
    missionName: "Support Hero",
    missionTagline: "Prove you can keep people safe online",
    primaryAxis: "Service",
    skillLabels: ["Online safety awareness", "Digital citizenship", "Web Browser", "Communication"],
    scenarioPrompt: "You just joined a nonprofit office that serves seniors. A colleague forwards an email asking everyone to click a link and verify their login credentials or their account will be suspended. Your coworker asks you what to do. Using what you learned in the Orientation & Informational Session about online safety and digital citizenship, walk through how you would handle this situation.",
    evidenceHint: "A strong response identifies the red flags, explains why this is likely a phishing attempt, and gives the coworker a clear next step rather than just saying 'ignore it.'",
    quizQuestions: [
      {
        text: "A new employee receives an urgent email claiming their company account will be deleted unless they click a link and re-enter their password within 24 hours. What is the BEST first action to take?",
        options: [
          "Click the link and re-enter the password quickly to avoid losing account access",
          "Forward the email to IT and report it as a potential phishing attempt without clicking anything",
          "Reply to the sender asking them to verify their identity before taking any action",
          "Delete the email immediately and hope nobody else received it"
        ],
        correctIndex: 1,
        explanation: "Reporting to IT without clicking preserves evidence and protects the organization. Clicking the link—even to investigate—puts credentials at risk."
      },
      {
        text: "A community center volunteer wants to teach seniors about digital citizenship. Which behavior BEST demonstrates responsible digital citizenship?",
        options: [
          "Sharing other people's personal information in a community Facebook group to keep neighbors informed",
          "Using strong, unique passwords and treating others respectfully in online comments",
          "Downloading software from any website that offers it for free to save money",
          "Ignoring privacy settings because they are too complicated to configure"
        ],
        correctIndex: 1,
        explanation: "Digital citizenship includes protecting your own data with strong passwords and treating others respectfully online—both covered in the orientation session."
      },
      {
        text: "During a team meeting a colleague opens a browser and accidentally lands on a suspicious pop-up claiming the computer is infected and demanding a phone call. What should the colleague do FIRST?",
        options: [
          "Call the phone number displayed to get help removing the supposed virus",
          "Close the browser tab without calling the number and alert the IT department",
          "Restart the computer immediately and reinstall the operating system",
          "Take a photo of the screen and post it on social media to warn others"
        ],
        correctIndex: 1,
        explanation: "These tech-support scam pop-ups are designed to panic users. Closing the tab and notifying IT is the safest response—calling the number connects you to scammers."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-literacy-empowerment-class:mission:digital-literacy-course-2",
    courseSlug: "digital-literacy-course-2",
    programSlug: "digital-literacy-empowerment-class",
    programTitle: "Workforce AP Digital Literacy Course",
    courseTitle: "Internet Basics",
    missionName: "Tech Builder",
    missionTagline: "Prove you can set up and navigate devices confidently",
    primaryAxis: "Engineering",
    skillLabels: ["Device setup", "Browser navigation", "Chrome", "Windows", "Search Engines", "Problem-solving"],
    scenarioPrompt: "You are helping a new hire at a workforce development center get their laptop ready for their first day. The device is running Windows, but the browser hasn't been configured, no bookmarks are set, and the employee doesn't know how to search efficiently for the resources they need. Using the skills from Device Distribution & Setup and Browser & Search Engines, describe how you would get them set up and show them effective search techniques.",
    evidenceHint: "A strong response covers initial device setup steps, configuring Chrome with a profile, and at least two specific search techniques (like using quotes or site: filters) that would help the employee find relevant resources quickly.",
    quizQuestions: [
      {
        text: "A new employee needs to find the official Windows 11 system requirements on Microsoft's website—not just any result. Which search query is MOST effective?",
        options: [
          "windows 11 requirements",
          "\"Windows 11\" system requirements site:microsoft.com",
          "how do I know if my computer can run windows",
          "microsoft windows new version info"
        ],
        correctIndex: 1,
        explanation: "The site: filter restricts results to microsoft.com and quotes ensure the exact phrase is matched, making this far more targeted than a general query."
      },
      {
        text: "You hand a new hire a Windows laptop and they say the screen resolution looks stretched and wrong. What is the BEST first troubleshooting step?",
        options: [
          "Return the device and request a replacement",
          "Right-click the desktop, select Display settings, and adjust the resolution to the recommended setting",
          "Reinstall Windows to fix display driver issues",
          "Lower the brightness until the display looks better"
        ],
        correctIndex: 1,
        explanation: "Display settings in Windows allow you to set the native recommended resolution without any reinstallation—a basic device setup skill covered in this course."
      },
      {
        text: "A coworker says Chrome keeps opening tabs they didn't request and the homepage changed without their permission. What is the MOST likely cause and fix?",
        options: [
          "Chrome needs to be updated; visit chrome://settings and check for updates",
          "The browser has been hijacked by unwanted extensions; remove suspicious extensions and reset the homepage in Chrome settings",
          "The computer's RAM is full; close all other applications to free memory",
          "The coworker's keyboard has a sticky key that opens new tabs automatically"
        ],
        correctIndex: 1,
        explanation: "Unexpected homepage changes and automatic tabs are classic signs of browser hijacking via malicious extensions. Removing them and resetting settings resolves the issue."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-literacy-empowerment-class:mission:digital-literacy-course-3",
    courseSlug: "digital-literacy-course-3",
    programSlug: "digital-literacy-empowerment-class",
    programTitle: "Workforce AP Digital Literacy Course",
    courseTitle: "Email Basics",
    missionName: "Client Champion",
    missionTagline: "Prove you can communicate professionally over email",
    primaryAxis: "Service",
    skillLabels: ["Email etiquette", "Professional communication", "Gmail", "Email", "Communication"],
    scenarioPrompt: "You work at a job-placement agency and need to email a hiring manager at a local company to follow up on a client's application. The email must be professional, clear, and respectful of the manager's time. You also need to CC your supervisor. Using what you learned in Introduction to Emails & Advanced Email Techniques, describe how you would compose and organize this email.",
    evidenceHint: "A strong response addresses subject line best practices, proper salutation, concise body structure, appropriate signature, correct use of CC, and at least one Gmail organizational technique such as labels or priority inbox.",
    quizQuestions: [
      {
        text: "You send an email to a hiring manager but accidentally include confidential client salary information. The email has not yet been opened according to your read receipt. What should you do FIRST?",
        options: [
          "Send a follow-up email explaining the mistake and asking the manager to disregard the sensitive information",
          "Use Gmail's 'Undo Send' feature immediately if within the cancellation window, then resend without the sensitive data",
          "Call the hiring manager and ask them to delete the email without reading it",
          "Do nothing because email cannot be recalled once sent"
        ],
        correctIndex: 1,
        explanation: "Gmail's Undo Send is the fastest corrective action if still within the configured window. Acting immediately before the email is read is always the first priority."
      },
      {
        text: "Your Gmail inbox has grown to over 500 unread messages and important client emails are getting buried. Which Gmail feature BEST helps you stay on top of high-priority messages?",
        options: [
          "Star every incoming message so none are missed",
          "Enable Priority Inbox so Gmail automatically separates important messages from the rest",
          "Create a new Gmail account and only share it with important contacts",
          "Set your phone to vibrate for every new email notification"
        ],
        correctIndex: 1,
        explanation: "Priority Inbox uses Gmail's signals to surface important messages automatically, which is far more scalable than manually starring every email."
      },
      {
        text: "A coworker asks for feedback on an email they are about to send to a potential employer. The email starts with 'Hey!' and ends without a sign-off. What is the MOST important feedback to give?",
        options: [
          "The email is fine as long as the body content is strong and grammatically correct",
          "Replace 'Hey!' with a formal salutation like 'Dear [Name],' and add a professional closing such as 'Best regards' before the name",
          "Add a colorful email signature with a personal photo to make the message memorable",
          "Use bullet points throughout the body to make scanning easier for busy hiring managers"
        ],
        correctIndex: 1,
        explanation: "Professional email etiquette requires a formal salutation and closing. An informal opener like 'Hey!' signals a lack of professional communication skills to a hiring manager."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-literacy-empowerment-class:mission:digital-literacy-course-4",
    courseSlug: "digital-literacy-course-4",
    programSlug: "digital-literacy-empowerment-class",
    programTitle: "Workforce AP Digital Literacy Course",
    courseTitle: "Cybersecurity Basics: Online Scams and Fraud",
    missionName: "Support Hero",
    missionTagline: "Prove you can protect yourself and others from digital fraud",
    primaryAxis: "Service",
    skillLabels: ["Security awareness", "Fraud prevention", "Security Awareness"],
    scenarioPrompt: "A participant in your workforce training program approaches you worried about a text message they received saying they won a $500 gift card and just need to pay a $25 'processing fee' to claim it. They ask if it is legitimate. Using your knowledge from Avoiding Online Scams and Introduction to Financial Literacy, explain what is happening and what they should do.",
    evidenceHint: "A strong response names the scam type, identifies the specific red flags (unsolicited prize, upfront fee), advises what NOT to do, and mentions how this connects to financial literacy concepts like protecting personal banking information.",
    quizQuestions: [
      {
        text: "An elderly neighbor says they received a call from someone claiming to be the IRS demanding immediate payment via gift cards or they will be arrested. What is MOST accurate?",
        options: [
          "This could be legitimate; the IRS sometimes uses phone calls for urgent tax debt collection",
          "This is a government impersonation scam; the IRS never demands gift card payment or threatens immediate arrest by phone",
          "They should call back the number provided to verify whether the debt is real",
          "They should pay with a small gift card to buy time and consult a lawyer afterward"
        ],
        correctIndex: 1,
        explanation: "The IRS contacts taxpayers by mail first and never demands gift card payment. Demanding gift cards and threatening arrest are hallmark signs of a government impersonation scam."
      },
      {
        text: "Someone in your community receives an email offering them a data-entry job that pays $500 per week and only requires them to receive packages at home and reship them. What should they know?",
        options: [
          "This sounds like a legitimate remote work opportunity since package reshipping is a real logistics need",
          "This is likely a reshipping scam that may involve receiving and forwarding stolen goods, exposing them to legal risk",
          "They should accept the job but keep the pay rate secret from the IRS to avoid taxes",
          "This is fine as long as they get the job offer in writing via email"
        ],
        correctIndex: 1,
        explanation: "Reshipping scams use unsuspecting people to move stolen merchandise. Participants can face legal consequences even if they did not know the goods were stolen."
      },
      {
        text: "A job seeker is filling out an online job application that asks for their Social Security Number, bank account number, and a copy of their debit card before any interview. What is the appropriate response?",
        options: [
          "Provide all the information since employers need it to run background checks and set up direct deposit",
          "Stop the application, do not provide financial information, and research whether the company and job posting are legitimate",
          "Provide only the SSN and skip the bank details since that is standard practice",
          "Complete the application but use a friend's bank account details to protect their own"
        ],
        correctIndex: 1,
        explanation: "Legitimate employers never request bank account numbers or debit card images before hiring. Asking for these details upfront is a clear sign of a job scam designed to commit identity theft."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 2: Data Analytics Professional Certificate (Google) ──────────

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-1",
    courseSlug: "data-analytics-course-1",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Foundations: Data, Data, Everywhere",
    missionName: "Data Detective",
    missionTagline: "Prove you understand what data analytics is and why it matters",
    primaryAxis: "Analytics",
    skillLabels: ["Data analysis fundamentals", "Analytical thinking", "Spreadsheets", "SQL", "Critical thinking"],
    scenarioPrompt: "You are interviewing for a junior analyst role at a retail company. The interviewer asks you to explain, in plain language, how a data analyst adds value to a business and what the typical steps in the data analysis process look like. Drawing on the foundations you learned in this course, walk through your answer.",
    evidenceHint: "A strong response names the six phases of the data analysis process (Ask, Prepare, Process, Analyze, Share, Act), explains what an analyst does at each stage, and connects it to a concrete business outcome.",
    quizQuestions: [
      {
        text: "A retail manager notices sales dropped 15% last month and asks the data team to 'figure out what happened.' Which phase of the data analysis process does this request initiate?",
        options: [
          "Process — cleaning the sales data so it is ready for analysis",
          "Ask — defining the problem and clarifying what questions the data needs to answer",
          "Share — presenting the findings to stakeholders in a clear format",
          "Act — implementing changes based on prior analysis results"
        ],
        correctIndex: 1,
        explanation: "Before touching any data, analysts must define the problem clearly. The manager's request kicks off the Ask phase, where the analyst works to turn a vague concern into specific, answerable questions."
      },
      {
        text: "An analyst is given a spreadsheet with customer purchase data and asked to find the average order value. After calculating it, they notice some rows have negative values that seem like data entry errors. What should they do NEXT?",
        options: [
          "Include the negative values in the average since removing data could introduce bias",
          "Proceed to the Share phase and note the anomalies as a footnote in the presentation",
          "Flag the anomalies, investigate their source, and clean the data before re-calculating the average",
          "Delete all rows with unusual values and re-run the calculation without further investigation"
        ],
        correctIndex: 2,
        explanation: "The Process phase requires cleaning data before analysis. Simply deleting rows without investigation could remove valid edge cases; the analyst should understand the anomaly before deciding how to handle it."
      },
      {
        text: "A company wants to know whether its new loyalty program is increasing repeat purchases. What type of data would BEST help answer this question?",
        options: [
          "Customer satisfaction survey scores collected before the program launched",
          "Transactional records showing purchase frequency per customer before and after enrollment in the loyalty program",
          "Social media mentions of the brand during the same time period",
          "The number of loyalty program sign-ups per week since launch"
        ],
        correctIndex: 1,
        explanation: "To measure whether repeat purchases increased, you need transactional data that can be compared across time for the same customers—specifically before and after loyalty program enrollment."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-2",
    courseSlug: "data-analytics-course-2",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Ask Questions to Make Data-Driven Decisions",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can frame the right questions before touching data",
    primaryAxis: "Analytics",
    skillLabels: ["Problem definition", "Structured thinking", "Spreadsheets", "SQL", "Communication"],
    scenarioPrompt: "A marketing director comes to you saying 'our email campaigns aren't performing well.' Before pulling any data, you need to turn this vague complaint into precise, answerable questions. Using the SMART question framework and the structured thinking skills from this course, describe how you would approach the conversation and what specific questions you would formulate.",
    evidenceHint: "A strong response applies the SMART framework (Specific, Measurable, Action-oriented, Relevant, Time-bound) to at least two questions, explains why each component matters, and shows how better questions lead to better analysis.",
    quizQuestions: [
      {
        text: "A stakeholder asks an analyst: 'Can you look into why our app users are unhappy?' Which revision BEST transforms this into a SMART question?",
        options: [
          "Can you find out if users like the app?",
          "What percentage of users who rated the app 3 stars or below in Q1 cited slow load times as their primary complaint?",
          "Are users happy with the new features we added last year?",
          "How many app reviews do we have and what do they say?"
        ],
        correctIndex: 1,
        explanation: "The revised question is Specific (ratings ≤3 stars), Measurable (percentage), Action-oriented (identifies a root cause to act on), Relevant (maps to user satisfaction), and Time-bound (Q1)."
      },
      {
        text: "During a stakeholder meeting, the sales VP says they want a report on 'all sales data.' How should an analyst respond?",
        options: [
          "Pull all available sales data and deliver a comprehensive report covering every metric",
          "Ask clarifying questions to narrow the scope—such as which time period, which product lines, and what business decision the report will inform",
          "Decline the request until the VP provides a formal written specification",
          "Build the report using last year's data and offer to update it once the scope is clarified"
        ],
        correctIndex: 1,
        explanation: "Asking clarifying questions before starting saves time and ensures the analysis answers the right business question. Jumping into broad data pulls wastes effort and often misses the point."
      },
      {
        text: "An analyst is preparing a dashboard for a regional manager who oversees five store locations. The manager says they just want to 'see how the stores are doing.' What is the BEST next step?",
        options: [
          "Build a comprehensive dashboard with every available metric so the manager can find what they need",
          "Ask the manager what decisions they need to make with this data and which metrics most directly inform those decisions",
          "Copy a dashboard template from a previous project since store performance is always measured the same way",
          "Send the manager the raw data export and let them filter it themselves"
        ],
        correctIndex: 1,
        explanation: "Understanding the decision the stakeholder needs to make focuses the analysis. Without knowing the intended use, a dashboard risks being too broad to be actionable."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-3",
    courseSlug: "data-analytics-course-3",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Prepare Data for Exploration",
    missionName: "Analytics Pro",
    missionTagline: "Prove you can source and organize data responsibly",
    primaryAxis: "Analytics",
    skillLabels: ["Data collection", "Data organization", "Spreadsheets", "SQL", "Attention to detail"],
    scenarioPrompt: "You are a junior analyst at a healthcare staffing company. You have been asked to build a dataset of open nursing positions across three hospital partners. Each hospital sends data in a different format—one as a CSV, one as an Excel file, and one through a shared Google Sheet. Using your preparation skills from this course, describe how you would consolidate and organize this data reliably.",
    evidenceHint: "A strong response addresses data types, naming conventions, folder structure, documentation of data sources, and at least one data integrity check before analysis begins.",
    quizQuestions: [
      {
        text: "An analyst receives a dataset where the 'hire date' column contains entries formatted as '01/15/2024', '2024-01-15', and 'January 15, 2024'—all for the same date. What is the MOST important reason to standardize this column before analysis?",
        options: [
          "It makes the spreadsheet look more professional when shared with stakeholders",
          "Inconsistent date formats prevent accurate sorting, filtering, and date-based calculations",
          "Different formats indicate the data came from different sources and should be treated as separate datasets",
          "Standardizing dates is optional if the analyst manually reviews every row before reporting"
        ],
        correctIndex: 1,
        explanation: "Mixed date formats break sorting and date functions. A filter or calculation comparing '01/15/2024' to '2024-01-15' as text strings will fail or return incorrect results."
      },
      {
        text: "You are combining employee records from two company systems and find that one system uses 'EMP-1234' as the employee ID format while the other uses '1234' with no prefix. What should you do BEFORE merging the two tables?",
        options: [
          "Use the numeric IDs from both systems since numbers are more universally compatible",
          "Choose a consistent ID format, document the transformation rule, and apply it across both datasets before joining",
          "Merge the tables immediately and resolve ID conflicts afterward by comparing employee names",
          "Keep both ID formats as separate columns so either can be used for lookups"
        ],
        correctIndex: 1,
        explanation: "Joining on mismatched key formats will produce failed matches or phantom duplicates. Standardizing keys and documenting the rule ensures a clean, repeatable merge."
      },
      {
        text: "A dataset you received from a vendor contains a column labeled 'revenue' but no data dictionary is included. Some values appear to be in dollars while others seem too small and may be in thousands. What is the BEST action before using this column?",
        options: [
          "Assume dollars since that is the most common unit and proceed with analysis",
          "Contact the vendor to confirm the unit of measure and document the response before using the column",
          "Divide all values by 1,000 to normalize them and note this assumption in the report",
          "Drop the column and use a different revenue source to avoid uncertainty"
        ],
        correctIndex: 1,
        explanation: "Using a column whose units are unknown can corrupt every calculation that depends on it. Confirming and documenting the unit is a basic data preparation responsibility."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-4",
    courseSlug: "data-analytics-course-4",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Process Data from Dirty to Clean",
    missionName: "Data Detective",
    missionTagline: "Prove you can find and fix data quality problems",
    primaryAxis: "Analytics",
    skillLabels: ["Data cleaning", "Data validation", "Spreadsheets", "SQL", "Attention to detail"],
    scenarioPrompt: "You are handed a customer database with 12,000 rows to clean before a marketing campaign. Initial review shows duplicate emails, blank phone fields, inconsistent state abbreviations (some 'CA', some 'California'), and several rows where the customer age is listed as '999'. Using the data cleaning techniques from this course, describe your systematic approach to making this dataset usable.",
    evidenceHint: "A strong response names specific cleaning steps for each issue type, mentions verification methods (like COUNTIF or DISTINCT counts), and explains how to document changes for reproducibility.",
    quizQuestions: [
      {
        text: "An analyst runs a query and finds 847 duplicate rows in a customer table. Before deleting them, what is the MOST important step?",
        options: [
          "Delete all but one instance of each duplicate immediately to speed up the cleaning process",
          "Investigate why the duplicates exist—whether from a system error, a data import issue, or a legitimate scenario—before deciding how to handle them",
          "Flag the duplicates with a 'DUPLICATE' label and leave the decision to the stakeholder",
          "Merge the duplicate rows into one by concatenating all their field values"
        ],
        correctIndex: 1,
        explanation: "Blindly deleting duplicates can remove legitimate records if the duplication has a business explanation (e.g., a customer with two accounts). Understanding the source first prevents data loss."
      },
      {
        text: "A spreadsheet column for US state uses 'California', 'CA', 'Calif.', and 'ca' for the same state. Which approach BEST cleans this column for use in a pivot table?",
        options: [
          "Sort the column alphabetically so all variants appear together and manually fix them",
          "Use a standardization formula or find-and-replace to convert all variants to the two-letter abbreviation 'CA', then validate with a COUNTIF check",
          "Create separate categories for each spelling variant and treat them as distinct regions",
          "Leave the column as-is and apply a wildcard filter whenever California data is needed"
        ],
        correctIndex: 1,
        explanation: "Standardizing to a single consistent value (like the USPS two-letter code) ensures filters, pivot tables, and joins produce accurate grouped results. A validation check confirms all variants were caught."
      },
      {
        text: "While cleaning a dataset, you find that the 'annual_salary' column contains the value 0 for 230 employees. What is the MOST appropriate next step?",
        options: [
          "Replace all zeros with the column average to avoid distorting aggregate calculations",
          "Treat zeros as null values and remove those rows from the dataset entirely",
          "Investigate whether the zeros represent actual salaries, data entry errors, or null placeholders before deciding how to handle them",
          "Cap the value at the minimum wage equivalent since zero salary is legally impossible"
        ],
        correctIndex: 2,
        explanation: "Zero could indicate a true value (e.g., unpaid interns), a null placeholder, or a system error. Replacing zeros without investigation imposes assumptions that may introduce more error than the original issue."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-5",
    courseSlug: "data-analytics-course-5",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Analyze Data to Answer Questions",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can pull meaningful answers from real data",
    primaryAxis: "Analytics",
    skillLabels: ["Data aggregation", "Sorting and filtering", "Spreadsheets", "SQL", "Critical thinking"],
    scenarioPrompt: "A regional sales manager asks you to find out which product category generated the most revenue in Q3 and whether that category's performance improved compared to Q2. You have a SQL database with a sales table containing columns: sale_id, product_category, revenue, sale_date. Using the analysis skills from this course, describe the queries and steps you would take to answer both questions.",
    evidenceHint: "A strong response includes the logic for two SQL queries (one aggregate per quarter), explains how to group and filter by date, and describes how to compare results to identify improvement.",
    quizQuestions: [
      {
        text: "An analyst needs to find the top 5 sales representatives by total revenue for the current year. The data is in a SQL table called 'sales' with columns rep_name and revenue. Which query accomplishes this correctly?",
        options: [
          "SELECT rep_name, revenue FROM sales ORDER BY revenue DESC LIMIT 5;",
          "SELECT rep_name, SUM(revenue) AS total_revenue FROM sales GROUP BY rep_name ORDER BY total_revenue DESC LIMIT 5;",
          "SELECT rep_name, COUNT(revenue) FROM sales GROUP BY rep_name LIMIT 5;",
          "SELECT TOP 5 rep_name FROM sales WHERE revenue = MAX(revenue);"
        ],
        correctIndex: 1,
        explanation: "SUM with GROUP BY aggregates revenue per rep, ORDER BY DESC sorts highest first, and LIMIT 5 returns only the top five. The other options either skip aggregation or use invalid syntax."
      },
      {
        text: "You are analyzing customer order data and need to find customers who placed more than 3 orders in a single month. Which SQL clause filters the aggregated results?",
        options: [
          "WHERE COUNT(order_id) > 3",
          "HAVING COUNT(order_id) > 3",
          "FILTER COUNT(order_id) > 3",
          "GROUP BY customer_id WHERE order_count > 3"
        ],
        correctIndex: 1,
        explanation: "HAVING filters on aggregated values (like COUNT), whereas WHERE filters individual rows before aggregation. This is a core distinction in SQL data analysis."
      },
      {
        text: "A spreadsheet contains monthly website traffic data for two years. A manager asks whether traffic this year is higher than last year on average. What is the BEST analytical approach?",
        options: [
          "Look at the highest traffic month in each year and compare those two peak values",
          "Calculate the average monthly traffic for each year separately and compare the two averages, noting any seasonal patterns",
          "Add up all traffic from both years and divide by 24 to get an overall average",
          "Compare only the most recent month this year to the same month last year"
        ],
        correctIndex: 1,
        explanation: "Comparing yearly averages accounts for all 12 months in each period. Comparing only peaks or a single month introduces sampling bias and ignores the full distribution."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-6",
    courseSlug: "data-analytics-course-6",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Share Data Through the Art of Visualization",
    missionName: "Design Thinker",
    missionTagline: "Prove you can turn data into visuals that drive decisions",
    primaryAxis: "Design",
    skillLabels: ["Data visualization", "Tableau", "Storytelling with data", "Presentation", "Communication"],
    scenarioPrompt: "You have completed an analysis showing that customer churn increased significantly among users aged 25–34 over the past two quarters. Your audience is the executive team—non-technical leaders who make budget decisions. Using the visualization and storytelling skills from this course, describe how you would present this finding including chart choice, narrative structure, and how you would avoid misleading the audience.",
    evidenceHint: "A strong response recommends a specific chart type with justification, describes a clear narrative arc (context → finding → implication → recommendation), and mentions at least one pitfall to avoid (like truncated axes or chart junk).",
    quizQuestions: [
      {
        text: "You need to show how a company's market share has changed across five competitors over the past three years. Which visualization type BEST communicates this trend?",
        options: [
          "A pie chart for each year showing each competitor's share",
          "A grouped or stacked area line chart showing each competitor's share percentage over the three-year period",
          "A single bar chart comparing all competitors only for the most recent year",
          "A scatter plot with competitor name on one axis and share on the other"
        ],
        correctIndex: 1,
        explanation: "Line or area charts are ideal for showing change over time across multiple categories. Three separate pie charts make comparison across time extremely difficult for the human eye."
      },
      {
        text: "A bar chart shows customer satisfaction scores ranging from 78% to 82%. The chart's Y-axis starts at 75% rather than 0%. What is the primary concern with this design?",
        options: [
          "The chart uses too many colors making it difficult to read",
          "Truncating the Y-axis exaggerates the visual difference between bars, potentially misleading viewers about the magnitude of change",
          "Bar charts are the wrong chart type for percentage data",
          "The chart should include grid lines to help readers estimate exact values"
        ],
        correctIndex: 1,
        explanation: "Starting an axis at a non-zero value inflates visual differences. A 4-point spread looks dramatic on a truncated axis but is small on a 0–100% scale. This can mislead decision-makers."
      },
      {
        text: "You are building a Tableau dashboard for a logistics team. The team needs to monitor delivery delays by region in real time. Which dashboard design principle is MOST important to apply?",
        options: [
          "Add as many metrics as possible so the team always has complete information",
          "Focus the dashboard on the single most important question the team needs to answer and use visual hierarchy to make the key metric immediately obvious",
          "Use animations and transitions between views to make the dashboard more engaging",
          "Match the color scheme of the company website to reinforce branding"
        ],
        correctIndex: 1,
        explanation: "Effective dashboards prioritize one central question. Overloading with metrics creates cognitive noise that slows decisions—visual hierarchy ensures the key signal is seen first."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-7",
    courseSlug: "data-analytics-course-7",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Data Analysis with R Programming",
    missionName: "Data Detective",
    missionTagline: "Prove you can use R to explore and summarize data",
    primaryAxis: "Analytics",
    skillLabels: ["R programming", "Data frames", "ggplot2", "tidyverse", "Problem-solving"],
    scenarioPrompt: "You are a data analyst at a public health nonprofit. You have a CSV of vaccination rates by county and need to produce a cleaned summary and a bar chart showing the ten counties with the lowest rates. You will use R with tidyverse. Describe the R code steps you would take, from importing the data through producing the chart.",
    evidenceHint: "A strong response uses read_csv, pipes (%>% or |>), arrange/slice for the bottom 10, and ggplot2 with geom_bar or geom_col, including axis labels and a title.",
    quizQuestions: [
      {
        text: "An R analyst runs summary(df$revenue) and sees the maximum value is 9,999,999 while all other values are under 500,000. What is the BEST next step?",
        options: [
          "Remove the outlier immediately since it will skew the mean",
          "Filter to rows where revenue == 9999999 and investigate whether it is a data entry error, a sentinel value, or a legitimate record",
          "Replace the maximum value with the median of the column to preserve row count",
          "Re-import the CSV using a different delimiter in case the value is a parsing artifact"
        ],
        correctIndex: 1,
        explanation: "Investigating before removing preserves analytical integrity. The value could be a cap used as a null indicator (e.g., 9999999), a real outlier, or an entry error—each requires a different fix."
      },
      {
        text: "You need to filter an R data frame called 'sales' to rows where region equals 'West' and revenue is greater than 10000, then select only the columns rep_name and revenue. Which dplyr code is correct?",
        options: [
          "sales[sales$region == 'West' & sales$revenue > 10000, c('rep_name', 'revenue')]",
          "sales %>% filter(region == 'West', revenue > 10000) %>% select(rep_name, revenue)",
          "sales %>% select(rep_name, revenue) %>% filter(region == 'West' & revenue > 10000)",
          "filter(sales, region = 'West', revenue > 10000) %>% select(rep_name, revenue)"
        ],
        correctIndex: 1,
        explanation: "Option B uses correct dplyr pipe syntax: filter first narrows rows using == (not =), then select picks columns. Option C would work but select before filter on a large frame is less efficient. Option D uses = instead of == which causes an error."
      },
      {
        text: "A ggplot2 bar chart you built shows all 50 state names on the X-axis but they are unreadable because they overlap. What is the BEST fix?",
        options: [
          "Reduce the font size to 4pt so all labels fit without overlapping",
          "Add theme(axis.text.x = element_text(angle = 45, hjust = 1)) to rotate the labels diagonally",
          "Remove the X-axis labels entirely and rely on the chart title to identify states",
          "Switch to a pie chart since it handles many categories better"
        ],
        correctIndex: 1,
        explanation: "Rotating axis labels 45 degrees with right-justification (hjust=1) is the standard ggplot2 fix for crowded categorical labels. Pie charts handle many categories worse, not better."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-analytics-professional-certificate-google:mission:data-analytics-course-8",
    courseSlug: "data-analytics-course-8",
    programSlug: "data-analytics-professional-certificate-google",
    programTitle: "Data Analytics Professional Certificate",
    courseTitle: "Google Data Analytics Capstone",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can run an end-to-end analytics case study",
    primaryAxis: "Analytics",
    skillLabels: ["End-to-end analysis", "Portfolio presentation", "Spreadsheets", "SQL", "Communication"],
    scenarioPrompt: "You are presenting your capstone case study to a panel of hiring managers. They ask you to walk through how you approached the business question, what tools you used at each stage, and what you would do differently if you had more time. Using the full cycle you completed in the Google Data Analytics Capstone, describe your analytical process and what your results revealed.",
    evidenceHint: "A strong response covers all six phases of the analysis cycle (Ask through Act), names specific tools used, articulates what the data showed and what recommendation it supported, and honestly identifies one limitation or area for improvement.",
    quizQuestions: [
      {
        text: "During a capstone presentation a hiring manager asks: 'How do we know your conclusion is valid and not just a coincidence in the data?' What is the BEST response?",
        options: [
          "Explain that the dataset is large so the findings are statistically reliable by default",
          "Describe the validation steps taken—such as checking for data integrity, testing the finding against a holdout period, or noting the sample size and confidence level",
          "Acknowledge that all data analysis involves uncertainty and defer the question to a senior analyst",
          "Show the original raw data export so the reviewer can verify the numbers themselves"
        ],
        correctIndex: 1,
        explanation: "Analytical rigor is demonstrated by the validation steps, not data volume alone. Describing integrity checks and confidence measures shows the interviewer you understand evidence-based conclusions."
      },
      {
        text: "After completing a capstone analysis you discover a segment of the data you did not fully explore that might change your recommendation. What should you do?",
        options: [
          "Omit the unexplored segment from the presentation to avoid undermining your main findings",
          "Acknowledge it as a limitation in the presentation, explain what impact it might have, and recommend it as a next step for further analysis",
          "Restart the entire analysis to incorporate the new segment before presenting",
          "Include the segment in the raw data appendix without commenting on it"
        ],
        correctIndex: 1,
        explanation: "Proactively naming limitations builds credibility. Identifying the gap and framing it as a next step shows analytical maturity—more impressive than pretending the analysis is complete."
      },
      {
        text: "A recruiter reviewing your portfolio asks why you chose a bar chart instead of a line chart for a particular visualization. Which answer demonstrates the strongest understanding?",
        options: [
          "Bar charts look more professional in slide decks than line charts",
          "The data compared discrete categories (product lines) at a single point in time—bar charts are better for category comparisons, while line charts are better for continuous trends over time",
          "I used a bar chart because that is what was used in the course example dataset",
          "Both chart types show the same information so the choice does not matter significantly"
        ],
        correctIndex: 1,
        explanation: "Justifying a visualization choice based on data type and the question being answered demonstrates mastery of data visualization principles, not just tool familiarity."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 3: UX Design Professional Certificate (Google) ──────────────

  {
    key: "ux-design-professional-certificate-google:mission:ux-design-course-1",
    courseSlug: "ux-design-course-1",
    programSlug: "ux-design-professional-certificate-google",
    programTitle: "UX Design Professional Certificate",
    courseTitle: "Foundations of User Experience (UX) Design",
    missionName: "UX Champion",
    missionTagline: "Prove you understand what makes a great user experience",
    primaryAxis: "Design",
    skillLabels: ["UX fundamentals", "User-centered design", "Figma", "Wireframing", "Empathy"],
    scenarioPrompt: "You are interviewing at a startup that is building a mobile app for gig workers to track their hours and invoices. The product manager asks you to explain the UX design process you would follow from scratch and how you would ensure the app meets actual user needs rather than just what the team assumes they need. Using the foundations from this course, walk through your approach.",
    evidenceHint: "A strong response names the key UX roles and phases (empathize, define, ideate, prototype, test), explains why user research comes before design, and distinguishes UX design from UI or graphic design.",
    quizQuestions: [
      {
        text: "A startup founder insists the team skip user research and move directly to building the app because 'we already know what users want.' As the UX designer, how should you respond?",
        options: [
          "Agree and begin wireframing immediately since the founder's domain expertise substitutes for formal research",
          "Explain that assumptions without validation frequently lead to building features users do not need, and propose a quick round of user interviews to test the key assumptions before committing to a design direction",
          "Commission a large formal research study before any design work begins",
          "Build two versions of the app and let analytics determine which one users prefer after launch"
        ],
        correctIndex: 1,
        explanation: "The core principle of user-centered design is validating assumptions with real users early. A quick interview round is proportionate—it does not require a full research program to catch critical misalignments."
      },
      {
        text: "A UX designer is told the checkout flow on an e-commerce site has a 70% drop-off rate. What is the MOST appropriate first action from a UX perspective?",
        options: [
          "Redesign the checkout UI with a cleaner visual aesthetic",
          "Conduct usability testing with real users to observe where and why they abandon the checkout process",
          "Add a progress bar to the existing checkout flow to reassure users",
          "Reduce the number of product images to make the page load faster"
        ],
        correctIndex: 1,
        explanation: "Before designing a solution, a UX designer must understand the problem. Usability testing with real users reveals the specific friction points causing drop-off—assumptions about the cause are often wrong."
      },
      {
        text: "Which statement BEST distinguishes UX design from UI design?",
        options: [
          "UX design focuses on colors and typography while UI design focuses on user flows",
          "UX design encompasses the overall experience, including research, information architecture, and how a product feels to use; UI design focuses on the visual and interactive elements users see on screen",
          "UX design is done before a product launches while UI design happens post-launch",
          "UX and UI design are different names for the same discipline and the terms are interchangeable"
        ],
        correctIndex: 1,
        explanation: "UX is broader—it includes research, task flows, information architecture, and overall usability. UI is a subset focused on the visual surface layer. Conflating them is a common misconception."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ux-design-professional-certificate-google:mission:ux-design-course-2",
    courseSlug: "ux-design-course-2",
    programSlug: "ux-design-professional-certificate-google",
    programTitle: "UX Design Professional Certificate",
    courseTitle: "Start the UX Design Process: Empathize, Define, and Ideate",
    missionName: "Design Thinker",
    missionTagline: "Prove you can understand users and generate creative solutions",
    primaryAxis: "Design",
    skillLabels: ["User empathy", "Problem statements", "Ideation techniques", "Figma", "Research synthesis"],
    scenarioPrompt: "You are working on an app to help hourly workers find last-minute shift coverage. You have conducted five user interviews and your notes are full of observations. Using the empathize, define, and ideate framework from this course, describe how you would turn those raw interview notes into a problem statement and then generate design directions to explore.",
    evidenceHint: "A strong response mentions affinity mapping or similar synthesis technique, writes a user-centered problem statement using the format '[User] needs [need] because [insight]', and names at least two ideation techniques (e.g., How Might We, Crazy 8s).",
    quizQuestions: [
      {
        text: "After five user interviews about a shift-scheduling app, a designer has 40 sticky notes with observations. What technique BEST helps identify the most important themes?",
        options: [
          "Read all 40 notes individually and highlight any that seem important",
          "Group the notes by similarity using affinity mapping, then label each cluster to identify the dominant themes across interviews",
          "Count how many times each specific word appears across the notes and rank by frequency",
          "Share the raw notes with the product manager and let them identify the themes"
        ],
        correctIndex: 1,
        explanation: "Affinity mapping organizes qualitative data into clusters that reveal patterns. It is the standard synthesis tool for turning interview notes into actionable insights before defining the problem."
      },
      {
        text: "A designer writes the following problem statement: 'Users need a better app.' Why is this problematic, and how should it be improved?",
        options: [
          "It is too long and should be condensed to one word that captures the core need",
          "It is vague and solution-focused. A better statement follows the format: '[User type] needs [specific need] because [insight from research]'",
          "It uses the word 'users' which is too generic; it should specify a demographic like age or location",
          "Problem statements should not mention the app at all since they exist before any solution is considered"
        ],
        correctIndex: 1,
        explanation: "Effective problem statements are specific, user-centered, and insight-driven—not solution-focused. 'Better app' is a solution direction, not a defined user problem."
      },
      {
        text: "During an ideation session, a team member says 'that idea will never work technically' and shuts down several suggestions. How should the designer handle this?",
        options: [
          "Agree and focus only on ideas the engineering team has already confirmed are feasible",
          "Remind the team that ideation is a divergent phase where quantity and creativity are prioritized over feasibility; feasibility is evaluated in the next phase",
          "End the ideation session early and move directly to prototyping the most practical ideas",
          "Hold separate ideation sessions for designers and engineers to avoid this conflict"
        ],
        correctIndex: 1,
        explanation: "Premature judgment kills ideation. The divergent phase (ideation) intentionally defers feasibility evaluation so creative options are not prematurely eliminated before their potential is explored."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ux-design-professional-certificate-google:mission:ux-design-course-3",
    courseSlug: "ux-design-course-3",
    programSlug: "ux-design-professional-certificate-google",
    programTitle: "UX Design Professional Certificate",
    courseTitle: "Build Wireframes and Low-Fidelity Prototypes",
    missionName: "Experience Architect",
    missionTagline: "Prove you can sketch flows before writing a line of code",
    primaryAxis: "Design",
    skillLabels: ["Wireframing", "Low-fidelity prototyping", "Figma", "Information architecture"],
    scenarioPrompt: "You need to wireframe a mobile onboarding flow for a new budgeting app. The flow has four screens: welcome, account setup, bank connection, and a dashboard overview. Your product manager asks why you are spending time on rough wireframes instead of jumping to high-fidelity designs. Using your wireframing and prototyping skills from this course, explain your rationale and describe what your low-fidelity prototype would include.",
    evidenceHint: "A strong response explains the cost-efficiency of early iteration, describes what each wireframe screen represents (layout, navigation, key actions), and notes that low-fidelity is intentionally rough to invite feedback.",
    quizQuestions: [
      {
        text: "A product team is debating whether to wireframe or go straight to high-fidelity mockups to save time. Which argument BEST justifies starting with wireframes?",
        options: [
          "High-fidelity mockups take longer to build so wireframing always saves calendar time regardless of the project",
          "Wireframes allow the team to validate structure, navigation, and content hierarchy quickly and cheaply before investing in detailed visual design that is expensive to rework",
          "Wireframes are required by most app stores before a high-fidelity design can be submitted",
          "Stakeholders prefer wireframes because they are easier to understand than polished mockups"
        ],
        correctIndex: 1,
        explanation: "The core value of wireframing is cheap iteration. Structural problems caught in a rough sketch cost minutes to fix; the same problem discovered in a polished prototype costs hours."
      },
      {
        text: "A designer creates a wireframe for a checkout screen but does not include placeholder text for the form fields, leaving them blank. A developer reviewing the wireframe asks whether the fields are required. What does this reveal about the wireframe?",
        options: [
          "The wireframe is appropriately minimal since field requirements are a back-end concern",
          "The wireframe is missing annotations or placeholder content that communicate design intent, making it ambiguous for the development team",
          "The wireframe is too detailed and should remove form fields entirely at this stage",
          "The developer should build the feature with all fields required by default and adjust later"
        ],
        correctIndex: 1,
        explanation: "Wireframes must communicate intent clearly enough for stakeholders and developers to give meaningful feedback. Blank fields without annotation leave critical interaction decisions undefined."
      },
      {
        text: "When linking wireframe screens into a low-fidelity prototype in Figma, what is the PRIMARY purpose of the prototype at this stage?",
        options: [
          "To deliver a pixel-perfect preview of the final app for client sign-off",
          "To simulate the user flow so stakeholders and test participants can experience the navigational sequence and identify gaps without requiring any code",
          "To generate the production-ready HTML structure that developers will use to build the app",
          "To showcase the visual brand identity including color palette and typography choices"
        ],
        correctIndex: 1,
        explanation: "Low-fidelity prototypes are flow simulators, not final designs. Their value lies in making the navigational logic testable and discussable before any visual or engineering investment is made."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ux-design-professional-certificate-google:mission:ux-design-course-4",
    courseSlug: "ux-design-course-4",
    programSlug: "ux-design-professional-certificate-google",
    programTitle: "UX Design Professional Certificate",
    courseTitle: "Conduct UX Research and Test Early Concepts",
    missionName: "Research Analyst",
    missionTagline: "Prove you can run usability tests and turn findings into improvements",
    primaryAxis: "Research",
    skillLabels: ["Usability testing", "Research synthesis", "Figma", "Interviewing", "Critical thinking"],
    scenarioPrompt: "You have a low-fidelity prototype of a job-search app and need to run usability tests with five participants before the next sprint. Your manager asks how you will structure the sessions and how you will turn the raw observations into design recommendations. Using the research and testing methods from this course, describe your plan.",
    evidenceHint: "A strong response describes the test structure (tasks, think-aloud protocol, note-taking), explains how to identify patterns across participants, and connects specific observations to concrete design changes.",
    quizQuestions: [
      {
        text: "During a usability test, a participant cannot find the 'Save Job' button on the listing screen and eventually gives up. What is the MOST useful thing the facilitator should do in this moment?",
        options: [
          "Point out the button location so the participant can complete the task and move on",
          "Note the failure, ask the participant to think aloud about what they expected to see and where they looked, then let them continue without assistance",
          "Stop the session and redesign the screen before continuing with the remaining participants",
          "Skip the task and move to the next one so the participant does not feel frustrated"
        ],
        correctIndex: 1,
        explanation: "Facilitators must resist helping participants during tasks—the struggle is the finding. The think-aloud prompt surfaces the mental model mismatch that explains why the button was hard to find."
      },
      {
        text: "After five usability test sessions, a researcher has 60 observations. Three participants could not complete the onboarding flow. Which action BEST prioritizes the insights for the design team?",
        options: [
          "Report all 60 observations in a spreadsheet sorted alphabetically by screen name",
          "Rank observations by frequency and severity—prioritizing issues that caused task failures across multiple participants over minor preferences noted by a single user",
          "Present only the most dramatic failures and omit minor issues to keep the report concise",
          "Survey the five participants after the test and ask them to rank the issues themselves"
        ],
        correctIndex: 1,
        explanation: "Severity and frequency together determine priority. A failure affecting multiple participants warrants immediate attention; a single user preference is useful but lower urgency."
      },
      {
        text: "A product manager says the team should skip usability testing since 'we already did research at the beginning of the project.' How should a UX researcher respond?",
        options: [
          "Agree since initial research covers user needs and subsequent testing is redundant",
          "Explain that early research identifies user needs while usability testing evaluates whether the design solution actually meets those needs—they serve different purposes",
          "Suggest replacing usability testing with an A/B test after launch since it provides real behavioral data",
          "Agree but request that the engineering team add analytics to the app to serve as a substitute for testing"
        ],
        correctIndex: 1,
        explanation: "Research and usability testing are complementary. Research defines the problem space; testing validates the solution. A design that solves the right problem can still be unusable."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ux-design-professional-certificate-google:mission:ux-design-course-5",
    courseSlug: "ux-design-course-5",
    programSlug: "ux-design-professional-certificate-google",
    programTitle: "UX Design Professional Certificate",
    courseTitle: "Create High-Fidelity Designs and Prototypes in Figma",
    missionName: "Design Thinker",
    missionTagline: "Prove you can build polished, production-ready designs in Figma",
    primaryAxis: "Design",
    skillLabels: ["High-fidelity design", "Figma components", "Design systems", "Prototyping", "Accessibility"],
    scenarioPrompt: "You are preparing the final high-fidelity prototype of a restaurant ordering app for a stakeholder presentation. The engineering team needs to hand off the designs next week. Using your Figma skills from this course, describe how you would organize the Figma file, use components and styles, and ensure the prototype is ready for developer handoff.",
    evidenceHint: "A strong response mentions Figma components and variants, shared styles (color, text), auto-layout, a structured page organization, and at least one accessibility consideration such as color contrast.",
    quizQuestions: [
      {
        text: "A Figma file has 30 screens, each with a custom-styled button that is slightly different from screen to screen. A developer asks which button style is the final one. What is the ROOT cause of this problem and how should it be fixed?",
        options: [
          "The developer should pick the most common button style and use it consistently in code",
          "The design file was built without Figma components; converting the button to a master component and applying it across all screens ensures consistency and makes future changes propagate automatically",
          "The designer should export all button variants and let the developer decide which to use",
          "The problem is a Figma bug; resetting the file to an earlier version will restore consistency"
        ],
        correctIndex: 1,
        explanation: "Ad-hoc styling without components causes drift. A master component with variants ensures every instance is identical and a single edit updates all instances—the core value of component-based design."
      },
      {
        text: "You are designing a form with light gray placeholder text on a white background. A teammate flags it for an accessibility review. What is the MOST likely concern?",
        options: [
          "Gray placeholder text is non-standard and will confuse screen reader software",
          "The color contrast between the light gray text and white background may fall below the WCAG 4.5:1 minimum ratio for normal text, making it difficult for users with low vision",
          "Placeholder text should not be used in forms at all; labels should replace it",
          "Gray is associated with disabled states and may confuse users about whether the field is active"
        ],
        correctIndex: 1,
        explanation: "WCAG 2.1 requires a minimum 4.5:1 contrast ratio for normal text. Light gray on white frequently fails this threshold, making form fields inaccessible to users with low vision."
      },
      {
        text: "A developer reviewing your Figma handoff file says they cannot find the exact hex codes for the brand colors used in the design. What Figma feature would have prevented this problem?",
        options: [
          "Exporting the design as a PDF so color values appear in the document metadata",
          "Defining and applying shared Color Styles in Figma so developers can inspect any element and see the named style with its hex value",
          "Including a color swatch screenshot in the project's Slack channel",
          "Embedding the brand style guide PDF as a linked asset in the Figma file"
        ],
        correctIndex: 1,
        explanation: "Figma's shared Color Styles make every color inspectable by name and hex value directly from any element. Without them, developers have to guess or ask—slowing handoff significantly."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ux-design-professional-certificate-google:mission:ux-design-course-6",
    courseSlug: "ux-design-course-6",
    programSlug: "ux-design-professional-certificate-google",
    programTitle: "UX Design Professional Certificate",
    courseTitle: "Responsive Web Design in Adobe XD",
    missionName: "Experience Architect",
    missionTagline: "Prove you can design experiences that work on any screen size",
    primaryAxis: "Design",
    skillLabels: ["Responsive design", "Breakpoints", "Adobe XD", "Grid systems", "Accessibility"],
    scenarioPrompt: "You are designing a job board website that must work on mobile phones, tablets, and desktops. Your manager asks you to explain how you will handle the layout differences across screen sizes and how Adobe XD helps you test this during the design phase. Using your responsive design skills from this course, describe your approach.",
    evidenceHint: "A strong response defines at least two breakpoints, explains how content reflows between them (e.g., three-column to single-column), and describes how to use Adobe XD's responsive resize or preview features.",
    quizQuestions: [
      {
        text: "A designer creates a three-column job listing layout for desktop. At 768px (tablet width) the columns become too narrow to read. What is the BEST design decision?",
        options: [
          "Scale all three columns proportionally so they remain equal width at every screen size",
          "Define a breakpoint at or around 768px where the layout switches to two columns, and add another breakpoint for mobile where it collapses to a single column",
          "Remove two of the three columns on tablet and show only the most popular job category",
          "Require users to rotate their tablet to landscape mode to view the three-column layout"
        ],
        correctIndex: 1,
        explanation: "Responsive design uses breakpoints to adapt layouts to available space. A two-column tablet layout and single-column mobile layout are standard reflow patterns for content-heavy pages."
      },
      {
        text: "A mobile design shows a navigation menu with eight items displayed as text links horizontally across the top. At 375px screen width they are all cut off. What is the MOST user-friendly responsive solution?",
        options: [
          "Reduce the font size to 8px so all eight items fit on one line",
          "Replace the horizontal nav with a hamburger menu icon that reveals the full navigation list when tapped",
          "Remove four of the eight navigation items on mobile to fit the available space",
          "Require users to scroll horizontally to see all navigation items"
        ],
        correctIndex: 1,
        explanation: "A hamburger menu is the established mobile pattern for collapsing complex navigation into a single tap, preserving all options without cluttering the limited screen real estate."
      },
      {
        text: "While designing in Adobe XD you need to ensure that a card component resizes its width correctly when the viewport changes but keeps a fixed height. Which feature should you use?",
        options: [
          "Set the card as a symbol and manually update it at each breakpoint",
          "Use Adobe XD's responsive resize handles to pin the component's left and right edges while fixing the top and bottom edges",
          "Export the card as an SVG and specify percentage widths in the CSS manually",
          "Create three separate versions of the card—one for each breakpoint—and hide the unused versions"
        ],
        correctIndex: 1,
        explanation: "XD's responsive resize with pinned edges lets you define which dimensions scale with the viewport and which remain fixed, enabling proper resizing without creating redundant artboards."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ux-design-professional-certificate-google:mission:ux-design-course-7",
    courseSlug: "ux-design-course-7",
    programSlug: "ux-design-professional-certificate-google",
    programTitle: "UX Design Professional Certificate",
    courseTitle: "Design a User Experience for Social Good & Prepare for Jobs",
    missionName: "UX Champion",
    missionTagline: "Prove you can design for impact and present your work professionally",
    primaryAxis: "Design",
    skillLabels: ["Social impact design", "Portfolio presentation", "Figma", "Inclusive design", "Communication"],
    scenarioPrompt: "You are wrapping up your UX design certificate and need to present your capstone project—a community resource finder app for low-income families—to a panel at a job fair. Your portfolio piece must show your process, not just your final screens. Using the skills from this course, describe how you would structure your case study and what makes it stand out to a hiring manager.",
    evidenceHint: "A strong response covers the five-part case study structure (problem, research, design process, solution, outcomes/learnings), explains why showing process matters more than polished screens, and mentions inclusive design considerations for the specific target user.",
    quizQuestions: [
      {
        text: "A hiring manager reviewing two UX portfolios says one has beautiful final screens but no explanation of the design process, while the other has simpler screens but clearly documents research, iteration, and rationale. Which portfolio is likely to be more impressive and why?",
        options: [
          "The one with beautiful screens, because visual quality is the primary signal of a designer's skill",
          "The one documenting process, because it shows the designer can identify problems, make decisions, and iterate—skills that predict on-the-job performance better than aesthetics",
          "Both are equally valuable; the hiring manager should weigh them based on the role's seniority level",
          "The one with beautiful screens, because clients and stakeholders respond to visuals and will not read process documentation"
        ],
        correctIndex: 1,
        explanation: "Process documentation reveals thinking and problem-solving ability. A designer who can articulate why decisions were made is far more valuable than one who can only produce attractive artifacts without context."
      },
      {
        text: "You are designing a social service resource finder for refugees who may have limited literacy in English. Which inclusive design consideration is MOST critical for this user group?",
        options: [
          "Use a minimalist aesthetic with white space to appear modern and approachable",
          "Support multiple languages, use iconography alongside text labels, and minimize the reading level required to navigate the app",
          "Use large font sizes throughout since all elderly users have vision impairments",
          "Add a chat feature so users can communicate with service providers directly"
        ],
        correctIndex: 1,
        explanation: "Inclusive design for low-literacy or non-English-speaking users requires multilingual support and visual cues to reduce reliance on reading. These are functional accessibility decisions, not aesthetic ones."
      },
      {
        text: "During a job fair portfolio review, a recruiter asks: 'What would you do differently if you were to redo this project?' What does the BEST answer demonstrate?",
        options: [
          "Confidence—the answer should emphasize what went well and deflect the question",
          "Self-awareness and growth mindset—acknowledging a specific limitation, explaining why it occurred, and describing concretely what the revised approach would be",
          "Deference—admitting the project was flawed and asking the recruiter what they would have done instead",
          "Technical skill—naming a more advanced Figma feature that could have been used"
        ],
        correctIndex: 1,
        explanation: "Hiring managers use this question to assess reflection and growth. A specific, honest answer that shows learning from the experience is far more compelling than either false confidence or excessive self-criticism."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 4: Software Developer Professional Certificate (IBM) ─────────

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-1",
    courseSlug: "software-dev-course-1",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Introduction to Software Engineering",
    missionName: "Code Architect",
    missionTagline: "Prove you understand how software is built and deployed",
    primaryAxis: "Engineering",
    skillLabels: ["SDLC", "Software architecture", "Cloud", "DevOps", "Problem-solving"],
    scenarioPrompt: "You are in a technical interview for a junior developer role. The interviewer asks you to describe the Software Development Lifecycle (SDLC) and explain what phase is most often skipped by small teams—and why that causes problems. Using your Introduction to Software Engineering knowledge, walk through the SDLC and make your argument.",
    evidenceHint: "A strong response names all SDLC phases in order, identifies testing or requirements gathering as commonly skipped, and gives a concrete example of what goes wrong as a result.",
    quizQuestions: [
      {
        text: "A startup ships a new feature directly from a developer's laptop to production without any testing or staging environment. Two hours later, 30% of users cannot log in. Which SDLC principle did the team violate?",
        options: [
          "They should have written the code in a different programming language for better stability",
          "They bypassed the testing and staging phases of the SDLC; changes should be validated in a non-production environment before deployment",
          "They deployed too late in the day; production releases should happen in the morning",
          "They violated the agile principle by not holding a sprint retrospective before releasing"
        ],
        correctIndex: 1,
        explanation: "The SDLC's testing and staging phases exist specifically to catch failures before they reach users. Skipping them trades short-term speed for catastrophic production incidents."
      },
      {
        text: "A project manager asks a developer to estimate how long it will take to add a payment feature to an existing app. The developer says 'two days' without reviewing the existing codebase or requirements. What SDLC phase was skipped?",
        options: [
          "Deployment — the developer should have deployed a test version first to estimate effort",
          "Requirements and analysis — understanding the scope of the feature before estimating prevents wildly inaccurate timelines",
          "Maintenance — existing bugs should be fixed before new features are added",
          "Testing — a spike test would reveal how long the feature takes"
        ],
        correctIndex: 1,
        explanation: "Estimates made without reviewing requirements or existing code are guesses. The requirements and analysis phase produces the information needed to estimate accurately—skipping it leads to missed deadlines."
      },
      {
        text: "A company's web application is a monolith—one large codebase that handles everything from user authentication to payment processing. The team is struggling to update one feature without breaking others. Which architectural approach would BEST address this problem?",
        options: [
          "Rewrite the entire application in a different programming language for better performance",
          "Decompose the monolith into microservices so each feature area can be developed, tested, and deployed independently",
          "Add more developers to the team so more features can be built simultaneously",
          "Move the monolith to a faster server to reduce the chance of cascading failures"
        ],
        correctIndex: 1,
        explanation: "Microservices decompose a monolith into independently deployable services, eliminating the tight coupling that causes unrelated changes to break each other."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-2",
    courseSlug: "software-dev-course-2",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Introduction to HTML, CSS, & JavaScript",
    missionName: "Tech Builder",
    missionTagline: "Prove you can build and style a working web page",
    primaryAxis: "Engineering",
    skillLabels: ["HTML", "CSS", "JavaScript", "Responsive design", "Problem-solving"],
    scenarioPrompt: "You are building a simple landing page for a local business. It needs a header with the business name, a navigation bar, a hero section with a call-to-action button, and a contact form. The client wants it to look good on mobile. Using your HTML, CSS, and JavaScript skills from this course, describe how you would structure and style this page.",
    evidenceHint: "A strong response uses semantic HTML elements (header, nav, main, section, form), explains how CSS flexbox or grid handles layout, and describes at least one media query for mobile responsiveness.",
    quizQuestions: [
      {
        text: "A web page has a contact form where clicking 'Submit' reloads the page and clears all the data instead of showing a confirmation message. Which technology should be used to fix this behavior?",
        options: [
          "Add a CSS transition to the submit button so users know it was clicked",
          "Use JavaScript to listen for the form submit event, call preventDefault() to stop the page reload, and then handle the submission and show the confirmation message",
          "Change the form method from POST to GET so the data is preserved in the URL",
          "Wrap the form in an iframe so the main page does not reload when the form submits"
        ],
        correctIndex: 1,
        explanation: "preventDefault() stops the browser's default form submission behavior. JavaScript can then validate, submit via fetch, and show a custom confirmation without a page reload."
      },
      {
        text: "A developer wants a row of three product cards to stack vertically on mobile screens (under 600px) but remain horizontal on larger screens. Which CSS approach BEST accomplishes this?",
        options: [
          "Set position: absolute on each card and manually specify pixel coordinates for each screen size",
          "Use CSS Flexbox with flex-wrap: wrap on the container and a media query that sets each card to flex: 1 1 100% below 600px",
          "Use JavaScript to detect screen width and toggle CSS classes on each card on window resize",
          "Set a fixed width of 200px on each card so they wrap automatically when the screen narrows"
        ],
        correctIndex: 1,
        explanation: "Flexbox with flex-wrap combined with a media query is the clean, standards-based approach. Fixed pixel widths can cause unwanted behavior at intermediate screen sizes, and JavaScript-driven layout is fragile."
      },
      {
        text: "A web page loads slowly because a 4MB hero image is displayed at 300px wide. What is the BEST fix?",
        options: [
          "Compress the image using CSS: img { quality: 50%; }",
          "Export the image at an appropriate resolution (e.g., 600px wide at 2x for retina) and serve a compressed JPEG or WebP instead of the full 4MB original",
          "Load the image using JavaScript after the rest of the page finishes rendering",
          "Replace the image with an animated CSS gradient that approximates the same visual style"
        ],
        correctIndex: 1,
        explanation: "Serving an appropriately sized and compressed image file is the most impactful performance fix. A 4MB image shown at 300px carries ~90% unnecessary data that the browser must still download."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-3",
    courseSlug: "software-dev-course-3",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Getting Started with Git and GitHub",
    missionName: "Systems Pro",
    missionTagline: "Prove you can use Git to collaborate and manage code safely",
    primaryAxis: "Engineering",
    skillLabels: ["Git version control", "Branching", "GitHub", "Collaboration", "Problem-solving"],
    scenarioPrompt: "You are working on a team of four developers. You need to add a new search feature to an existing web app. Another developer is simultaneously fixing a bug in the same codebase. Using your Git and GitHub skills from this course, describe how you would set up your workflow to avoid conflicts and merge your feature safely.",
    evidenceHint: "A strong response describes creating a feature branch, committing with descriptive messages, opening a pull request, handling a merge conflict, and the role of code review before merging to main.",
    quizQuestions: [
      {
        text: "A developer pushes code directly to the main branch of a production repository. Ten minutes later, the site is down because of a bug in the pushed code. Which Git workflow practice would have MOST likely prevented this?",
        options: [
          "Using git stash before every push to preserve a backup of the previous state",
          "Requiring all changes to go through a feature branch with a pull request and at least one code review approval before merging to main",
          "Running git status before every push to confirm which files are being changed",
          "Protecting the main branch with a password that only the team lead knows"
        ],
        correctIndex: 1,
        explanation: "Branch protection rules combined with required PR reviews are the standard defense against broken code reaching production. They introduce a review gate without slowing individual development."
      },
      {
        text: "You run git pull and see a merge conflict in a file another developer also edited. Git shows conflict markers (<<<<<<, =======, >>>>>>>) in the file. What is the correct next step?",
        options: [
          "Run git reset --hard to discard all changes and start fresh",
          "Open the file, review both versions shown by the conflict markers, edit the file to the correct combined state, save it, then run git add and git commit to complete the merge",
          "Delete the file and recreate it from scratch to avoid the conflict",
          "Push your version immediately to overwrite the other developer's changes before they push again"
        ],
        correctIndex: 1,
        explanation: "Merge conflicts require manual resolution—inspecting both versions and editing to the intended state. After editing, staging and committing completes the merge. Hard reset would discard your work."
      },
      {
        text: "A teammate reviews your pull request and asks you to squash your 15 commits into 1 before merging. Why might they make this request?",
        options: [
          "GitHub limits the number of commits per pull request to 10",
          "Squashing produces a single, clean commit on the main branch that describes the complete feature rather than cluttering history with intermediate work-in-progress commits",
          "Individual commits in a pull request slow down the CI/CD pipeline",
          "Squashing is required before any merge conflict can be resolved"
        ],
        correctIndex: 1,
        explanation: "Squashing keeps the main branch history clean and readable. A single commit per feature or fix makes git log and git bisect much easier to use when debugging future issues."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-4",
    courseSlug: "software-dev-course-4",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Python for Data Science, AI & Development",
    missionName: "Code Architect",
    missionTagline: "Prove you can write Python to solve real data problems",
    primaryAxis: "Engineering",
    skillLabels: ["Python", "Pandas", "NumPy", "Data manipulation", "Problem-solving"],
    scenarioPrompt: "You are a junior developer at an analytics company. Your manager gives you a CSV of 50,000 sales transactions and asks for a summary report showing total revenue by product category for the top 5 categories. You have Python with pandas available. Describe the code logic you would use to produce this summary.",
    evidenceHint: "A strong response uses pandas read_csv, groupby with sum aggregation, sort_values descending, head(5), and describes how to output or display the result clearly.",
    quizQuestions: [
      {
        text: "You have a pandas DataFrame called df with columns 'category' and 'revenue'. Which code CORRECTLY produces total revenue per category sorted highest to lowest?",
        options: [
          "df.sort_values('revenue').groupby('category').sum()",
          "df.groupby('category')['revenue'].sum().sort_values(ascending=False)",
          "df.groupby('revenue')['category'].sum().sort_values()",
          "df['category'].sum().groupby('revenue').sort_values(descending=True)"
        ],
        correctIndex: 1,
        explanation: "groupby('category') groups rows by category, ['revenue'].sum() aggregates the revenue column, and sort_values(ascending=False) orders highest first. The other options misorder operations or misuse groupby."
      },
      {
        text: "A Python script opens a CSV file without a try/except block. When the file is missing, the script crashes with a FileNotFoundError. What is the BEST fix?",
        options: [
          "Add a print statement before the open() call to confirm the path is correct",
          "Wrap the file-open call in a try/except FileNotFoundError block that prints a clear error message and exits gracefully instead of crashing",
          "Add an if statement that checks whether the file is currently open by another program",
          "Change the file extension from .csv to .txt to avoid the error"
        ],
        correctIndex: 1,
        explanation: "try/except handles runtime errors gracefully. A FileNotFoundError should give the user a clear message about what went wrong rather than an unhandled stack trace."
      },
      {
        text: "A pandas DataFrame has a column 'date' stored as strings in the format 'YYYY-MM-DD'. The team needs to filter rows to those from 2024 only. What is the MOST reliable approach?",
        options: [
          "df[df['date'].str.startswith('2024')]",
          "Convert the column to datetime using pd.to_datetime(df['date']), then filter with df[df['date'].dt.year == 2024]",
          "df[df['date'] > '2024-01-01' and df['date'] < '2024-12-31']",
          "df[df['date'].str[-4:] == '2024']"
        ],
        correctIndex: 1,
        explanation: "Converting to datetime enables proper date arithmetic and filtering by year. String-based filtering with startswith or slicing is brittle and does not handle edge cases like leap years or different string formats."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-5",
    courseSlug: "software-dev-course-5",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Developing Front-End Apps with React",
    missionName: "Tech Builder",
    missionTagline: "Prove you can build dynamic UI components with React",
    primaryAxis: "Engineering",
    skillLabels: ["React", "Components", "State management", "JavaScript", "Problem-solving"],
    scenarioPrompt: "You are building a React application for a staffing agency that shows a filterable list of job openings. Users can type in a search box and the list should update in real time to show only matching jobs. Using your React skills from this course, describe how you would structure the component and manage state.",
    evidenceHint: "A strong response uses useState for the search term, a controlled input, and filters the jobs array in the render using Array.filter before mapping to JSX elements.",
    quizQuestions: [
      {
        text: "A React component renders a list of items from props but the list never updates when new items are added. What is the MOST likely cause?",
        options: [
          "React does not support dynamic lists; each item must be added manually in JSX",
          "The component is likely storing a local copy of the array in state and mutating it directly instead of calling setState with a new array reference, preventing React from detecting the change",
          "The component needs to be converted to a class component to support dynamic updates",
          "The list items are missing CSS styles that tell React they are interactive"
        ],
        correctIndex: 1,
        explanation: "React tracks state changes by reference. Mutating an array directly (e.g., push) does not create a new reference, so React does not re-render. Always pass a new array to setState."
      },
      {
        text: "You want a React input field's value to always reflect the component's state variable searchTerm. Which approach CORRECTLY creates a controlled input?",
        options: [
          "<input defaultValue={searchTerm} />",
          "<input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />",
          "<input value={searchTerm} />",
          "<input onChange={() => setSearchTerm(input.current.value)} ref={input} />"
        ],
        correctIndex: 1,
        explanation: "A controlled input requires both value={state} to display current state and onChange to update state when the user types. Without onChange, the input becomes read-only; without value, it is uncontrolled."
      },
      {
        text: "A React component fetches user data from an API every time the parent re-renders, causing excessive network calls. How should this be fixed?",
        options: [
          "Move the fetch call outside the component so it only runs once when the file is loaded",
          "Wrap the fetch call in useEffect with an empty dependency array [] so it runs only once after the component mounts",
          "Use useState instead of useEffect to trigger the fetch so it is controlled by component state",
          "Add a loading state that prevents re-renders while the fetch is in progress"
        ],
        correctIndex: 1,
        explanation: "useEffect with an empty dependency array [] runs the effect once after mount, equivalent to componentDidMount. Without the dependency array, the effect runs on every render—causing the observed problem."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-6",
    courseSlug: "software-dev-course-6",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Developing Back-End Apps with Node.js and Express",
    missionName: "Systems Pro",
    missionTagline: "Prove you can build server-side APIs with Node and Express",
    primaryAxis: "Engineering",
    skillLabels: ["Node.js", "Express", "REST APIs", "Middleware", "Problem-solving"],
    scenarioPrompt: "You are building the back end for a job board. You need to create a REST API with endpoints to list all job postings (GET), add a new posting (POST), and delete a posting by ID (DELETE). Using your Node.js and Express skills from this course, describe how you would structure these routes and handle errors.",
    evidenceHint: "A strong response names the three HTTP methods and their routes, describes Express Router organization, mentions middleware for parsing JSON, and explains how to return appropriate status codes (200, 201, 404, 500).",
    quizQuestions: [
      {
        text: "A client sends a POST request to an Express API to create a new job posting, but the server returns a 500 error and logs 'Cannot read property title of undefined.' What is the MOST likely cause?",
        options: [
          "The Express server is running on the wrong port",
          "The server is missing express.json() middleware, so req.body is undefined and the destructuring of req.body.title fails",
          "POST requests are not supported in Express without installing a separate plugin",
          "The database connection timed out before the body could be parsed"
        ],
        correctIndex: 1,
        explanation: "Without express.json() (or the older bodyParser.json()), req.body is undefined. Accessing a property on undefined throws a TypeError—the classic symptom of missing JSON middleware."
      },
      {
        text: "An Express route handler for GET /jobs/:id returns the job if found but does nothing when the ID does not exist, causing the request to hang indefinitely. How should this be fixed?",
        options: [
          "Add a setTimeout to close the connection after 5 seconds if no response is sent",
          "Add an else branch that calls res.status(404).json({ error: 'Job not found' }) when the lookup returns null or undefined",
          "Return an empty object {} with status 200 so the client can detect the missing record",
          "Redirect the client to GET /jobs to show the full list when a specific ID is not found"
        ],
        correctIndex: 1,
        explanation: "Every code path in a route handler must call res to send a response. A 404 with a descriptive message is the correct response when a requested resource does not exist."
      },
      {
        text: "Your Express API needs to verify that every request to protected routes includes a valid authentication token. Which approach BEST implements this without repeating the check in every route handler?",
        options: [
          "Copy and paste the token verification code into every protected route handler",
          "Create a middleware function that checks the token and call next() if valid or res.status(401) if not, then apply it to all protected routes using app.use() or by passing it to individual routers",
          "Store the token in a global variable and check it manually at the start of each handler",
          "Require the client to pass the token as a query parameter and validate it in the router's base path"
        ],
        correctIndex: 1,
        explanation: "Middleware is Express's mechanism for reusable request processing. A single auth middleware applied to protected routes eliminates code duplication and makes the security logic easy to update in one place."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-7",
    courseSlug: "software-dev-course-7",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Django Application Development with SQL and Databases",
    missionName: "Code Architect",
    missionTagline: "Prove you can build database-backed apps with Django",
    primaryAxis: "Engineering",
    skillLabels: ["Django", "SQL", "ORM", "Database modeling", "Problem-solving"],
    scenarioPrompt: "You are building a Django app for a training program that needs to track students, courses, and enrollments. A student can enroll in many courses and each course can have many students. Using your Django and SQL skills from this course, describe how you would model this data and query it.",
    evidenceHint: "A strong response defines three Django models (Student, Course, Enrollment) with a ManyToManyField or explicit through model, explains migrations, and writes a Django ORM query to find all courses for a given student.",
    quizQuestions: [
      {
        text: "A Django developer creates a new model field and forgets to run makemigrations before deploying to production. What is the MOST likely result?",
        options: [
          "Django will automatically create the database column the first time the model is used",
          "Queries that reference the new field will fail with a database error because the column does not exist in the production database",
          "The application will ignore the new field and use the old schema without error",
          "The Django admin will show an error only when an admin user tries to access the model"
        ],
        correctIndex: 1,
        explanation: "Django's ORM generates SQL based on the model definition, but the actual database schema only changes when migrations are applied. A missing column causes OperationalError on any query referencing that field."
      },
      {
        text: "A Django ORM query returns all Course objects but the related Instructor object is fetched in a separate query for each course, causing N+1 query performance issues. What is the BEST fix?",
        options: [
          "Add an index to the instructor_id foreign key column in the database",
          "Use select_related('instructor') in the queryset to fetch courses and their instructors in a single SQL JOIN",
          "Cache the instructor queryset in a session variable to avoid repeated database calls",
          "Switch from a ForeignKey to a ManyToManyField to reduce the number of join operations"
        ],
        correctIndex: 1,
        explanation: "select_related performs a SQL JOIN and fetches related objects in one query. The N+1 problem—where each row triggers a separate query—is Django's most common ORM performance issue."
      },
      {
        text: "A Django view function directly inserts user-supplied form input into an SQL string using Python string formatting. Why is this dangerous?",
        options: [
          "String formatting is slower than parameterized queries so the view will time out under load",
          "It is vulnerable to SQL injection—an attacker can craft input that terminates the intended SQL and executes arbitrary database commands",
          "Django's ORM does not support raw SQL so the query will silently fail",
          "String-formatted queries bypass Django's migration system and may corrupt the schema"
        ],
        correctIndex: 1,
        explanation: "SQL injection is one of the most critical web security vulnerabilities. Django's ORM and parameterized queries escape user input automatically—raw string formatting bypasses this protection entirely."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-8",
    courseSlug: "software-dev-course-8",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Introduction to Containers w/ Docker, Kubernetes & OpenShift",
    missionName: "Tech Builder",
    missionTagline: "Prove you can containerize and orchestrate applications",
    primaryAxis: "Engineering",
    skillLabels: ["Docker", "Kubernetes", "Containers", "OpenShift", "Problem-solving"],
    scenarioPrompt: "Your team is deploying a Node.js API to production. Previously the app ran on a bare server and worked on your machine but failed in production due to environment differences. Your manager asks you to containerize it with Docker and explain how Kubernetes would manage it at scale. Using your container skills from this course, describe your approach.",
    evidenceHint: "A strong response describes writing a Dockerfile (base image, COPY, RUN, EXPOSE, CMD), building and tagging the image, and explains how Kubernetes Deployments and Services manage scaling and load balancing.",
    quizQuestions: [
      {
        text: "A Node.js application works on a developer's laptop but crashes in production because the server has Node.js version 14 while the app requires version 20. How does Docker solve this problem?",
        options: [
          "Docker updates the server's Node.js version automatically when the container starts",
          "The Dockerfile specifies FROM node:20-alpine, which packages the correct Node.js version inside the container image—making the runtime environment consistent regardless of what is installed on the host",
          "Docker installs a virtual machine with the correct version isolated from the host OS",
          "Docker caches the developer's local node_modules folder and replicates it on the server"
        ],
        correctIndex: 1,
        explanation: "The FROM instruction in a Dockerfile pins the exact runtime version inside the image. This eliminates 'works on my machine' failures caused by environment drift between development and production."
      },
      {
        text: "A Kubernetes Deployment is configured with 3 replicas of a web application pod. One pod crashes. What does Kubernetes do automatically?",
        options: [
          "Nothing—Kubernetes waits for an administrator to manually restart the failed pod",
          "Kubernetes detects that the actual state (2 pods) does not match the desired state (3 replicas) and automatically schedules a new pod to restore the configured replica count",
          "Kubernetes reduces the replica count to 2 to match the current actual state",
          "Kubernetes restarts all three pods simultaneously to ensure the cluster is in a clean state"
        ],
        correctIndex: 1,
        explanation: "Kubernetes continuously reconciles actual state with desired state. A crashed pod triggers automatic rescheduling—this self-healing behavior is a core value of container orchestration."
      },
      {
        text: "A team stores a database password in plain text inside a Dockerfile using the ENV instruction. Why is this a security problem?",
        options: [
          "ENV variables in Docker are encrypted at rest so the password is safe in the image but exposed at runtime",
          "The Dockerfile is typically committed to version control and the image layers are inspectable, making the password visible to anyone with access to the repository or the image",
          "Docker does not support string values in ENV instructions; only numeric values are allowed",
          "ENV variables are stripped from the container when it is deployed to Kubernetes"
        ],
        correctIndex: 1,
        explanation: "Embedding secrets in Dockerfiles exposes them in image layers and version history. Kubernetes Secrets or a secret manager (like Vault) should inject credentials at runtime, keeping them out of the image."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "software-developer-professional-certificate-ibm:mission:software-dev-course-9",
    courseSlug: "software-dev-course-9",
    programSlug: "software-developer-professional-certificate-ibm",
    programTitle: "Software Developer Professional Certificate",
    courseTitle: "Application Development using Microservices and Serverless",
    missionName: "Systems Pro",
    missionTagline: "Prove you can design and deploy cloud-native applications",
    primaryAxis: "Engineering",
    skillLabels: ["Microservices", "Serverless", "REST APIs", "Cloud functions", "Problem-solving"],
    scenarioPrompt: "Your company is splitting a monolithic job-board application into microservices. You are assigned the notifications service, which must send emails when a candidate applies to a job. You are also evaluating whether to deploy it as a serverless function or a persistent microservice. Using your microservices and serverless skills from this course, explain your design decision and how the service would communicate with the rest of the system.",
    evidenceHint: "A strong response explains event-driven communication (e.g., message queue or webhook trigger), compares serverless (cost-efficient for spiky traffic) versus a persistent service (for steady high-volume), and describes how the service boundary is defined.",
    quizQuestions: [
      {
        text: "A notifications service sends emails whenever a new job application is submitted. The applications team calls the notifications service directly via HTTP. When the notifications service is down for maintenance, job applications also fail. How should this dependency be decoupled?",
        options: [
          "Deploy the notifications service with 99.99% SLA so it is never down during business hours",
          "Use a message queue (like RabbitMQ or SQS) so the applications service publishes an event and the notifications service consumes it independently—allowing maintenance without affecting application submissions",
          "Combine both services into a single service so they share the same deployment lifecycle",
          "Add a retry loop in the applications service that keeps trying to reach notifications until it succeeds"
        ],
        correctIndex: 1,
        explanation: "Message queues decouple producers from consumers. The applications service publishes and moves on; the notifications service processes the event when it is available—eliminating the synchronous dependency."
      },
      {
        text: "A serverless function that processes uploaded resumes runs in under 2 seconds for small files but times out on files larger than 10MB. What is the MOST appropriate fix?",
        options: [
          "Increase the serverless function's memory allocation since more memory extends the timeout",
          "Move large-file processing to an asynchronous queue-based worker that can process without strict time limits, reserving the serverless function for initial validation and queuing",
          "Compress all uploaded files to under 1MB using the serverless function before processing",
          "Upgrade the serverless plan to a higher tier that removes the timeout restriction"
        ],
        correctIndex: 1,
        explanation: "Serverless functions are designed for short-lived, stateless tasks. Long-running or resource-intensive processing belongs in a queue-backed worker service with relaxed time constraints."
      },
      {
        text: "Two microservices share the same database table to exchange data. A schema change in that table for Service A breaks Service B. What architectural principle does this violate?",
        options: [
          "Single Responsibility Principle — each service should have only one reason to change",
          "Service autonomy — each microservice should own its own data store so schema changes in one service do not cascade to others",
          "DRY (Don't Repeat Yourself) — the shared table reduces code duplication but introduces coupling",
          "YAGNI — the shared table is premature optimization that adds unnecessary complexity"
        ],
        correctIndex: 1,
        explanation: "Microservice autonomy requires that services own their own data. Sharing a database table creates tight schema coupling that defeats the independent deployability goal of microservices."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 5: Cybersecurity Professional Certificate (Google) ───────────

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-1",
    courseSlug: "cybersecurity-course-1",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Foundations of Cybersecurity",
    missionName: "Support Hero",
    missionTagline: "Prove you understand what cybersecurity protects and why it matters",
    primaryAxis: "Service",
    skillLabels: ["Security fundamentals", "Threat awareness", "SIEM tools", "Network security", "Communication"],
    scenarioPrompt: "You are starting your first week as a security analyst intern. Your manager asks you to explain, in plain terms, what the CIA triad means and give a real workplace example of how each element can be violated. Using your Foundations of Cybersecurity knowledge, walk through each component with a concrete scenario.",
    evidenceHint: "A strong response defines Confidentiality, Integrity, and Availability, provides a distinct real-world violation example for each, and explains the business impact of each breach type.",
    quizQuestions: [
      {
        text: "An employee accidentally emails a spreadsheet containing Social Security numbers to an external vendor. Which element of the CIA triad is PRIMARILY violated?",
        options: [
          "Availability — authorized users can no longer access the data",
          "Confidentiality — sensitive data was disclosed to an unauthorized party",
          "Integrity — the data in the spreadsheet may have been altered during transmission",
          "Authentication — the employee's identity was not verified before sending the email"
        ],
        correctIndex: 1,
        explanation: "Confidentiality means data is only accessible to authorized parties. Sending SSNs to an unintended external recipient is a confidentiality breach regardless of whether the data was altered."
      },
      {
        text: "A ransomware attack encrypts all files on a hospital's servers, making patient records inaccessible during surgery prep. Which CIA triad element is MOST directly impacted?",
        options: [
          "Confidentiality — encrypted files cannot be read by attackers",
          "Integrity — the ransomware may have modified patient records",
          "Availability — authorized users cannot access the data they need to perform critical work",
          "Non-repudiation — the hospital cannot prove who last accessed the records"
        ],
        correctIndex: 2,
        explanation: "Availability means authorized users can access systems and data when needed. Ransomware that blocks access to patient records during medical care is a life-threatening availability failure."
      },
      {
        text: "A malicious insider changes the invoice total in a payment system from $5,000 to $50,000 without authorization. Which CIA triad element is violated?",
        options: [
          "Availability — the invoice system is still running but returning wrong data",
          "Confidentiality — the attacker viewed financial records they should not have seen",
          "Integrity — the accuracy and trustworthiness of the data has been compromised by unauthorized modification",
          "Authentication — the insider used their own valid credentials to make the change"
        ],
        correctIndex: 2,
        explanation: "Integrity means data is accurate and has not been tampered with. Unauthorized modification of financial records—even by someone with system access—is an integrity violation."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-2",
    courseSlug: "cybersecurity-course-2",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Play It Safe: Manage Security Risks",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can assess and prioritize security risks systematically",
    primaryAxis: "Strategy",
    skillLabels: ["Risk management", "Security frameworks", "NIST", "Threat modeling", "Critical thinking"],
    scenarioPrompt: "A mid-size company stores customer credit card data and has asked you to help them identify and prioritize their top security risks before their annual audit. They have limited budget and need to know where to focus first. Using the risk management frameworks from this course, describe how you would assess and rank their risks.",
    evidenceHint: "A strong response references a framework (like NIST CSF), explains likelihood × impact as the basis for prioritization, distinguishes between threats, vulnerabilities, and risks, and recommends at least two controls for the highest-priority risk.",
    quizQuestions: [
      {
        text: "A security team has identified 12 vulnerabilities across their systems. Time and budget allow fixing only 4 this quarter. What is the MOST defensible basis for choosing which 4 to address first?",
        options: [
          "Fix the 4 vulnerabilities that were discovered most recently since they are the newest attack surface",
          "Prioritize by risk score—calculated as likelihood of exploitation multiplied by potential business impact—addressing the highest-scoring vulnerabilities first",
          "Fix the 4 vulnerabilities that are easiest to patch so the team demonstrates quick progress",
          "Address vulnerabilities alphabetically by system name to ensure fair coverage across all systems"
        ],
        correctIndex: 1,
        explanation: "Risk = likelihood × impact is the standard risk prioritization formula. It ensures limited resources address the vulnerabilities that pose the greatest actual threat to the business."
      },
      {
        text: "A company uses the NIST Cybersecurity Framework to guide its security program. An auditor asks which function covers detecting security incidents. Which NIST CSF function applies?",
        options: [
          "Identify — establishing what assets exist and what risks they face",
          "Protect — implementing safeguards to ensure service delivery",
          "Detect — developing activities to identify when a cybersecurity event has occurred",
          "Respond — taking action regarding a detected incident"
        ],
        correctIndex: 2,
        explanation: "The NIST CSF Detect function encompasses the capabilities and processes that enable timely discovery of cybersecurity events, including continuous monitoring and anomaly detection."
      },
      {
        text: "An unpatched web server is exposed to the internet and the application running on it has a known SQL injection vulnerability. How should these be classified?",
        options: [
          "Both are threats because they represent actions an attacker could take",
          "The unpatched server and the SQL injection flaw are vulnerabilities; a threat is an actor or event that could exploit them, and together they constitute a risk",
          "Both are risks because they could lead to a data breach",
          "The SQL injection is a vulnerability but the unpatched server is a threat since it enables the attack"
        ],
        correctIndex: 1,
        explanation: "Vulnerabilities are weaknesses; threats are actors or events that exploit them; risk is the combination. Distinguishing these terms is fundamental to structured security risk management."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-3",
    courseSlug: "cybersecurity-course-3",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Connect and Protect: Networks and Network Security",
    missionName: "Systems Pro",
    missionTagline: "Prove you can identify and defend network-level threats",
    primaryAxis: "Engineering",
    skillLabels: ["Network protocols", "Firewalls", "TCP/IP", "Intrusion detection", "Problem-solving"],
    scenarioPrompt: "A security analyst notices unusual outbound traffic from an internal workstation to an unfamiliar IP address at 3 AM. The company has a firewall and an IDS in place. Using your network security skills from this course, describe how you would investigate this alert and what network-level controls could have prevented or detected this earlier.",
    evidenceHint: "A strong response mentions checking firewall logs, IDS alerts, and the specific protocol/port of the traffic, explains what a C2 (command and control) connection looks like, and recommends a specific network control improvement.",
    quizQuestions: [
      {
        text: "A network administrator sees repeated SYN packets sent to hundreds of different ports on a server from a single IP address over 30 seconds. What is MOST likely happening?",
        options: [
          "A legitimate user is testing a new application that opens many connections simultaneously",
          "A port scan is underway—the attacker is probing which services are listening to map the attack surface before launching an exploit",
          "The server is experiencing a denial-of-service attack that is flooding it with connection requests",
          "The network switch is malfunctioning and broadcasting packets to all ports"
        ],
        correctIndex: 1,
        explanation: "Sequential SYN packets to many ports from one source is the signature of a port scan. The goal is reconnaissance—identifying open services that can be exploited in a subsequent attack."
      },
      {
        text: "A firewall rule allows all outbound traffic on port 443 (HTTPS). An attacker uses an encrypted HTTPS tunnel to exfiltrate data to an external server. Why did the firewall fail to stop this?",
        options: [
          "The firewall was not properly configured and should have blocked port 443 entirely",
          "Firewalls that only inspect port numbers cannot see inside encrypted traffic; a next-generation firewall with deep packet inspection or DNS filtering is needed to detect malicious HTTPS connections",
          "Port 443 traffic is automatically trusted by all network devices and cannot be blocked",
          "The attacker exploited a firewall vulnerability that allowed them to disable the outbound rules"
        ],
        correctIndex: 1,
        explanation: "Traditional firewalls filter by port and IP, not by content. Encrypted exfiltration over allowed ports bypasses this control. NGFW or DNS-layer filtering can detect malicious destinations even over HTTPS."
      },
      {
        text: "Two computers on the same network segment are communicating and a technician captures the traffic. They can read the full contents of every message. What does this indicate about the communication?",
        options: [
          "The computers are using IPv6, which does not support encryption",
          "The traffic is unencrypted, meaning the protocol in use (such as HTTP or Telnet) transmits data in plaintext—visible to anyone with network access",
          "The technician has installed malware that strips encryption from network packets",
          "This is normal behavior; internal network traffic is always readable by network administrators"
        ],
        correctIndex: 1,
        explanation: "Protocols like HTTP and Telnet transmit in plaintext. Any device on the same network segment with a packet sniffer can read the full content. Encryption (HTTPS, SSH) is required to prevent this."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-4",
    courseSlug: "cybersecurity-course-4",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Tools of the Trade: Linux and SQL",
    missionName: "Code Architect",
    missionTagline: "Prove you can use Linux and SQL to investigate security issues",
    primaryAxis: "Engineering",
    skillLabels: ["Linux command line", "SQL queries", "Log analysis", "File permissions", "Problem-solving"],
    scenarioPrompt: "You are a security analyst responding to a potential insider threat. You need to check which files a specific user account accessed in the last 24 hours and whether they have write permission to sensitive directories. You have access to a Linux terminal and a SQL database of access logs. Describe the Linux commands and SQL queries you would run.",
    evidenceHint: "A strong response uses ls -la for permissions, find or grep on auth logs for recent user activity, and a SQL query with WHERE, timestamp filtering, and ORDER BY to surface relevant access records.",
    quizQuestions: [
      {
        text: "A security analyst needs to find all files in /var/log modified in the last 24 hours on a Linux system. Which command is MOST appropriate?",
        options: [
          "ls -la /var/log | grep 'today'",
          "find /var/log -mtime -1 -type f",
          "cat /var/log/* | grep modified",
          "stat /var/log --recent=24h"
        ],
        correctIndex: 1,
        explanation: "find with -mtime -1 returns files modified less than 1 day ago (within the last 24 hours). The other options use invalid flags or grep on content rather than file metadata."
      },
      {
        text: "An analyst queries a login_events table and needs to find all failed login attempts by a user named 'jsmith' in the last 7 days ordered by most recent first. Which SQL query is correct?",
        options: [
          "SELECT * FROM login_events WHERE user = 'jsmith' AND status = 'failed' AND event_time > NOW() - INTERVAL '7 days' ORDER BY event_time DESC;",
          "SELECT * FROM login_events WHERE user = 'jsmith' ORDER BY event_time WHERE status = 'failed';",
          "SELECT user, status FROM login_events HAVING user = 'jsmith' AND status = 'failed';",
          "SELECT * FROM login_events WHERE status = 'failed' GROUP BY user HAVING user = 'jsmith';"
        ],
        correctIndex: 0,
        explanation: "The first query correctly combines a user filter, status filter, and date range using INTERVAL arithmetic, then orders results newest-first. The other options misplace clauses or use HAVING incorrectly outside of aggregation."
      },
      {
        text: "A Linux file has permissions -rwxr-x--- and is owned by user 'root' and group 'security'. A member of the 'security' group tries to delete the file and gets 'Permission denied.' Why?",
        options: [
          "The security group member does not have execute permission on the file",
          "Deleting a file requires write permission on the DIRECTORY containing the file, not on the file itself; the security group only has read and execute on the file",
          "The file has an immutable flag set that prevents deletion by any user including root",
          "The security group member needs write permission (w) on the file itself to delete it"
        ],
        correctIndex: 1,
        explanation: "In Linux, file deletion is controlled by the parent directory's write permission, not the file's own permissions. The security group likely lacks write permission on the containing directory."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-5",
    courseSlug: "cybersecurity-course-5",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Assets, Threats, and Vulnerabilities",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can map assets to threats and find the gaps",
    primaryAxis: "Analytics",
    skillLabels: ["Asset classification", "Threat analysis", "Vulnerability scanning", "NIST", "Critical thinking"],
    scenarioPrompt: "A retail company asks you to conduct an asset inventory and threat analysis for their e-commerce platform before a planned expansion. The platform stores customer PII and payment data. Using your assets, threats, and vulnerabilities framework from this course, describe how you would inventory critical assets, identify threats to each, and recommend prioritized controls.",
    evidenceHint: "A strong response categorizes assets by sensitivity (data, systems, people), maps at least two specific threats to each asset category, and recommends a control for the highest-severity pairing.",
    quizQuestions: [
      {
        text: "A company's asset inventory includes employee laptops, customer database servers, and the building's physical access system. Which asset requires the HIGHEST security classification?",
        options: [
          "Employee laptops because they are the most numerous and therefore the largest attack surface",
          "The customer database servers because they store regulated personal and payment data whose exposure carries legal, financial, and reputational consequences",
          "The physical access system because it controls who can enter the building where all other assets are housed",
          "All three require equal classification since compromise of any one could lead to a breach"
        ],
        correctIndex: 1,
        explanation: "Asset classification is driven by the sensitivity of the data and the impact of compromise. A database containing regulated PII and payment card data warrants the highest classification due to legal liability and breach severity."
      },
      {
        text: "A vulnerability scanner reports a critical CVE on a server that runs an internal tool used by 3 employees with no external access. A public-facing payment server has a medium CVE. Which should be patched first?",
        options: [
          "The internal server with the critical CVE since higher severity always takes priority regardless of exposure",
          "The public-facing payment server with the medium CVE because its internet exposure and access to payment data make exploitation far more likely, raising the actual risk above the internal server despite the lower CVE score",
          "Both should be patched simultaneously since any unpatched CVE is unacceptable",
          "Neither requires urgent patching since CVEs are theoretical vulnerabilities that rarely get exploited in practice"
        ],
        correctIndex: 1,
        explanation: "Risk = likelihood × impact. A medium CVE on an internet-exposed payment server often poses greater real-world risk than a critical CVE on an isolated internal tool. Context matters more than raw severity scores."
      },
      {
        text: "A threat model for an e-commerce site identifies 'credential stuffing attacks' as a high-likelihood threat. Which control MOST directly reduces the likelihood of this threat succeeding?",
        options: [
          "Encrypting all data at rest so stolen credentials cannot be used to access the database directly",
          "Implementing multi-factor authentication so that stolen username/password pairs alone are insufficient to gain access",
          "Deploying a web application firewall to block SQL injection attempts",
          "Increasing password minimum length requirements across all user accounts"
        ],
        correctIndex: 1,
        explanation: "Credential stuffing uses valid username/password pairs obtained from other breaches. MFA invalidates the attack by requiring a second factor the attacker does not have—directly neutralizing this specific threat."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-6",
    courseSlug: "cybersecurity-course-6",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Sound the Alarm: Detection and Response",
    missionName: "Systems Pro",
    missionTagline: "Prove you can detect incidents and respond effectively",
    primaryAxis: "Engineering",
    skillLabels: ["Incident detection", "SIEM", "Incident response", "Log analysis", "Problem-solving"],
    scenarioPrompt: "Your SIEM fires an alert at 2 PM on a Tuesday: an employee account has authenticated from two countries within 15 minutes—an impossible travel scenario. Using your detection and response skills from this course, walk through the incident response steps you would take from initial triage to containment.",
    evidenceHint: "A strong response covers the incident response phases (Detect, Analyze, Contain, Eradicate, Recover, Post-incident), explains how to verify the alert is a true positive, and describes the containment action (e.g., disable account, force MFA re-enrollment).",
    quizQuestions: [
      {
        text: "A SIEM alert triggers for 'multiple failed login attempts followed by a successful login' on an admin account at 11 PM. What is the FIRST step in the incident response process?",
        options: [
          "Immediately disable the admin account to prevent further access",
          "Triage the alert by gathering additional context—checking the source IP, comparing against known admin login patterns, and determining whether the successful login was from a legitimate location before taking containment action",
          "Notify the executive team and legal counsel that a breach has occurred",
          "Reset all user passwords company-wide as a precautionary measure"
        ],
        correctIndex: 1,
        explanation: "Hasty containment without triage can lock out legitimate users and destroy forensic evidence. The first step is to analyze available data to confirm whether the alert is a true positive before acting."
      },
      {
        text: "During an incident investigation, a security analyst discovers that malware has been running on a workstation for 3 weeks. The workstation contains sensitive HR files. What should the analyst do with the workstation BEFORE wiping it?",
        options: [
          "Wipe and reimage the workstation immediately to remove the malware as quickly as possible",
          "Isolate the workstation from the network to prevent further spread, then create a forensic image of the drive to preserve evidence before remediation begins",
          "Leave the workstation connected to observe the malware's behavior and gather intelligence",
          "Run the company's antivirus tool and remove any detected threats before deciding whether a full wipe is needed"
        ],
        correctIndex: 1,
        explanation: "Forensic imaging before wiping preserves evidence needed to understand the breach scope, identify the attack vector, and meet potential legal or regulatory obligations. Containment (isolation) precedes eradication."
      },
      {
        text: "A SIEM generates 500 alerts per day, but the security team can only investigate 50. Which approach BEST improves alert quality without missing critical incidents?",
        options: [
          "Hire more analysts until the team can investigate all 500 alerts daily",
          "Tune SIEM rules to reduce false positives, apply risk-based scoring to prioritize high-fidelity alerts, and correlate events across multiple log sources before escalating",
          "Disable the lower-priority alert rules to reduce the total volume to a manageable number",
          "Rotate alert investigation across team members so every analyst reviews a random sample"
        ],
        correctIndex: 1,
        explanation: "Alert fatigue is a top SIEM challenge. Tuning rules, adding correlation logic, and risk-scoring alerts improves the signal-to-noise ratio without eliminating detection coverage."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-7",
    courseSlug: "cybersecurity-course-7",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Automate Cybersecurity Tasks with Python",
    missionName: "Code Architect",
    missionTagline: "Prove you can write Python scripts to automate security work",
    primaryAxis: "Engineering",
    skillLabels: ["Python automation", "Log parsing", "Regular expressions", "File I/O", "Problem-solving"],
    scenarioPrompt: "Your team receives firewall log files daily and manually reviews them for suspicious IPs. You have been asked to write a Python script that parses the log file, extracts all unique source IPs, counts how many connection attempts each IP made, and flags any IP with more than 100 attempts in a day. Describe the script logic you would implement.",
    evidenceHint: "A strong response uses file open/read, a regular expression to extract IPs, a dictionary or Counter to tally attempts, and a loop to flag IPs exceeding the threshold.",
    quizQuestions: [
      {
        text: "A Python script needs to extract all IPv4 addresses from a multi-line log file string. Which regular expression pattern is MOST appropriate?",
        options: [
          "'\d+'",
          "'\b(?:\d{1,3}\.){3}\d{1,3}\b'",
          "'[0-9].[0-9].[0-9].[0-9]'",
          "'\d\d\d\.\d\d\d\.\d\d\d\.\d\d\d'"
        ],
        correctIndex: 1,
        explanation: "The pattern \b(?:\d{1,3}\.){3}\d{1,3}\b matches four groups of 1-3 digits separated by literal dots with word boundaries. The other options either match only integers, use unescaped dots (which match any character), or require exactly 3 digits per octet."
      },
      {
        text: "A security script opens a log file and counts IP occurrences using a Python dictionary. After processing 10,000 lines the script runs out of memory. What is the MOST appropriate fix?",
        options: [
          "Switch from a dictionary to a list since lists use less memory than dictionaries",
          "Process the file line by line using a generator or iteration rather than reading the entire file into memory at once with read()",
          "Split the log file into smaller files manually before running the script",
          "Increase the server's RAM allocation to handle larger file processing"
        ],
        correctIndex: 1,
        explanation: "Reading large files entirely into memory with read() is inefficient. Iterating line by line (for line in file) processes one line at a time, keeping memory usage constant regardless of file size."
      },
      {
        text: "A Python security script catches an exception when the log file does not exist and prints 'Error: file not found.' A colleague says this is insufficient for a production security tool. What should be improved?",
        options: [
          "The script should crash loudly so the on-call team is immediately aware of the problem",
          "The script should log the error with a timestamp to a dedicated error log, send an alert to the security team, and exit with a non-zero status code so automated pipelines can detect the failure",
          "The script should create an empty log file so subsequent steps in the pipeline do not fail",
          "The error message is sufficient; adding logging would create more files that also need to be monitored"
        ],
        correctIndex: 1,
        explanation: "Production security automation needs structured error logging, alerting, and machine-readable exit codes. A print statement to stdout is invisible to monitoring systems and leaves no audit trail."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "cybersecurity-professional-certificate-google:mission:cybersecurity-course-8",
    courseSlug: "cybersecurity-course-8",
    programSlug: "cybersecurity-professional-certificate-google",
    programTitle: "Cybersecurity Professional Certificate",
    courseTitle: "Put It to Work: Prepare for Cybersecurity Jobs",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can communicate security findings and build your career",
    primaryAxis: "Strategy",
    skillLabels: ["Incident reporting", "Security communication", "Career preparation", "Documentation", "Critical thinking"],
    scenarioPrompt: "You have completed your first solo incident investigation as a junior security analyst. You found that a phishing email led to credential theft and lateral movement to two additional workstations before being contained. You must now write an incident report for leadership and prepare talking points for your first job interview about what you learned. Using the communication and career skills from this course, describe how you would structure both.",
    evidenceHint: "A strong response outlines the incident report structure (executive summary, timeline, impact, root cause, lessons learned, recommendations) and explains how to translate the investigation into interview-ready talking points using the STAR method.",
    quizQuestions: [
      {
        text: "An executive reads your incident report and asks 'What did we learn from this and how do we prevent it happening again?' Which section of a well-structured incident report directly answers this question?",
        options: [
          "The timeline section, which documents exactly when each event occurred",
          "The lessons learned and recommendations section, which identifies root causes and specifies actionable controls to prevent recurrence",
          "The impact assessment section, which quantifies the business damage from the incident",
          "The executive summary, which provides a high-level narrative of what happened"
        ],
        correctIndex: 1,
        explanation: "The lessons learned and recommendations section is the forward-looking portion of an incident report. It translates the investigation findings into specific, actionable improvements to security controls and processes."
      },
      {
        text: "During a job interview, a hiring manager asks: 'Tell me about a time you handled a security incident.' You investigated a phishing attack during your training program. Using the STAR method, which response structure is BEST?",
        options: [
          "Describe all the technical tools you used during the investigation to demonstrate depth of knowledge",
          "Situation: describe the phishing alert context; Task: explain your responsibility; Action: detail the specific investigation steps you took; Result: share what you contained, learned, and recommended",
          "Briefly mention the incident and pivot to describing your technical certifications since they are more relevant to the role",
          "Explain that you cannot share details due to confidentiality even though it was a training exercise"
        ],
        correctIndex: 1,
        explanation: "The STAR method (Situation, Task, Action, Result) structures behavioral answers to demonstrate competency with a concrete example. It is the hiring standard for experience-based interview questions."
      },
      {
        text: "You are writing a post-incident report and must include the root cause. During investigation you found the phishing email bypassed the spam filter because it came from a newly registered domain. What is the CORRECT way to state the root cause?",
        options: [
          "Root cause: an employee clicked a phishing link",
          "Root cause: the email security gateway did not flag the email because the sending domain was too new to have an established spam reputation, and there was no compensating control to block or sandbox emails from domains registered within the past 30 days",
          "Root cause: the attacker sent a very convincing phishing email that was hard to detect",
          "Root cause: the incident response team took 4 hours to contain the breach after detection"
        ],
        correctIndex: 1,
        explanation: "Root causes identify the systemic gap, not the human action or attacker behavior. A precise root cause points directly to a fixable control failure—in this case, the absence of new-domain blocking or sandboxing policy."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 6: AI Professional Practitioner Certificate (IBM) ───────────

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-1",
    courseSlug: "ai-dev-course-1",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Introduction to Software Engineering",
    missionName: "Code Architect",
    missionTagline: "Prove you understand the engineering foundation AI apps are built on",
    primaryAxis: "Engineering",
    skillLabels: ["SDLC", "Software architecture", "Cloud", "DevOps", "Problem-solving"],
    scenarioPrompt: "You are joining an AI product team as a junior developer. Your tech lead asks you to explain how the Software Development Lifecycle applies to an AI feature—specifically where AI development differs from traditional software development. Using your Introduction to Software Engineering knowledge, walk through the SDLC phases and note where AI introduces unique challenges.",
    evidenceHint: "A strong response names all SDLC phases, identifies at least two AI-specific challenges (e.g., data dependency in requirements, model evaluation replacing unit testing), and explains why iterative development is especially important for AI.",
    quizQuestions: [
      {
        text: "A team is building an AI-powered resume screener. During the requirements phase, a product manager says 'it should screen resumes accurately.' Why is this requirement insufficient for an AI project?",
        options: [
          "AI projects do not need formal requirements since the model learns them from data",
          "The requirement lacks measurable criteria—an AI system requires defined accuracy thresholds, acceptable error types, bias constraints, and the data sources needed to train and evaluate the model",
          "The requirement is sufficient; the development team can define accuracy during testing",
          "Requirements for AI systems should focus on the user interface, not model performance"
        ],
        correctIndex: 1,
        explanation: "AI requirements must specify quantifiable performance metrics, acceptable bias limits, and data requirements. Vague accuracy goals make it impossible to know when the model is good enough to ship."
      },
      {
        text: "An AI model performs well in testing but poorly in production. Investigation shows the training data was from 2020 while users are submitting 2025 data with different patterns. What SDLC phase was inadequately planned?",
        options: [
          "Design — the model architecture was not optimized for newer data patterns",
          "Maintenance and monitoring — the plan did not include data drift detection or model retraining cycles to keep the model current with evolving real-world data",
          "Testing — the QA team should have caught the performance degradation before deployment",
          "Deployment — the production environment was configured differently from the test environment"
        ],
        correctIndex: 1,
        explanation: "AI models degrade as real-world data drifts from training data. Unlike traditional software, AI requires ongoing maintenance including data drift monitoring and scheduled retraining—a unique SDLC consideration."
      },
      {
        text: "A startup ships an AI chatbot directly to 100,000 users without a staged rollout. The chatbot produces harmful outputs for a small percentage of edge-case queries. What deployment practice would MOST have reduced this risk?",
        options: [
          "Running more training epochs to eliminate all edge cases before deployment",
          "Using a staged rollout—deploying to a small percentage of users first, monitoring outputs and safety metrics, and expanding only after confirming acceptable behavior at scale",
          "Adding a disclaimer that the chatbot may make mistakes so users cannot hold the company liable",
          "Requiring users to complete a tutorial before accessing the chatbot to filter out edge-case queries"
        ],
        correctIndex: 1,
        explanation: "Staged rollouts limit blast radius when unexpected behaviors emerge. AI systems are especially prone to edge-case failures at scale because real user inputs differ from test distributions."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-2",
    courseSlug: "ai-dev-course-2",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Introduction to Artificial Intelligence (AI)",
    missionName: "Insight Analyst",
    missionTagline: "Prove you understand what AI can and cannot do in the real world",
    primaryAxis: "Analytics",
    skillLabels: ["AI concepts", "Machine learning basics", "AI ethics", "Data analysis", "Critical thinking"],
    scenarioPrompt: "Your company's marketing team wants to use AI to predict which customers will churn in the next 30 days. The VP asks if AI is the right tool for this problem. Using your AI fundamentals from this course, explain what type of AI/ML approach would apply, what data would be needed, and what limitations the team should understand before committing.",
    evidenceHint: "A strong response identifies this as a supervised classification problem, names the required labeled training data, explains that the model's predictions are probabilistic not certain, and names at least one ethical or practical risk (e.g., biased predictions, feedback loops).",
    quizQuestions: [
      {
        text: "A company wants to build an AI system that predicts whether a loan applicant will default. Which type of machine learning is MOST appropriate?",
        options: [
          "Unsupervised learning, using clustering to group applicants into risk segments without labeled data",
          "Supervised learning using historical loan data with known outcomes (default/no default) as labeled training examples to build a binary classification model",
          "Reinforcement learning, where the model learns by trial-and-error which applicants to approve",
          "Generative AI, which creates synthetic applicant profiles to simulate default scenarios"
        ],
        correctIndex: 1,
        explanation: "Binary classification (default/no default) with historical labeled outcomes is a classic supervised learning problem. Unsupervised learning cannot predict a specific target without labels."
      },
      {
        text: "An AI hiring tool trained on historical resumes rejects significantly more applications from women than men for engineering roles. What is the MOST likely cause?",
        options: [
          "The AI correctly identified that women have fewer engineering qualifications on average",
          "The historical training data reflected past hiring biases that underrepresented women in engineering roles; the model learned to replicate those biases rather than evaluate true qualifications",
          "The AI was programmed with a gender bias by the developers who built it",
          "Women's resumes use different formatting that the AI parser cannot read accurately"
        ],
        correctIndex: 1,
        explanation: "AI systems that train on biased historical data learn and amplify those biases. This is a well-documented problem in hiring AI and illustrates why data quality and fairness auditing are essential before deployment."
      },
      {
        text: "A business analyst presents an AI model with 94% accuracy as proof it is ready to replace human customer service agents. What critical limitation might this metric hide?",
        options: [
          "94% accuracy means 6% of predictions are wrong, which is an acceptable error rate for customer service",
          "Accuracy can be misleading when classes are imbalanced—if 94% of customer queries are routine, a model that always predicts 'routine' achieves 94% accuracy without understanding any edge cases or complex complaints",
          "The model should achieve 99.9% accuracy before replacing human agents since any error is unacceptable",
          "Accuracy is the gold standard metric for all AI classification problems and cannot be misleading"
        ],
        correctIndex: 1,
        explanation: "Accuracy is a poor metric on imbalanced datasets. A model that never flags complex cases can score highly on accuracy while completely failing at the hardest and most important customer interactions."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-3",
    courseSlug: "ai-dev-course-3",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Generative AI: Introduction and Applications",
    missionName: "Analytics Pro",
    missionTagline: "Prove you know where generative AI fits in real business workflows",
    primaryAxis: "Analytics",
    skillLabels: ["Generative AI", "LLM applications", "AI use cases", "Data analysis", "Critical thinking"],
    scenarioPrompt: "A workforce development nonprofit asks you whether they should use a generative AI tool to automatically write personalized job application cover letters for their clients. They want to know the benefits, the risks, and what safeguards you would recommend. Using your generative AI knowledge from this course, provide your assessment.",
    evidenceHint: "A strong response identifies specific benefits (speed, accessibility for non-writers), specific risks (hallucinated credentials, generic tone that hurts applications), and recommends human review as a safeguard rather than fully automated output.",
    quizQuestions: [
      {
        text: "A recruiter notices that dozens of applications for the same role contain nearly identical cover letter phrasing. What is the MOST likely explanation and concern?",
        options: [
          "Applicants are sharing a template; this is acceptable since cover letter formats are standardized",
          "Applicants likely used the same generative AI tool with similar prompts; the concern is that recruiters will filter these out as inauthentic, harming the applicants' chances despite the letters being technically correct",
          "The company's ATS is malfunctioning and duplicating application records",
          "This indicates the job description was too narrow, attracting only a homogeneous applicant pool"
        ],
        correctIndex: 1,
        explanation: "Undifferentiated AI-generated cover letters signal inauthenticity to experienced recruiters. Effective use of generative AI requires customization and human review to produce genuine, differentiated content."
      },
      {
        text: "A generative AI tool produces a cover letter that states the applicant 'managed a team of 15 engineers at Google' — a claim the applicant never made. What is this called and why is it dangerous?",
        options: [
          "A bias error; the model stereotyped the applicant based on demographic data in the prompt",
          "A hallucination; the model generated plausible-sounding but fabricated information, which could be discovered during reference or background checks and disqualify the candidate",
          "A prompt injection; a malicious third party inserted false claims into the model's output",
          "A confidence error; the model overstated the applicant's experience based on correct but ambiguous information in the prompt"
        ],
        correctIndex: 1,
        explanation: "Hallucinations are a well-known generative AI failure mode where the model invents factual-sounding content. In job applications, fabricated credentials can lead to disqualification or termination if discovered post-hire."
      },
      {
        text: "A nonprofit wants to deploy a generative AI writing assistant for all clients without any human review step to maximize efficiency. What is the MOST important risk of removing the human review step?",
        options: [
          "The AI will generate too many cover letters and overwhelm employer email inboxes",
          "Without human review, fabricated claims, inappropriate tone, and factual errors will reach employers unchecked—potentially damaging client credibility and the organization's reputation",
          "The cost of API calls to the AI service will exceed the nonprofit's budget",
          "Clients will become dependent on AI writing and lose their own communication skills over time"
        ],
        correctIndex: 1,
        explanation: "Human review is the critical safeguard that catches hallucinations, tone problems, and inaccuracies before they cause harm. Removing it entirely trades efficiency for reliability in a high-stakes context."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-4",
    courseSlug: "ai-dev-course-4",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Generative AI: Prompt Engineering Basics",
    missionName: "Data Detective",
    missionTagline: "Prove you can write prompts that get reliable, useful AI outputs",
    primaryAxis: "Analytics",
    skillLabels: ["Prompt engineering", "Few-shot prompting", "LLM behavior", "Data analysis", "Critical thinking"],
    scenarioPrompt: "You are building an internal tool that uses an LLM to classify customer support tickets into categories (billing, technical, general). Your first prompt returns inconsistent results—sometimes the model returns a category name, sometimes a full sentence, sometimes 'I am not sure.' Using your prompt engineering skills from this course, describe how you would redesign the prompt to get consistent, structured output.",
    evidenceHint: "A strong response uses few-shot examples showing the exact expected output format, adds an explicit instruction to return only the category name, and considers adding a system prompt or output constraint.",
    quizQuestions: [
      {
        text: "An LLM is asked to summarize customer complaints but frequently includes its own opinions about the company's service quality. Which prompt technique MOST directly addresses this?",
        options: [
          "Ask the model to summarize in fewer words so it has less room to add opinions",
          "Add an explicit instruction in the prompt: 'Summarize only the content of the complaint. Do not evaluate, judge, or add commentary about the company or its service.'",
          "Use a different LLM provider since opinion injection is a model-specific bug",
          "Lower the model's temperature setting to reduce creative output"
        ],
        correctIndex: 1,
        explanation: "LLMs follow instructions when they are explicit and specific. Adding a clear constraint about what NOT to include directly addresses the unwanted behavior more reliably than indirect approaches."
      },
      {
        text: "You need an LLM to extract the customer name, issue type, and urgency level from support emails and return them as JSON. Which prompt approach is MOST likely to produce consistent JSON output?",
        options: [
          "Ask the model to 'read this email and tell me the key information'",
          "Provide a few-shot example in the prompt showing an input email and the exact JSON output format expected, then present the new email to classify",
          "Instruct the model to 'output JSON' without specifying the field names and let it determine the structure",
          "Ask the model to summarize the email and then run a second model to convert the summary to JSON"
        ],
        correctIndex: 1,
        explanation: "Few-shot examples showing exact input/output pairs are the most reliable way to teach format consistency. Without an example, the model must infer the desired JSON structure, leading to variation."
      },
      {
        text: "A prompt returns correct answers 80% of the time but occasionally produces wrong category labels for tickets with ambiguous wording. Which change is MOST likely to improve accuracy on ambiguous cases?",
        options: [
          "Increase the max_tokens limit so the model has room to think through ambiguous cases",
          "Add chain-of-thought instructions asking the model to reason through the ticket's key phrases before stating the final category",
          "Remove the few-shot examples since they may be biasing the model on ambiguous inputs",
          "Run the same prompt five times and take the most frequent result as the answer"
        ],
        correctIndex: 1,
        explanation: "Chain-of-thought prompting improves accuracy on ambiguous inputs by directing the model to reason explicitly before concluding. This surfaces the reasoning process and reduces confident-but-wrong outputs."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-5",
    courseSlug: "ai-dev-course-5",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Python for Data Science, AI & Development",
    missionName: "Tech Builder",
    missionTagline: "Prove you can write Python to feed and query AI systems",
    primaryAxis: "Engineering",
    skillLabels: ["Python", "Pandas", "NumPy", "API calls", "Problem-solving"],
    scenarioPrompt: "Your AI team needs a Python script that loads a CSV of customer feedback, preprocesses it (remove nulls, strip whitespace from text), and sends each feedback entry as a prompt to an AI API, then saves the classification result to a new CSV. Describe the script logic and key functions you would use.",
    evidenceHint: "A strong response uses pandas read_csv/dropna/str.strip, a loop or apply to call the API with requests or an SDK, handles rate limiting with try/except, and writes results with to_csv.",
    quizQuestions: [
      {
        text: "A Python script calls an AI API in a loop over 10,000 rows and starts getting HTTP 429 (Too Many Requests) errors after 1,000 calls. What is the BEST fix?",
        options: [
          "Catch the 429 error and immediately retry the same request until it succeeds",
          "Implement exponential backoff—catch the 429, wait an increasing delay before retrying, and consider batching requests to stay within the API's rate limits",
          "Run multiple instances of the script simultaneously to distribute the load across different IP addresses",
          "Remove the error handling and let the script crash so the team can manually resume from the failure point"
        ],
        correctIndex: 1,
        explanation: "Exponential backoff is the standard rate-limit handling strategy. Immediate retries worsen the 429 problem; exponential delays give the API time to recover and respect the provider's terms of service."
      },
      {
        text: "A pandas DataFrame column containing customer feedback text has leading and trailing spaces in many entries, causing duplicate categories when grouping. Which code CORRECTLY cleans this column in place?",
        options: [
          "df['feedback'] = df['feedback'].strip()",
          "df['feedback'] = df['feedback'].str.strip()",
          "df['feedback'].apply(strip)",
          "df.strip('feedback')"
        ],
        correctIndex: 1,
        explanation: "pandas Series use the .str accessor to apply string methods element-wise. .strip() without .str only works on a plain Python string, not a pandas Series, and will raise an AttributeError."
      },
      {
        text: "After classifying 10,000 feedback entries with an AI API, you need to save the original text and the AI-assigned category to a new CSV file. Which pandas code is correct?",
        options: [
          "df[['feedback', 'category']].write_csv('results.csv')",
          "df[['feedback', 'category']].to_csv('results.csv', index=False)",
          "pd.save(df[['feedback', 'category']], 'results.csv')",
          "df.export('results.csv', columns=['feedback', 'category'])"
        ],
        correctIndex: 1,
        explanation: "DataFrame.to_csv() is the correct pandas method. index=False prevents an extra unnamed index column in the output file. The other options use non-existent methods."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-6",
    courseSlug: "ai-dev-course-6",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Developing AI Applications with Python and Flask",
    missionName: "Systems Pro",
    missionTagline: "Prove you can build and serve an AI-powered web application",
    primaryAxis: "Engineering",
    skillLabels: ["Flask", "REST APIs", "Python", "AI integration", "Problem-solving"],
    scenarioPrompt: "You are building a Flask API that accepts a job description as POST input, sends it to an AI API for skill extraction, and returns the extracted skills as JSON. Your manager asks how you will handle cases where the AI API is unavailable. Describe the Flask route structure and your error handling strategy.",
    evidenceHint: "A strong response defines a POST /extract-skills route, uses request.get_json() to parse input, wraps the AI API call in try/except, returns structured JSON with appropriate HTTP status codes (200, 500, 503), and describes a fallback or retry strategy.",
    quizQuestions: [
      {
        text: "A Flask route receives a POST request with JSON body { \"job_description\": \"...\" }. Which code correctly extracts the value?",
        options: [
          "data = request.args.get('job_description')",
          "data = request.get_json().get('job_description')",
          "data = request.form['job_description']",
          "data = request.body.json['job_description']"
        ],
        correctIndex: 1,
        explanation: "request.get_json() parses the JSON body of a POST request. request.args is for URL query parameters; request.form is for HTML form data; request.body does not exist in Flask."
      },
      {
        text: "A Flask AI application returns a 500 error when the upstream AI API is unavailable. A client retries immediately and keeps getting 500s. What should the API return instead to signal the client to retry later?",
        options: [
          "200 OK with an error message in the body so the client does not retry",
          "503 Service Unavailable with a Retry-After header indicating when the client should try again",
          "404 Not Found to indicate the AI service cannot be located",
          "400 Bad Request to indicate the client should reformulate its query"
        ],
        correctIndex: 1,
        explanation: "503 Service Unavailable is the correct HTTP status when a dependency is down. The Retry-After header gives clients a signal to back off rather than hammering a recovering service."
      },
      {
        text: "A Flask application stores the AI API key as a hardcoded string in the route handler code. Why is this a problem and how should it be fixed?",
        options: [
          "Hardcoded strings are slower to access than environment variables at runtime",
          "Hardcoded API keys get committed to version control, exposing them to anyone with repo access; keys should be loaded from environment variables using os.environ.get('AI_API_KEY')",
          "Flask route handlers do not support string variables; keys must be stored in a database",
          "The API key will expire faster if hardcoded because the provider detects static usage patterns"
        ],
        correctIndex: 1,
        explanation: "Hardcoded secrets in source code are a critical security vulnerability—they end up in git history and CI logs. Environment variables keep secrets out of code and allow rotation without code changes."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-7",
    courseSlug: "ai-dev-course-7",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Building Generative AI-Powered Applications with Python",
    missionName: "Code Architect",
    missionTagline: "Prove you can build production-ready generative AI features",
    primaryAxis: "Engineering",
    skillLabels: ["Generative AI integration", "LangChain", "Python", "RAG", "Problem-solving"],
    scenarioPrompt: "A workforce nonprofit wants a chatbot that answers questions about their programs using their own documentation, not just general knowledge from the model. You are building a Retrieval-Augmented Generation (RAG) pipeline in Python. Describe the architecture: how documents are ingested, how a user query triggers retrieval, and how the answer is generated.",
    evidenceHint: "A strong response describes embedding documents into a vector store, embedding the user query, retrieving the top-k relevant chunks, injecting them into a prompt context window, and generating a grounded answer.",
    quizQuestions: [
      {
        text: "A nonprofit deploys a RAG chatbot on their program documentation. A user asks about a program that was added to the docs last week but the chatbot says it does not exist. What is the MOST likely cause?",
        options: [
          "The LLM's training data does not include the new program information",
          "The new document was not re-ingested and re-embedded into the vector store after it was added, so it is not retrieved when relevant queries are made",
          "The vector store has a maximum document limit and rejected the new file",
          "The chatbot's context window is too small to include information about all programs simultaneously"
        ],
        correctIndex: 1,
        explanation: "RAG systems answer based on what is in the vector store, not the LLM's training data. New documents must be embedded and indexed into the vector store to become retrievable."
      },
      {
        text: "A RAG pipeline retrieves the top 5 document chunks most similar to a user query. The generated answer is sometimes wrong because the relevant information is in chunk 6. What is the BEST fix?",
        options: [
          "Increase the number of retrieved chunks (top-k) and tune chunk size so more context is available to the generator",
          "Ask users to rephrase their queries more precisely so the retriever finds the right chunks",
          "Switch to a more powerful LLM since the current model cannot reason across multiple chunks",
          "Manually curate the vector store to put the most important chunks first"
        ],
        correctIndex: 0,
        explanation: "Retrieval coverage is controlled by top-k and chunk size. Increasing top-k retrieves more candidates; better chunking keeps related content together. Both improve retrieval recall before generation."
      },
      {
        text: "A generative AI application sends entire user conversations to an external LLM API, including sensitive personal details users share about their employment situation. What is the PRIMARY concern?",
        options: [
          "The API calls will be slow because longer conversations take more time to process",
          "Sending sensitive personal data to a third-party API without user consent or data processing agreements may violate privacy regulations like GDPR and expose the organization to legal liability",
          "The LLM may confuse personal details from one user's conversation with another user's session",
          "Longer prompts are more expensive, so the organization will face unexpected API costs"
        ],
        correctIndex: 1,
        explanation: "Transmitting personally identifiable information to external APIs triggers privacy and data protection obligations. Organizations must ensure data processing agreements are in place and that users have been informed."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-professional-developer-certificate-ibm:mission:ai-dev-course-8",
    courseSlug: "ai-dev-course-8",
    programSlug: "ai-professional-developer-certificate-ibm",
    programTitle: "AI Professional Practitioner Certificate",
    courseTitle: "Generative AI: Elevate your Software Development Career",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can use AI to accelerate your development workflow",
    primaryAxis: "Strategy",
    skillLabels: ["AI-assisted development", "Career strategy", "Code review", "Prompt engineering", "Communication"],
    scenarioPrompt: "A hiring manager asks how you use AI tools in your daily development workflow without becoming dependent on them or producing code you do not understand. Using your skills from this course, describe your approach to AI-assisted development and how you maintain and demonstrate your own engineering competency.",
    evidenceHint: "A strong response describes using AI for specific tasks (boilerplate, tests, debugging), always reviewing and understanding generated code before committing, and names a scenario where you would not trust AI output without additional validation.",
    quizQuestions: [
      {
        text: "A developer uses an AI coding assistant to generate a database query. The AI produces working code but the developer does not understand how it works. What is the PRIMARY risk of committing this code?",
        options: [
          "The AI-generated code may be slower than hand-written code due to suboptimal query structure",
          "If the code breaks in production, the developer cannot debug it, explain it in a code review, or safely modify it—creating a maintenance liability",
          "The code may contain comments in a different language than the rest of the codebase",
          "AI-generated code has a different license than the project and may cause legal issues"
        ],
        correctIndex: 1,
        explanation: "Code you do not understand is code you cannot maintain or debug. AI-assisted development requires the developer to read and comprehend every line before committing—otherwise technical debt accumulates rapidly."
      },
      {
        text: "An AI coding assistant suggests a solution that passes all unit tests but a senior developer reviews it and says the approach will cause performance problems at scale. What does this reveal about AI-assisted development?",
        options: [
          "AI tools are unreliable and should not be used for production code",
          "AI tools optimize for passing the tests and constraints it is given; they cannot fully reason about system-wide performance characteristics, architecture constraints, or non-functional requirements without explicit guidance",
          "The unit tests are insufficient and should include performance benchmarks",
          "The senior developer is being overly critical since the code passes all defined tests"
        ],
        correctIndex: 1,
        explanation: "AI assistants excel at local correctness but lack full system context. Human review catches architectural concerns, performance implications, and design trade-offs that unit tests do not cover."
      },
      {
        text: "A developer wants to use an AI tool to write the security-critical authentication logic for their application. What is the MOST responsible approach?",
        options: [
          "Use the AI output directly since authentication is a well-documented domain and AI models have seen many implementations",
          "Use a well-audited authentication library instead of custom code; if AI suggestions inform the implementation, have a security engineer review every line against relevant security standards before deployment",
          "Avoid AI tools entirely for security code and write it manually from scratch",
          "Generate the authentication code with AI and add extra logging so any security issues can be detected after deployment"
        ],
        correctIndex: 1,
        explanation: "Security-critical code requires expert review regardless of its source. Using established libraries reduces risk; when custom logic is unavoidable, a security review is non-negotiable—AI-generated or not."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 7: Data Science Professional Certificate (IBM) ──────────────

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-1",
    courseSlug: "data-science-course-1",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "What is Data Science?",
    missionName: "Research Analyst",
    missionTagline: "Prove you can explain what data science does in plain language",
    primaryAxis: "Research",
    skillLabels: ["Data science overview", "Career paths", "Analytical thinking", "SQL", "Communication"],
    scenarioPrompt: "You are at a career fair and a company representative asks you to explain, in two minutes, what data science is, how it differs from data analytics, and what kind of business problems it is best suited to solve. Using your foundations from What is Data Science, give your answer.",
    evidenceHint: "A strong response distinguishes data science (predictive modeling, ML) from data analytics (descriptive reporting), names two concrete business applications (e.g., churn prediction, fraud detection), and honestly states a limitation or challenge.",
    quizQuestions: [
      {
        text: "A business analyst produces monthly sales reports showing what happened last quarter. A data scientist builds a model that predicts which customers will stop buying next month. What is the KEY difference between these roles?",
        options: [
          "The analyst uses Excel while the data scientist uses Python—the tools define the roles",
          "The analyst produces descriptive insights about past events; the data scientist builds predictive models that forecast future outcomes to enable proactive decisions",
          "The data scientist's work is more accurate because machine learning models are more reliable than manual reports",
          "Both roles are essentially the same; the title difference is purely organizational"
        ],
        correctIndex: 1,
        explanation: "The fundamental distinction is descriptive (what happened) versus predictive (what will happen). Data science adds the predictive and prescriptive dimensions that go beyond traditional analytics reporting."
      },
      {
        text: "A startup has six months of customer data and wants to build an AI system to predict which product features will drive the most revenue growth. A data scientist reviews the request. What is the MOST important concern to raise first?",
        options: [
          "The data science team needs more powerful computing hardware before starting this project",
          "Six months of data may be insufficient to train a reliable predictive model, especially if seasonal patterns exist; more data collection time or alternative analytical approaches may be needed",
          "Revenue prediction is an analytics problem, not a data science problem, so the wrong team was assigned",
          "The product team should define features first, then the data scientist can confirm revenue impact after launch"
        ],
        correctIndex: 1,
        explanation: "Data quality and quantity are the foundation of any data science project. Insufficient historical data leads to unreliable models—raising this concern early prevents wasted effort."
      },
      {
        text: "A hospital wants to use data science to reduce patient readmissions. A data scientist proposes building a model that flags high-risk patients for extra follow-up care. What type of problem is this?",
        options: [
          "An unsupervised clustering problem—grouping patients by similarity without a defined outcome",
          "A supervised binary classification problem—using historical patient data with known readmission outcomes to train a model that predicts readmission risk for new patients",
          "A natural language processing problem—analyzing doctor's notes to find patterns in language",
          "A time series forecasting problem—predicting the total number of readmissions per week"
        ],
        correctIndex: 1,
        explanation: "Predicting a binary outcome (readmitted or not) using historical labeled data is a classic supervised classification problem. The model learns from past cases to classify future patients."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-2",
    courseSlug: "data-science-course-2",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Tools for Data Science",
    missionName: "Tech Builder",
    missionTagline: "Prove you know which tool to use for each stage of data work",
    primaryAxis: "Engineering",
    skillLabels: ["Jupyter Notebooks", "Python", "R", "SQL", "Problem-solving"],
    scenarioPrompt: "A new data scientist on your team asks which tools they should learn first and how those tools connect in a typical project workflow. Using your Tools for Data Science knowledge, walk them through the toolchain from data ingestion through model development and sharing.",
    evidenceHint: "A strong response covers SQL for data access, Python/pandas for processing, Jupyter for exploration and documentation, a visualization library, and explains how each tool fits a specific phase of the workflow.",
    quizQuestions: [
      {
        text: "A data scientist is exploring a new dataset and wants to write code, see output immediately, add narrative explanations, and share the analysis as a document with their team. Which tool is BEST suited for this workflow?",
        options: [
          "A plain Python script (.py file) run from the command line",
          "A Jupyter Notebook, which combines executable code cells, inline output, and markdown narrative in a single shareable document",
          "A SQL client connected directly to the database",
          "A spreadsheet application like Excel or Google Sheets"
        ],
        correctIndex: 1,
        explanation: "Jupyter Notebooks are the standard tool for exploratory data analysis because they combine code execution, immediate output display, and narrative documentation in one shareable artifact."
      },
      {
        text: "A data scientist needs to join three large database tables, filter rows based on date ranges, and aggregate the result before loading it into Python for modeling. Which tool should handle this step?",
        options: [
          "Load all three tables into Python DataFrames and perform all joins and filtering in pandas",
          "Use SQL to perform the joins, filtering, and aggregation directly in the database before loading only the needed result into Python",
          "Use R's dplyr to connect to the database and process the tables",
          "Export all three tables to CSV files and merge them manually in Excel"
        ],
        correctIndex: 1,
        explanation: "SQL databases are optimized for set operations like joins, filters, and aggregations on large tables. Doing this work in the database before loading into Python is faster and uses less memory."
      },
      {
        text: "A data science team's Jupyter Notebooks are stored only on individual laptops. A critical analysis cannot be reproduced because the original analyst left the company. What practice would have prevented this?",
        options: [
          "Notebooks should be printed to PDF regularly so a paper copy is always available",
          "Version-controlling notebooks in a shared Git repository so the code, environment specifications, and analysis history are accessible to the whole team",
          "Each analyst should email their latest notebook to the team lead at the end of each week",
          "Notebooks should be rewritten as Python scripts before being shared since scripts are more reproducible"
        ],
        correctIndex: 1,
        explanation: "Version control in a shared repository is the standard practice for reproducibility and knowledge continuity. It ensures the full history of the analysis is preserved and accessible to the team."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-3",
    courseSlug: "data-science-course-3",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Data Science Methodology",
    missionName: "Discovery Expert",
    missionTagline: "Prove you can follow a structured methodology from problem to solution",
    primaryAxis: "Research",
    skillLabels: ["CRISP-DM", "Problem framing", "Hypothesis testing", "Analytical thinking", "Communication"],
    scenarioPrompt: "A hospital administrator wants to know why their patient satisfaction scores dropped 12% over the past year. You are leading the data science investigation. Using the CRISP-DM methodology covered in this course, walk through the first three phases of your approach and explain what you would deliver at the end of each phase.",
    evidenceHint: "A strong response names and correctly describes the Business Understanding, Data Understanding, and Data Preparation phases of CRISP-DM, specifies what artifact or decision each phase produces, and explains how the phases inform each other.",
    quizQuestions: [
      {
        text: "A data scientist jumps directly from receiving a business problem to building a predictive model without exploring the available data first. Which CRISP-DM phase did they skip and what risk does this create?",
        options: [
          "They skipped the Deployment phase; the model may not work in the production environment",
          "They skipped the Data Understanding phase; without exploring data quality, distributions, and gaps, the model may be built on assumptions that the data does not support",
          "They skipped the Evaluation phase; the model's accuracy cannot be verified without prior data exploration",
          "They skipped the Business Understanding phase; the model may solve the wrong problem"
        ],
        correctIndex: 1,
        explanation: "Data Understanding reveals whether the available data can actually answer the business question. Skipping it leads to models built on incomplete or unsuitable data discovered only after significant development effort."
      },
      {
        text: "During the Data Preparation phase of a CRISP-DM project, an analyst finds that 40% of records in the key target variable column are missing. What is the MOST important action?",
        options: [
          "Proceed with the 60% of complete records since that is a sufficient sample size for most models",
          "Investigate why 40% of values are missing before deciding whether to impute, exclude, or obtain the missing data—since the missingness pattern itself may be analytically meaningful",
          "Impute all missing values with the column mean to preserve the full dataset size",
          "Drop the target variable column and find an alternative proxy variable for the analysis"
        ],
        correctIndex: 1,
        explanation: "40% missing data on the target variable is critical. The pattern of missingness (random vs. systematic) determines the right strategy. Blindly imputing or dropping can introduce severe bias into the model."
      },
      {
        text: "After completing a data science project and deploying a model, the team moves on to the next project. Six months later, the model's predictions deteriorate. What CRISP-DM principle did they overlook?",
        options: [
          "The Modeling phase should have included a wider variety of algorithms to ensure one remained accurate over time",
          "CRISP-DM is a cyclical process; the Evaluation and Deployment phases include ongoing monitoring and re-evaluation, with the expectation of iterating back through the cycle as business conditions change",
          "The Business Understanding phase did not specify a model lifespan, so the team had no obligation to maintain it",
          "The Data Preparation phase should have included future data to make the model forward-looking"
        ],
        correctIndex: 1,
        explanation: "CRISP-DM's cyclical nature means deployment is not the end. Models require ongoing monitoring and retraining as data distributions and business contexts evolve—treating deployment as final is a common mistake."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-4",
    courseSlug: "data-science-course-4",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Python for Data Science, AI & Development",
    missionName: "Code Architect",
    missionTagline: "Prove you can write Python to handle real data science tasks",
    primaryAxis: "Engineering",
    skillLabels: ["Python", "Pandas", "NumPy", "Data manipulation", "Problem-solving"],
    scenarioPrompt: "You receive a dataset of hospital patient records with columns for age, diagnosis, length_of_stay, and readmitted. The age column has some string values ('unknown') mixed with integers, and length_of_stay has negative values that appear to be errors. Describe the Python/pandas code approach you would take to clean and prepare this data for modeling.",
    evidenceHint: "A strong response replaces 'unknown' with NaN using replace or where, converts the column to numeric with pd.to_numeric(errors='coerce'), filters out negative length_of_stay, and checks shape before and after.",
    quizQuestions: [
      {
        text: "A NumPy array contains patient ages: [25, 34, -1, 67, 999, 42]. Which values are MOST suspicious as data entry errors and what is the appropriate initial response?",
        options: [
          "All values appear valid; medical datasets sometimes include placeholder codes like -1 and 999",
          "-1 and 999 are suspicious as likely sentinel values or entry errors; investigate the data dictionary to confirm their meaning before deciding whether to treat them as missing or remove them",
          "Remove -1 immediately since age cannot be negative, and keep 999 since it may represent a patient over 100",
          "Replace all suspicious values with the array mean to preserve dataset size"
        ],
        correctIndex: 1,
        explanation: "Sentinel values like -1 and 999 are common in healthcare data as null indicators or system codes. Removing them before understanding their meaning may eliminate valid records or required coding conventions."
      },
      {
        text: "A pandas DataFrame column 'age' contains a mix of integers and the string 'unknown'. You run df['age'].mean() and get a TypeError. What is the correct fix?",
        options: [
          "Filter out all rows where age is not an integer before calculating the mean",
          "Use pd.to_numeric(df['age'], errors='coerce') to convert the column, which turns 'unknown' into NaN, then call .mean() which automatically skips NaN values",
          "Use df['age'].astype(int) to force all values to integers, which will convert 'unknown' to 0",
          "Replace 'unknown' with 0 using df['age'].replace('unknown', 0) before calculating the mean"
        ],
        correctIndex: 1,
        explanation: "pd.to_numeric with errors='coerce' is the clean solution—it converts valid numbers and silently turns non-numeric strings into NaN. The .mean() method skips NaN by default, giving a correct result."
      },
      {
        text: "You need to create a new binary column 'high_risk' that is 1 if length_of_stay > 7 and readmitted == 1, and 0 otherwise. Which pandas code is correct?",
        options: [
          "df['high_risk'] = df['length_of_stay'] > 7 and df['readmitted'] == 1",
          "df['high_risk'] = ((df['length_of_stay'] > 7) & (df['readmitted'] == 1)).astype(int)",
          "df['high_risk'] = df.apply(lambda x: 1 if x.length_of_stay > 7 and x.readmitted == 1)",
          "df['high_risk'] = df[df['length_of_stay'] > 7 & df['readmitted'] == 1]"
        ],
        correctIndex: 1,
        explanation: "Element-wise boolean operations on pandas Series require & (not Python's and) and parentheses around each condition. .astype(int) converts True/False to 1/0. The other options use Python scalars or invalid syntax."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-5",
    courseSlug: "data-science-course-5",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Python Project for Data Science",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can complete an end-to-end Python data project",
    primaryAxis: "Analytics",
    skillLabels: ["Web scraping", "Pandas", "Data visualization", "Python", "Problem-solving"],
    scenarioPrompt: "You are building a stock price dashboard for a finance team. You need to pull historical price data using a Python library, clean it, and visualize price trends for two companies on the same chart. Describe the Python workflow you would use from data retrieval through the final chart.",
    evidenceHint: "A strong response uses yfinance or a similar API library for retrieval, pandas for cleaning and merging, and matplotlib or plotly for the dual-line chart with labeled axes and a legend.",
    quizQuestions: [
      {
        text: "You retrieved stock price data for two companies as separate DataFrames with different date ranges. You need to plot both on the same chart aligned by date. What is the BEST preparation step before plotting?",
        options: [
          "Plot both DataFrames on the same axes directly; matplotlib will align dates automatically",
          "Merge or align the two DataFrames on the date index so both series share the same date axis before plotting",
          "Resample both DataFrames to weekly frequency to reduce the number of data points",
          "Export both DataFrames to CSV and use Excel to create the combined chart"
        ],
        correctIndex: 1,
        explanation: "Plotting unaligned date series produces mismatched x-axis values. Merging on the date index (or aligning the index) ensures both lines correspond to the same dates on the chart."
      },
      {
        text: "A stock price DataFrame has a 'Date' column stored as strings. After plotting the data, the x-axis shows dates out of order. What is the BEST fix?",
        options: [
          "Sort the DataFrame by the 'Date' column alphabetically since date strings sort correctly in alphabetical order",
          "Convert the 'Date' column to datetime using pd.to_datetime(), set it as the DataFrame index, and sort the index before plotting",
          "Manually specify the x-axis tick positions and labels in matplotlib to force the correct order",
          "Add an integer sequence column and use it as the x-axis instead of the date strings"
        ],
        correctIndex: 1,
        explanation: "String dates sort lexicographically, not chronologically. Converting to datetime enables proper temporal sorting and allows matplotlib to correctly space and label date intervals on the x-axis."
      },
      {
        text: "Your stock dashboard shows a sharp price spike in a single day that appears to be a data error. The value is 10x higher than the surrounding days. What is the BEST approach before including it in a report?",
        options: [
          "Remove the data point since it is clearly an outlier that will distort trend analysis",
          "Cross-reference the value against another data source (e.g., financial news or a different API) to determine whether the spike reflects a real market event before deciding how to handle it",
          "Replace the spike value with the average of the surrounding five days to smooth the trend",
          "Keep the spike and add a footnote explaining that outliers exist in real-world financial data"
        ],
        correctIndex: 1,
        explanation: "Stock prices do have legitimate extreme moves (stock splits, merger announcements). Cross-referencing before removing protects against discarding valid data that represents a real and important market event."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-6",
    courseSlug: "data-science-course-6",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Databases and SQL for Data Science with Python",
    missionName: "Systems Pro",
    missionTagline: "Prove you can query databases to answer data science questions",
    primaryAxis: "Engineering",
    skillLabels: ["SQL", "Database querying", "Python DB integration", "Data analysis", "Problem-solving"],
    scenarioPrompt: "You are a data scientist at a healthcare organization. You need to query a patient database to find the average length of stay by diagnosis category for patients admitted in 2023, excluding records where length_of_stay is NULL or negative. Then you need to load the result into a pandas DataFrame for further analysis. Describe the SQL query and Python integration approach.",
    evidenceHint: "A strong response writes a SQL query with WHERE, GROUP BY, AVG, and a HAVING or WHERE to exclude nulls/negatives, then uses a Python DB library (like ibm_db or sqlalchemy) with pd.read_sql to load the result.",
    quizQuestions: [
      {
        text: "A data scientist writes a SQL query that joins a patients table to a diagnoses table and returns 50,000 rows. They load the entire result into a pandas DataFrame. The query runs in 2 seconds but the Python processing takes 3 minutes. What is the BEST optimization?",
        options: [
          "Add more RAM to the Python server so it can process larger DataFrames faster",
          "Push more aggregation and filtering into the SQL query so Python receives a smaller, pre-processed result—databases are optimized for these operations at scale",
          "Switch from pandas to a faster DataFrame library like polars",
          "Run the SQL query in parallel threads to retrieve data faster"
        ],
        correctIndex: 1,
        explanation: "Databases are purpose-built for filtering, joining, and aggregation at scale. Moving more work into SQL reduces the data transferred to Python and eliminates redundant in-memory processing."
      },
      {
        text: "You need to find all patients where the admission date is in 2023 AND the diagnosis is either 'pneumonia' OR 'sepsis'. Which SQL WHERE clause is correct?",
        options: [
          "WHERE YEAR(admission_date) = 2023 AND diagnosis = 'pneumonia' OR diagnosis = 'sepsis'",
          "WHERE YEAR(admission_date) = 2023 AND (diagnosis = 'pneumonia' OR diagnosis = 'sepsis')",
          "WHERE YEAR(admission_date) = 2023 OR diagnosis IN ('pneumonia', 'sepsis')",
          "WHERE admission_date = 2023 AND diagnosis = 'pneumonia' AND diagnosis = 'sepsis'"
        ],
        correctIndex: 1,
        explanation: "Without parentheses around the OR clause, SQL evaluates AND before OR, making the first option return all 2023 pneumonia patients plus all sepsis patients regardless of year. Parentheses enforce the intended grouping."
      },
      {
        text: "A Python script uses string formatting to build a SQL query from user input: query = 'SELECT * FROM patients WHERE name = ' + user_input. A user enters '; DROP TABLE patients; --'. What is this attack called and how should it be prevented?",
        options: [
          "A buffer overflow attack; prevent it by limiting the length of user_input to 50 characters",
          "SQL injection; prevent it by using parameterized queries (e.g., cursor.execute('SELECT * FROM patients WHERE name = ?', [user_input])) which safely escape all user input",
          "A denial-of-service attack; prevent it by rate-limiting the number of database queries per user",
          "A privilege escalation attack; prevent it by running the database as a read-only user"
        ],
        correctIndex: 1,
        explanation: "SQL injection inserts malicious SQL through user input. Parameterized queries pass user input as a data value, not as part of the SQL structure, completely preventing the injection."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-7",
    courseSlug: "data-science-course-7",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Data Analysis with Python",
    missionName: "Data Detective",
    missionTagline: "Prove you can analyze data with pandas and draw valid conclusions",
    primaryAxis: "Analytics",
    skillLabels: ["Exploratory data analysis", "Pandas", "Correlation analysis", "Statistical thinking", "Problem-solving"],
    scenarioPrompt: "You are analyzing a dataset of used cars to help an auto dealer understand what factors most influence price. The dataset has columns for make, year, mileage, condition, and sale_price. Describe how you would use pandas to explore this dataset and identify the key drivers of price.",
    evidenceHint: "A strong response uses describe() for summary statistics, value_counts() for categoricals, correlation matrix or corr() for numeric relationships, and scatter plots or groupby means to identify the strongest price predictors.",
    quizQuestions: [
      {
        text: "A pandas corr() matrix shows that mileage has a correlation of -0.78 with sale_price. What does this mean in plain language for the auto dealer?",
        options: [
          "Cars with higher mileage tend to sell for higher prices—the negative sign indicates the scale is inverted",
          "There is a strong negative linear relationship: as mileage increases, sale price tends to decrease significantly—high mileage is one of the strongest predictors of lower price in this dataset",
          "Mileage and price are unrelated since a correlation below -1 is invalid",
          "78% of the variation in sale price is explained by mileage alone"
        ],
        correctIndex: 1,
        explanation: "A correlation of -0.78 indicates a strong negative relationship. The value does not mean 78% of variance is explained (that would be R²); it means that higher mileage strongly tends to correspond with lower prices."
      },
      {
        text: "A data analyst groups used car data by 'condition' (Excellent, Good, Fair, Poor) and calculates the mean sale price for each group. The results show Excellent averages $18,000 and Poor averages $6,000. A manager asks if this proves condition causes higher prices. What is the MOST accurate response?",
        options: [
          "Yes, the analysis proves that improving a car's condition will increase its sale price",
          "The analysis shows a strong association between condition and price, but correlation does not imply causation—other factors like age and make also correlate with both condition and price",
          "No conclusion can be drawn from group means alone; only regression analysis is valid for price analysis",
          "The result is misleading because mean is skewed by outliers; median should be used instead"
        ],
        correctIndex: 1,
        explanation: "Correlation and association do not establish causation. Confounding variables (older cars are often in poorer condition and worth less regardless of condition) must be controlled before claiming condition causes price differences."
      },
      {
        text: "A used car dataset has 15,000 rows. df.describe() shows the 'year' column has a minimum value of 1900. The data is supposed to contain only cars from 1990 onward. What action should be taken?",
        options: [
          "Keep the 1900 value since vintage cars are a valid part of the used car market",
          "Filter the DataFrame to remove records with year < 1990, then re-run describe() to verify the range is now correct before proceeding with analysis",
          "Replace all year values below 1990 with the median year to preserve row count",
          "Treat the 1900 value as a rounding error and round all year values up to the nearest decade"
        ],
        correctIndex: 1,
        explanation: "A minimum year of 1900 in a 1990+ dataset signals a data quality problem—likely a default value or entry error. Removing out-of-scope records and validating the fix maintains analytical integrity."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-8",
    courseSlug: "data-science-course-8",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Data Visualization with Python",
    missionName: "Design Thinker",
    missionTagline: "Prove you can turn Python analysis into clear, compelling visuals",
    primaryAxis: "Design",
    skillLabels: ["Matplotlib", "Seaborn", "Data storytelling", "Chart selection", "Communication"],
    scenarioPrompt: "You have completed an analysis showing that patient readmission rates vary significantly by age group and diagnosis category. Your hospital's executive team needs to understand the findings in a 5-minute briefing. Using your Python visualization skills, describe which charts you would build, what library you would use, and how you would make them executive-ready.",
    evidenceHint: "A strong response recommends a grouped bar chart or heatmap for the two-variable comparison, uses seaborn or matplotlib with appropriate labels/titles, reduces chart junk, and annotates the key insight directly on the chart.",
    quizQuestions: [
      {
        text: "You need to show how readmission rates differ across 5 age groups and 4 diagnosis categories simultaneously. Which visualization type BEST handles this two-variable comparison?",
        options: [
          "A pie chart for each diagnosis category showing the proportion of each age group",
          "A grouped bar chart or heatmap showing readmission rate at the intersection of each age group and diagnosis category",
          "A scatter plot with age on the x-axis and readmission rate on the y-axis, colored by diagnosis",
          "Five separate line charts—one per age group—each showing readmission rates by diagnosis"
        ],
        correctIndex: 1,
        explanation: "A grouped bar chart or heatmap directly encodes both variables in a single view, making comparisons between and within categories easy. Scatter plots lose categorical structure; separate charts require more cognitive work to compare."
      },
      {
        text: "A seaborn heatmap uses the default color gradient and an executive says they cannot tell the high values from the medium values. What is the BEST fix?",
        options: [
          "Add a data table next to the heatmap so exact numbers are always visible",
          "Switch to a diverging or sequential colormap with high contrast between extremes (e.g., 'YlOrRd'), annotate cells with the actual values using annot=True, and add a clear colorbar label",
          "Reduce the number of categories displayed so fewer cells need to be distinguished",
          "Export the heatmap to Excel and apply conditional formatting for better color control"
        ],
        correctIndex: 1,
        explanation: "A high-contrast colormap plus cell annotations (annot=True) makes heatmap values unambiguous for non-technical audiences. Relying on gradient alone for value discrimination is insufficient for executive presentations."
      },
      {
        text: "A matplotlib chart for the executive presentation has a title 'Figure 3', axis labels 'x' and 'y', a legend with entries 'Series1' and 'Series2', and six different colors with no explanation. What is the MOST critical improvement to make?",
        options: [
          "Change the chart type from a bar chart to a line chart for a more professional appearance",
          "Replace all placeholder labels with meaningful text: a descriptive title, labeled axes with units, and a legend that names what each series represents—so the chart communicates without additional explanation",
          "Remove the legend entirely and use a single color scheme to simplify the visual",
          "Add a caption below the chart explaining what Figure 3 represents in the broader report"
        ],
        correctIndex: 1,
        explanation: "A chart that requires external explanation to understand has failed its communication goal. Descriptive titles, labeled axes, and a meaningful legend make a chart self-explanatory—essential for executive audiences."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-9",
    courseSlug: "data-science-course-9",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Machine Learning with Python",
    missionName: "Analytics Pro",
    missionTagline: "Prove you can build, evaluate, and improve ML models",
    primaryAxis: "Analytics",
    skillLabels: ["Scikit-learn", "Model evaluation", "Classification", "Regression", "Problem-solving"],
    scenarioPrompt: "You are building a machine learning model to predict whether a job applicant will be hired based on resume features. Your first logistic regression model achieves 91% accuracy, but your manager flags that it only correctly identifies 23% of actual hires. Using your ML evaluation skills from this course, explain what is happening and what you would do to fix it.",
    evidenceHint: "A strong response identifies this as a class imbalance problem causing high accuracy but low recall, explains precision vs. recall trade-off, and recommends at least one fix: oversampling, class weights, or changing the decision threshold.",
    quizQuestions: [
      {
        text: "A model predicts loan default with 97% accuracy. Out of 1,000 test cases, only 30 are actual defaults. The model predicts 'no default' for all 1,000 cases. How is 97% accuracy possible and why is this model useless?",
        options: [
          "The 97% is a calculation error; a model that never predicts defaults cannot have high accuracy",
          "Because 970 of 1,000 cases are non-defaults, predicting 'no default' for everything achieves 97% accuracy—but the model identifies zero actual defaults, making it worthless for its intended purpose",
          "The model is 97% accurate on non-defaults and should be combined with a separate model for defaults",
          "The model is overfit to the training data and should be retrained with more epochs"
        ],
        correctIndex: 1,
        explanation: "On imbalanced datasets, accuracy is misleading. A model that predicts only the majority class scores high on accuracy while completely failing on the minority class—the one that actually matters for the business problem."
      },
      {
        text: "A hiring model has high precision (when it predicts 'hire', it is usually right) but very low recall (it misses most good candidates). In a talent-scarce market, which metric should the team optimize for and why?",
        options: [
          "Precision, because making a wrong hire is more costly than missing a good candidate",
          "Recall, because missing qualified candidates means the company fails to fill roles—in a talent-scarce market, catching as many good candidates as possible is more important than avoiding every incorrect recommendation",
          "F1 score, because it always represents the best balance between precision and recall",
          "Accuracy, because it reflects overall model correctness across all predictions"
        ],
        correctIndex: 1,
        explanation: "The relative cost of false negatives versus false positives determines which metric to optimize. In a scarce talent market, missing good candidates (false negatives) is the costlier error—making recall the priority metric."
      },
      {
        text: "A data scientist splits a dataset into training and test sets, trains a model, and achieves 95% accuracy on both splits. A colleague suggests using cross-validation instead. Why?",
        options: [
          "Cross-validation trains more models simultaneously, completing the job faster",
          "A single train/test split can produce optimistic or pessimistic estimates depending on which rows happen to land in each split; k-fold cross-validation averages performance across multiple splits for a more reliable and stable estimate",
          "Cross-validation is required by sklearn and cannot be avoided in production workflows",
          "Cross-validation uses less memory than a single train/test split since it processes data in batches"
        ],
        correctIndex: 1,
        explanation: "A single split introduces variance based on which specific rows ended up in train vs. test. k-fold cross-validation reduces this variance by evaluating the model across k different splits and averaging the results."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "data-science-professional-certificate-ibm:mission:data-science-course-10",
    courseSlug: "data-science-course-10",
    programSlug: "data-science-professional-certificate-ibm",
    programTitle: "Data Science Professional Certificate",
    courseTitle: "Applied Data Science Capstone",
    missionName: "Data Detective",
    missionTagline: "Prove you can run a complete applied data science project",
    primaryAxis: "Analytics",
    skillLabels: ["End-to-end data science", "Model deployment", "Pandas", "Scikit-learn", "Communication"],
    scenarioPrompt: "You are presenting your applied data science capstone to a technical hiring panel. They ask you to walk through the complete project—from business problem through data collection, cleaning, modeling, evaluation, and findings—and explain the most important decision you made and why. Using the full methodology from this certificate, describe your project narrative.",
    evidenceHint: "A strong response covers all major phases, names specific tools and techniques used at each stage, identifies a key decision point with trade-off reasoning, and honestly discusses a limitation or what would be done differently.",
    quizQuestions: [
      {
        text: "During a capstone presentation a panel member asks: 'Your model performs well in your notebook. How would you deploy it so other teams can use it in production?' What demonstrates the strongest answer?",
        options: [
          "Explain that deployment is outside the scope of a data science role—it is the engineering team's responsibility",
          "Describe serializing the model with joblib or pickle, wrapping it in a Flask or FastAPI service that accepts inputs and returns predictions, containerizing it with Docker, and monitoring prediction quality post-deployment",
          "Share the Jupyter Notebook with the other team and walk them through running it manually when needed",
          "Export the model's predictions to a CSV file that other teams can reference for their specific use cases"
        ],
        correctIndex: 1,
        explanation: "Production deployment involves serialization, an API wrapper, containerization, and monitoring. A data scientist who understands this end-to-end path is significantly more valuable than one who stops at notebook-level analysis."
      },
      {
        text: "A capstone project uses a random forest model that achieves the best test accuracy. The interviewer asks: 'Why did you choose this model over simpler options like logistic regression?' Which answer demonstrates genuine model selection reasoning?",
        options: [
          "Random forests are always better than logistic regression because they are more advanced",
          "I compared both models on cross-validated performance metrics; random forest outperformed logistic regression on recall for the minority class, justifying the added complexity—though I noted that logistic regression would have been preferable if interpretability was a primary requirement",
          "I chose random forest because it was taught in the course and I was familiar with the implementation",
          "I tested all available sklearn classifiers and selected the one with the highest accuracy on the test set"
        ],
        correctIndex: 1,
        explanation: "Strong model selection reasoning compares options, names the specific metric that drove the choice, acknowledges trade-offs (accuracy vs. interpretability), and shows awareness that the 'best' model depends on context."
      },
      {
        text: "After completing a capstone, a reviewer notes that you evaluated the model only on the test set you created. They ask how you would validate it more rigorously before recommending production use. What is the BEST answer?",
        options: [
          "Run the model on the original training set to confirm it achieves similar accuracy",
          "Evaluate the model on a completely held-out external validation set—ideally data from a different time period or source—and perform error analysis on the cases it gets wrong to understand failure patterns",
          "Increase the test set size to 50% of the full dataset for a more comprehensive evaluation",
          "Submit the model to a Kaggle competition to benchmark its performance against other data scientists"
        ],
        correctIndex: 1,
        explanation: "External validation on out-of-distribution or time-shifted data is the most rigorous test of real-world performance. Error analysis on failures reveals systematic weaknesses that aggregate metrics hide."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 8: IT Support Professional Certificate (IBM) ────────────────

  {
    key: "it-support-professional-certificate-ibm:mission:it-support-course-1",
    courseSlug: "it-support-course-1",
    programSlug: "it-support-professional-certificate-ibm",
    programTitle: "IT Support Professional Certificate",
    courseTitle: "Introduction to Technical Support",
    missionName: "Support Hero",
    missionTagline: "Prove you can handle a help desk ticket from start to resolution",
    primaryAxis: "Service",
    skillLabels: ["Ticketing systems", "Customer communication", "Troubleshooting methodology", "Escalation", "Communication"],
    scenarioPrompt: "It is your first week on a help desk and a frustrated user calls saying their computer 'just stopped working.' They are a sales manager who has a client call in 20 minutes. Using the technical support principles from this course, describe how you would handle this call—from opening the ticket through diagnosis and resolution.",
    evidenceHint: "A strong response uses the 5-step troubleshooting methodology (Identify, Research, Plan, Test, Document), shows empathy for the urgency, asks targeted diagnostic questions, and explains when and how to escalate.",
    quizQuestions: [
      {
        text: "A help desk technician receives a ticket: 'My email isn't working.' Before suggesting any solutions, what is the MOST important first step?",
        options: [
          "Tell the user to restart their computer as that fixes most email problems",
          "Ask clarifying questions to define the exact problem: Is email not loading at all? Are they getting an error message? Can they access email on another device? When did it last work?",
          "Escalate immediately to the email administrator since email issues are Tier 2 problems",
          "Check the email server status page first since the issue is probably a server outage"
        ],
        correctIndex: 1,
        explanation: "Troubleshooting begins with fully defining the problem. 'Email isn't working' could mean a dozen different issues—clarifying questions narrow the scope and prevent wasted effort on the wrong solution."
      },
      {
        text: "A user calls frustrated because the same printer problem has been logged and 'fixed' three times in the past month. What does this repeat-ticket pattern indicate and what should the technician do?",
        options: [
          "The user is misusing the printer; they should receive retraining before another ticket is opened",
          "Previous fixes addressed the symptom but not the root cause; the technician should escalate to Tier 2 for a deeper investigation into why the fix is not permanent",
          "The printer should be replaced immediately since recurring issues always indicate hardware failure",
          "The ticketing system has a bug causing duplicate tickets; the three tickets are likely the same unresolved issue"
        ],
        correctIndex: 1,
        explanation: "Recurring tickets on the same issue signal a symptomatic fix that left the root cause unresolved. Escalation to a more experienced technician for root cause analysis breaks the cycle."
      },
      {
        text: "A user asks a help desk technician to share the fix they just applied so the user can 'do it themselves next time.' How should the technician respond?",
        options: [
          "Refuse to share the information since users performing their own repairs creates liability",
          "Provide a clear explanation of what was done and why, document the solution in the ticket for future reference, and note any steps that require IT access so the user understands what they can and cannot do independently",
          "Share only the steps that do not involve any IT-restricted systems or settings",
          "Redirect the user to the company's self-service IT portal and end the call"
        ],
        correctIndex: 1,
        explanation: "Empowering users with knowledge reduces repeat tickets and builds trust. Clear documentation of the fix in the ticket also builds the knowledge base for the entire support team."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-support-professional-certificate-ibm:mission:it-support-course-2",
    courseSlug: "it-support-course-2",
    programSlug: "it-support-professional-certificate-ibm",
    programTitle: "IT Support Professional Certificate",
    courseTitle: "Introduction to Hardware and Operating Systems",
    missionName: "Tech Builder",
    missionTagline: "Prove you can diagnose hardware and OS issues confidently",
    primaryAxis: "Engineering",
    skillLabels: ["Hardware components", "Operating systems", "Troubleshooting", "Windows", "Problem-solving"],
    scenarioPrompt: "A user reports that their Windows workstation is running extremely slowly, the fan is loud, and the system occasionally freezes. They have not installed any new software. Using your hardware and OS knowledge from this course, describe how you would diagnose this issue step by step.",
    evidenceHint: "A strong response checks Task Manager for CPU/RAM/disk usage, considers hardware causes (failing HDD, insufficient RAM, thermal throttling), mentions checking Event Viewer for errors, and explains when hardware replacement is the right call.",
    quizQuestions: [
      {
        text: "A Windows workstation runs slowly and Task Manager shows the physical memory usage is consistently at 95% with several applications open. What is the MOST likely root cause and appropriate fix?",
        options: [
          "The hard drive is failing; replace it with an SSD to improve system responsiveness",
          "The system has insufficient RAM for the user's workload; adding more RAM is the most direct solution, though closing unnecessary background applications can provide immediate temporary relief",
          "The CPU is throttling due to thermal issues; clean the cooling vents and reapply thermal paste",
          "The operating system has a memory leak; reinstalling Windows will resolve the high memory usage"
        ],
        correctIndex: 1,
        explanation: "Consistently maxed-out physical memory means the system is paging to disk, causing slowness. Adding RAM addresses the root cause. Closing apps helps temporarily but does not solve the underlying capacity problem."
      },
      {
        text: "A laptop runs hot and the CPU performance drops significantly under load—a phenomenon known as thermal throttling. What is the MOST likely hardware cause?",
        options: [
          "The battery is overcharging and generating excess heat that throttles the CPU",
          "The cooling system is obstructed or degraded—dust-blocked vents, a failing fan, or dried thermal paste between the CPU and heat sink is preventing heat from dissipating, causing the CPU to slow itself to avoid damage",
          "The CPU is defective and needs to be replaced with a higher-rated model",
          "The operating system power settings are configured to reduce performance when the battery level drops below 50%"
        ],
        correctIndex: 1,
        explanation: "Thermal throttling is a CPU self-protection mechanism triggered when cooling fails. Cleaning vents, replacing thermal paste, and ensuring the fan works are the standard hardware interventions."
      },
      {
        text: "A user's Windows computer shows a Blue Screen of Death (BSOD) with the error 'MEMORY_MANAGEMENT' twice this week. What does this error most likely indicate?",
        options: [
          "The user has too many browser tabs open and the operating system ran out of virtual memory",
          "There is likely a faulty RAM module or a RAM compatibility issue; running Windows Memory Diagnostic (mdsched.exe) is the appropriate first diagnostic step",
          "The hard drive is failing and Windows cannot access the page file stored on disk",
          "A recent Windows Update introduced a software bug that causes this error on certain hardware configurations"
        ],
        correctIndex: 1,
        explanation: "MEMORY_MANAGEMENT BSODs frequently indicate faulty RAM. Windows Memory Diagnostic tests RAM for errors without requiring additional tools—the standard first step before considering hardware replacement."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-support-professional-certificate-ibm:mission:it-support-course-3",
    courseSlug: "it-support-course-3",
    programSlug: "it-support-professional-certificate-ibm",
    programTitle: "IT Support Professional Certificate",
    courseTitle: "Introduction to Software, Programming, and Databases",
    missionName: "Systems Pro",
    missionTagline: "Prove you can support software and database issues at a help desk level",
    primaryAxis: "Engineering",
    skillLabels: ["Software troubleshooting", "Basic SQL", "Application support", "Problem-solving", "Communication"],
    scenarioPrompt: "A user submits a ticket saying their HR application crashes whenever they try to generate a report. Other users on the same team can generate reports without issues. Using your software support knowledge from this course, describe the troubleshooting steps you would take to isolate whether this is a user-specific issue, a software issue, or a database issue.",
    evidenceHint: "A strong response compares the affected user's configuration to working users', checks application logs for error messages, considers permissions or database query failures, and knows when to escalate to the application vendor.",
    quizQuestions: [
      {
        text: "An application crashes for one user but works for all other users on the same team. Which troubleshooting step BEST isolates whether the problem is user-specific or system-wide?",
        options: [
          "Reinstall the application on the affected user's machine immediately",
          "Log in to the application as the affected user on a different machine that works for others—if the crash follows the user account, the issue is profile or permissions-related; if not, it is local to their machine",
          "Ask the affected user to wait 24 hours to see if the problem resolves on its own",
          "Escalate to the application vendor immediately since crashes are always software bugs"
        ],
        correctIndex: 1,
        explanation: "Testing the user account on a known-good machine isolates the variable. If the problem follows the account, focus on permissions and profile settings. If the machine is the culprit, focus on local software or configuration."
      },
      {
        text: "An HR application generates reports by querying a database. A technician notices the error log says 'query timeout exceeded' when the crash occurs. What does this indicate?",
        options: [
          "The application has a bug in its report-generation code that should be fixed by the development team",
          "The database query underlying the report is taking too long to complete—possibly due to a missing index, a slow query, or database server load; the DBA should investigate the query performance",
          "The user's computer is too slow to handle the report generation and needs a hardware upgrade",
          "The database credentials stored in the application have expired and need to be renewed"
        ],
        correctIndex: 1,
        explanation: "A query timeout means the database operation exceeded the allowed time limit. This is a database performance issue—typically a missing index, a poorly written query, or high server load—requiring DBA investigation."
      },
      {
        text: "A user asks an IT support technician to give them direct database access so they can fix their own data entry errors. Why should this request be declined and what is the appropriate alternative?",
        options: [
          "Direct database access is technically difficult to set up and would take too long to configure",
          "Granting direct database access bypasses application-level validation and audit trails, creating data integrity and security risks; the correct path is using the application's built-in correction workflow or submitting a change request to the DBA",
          "The user likely does not have the SQL knowledge required to make safe changes directly",
          "Database access requires a paid license that the company may not have available"
        ],
        correctIndex: 1,
        explanation: "Application-level workflows enforce business rules and maintain audit logs. Direct database access bypasses these controls, risking data corruption and compliance violations—regardless of the user's intent."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-support-professional-certificate-ibm:mission:it-support-course-4",
    courseSlug: "it-support-course-4",
    programSlug: "it-support-professional-certificate-ibm",
    programTitle: "IT Support Professional Certificate",
    courseTitle: "Introduction to Networking and Storage",
    missionName: "Code Architect",
    missionTagline: "Prove you can diagnose basic network and storage problems",
    primaryAxis: "Engineering",
    skillLabels: ["Networking fundamentals", "TCP/IP", "Storage", "Troubleshooting", "Problem-solving"],
    scenarioPrompt: "Five employees in the same office report they cannot access the shared network drive, but internet access is working fine. One employee in a different part of the building can access the drive. Using your networking and storage knowledge from this course, describe your step-by-step troubleshooting approach.",
    evidenceHint: "A strong response uses ping to test connectivity to the file server, checks whether the issue is subnet/VLAN-related since one user can connect, verifies the file server is online, and checks share permissions.",
    quizQuestions: [
      {
        text: "Five users cannot access a network share but can browse the internet. One user in a different network zone can access the share. What is the MOST likely cause?",
        options: [
          "The file server is offline since five users are affected simultaneously",
          "The five affected users are likely on a different network segment or VLAN than the one user who can connect; a routing rule or firewall policy may be blocking access from their subnet to the file server",
          "The five users all have incorrect Windows credentials stored in Credential Manager",
          "The shared drive is full and rejecting new connections from users who last connected"
        ],
        correctIndex: 1,
        explanation: "When internet works but a specific internal resource does not, and the pattern follows a physical location or subnet, the issue is likely network segmentation—a VLAN, firewall rule, or routing policy blocking access from that segment."
      },
      {
        text: "A user reports their computer is very slow when saving files to the local hard drive. Task Manager shows disk usage at 100% during save operations. What is the MOST likely hardware cause?",
        options: [
          "The network connection to the file server is slow, causing a backup of pending saves",
          "A traditional spinning hard disk (HDD) under heavy load frequently saturates to 100% disk usage; replacing with an SSD would dramatically improve read/write performance",
          "The RAM is insufficient and Windows is using the hard drive as virtual memory (page file)",
          "The file system is corrupted and needs to be repaired using chkdsk"
        ],
        correctIndex: 1,
        explanation: "HDDs have mechanical limitations that cause 100% utilization under normal workloads. SSDs eliminate seek time and dramatically improve throughput—the most effective long-term fix for persistent disk saturation."
      },
      {
        text: "A network technician runs 'ping 192.168.1.50' from a user's computer and gets 'Request timed out.' The file server IP is 192.168.1.50. What does this result indicate?",
        options: [
          "The ping program is not installed on the user's computer and needs to be downloaded",
          "The computer cannot reach the file server at the IP level—either the server is offline, the IP is wrong, a firewall is blocking ICMP, or there is a routing problem between the computer and the server",
          "The file server is running but has rejected the connection because the user lacks permission",
          "The network cable is faulty since timeout errors only occur with physical connectivity problems"
        ],
        correctIndex: 1,
        explanation: "A ping timeout means no IP-level response reached the computer. The root cause could be the server being down, a wrong IP, a firewall blocking ICMP, or a routing failure—further diagnostic steps are needed to differentiate."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-support-professional-certificate-ibm:mission:it-support-course-5",
    courseSlug: "it-support-course-5",
    programSlug: "it-support-professional-certificate-ibm",
    programTitle: "IT Support Professional Certificate",
    courseTitle: "Introduction to Cybersecurity Essentials",
    missionName: "Help Desk Pro",
    missionTagline: "Prove you can handle security-related support requests safely",
    primaryAxis: "Service",
    skillLabels: ["Security awareness", "Password management", "Phishing response", "Endpoint security", "Communication"],
    scenarioPrompt: "A user calls the help desk saying they received an email claiming to be from IT asking them to click a link and reset their password immediately or their account will be locked. They clicked the link and entered their credentials before realizing it looked suspicious. Using your cybersecurity essentials knowledge, describe how you would handle this call.",
    evidenceHint: "A strong response immediately resets or disables the compromised account, reviews recent login activity for unauthorized access, initiates the incident response process, and provides the user with clear next steps and reassurance.",
    quizQuestions: [
      {
        text: "A user just entered their corporate credentials on what appears to be a phishing site. What is the SINGLE most time-critical action the help desk must take?",
        options: [
          "Run a malware scan on the user's computer to check for keyloggers",
          "Immediately reset or disable the compromised account to prevent attackers from using the stolen credentials before they can establish persistence",
          "Send a company-wide warning email about the phishing campaign",
          "Collect the phishing URL and submit it to the security team for analysis"
        ],
        correctIndex: 1,
        explanation: "The attacker now has valid credentials and every minute they remain active increases risk. Account reset or disablement is the single most time-critical containment action—everything else is secondary."
      },
      {
        text: "A user calls and says someone from 'IT Security' called them requesting their password to 'verify their account.' The caller knew the user's employee ID and manager's name. How should the help desk respond?",
        options: [
          "Confirm the user's identity and provide their account details to the caller if they call back through official channels",
          "Explain that IT will never ask for a password over the phone regardless of what information the caller knows; advise the user not to share any credentials and report the call as a social engineering attempt",
          "Ask the user to put the caller on hold while the help desk verifies the caller's employee ID",
          "Transfer the call directly to the security team and let them determine whether the caller is legitimate"
        ],
        correctIndex: 1,
        explanation: "Knowing a user's employee ID or manager's name does not authenticate a caller—that information is often available through LinkedIn or email directories. No legitimate IT team asks for passwords over the phone."
      },
      {
        text: "A user's laptop was lost on a business trip and it was not encrypted. The laptop contained customer contracts and employee records. What is the FIRST action the IT support team should take?",
        options: [
          "Order a replacement laptop and focus on restoring the user's productivity as quickly as possible",
          "Initiate the data breach response procedure: remotely wipe the device if MDM allows, notify the security team and management, and assess what regulated data may have been exposed for potential breach notification obligations",
          "Change the user's account passwords so the lost laptop cannot be used to access company systems",
          "Run a remote backup to ensure all files on the lost laptop are saved before the device is decommissioned"
        ],
        correctIndex: 1,
        explanation: "An unencrypted laptop with sensitive data is a reportable data breach event. Remote wipe, breach assessment, and notification obligations are all initiated simultaneously—not sequentially."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-support-professional-certificate-ibm:mission:it-support-course-6",
    courseSlug: "it-support-course-6",
    programSlug: "it-support-professional-certificate-ibm",
    programTitle: "IT Support Professional Certificate",
    courseTitle: "Introduction to Cloud Computing",
    missionName: "Systems Pro",
    missionTagline: "Prove you can support and explain cloud services to business users",
    primaryAxis: "Engineering",
    skillLabels: ["Cloud fundamentals", "SaaS/IaaS/PaaS", "Cloud troubleshooting", "Problem-solving", "Communication"],
    scenarioPrompt: "A department manager asks you to explain the difference between SaaS, PaaS, and IaaS in plain language, and to recommend which type is appropriate for three scenarios: a small team that wants to use cloud email, a startup that needs to host a custom web application, and a developer who needs a virtual machine to run tests. Using your cloud computing knowledge, walk through each scenario.",
    evidenceHint: "A strong response correctly maps SaaS (cloud email) → PaaS (custom web app hosting) → IaaS (virtual machine), explains the management responsibility each model places on the customer, and names a real example of each service type.",
    quizQuestions: [
      {
        text: "A company's cloud file storage service is unavailable due to an outage at the cloud provider. The company had no backup plan. Which cloud responsibility model principle did the company overlook?",
        options: [
          "The cloud provider is fully responsible for all data protection and the company has no obligations",
          "Under the shared responsibility model, the customer is responsible for data backup strategies even when using SaaS—the provider guarantees infrastructure uptime but not protection against data loss from outages",
          "Cloud providers guarantee 100% uptime under their SLAs so this outage is a breach of contract",
          "Backup is only necessary for on-premises systems; cloud data is automatically redundant"
        ],
        correctIndex: 1,
        explanation: "Cloud shared responsibility means customers own their data backup strategy. Provider SLAs cover infrastructure availability but do not protect against data loss scenarios the customer is responsible for preventing."
      },
      {
        text: "A developer needs to test a new application on a specific Linux distribution and kernel version. They need full control over the OS configuration. Which cloud service model is MOST appropriate?",
        options: [
          "SaaS — use a cloud-based development environment that handles OS management automatically",
          "IaaS — provision a virtual machine with the specific Linux distribution and kernel version required, giving full OS-level control",
          "PaaS — deploy to a cloud platform that manages the runtime environment on the developer's behalf",
          "FaaS — deploy the application as serverless functions that run without any OS management"
        ],
        correctIndex: 1,
        explanation: "IaaS provides virtual machines where the customer controls the OS, distributions, and all software installed. PaaS and SaaS abstract the OS layer away, making them unsuitable when specific OS configuration is required."
      },
      {
        text: "A cloud storage bucket containing sensitive employee records is publicly accessible on the internet due to a misconfigured permission setting. Who is responsible for this security failure?",
        options: [
          "The cloud provider, because they allowed the bucket to be made public",
          "The customer, because configuring access controls on cloud resources is a customer responsibility under the shared responsibility model—the provider supplies the tools, but the customer must configure them securely",
          "Both parties equally, since cloud security is always a joint responsibility with 50/50 liability",
          "Neither party, because misconfigured cloud storage is an industry-wide problem without a clear responsible party"
        ],
        correctIndex: 1,
        explanation: "Cloud shared responsibility assigns data and access configuration to the customer. The provider supplies the access control mechanisms; the customer is responsible for applying them correctly."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-support-professional-certificate-ibm:mission:it-support-course-7",
    courseSlug: "it-support-course-7",
    programSlug: "it-support-professional-certificate-ibm",
    programTitle: "IT Support Professional Certificate",
    courseTitle: "Technical Support Case Studies and Capstone Project",
    missionName: "Code Architect",
    missionTagline: "Prove you can resolve complex support cases from start to finish",
    primaryAxis: "Engineering",
    skillLabels: ["Case analysis", "Root cause analysis", "Documentation", "Problem-solving", "Communication"],
    scenarioPrompt: "You are presenting your capstone support case to a hiring panel at an IT services company. The case involved a recurring VPN authentication failure affecting remote employees on a specific ISP. Walk them through how you diagnosed the root cause, what you tried, what worked, and what you documented in the knowledge base.",
    evidenceHint: "A strong response demonstrates systematic diagnosis (eliminate variables, check logs, compare affected vs. unaffected users), names the specific root cause found, explains the fix and why it was permanent, and describes the knowledge article created.",
    quizQuestions: [
      {
        text: "During a support case investigation, every attempted fix resolves the problem temporarily but it returns within a week. What does this pattern most strongly indicate?",
        options: [
          "The support technician is incorrectly implementing the fixes and should be replaced",
          "The fixes are treating symptoms rather than the root cause; a structured root cause analysis is needed to identify and eliminate the underlying problem permanently",
          "The problem is caused by an external factor outside IT control, such as a vendor service outage",
          "The issue requires a hardware replacement since software fixes are clearly insufficient"
        ],
        correctIndex: 1,
        explanation: "Recurring issues after repeated fixes are the clearest signal of symptom-level repairs. Root cause analysis tools like the 5 Whys or fishbone diagram systematically trace symptoms back to the underlying cause."
      },
      {
        text: "You resolve a complex multi-day support case involving a VPN authentication issue. What is the MOST valuable thing you can do before closing the ticket?",
        options: [
          "Ask the user to complete a satisfaction survey so the ticket can be closed with a high rating",
          "Write a detailed knowledge base article documenting the symptoms, diagnostic steps taken, root cause identified, and resolution—so future technicians can resolve the same issue in minutes rather than days",
          "Notify your manager that you resolved the issue so it can be included in your performance review",
          "Close the ticket immediately so it does not negatively affect the team's average resolution time metric"
        ],
        correctIndex: 1,
        explanation: "Knowledge base documentation is the highest-value output of any complex case resolution. It multiplies the value of one technician's work by making the solution instantly available to the entire support team."
      },
      {
        text: "A capstone reviewer asks: 'Looking back at your VPN case, what would you do differently?' Which type of answer demonstrates the strongest professional growth?",
        options: [
          "Say the case was handled perfectly and there is nothing you would change",
          "Identify a specific decision point where earlier log collection or a different diagnostic sequence would have reduced the resolution time, and explain what you would do differently and why",
          "Acknowledge that the case was too difficult for your current skill level and you would escalate it faster next time",
          "Suggest that the company should invest in better monitoring tools so technicians do not need to diagnose manually"
        ],
        correctIndex: 1,
        explanation: "Reflective answers with specific improvements at identifiable decision points demonstrate analytical self-awareness. This is more compelling than false confidence, excessive humility, or deflecting to external factors."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 9: Project Management Professional Certificate (Microsoft) ───

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-1",
    courseSlug: "pm-course-1",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Project Management Foundations",
    missionName: "Project Commander",
    missionTagline: "Prove you understand the fundamentals of managing a project",
    primaryAxis: "Strategy",
    skillLabels: ["Project lifecycle", "Scope management", "Microsoft Project", "Stakeholder management", "Communication"],
    scenarioPrompt: "You are the project manager for a new employee onboarding system at a 200-person company. The HR director is the sponsor. Your first task is to define the project scope and create a project charter. Using your Project Management Foundations knowledge, describe what you would include in the charter and how you would prevent scope creep during the project.",
    evidenceHint: "A strong response includes the five elements of a project charter (objective, scope, deliverables, timeline, stakeholders/sponsor), explains the change control process as the mechanism for preventing scope creep, and names at least one technique for getting stakeholder sign-off.",
    quizQuestions: [
      {
        text: "A project manager's stakeholder keeps adding new feature requests after the project scope was formally agreed upon. What is the CORRECT process for handling these requests?",
        options: [
          "Accommodate all requests since stakeholder satisfaction is the primary goal of project management",
          "Log each request through the change control process, assess the impact on budget, schedule, and resources, and present the trade-offs to the sponsor before approving or rejecting the change",
          "Decline all new requests since the scope was already approved and changes are not permitted",
          "Add the requests to a future project backlog and commit to addressing them after the current project closes"
        ],
        correctIndex: 1,
        explanation: "Change control is the formal mechanism for handling scope additions. It ensures every change is evaluated for impact before commitment—preventing budget overruns and missed deadlines caused by unchecked scope creep."
      },
      {
        text: "A project manager is asked to deliver a new HR onboarding system in 3 months with a fixed budget of $50,000. Two weeks in, the engineering team says the minimum viable version requires 5 months and $80,000. What framework helps the PM navigate this constraint conflict?",
        options: [
          "The RACI matrix, which clarifies who is responsible for resolving the conflict",
          "The project management triple constraint (scope, schedule, cost): to fit the original budget and timeline, scope must be reduced—the PM should facilitate a conversation with the sponsor about which features can be deferred",
          "The critical path method, which will reveal which tasks can be compressed to meet the original timeline",
          "The stakeholder register, which identifies who has authority to approve additional budget"
        ],
        correctIndex: 1,
        explanation: "The triple constraint (scope-schedule-cost) defines the trade-off space. When two constraints are fixed, the third must flex. Reducing scope to fit fixed time and cost is the only mathematically sound option."
      },
      {
        text: "Near the end of a project, a stakeholder who was not involved in planning says they are unhappy with the deliverable because it does not meet their needs. What project management failure does this represent?",
        options: [
          "A quality failure—the project team did not build the product to specification",
          "A stakeholder identification and engagement failure—the affected stakeholder should have been identified and included in requirements gathering early in the project, not discovered at delivery",
          "A communication failure—the project manager should have sent weekly status updates to all company employees",
          "A scope creep failure—the stakeholder is attempting to add new requirements after project completion"
        ],
        correctIndex: 1,
        explanation: "Incomplete stakeholder identification is a root cause of project failures. A stakeholder register and systematic stakeholder analysis early in the project lifecycle prevents late-discovery of affected parties."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-2",
    courseSlug: "pm-course-2",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Initiating and Planning Projects",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can build a solid project plan before work begins",
    primaryAxis: "Strategy",
    skillLabels: ["Work breakdown structure", "Project planning", "Microsoft Project", "Resource planning", "Communication"],
    scenarioPrompt: "You have been asked to manage a 90-day website redesign project for a workforce training organization. The deliverables include a new information architecture, visual design, content migration, and launch. Using the planning skills from this course, describe how you would create a Work Breakdown Structure (WBS) and initial project schedule.",
    evidenceHint: "A strong response decomposes the project into 3-4 work packages (phases), lists 3+ tasks per work package, explains how the WBS feeds into the schedule and resource assignments, and identifies at least one dependency between tasks.",
    quizQuestions: [
      {
        text: "A project manager creates a schedule where content migration starts on the same day as the website launch. The content must be migrated BEFORE launch is possible. What type of dependency is being violated?",
        options: [
          "A resource dependency — the same team member cannot do both tasks simultaneously",
          "A finish-to-start dependency — content migration must finish before launch can start; scheduling them concurrently ignores this logical constraint",
          "A discretionary dependency — the project manager has chosen to overlap tasks to save time, which is a valid scheduling technique",
          "An external dependency — the content migration depends on a vendor who has not been contracted yet"
        ],
        correctIndex: 1,
        explanation: "Finish-to-start is the most common dependency type: Task B cannot start until Task A is complete. Violating logical dependencies produces schedules that cannot be executed as written."
      },
      {
        text: "A Work Breakdown Structure for a website redesign lists 'website' as a single task. Why is this insufficient and how should it be improved?",
        options: [
          "It is sufficient; a WBS only needs to list the final deliverable, and sub-tasks are managed separately in the schedule",
          "It is too vague to estimate, assign, or track; the WBS should decompose 'website' into discrete deliverables (e.g., information architecture, wireframes, visual design, content, testing, launch) until each component is small enough to estimate and assign to a single owner",
          "The task name should be more formal; renaming it 'Website Redesign Project Deliverable 1.0' satisfies WBS requirements",
          "A WBS should only contain tasks that take less than one day; 'website' should be split into hourly tasks"
        ],
        correctIndex: 1,
        explanation: "A WBS decomposes deliverables until each element is estimable, assignable, and trackable. Vague top-level entries cannot be scheduled, resourced, or monitored—they are project planning in name only."
      },
      {
        text: "A project manager discovers during planning that the only developer available for the website build is also assigned full-time to another project during the same period. What is this called and how should it be resolved?",
        options: [
          "A schedule conflict; resolve by asking both project managers to adjust their timelines simultaneously",
          "A resource over-allocation; resolve by negotiating with the other project manager and resource manager to either phase the work, bring in a contractor, or adjust one project's timeline",
          "A staffing shortage; the company should hire an additional developer before the project begins",
          "A risk item; log it in the risk register and address it only if the developer cannot complete both projects"
        ],
        correctIndex: 1,
        explanation: "Resource over-allocation is a planning failure that causes burnout and delays. It must be resolved during planning—not discovered during execution—through negotiation, phasing, or resource augmentation."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-3",
    courseSlug: "pm-course-3",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Project Scheduling and Cost Management",
    missionName: "Analytics Pro",
    missionTagline: "Prove you can keep a project on schedule and within budget",
    primaryAxis: "Analytics",
    skillLabels: ["Earned value management", "Critical path", "Budget tracking", "Microsoft Project", "Analytical thinking"],
    scenarioPrompt: "Your website redesign project is 6 weeks in. The planned budget for 6 weeks was $30,000 and you have spent $35,000. However, the work completed at this point was only valued at $25,000 of planned work. Using the Earned Value Management concepts from this course, calculate the cost variance and schedule variance, and explain what they mean.",
    evidenceHint: "A strong response calculates CV = EV - AC = $25K - $35K = -$10K (over budget) and SV = EV - PV = $25K - $30K = -$5K (behind schedule), explains the significance of each negative value, and recommends a corrective action.",
    quizQuestions: [
      {
        text: "A project has Planned Value (PV) of $40,000, Earned Value (EV) of $32,000, and Actual Cost (AC) of $38,000. What is the Schedule Performance Index (SPI) and what does it indicate?",
        options: [
          "SPI = 1.19, indicating the project is ahead of schedule",
          "SPI = EV/PV = 32,000/40,000 = 0.80, indicating the project is achieving only 80 cents of planned work for every dollar of work that should have been done by now—the project is behind schedule",
          "SPI = AC/EV = 38,000/32,000 = 1.19, indicating the project is over budget",
          "SPI = PV-EV = 8,000, indicating the project is $8,000 behind the plan"
        ],
        correctIndex: 1,
        explanation: "SPI = EV/PV measures schedule efficiency. A value below 1.0 means less work was completed than planned. SPI of 0.80 means the team is progressing at 80% of the planned rate—a significant schedule delay."
      },
      {
        text: "A project manager identifies that the critical path for a software launch runs through: Requirements (5d) → Design (3d) → Development (10d) → Testing (4d) → Launch. A stakeholder requests adding a 3-day UX review between Design and Development. What is the impact?",
        options: [
          "None — the UX review can run in parallel with Development without affecting the timeline",
          "The project end date moves out by 3 days because the UX review falls on the critical path between Design and Development",
          "The impact depends on whether any other path through the project is longer than the current critical path plus 3 days",
          "The impact is minimal since 3 days is only 13% of the development duration"
        ],
        correctIndex: 1,
        explanation: "Any task added to the critical path directly extends the project end date by its duration. Since the UX review falls between two critical path tasks, it adds 3 days to the total project duration."
      },
      {
        text: "At project midpoint, a PM calculates a Cost Performance Index (CPI) of 0.72. The original project budget was $100,000. What is the Estimate at Completion (EAC) using the most common formula?",
        options: [
          "EAC = $100,000 + actual overspend to date",
          "EAC = Budget at Completion / CPI = $100,000 / 0.72 ≈ $138,889, meaning the project is forecast to cost about $139,000 if the current spending rate continues",
          "EAC = $100,000 × 0.72 = $72,000, meaning the project will actually cost less than planned",
          "EAC cannot be calculated at midpoint; it requires data from the final week of the project"
        ],
        correctIndex: 1,
        explanation: "EAC = BAC / CPI is the standard forecast formula. A CPI of 0.72 means $0.72 of value is delivered per dollar spent—projecting a 39% cost overrun if the efficiency does not improve."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-4",
    courseSlug: "pm-course-4",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Managing Project Risks, Changes and Stakeholders",
    missionName: "Project Commander",
    missionTagline: "Prove you can identify risks and manage them before they become problems",
    primaryAxis: "Strategy",
    skillLabels: ["Risk management", "Change control", "Stakeholder engagement", "Problem-solving", "Communication"],
    scenarioPrompt: "You are managing a 6-month software implementation project. During a risk workshop, the team identifies three risks: (1) key developer may leave mid-project, (2) vendor may deliver integration specs late, (3) budget approval may be delayed. Using the risk management framework from this course, describe how you would assess, prioritize, and respond to each risk.",
    evidenceHint: "A strong response uses probability × impact to score each risk, assigns a risk owner, and names a specific response strategy for each (mitigate, transfer, avoid, accept) with a concrete action.",
    quizQuestions: [
      {
        text: "A project manager identifies that a key vendor has a history of late deliveries. This is a known risk. Which risk response strategy involves buying insurance or including penalty clauses in the vendor contract?",
        options: [
          "Avoid — restructuring the project to eliminate dependency on the vendor",
          "Transfer — shifting the financial consequence of the risk to a third party (the vendor) through contractual penalties or insurance",
          "Mitigate — reducing the probability of late delivery through closer vendor management",
          "Accept — acknowledging the risk and building a buffer into the schedule"
        ],
        correctIndex: 1,
        explanation: "Risk transfer moves the financial impact of a risk to another party. Contract penalty clauses transfer the cost of lateness to the vendor; insurance transfers financial loss to an insurer."
      },
      {
        text: "A risk register shows a risk with probability = low and impact = catastrophic (total project failure). Should this risk be deprioritized because its probability is low?",
        options: [
          "Yes — low probability risks can be accepted without active management since they are unlikely to occur",
          "No — catastrophic impact risks require response planning regardless of probability; the potential consequence is too severe to leave unmanaged even if occurrence is unlikely",
          "Yes — project managers have limited time and should focus on high-probability risks for maximum efficiency",
          "No — all risks in a risk register require equal attention regardless of probability or impact"
        ],
        correctIndex: 1,
        explanation: "Risk severity = probability × impact, but catastrophic-impact risks are treated as special cases. A low-probability, catastrophic-impact risk (sometimes called a 'black swan') warrants contingency planning because the consequences of occurrence are project-ending."
      },
      {
        text: "A project is 70% complete when a key stakeholder says they were never consulted about a critical design decision made in week 2. How should the project manager respond?",
        options: [
          "Proceed with the current design since rework at 70% completion would be too costly",
          "Acknowledge the engagement gap, assess the impact of the decision on the stakeholder's requirements, present options for addressing their concerns within current constraints, and update the stakeholder engagement plan to prevent future gaps",
          "Blame the project sponsor for not including the stakeholder in the original kickoff",
          "Add the stakeholder to all future communications and close the issue by saying they are now included"
        ],
        correctIndex: 1,
        explanation: "Late stakeholder discovery requires both immediate triage of the current impact and a systemic fix to the engagement process. Simply adding them to emails without addressing the unmet need does not resolve the underlying issue."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-5",
    courseSlug: "pm-course-5",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Project Leadership, Communication and Stakeholder Management",
    missionName: "Help Desk Pro",
    missionTagline: "Prove you can lead people and communicate to drive project success",
    primaryAxis: "Service",
    skillLabels: ["Leadership", "Stakeholder communication", "Conflict resolution", "Team motivation", "Communication"],
    scenarioPrompt: "You are managing a cross-functional project team of 6 people from three different departments. Two team members from different departments have a conflict about whose requirements take priority, causing the project to stall. Your sponsor asks you to resolve it by end of week. Using your leadership and communication skills from this course, describe how you would facilitate a resolution.",
    evidenceHint: "A strong response holds individual conversations first (to understand each perspective), then facilitates a structured joint meeting, grounds the decision in project objectives rather than departmental politics, and documents the agreed priority with sign-off.",
    quizQuestions: [
      {
        text: "Two team members disagree about which feature should be built first. The argument has escalated and they are no longer collaborating. As the project manager, what is the MOST effective first step?",
        options: [
          "Escalate to the sponsor immediately and ask them to make the decision",
          "Have individual conversations with each person to understand their perspective and concerns before bringing them together—this prevents defensive posturing in a group setting",
          "Hold a team meeting and ask everyone to vote on which feature to prioritize",
          "Make the decision yourself based on the project schedule and notify both parties of your decision"
        ],
        correctIndex: 1,
        explanation: "Shuttle diplomacy before mediation is a key conflict resolution technique. Individual conversations reveal the real concerns and interests behind positions, enabling a joint session to focus on solutions rather than winning arguments."
      },
      {
        text: "A weekly project status email has a 10% open rate from stakeholders. The sponsor says they are 'always surprised by news at steering committee meetings.' What communication failure does this represent?",
        options: [
          "Stakeholders are too busy to read project emails; this is an unavoidable aspect of stakeholder management",
          "The communication plan does not match stakeholder preferences—if email has low engagement, the PM should use the format, frequency, and channel that stakeholders actually respond to, and confirm information was received",
          "The status emails are too long; shortening them to one sentence will improve open rates",
          "Stakeholders should be required to confirm receipt of all project communications via their manager"
        ],
        correctIndex: 1,
        explanation: "A communication plan that is not working must be adapted. Stakeholder engagement requires using the channels and formats that actually reach people—not continuing an ineffective approach because it is convenient for the PM."
      },
      {
        text: "A project team member consistently misses deadlines but is the only person with expertise in a critical technical area. How should the project manager handle this?",
        options: [
          "Remove the team member from the project to protect the schedule and find a replacement",
          "Have a direct, private conversation to understand the cause of the missed deadlines, set clear expectations with agreed-upon milestones, offer support to address any blockers, and document the conversation—escalating only if the pattern continues",
          "Publicly assign the team member's tasks to a colleague in the next team meeting to create accountability",
          "Accept the missed deadlines since the team member's expertise makes them irreplaceable regardless of performance"
        ],
        correctIndex: 1,
        explanation: "Performance issues require direct, private, documented conversations before escalation. Understanding the root cause (overload, unclear expectations, personal issues) enables a targeted response rather than a punitive one."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-6",
    courseSlug: "pm-course-6",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Agile Project Management",
    missionName: "Operations Pro",
    missionTagline: "Prove you can run an agile team effectively",
    primaryAxis: "Strategy",
    skillLabels: ["Agile methodology", "Scrum", "Sprint planning", "Backlog management", "Communication"],
    scenarioPrompt: "Your organization wants to switch from waterfall to agile for a new mobile app development project. The product owner has a list of 50 potential features and no prioritization. Using your agile project management skills from this course, describe how you would help them build and prioritize the product backlog for the first sprint.",
    evidenceHint: "A strong response explains user story format (As a [user], I want [feature], so that [benefit]), describes prioritization by business value and dependencies, names a technique (MoSCoW or story points), and explains what makes a backlog item ready for a sprint.",
    quizQuestions: [
      {
        text: "A product owner writes a backlog item: 'Build the entire user authentication system.' A Scrum team says this is not ready to sprint. What is wrong with this item and how should it be fixed?",
        options: [
          "It is too technical; user stories should describe business outcomes without referencing technical implementation",
          "It is too large (an epic) and lacks detail, acceptance criteria, and a user perspective; it should be broken into smaller user stories like 'As a new user, I want to create an account with my email so I can access the app'—each small enough to complete in one sprint",
          "It should be written from the developer's perspective since developers are the ones building it",
          "It is fine as written; the team should estimate it in story points and plan accordingly"
        ],
        correctIndex: 1,
        explanation: "Large, vague items (epics) cannot be planned or completed in a sprint. User stories must be small, specific, written from a user perspective, and include acceptance criteria before they are considered sprint-ready."
      },
      {
        text: "During a sprint retrospective, three team members say the sprint goals were unclear and caused them to work on the wrong things for two days. What process improvement should the Scrum Master facilitate?",
        options: [
          "Add more sprint planning meetings to compensate for unclear goals in future sprints",
          "Improve sprint planning by ensuring the sprint goal is written, understood, and agreed upon by every team member before the sprint begins—and adding a Definition of Done review at the start",
          "Assign a single team member to clarify all ambiguities rather than discussing them as a team",
          "Shorten sprint duration from two weeks to one week so unclear goals have less time to cause damage"
        ],
        correctIndex: 1,
        explanation: "A clear, shared sprint goal is a Scrum prerequisite that prevents misdirected work. Retrospective findings should translate into specific, actionable process improvements—not abstract commitments to 'do better.'"
      },
      {
        text: "A team's velocity over the past 4 sprints was 32, 28, 35, and 30 story points. The product owner wants to commit to 45 story points in the next sprint to catch up with a delayed timeline. What should the Scrum Master advise?",
        options: [
          "Agree to 45 story points since the team has demonstrated they can work harder when needed",
          "Advise against overcommitting—the team's sustainable velocity is approximately 30-32 points; committing to 45 creates quality risk and will likely result in incomplete stories or technical debt",
          "Split the sprint into two parallel streams so different sub-teams can each deliver 22-23 points simultaneously",
          "Accept the commitment and add overtime hours to compensate for the increased workload"
        ],
        correctIndex: 1,
        explanation: "Velocity is a capacity planning tool, not a performance target to be inflated. Overcommitting beyond sustainable velocity reliably produces incomplete work, lower quality, and team burnout."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-7",
    courseSlug: "pm-course-7",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Microsoft Project & Power BI for Project Managers",
    missionName: "Code Architect",
    missionTagline: "Prove you can use Microsoft Project and Power BI to manage and report projects",
    primaryAxis: "Engineering",
    skillLabels: ["Microsoft Project", "Power BI", "Gantt charts", "Dashboard reporting", "Analytical thinking"],
    scenarioPrompt: "You are managing a 12-task project in Microsoft Project. Three tasks are on the critical path. You need to present a status dashboard to your sponsor using Power BI showing current schedule variance, budget variance, and critical path status. Describe how you would set up the Microsoft Project file and what visuals you would build in Power BI.",
    evidenceHint: "A strong response describes setting up task dependencies and baselines in MS Project, explains how to export data to Power BI, and names specific visuals (Gantt, KPI cards for SV/CV, table of critical path tasks) appropriate for a sponsor audience.",
    quizQuestions: [
      {
        text: "A project manager sets up a Microsoft Project schedule but forgets to save a baseline before work begins. Three weeks later the sponsor asks how the project compares to the original plan. What problem does the missing baseline cause?",
        options: [
          "Microsoft Project will crash if you try to compare current data without a baseline",
          "Without a baseline, Microsoft Project has no record of the original planned dates and costs to compare against—variance tracking, earned value calculations, and schedule comparison all become impossible",
          "The project manager can manually reconstruct the baseline from the original scope document",
          "The missing baseline only affects cost tracking; schedule variance can still be calculated without it"
        ],
        correctIndex: 1,
        explanation: "A saved baseline is the reference point for all variance tracking in Microsoft Project. Without it, the tool can only show current status—not how far the project has drifted from the original plan."
      },
      {
        text: "A Power BI dashboard for a sponsor shows 15 different project metrics on a single page. The sponsor says they cannot quickly tell whether the project is on track. What is the MOST likely design problem?",
        options: [
          "Power BI cannot display more than 10 metrics on a single page",
          "The dashboard lacks a clear visual hierarchy—the most critical status indicators (on-track/off-track, schedule variance, budget variance) should be surfaced prominently as KPI cards at the top, with detailed metrics available on drill-down",
          "The sponsor should receive a PDF report instead of an interactive dashboard",
          "The dashboard uses too many colors; a monochrome design would be easier to read"
        ],
        correctIndex: 1,
        explanation: "Executive dashboards must answer 'are we on track?' in under 5 seconds. A flat layout of 15 metrics forces the viewer to search for the most important information—visual hierarchy solves this."
      },
      {
        text: "You need to show a sponsor which tasks are on the critical path and their current status in a single Power BI visualization. Which combination of visuals BEST serves this need?",
        options: [
          "A pie chart showing the percentage of critical path tasks completed",
          "A Gantt-style bar chart or matrix filtered to critical path tasks showing planned vs. actual dates, combined with a KPI card showing whether the project end date has slipped",
          "A scatter plot with task duration on the x-axis and resource cost on the y-axis",
          "A card visual showing only the total number of critical path tasks"
        ],
        correctIndex: 1,
        explanation: "A Gantt-style visual shows schedule relationships and slippage visually; a KPI card provides the single most important signal (on-time or not). Together they give the sponsor both the summary and the detail they need."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "project-management-professional-certificate-microsoft:mission:pm-course-8",
    courseSlug: "pm-course-8",
    programSlug: "project-management-professional-certificate-microsoft",
    programTitle: "Project Management Professional Certificate",
    courseTitle: "Project Management Capstone",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can manage a project from initiation through close",
    primaryAxis: "Strategy",
    skillLabels: ["End-to-end project management", "Lessons learned", "Microsoft Project", "Stakeholder management", "Communication"],
    scenarioPrompt: "You are presenting your project management capstone to a certification panel. The project you managed was a 90-day operational process improvement initiative that came in 2 weeks late and 8% over budget. Walk the panel through the key decisions you made, what caused the variance, and what you would do differently.",
    evidenceHint: "A strong response acknowledges the variances honestly, traces them to specific root causes (underestimated risk, scope change, resource gap), names the lessons learned, and describes the specific process change you would implement on the next project.",
    quizQuestions: [
      {
        text: "A project came in 2 weeks late due to a vendor delivering integration specs 10 days after the agreed date. During the lessons learned session, a panelist asks: 'Was this risk identified before the project started?' The honest answer is no. What should the PM say?",
        options: [
          "Explain that vendor delays are impossible to predict and cannot be included in a risk register",
          "Acknowledge that vendor delivery risk was not formally identified, explain that past project patterns showed vendor reliability was a known variable that should have been assessed, and describe how the risk register process will be improved for future projects",
          "Attribute the delay entirely to the vendor and explain that the PM had no control over it",
          "Explain that the project was still within acceptable variance and the delay does not indicate a planning failure"
        ],
        correctIndex: 1,
        explanation: "Honest post-mortem analysis requires acknowledging what was missed in planning. Identifying the root cause of the gap (inadequate risk identification) and committing to a specific process improvement demonstrates professional maturity."
      },
      {
        text: "During project closeout, the sponsor asks the PM to archive all project documents for future reference. Which documents are MOST important to include for organizational learning?",
        options: [
          "The original project charter and final budget report only",
          "The risk register, lessons learned report, change log, final schedule vs. baseline comparison, and stakeholder feedback—together they provide the complete story of decisions made and outcomes achieved",
          "The project manager's personal notes and email correspondence with the team",
          "Only the final deliverable documentation; process artifacts are not useful after project close"
        ],
        correctIndex: 1,
        explanation: "Comprehensive project archives enable future project managers to learn from decisions, understand what risks materialized, and avoid repeating the same mistakes. Lessons learned and the change log are among the most valuable artifacts."
      },
      {
        text: "A sponsor says the project achieved all its deliverables but stakeholder satisfaction scores were lower than expected. What does this gap between deliverable completion and satisfaction most likely indicate?",
        options: [
          "The stakeholders have unrealistic expectations and the project should be considered a full success",
          "Deliverables were completed but stakeholder needs or expectations were not fully understood or managed—a gap between what was built and what stakeholders actually needed or expected throughout the project",
          "The satisfaction survey was flawed and does not reflect actual stakeholder sentiment",
          "Stakeholder satisfaction is not a valid project success metric and should be removed from future evaluations"
        ],
        correctIndex: 1,
        explanation: "Delivering scope on time and budget is necessary but not sufficient. Stakeholder satisfaction measures whether the project delivered value—a gap signals a requirements, communication, or expectation management failure."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 10: Digital Marketing & E-Commerce (Google) ─────────────────

  {
    key: "digital-marketing-e-commerce-google:mission:marketing-course-1",
    courseSlug: "marketing-course-1",
    programSlug: "digital-marketing-e-commerce-google",
    programTitle: "Digital Marketing & E-Commerce Professional Certificate",
    courseTitle: "Foundations of Digital Marketing and E-commerce",
    missionName: "Project Commander",
    missionTagline: "Prove you understand how digital marketing creates business value",
    primaryAxis: "Strategy",
    skillLabels: ["Digital marketing strategy", "Marketing funnel", "E-commerce fundamentals", "Analytics", "Communication"],
    scenarioPrompt: "A local retail shop wants to start selling online and reach new customers through digital marketing. They have a $2,000/month budget and no existing digital presence. Using your digital marketing foundations from this course, describe how you would prioritize their marketing channels and why.",
    evidenceHint: "A strong response maps the customer journey (awareness → consideration → conversion → retention), recommends two or three starter channels appropriate for a limited budget (e.g., Google Search + social + email), and explains the rationale for each recommendation.",
    quizQuestions: [
      {
        text: "A small e-commerce store gets 5,000 monthly website visitors but only 25 purchases. Which metric should the marketing team focus on improving first?",
        options: [
          "Total website traffic — increasing visitors will automatically increase purchase volume",
          "Conversion rate (purchases ÷ visitors = 0.5%) — improving how many existing visitors complete a purchase is typically more cost-effective than acquiring more traffic at the same conversion rate",
          "Average order value — encouraging existing customers to spend more per transaction",
          "Social media follower count — a larger audience will eventually convert to more sales"
        ],
        correctIndex: 1,
        explanation: "At 0.5% conversion rate, the store is losing 99.5% of its visitors without a purchase. Improving conversion on existing traffic is more efficient than paying to acquire more visitors who face the same friction."
      },
      {
        text: "A digital marketer wants to reach potential customers who are actively searching for the products their company sells. Which digital marketing channel MOST directly targets this intent?",
        options: [
          "Display advertising, which shows visual ads to users browsing unrelated websites",
          "Search engine marketing (SEM/PPC), which shows ads to users at the moment they search for relevant keywords—capturing existing intent rather than creating it",
          "Social media advertising, which targets users based on demographics and interests",
          "Email marketing, which reaches existing subscribers rather than new prospective customers"
        ],
        correctIndex: 1,
        explanation: "Search ads intercept users at the exact moment of purchase intent. Unlike display or social ads that interrupt users doing other things, search ads appear when users are actively looking for what you sell."
      },
      {
        text: "A marketing manager runs three digital campaigns simultaneously with the same budget but no tracking parameters. After the month, they cannot determine which campaign drove the most sales. What should have been set up beforehand?",
        options: [
          "Separate social media accounts for each campaign so results are automatically separated",
          "UTM parameters on all campaign links so analytics tools can attribute traffic and conversions to the correct campaign, channel, and ad",
          "Three separate website landing pages—one per campaign—to isolate traffic by destination",
          "A weekly manual review of all orders to identify which channel the customer came from"
        ],
        correctIndex: 1,
        explanation: "UTM parameters tag URLs with campaign source, medium, and name so Google Analytics can attribute conversions accurately. Without them, all traffic appears as one undifferentiated source making ROI comparison impossible."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-marketing-e-commerce-google:mission:marketing-course-2",
    courseSlug: "marketing-course-2",
    programSlug: "digital-marketing-e-commerce-google",
    programTitle: "Digital Marketing & E-Commerce Professional Certificate",
    courseTitle: "Attract and Engage Customers with Digital Marketing",
    missionName: "Design Thinker",
    missionTagline: "Prove you can create content that attracts and engages the right audience",
    primaryAxis: "Design",
    skillLabels: ["Content marketing", "SEO fundamentals", "Brand voice", "Canva", "Communication"],
    scenarioPrompt: "You are the digital marketing coordinator for a workforce development nonprofit. You need to create a content plan that attracts job seekers to the website and keeps them engaged through the application process. Using your content marketing and SEO skills from this course, describe your content strategy.",
    evidenceHint: "A strong response defines the target audience persona, maps content types to the funnel stages (awareness blog posts, consideration comparison guides, conversion testimonials), names 2-3 relevant SEO keywords, and explains how to measure content performance.",
    quizQuestions: [
      {
        text: "A nonprofit wants to rank in Google search results for people looking for free job training programs in their city. Which SEO approach is MOST effective for this goal?",
        options: [
          "Add the keyword 'free job training' to the website's page title, headings, and content where it fits naturally, and build local authority through Google Business Profile and local backlinks",
          "Buy Google Search ads targeting 'free job training' since organic SEO takes too long",
          "Repeat the keyword 'free job training' 50 times on each page to signal relevance to Google",
          "Create social media posts with the keyword since Google now indexes all social media content"
        ],
        correctIndex: 0,
        explanation: "On-page SEO with natural keyword placement in titles, headings, and content—combined with local authority signals like Google Business Profile—is the foundation of organic local search ranking."
      },
      {
        text: "A content team publishes 3 blog posts per week but none of them rank in search results or drive traffic after 6 months. Which audit should they conduct first?",
        options: [
          "A competitor analysis to find out how many blog posts competitors publish per week",
          "A keyword research audit to determine whether the topics being written about have actual search volume and whether the content targets keywords the audience is actually using",
          "A social media audit to see how many people are sharing the blog posts",
          "A technical SEO audit to check whether the blog pages load within 2 seconds"
        ],
        correctIndex: 1,
        explanation: "Content without keyword research often targets topics nobody searches for. Keyword research ensures content maps to real search demand—the prerequisite for organic traffic growth regardless of writing quality."
      },
      {
        text: "A nonprofit's website has a 78% bounce rate on the homepage for visitors who arrived from Google search. What does this most likely indicate?",
        options: [
          "The website loads too slowly, causing visitors to leave before the page fully renders",
          "There is a mismatch between what the search ad or organic listing promised and what the homepage delivers—visitors arrive with a specific intent that the homepage does not immediately address",
          "The homepage is too long and visitors are leaving before scrolling to the relevant content",
          "78% bounce rate is normal for nonprofit websites since their audiences are less engaged than e-commerce shoppers"
        ],
        correctIndex: 1,
        explanation: "High bounce rate on search traffic indicates message mismatch—the landing page does not match the search intent that brought the visitor. The fix is aligning page content with the keywords driving traffic."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-marketing-e-commerce-google:mission:marketing-course-3",
    courseSlug: "marketing-course-3",
    programSlug: "digital-marketing-e-commerce-google",
    programTitle: "Digital Marketing & E-Commerce Professional Certificate",
    courseTitle: "From Likes to Leads: Interact with Customers Online",
    missionName: "Client Champion",
    missionTagline: "Prove you can build relationships with customers through social media",
    primaryAxis: "Service",
    skillLabels: ["Social media management", "Community engagement", "Customer response", "Brand voice", "Communication"],
    scenarioPrompt: "You manage social media for a workforce development nonprofit. A former student posts publicly on your Facebook page saying the program 'wasted their time and did not help them get a job.' The post has 12 reactions and 3 comments from others sharing similar frustrations. Using your social media interaction skills from this course, describe how you would respond.",
    evidenceHint: "A strong response acknowledges the concern publicly (without being defensive), takes the detailed conversation to a private channel, investigates the complaint internally, and follows up with a resolution—maintaining brand voice throughout.",
    quizQuestions: [
      {
        text: "A company's social media account receives a comment from a customer saying their order arrived damaged and they are 'extremely disappointed.' What is the BEST first public response?",
        options: [
          "Ask the customer to send a photo of the damage so the claim can be verified before committing to any resolution",
          "Publicly acknowledge the issue with empathy ('We're so sorry to hear this'), thank them for letting you know, and invite them to connect via DM or email with their order details for immediate resolution",
          "Delete the comment and reach out privately so other customers do not see the complaint",
          "Explain publicly that damaged deliveries are the shipping carrier's responsibility and provide the carrier's claims number"
        ],
        correctIndex: 1,
        explanation: "A public empathetic response signals to all viewers that the brand takes complaints seriously. Moving detailed resolution to a private channel protects customer data and allows a more personal conversation."
      },
      {
        text: "A nonprofit's social media manager notices their Instagram engagement rate dropped from 4.2% to 1.8% over two months despite posting the same number of times per week. What is the MOST productive analytical step?",
        options: [
          "Increase posting frequency to compensate for the lower engagement rate",
          "Review the content from both periods to identify differences—topic, format (video vs. image), posting time, caption length—and compare high-performing vs. low-performing posts to understand what changed",
          "Switch to a different social media platform where engagement rates are typically higher",
          "Run a paid promotion campaign to artificially boost the engagement metrics back to previous levels"
        ],
        correctIndex: 1,
        explanation: "Engagement rate changes are caused by something specific. A content audit comparing the two periods surfaces the variable that changed—whether that is content format, topic relevance, algorithm changes, or audience shift."
      },
      {
        text: "A social media manager asks whether they should respond to every single comment on posts, including simple emoji reactions and one-word compliments. What is the BEST practice?",
        options: [
          "Respond to every comment including emojis and single-word reactions to maximize engagement signals",
          "Prioritize responses to comments with questions, complaints, or substantive feedback; acknowledge positive comments when time allows; use the time saved from one-word reactions to create quality responses to high-value interactions",
          "Only respond to complaints and never engage with positive comments to avoid appearing to play favorites",
          "Turn off comments on all posts to avoid the time burden of moderation and response"
        ],
        correctIndex: 1,
        explanation: "Quality of engagement matters more than volume. Focusing response effort on substantive comments—questions, concerns, detailed feedback—creates more meaningful community relationships than acknowledging every emoji."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-marketing-e-commerce-google:mission:marketing-course-4",
    courseSlug: "marketing-course-4",
    programSlug: "digital-marketing-e-commerce-google",
    programTitle: "Digital Marketing & E-Commerce Professional Certificate",
    courseTitle: "Think Outside the Inbox: Email Marketing",
    missionName: "Data Detective",
    missionTagline: "Prove you can run email campaigns that convert",
    primaryAxis: "Analytics",
    skillLabels: ["Email marketing", "A/B testing", "Segmentation", "Mailchimp", "Analytical thinking"],
    scenarioPrompt: "You are running a promotional email campaign for a workforce development nonprofit to increase enrollment applications. The last campaign had a 14% open rate and 1.2% click-through rate. Using your email marketing skills from this course, describe how you would design the next campaign to improve both metrics.",
    evidenceHint: "A strong response tests subject lines (A/B test), segments the list by prior engagement or program interest, improves the call to action, and sets specific metric targets with a rationale.",
    quizQuestions: [
      {
        text: "An email campaign to 10,000 subscribers has a 12% open rate and a 0.8% click-through rate. The team wants to run an A/B test. Which element has the MOST direct impact on the open rate specifically?",
        options: [
          "The body copy length—shorter emails generate more opens because subscribers can read them faster",
          "The subject line—it is the primary factor subscribers evaluate when deciding whether to open an email",
          "The call-to-action button color—a more visible button encourages more opens",
          "The sender name—using a personal name instead of a company name improves open rates"
        ],
        correctIndex: 1,
        explanation: "Open rate is decided before the email is opened—it is driven by the subject line (and sender name to a lesser extent). Body copy, buttons, and images only affect click-through rate, which requires the email to be opened first."
      },
      {
        text: "An email list has 5,000 subscribers but the open rate has dropped from 25% to 11% over 6 months. The content has not changed significantly. What is the MOST likely cause and fix?",
        options: [
          "Email clients updated their spam filters; switch to a different email service provider",
          "The list has grown stale—many subscribers are no longer active or interested; a list cleaning campaign (re-engagement series followed by removing non-openers) will improve deliverability and engagement rates",
          "The send time changed; move campaigns back to Tuesday mornings for better open rates",
          "Industry-wide open rates declined; the current rate is acceptable and no action is needed"
        ],
        correctIndex: 1,
        explanation: "Declining open rates on unchanged content typically signal list fatigue or staleness. Email providers use engagement signals (opens, clicks) to determine inbox placement—cleaning inactive subscribers protects deliverability."
      },
      {
        text: "An email marketing team sends the same enrollment promotion email to all 8,000 subscribers regardless of whether they are current students, alumni, or new prospects. Which improvement would MOST increase relevance and click-through rate?",
        options: [
          "Send the email twice—once at the start and once at the end of the month",
          "Segment the list and send tailored versions: new prospects get awareness messaging, alumni get a referral ask, and current students get upsell information—so each group receives content relevant to their relationship with the organization",
          "Add more images to the email to make it more visually engaging for all subscriber types",
          "Increase the email length to include all possible information so every subscriber finds something relevant"
        ],
        correctIndex: 1,
        explanation: "Email segmentation delivers relevant content to each subscriber group. Relevance is the top driver of click-through rate—a generic message for all segments produces lower engagement than targeted messages for each."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-marketing-e-commerce-google:mission:marketing-course-5",
    courseSlug: "marketing-course-5",
    programSlug: "digital-marketing-e-commerce-google",
    programTitle: "Digital Marketing & E-Commerce Professional Certificate",
    courseTitle: "Assess for Success: Marketing Analytics and Measurement",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can use data to measure and improve marketing performance",
    primaryAxis: "Analytics",
    skillLabels: ["Google Analytics", "Marketing KPIs", "Data interpretation", "A/B testing", "Analytical thinking"],
    scenarioPrompt: "You are presenting the quarterly marketing performance report to a nonprofit's board. The board wants to know whether the $15,000 spent on digital marketing this quarter was worth it. Using your marketing analytics skills from this course, describe which metrics you would present and how you would frame the ROI conversation.",
    evidenceHint: "A strong response presents cost per lead, conversion rate, attribution by channel, and total applications generated; explains the difference between vanity metrics (impressions) and actionable metrics (cost per application); and acknowledges attribution limitations.",
    quizQuestions: [
      {
        text: "A marketing manager reports 'our social media campaign reached 500,000 people this month.' A board member asks: 'How many of those people enrolled in a program?' The manager does not know. What does this reveal about the campaign measurement approach?",
        options: [
          "Reach is the most important social media metric and the board member is asking the wrong question",
          "The campaign tracked a vanity metric (reach) without linking it to a business outcome (enrollments); effective measurement requires connecting top-of-funnel metrics to conversion goals",
          "500,000 reach is an impressive result that clearly justifies the campaign investment",
          "Social media conversions cannot be tracked; the board member should accept reach as the primary success metric"
        ],
        correctIndex: 1,
        explanation: "Vanity metrics like reach look impressive but do not answer 'did this create value?' Marketing analytics must connect channel activity to business outcomes—enrollments, applications, revenue—to justify investment."
      },
      {
        text: "Google Analytics shows that search traffic converts to applications at 4.2% while social traffic converts at 0.6%, but social traffic is 3x larger in volume. How should the marketing team allocate the next quarter's budget?",
        options: [
          "Increase social media spend since it generates 3x more traffic volume",
          "Analyze cost per conversion for each channel: if search drives more applications per dollar spent despite lower volume, shift budget toward search while testing ways to improve the social conversion rate",
          "Divide the budget equally between both channels since both are generating some conversions",
          "Stop social media entirely since its conversion rate is below 1%"
        ],
        correctIndex: 1,
        explanation: "Volume and conversion rate together determine cost per acquisition. Higher conversion rate often means search delivers more value per dollar—but the budget decision requires comparing cost per acquisition across channels, not rate alone."
      },
      {
        text: "A marketing team runs an A/B test on two landing page versions. After 1 week, Version B has a 6.2% conversion rate versus Version A's 5.8%. They declare Version B the winner. What is the MOST important statistical concern with this conclusion?",
        options: [
          "The test ran for too long; A/B tests should be concluded within 48 hours for maximum accuracy",
          "One week may not provide sufficient sample size for the difference to be statistically significant; the result could be random noise rather than a real performance difference—significance should be verified before declaring a winner",
          "The 0.4% difference is too small to matter practically; neither version is better",
          "A/B tests require at least three versions to draw valid conclusions about the winner"
        ],
        correctIndex: 1,
        explanation: "Statistical significance prevents acting on random variation. A small observed difference with insufficient sample size may flip in the next week. Tools like a significance calculator confirm whether the result is reliable."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-marketing-e-commerce-google:mission:marketing-course-6",
    courseSlug: "marketing-course-6",
    programSlug: "digital-marketing-e-commerce-google",
    programTitle: "Digital Marketing & E-Commerce Professional Certificate",
    courseTitle: "Make the Sale: Build, Launch, and Manage E-commerce Stores",
    missionName: "Systems Pro",
    missionTagline: "Prove you can set up and manage an e-commerce store effectively",
    primaryAxis: "Engineering",
    skillLabels: ["Shopify", "E-commerce operations", "Product catalog management", "Checkout optimization", "Problem-solving"],
    scenarioPrompt: "You are helping a nonprofit set up an online store to sell branded merchandise for fundraising. They have 12 products, need a simple checkout, and want to track which products are selling best. Using your e-commerce skills from this course, describe how you would set up the store and what operational processes you would establish.",
    evidenceHint: "A strong response covers product catalog setup, payment gateway configuration, shipping settings, basic analytics for tracking bestsellers, and at least one cart abandonment recovery tactic.",
    quizQuestions: [
      {
        text: "An e-commerce store's checkout has 8 form fields including optional fields for fax number and secondary address. The cart abandonment rate at checkout is 72%. Which change would MOST directly reduce abandonment?",
        options: [
          "Add a progress bar to the checkout so customers know how many steps remain",
          "Audit the form fields and remove or make optional all non-essential fields—every extra field reduces conversion; the minimum viable checkout needs name, shipping address, email, and payment",
          "Add customer reviews to the checkout page to increase confidence",
          "Offer a discount code field at checkout to reward customers who persist through the long form"
        ],
        correctIndex: 1,
        explanation: "Form field count is directly correlated with checkout abandonment. Every unnecessary field introduces friction. The minimum required information for a completed transaction is the optimal checkout length."
      },
      {
        text: "A Shopify store shows that the 'Tote Bag' product has 340 views but only 8 purchases (2.4% conversion rate) while the 'T-Shirt' has 180 views and 22 purchases (12.2% conversion rate). What is the MOST productive action?",
        options: [
          "Increase paid advertising for the tote bag since it has more traffic potential",
          "Investigate why the tote bag converts poorly despite high interest—check pricing, product photos, description clarity, and available sizes compared to the t-shirt—then test improvements",
          "Discontinue the tote bag since its conversion rate is too low to justify keeping it in the catalog",
          "Reduce the tote bag price by 50% to convert more of its existing traffic"
        ],
        correctIndex: 1,
        explanation: "High traffic with low conversion indicates interest without purchase intent being satisfied. Investigating and fixing the friction (unclear photos, price mismatch, missing information) is more effective than simply dropping the price."
      },
      {
        text: "A customer adds items to their online cart but leaves without purchasing. Which e-commerce tactic BEST recovers this potential sale?",
        options: [
          "Run a general social media ad campaign to increase brand awareness among all visitors",
          "Send an automated cart abandonment email sequence—a reminder at 1 hour, a follow-up at 24 hours with a small incentive if appropriate—to bring the specific customer back to complete their purchase",
          "Lower the price of all products in the store by 10% to convert future visitors more easily",
          "Add a pop-up discount offer that triggers immediately when any user visits the homepage"
        ],
        correctIndex: 1,
        explanation: "Cart abandonment emails target the highest-intent customers—people who already decided to buy. Automated sequences with personalized product reminders consistently recover 5-15% of abandoned carts."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "digital-marketing-e-commerce-google:mission:marketing-course-7",
    courseSlug: "marketing-course-7",
    programSlug: "digital-marketing-e-commerce-google",
    programTitle: "Digital Marketing & E-Commerce Professional Certificate",
    courseTitle: "Satisfaction Guaranteed: Develop Customer Loyalty Online",
    missionName: "Support Hero",
    missionTagline: "Prove you can turn one-time buyers into loyal customers",
    primaryAxis: "Service",
    skillLabels: ["Customer loyalty", "Retention marketing", "NPS", "Customer journey", "Communication"],
    scenarioPrompt: "You are the customer experience coordinator for an online training program. Completion rates are at 34% and few graduates return for additional courses. Using your customer loyalty skills from this course, describe the retention strategy you would implement to increase completion rates and repeat enrollment.",
    evidenceHint: "A strong response covers onboarding sequences (welcome emails, milestone check-ins), identifies drop-off points through data, implements an NPS survey post-completion, and designs a loyalty incentive for repeat enrollment.",
    quizQuestions: [
      {
        text: "An online course platform sees that 60% of students who enroll stop engaging after week 2. What is the MOST effective retention strategy to address this specific drop-off point?",
        options: [
          "Send a discount offer to all inactive students to motivate them to return",
          "Analyze what happens in week 2 specifically—are lessons too long? Is there a particularly difficult assessment? Address the specific friction causing drop-off rather than applying a generic incentive",
          "Reduce the total course length by 50% so students complete before losing interest",
          "Send daily reminder emails starting from day 1 to maintain engagement throughout the course"
        ],
        correctIndex: 1,
        explanation: "Week 2 drop-off is a signal about something specific in the course experience at that point. Diagnosing and fixing the friction is more effective and sustainable than incentivizing past the problem without fixing it."
      },
      {
        text: "A student completes a workforce training program and gives an NPS score of 9 out of 10. What is the BEST next action to maximize the value of this satisfied customer?",
        options: [
          "Log the score in the NPS database and move on since the student is already satisfied",
          "Follow up personally to thank them, ask for a testimonial or review, invite them to refer friends, and present them with information about the next relevant course—converting their satisfaction into advocacy and repeat enrollment",
          "Offer a significant discount on their next course since high NPS customers deserve rewards",
          "Ask them to complete a detailed survey about every aspect of the program to gather exhaustive feedback"
        ],
        correctIndex: 1,
        explanation: "NPS promoters (scores 9-10) are the most valuable customers for growth. Activating their satisfaction through referral requests and relevant upsell offers converts high satisfaction into measurable business outcomes."
      },
      {
        text: "A digital marketing coordinator sees that 85% of new customer revenue comes from repeat buyers who enrolled in at least two programs. Acquiring a new student costs $120 in marketing; a returning student costs $8 to re-engage. What is the MOST important strategic implication?",
        options: [
          "The organization should eliminate new customer acquisition since it is 15x more expensive",
          "Retention and re-engagement of existing students should be a primary investment priority—the data shows repeat students are both the largest revenue source and the most cost-efficient to convert",
          "The new customer acquisition cost of $120 is acceptable since those customers eventually become repeat buyers",
          "Both acquisition and retention costs are too high; the organization should rely on organic word-of-mouth instead"
        ],
        correctIndex: 1,
        explanation: "When 85% of revenue comes from repeat customers at 15x lower acquisition cost, the data clearly prioritizes retention investment. This is a foundational customer lifetime value insight that should drive budget allocation."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 11: AWS Cloud Technology (Amazon) ───────────────────────────

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-1",
    courseSlug: "aws-course-1",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "Introduction to Information Technology and AWS Cloud",
    missionName: "Code Architect",
    missionTagline: "Prove you understand what AWS Cloud is and how it works",
    primaryAxis: "Engineering",
    skillLabels: ["AWS fundamentals", "Cloud concepts", "IT infrastructure", "Problem-solving", "Communication"],
    scenarioPrompt: "An HR manager at a small company asks you to explain why their company should move their file server from an on-premises closet to AWS. They do not understand technical terms. Using your AWS and cloud fundamentals from this course, explain the business case in plain language, covering cost, reliability, and scalability.",
    evidenceHint: "A strong response uses the pay-as-you-go model to explain cost benefits, explains high availability with at least 99.9% uptime vs. a single server, describes scaling to meet demand, and mentions at least one specific AWS service by name.",
    quizQuestions: [
      {
        text: "A company's on-premises server room was flooded and all local backups were destroyed. Which AWS feature would have prevented this data loss?",
        options: [
          "AWS pricing—cloud storage is cheaper than on-premises so the company should have moved earlier",
          "AWS regional data storage with cross-region replication—data stored in S3 can be automatically replicated to a geographically separate region, surviving a single-location disaster",
          "AWS auto-scaling—the server would have automatically spun up additional capacity to avoid the flood",
          "AWS CloudWatch—monitoring alerts would have notified the team before the flood caused damage"
        ],
        correctIndex: 1,
        explanation: "Geographic redundancy through cross-region replication means a disaster destroying one physical location does not destroy the data. On-premises backups in the same building fail together."
      },
      {
        text: "A startup is choosing between buying a $15,000 server upfront or using AWS EC2 at $0.10/hour. They expect low usage for the first 6 months and heavy usage for 2 weeks during a product launch. Which option is MORE cost-effective and why?",
        options: [
          "The on-premises server, because it has no recurring costs after the initial purchase",
          "AWS EC2, because it charges only for actual usage—the startup pays very little during low-traffic months and can scale up for 2 weeks of peak demand without owning hardware that sits idle the rest of the year",
          "Both options cost the same over a 3-year period due to depreciation and cloud cost increases",
          "The on-premises server, because EC2 costs will exceed $15,000 within the first year at normal usage rates"
        ],
        correctIndex: 1,
        explanation: "The pay-as-you-go model is especially valuable for variable workloads. A startup paying for idle capacity 10 months to own 2 months of peak is a poor use of capital compared to elastic cloud pricing."
      },
      {
        text: "A retail website crashes every year during Black Friday because their single server cannot handle the traffic spike. Which AWS feature directly solves this problem?",
        options: [
          "AWS IAM—access control ensures only legitimate users can connect during peak traffic",
          "AWS Auto Scaling—automatically adds more EC2 instances as traffic increases and removes them when traffic subsides, handling any traffic volume without pre-purchasing capacity",
          "AWS CloudTrail—logging all requests prevents the server from being overwhelmed",
          "AWS Route 53—DNS routing distributes requests evenly across existing servers"
        ],
        correctIndex: 1,
        explanation: "Auto Scaling adds compute capacity in response to demand. Black Friday crashes happen because traffic exceeds fixed capacity—Auto Scaling eliminates the ceiling by provisioning and deprovisioning dynamically."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-2",
    courseSlug: "aws-course-2",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "Providing Technical Support for AWS Workloads",
    missionName: "Tech Builder",
    missionTagline: "Prove you can support and troubleshoot AWS-hosted applications",
    primaryAxis: "Engineering",
    skillLabels: ["AWS support", "CloudWatch", "EC2 troubleshooting", "IAM", "Problem-solving"],
    scenarioPrompt: "A developer calls your AWS support line saying their EC2 instance is running but their web application is returning a 503 error to users. The instance shows green health checks. Using your AWS technical support skills from this course, walk through the troubleshooting steps you would take.",
    evidenceHint: "A strong response checks security group rules for the application port, verifies the web server process is running on the instance, checks CloudWatch logs for application errors, and distinguishes between infrastructure health and application health.",
    quizQuestions: [
      {
        text: "An EC2 instance shows 'running' status but users cannot access the web application on port 80. What is the MOST common cause?",
        options: [
          "The EC2 instance type does not support HTTP traffic",
          "The security group attached to the instance does not have an inbound rule allowing TCP traffic on port 80 from the internet",
          "AWS automatically blocks port 80 for security reasons; HTTPS port 443 must be used instead",
          "The instance needs to be stopped and restarted to activate HTTP listener support"
        ],
        correctIndex: 1,
        explanation: "EC2 security groups act as virtual firewalls. A missing inbound rule for port 80 blocks all HTTP traffic even when the instance is running and the web server is active—the most common cause of this symptom."
      },
      {
        text: "A CloudWatch alarm fires showing CPU utilization at 98% on an EC2 instance hosting a web application. The application is responding slowly. What is the MOST appropriate immediate action?",
        options: [
          "Terminate the instance and launch a new one since high CPU indicates the instance is compromised",
          "Identify the process consuming CPU using top or CloudWatch detailed metrics, then either optimize the application, scale vertically to a larger instance type, or add horizontal scaling through Auto Scaling",
          "Reboot the instance to clear the CPU backlog and restore normal performance",
          "Reduce the number of CloudWatch metrics being collected since metric collection itself is consuming CPU"
        ],
        correctIndex: 1,
        explanation: "Diagnosing before acting prevents unnecessary disruption. Identifying the cause of CPU saturation determines the right fix—application optimization, vertical scaling, or horizontal scaling—rather than guessing."
      },
      {
        text: "A developer receives an 'Access Denied' error when trying to upload files to an S3 bucket from an EC2 instance. The developer's personal IAM user can upload without error. What is MOST likely the cause?",
        options: [
          "The S3 bucket is in a different AWS region from the EC2 instance",
          "The EC2 instance's IAM role does not have the s3:PutObject permission for that bucket; the developer's personal IAM user has it but the instance's role does not",
          "S3 bucket uploads from EC2 are not supported; files must be transferred using the AWS CLI from a local machine",
          "The S3 bucket's versioning is enabled, which blocks all new uploads until it is disabled"
        ],
        correctIndex: 1,
        explanation: "EC2 instances access AWS services through an attached IAM role, not the developer's personal credentials. Missing s3:PutObject on the instance role is the most common cause of this exact symptom."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-3",
    courseSlug: "aws-course-3",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "Developing Applications in Python on AWS",
    missionName: "Systems Pro",
    missionTagline: "Prove you can build Python applications that run on AWS",
    primaryAxis: "Engineering",
    skillLabels: ["Boto3", "AWS Lambda", "S3", "Python", "Problem-solving"],
    scenarioPrompt: "You are building a Python application that automatically processes new CSV files uploaded to an S3 bucket, extracts summary statistics, and stores the results back in S3. Using your Python on AWS skills from this course, describe the architecture and the key code components.",
    evidenceHint: "A strong response uses an S3 event trigger to invoke a Lambda function, uses boto3 to read the uploaded file and write the result, uses pandas for processing, and handles errors with appropriate logging.",
    quizQuestions: [
      {
        text: "A Python Lambda function reads a file from S3 using boto3 and gets a NoSuchKey error. The file was just uploaded seconds earlier. What is the MOST likely cause?",
        options: [
          "Lambda functions cannot access S3 buckets without a VPC endpoint",
          "The key path in the code may not match the actual S3 object key—common causes include trailing slashes, case sensitivity differences, or a prefix mismatch between the event notification and the code",
          "S3 has eventual consistency for new objects and the Lambda ran before the upload propagated",
          "The Lambda function's execution role does not have s3:GetObject permission"
        ],
        correctIndex: 1,
        explanation: "NoSuchKey means the key literally does not exist at the path specified. Key mismatches (capitalization, prefix differences, extra characters) are the most common cause—especially when the key is constructed from event data."
      },
      {
        text: "A Python Lambda function processes large CSV files and times out after 15 minutes—the maximum Lambda execution limit. What is the BEST architectural solution?",
        options: [
          "Increase the Lambda memory allocation, which proportionally increases CPU and reduces processing time",
          "Redesign the workflow to split large files into chunks using S3 Select or a preprocessing step, so each Lambda invocation processes a smaller portion within the time limit",
          "Move the entire application to an EC2 instance where there is no execution time limit",
          "Use Lambda Provisioned Concurrency to keep the function warm and reduce startup overhead"
        ],
        correctIndex: 1,
        explanation: "Lambda's 15-minute limit requires rethinking large-file workloads. Chunking the processing so each invocation handles a slice is the serverless-native solution—allowing parallel processing as a bonus."
      },
      {
        text: "A boto3 script hardcodes AWS credentials directly in the Python file for a Lambda function. Why is this a security problem and what is the correct approach?",
        options: [
          "Hardcoded credentials slow down the Lambda cold start time",
          "Hardcoded credentials in code get committed to version control and exposed in Lambda deployment packages; Lambda functions should use IAM execution roles instead—credentials are injected automatically without any code-level secrets",
          "Lambda functions cannot use hardcoded credentials; they require environment variables",
          "AWS automatically rotates hardcoded credentials every 90 days so they expire before becoming a security risk"
        ],
        correctIndex: 1,
        explanation: "IAM roles are the correct mechanism for Lambda to access AWS services. They provide automatic credential rotation, auditability, and least-privilege enforcement—all without a single secret in code or environment variables."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-4",
    courseSlug: "aws-course-4",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "Skills for Working as an AWS Cloud Consultant",
    missionName: "Project Commander",
    missionTagline: "Prove you can advise clients on their AWS cloud strategy",
    primaryAxis: "Strategy",
    skillLabels: ["Cloud consulting", "AWS architecture", "Cost optimization", "Client communication", "Problem-solving"],
    scenarioPrompt: "A mid-size company asks you to review their AWS bill, which has grown 40% in the past quarter without any new services being launched. Using your AWS consulting skills from this course, describe how you would investigate the cost increase and what recommendations you might make.",
    evidenceHint: "A strong response uses AWS Cost Explorer and Cost and Usage Reports to identify the drivers, checks for idle resources (unattached EBS volumes, unused EC2 instances), reviews data transfer costs, and recommends at least two concrete optimizations.",
    quizQuestions: [
      {
        text: "An AWS client's bill shows that EC2 costs tripled last month. Using Cost Explorer, you see 15 EC2 instances running 24/7 in a dev environment that is only used 8 hours a day on weekdays. What is the MOST cost-effective recommendation?",
        options: [
          "Migrate the dev environment to a smaller instance type to reduce hourly cost",
          "Schedule the dev instances to automatically stop outside business hours using AWS Instance Scheduler or Lambda, reducing running time from 720 hours/month to approximately 175 hours/month",
          "Switch the dev instances from On-Demand to Spot Instances for lower hourly rates",
          "Move the dev environment to a single large instance instead of 15 smaller ones"
        ],
        correctIndex: 1,
        explanation: "Dev environments typically only need to run during business hours. Automated start/stop reduces billable hours from 100% to ~24%, often cutting dev EC2 costs by 75%+ without any infrastructure changes."
      },
      {
        text: "A Cost Explorer report shows $8,000/month in data transfer charges. Investigation reveals an application in us-east-1 is making API calls to a service in eu-west-1, with responses transferring back. What is the MOST cost-effective architectural fix?",
        options: [
          "Switch to a more expensive instance type that includes data transfer in the price",
          "Colocate the dependent services in the same AWS region to eliminate inter-region data transfer charges, which AWS applies to all traffic between regions",
          "Use AWS Direct Connect to reduce data transfer costs between regions",
          "Enable data compression on the API responses to reduce the volume of data transferred"
        ],
        correctIndex: 1,
        explanation: "Inter-region data transfer is charged at a per-GB rate. Colocating services in the same region makes all traffic intra-region, which AWS charges at a significantly lower rate or sometimes zero within the same AZ."
      },
      {
        text: "A client has been running the same 20 EC2 instances at steady load for 2 years and is paying On-Demand rates. What savings opportunity should a cloud consultant flag?",
        options: [
          "Migrate to Spot Instances since the steady workload qualifies for the largest spot discount",
          "Purchase Reserved Instances or Savings Plans for the consistently-used instances—committing to 1 or 3 years provides 40-72% savings over On-Demand for predictable workloads",
          "Downgrade the instance types since steady load indicates the current instances are oversized",
          "Move the workload to a self-managed on-premises server since the steady usage makes cloud more expensive long-term"
        ],
        correctIndex: 1,
        explanation: "On-Demand pricing carries a premium for flexibility. For steady, predictable workloads running for years, Reserved Instances or Savings Plans provide substantial discounts in exchange for a usage commitment—the most common missed optimization."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-5",
    courseSlug: "aws-course-5",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "DevOps on AWS and Project Management",
    missionName: "Tech Builder",
    missionTagline: "Prove you can apply DevOps practices on AWS",
    primaryAxis: "Engineering",
    skillLabels: ["CI/CD pipelines", "AWS CodePipeline", "Infrastructure as Code", "DevOps practices", "Problem-solving"],
    scenarioPrompt: "Your team deploys application updates to AWS manually by SSHing into EC2 instances and running git pull. This causes 30-minute outages during each deploy. Using your DevOps on AWS skills from this course, describe how you would redesign the deployment process to eliminate downtime.",
    evidenceHint: "A strong response proposes a CI/CD pipeline using CodePipeline + CodeDeploy (or similar), describes a blue/green or rolling deployment strategy to achieve zero downtime, and explains infrastructure-as-code for consistency.",
    quizQuestions: [
      {
        text: "A team deploys by manually SSHing into production servers and running scripts. Two engineers deployed different versions to different servers last week causing inconsistent behavior. Which DevOps practice MOST directly prevents this?",
        options: [
          "Require all engineers to write deployment scripts in the same programming language",
          "Implement a CI/CD pipeline where all deployments flow through a single automated process—eliminating manual variation and ensuring every server receives the same artifact from the same source",
          "Document the deployment steps in a runbook so all engineers follow the same manual process",
          "Assign one engineer as the sole deployer to remove the variable of multiple people making changes"
        ],
        correctIndex: 1,
        explanation: "Manual deployments are inherently inconsistent. CI/CD pipelines automate the process so every deployment follows identical steps—eliminating human variation as the source of inconsistency."
      },
      {
        text: "A CodeDeploy blue/green deployment has completed successfully, but the team notices a bug in production after routing 100% of traffic to the new (green) environment. What advantage did blue/green deployment provide?",
        options: [
          "None—blue/green deployment cannot help once 100% of traffic has been shifted to the new environment",
          "The original (blue) environment is still running and traffic can be instantly shifted back to it, providing near-zero-downtime rollback without redeployment",
          "CodeDeploy automatically rolls back to blue when a bug is detected in production",
          "Blue/green ensures both environments run simultaneously so the bug only affects half the users"
        ],
        correctIndex: 1,
        explanation: "Blue/green's key advantage is instant rollback—the previous environment remains live and traffic can be redirected back in seconds. This is far faster than redeploying the previous version."
      },
      {
        text: "A team defines their AWS infrastructure using CloudFormation templates stored in version control. A new environment needs to be identical to production. What is the PRIMARY benefit of this Infrastructure as Code approach?",
        options: [
          "CloudFormation templates are faster to execute than AWS Console clicks",
          "The infrastructure is reproducible and version-controlled—any new environment can be provisioned to an exact specification, configuration drift is detectable, and changes are peer-reviewed before application",
          "CloudFormation reduces AWS costs by optimizing resource configurations automatically",
          "Infrastructure as Code eliminates the need for AWS security groups since code-based deployments are inherently secure"
        ],
        correctIndex: 1,
        explanation: "Reproducibility and version control are the core benefits of IaC. Infrastructure defined as code can be provisioned identically across environments, reviewed before changes, and audited for drift—none of which is possible with manual console work."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-6",
    courseSlug: "aws-course-6",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "Automation in the AWS Cloud",
    missionName: "Systems Pro",
    missionTagline: "Prove you can automate AWS operations to save time and reduce errors",
    primaryAxis: "Engineering",
    skillLabels: ["AWS Lambda", "CloudWatch Events", "Systems Manager", "Automation scripts", "Problem-solving"],
    scenarioPrompt: "Your company's AWS operations team spends 3 hours every Monday manually starting EC2 instances, running backup scripts, and generating cost reports. Using your AWS automation skills from this course, describe how you would automate each of these three tasks.",
    evidenceHint: "A strong response uses EventBridge (CloudWatch Events) scheduled rules to trigger Lambda for instance management, Systems Manager for running backup scripts on instances, and Cost Explorer API or a scheduled Lambda for cost reports.",
    quizQuestions: [
      {
        text: "A company wants EC2 development instances to automatically start at 8 AM and stop at 6 PM on weekdays in the US Eastern time zone. Which AWS services work together to implement this schedule?",
        options: [
          "AWS CloudTrail + IAM: log all start/stop events and restrict manual changes to business hours",
          "Amazon EventBridge (CloudWatch Events) with a cron expression to trigger a Lambda function that calls the EC2 start/stop API at the specified times",
          "AWS Auto Scaling: configure a scheduled scaling policy to add and remove instances at specified times",
          "AWS Systems Manager Maintenance Windows: configure windows during off-hours to automatically stop instances"
        ],
        correctIndex: 1,
        explanation: "EventBridge scheduled rules with cron expressions trigger Lambda at specified times. Lambda then calls the EC2 API to start or stop specific instances—the standard pattern for scheduled instance management."
      },
      {
        text: "An operations engineer manually SSH-es into 25 EC2 instances every week to run a security patch script. Using AWS automation, which service eliminates the need for SSH access entirely?",
        options: [
          "AWS CloudFormation: redeploy all instances with the patch included in the AMI",
          "AWS Systems Manager Run Command: execute scripts on multiple instances simultaneously without opening SSH ports, using the SSM agent already installed on managed instances",
          "AWS Lambda: run the patch script inside a Lambda function that connects to each EC2 instance",
          "AWS Elastic Beanstalk: managed environments automatically apply security patches without manual intervention"
        ],
        correctIndex: 1,
        explanation: "Systems Manager Run Command executes scripts on fleets of instances through the SSM agent without requiring SSH or open inbound ports—significantly more secure and scalable than manual SSH-based patching."
      },
      {
        text: "A Lambda function meant to clean up old S3 objects runs every night but the team has no visibility into whether it succeeds or fails. What is the MINIMUM monitoring setup needed?",
        options: [
          "Add a print statement in the Lambda function that writes 'done' when complete",
          "Configure CloudWatch to capture Lambda error metrics, set an alarm that triggers an SNS notification when errors exceed 0, and ensure the function logs to CloudWatch Logs for debugging when failures occur",
          "Check the Lambda console manually each morning to review the invocation history",
          "Add a DynamoDB write at the end of the Lambda to record each successful run as a timestamp"
        ],
        correctIndex: 1,
        explanation: "Production automation requires automated alerting on failure—manual checks are unreliable. CloudWatch alarms on Lambda errors plus SNS notifications ensure the team is alerted when the function fails, not the next morning."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-7",
    courseSlug: "aws-course-7",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "Data Analytics and Databases on AWS",
    missionName: "Data Detective",
    missionTagline: "Prove you can store, query, and analyze data on AWS",
    primaryAxis: "Analytics",
    skillLabels: ["Amazon RDS", "AWS Athena", "S3 data lake", "SQL", "Analytical thinking"],
    scenarioPrompt: "Your company stores customer transaction data in an S3 data lake as CSV files. The business team needs to run ad-hoc SQL queries on this data without a DBA and without loading it into a database. Using your AWS data analytics knowledge from this course, describe which AWS service enables this and how you would set it up.",
    evidenceHint: "A strong response recommends Amazon Athena for serverless SQL on S3 data, describes setting up a Glue crawler to catalog the CSV files, and explains how queries are executed and priced (per TB scanned).",
    quizQuestions: [
      {
        text: "A business analyst wants to run SQL queries against 500GB of CSV files stored in S3 without loading data into a database. Which AWS service is MOST appropriate?",
        options: [
          "Amazon RDS: load the CSVs into a managed relational database and run SQL queries",
          "Amazon Athena: run serverless SQL queries directly against S3 data using standard SQL, paying only per TB scanned with no infrastructure to manage",
          "Amazon EC2: launch a virtual machine with PostgreSQL installed and import the CSV files",
          "Amazon Redshift: load the data into a cloud data warehouse optimized for analytics queries"
        ],
        correctIndex: 1,
        explanation: "Athena queries S3 data in-place using standard SQL. It requires no infrastructure setup, charges per query (per TB scanned), and is ideal for ad-hoc analysis by non-technical users through the AWS console or BI tools."
      },
      {
        text: "An Amazon RDS database is experiencing slow query performance during business hours. CloudWatch shows CPU at 85% and available memory at 12%. What is the MOST appropriate immediate action?",
        options: [
          "Restart the RDS instance to clear the memory and reduce CPU usage",
          "Identify and optimize the slowest queries using RDS Performance Insights, then evaluate whether a vertical scale-up or read replica is needed for sustained load",
          "Create a manual snapshot of the database and restore it to a larger instance type",
          "Enable Multi-AZ deployment to distribute the query load across two database instances"
        ],
        correctIndex: 1,
        explanation: "Performance Insights identifies the specific queries consuming most resources—the prerequisite for any optimization decision. Random scale-up without query diagnosis may not solve a poorly-written query problem."
      },
      {
        text: "A company stores all application logs in S3 as JSON files partitioned by date (e.g., logs/2024/01/15/). When running Athena queries filtered to a single day, the query scans the entire 6TB dataset and costs $30. What is the fix?",
        options: [
          "Convert the JSON files to CSV format since CSV files scan faster in Athena",
          "Define the date partition columns in the Athena table schema using PARTITIONED BY—Athena will then skip partitions outside the query's date filter, scanning only the relevant day's data instead of the full 6TB",
          "Increase the Athena DPU allocation to process the full dataset scan faster",
          "Move the log data from S3 to DynamoDB to enable faster indexed queries by date"
        ],
        correctIndex: 1,
        explanation: "Partition pruning is Athena's mechanism for avoiding full dataset scans. When the table schema registers partition columns, Athena filters at the storage level—scanning only matching partitions and dramatically reducing both cost and query time."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "aws-cloud-technology-amazon:mission:aws-course-8",
    courseSlug: "aws-course-8",
    programSlug: "aws-cloud-technology-amazon",
    programTitle: "AWS Cloud Technology",
    courseTitle: "Capstone: Following the AWS Well-Architected Framework",
    missionName: "Tech Builder",
    missionTagline: "Prove you can design AWS solutions that meet the Well-Architected pillars",
    primaryAxis: "Engineering",
    skillLabels: ["AWS Well-Architected", "Security best practices", "Reliability", "Cost optimization", "Problem-solving"],
    scenarioPrompt: "You are conducting a Well-Architected Review for a startup's production workload running on AWS. They have one EC2 instance, no backups, no monitoring, and store the database password in an environment variable on the server. Identify the gaps against each relevant pillar and propose fixes.",
    evidenceHint: "A strong response maps findings to at least three Well-Architected pillars (Security: credential management, Reliability: single point of failure, Operational Excellence: monitoring/alerting), names specific AWS services for each fix.",
    quizQuestions: [
      {
        text: "A production application stores its database password as an EC2 instance environment variable. Which Well-Architected pillar does this violate and what is the recommended fix?",
        options: [
          "Cost Optimization pillar — secrets management services add cost; store credentials in Parameter Store free tier instead",
          "Security pillar — environment variables are visible to any process on the instance and anyone with console access; use AWS Secrets Manager or SSM Parameter Store with encryption to manage credentials securely",
          "Performance Efficiency pillar — reading environment variables adds latency; credentials should be cached in memory",
          "Reliability pillar — environment variables are lost when the instance restarts, causing application failures"
        ],
        correctIndex: 1,
        explanation: "Storing secrets in environment variables is a Security pillar violation. AWS Secrets Manager provides encrypted storage, automatic rotation, and fine-grained access control—all missing from environment variables."
      },
      {
        text: "A startup's entire production workload runs on a single EC2 instance with no load balancer or backup. Which Well-Architected pillar MOST directly addresses this architecture risk?",
        options: [
          "Performance Efficiency — a single instance may not have sufficient resources for peak load",
          "Reliability — the application has a single point of failure; the Reliability pillar requires designing for failure through redundancy, Multi-AZ deployment, and automatic recovery mechanisms",
          "Operational Excellence — the team cannot patch or update the instance without downtime",
          "Cost Optimization — running one large instance is more expensive than multiple smaller ones"
        ],
        correctIndex: 1,
        explanation: "The Reliability pillar requires eliminating single points of failure through redundancy. A single EC2 instance fails catastrophically on hardware failure, AZ outage, or software crash—no failover is possible."
      },
      {
        text: "A Well-Architected Review finds that a production workload has no CloudWatch alarms, no logging, and engineers only know about outages when customers complain. Which pillar gap does this represent?",
        options: [
          "Cost Optimization — CloudWatch costs money and the team is saving by not enabling it",
          "Operational Excellence — the pillar requires monitoring operational health proactively, understanding normal workload behavior, and detecting issues before customers are impacted",
          "Security — lack of logging means security incidents cannot be detected or investigated",
          "Performance Efficiency — without metrics, the team cannot identify performance bottlenecks"
        ],
        correctIndex: 1,
        explanation: "Operational Excellence requires proactive monitoring, alerting, and observability. Reactive awareness through customer complaints is an antipattern that extends mean time to recovery and customer impact duration."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 12: CompTIA A+ Professional Certificate ─────────────────────

  {
    key: "comptia-a-professional-certificate:mission:comptia-a-course-1",
    courseSlug: "comptia-a-course-1",
    programSlug: "comptia-a-professional-certificate",
    programTitle: "CompTIA A+ Professional Certificate",
    courseTitle: "IT Fundamentals and Hardware Essentials",
    missionName: "Code Architect",
    missionTagline: "Prove you know PC hardware components and how they work",
    primaryAxis: "Engineering",
    skillLabels: ["Hardware components", "PC assembly", "Troubleshooting", "Windows", "Problem-solving"],
    scenarioPrompt: "A user brings in a desktop computer that will not power on at all—no fans spin, no lights come on. Using your IT fundamentals and hardware knowledge from this course, walk through the systematic diagnostic steps you would take to identify the faulty component.",
    evidenceHint: "A strong response checks the obvious first (power cable, outlet, PSU switch), performs a POST beep code or minimal boot test, and narrows to PSU vs. motherboard as the most likely culprits through process of elimination.",
    quizQuestions: [
      {
        text: "A desktop PC shows no signs of power when the power button is pressed. You have confirmed the outlet is live. What is the NEXT best troubleshooting step?",
        options: [
          "Replace the motherboard since it controls the power-on circuitry",
          "Check that the power supply switch on the back of the PSU is in the ON position, verify the power cable is fully seated, and test with a known-good cable before opening the case",
          "Open the case and reseat all RAM modules since RAM failures can prevent power-on",
          "Replace the power button cable since the button itself is the most common cause of no-power symptoms"
        ],
        correctIndex: 1,
        explanation: "Always eliminate the simplest external causes first. A flipped PSU switch or loose power cable requires zero tools to fix. External checks precede any internal hardware manipulation."
      },
      {
        text: "A technician installs a new 16GB RAM stick in a desktop that previously had 8GB. The BIOS reports only 8GB available. What is the MOST likely cause?",
        options: [
          "The operating system is 32-bit and cannot address more than 4GB of RAM",
          "The new RAM stick is not fully seated in the DIMM slot; re-seating it firmly until both retention clips click is the first troubleshooting step",
          "The RAM stick is DDR5 but the motherboard only supports DDR4, causing it to be ignored",
          "The BIOS version is outdated and needs to be updated to recognize the new RAM capacity"
        ],
        correctIndex: 1,
        explanation: "Partially seated RAM is the most common cause of memory not being recognized. A fully seated DIMM requires firm pressure until both side clips lock—a common installation error for new technicians."
      },
      {
        text: "A desktop PC powers on but immediately powers off after 3 seconds, repeating this cycle. There is no display output. What is this behavior MOST consistent with?",
        options: [
          "A software crash causing the operating system to restart in a loop",
          "A thermal protection shutdown—the CPU is overheating almost instantly, likely due to improperly seated or missing CPU cooler, and the system shuts down before damage occurs",
          "A failing hard drive causing the system to abort the boot process",
          "Incompatible RAM causing the system to restart rather than display a POST error"
        ],
        correctIndex: 1,
        explanation: "Immediate repeated power cycles (on for 2-3 seconds, then off) is the classic symptom of thermal protection triggering. A missing or improperly mounted CPU cooler causes CPU temperature to spike within seconds of power-on."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-a-professional-certificate:mission:comptia-a-course-2",
    courseSlug: "comptia-a-course-2",
    programSlug: "comptia-a-professional-certificate",
    programTitle: "CompTIA A+ Professional Certificate",
    courseTitle: "Networking, Peripherals, and Wireless Technologies",
    missionName: "Tech Builder",
    missionTagline: "Prove you can diagnose and fix networking and peripheral issues",
    primaryAxis: "Engineering",
    skillLabels: ["Networking basics", "Wi-Fi troubleshooting", "Peripherals", "TCP/IP", "Problem-solving"],
    scenarioPrompt: "Three employees in the same room report their laptops cannot connect to the office Wi-Fi network, while employees on the other side of the office connect fine. Using your networking and wireless troubleshooting skills from this course, describe your diagnostic approach.",
    evidenceHint: "A strong response checks signal strength in the affected area, considers access point placement and channel congestion, verifies IP address assignment (APIPA vs. DHCP), and identifies physical obstructions or interference sources as variables.",
    quizQuestions: [
      {
        text: "A laptop shows it is connected to Wi-Fi but cannot browse the internet or reach any network resources. The IP address shown is 169.254.x.x. What does this IP address indicate?",
        options: [
          "The laptop is using a private IP address reserved for guest network access",
          "The laptop received an APIPA (Automatic Private IP Addressing) address, meaning it could not reach the DHCP server—the Wi-Fi connection exists at the radio layer but network communication is broken",
          "The IP address is from a legacy range and should work normally for internet access",
          "The laptop's network adapter is malfunctioning and should be replaced"
        ],
        correctIndex: 1,
        explanation: "169.254.x.x is an APIPA address, assigned automatically when DHCP fails. It means the device is associated with the Wi-Fi network but cannot communicate with the DHCP server to obtain a routable IP."
      },
      {
        text: "An office has 8 access points all configured on Wi-Fi channel 6. Users report slow speeds despite strong signal. What is causing the performance issue?",
        options: [
          "Channel 6 is reserved for enterprise use and is slower than consumer channels",
          "Co-channel interference—multiple APs on the same channel compete for airtime, degrading performance even with good signal strength; distributing APs across non-overlapping channels (1, 6, 11) eliminates this",
          "The office has too many access points; reducing to 2-3 APs would improve performance",
          "Signal strength is too high and causing interference with neighboring devices"
        ],
        correctIndex: 1,
        explanation: "Co-channel interference occurs when nearby APs use the same channel, forcing devices to wait for each other to transmit. Non-overlapping channels (1, 6, 11 for 2.4GHz) prevent this contention."
      },
      {
        text: "A USB printer worked yesterday but today Windows shows it as 'offline' even though the printer's display shows 'Ready.' What are the TWO most likely causes to check first?",
        options: [
          "The printer needs a firmware update and the printer driver needs to be reinstalled",
          "The USB cable may have come loose or the port may have changed (check Device Manager), and the printer spooler service may have stopped—restarting the Print Spooler service resolves many 'offline' states",
          "The printer's IP address changed, causing Windows to lose track of it",
          "The printer needs to be power-cycled and the USB cable replaced with a new one"
        ],
        correctIndex: 1,
        explanation: "USB printers showing 'offline' despite being powered on are most commonly caused by a loose USB connection or a stuck/stopped Print Spooler service. These two checks resolve the majority of cases before attempting driver reinstallation."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-a-professional-certificate:mission:comptia-a-course-3",
    courseSlug: "comptia-a-course-3",
    programSlug: "comptia-a-professional-certificate",
    programTitle: "CompTIA A+ Professional Certificate",
    courseTitle: "Advanced Networking, Virtualization, and IT Security",
    missionName: "Systems Pro",
    missionTagline: "Prove you can work with virtual environments and security controls",
    primaryAxis: "Engineering",
    skillLabels: ["Virtualization", "Network security", "Firewalls", "VPN", "Problem-solving"],
    scenarioPrompt: "Your company is setting up a virtual machine environment for developers to test software without affecting production systems. A developer asks why they cannot access internal company resources from inside their VM. Using your virtualization and networking knowledge from this course, explain VM networking modes and how to fix their access issue.",
    evidenceHint: "A strong response explains NAT vs. Bridged vs. Host-Only networking modes in virtualization, identifies that NAT would prevent direct inbound access, recommends bridged mode for full network integration, and notes the security trade-off.",
    quizQuestions: [
      {
        text: "A virtual machine is configured with NAT networking. The VM can browse the internet but cannot be accessed by other machines on the office network. What does this configuration explain?",
        options: [
          "NAT networking is misconfigured; all VMs should use bridged mode for normal operation",
          "NAT (Network Address Translation) routes the VM's outbound traffic through the host's IP, making the VM invisible to the local network—inbound connections from the network cannot reach the VM directly without port forwarding",
          "The VM's firewall is blocking inbound connections; disable the firewall to allow access",
          "The VM is using a different IP subnet than the office network, preventing cross-network communication"
        ],
        correctIndex: 1,
        explanation: "NAT shares the host's IP for outbound traffic, masking the VM from the local network. For a developer VM that needs to receive connections from other machines, bridged mode is needed to give the VM its own network IP."
      },
      {
        text: "A developer's VM on a laptop connects to the office network in bridged mode. The developer takes the laptop home and the VM can no longer connect to the internet. What is MOST likely happening?",
        options: [
          "The VM requires a VPN to function outside the office network",
          "In bridged mode, the VM's network configuration (IP, gateway, DNS) came from the office DHCP server; at home, the VM is on a different network segment and may not automatically obtain a new IP from the home router's DHCP server",
          "Bridged mode only works on wired connections; switching to Wi-Fi breaks the bridge",
          "The VM's firewall is blocking home internet access but allowing office access"
        ],
        correctIndex: 1,
        explanation: "Bridged mode VMs are full network participants. When the physical network changes (office to home), the VM needs a new IP from the new network's DHCP server. If DHCP does not reach the VM, it loses connectivity."
      },
      {
        text: "An employee connects to the company VPN from home and reports that after connecting, they cannot access their home printer or local network devices. What is causing this?",
        options: [
          "The VPN client blocks all local area network access to prevent data leakage—this is by design",
          "The VPN is likely configured as full-tunnel (all traffic routes through the VPN), which replaces the default gateway and blocks local LAN access; split-tunnel VPN would allow both VPN and local network access simultaneously",
          "The home printer needs a VPN client installed to communicate with the employee's computer while connected",
          "The company network is blocking mDNS broadcasts used for local device discovery"
        ],
        correctIndex: 1,
        explanation: "Full-tunnel VPN routes all traffic through the corporate gateway, overriding the local route to the home LAN. Split-tunnel VPN routes only corporate traffic through the VPN while direct-routing local traffic—the standard solution for this problem."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-a-professional-certificate:mission:comptia-a-course-4",
    courseSlug: "comptia-a-course-4",
    programSlug: "comptia-a-professional-certificate",
    programTitle: "CompTIA A+ Professional Certificate",
    courseTitle: "Foundations of Computer Hardware and Storage",
    missionName: "Code Architect",
    missionTagline: "Prove you can select and troubleshoot storage and hardware components",
    primaryAxis: "Engineering",
    skillLabels: ["Storage types", "Hardware selection", "Troubleshooting", "Windows", "Problem-solving"],
    scenarioPrompt: "A graphic designer reports their workstation is extremely slow when working with large video files. Their system has a 5-year-old 1TB HDD as the primary drive. You have budget for one upgrade. Using your hardware and storage knowledge from this course, recommend a specific upgrade and explain why it addresses the bottleneck.",
    evidenceHint: "A strong response recommends an NVMe SSD as the primary drive, explains the HDD vs. SSD vs. NVMe performance differences in terms of sequential and random read/write speeds, and describes how video editing specifically bottlenecks on storage I/O.",
    quizQuestions: [
      {
        text: "A video editor's workstation takes 45 seconds to open a 4K video project that fits in RAM. The CPU is at 8% utilization during this time. What does this tell you about the bottleneck?",
        options: [
          "The CPU is too slow to decompress the video format used in the project files",
          "Storage is the bottleneck—the CPU is nearly idle, meaning it is waiting on data to be read from the storage drive rather than being limited by processing power",
          "The GPU needs to be upgraded since video editing requires GPU acceleration for project loading",
          "The operating system's file indexing service is competing with the project load for disk access"
        ],
        correctIndex: 1,
        explanation: "Low CPU utilization combined with slow load times is the classic signature of a storage bottleneck. The CPU is idling while waiting for I/O to complete—upgrading storage will eliminate the wait."
      },
      {
        text: "A storage comparison shows: HDD 150 MB/s sequential read, SATA SSD 550 MB/s, NVMe SSD 3,500 MB/s. For a workstation editing 8K RAW video files that require sustained 1,200 MB/s read throughput, which is the MINIMUM viable option?",
        options: [
          "SATA SSD at 550 MB/s since it is significantly faster than HDD",
          "NVMe SSD at 3,500 MB/s since it is the only option that exceeds the 1,200 MB/s sustained throughput requirement with headroom for spikes",
          "HDD with RAID 0 striping across 8 drives to achieve 1,200 MB/s aggregate throughput",
          "Any option works since video editing software automatically compresses data to fit available bandwidth"
        ],
        correctIndex: 1,
        explanation: "The 1,200 MB/s requirement exceeds both HDD and SATA SSD capabilities. NVMe SSDs are the only single-drive solution that meets this throughput requirement for professional 8K video editing workflows."
      },
      {
        text: "A technician replaces an HDD with an NVMe SSD in a laptop. The BIOS does not detect the new drive. What is the MOST likely cause?",
        options: [
          "The NVMe SSD requires a driver to be installed before the BIOS can detect it",
          "The M.2 slot may be configured for SATA only rather than NVMe/PCIe; or the NVMe option may need to be enabled in BIOS settings; or the SSD is not fully inserted into the M.2 connector",
          "The laptop's power supply is insufficient to power an NVMe drive",
          "The operating system must be reinstalled before the BIOS can recognize a new storage device"
        ],
        correctIndex: 1,
        explanation: "Not all M.2 slots support both SATA and NVMe. A slot configured for SATA-only will not detect an NVMe drive; the BIOS may also need to have the NVMe protocol enabled. Physical seating issues are always worth checking first."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-a-professional-certificate:mission:comptia-a-course-5",
    courseSlug: "comptia-a-course-5",
    programSlug: "comptia-a-professional-certificate",
    programTitle: "CompTIA A+ Professional Certificate",
    courseTitle: "Operating Systems and Networking Fundamentals",
    missionName: "Tech Builder",
    missionTagline: "Prove you can support Windows and basic network configuration",
    primaryAxis: "Engineering",
    skillLabels: ["Windows administration", "Command line tools", "TCP/IP configuration", "Troubleshooting", "Problem-solving"],
    scenarioPrompt: "A user calls saying they cannot access any websites but their colleague sitting next to them can. Both are on the same Wi-Fi network. The user's computer shows it is connected to Wi-Fi. Using your OS and networking skills from this course, describe the command-line diagnostic steps you would guide them through.",
    evidenceHint: "A strong response uses ipconfig to check IP/gateway/DNS, ping to test gateway and DNS server connectivity, nslookup to test DNS resolution, and tracert to trace the path, narrowing the fault to IP, DNS, or a browser issue.",
    quizQuestions: [
      {
        text: "A user runs ipconfig and sees their IP is 192.168.1.45 with gateway 192.168.1.1. They can ping 8.8.8.8 (Google's DNS) but cannot open any websites in the browser. What is MOST likely the issue?",
        options: [
          "The user's computer is blocked by the company firewall from accessing the internet",
          "DNS resolution is likely failing—the user can reach IPs directly but cannot resolve domain names; running nslookup google.com will confirm whether the DNS server is returning correct results",
          "The browser is corrupted and needs to be reinstalled",
          "The gateway is routing to the wrong upstream provider"
        ],
        correctIndex: 1,
        explanation: "Pinging IPs successfully but failing to open websites is the classic DNS failure symptom. Websites use domain names, not IPs—if DNS cannot resolve the name to an IP, the browser cannot connect regardless of network connectivity."
      },
      {
        text: "A Windows 11 user needs to find out which process is using port 8080 on their machine so they can stop it. Which command provides this information?",
        options: [
          "ping localhost:8080",
          "netstat -ano | findstr :8080",
          "tracert 8080",
          "ipconfig /all | findstr 8080"
        ],
        correctIndex: 1,
        explanation: "netstat -ano shows all active connections with the associated process ID (PID). Piping through findstr :8080 filters to just that port. The PID can then be matched to a process in Task Manager."
      },
      {
        text: "A technician changes a Windows workstation's DNS settings to use a public DNS server (8.8.8.8). The computer can now resolve external websites but can no longer find internal company servers by hostname. What did this change break?",
        options: [
          "The firewall rule that allowed DNS traffic to the internal DNS server",
          "Internal DNS resolution—the company's internal DNS server resolves internal hostnames (like fileserver.company.local) that the public DNS server has no knowledge of; the internal DNS server must be used for internal name resolution",
          "The DHCP lease, which automatically assigns internal DNS settings",
          "Windows networking stack, which requires DNS servers to be configured via DHCP rather than manually"
        ],
        correctIndex: 1,
        explanation: "Internal DNS servers resolve private hostnames that do not exist in public DNS. Replacing the internal DNS with a public server breaks resolution of all internal names—shared drives, intranet sites, and internal services all fail."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-a-professional-certificate:mission:comptia-a-course-6",
    courseSlug: "comptia-a-course-6",
    programSlug: "comptia-a-professional-certificate",
    programTitle: "CompTIA A+ Professional Certificate",
    courseTitle: "Advanced Networking, Security, and IT Operations",
    missionName: "Systems Pro",
    missionTagline: "Prove you can secure systems and manage IT operations professionally",
    primaryAxis: "Engineering",
    skillLabels: ["Security hardening", "Active Directory", "Endpoint management", "Troubleshooting", "Problem-solving"],
    scenarioPrompt: "You are onboarding a new employee at a company. You need to set up their Windows laptop, join it to the domain, configure appropriate user account permissions, and ensure the endpoint meets the company's security baseline. Using your advanced A+ skills from this course, walk through the setup process.",
    evidenceHint: "A strong response covers domain join procedure, creating a standard user account (not admin), configuring BitLocker, ensuring Windows Update is current, and installing endpoint protection—covering at least three security baseline items.",
    quizQuestions: [
      {
        text: "A new employee needs to install software for their job but their account does not have local administrator rights. The company policy requires standard user accounts. What is the CORRECT procedure?",
        options: [
          "Promote the employee's account to local administrator so they can install software independently",
          "Have an IT administrator install the approved software using their elevated credentials, then remove admin access; software installation should go through an IT approval and deployment process, not end-user admin rights",
          "Ask the employee to download and install software in their user profile folder where admin rights are not required",
          "Give the employee temporary admin access for 24 hours so they can install what they need"
        ],
        correctIndex: 1,
        explanation: "Standard user accounts are a security control that limits the blast radius of malware and prevents unauthorized software installation. IT-managed software deployment maintains this control while still meeting legitimate business needs."
      },
      {
        text: "An employee's laptop is stolen. The laptop was joined to the domain but BitLocker was not enabled. What is the PRIMARY security risk?",
        options: [
          "The attacker can join the stolen laptop to a different domain and access company email",
          "The attacker can boot from a USB drive or remove the hard drive to read all file contents without needing Windows credentials—BitLocker encrypts the drive so data is unreadable without the recovery key",
          "The attacker can use the laptop's saved Wi-Fi credentials to access the company network",
          "The attacker can factory reset the laptop and sell it, causing only asset loss with no data exposure"
        ],
        correctIndex: 1,
        explanation: "Windows passwords protect against logging in through the OS, but an unencrypted drive can be read directly from another machine. BitLocker full-disk encryption ensures stolen hardware does not become a data breach."
      },
      {
        text: "After joining a Windows laptop to a corporate domain, the user logs in with their domain credentials but their desktop preferences, mapped drives, and browser bookmarks from their previous machine are not present. What should the IT technician configure?",
        options: [
          "Reinstall Windows on the new laptop and restore from a backup of the old machine",
          "Ensure the user's roaming profile or folder redirection Group Policy is configured so their Desktop, Documents, and profile settings are stored on the domain server and follow the user to any domain-joined machine",
          "Manually copy the user's profile folder from the old machine to the new one",
          "Ask the user to recreate their preferences manually since profile migration is not supported between machines"
        ],
        correctIndex: 1,
        explanation: "Roaming profiles and folder redirection via Group Policy store user data on domain servers so it follows users to any domain-joined machine—the enterprise solution for consistent user experience across hardware."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-a-professional-certificate:mission:comptia-a-course-7",
    courseSlug: "comptia-a-course-7",
    programSlug: "comptia-a-professional-certificate",
    programTitle: "CompTIA A+ Professional Certificate",
    courseTitle: "Practice Exams for CompTIA A+ Core 1 & Core 2",
    missionName: "Data Detective",
    missionTagline: "Prove you are ready to pass the CompTIA A+ exam",
    primaryAxis: "Analytics",
    skillLabels: ["Exam readiness", "Troubleshooting methodology", "Hardware knowledge", "Security concepts", "Critical thinking"],
    scenarioPrompt: "You are in a study session preparing for the CompTIA A+ Core 1 and Core 2 exams. You have completed all content but your practice exam scores are 68%—below the passing threshold of 75%. Using your exam preparation skills from this course, describe the targeted study strategy you would use in the remaining two weeks.",
    evidenceHint: "A strong response analyzes which domain areas scored lowest, focuses additional practice on those specific objectives, uses performance-based question simulations, and paces review to avoid cramming the final 24 hours.",
    quizQuestions: [
      {
        text: "A CompTIA A+ candidate scores 82% on hardware topics but 54% on security topics. With two weeks left, how should they allocate their study time?",
        options: [
          "Split time evenly across all topics to ensure comprehensive coverage of the exam objectives",
          "Allocate the majority of study time to security topics where the score gap is largest, using domain-specific practice questions to build the missing knowledge, while doing lighter review of hardware to maintain that strength",
          "Focus entirely on security and do not review hardware at all since it is already above passing threshold",
          "Take the exam immediately while hardware knowledge is strong, then retake it after studying security"
        ],
        correctIndex: 1,
        explanation: "Targeted gap-based study is more efficient than uniform review. A 54% in security represents the highest-risk domain; focused practice in that area has the greatest impact on overall score improvement."
      },
      {
        text: "A student consistently fails performance-based questions (PBQs) on the A+ practice exam even though they know the concepts. What is the MOST likely reason and fix?",
        options: [
          "PBQs are graded differently from multiple-choice questions; the student should skip them on the real exam",
          "PBQs test applied skills in simulated scenarios, not just factual recall; the student needs to practice by doing—setting up virtual machines, running command-line tools, and simulating network configurations rather than reading about them",
          "The student is spending too much time on PBQs; they should answer them last and guess if necessary",
          "PBQs are only in Core 2; the student is practicing on the wrong exam objectives"
        ],
        correctIndex: 1,
        explanation: "Performance-based questions require hands-on applied skills that textbook study alone does not develop. Practical lab work with real tools builds the procedural memory needed to solve scenario-based problems under time pressure."
      },
      {
        text: "A candidate reads every practice question answer explanation—including the ones they got right. Why is this study technique effective for exam preparation?",
        options: [
          "It is not effective; reading explanations for correct answers wastes time that should be spent on missed questions",
          "Understanding WHY correct answers are right (not just which answer is right) deepens conceptual understanding, reveals common distractor patterns, and helps apply the same reasoning to novel questions on the real exam",
          "It helps memorize the exact wording of correct answers in case the same question appears on the real exam",
          "Reading all explanations increases total study hours, and more hours always correlates with higher scores"
        ],
        correctIndex: 1,
        explanation: "Conceptual understanding beats memorization on professional certification exams. Reading explanations for correct answers reveals the reasoning framework behind the answer—enabling application to new scenarios not seen in practice."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 13: CompTIA Network+ Professional Certificate ───────────────

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-1",
    courseSlug: "comptia-network-course-1",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "Introduction to Networking",
    missionName: "Code Architect",
    missionTagline: "Prove you understand the fundamentals of how networks function",
    primaryAxis: "Engineering",
    skillLabels: ["OSI model", "Network topologies", "Basic protocols", "Troubleshooting", "Problem-solving"],
    scenarioPrompt: "A manager asks you to explain in plain language how data gets from their laptop to a website server when they type a URL into a browser. Using your Introduction to Networking knowledge, walk through the process using the OSI model layers as a framework.",
    evidenceHint: "A strong response describes the DNS lookup, TCP connection establishment, and the data encapsulation journey down the OSI stack on the sender and decapsulation on the receiver—hitting at least four of the seven layers.",
    quizQuestions: [
      {
        text: "A network technician needs to understand at which OSI layer a router operates to troubleshoot a routing problem. Which layer is correct?",
        options: [
          "Layer 1 (Physical) — routers process electrical signals on network cables",
          "Layer 2 (Data Link) — routers use MAC addresses to forward frames between network segments",
          "Layer 3 (Network) — routers examine IP addresses to make forwarding decisions between networks",
          "Layer 4 (Transport) — routers inspect port numbers to prioritize traffic types"
        ],
        correctIndex: 2,
        explanation: "Routers operate at Layer 3 (Network) and use IP addresses to make forwarding decisions. Layer 2 switches use MAC addresses; Layer 4 devices like firewalls can inspect port numbers."
      },
      {
        text: "Data is sent from a laptop to a server. At which OSI layer does the data get divided into segments for reliable delivery?",
        options: [
          "Layer 2 (Data Link) — frames segment data for transmission over the local network",
          "Layer 3 (Network) — packets segment data for routing across networks",
          "Layer 4 (Transport) — TCP segments data into manageable pieces with sequence numbers for ordered, reliable delivery",
          "Layer 5 (Session) — the session layer divides data into logical units for each communication session"
        ],
        correctIndex: 2,
        explanation: "Layer 4 (Transport) is where TCP segments data and adds sequence numbers for ordered, reliable delivery. Segmentation enables large data transfers to be broken into manageable pieces that can be reassembled correctly."
      },
      {
        text: "A network engineer says two offices are connected at 'Layer 1.' What does this mean in practical terms?",
        options: [
          "The offices share the same IP address range and routing table",
          "The offices are connected at the physical layer—using a physical medium like fiber optic cable, copper cable, or wireless radio frequency to transmit raw bits between locations",
          "The offices use the same application protocols for communication",
          "The offices are managed by the same network administrator and use identical configurations"
        ],
        correctIndex: 1,
        explanation: "Layer 1 (Physical) refers to the actual physical transmission medium—cables, connectors, and signals. A Layer 1 connection between offices means a physical medium (often fiber or microwave) carries raw bit streams between them."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-2",
    courseSlug: "comptia-network-course-2",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "Networking Fundamentals",
    missionName: "Tech Builder",
    missionTagline: "Prove you can configure and verify basic network settings",
    primaryAxis: "Engineering",
    skillLabels: ["IP addressing", "Subnetting", "DHCP", "DNS", "Problem-solving"],
    scenarioPrompt: "You are setting up a small office network from scratch. The office has 20 users, a shared printer, and needs internet access. Using your networking fundamentals from this course, describe how you would design the IP address scheme, configure DHCP, and ensure DNS works correctly.",
    evidenceHint: "A strong response chooses an appropriate private subnet (e.g., 192.168.1.0/24), explains DHCP scope configuration with a range excluding the printer's static IP, and describes setting the DNS server address in DHCP options.",
    quizQuestions: [
      {
        text: "An office has 20 computers, all receiving IPs via DHCP. The printer must always have the same IP so print jobs can be directed to it reliably. What is the BEST approach?",
        options: [
          "Assign the printer an IP address outside the DHCP scope range and configure it as a static IP on the printer itself, ensuring DHCP never assigns that address to another device",
          "Configure the DHCP server to give the printer a new IP each time but remember to update the print server configuration after each renewal",
          "Give the printer and all computers static IP addresses since DHCP is unreliable for office environments",
          "Reserve the last IP in the subnet (e.g., 192.168.1.254) for the printer by configuring it as a DHCP exclusion only—no static configuration needed"
        ],
        correctIndex: 0,
        explanation: "Static IP assignment on the device itself (or a DHCP reservation by MAC address) is the standard approach for printers and servers that need a predictable address. The static IP must fall outside the DHCP scope to prevent conflicts."
      },
      {
        text: "A network has the IP range 192.168.10.0/24. How many usable host addresses does this provide?",
        options: [
          "256 usable addresses",
          "254 usable addresses — the network address (192.168.10.0) and broadcast address (192.168.10.255) are reserved and cannot be assigned to hosts",
          "255 usable addresses",
          "252 usable addresses because routers, DNS, and DHCP servers each reserve one address"
        ],
        correctIndex: 1,
        explanation: "A /24 subnet has 256 total addresses (2^8). The first address is the network address and the last is the broadcast address—both unusable for hosts. This leaves 254 usable host addresses."
      },
      {
        text: "Users on a new office network can access websites by IP address (e.g., ping 8.8.8.8 works) but cannot access websites by name (e.g., google.com fails). What is misconfigured?",
        options: [
          "The default gateway is pointed to the wrong router",
          "The DNS server address in the DHCP configuration is missing or incorrect—clients are not receiving a valid DNS server to resolve domain names to IP addresses",
          "The subnet mask is wrong, preventing the clients from recognizing the DNS server on the local network",
          "The ISP's upstream DNS server is temporarily offline"
        ],
        correctIndex: 1,
        explanation: "IP connectivity works (ping to IP succeeds) but name resolution fails—this is a DNS configuration issue. The DHCP server option 6 (DNS Server) is the most common place where the DNS server address is missing or wrong."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-3",
    courseSlug: "comptia-network-course-3",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "Introduction to Contemporary Operating Systems and Hardware",
    missionName: "Systems Pro",
    missionTagline: "Prove you can support networking across different operating systems",
    primaryAxis: "Engineering",
    skillLabels: ["Cross-platform networking", "Linux networking", "Windows networking", "Troubleshooting", "Problem-solving"],
    scenarioPrompt: "Your company has a mixed environment of Windows and Linux servers. A Linux web server cannot communicate with a Windows file server. Both are on the same network segment. Using your cross-platform networking knowledge, describe the diagnostic commands you would use on each OS and the most common causes of this failure.",
    evidenceHint: "A strong response uses ping and ip addr on Linux, ping and ipconfig on Windows, identifies the most common causes (firewall rules, name resolution, SMB port accessibility), and names the relevant ports.",
    quizQuestions: [
      {
        text: "On a Linux server, you run 'ip addr' and see the network interface shows 'state DOWN'. What does this indicate and what command would you use to bring it up?",
        options: [
          "The interface cable is disconnected; run 'ip link set eth0 up' to signal the switch to reconnect",
          "The network interface is administratively disabled; run 'ip link set eth0 up' (replacing eth0 with the actual interface name) to enable it",
          "The server is not connected to the internet; 'state DOWN' refers to WAN connectivity only",
          "The interface driver needs to be reinstalled; 'state DOWN' indicates a driver failure"
        ],
        correctIndex: 1,
        explanation: "An interface in 'state DOWN' is administratively disabled or not connected. The 'ip link set [interface] up' command enables the interface at Layer 2 so it can communicate on the network."
      },
      {
        text: "A Linux server can ping a Windows file server by IP but cannot connect to its SMB file shares. What is the MOST likely cause?",
        options: [
          "Linux does not support SMB connections; a different file-sharing protocol must be used",
          "The Windows firewall may be blocking SMB ports (TCP 445) from the Linux server's IP; or the Linux client needs the Samba client package installed to communicate over the SMB protocol",
          "The Linux server needs to be in the same Windows domain as the file server to access shares",
          "SMB traffic requires a Layer 2 VLAN tag that Linux networking does not support by default"
        ],
        correctIndex: 1,
        explanation: "SMB connectivity requires TCP port 445 to be open through the Windows firewall and the appropriate client software (samba-client or cifs-utils on Linux). Ping success confirms IP connectivity but does not test application-layer protocols."
      },
      {
        text: "You need to test whether TCP port 443 is open on a remote server from a Linux machine without a browser or specialized tool. Which command works?",
        options: [
          "ping remote-server -p 443",
          "nc -zv remote-server 443  (or: telnet remote-server 443)",
          "traceroute remote-server --port 443",
          "nslookup remote-server 443"
        ],
        correctIndex: 1,
        explanation: "netcat (nc) with -z (scan without sending data) and -v (verbose) tests TCP connectivity to a specific port. Ping tests ICMP only and cannot test specific TCP ports; traceroute does not test specific port connectivity."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-4",
    courseSlug: "comptia-network-course-4",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "Introduction to Networking and Storage",
    missionName: "Code Architect",
    missionTagline: "Prove you can design and troubleshoot networked storage solutions",
    primaryAxis: "Engineering",
    skillLabels: ["NAS/SAN", "Network storage", "iSCSI", "Troubleshooting", "Problem-solving"],
    scenarioPrompt: "A small business wants to add centralized file storage so all employees can access shared files from their workstations. They have a 1Gbps office network. Using your networking and storage knowledge from this course, compare NAS and SAN for this use case and recommend the appropriate solution.",
    evidenceHint: "A strong response explains NAS (file-level access, SMB/NFS, simpler, lower cost) vs. SAN (block-level, iSCSI/Fibre Channel, higher performance, higher cost/complexity) and recommends NAS for a small business file-sharing use case.",
    quizQuestions: [
      {
        text: "A small business wants shared file storage that employees access from Windows and Mac laptops. Which storage technology is MOST appropriate?",
        options: [
          "SAN with Fibre Channel, because it provides the highest performance for any storage workload",
          "NAS (Network-Attached Storage) using SMB/CIFS for Windows and NFS or SMB for Mac, because it provides file-level access over the existing Ethernet network without requiring specialized hardware",
          "DAS (Direct-Attached Storage) connected to one workstation and shared over the network",
          "iSCSI SAN, because it uses the existing Ethernet network and is therefore equivalent to NAS in cost and complexity"
        ],
        correctIndex: 1,
        explanation: "NAS is designed for file-level sharing over standard Ethernet, making it the natural fit for multi-user file access in a small business. SAN provides block-level storage suited for databases and VMs—more complex and costly than needed here."
      },
      {
        text: "A NAS device shows all lights as normal but users cannot access file shares. Ping to the NAS IP succeeds from all workstations. What should be checked NEXT?",
        options: [
          "Replace the NAS device since hardware failure is the most common cause of share inaccessibility",
          "Verify the file sharing service (SMB/CIFS) is running on the NAS, check firewall rules for SMB ports (TCP 445), and confirm the share permissions allow the affected user accounts",
          "Reboot all workstations to refresh the network connection to the NAS",
          "Check the NAS capacity—full storage devices stop serving shares until space is freed"
        ],
        correctIndex: 1,
        explanation: "Ping success confirms network reachability. Service-level inaccessibility with network connectivity points to the sharing service being stopped, firewall blocking the SMB port, or permission configuration—not physical connectivity."
      },
      {
        text: "A company's backup solution uses iSCSI to connect a backup server to a SAN over the existing 1Gbps network. Backup jobs are taking 6 hours instead of the expected 2 hours. What should be investigated first?",
        options: [
          "The SAN hardware is too old and needs to be replaced with a newer model",
          "Network utilization during backup—iSCSI competes with regular office traffic on the shared 1Gbps network; running backups during low-traffic hours or dedicating a separate NIC for iSCSI traffic are common solutions",
          "The backup software is misconfigured and should be reinstalled",
          "The backup target is full and writing is slower due to storage pressure"
        ],
        correctIndex: 1,
        explanation: "iSCSI over shared Ethernet competes for bandwidth with regular office traffic. Backup throughput is often limited by network contention rather than storage performance—isolating iSCSI to a dedicated NIC or VLAN is a standard optimization."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-5",
    courseSlug: "comptia-network-course-5",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "Basics of Cisco Networking",
    missionName: "Tech Builder",
    missionTagline: "Prove you can configure and verify basic Cisco network devices",
    primaryAxis: "Engineering",
    skillLabels: ["Cisco IOS", "Switch configuration", "VLANs", "Routing basics", "Problem-solving"],
    scenarioPrompt: "You are configuring a new Cisco switch for a company that has two departments—HR and Engineering—which should not see each other's traffic. Using your Cisco networking basics, describe the commands you would use to create VLANs for each department and assign ports to the correct VLAN.",
    evidenceHint: "A strong response shows the IOS commands for vlan database or config mode VLAN creation, interface assignment with switchport mode access and switchport access vlan, and explains the purpose of VLAN segmentation.",
    quizQuestions: [
      {
        text: "A network administrator connects two Cisco switches and needs all VLANs to pass between them. Which port configuration should be used on the inter-switch link?",
        options: [
          "Access mode on both ends, with VLAN 1 assigned to carry all traffic",
          "Trunk mode (802.1Q) on both switch ports, which allows frames from multiple VLANs to traverse the link using VLAN tags",
          "Routed mode, which enables Layer 3 routing between the switches",
          "Monitor mode, which forwards all VLANs without requiring configuration"
        ],
        correctIndex: 1,
        explanation: "802.1Q trunk ports tag Ethernet frames with VLAN IDs, allowing traffic from multiple VLANs to share a single physical link between switches. Access ports carry untagged traffic for a single VLAN only."
      },
      {
        text: "After assigning a Cisco switch port to VLAN 20 with the command 'switchport access vlan 20', the connected device cannot communicate with other devices on VLAN 20. What should be checked first?",
        options: [
          "The connected device's IP address may be on the wrong subnet for VLAN 20",
          "Verify the port is in access mode with 'show interfaces [port] switchport' and confirm VLAN 20 exists in the VLAN database with 'show vlan brief'—a non-existent VLAN prevents communication",
          "The device's network cable needs to be replaced with a Category 6 cable for VLAN support",
          "The switch needs to be rebooted for VLAN assignments to take effect"
        ],
        correctIndex: 1,
        explanation: "Assigning a port to a VLAN that does not exist in the switch's VLAN database silently fails—the port joins the VLAN but traffic is not forwarded. Verifying the VLAN exists in 'show vlan brief' is a critical diagnostic step."
      },
      {
        text: "A Cisco switch shows the following output: 'FastEthernet0/1 is down, line protocol is down.' What does this MOST likely indicate?",
        options: [
          "The switch port has been administratively shut down using the 'shutdown' command",
          "There is a physical layer issue—most commonly no cable connected, a faulty cable, or a connected device that is powered off—the interface has no active signal at the physical layer",
          "The port's VLAN assignment has been removed, causing the logical interface to go down",
          "The port is in half-duplex mode and cannot detect the connected device's full-duplex signal"
        ],
        correctIndex: 1,
        explanation: "'Line protocol is down' alongside 'interface is down' indicates a physical layer failure—no signal is being received. Cable connectivity, cable health, and the connected device's power state are the first things to check."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-6",
    courseSlug: "comptia-network-course-6",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "CCNA Foundations",
    missionName: "Systems Pro",
    missionTagline: "Prove you have the foundation-level skills for Cisco certification",
    primaryAxis: "Engineering",
    skillLabels: ["OSPF/routing protocols", "ACLs", "Cisco IOS", "Network design", "Problem-solving"],
    scenarioPrompt: "You are setting up a Cisco router for a branch office. The office has a local LAN and needs to route traffic to headquarters over a WAN link. You need to configure a static route to headquarters and an access control list to block certain traffic. Walk through the IOS commands you would use.",
    evidenceHint: "A strong response shows the ip route command syntax for a static route, demonstrates a basic ACL with permit/deny rules and access-group application to an interface, and explains the implicit deny-all at the end of every ACL.",
    quizQuestions: [
      {
        text: "A network engineer configures an access control list with these entries: permit 192.168.10.0 0.0.0.255; deny any. Which traffic is allowed?",
        options: [
          "All traffic from all networks except 192.168.10.0/24",
          "Only traffic from the 192.168.10.0/24 subnet is permitted; all other traffic is denied by the explicit deny any rule",
          "No traffic is allowed since the deny any overrides everything above it",
          "Traffic from 192.168.10.0/24 is allowed outbound only; all inbound traffic is denied"
        ],
        correctIndex: 1,
        explanation: "ACLs are processed top-to-bottom and the first matching rule applies. Traffic from 192.168.10.0/24 matches the first permit rule and is allowed. All other traffic falls through to the deny any rule and is blocked."
      },
      {
        text: "A Cisco router has a static route to 10.10.0.0/16 via 192.168.1.1. A new network 10.10.5.0/24 needs to use a different path via 192.168.1.2. What routing principle determines which route the router uses for traffic destined to 10.10.5.1?",
        options: [
          "The static route entered first takes precedence regardless of prefix length",
          "Longest prefix match — the more specific /24 route (10.10.5.0/24) matches 10.10.5.1 before the less specific /16 route does; traffic goes via 192.168.1.2",
          "Administrative distance — static routes always have lower distance than dynamic routes",
          "Load balancing — the router splits traffic between both routes equally"
        ],
        correctIndex: 1,
        explanation: "Longest prefix match is the fundamental IP routing decision rule. A /24 route is more specific than a /16 route and always wins for addresses within its range—enabling traffic engineering by adding more specific routes."
      },
      {
        text: "You apply an ACL to an interface with the command 'ip access-group 101 in'. What does the 'in' keyword specify?",
        options: [
          "The ACL is an inbound rule that the interface evaluates as traffic enters the router from that interface",
          "The ACL allows inbound internet traffic only and blocks all outbound traffic",
          "The ACL is stored in the router's internal memory (RAM) rather than flash storage",
          "The ACL applies to inbound management traffic like SSH and Telnet only"
        ],
        correctIndex: 0,
        explanation: "The 'in' keyword applies the ACL to traffic arriving on the interface (entering the router). 'Out' applies it to traffic leaving through that interface. Direction matters critically for ACL placement and effectiveness."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-7",
    courseSlug: "comptia-network-course-7",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "TCP/IP and Advanced Topics",
    missionName: "Code Architect",
    missionTagline: "Prove you understand TCP/IP deeply enough to troubleshoot complex issues",
    primaryAxis: "Engineering",
    skillLabels: ["TCP/IP stack", "IPv6", "Network protocols", "Packet analysis", "Problem-solving"],
    scenarioPrompt: "A developer reports their application is intermittently dropping connections to a remote server over TCP. The connections seem to establish fine but drop after a few minutes of idle time. Using your TCP/IP knowledge from this course, explain the likely cause and how to diagnose and fix it.",
    evidenceHint: "A strong response identifies TCP keepalive or NAT session timeout as the likely cause, explains how NAT tables expire idle TCP sessions, and recommends enabling TCP keepalives or adjusting the application's connection pooling.",
    quizQuestions: [
      {
        text: "A TCP connection is established successfully but the session drops after exactly 5 minutes of inactivity every time. What is the MOST likely cause?",
        options: [
          "The TCP retransmission timer is set to 5 minutes and drops the connection after that period",
          "A stateful firewall or NAT device between the client and server has a 5-minute idle session timeout that removes the connection tracking entry—subsequent packets find no matching session and are dropped",
          "The server application has a 5-minute idle timeout configured in its connection settings",
          "TCP's TIME_WAIT state expires after 5 minutes and the connection cannot be reused"
        ],
        correctIndex: 1,
        explanation: "NAT and stateful firewall session tables expire idle TCP sessions to free memory. When packets arrive for an expired session, the device has no record of the connection and drops the packets—causing the application-layer timeout."
      },
      {
        text: "A packet capture shows TCP retransmissions every 3 seconds for a specific connection, but pings between the same hosts succeed with normal latency. What does this indicate?",
        options: [
          "The network path has severe packet loss affecting all traffic types",
          "The retransmissions are specific to that TCP session—possible causes include a misconfigured TCP window size, selective packet drops by a firewall targeting that specific flow, or an application-level acknowledgment delay",
          "The target server is overloaded and cannot process all incoming TCP connections",
          "The DNS name is resolving to the wrong IP, causing packets to take an incorrect path"
        ],
        correctIndex: 1,
        explanation: "Retransmissions on one flow with clean pings indicate a session-specific problem rather than general network loss. Firewalls that rate-limit or drop specific flows, window size mismatches, and application ACK delays all cause this pattern."
      },
      {
        text: "An organization migrating to IPv6 finds that some systems can communicate with each other over IPv6 but cannot reach IPv6 internet resources. What is the MOST likely cause?",
        options: [
          "IPv6 requires a separate physical network from IPv4 and the cables are cross-connected",
          "The default IPv6 gateway is not configured or is incorrect—internal IPv6 communication works because hosts discover each other via NDP, but routing to external IPv6 addresses requires a properly configured gateway",
          "IPv6 is not supported on the internet; only internal networks can use IPv6",
          "The IPv6 addresses are in the wrong prefix range and need to be reassigned to the correct global unicast range"
        ],
        correctIndex: 1,
        explanation: "IPv6 hosts use Neighbor Discovery Protocol for local communication without a gateway. Reaching external IPv6 resources requires a gateway router that knows how to forward IPv6 traffic to the ISP's IPv6 upstream."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-8",
    courseSlug: "comptia-network-course-8",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "Operating Systems and Networking Fundamentals",
    missionName: "Tech Builder",
    missionTagline: "Prove you can configure network settings across operating systems",
    primaryAxis: "Engineering",
    skillLabels: ["Network configuration", "Windows/Linux", "Command-line tools", "Troubleshooting", "Problem-solving"],
    scenarioPrompt: "You are supporting a mixed Windows and Ubuntu Linux environment. An Ubuntu workstation cannot reach the internet while Windows machines on the same switch work fine. Using your cross-platform networking skills from this course, describe the diagnostic commands specific to Ubuntu you would use.",
    evidenceHint: "A strong response uses ip addr to check the interface, ip route to verify the default gateway, cat /etc/resolv.conf to check DNS, ping to test connectivity levels, and systemctl status NetworkManager to check the network service.",
    quizQuestions: [
      {
        text: "An Ubuntu workstation's ip addr output shows the main network interface with no IPv4 address. What command should the technician run next to attempt to obtain an IP from DHCP?",
        options: [
          "sudo ifconfig eth0 dhcp",
          "sudo dhclient eth0  (or the appropriate interface name)",
          "sudo ip addr add dhcp dev eth0",
          "sudo netplan apply --dhcp"
        ],
        correctIndex: 1,
        explanation: "dhclient manually triggers a DHCP request on the specified interface. This is the standard command for forcing IP address acquisition on Ubuntu when the interface is up but has no address from DHCP."
      },
      {
        text: "A Linux workstation has a valid IP and can ping its default gateway but cannot ping 8.8.8.8 (an external IP). What does this indicate?",
        options: [
          "The default gateway IP is wrong; the workstation is pinging itself instead of the router",
          "The gateway is not routing traffic to the internet—possible causes include a routing table issue on the router, an upstream ISP problem, or a firewall rule blocking outbound ICMP beyond the local network",
          "The workstation's DNS is misconfigured and cannot resolve 8.8.8.8 as a domain name",
          "8.8.8.8 blocks ICMP ping requests from certain networks; use a different test IP"
        ],
        correctIndex: 1,
        explanation: "Pinging the gateway succeeds (local routing works) but external IPs fail—the problem is at or beyond the gateway. The router is either not forwarding to the internet, has a broken route, or the ISP link is down."
      },
      {
        text: "A technician checks /etc/resolv.conf on a Linux server and sees it is empty. What effect does this have on the server's network functionality?",
        options: [
          "No effect—Linux automatically queries DNS servers discovered via DHCP without requiring resolv.conf",
          "DNS name resolution will fail for all hostname lookups; the server can still communicate by IP address but cannot resolve domain names until a valid nameserver entry is added to resolv.conf",
          "The server will use the system's hosts file exclusively, resolving only hostnames manually added to /etc/hosts",
          "The empty file disables all network interfaces until resolv.conf is populated"
        ],
        correctIndex: 1,
        explanation: "resolv.conf specifies the DNS servers for name resolution. An empty file means no DNS server is configured—hostname lookups fail. IP-based communication still works, but any service that relies on domain names (websites, NTP, etc.) will break."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-network-professional-certificate:mission:comptia-network-course-9",
    courseSlug: "comptia-network-course-9",
    programSlug: "comptia-network-professional-certificate",
    programTitle: "CompTIA Network+ Professional Certificate",
    courseTitle: "Network Foundations and Addressing",
    missionName: "Systems Pro",
    missionTagline: "Prove you can design and troubleshoot network addressing schemes",
    primaryAxis: "Engineering",
    skillLabels: ["Subnetting", "IPv4/IPv6", "VLSM", "Network design", "Problem-solving"],
    scenarioPrompt: "A company is opening three new branch offices and needs you to subnet their 192.168.50.0/24 network to give each branch exactly 50 usable host addresses, with as little waste as possible. Using your subnetting skills from this course, calculate the appropriate subnet mask and show the three subnets.",
    evidenceHint: "A strong response identifies /26 (64 addresses, 62 usable) as the minimum subnet size for 50 hosts, lists three non-overlapping /26 subnets from the 192.168.50.0/24 space, and explains the calculation.",
    quizQuestions: [
      {
        text: "A network requires 50 usable host addresses per subnet. Which subnet mask provides the MINIMUM number of addresses that meets this requirement?",
        options: [
          "/25 (subnet mask 255.255.255.128) providing 126 usable addresses",
          "/26 (subnet mask 255.255.255.192) providing 62 usable addresses — this is the smallest subnet that accommodates 50 hosts (2^6 - 2 = 62 ≥ 50)",
          "/27 (subnet mask 255.255.255.224) providing 30 usable addresses",
          "/24 (subnet mask 255.255.255.0) providing 254 usable addresses"
        ],
        correctIndex: 1,
        explanation: "A /26 gives 6 host bits (2^6 = 64 total, 62 usable). This is the smallest subnet where 62 ≥ 50 required hosts. A /27 gives only 30 usable addresses—insufficient. VLSM principles prefer the most efficient subnet size."
      },
      {
        text: "An organization is running out of IPv4 addresses internally. Their IT manager proposes switching to the 10.0.0.0/8 private range. A network engineer says this provides 16,777,214 usable addresses. How is this calculated?",
        options: [
          "The /8 prefix means 8 bits are used for the network, leaving 24 bits for hosts: 2^24 = 16,777,216 total, minus 2 reserved = 16,777,214 usable",
          "The 10.x.x.x range spans from 10.0.0.1 to 10.255.255.254, which is counted manually",
          "The /8 means the network has 8 subnets, each with 2,097,152 addresses",
          "IPv4 addressing maxes out at 16,777,216 regardless of prefix; this is a coincidence"
        ],
        correctIndex: 0,
        explanation: "A /8 prefix uses 8 bits for the network portion, leaving 24 host bits. 2^24 = 16,777,216 total addresses minus the network address and broadcast address = 16,777,214 usable—the standard formula."
      },
      {
        text: "Two subnets are defined: 192.168.1.0/25 and 192.168.1.128/25. A host is assigned the IP 192.168.1.130. The network administrator claims this host is on the first subnet. Are they correct?",
        options: [
          "Yes, because 192.168.1.130 falls within the 192.168.1.0 network range",
          "No, because 192.168.1.128/25 covers 192.168.1.128 through 192.168.1.255—address .130 falls in the second subnet, not the first",
          "Yes, because .130 is less than 192 and both subnets share the same /25 mask",
          "There is not enough information to determine which subnet .130 belongs to without knowing the gateway IP"
        ],
        correctIndex: 1,
        explanation: "A /25 divides the /24 exactly in half: first half is .0-.127, second half is .128-.255. The address .130 falls in the second subnet (192.168.1.128/25). The administrator is incorrect."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 14: CompTIA Security+ Professional Certificate ──────────────

  {
    key: "comptia-security-professional-certificate:mission:comptia-security-course-1",
    courseSlug: "comptia-security-course-1",
    programSlug: "comptia-security-professional-certificate",
    programTitle: "CompTIA Security+ Professional Certificate",
    courseTitle: "Network Security Fundamentals",
    missionName: "Code Architect",
    missionTagline: "Prove you can identify and defend against network-level threats",
    primaryAxis: "Engineering",
    skillLabels: ["Network security architecture", "Firewalls", "IDS/IPS", "DMZ design", "Problem-solving"],
    scenarioPrompt: "A company asks you to design a network security architecture for a web application that must be accessible from the internet while protecting the internal corporate network. Using your network security fundamentals from this course, describe the architecture including DMZ placement, firewall rules, and monitoring controls.",
    evidenceHint: "A strong response places the web server in a DMZ between two firewalls, restricts traffic from the DMZ to the internal network to specific allowed ports, places an IDS/IPS for monitoring, and explains the defense-in-depth principle.",
    quizQuestions: [
      {
        text: "A web server in a DMZ needs to query a database on the internal network. Which firewall rule set BEST follows the principle of least privilege?",
        options: [
          "Allow all traffic from the DMZ to the internal network to ensure the web application can access any resource it needs",
          "Allow only traffic from the web server's specific IP to the database server's IP on the specific database port (e.g., TCP 3306 for MySQL), and deny all other DMZ-to-internal traffic",
          "Block all traffic from the DMZ to the internal network and use a reverse proxy to handle database queries",
          "Allow the DMZ to initiate connections to the internal network on ports 80 and 443 only"
        ],
        correctIndex: 1,
        explanation: "Least privilege firewalling restricts traffic to the exact source IP, destination IP, and port required for legitimate operation. Any other traffic from the DMZ to the internal network should be denied—limiting the blast radius of a compromised DMZ server."
      },
      {
        text: "An IDS fires an alert for a port scan originating from an IP inside the corporate network targeting internal servers. What does this most likely indicate?",
        options: [
          "A network administrator is running an authorized vulnerability scan and the IDS is generating a false positive",
          "A device inside the network may be compromised and conducting reconnaissance—potentially part of a lateral movement phase of an attack; the alert should be investigated immediately",
          "The IDS signature database is outdated and incorrectly flagging normal network discovery traffic",
          "A developer is testing a new network monitoring tool and the traffic pattern matches a port scan signature"
        ],
        correctIndex: 1,
        explanation: "Internal port scanning is a red flag for lateral movement—a common attacker behavior after initial compromise. While authorized scans are possible, an unexplained internal scan requires immediate investigation to rule out compromise."
      },
      {
        text: "A company's DMZ contains a public web server and a public email server. Both need to accept traffic from the internet, but only on specific ports. Which firewall rule type BEST describes the minimum required inbound rules?",
        options: [
          "Permit any traffic from any internet IP to any IP in the DMZ",
          "Permit TCP 80 and 443 to the web server IP, permit TCP 25 to the email server IP, and deny all other inbound traffic to the DMZ by default",
          "Permit all TCP traffic to the DMZ but use IDS to block malicious packets",
          "Permit inbound traffic from trusted countries only using geo-blocking"
        ],
        correctIndex: 1,
        explanation: "Allowing only the specific ports and destination IPs needed for each public service implements the least privilege principle. A default deny-all with specific permit exceptions is the standard secure inbound rule architecture."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-security-professional-certificate:mission:comptia-security-course-2",
    courseSlug: "comptia-security-course-2",
    programSlug: "comptia-security-professional-certificate",
    programTitle: "CompTIA Security+ Professional Certificate",
    courseTitle: "Security Threats and Vulnerabilities",
    missionName: "Tech Builder",
    missionTagline: "Prove you can identify and categorize security threats accurately",
    primaryAxis: "Engineering",
    skillLabels: ["Malware types", "Social engineering", "Attack vectors", "Threat intelligence", "Critical thinking"],
    scenarioPrompt: "Your company's security team receives a report that an employee's computer has been sending data to an unknown external IP address at night. Investigation reveals the computer has software installed that disguises itself as a system utility but includes a remote access component. Using your threats and vulnerabilities knowledge from this course, classify this threat and describe the appropriate response.",
    evidenceHint: "A strong response identifies this as a Trojan horse with RAT (Remote Access Trojan) characteristics, explains the attack vector (social engineering or drive-by download), describes containment (network isolation) and eradication (reimaging), and recommends preventive controls.",
    quizQuestions: [
      {
        text: "An employee receives an email with an attachment labeled 'Q3 Salary Review.pdf.exe'. They open it, nothing visible happens, but their antivirus starts alerting on unusual activity. What type of malware is this MOST likely?",
        options: [
          "A virus, because it spreads to other files on the computer after execution",
          "A Trojan horse—malware disguised as a legitimate file that executes malicious code when opened, without the user realizing anything harmful occurred",
          "Ransomware, because it encrypts files and the antivirus is detecting the encryption activity",
          "A worm, because it arrived via email and may spread to the employee's contacts automatically"
        ],
        correctIndex: 1,
        explanation: "A double extension (.pdf.exe) disguises an executable as a document—a classic Trojan horse delivery method. The malware executes when opened, performs its malicious action silently, and presents no obvious symptoms to the user."
      },
      {
        text: "A security analyst receives a report of a zero-day vulnerability in a widely used enterprise software product. The vendor has not released a patch. What is the MOST appropriate immediate response?",
        options: [
          "Wait for the vendor's patch since there is no actionable step without an official fix",
          "Apply compensating controls: temporarily isolate affected systems from the internet if possible, increase monitoring for exploitation indicators, block known attack vectors (e.g., specific file types or network indicators), and apply virtual patching via WAF or IPS if signatures are available",
          "Uninstall the affected software immediately, accepting the loss of functionality until a patch is released",
          "Notify the vendor and wait 90 days per responsible disclosure norms before taking internal action"
        ],
        correctIndex: 1,
        explanation: "Zero-day response requires compensating controls when a patch is unavailable. Compensating controls reduce the attack surface while the permanent fix is developed—waiting for a patch without any mitigation is unacceptable."
      },
      {
        text: "An attacker sends 10,000 emails to a company's employees, each personalizing the message with the recipient's name, manager's name, and project they are working on. What type of attack is this and why is it more dangerous than a generic phishing campaign?",
        options: [
          "A brute force attack using social data to guess employee passwords through email",
          "Spear phishing—targeted phishing that uses personalized information to increase credibility and click-through rates; it is more dangerous because the personalization makes the email harder to identify as malicious and recipients are more likely to comply",
          "A watering hole attack that compromises a website the employees are likely to visit",
          "A vishing attack conducted over email rather than voice calls"
        ],
        correctIndex: 1,
        explanation: "Spear phishing uses personal context (names, roles, active projects) to make malicious emails appear legitimate. The personalization dramatically increases success rates compared to generic mass phishing because it exploits trust and familiarity."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-security-professional-certificate:mission:comptia-security-course-3",
    courseSlug: "comptia-security-course-3",
    programSlug: "comptia-security-professional-certificate",
    programTitle: "CompTIA Security+ Professional Certificate",
    courseTitle: "System Hardening and Endpoint Security",
    missionName: "Systems Pro",
    missionTagline: "Prove you can harden systems and protect endpoints from attack",
    primaryAxis: "Engineering",
    skillLabels: ["System hardening", "Endpoint protection", "Patch management", "Group Policy", "Problem-solving"],
    scenarioPrompt: "A security audit finds that a Windows server has 47 unnecessary services running, default administrator credentials unchanged, no endpoint protection installed, and 3 months of unpatched Windows updates. Using your system hardening skills from this course, prioritize and describe the remediation steps.",
    evidenceHint: "A strong response changes the default admin credentials first (immediate risk), then patches critical CVEs, disables unnecessary services to reduce the attack surface, installs endpoint protection, and explains why each action is prioritized.",
    quizQuestions: [
      {
        text: "A server has the default administrator username 'Administrator' and password 'admin123'. This combination is listed in credential stuffing databases. What is the FASTEST risk reduction action?",
        options: [
          "Install a firewall to block external access to the server's RDP port",
          "Immediately change the password to a long, complex, unique credential and consider renaming the Administrator account—credential stuffing attacks can succeed in seconds and this is the highest-priority fix",
          "Enable account lockout after 3 failed attempts to slow down brute-force attacks",
          "Disable RDP entirely and only use console access for server administration"
        ],
        correctIndex: 1,
        explanation: "Known-default credentials in public databases make the account trivially compromisable. Changing the password immediately eliminates this specific risk in under a minute—faster than any other control to implement."
      },
      {
        text: "A Windows server has 47 services running, including services for fax, Bluetooth, and remote registry. None of these are used in the server's role as a web server. Why is disabling them important?",
        options: [
          "Running unused services wastes CPU and RAM, reducing web server performance",
          "Each running service is an attack surface—a vulnerability in an unused service can be exploited to compromise the server; disabling unnecessary services reduces the number of entry points an attacker can target",
          "Windows licensing fees are calculated per running service, so fewer services reduces operating costs",
          "Services running in the background interfere with web server response times during peak traffic"
        ],
        correctIndex: 1,
        explanation: "Attack surface reduction is a core hardening principle. Every running service that is not needed represents an additional vulnerability that could be exploited—removing the service eliminates the risk entirely."
      },
      {
        text: "A patch management policy requires testing security patches in a staging environment for 30 days before production deployment. A critical zero-day patch is released for an actively exploited vulnerability. Should the 30-day testing period be followed?",
        options: [
          "Yes, the testing period must always be followed to prevent untested patches from breaking production",
          "No, for actively exploited critical vulnerabilities the risk of exploitation outweighs the risk of a patch causing issues; the patch should be tested on an accelerated timeline (hours to days) and deployed to production as quickly as safely possible",
          "Yes, but the patch can be applied to the most critical servers only after a 15-day shortened test period",
          "No, all security patches should always bypass testing and go directly to production since vendor patches are reliable"
        ],
        correctIndex: 1,
        explanation: "Risk-based patch management adjusts timelines based on threat severity. An actively exploited zero-day in production represents immediate risk—the testing period should be compressed, not eliminated, but timeliness is critical."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "comptia-security-professional-certificate:mission:comptia-security-course-4",
    courseSlug: "comptia-security-course-4",
    programSlug: "comptia-security-professional-certificate",
    programTitle: "CompTIA Security+ Professional Certificate",
    courseTitle: "Cryptography and Secure Communications",
    missionName: "Code Architect",
    missionTagline: "Prove you understand cryptography and can apply it to secure communications",
    primaryAxis: "Engineering",
    skillLabels: ["Encryption", "PKI", "TLS/SSL", "Hashing", "Problem-solving"],
    scenarioPrompt: "A developer asks you to review the security of a new web application. You find it uses HTTP instead of HTTPS for the login page, stores passwords as MD5 hashes, and uses a self-signed certificate on the internal admin panel. Using your cryptography knowledge from this course, identify the risks and recommend the correct implementations.",
    evidenceHint: "A strong response explains that HTTP exposes credentials in plaintext, MD5 is broken for password storage (recommend bcrypt/Argon2), and self-signed certificates prevent trust chain verification—recommending Let's Encrypt or an internal CA.",
    quizQuestions: [
      {
        text: "A web application stores user passwords as MD5 hashes. An attacker obtains the hash database. Why is this a critical security failure despite the passwords being hashed?",
        options: [
          "MD5 is an encryption algorithm and the attacker can decrypt the hashes directly",
          "MD5 is a fast, collision-prone hash function that lacks a salt; attackers can use precomputed rainbow tables or GPU-accelerated brute force to reverse billions of MD5 hashes per second—password-hashing algorithms like bcrypt or Argon2 are deliberately slow and salted to resist this",
          "MD5 hashes are stored in a publicly accessible database and the attacker does not need to crack them",
          "The attacker can use a length-extension attack on MD5 hashes to forge authentication tokens"
        ],
        correctIndex: 1,
        explanation: "MD5's speed is a vulnerability for password storage—it allows billions of guesses per second. Purpose-built password hashing algorithms are slow by design (work factor) and include per-password salts to defeat precomputed tables."
      },
      {
        text: "A user visits a website and their browser shows a padlock icon and the URL begins with https://. What does this guarantee about the connection?",
        options: [
          "The website is legitimate and the company behind it has been verified as trustworthy",
          "The connection between the browser and server is encrypted with TLS, preventing eavesdropping or tampering of data in transit; it does NOT guarantee the website owner is who they claim to be without checking the certificate details",
          "The website is free from malware and the content has been verified by the certificate authority",
          "The user's data is encrypted at rest on the server in addition to being encrypted in transit"
        ],
        correctIndex: 1,
        explanation: "HTTPS guarantees an encrypted channel (TLS). It does not guarantee the legitimacy or trustworthiness of the site owner—a phishing site can have a valid TLS certificate. DV certificates verify domain ownership only, not organizational identity."
      },
      {
        text: "An administrator configures a VPN using a pre-shared key (PSK) that is the company name. Why is this a weak security configuration?",
        options: [
          "Pre-shared keys cannot be used with modern VPN protocols; certificates are required",
          "A predictable PSK based on the company name is vulnerable to dictionary attacks; any attacker who knows the company name can attempt to authenticate to the VPN by testing this likely key before trying others",
          "Pre-shared keys expire after 30 days and a key based on the company name would be forgotten",
          "VPN authentication requires asymmetric keys; using a symmetric PSK bypasses authentication entirely"
        ],
        correctIndex: 1,
        explanation: "Dictionary attacks test commonly used and predictable values—company names are in every VPN pre-shared key dictionary. PSKs should be long, random strings. Certificate-based authentication eliminates this risk entirely."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 15: IT Automation with Python (Google) ──────────────────────

  {
    key: "it-automation-with-python-google:mission:it-auto-course-1",
    courseSlug: "it-auto-course-1",
    programSlug: "it-automation-with-python-google",
    programTitle: "IT Automation with Python",
    courseTitle: "Crash Course on Python",
    missionName: "Code Architect",
    missionTagline: "Prove you can write Python scripts to automate IT tasks",
    primaryAxis: "Engineering",
    skillLabels: ["Python basics", "Functions", "Data structures", "Scripting", "Problem-solving"],
    scenarioPrompt: "You are an IT technician who needs to write a Python script that reads a list of usernames from a text file and checks whether each username follows the company's naming policy (lowercase letters only, 6-12 characters, no spaces). The script should print a report of compliant and non-compliant usernames. Describe the script logic.",
    evidenceHint: "A strong response reads the file line by line, uses a function with validation logic (len check + isalpha/islower checks or regex), accumulates results into two lists, and prints a formatted report at the end.",
    quizQuestions: [
      {
        text: "A Python function validates usernames and returns True if the name is 6-12 lowercase letters only. Which expression CORRECTLY implements this check?",
        options: [
          "return len(username) >= 6 and len(username) <= 12 and username.isalpha()",
          "return 6 <= len(username) <= 12 and username.isalpha() and username.islower()",
          "return username.length > 6 and username.length < 12 and username.isLowercase()",
          "return len(username) in range(6, 12) and username.lower() == username"
        ],
        correctIndex: 1,
        explanation: "Option B is the most complete: checks length range with chained comparison, isalpha() ensures only letters (no digits or special chars), and islower() ensures all letters are lowercase. Option A passes 'Hello' since isalpha() does not check case."
      },
      {
        text: "A Python script reads a file of usernames using open() but crashes with UnicodeDecodeError on some lines. What is the BEST fix?",
        options: [
          "Skip lines that cause errors using a bare except clause",
          "Open the file with open(filename, encoding='utf-8', errors='ignore') or 'replace' to handle non-UTF-8 characters gracefully without crashing",
          "Convert the entire file to ASCII format before running the script",
          "Use a try/except around each line read to catch and ignore UnicodeDecodeError individually"
        ],
        correctIndex: 1,
        explanation: "The errors parameter controls how the file reading handles encoding failures. 'ignore' drops the problematic bytes; 'replace' substitutes a replacement character. Both prevent crashes without needing exception handling per line."
      },
      {
        text: "A script processes a 50,000-line username file and builds a list of all usernames before validating them. The script runs out of memory. What is the MOST efficient fix?",
        options: [
          "Increase the Python recursion limit to handle more data in memory",
          "Process the file line by line in a loop (for line in file:) instead of loading all lines at once—this keeps memory usage constant regardless of file size",
          "Split the file into 10 smaller files and process each separately",
          "Use a faster computer with more RAM to handle the full file in memory"
        ],
        correctIndex: 1,
        explanation: "File iteration in Python is a generator—it reads one line at a time without loading the entire file. This is always preferable to readlines() or read().splitlines() for large files."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-automation-with-python-google:mission:it-auto-course-2",
    courseSlug: "it-auto-course-2",
    programSlug: "it-automation-with-python-google",
    programTitle: "IT Automation with Python",
    courseTitle: "Using Python to Interact with the Operating System",
    missionName: "Tech Builder",
    missionTagline: "Prove you can automate OS-level tasks with Python",
    primaryAxis: "Engineering",
    skillLabels: ["os module", "subprocess", "File system automation", "Log processing", "Problem-solving"],
    scenarioPrompt: "You need to write a Python script that scans a directory of log files, finds all files modified in the last 24 hours, compresses them into a zip archive with a timestamp in the filename, and moves the archive to a backup folder. Describe the modules and logic you would use.",
    evidenceHint: "A strong response uses os.walk or pathlib for directory traversal, os.path.getmtime for modification time, zipfile for compression, datetime for the timestamp filename, and shutil.move for the final step.",
    quizQuestions: [
      {
        text: "A Python script needs to run the Linux command 'df -h' and capture its output for parsing. Which code is MOST appropriate?",
        options: [
          "os.system('df -h')",
          "result = subprocess.run(['df', '-h'], capture_output=True, text=True); output = result.stdout",
          "output = exec('df -h')",
          "os.popen('df -h').read()"
        ],
        correctIndex: 1,
        explanation: "subprocess.run with capture_output=True captures stdout and stderr into the result object. os.system() only returns the exit code; os.popen() is deprecated; exec() runs Python code, not shell commands."
      },
      {
        text: "A Python script constructs file paths using string concatenation: path = directory + '/' + filename. A colleague says this will fail on Windows. What is the CORRECT alternative?",
        options: [
          "path = directory + '\\\\' + filename",
          "path = os.path.join(directory, filename)",
          "path = f'{directory}/{filename}'",
          "path = directory.replace('/', '\\\\') + filename"
        ],
        correctIndex: 1,
        explanation: "os.path.join() automatically uses the correct path separator for the current operating system (/ on Unix, \\ on Windows). Hardcoded slashes break cross-platform scripts—os.path.join() is always the correct approach."
      },
      {
        text: "A Python script deletes log files older than 30 days from a directory. After running, the team discovers it also deleted files in subdirectories they did not intend to touch. What went wrong?",
        options: [
          "os.remove() automatically recursively deletes files in subdirectories",
          "The script likely used os.walk() which traverses all subdirectories recursively; without a check limiting deletion to the top-level directory, it processed all nested files",
          "Python's file deletion ignores directory boundaries in some versions",
          "The 30-day age check failed on files in subdirectories due to different timezone handling"
        ],
        correctIndex: 1,
        explanation: "os.walk() recursively traverses all subdirectories unless limited. Without adding depth control or explicitly checking that the file is in the target directory only, the script affects the entire directory tree."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-automation-with-python-google:mission:it-auto-course-3",
    courseSlug: "it-auto-course-3",
    programSlug: "it-automation-with-python-google",
    programTitle: "IT Automation with Python",
    courseTitle: "Introduction to Git and GitHub",
    missionName: "Systems Pro",
    missionTagline: "Prove you can version-control your automation scripts with Git",
    primaryAxis: "Engineering",
    skillLabels: ["Git version control", "GitHub", "Branching", "Collaboration", "Problem-solving"],
    scenarioPrompt: "Your IT automation team has 5 people all contributing Python scripts to a shared repository. Last week two team members modified the same script simultaneously causing a conflict. Using your Git and GitHub skills from this course, describe the workflow you would implement to prevent this situation going forward.",
    evidenceHint: "A strong response describes a feature branch workflow (each change in its own branch), pull requests with peer review, branch protection rules on main, and explains how to resolve a merge conflict when they do occur.",
    quizQuestions: [
      {
        text: "Two IT engineers both made changes to backup.py and pushed to the main branch without coordination. One engineer's changes were overwritten. Which Git workflow prevents this?",
        options: [
          "Each engineer should save a copy of backup.py with their initials before making changes",
          "Implement branch protection requiring pull requests with at least one review approval before merging to main; each engineer works on their own branch and conflicts are resolved before any merge completes",
          "Use git lock on backup.py so only one person can edit it at a time",
          "Have engineers email each other before editing any shared file to coordinate manually"
        ],
        correctIndex: 1,
        explanation: "Branch protection with required PR reviews prevents direct pushes to main. Each change goes through a review process where conflicts must be resolved before merging—preventing silent overwrites."
      },
      {
        text: "You run 'git status' and see 'Your branch is 3 commits behind origin/main.' What does this mean and what should you do before pushing your changes?",
        options: [
          "Your changes will overwrite 3 commits on the remote; force push is needed to proceed",
          "Three commits were added to the remote main branch since you last pulled; run 'git pull' to integrate those changes into your local branch before pushing to avoid conflicts",
          "Your branch is outdated and should be deleted; create a new branch from main instead",
          "The remote is 3 commits ahead and your local commits are not tracked yet; use 'git push -u origin main' to link them"
        ],
        correctIndex: 1,
        explanation: "Being behind the remote means others have pushed commits you do not have locally. Pulling first integrates those changes and resolves any conflicts before you add your own commits to the shared history."
      },
      {
        text: "A team member accidentally committed a file containing an AWS secret key to GitHub. They deleted the file in a new commit. Is the secret still at risk?",
        options: [
          "No, deleting the file in a subsequent commit removes it from the repository completely",
          "Yes, the secret is still in the git history and can be retrieved by anyone with access to the repository by checking out the commit that added the file; the secret must be revoked immediately and git history must be rewritten",
          "The secret is only at risk if the repository is public; private repositories are safe",
          "GitHub automatically scans for and invalidates secrets in all commits, so no action is needed"
        ],
        correctIndex: 1,
        explanation: "Git history is immutable by default—deleted files remain in previous commits forever. The secret should be rotated immediately (assume it is compromised), then history rewritten with git filter-branch or BFG Repo Cleaner if needed."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-automation-with-python-google:mission:it-auto-course-4",
    courseSlug: "it-auto-course-4",
    programSlug: "it-automation-with-python-google",
    programTitle: "IT Automation with Python",
    courseTitle: "Troubleshooting and Debugging Techniques",
    missionName: "Code Architect",
    missionTagline: "Prove you can find and fix bugs in automation scripts systematically",
    primaryAxis: "Engineering",
    skillLabels: ["Debugging", "Error analysis", "Logging", "Performance profiling", "Problem-solving"],
    scenarioPrompt: "A production Python automation script that runs nightly suddenly started failing with 'IndexError: list index out of range' after working correctly for 3 months. No code changes were made. Using your debugging and troubleshooting skills from this course, describe how you would diagnose the root cause.",
    evidenceHint: "A strong response checks the input data for changes (fewer items than expected), adds logging to capture the list contents before the failing line, uses a debugger or print statements to narrow the exact condition, and considers that external data changes—not code changes—caused the regression.",
    quizQuestions: [
      {
        text: "A Python script that processed customer records correctly for months suddenly fails with 'KeyError: customer_id'. No code changed. What is the MOST likely root cause?",
        options: [
          "A Python version update changed how dictionary keys are accessed",
          "The input data format changed—the records being processed no longer contain the 'customer_id' key, possibly due to a schema change in the upstream data source or export format",
          "The script's virtual environment was corrupted and the dictionary methods are no longer working correctly",
          "The customer database grew too large and the script cannot process records past a certain size"
        ],
        correctIndex: 1,
        explanation: "When a script fails without code changes, the input is the primary suspect. A KeyError on a previously reliable key almost always means the data schema changed—a field was renamed, removed, or conditionally absent for new record types."
      },
      {
        text: "A Python automation script occasionally fails but the error is not reproducible and the logs show only a generic exception. What is the MOST effective debugging improvement?",
        options: [
          "Add a try/except that silently swallows all exceptions so the script continues regardless",
          "Implement structured logging that records the input data state, function call stack, and relevant variable values at each processing step—so when the intermittent failure occurs, the logs contain enough context to diagnose it",
          "Run the script on a faster server so the intermittent failure occurs less frequently",
          "Add a random sleep(1) call before the failing section to eliminate timing-related race conditions"
        ],
        correctIndex: 1,
        explanation: "Intermittent failures require logs that capture state at the time of failure. Structured logging with context (inputs, state variables, call stack) turns a mystery into a diagnosable event."
      },
      {
        text: "A Python script processes 100,000 files and takes 4 hours to complete. A colleague suggests it could be profiled to identify the bottleneck. What tool and approach would identify the slowest function?",
        options: [
          "Add time.sleep(0) calls between functions to measure relative execution speed",
          "Run the script with Python's cProfile module (python -m cProfile script.py) and sort the output by cumulative time to identify which functions account for the most execution time",
          "Use a stopwatch to manually time each section of the code",
          "Reduce the input dataset to 1,000 files and multiply the result by 100 to estimate the bottleneck"
        ],
        correctIndex: 1,
        explanation: "cProfile is Python's built-in profiler. It instruments every function call and produces a report sorted by cumulative time, immediately revealing which functions are responsible for the majority of execution time."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-automation-with-python-google:mission:it-auto-course-5",
    courseSlug: "it-auto-course-5",
    programSlug: "it-automation-with-python-google",
    programTitle: "IT Automation with Python",
    courseTitle: "Configuration Management and the Cloud",
    missionName: "Tech Builder",
    missionTagline: "Prove you can manage infrastructure configuration at scale",
    primaryAxis: "Engineering",
    skillLabels: ["Puppet/Ansible", "Configuration management", "Cloud automation", "Infrastructure as Code", "Problem-solving"],
    scenarioPrompt: "Your IT team manually configures 50 Linux servers every time a new server is provisioned—installing packages, setting timezone, configuring NTP, and creating standard user accounts. This process takes 2 hours per server and introduces inconsistencies. Using your configuration management knowledge from this course, describe how you would automate this using a configuration management tool.",
    evidenceHint: "A strong response recommends Ansible or Puppet, describes writing a playbook/manifest that defines the desired state (packages installed, timezone set, NTP configured, user accounts created), and explains idempotency as a key benefit.",
    quizQuestions: [
      {
        text: "An Ansible playbook runs and shows 'changed: [server01]' for a package installation task. The playbook is run again and shows 'ok: [server01]' for the same task. What does this demonstrate?",
        options: [
          "The second run detected an error in the first run and corrected it",
          "Idempotency—Ansible checks the current state before acting; the package was already installed on the second run so no change was needed, demonstrating that running the playbook multiple times produces the same end state without unintended side effects",
          "Ansible caches results from the first run and replays them on subsequent runs without actually checking the server",
          "The 'ok' status means the task was skipped because it was flagged as optional"
        ],
        correctIndex: 1,
        explanation: "Idempotency is a core configuration management principle: applying the same configuration repeatedly yields the same result. This makes automation safe to run multiple times—on updates, after changes, or for drift remediation."
      },
      {
        text: "A Puppet manifest sets the timezone on all servers to 'America/New_York'. An engineer manually changes one server's timezone to 'UTC'. What happens the next time Puppet runs?",
        options: [
          "Puppet detects the manual change and leaves it in place since manual changes take precedence",
          "Puppet detects that the server's current state (UTC) does not match the desired state (America/New_York) and automatically reverts it—this drift remediation is a key configuration management feature",
          "Puppet logs the discrepancy but does not make changes to avoid overwriting intentional modifications",
          "Puppet disables the timezone resource for that server to prevent future conflicts"
        ],
        correctIndex: 1,
        explanation: "Configuration management continuously enforces desired state. Manual changes that create drift are automatically corrected on the next run—this is exactly why configuration management is used instead of manual administration."
      },
      {
        text: "A company wants to ensure all 200 Linux servers always have the same version of a security package installed. Without configuration management, an engineer must SSH into each server and run the update manually. What is the PRIMARY operational risk of the manual approach?",
        options: [
          "SSH connections to 200 servers will take too long and cause network congestion",
          "Human error and inconsistency—some servers will be missed, different engineers may install different versions or skip error handling, and the team has no centralized verification that all servers are compliant",
          "Running manual package updates risks breaking server configurations on production systems",
          "The manual approach requires a maintenance window that causes unnecessary service downtime"
        ],
        correctIndex: 1,
        explanation: "Manual administration at scale is inherently inconsistent and unverifiable. Configuration management enforces uniformity across all hosts simultaneously, with a single source of truth for desired state and built-in compliance reporting."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "it-automation-with-python-google:mission:it-auto-course-6",
    courseSlug: "it-auto-course-6",
    programSlug: "it-automation-with-python-google",
    programTitle: "IT Automation with Python",
    courseTitle: "Automating Real-World Tasks with Python",
    missionName: "Systems Pro",
    missionTagline: "Prove you can build complete automation solutions for real IT problems",
    primaryAxis: "Engineering",
    skillLabels: ["API automation", "Email automation", "Web scraping", "End-to-end scripting", "Problem-solving"],
    scenarioPrompt: "Your IT team needs a Python script that monitors a company's website for downtime, sends an email alert when the site is unreachable, and logs each check result to a CSV file with a timestamp. The script should run continuously and check every 5 minutes. Describe the complete script design.",
    evidenceHint: "A strong response uses requests to check the URL, smtplib or an email API for alerts, the csv module for logging, time.sleep(300) for the interval, and a try/except loop to handle network errors gracefully without crashing.",
    quizQuestions: [
      {
        text: "A monitoring script uses requests.get() to check a website and gets a response code of 200. Five minutes later, the website is loading but showing an internal server error page—also with a 200 response code. What does this reveal about the monitoring approach?",
        options: [
          "The monitoring is working correctly; a 200 status always means the site is healthy",
          "HTTP status codes alone are insufficient for application-level monitoring; the script should also check that the response body contains expected content (e.g., a specific page title or element) to detect error pages that return 200",
          "The monitoring script needs to follow redirects to detect error pages",
          "A 200 response code on an error page indicates a CDN is caching the error; the origin server should be monitored instead"
        ],
        correctIndex: 1,
        explanation: "A 200 status code means the HTTP request succeeded but does not guarantee the page content is correct. Content verification (checking for expected text) is required to distinguish a healthy page from a custom error page that returns 200."
      },
      {
        text: "A Python monitoring script sends an email alert when the website is down. The site has a 3-minute outage and the script sends 36 alert emails (one per 5-second check during the outage) to the on-call engineer. How should this be improved?",
        options: [
          "Reduce the check frequency to once per 30 minutes to limit alert volume",
          "Implement alert deduplication: send one alert when the site first goes down, suppress subsequent alerts while it remains down, and send a recovery notification when it comes back up",
          "Send the alerts to a group email so the volume is distributed across multiple recipients",
          "Add a 5-minute delay before sending any alert to allow transient issues to resolve naturally"
        ],
        correctIndex: 1,
        explanation: "Alert fatigue from repeated notifications for the same ongoing incident is a common monitoring problem. Stateful alerting (fire once on state change, suppress during the incident, recover notification on resolution) is the standard solution."
      },
      {
        text: "A Python script authenticates to a third-party API using a hardcoded API key stored as a string variable at the top of the script file. Why is this a security concern and what is the correct approach?",
        options: [
          "Hardcoded strings are slower to process than environment variables at API call time",
          "The script file gets committed to version control, shared in code reviews, or emailed between team members—exposing the API key to anyone who sees the file; keys should be stored in environment variables or a secrets manager and never in source code",
          "Third-party APIs revoke keys that are hardcoded in Python code rather than passed as headers",
          "Python's garbage collector may clear string variables before the API call completes"
        ],
        correctIndex: 1,
        explanation: "Secrets in source code are one of the most common causes of credential leaks. Using environment variables (os.environ.get('API_KEY')) or a secrets manager keeps credentials out of code repositories and review processes."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 16: Medical Coding & Health Information Technology (MCHIT) ───

  {
    key: "health-information-technology-mchit:mission:mchit-course-1",
    courseSlug: "mchit-course-1",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Introduction to Health Information Technology",
    missionName: "Support Hero",
    missionTagline: "Prove you understand the HIT landscape and why it matters",
    primaryAxis: "Service",
    skillLabels: ["HIT fundamentals", "Healthcare systems", "EHR basics", "HIPAA overview", "Communication"],
    scenarioPrompt: "A newly hired medical office assistant asks you to explain what Health Information Technology is and how it affects their day-to-day role. Using your HIT foundations, describe the key systems they will encounter, what data they handle, and why accuracy matters.",
    evidenceHint: "A strong response covers EHR/EMR distinction, the role of HIT in billing and patient care coordination, explains why data entry errors cause downstream patient safety and billing problems, and mentions HIPAA at a high level.",
    quizQuestions: [
      {
        text: "A medical office enters a patient's diagnosis code incorrectly on a claim. The insurance company denies the claim. What downstream effects does this single data entry error create?",
        options: [
          "No effect beyond the one denied claim; the office simply resubmits with the correct code",
          "Delayed payment, staff time spent on appeals and resubmission, potential impact on the patient's explanation of benefits, and possible audit flags if the pattern repeats across multiple claims",
          "The patient's medical record is automatically corrected by the insurance company",
          "The error is caught by the EHR automatically before submission"
        ],
        correctIndex: 1,
        explanation: "A single coding error cascades into revenue cycle delays, staff rework, patient confusion, and compliance risk. Data accuracy in HIT is not clerical—it has direct financial and patient care consequences."
      },
      {
        text: "A healthcare worker sends a patient's lab results to the correct provider via unencrypted email because it is faster. Why is this a problem?",
        options: [
          "It is acceptable since the recipient is a licensed medical professional",
          "Unencrypted email is not a HIPAA-compliant transmission method for Protected Health Information (PHI); a data breach or interception would expose the patient's private health data and expose the organization to regulatory penalties",
          "It is only a problem if the email is intercepted; the probability is low enough to be acceptable",
          "Lab results are not considered PHI and can be sent without encryption"
        ],
        correctIndex: 1,
        explanation: "HIPAA requires appropriate safeguards for all PHI in transit. Standard email is not encrypted end-to-end and does not meet the minimum technical safeguard standard for electronic PHI transmission."
      },
      {
        text: "What is the PRIMARY difference between an EMR (Electronic Medical Record) and an EHR (Electronic Health Record)?",
        options: [
          "EMRs are used in hospitals while EHRs are used in outpatient clinics",
          "An EMR is a digital version of a single provider's paper chart used within one practice; an EHR is designed to share patient information across multiple providers and care settings",
          "EHRs contain billing information while EMRs contain only clinical notes",
          "EMRs are the older technology and EHRs are the modern replacement with no functional difference"
        ],
        correctIndex: 1,
        explanation: "The key distinction is interoperability. EMRs are practice-specific; EHRs are designed for cross-provider sharing—enabling care coordination across specialists, hospitals, and primary care providers."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "health-information-technology-mchit:mission:mchit-course-2",
    courseSlug: "mchit-course-2",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Medical Terminology and Anatomy",
    missionName: "Discovery Expert",
    missionTagline: "Prove you can decode medical terminology to support accurate coding",
    primaryAxis: "Research",
    skillLabels: ["Medical terminology", "Anatomy basics", "Root words/prefixes/suffixes", "Clinical documentation", "Attention to detail"],
    scenarioPrompt: "A physician's note reads: 'Patient presents with acute myocardial infarction with dyspnea and diaphoresis.' A medical coder needs to identify the correct diagnosis. Using your medical terminology knowledge, break down each term and explain how understanding the components ensures accurate code selection.",
    evidenceHint: "A strong response deconstructs each term using root/prefix/suffix analysis (myo=muscle, cardio=heart, infarction=tissue death; dys=difficult, pnea=breathing; dia=through, phoresis=carrying/sweating), links the terms to the diagnosis, and explains why term confusion leads to wrong codes.",
    quizQuestions: [
      {
        text: "A medical coder reads 'hypertension' in a chart. Using medical terminology word analysis, what does this term mean?",
        options: [
          "Low blood pressure — 'hyper' means below normal in medical terminology",
          "Abnormally high blood pressure — 'hyper' means excessive or above normal, 'tension' in this context refers to arterial blood pressure",
          "Rapid heartbeat — 'hyper' refers to speed and 'tension' refers to cardiac muscle contraction",
          "Inflammation of the arteries — 'hyper' indicates severity and 'tension' refers to vessel wall stress"
        ],
        correctIndex: 1,
        explanation: "The prefix 'hyper-' means above or excessive. In the context of 'tension' (pressure), hypertension = abnormally high blood pressure. This is one of the most common terms a medical coder encounters."
      },
      {
        text: "A physician documents 'appendectomy' in the operative report. A coder needs to identify what procedure was performed. What does this term indicate?",
        options: [
          "Inflammation of the appendix requiring antibiotic treatment",
          "Surgical removal of the appendix — 'append' refers to the appendix and '-ectomy' is the suffix meaning surgical removal or excision",
          "A biopsy of the appendix tissue for laboratory analysis",
          "Imaging of the appendix using CT scan technology"
        ],
        correctIndex: 1,
        explanation: "The suffix '-ectomy' consistently means surgical removal. Identifying this suffix in any term immediately tells a coder a surgical removal procedure was performed, regardless of the root organ word."
      },
      {
        text: "A coder sees 'nephro/o' as a combining form in a procedure note. Which body system does this term relate to?",
        options: [
          "Nervous system — 'nephro' relates to nerve pathways",
          "Renal/urinary system — 'nephro' is the combining form for kidney, used in terms like nephrology, nephrectomy, and nephritis",
          "Respiratory system — 'nephro' relates to breathing capacity",
          "Musculoskeletal system — 'nephro' relates to connective tissue"
        ],
        correctIndex: 1,
        explanation: "Nephro- is the Greek combining form for kidney. Recognizing this root allows a coder to immediately identify kidney-related procedures and diagnoses, directing them to the correct code set section."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "health-information-technology-mchit:mission:mchit-course-3",
    courseSlug: "mchit-course-3",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Health Information Management",
    missionName: "Operations Pro",
    missionTagline: "Prove you can manage health records efficiently and compliantly",
    primaryAxis: "Strategy",
    skillLabels: ["Records management", "Release of information", "Retention policies", "HIPAA", "Organizational skills"],
    scenarioPrompt: "A patient calls requesting a copy of their complete medical records from the past 5 years to share with a new specialist. Your office has a records release policy and HIPAA requirements to follow. Using your Health Information Management knowledge, describe the step-by-step process for fulfilling this request.",
    evidenceHint: "A strong response verifies patient identity, obtains a valid signed authorization, identifies the records scope, applies HIPAA's 30-day response window, explains minimum necessary standard, and describes the secure transmission method.",
    quizQuestions: [
      {
        text: "A patient calls and asks your office to fax their records directly to their new specialist without signing an authorization form first. What should you do?",
        options: [
          "Fax the records immediately since the patient is verbally consenting on the phone",
          "Explain that a signed written authorization is required before releasing records to any third party, even at the patient's verbal request, and send or provide the authorization form for the patient to sign",
          "Fax the records and follow up with the authorization form afterward",
          "Release the records since the specialist is a licensed healthcare provider and no authorization is needed"
        ],
        correctIndex: 1,
        explanation: "HIPAA requires a valid written authorization for most third-party disclosures. A verbal request on the phone does not satisfy the authorization requirement—even when it is the patient calling."
      },
      {
        text: "A hospital's records retention policy requires keeping adult patient records for 10 years. A records manager finds records from 15 years ago that were never destroyed. What should be done?",
        options: [
          "Destroy all 15-year-old records immediately since they are past the retention period",
          "Review records individually for any active legal holds, ongoing care relationships, or special circumstances before destruction; destroy only those that are clearly past retention with no exceptions, using a compliant destruction method and documenting the destruction",
          "Keep all records indefinitely since the cost of storage is lower than the risk of destroying needed records",
          "Move the records to a cheaper storage tier but do not destroy them in case they are ever needed"
        ],
        correctIndex: 1,
        explanation: "Retention policies define minimums, not automatic destruction triggers. Legal holds, active litigation, or ongoing care can require retention beyond the standard period. Compliant destruction with documentation protects the organization."
      },
      {
        text: "HIPAA's Minimum Necessary Standard applies to a records release request. A researcher requests all records for patients with diabetes from 2020-2023. What does minimum necessary require?",
        options: [
          "Release only the most recent record for each patient since that contains the most current information",
          "Release only the specific data elements the researcher needs for their stated purpose—not the complete medical record—unless the researcher can justify that the full record is required",
          "Release all records since researchers have special HIPAA exemptions for public health purposes",
          "Require the researcher to obtain individual patient authorizations before releasing any records"
        ],
        correctIndex: 1,
        explanation: "The minimum necessary standard requires organizations to disclose only the information reasonably needed to accomplish the purpose. For research, this typically means specific data fields rather than complete chart downloads."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "health-information-technology-mchit:mission:mchit-course-4",
    courseSlug: "mchit-course-4",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Electronic Health Records (EHR)",
    missionName: "Code Architect",
    missionTagline: "Prove you can navigate and use EHR systems effectively",
    primaryAxis: "Engineering",
    skillLabels: ["EHR navigation", "Data entry", "Clinical documentation", "Meaningful Use", "Attention to detail"],
    scenarioPrompt: "A new medical assistant is learning to use the practice's EHR system. They need to document a patient visit: record vitals, enter the chief complaint, update the medication list, and flag an allergy. Using your EHR knowledge from this course, walk them through each step and explain why documentation accuracy matters.",
    evidenceHint: "A strong response covers the structured data fields for vitals, free-text vs. coded entries for complaints, the clinical decision support implications of medication and allergy entries, and explains how EHR documentation affects billing code selection.",
    quizQuestions: [
      {
        text: "A medical assistant enters a patient's penicillin allergy as a 'note' in the free-text comments field rather than in the designated allergy module of the EHR. Why is this a clinical safety risk?",
        options: [
          "The note field has a character limit that may truncate the allergy information",
          "Clinical decision support alerts that warn prescribers about drug allergies only check the structured allergy module—a penicillin allergy in a free-text comment will not trigger an alert if the provider prescribes amoxicillin, potentially causing a serious adverse reaction",
          "Free-text fields are visible to unauthorized staff while the allergy module is access-restricted",
          "Notes entered in free-text are not included in the patient summary sent to other providers"
        ],
        correctIndex: 1,
        explanation: "EHR clinical decision support checks structured data fields. An allergy documented only as free text bypasses all automated safety alerts—the most dangerous documentation error a medical assistant can make."
      },
      {
        text: "A provider documents a patient visit but does not include the level of medical decision-making complexity required to support the E/M code billed. What is the consequence?",
        options: [
          "The claim is automatically upgraded to the highest level since the provider is board-certified",
          "The claim may be denied, downcoded, or flagged in an audit—the documentation must support the level of service billed; insufficient documentation is the leading cause of E/M claim denials",
          "The billing department can infer the correct level from the diagnosis codes submitted",
          "There is no consequence since the EHR system assigns the E/M level automatically based on visit duration"
        ],
        correctIndex: 1,
        explanation: "Medical necessity documentation must support the code billed. Insufficient documentation of medical decision-making is the most common reason E/M claims are audited or denied—coders can only code what is documented."
      },
      {
        text: "An EHR system prompts a provider with a clinical decision support alert when they attempt to prescribe a medication that interacts with another drug the patient is already taking. The provider clicks 'override' without reading it. What is the PRIMARY concern?",
        options: [
          "The override wastes time and adds unnecessary clicks to the prescribing workflow",
          "Alert fatigue—when providers routinely override CDS alerts without review, both meaningful and non-meaningful alerts are dismissed indiscriminately; this negates the safety value of clinical decision support and increases adverse drug event risk",
          "The EHR vendor may revoke the provider's license to override alerts",
          "The override creates a HIPAA audit trail that could be used against the provider in a malpractice case"
        ],
        correctIndex: 1,
        explanation: "Alert fatigue is a recognized patient safety problem in EHR systems. When every alert is overridden by reflex, the critical safety alerts are treated the same as nuisance alerts—eliminating the protective function of CDS."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "health-information-technology-mchit:mission:mchit-course-5",
    courseSlug: "mchit-course-5",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Healthcare Law, Ethics & HIPAA",
    missionName: "Help Desk Pro",
    missionTagline: "Prove you can navigate healthcare privacy law and ethics on the job",
    primaryAxis: "Service",
    skillLabels: ["HIPAA Privacy Rule", "HIPAA Security Rule", "Patient rights", "Healthcare ethics", "Communication"],
    scenarioPrompt: "A hospital receptionist tells you they gave a patient's room number and diagnosis to a person who called claiming to be the patient's spouse. No authorization was on file. Using your HIPAA and healthcare law knowledge from this course, explain what went wrong, what the receptionist should have done, and what the compliance implications are.",
    evidenceHint: "A strong response identifies the HIPAA Privacy Rule violation (disclosure without authorization to an unverified party), explains the proper verification and authorization process, describes the required breach assessment, and notes patient rights to be notified.",
    quizQuestions: [
      {
        text: "A patient's adult child calls asking about their parent's test results. The patient has not listed this person on their HIPAA authorization form. What should the healthcare worker do?",
        options: [
          "Share the results since immediate family members are automatically authorized to receive medical information",
          "Decline to confirm or deny any patient information and explain that a signed authorization from the patient is required before disclosing health information to any third party",
          "Ask the caller to provide the patient's date of birth and insurance ID as verification before sharing results",
          "Transfer the call to the treating physician who has the authority to decide whether to share information with family"
        ],
        correctIndex: 1,
        explanation: "HIPAA does not grant family members automatic access to patient information. Only the patient or their legally authorized representative can authorize disclosure. Date-of-birth verification does not satisfy the authorization requirement."
      },
      {
        text: "A healthcare employee posts about a difficult patient encounter on social media without using the patient's name. They describe the patient's unusual diagnosis, approximate age, and the rural town they are from. Is this a HIPAA violation?",
        options: [
          "No, because the patient's name was not mentioned",
          "Yes, because the combination of diagnosis, age, and geographic location could reasonably identify the patient—HIPAA protects individually identifiable health information, not just named records",
          "No, because social media posts are personal expression and not covered by HIPAA",
          "Yes, but only if the patient's employer or insurer could see the post"
        ],
        correctIndex: 1,
        explanation: "HIPAA's de-identification standard requires removing 18 specific identifiers. A combination of diagnosis, age range, and small geographic location can be enough to identify a patient—especially in a small town."
      },
      {
        text: "A covered entity discovers a laptop containing unencrypted PHI was stolen from an employee's car. What is the organization's obligation under HIPAA?",
        options: [
          "No obligation as long as the employee reports the theft to police within 24 hours",
          "Conduct a breach risk assessment to determine if PHI was compromised; if the assessment cannot rule out exposure, notify affected patients within 60 days, notify HHS, and if 500+ individuals are affected, notify prominent media in the affected state",
          "Replace the laptop and implement a password policy to prevent future incidents—no patient notification is required for physical theft",
          "Notify HHS only if the stolen device was accessed by an unauthorized person"
        ],
        correctIndex: 1,
        explanation: "HIPAA's Breach Notification Rule requires a four-factor risk assessment. Unencrypted stolen hardware is presumed to be a breach unless the assessment demonstrates low probability of PHI compromise—patient and HHS notification follows."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "health-information-technology-mchit:mission:mchit-course-6",
    courseSlug: "mchit-course-6",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Medical Coding: ICD-10 and CPT",
    missionName: "Analytics Pro",
    missionTagline: "Prove you can select accurate ICD-10 and CPT codes from documentation",
    primaryAxis: "Analytics",
    skillLabels: ["ICD-10-CM", "CPT coding", "Code selection", "Documentation review", "Attention to detail"],
    scenarioPrompt: "A physician's note documents: 'Patient seen for follow-up of type 2 diabetes mellitus with diabetic chronic kidney disease, stage 3. Patient also treated for essential hypertension. Blood glucose management counseling provided.' Using your ICD-10 and CPT knowledge from this course, identify the appropriate diagnosis codes and what documentation would be needed to support an E/M code.",
    evidenceHint: "A strong response identifies the combination code for T2DM with CKD (E11.22), the CKD stage code (N18.3), hypertension (I10), uses the correct sequencing (underlying condition first), and explains that E/M level requires documented medical decision-making complexity.",
    quizQuestions: [
      {
        text: "A coder finds that a physician documented 'chest pain' in the assessment but the discharge summary clearly states 'acute myocardial infarction.' Which diagnosis should be coded for the inpatient encounter?",
        options: [
          "Chest pain, because that is what the physician documented in the assessment section",
          "Acute myocardial infarction, because inpatient coding guidelines require coding the confirmed final diagnosis rather than signs or symptoms when a definitive diagnosis is available at discharge",
          "Both chest pain and acute myocardial infarction since both appear in the documentation",
          "Chest pain with acute myocardial infarction as a secondary diagnosis since symptoms should always be sequenced first"
        ],
        correctIndex: 1,
        explanation: "Inpatient coding guidelines (UHDDS) require reporting the definitive diagnosis established at discharge. Signs and symptoms are not coded separately when they are integral to the confirmed diagnosis."
      },
      {
        text: "A coder is assigning a CPT code for a surgical procedure and finds two codes that seem to describe the procedure. The guidelines note that one code is a 'parent code' and the other is an 'add-on code.' What does this mean?",
        options: [
          "The parent code is for the attending physician and the add-on code is for the assistant surgeon",
          "Add-on codes describe additional work performed at the same session as the parent procedure and cannot be billed alone; they must always be reported with the designated parent code",
          "The add-on code is an optional additional charge that can be added to any procedure",
          "Parent codes apply to the first occurrence of a procedure and add-on codes apply to each subsequent occurrence"
        ],
        correctIndex: 1,
        explanation: "CPT add-on codes (+) are always paired with specific parent codes. They describe work that accompanies a primary procedure and are never reported alone—understanding this pairing relationship prevents claim rejections."
      },
      {
        text: "A physician documents that a patient has 'possible pneumonia' and orders further testing. This is an outpatient encounter. Which should the coder report?",
        options: [
          "Pneumonia, using the confirmed code since 'possible' is likely the physician's clinical assessment",
          "The presenting signs and symptoms (e.g., fever, cough, shortness of breath) because outpatient coding guidelines prohibit reporting 'possible,' 'probable,' or 'suspected' diagnoses—only confirmed or established conditions are coded outpatient",
          "Both the symptoms and the possible diagnosis to give the payer maximum information",
          "Possible pneumonia using an unspecified pneumonia code to indicate diagnostic uncertainty"
        ],
        correctIndex: 1,
        explanation: "Outpatient coding guidelines explicitly prohibit coding uncertain diagnoses. Signs and symptoms are coded until a confirmed diagnosis is established—the opposite of inpatient guidelines."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "health-information-technology-mchit:mission:mchit-course-7",
    courseSlug: "mchit-course-7",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Revenue Cycle Management",
    missionName: "Project Commander",
    missionTagline: "Prove you can optimize the healthcare revenue cycle from visit to payment",
    primaryAxis: "Strategy",
    skillLabels: ["Revenue cycle", "Claims management", "Denial management", "AR follow-up", "Analytical thinking"],
    scenarioPrompt: "A medical practice has a 34% claim denial rate and aging accounts receivable over 90 days totaling $180,000. The billing manager asks for your assessment and a prioritized action plan. Using your revenue cycle management knowledge from this course, describe how you would approach this problem.",
    evidenceHint: "A strong response categorizes denial reasons (coding errors, eligibility, missing auth), prioritizes AR by dollar value and payer, implements a denial prevention feedback loop to coders, and recommends an eligibility verification process at time of scheduling.",
    quizQuestions: [
      {
        text: "A practice's top three denial reasons are: missing prior authorization (40%), incorrect patient insurance information (35%), and coding errors (25%). Which prevention strategy addresses the largest single denial category?",
        options: [
          "Hire additional coders to reduce the error rate on submitted claims",
          "Implement a pre-authorization workflow that verifies and obtains required authorizations before scheduling procedures, preventing 40% of denials before the claim is ever submitted",
          "Appeal all denied claims regardless of reason since appeal success rates are typically 60%",
          "Switch to a different clearinghouse that screens claims more thoroughly before submission"
        ],
        correctIndex: 1,
        explanation: "Preventing denials is always more efficient than appealing them. A pre-authorization verification workflow eliminates the largest single denial category—missing auth—before the service is rendered."
      },
      {
        text: "A billing department has $180,000 in accounts receivable over 90 days old. They have capacity to work 50 accounts this week. Which accounts should be prioritized?",
        options: [
          "The oldest accounts first since they are at the highest risk of becoming uncollectable",
          "The highest-balance accounts within the 90-120 day bucket, focusing on payers with the highest appeal success rate—this approach maximizes revenue recovery per hour of staff time",
          "Accounts approaching the payer's timely filing deadline, regardless of balance size",
          "The most recent accounts in the 90-day bucket to prevent them from aging further"
        ],
        correctIndex: 1,
        explanation: "Revenue cycle prioritization balances balance size, timely filing risk, and payer behavior. High-balance accounts approaching filing limits get immediate attention; smaller balances are batched. Timely filing deadlines are a secondary filter to prevent permanent loss."
      },
      {
        text: "A practice's clean claim rate is 78%—meaning 22% of claims submitted require correction before payment. What does this metric most directly indicate about the practice's operations?",
        options: [
          "The payer mix includes too many government payers who have stricter claim requirements",
          "There are systematic upstream errors in registration, coding, or charge capture that should be identified through root cause analysis of denied and rejected claims and fed back to the relevant staff for process improvement",
          "A 78% clean claim rate is industry standard and does not require improvement",
          "The clearinghouse is introducing errors during claim transmission and should be replaced"
        ],
        correctIndex: 1,
        explanation: "A 78% clean claim rate means 22% of claims require rework—a significant revenue cycle inefficiency. Root cause analysis of rejected claims identifies the specific upstream failures (registration errors, missing information, coding mistakes) driving the rate."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "health-information-technology-mchit:mission:mchit-course-8",
    courseSlug: "mchit-course-8",
    programSlug: "health-information-technology-mchit",
    programTitle: "Medical Coding & Health Information Technology",
    courseTitle: "Capstone: HIT Practice Simulation",
    missionName: "Help Desk Pro",
    missionTagline: "Prove you can handle a full HIT workflow from patient intake to claim",
    primaryAxis: "Service",
    skillLabels: ["End-to-end HIT workflow", "EHR documentation", "Medical coding", "Revenue cycle", "Communication"],
    scenarioPrompt: "You are presenting your HIT capstone simulation to a hiring panel at a medical practice. Walk them through a complete patient encounter cycle: from verifying eligibility at check-in, through clinical documentation, to coding the visit and submitting a clean claim. Identify the two points in the cycle where errors are most costly.",
    evidenceHint: "A strong response covers insurance eligibility verification, demographic accuracy at intake, provider documentation supporting the codes, code selection, claim scrubbing before submission, and identifies eligibility verification and code/documentation alignment as the highest-cost error points.",
    quizQuestions: [
      {
        text: "A patient arrives for a procedure that requires prior authorization. The front desk forgot to verify authorization before the visit. The procedure is performed and the claim is denied. Who bears the financial responsibility?",
        options: [
          "The payer, because the procedure was medically necessary",
          "The practice, because the failure to obtain required prior authorization is an administrative error—the payer's contract terms typically prohibit billing the patient for services denied due to the practice's failure to follow authorization requirements",
          "The patient, because they are responsible for understanding their own insurance benefits",
          "The referring physician, because they should have confirmed authorization before referring the patient"
        ],
        correctIndex: 1,
        explanation: "Authorization failures are the practice's administrative responsibility. Payer contracts often prohibit balance billing patients for denials caused by the practice's failure to comply with prior authorization requirements."
      },
      {
        text: "During a capstone simulation, a coder assigns a higher-complexity E/M code than the documentation supports. A reviewer catches this. What is this called and what is the compliance risk?",
        options: [
          "Upcoding—assigning a higher-level code than the documentation justifies; this constitutes fraud if intentional and can result in payer audits, repayment demands, civil monetary penalties, and OIG investigation",
          "Unbundling—separately coding services that should be reported together under one code",
          "Modifier misuse—applying an incorrect modifier to increase reimbursement",
          "This is a minor documentation error with no compliance implications if corrected before submission"
        ],
        correctIndex: 0,
        explanation: "Upcoding is a federal False Claims Act violation when intentional. Even unintentional patterns of upcoding identified in an audit require repayment. Every code must be supported by documentation—no exceptions."
      },
      {
        text: "A practice simulation shows that claims scrubbed by a clearinghouse have a 96% first-pass acceptance rate versus 72% without scrubbing. What does claim scrubbing do that produces this improvement?",
        options: [
          "It adds missing diagnosis codes automatically based on the procedure codes submitted",
          "It checks claims against payer-specific edit rules before submission—identifying format errors, missing required fields, invalid code combinations, and eligibility mismatches that would cause denials, allowing correction before the claim reaches the payer",
          "It prioritizes high-value claims so they are processed faster by the payer",
          "It converts paper claims to electronic format which payers process more accurately"
        ],
        correctIndex: 1,
        explanation: "Clearinghouse claim scrubbing applies hundreds of payer-specific edits before submission. Catching errors pre-submission is faster and cheaper than correcting denied claims post-payment—the 24-point improvement in first-pass rate represents significant revenue cycle efficiency."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 17: Certified Production Technician (CPT) ───────────────────

  {
    key: "certified-production-technician-cpt:mission:cpt-course-1",
    courseSlug: "cpt-course-1",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Introduction to Manufacturing",
    missionName: "Code Architect",
    missionTagline: "Prove you understand the manufacturing environment and your role in it",
    primaryAxis: "Engineering",
    skillLabels: ["Manufacturing fundamentals", "Production processes", "Quality basics", "Safety overview", "Problem-solving"],
    scenarioPrompt: "You are starting your first week on a production floor. Your supervisor explains you will rotate through three workstations before settling into a role. Using your Introduction to Manufacturing knowledge, describe what you would observe and learn at each station to understand how your work fits into the larger production process.",
    evidenceHint: "A strong response covers understanding upstream inputs and downstream outputs of each station, identifying quality checkpoints, noting safety hazards, and learning how production metrics are tracked at each workstation.",
    quizQuestions: [
      {
        text: "A production worker notices their workstation is producing parts 30% faster than the next workstation, causing parts to pile up between stations. What manufacturing problem does this represent?",
        options: [
          "An efficiency achievement—the faster workstation should be recognized for exceeding targets",
          "A bottleneck and inventory buildup problem—in a balanced production line, each station should produce at the same rate (takt time); the pileup indicates line imbalance that disrupts flow and hides quality defects",
          "A staffing issue—more workers should be added to the slower downstream station",
          "A scheduling error—the production plan was not properly sequenced for this product"
        ],
        correctIndex: 1,
        explanation: "Work-in-process inventory buildup between stations signals line imbalance. Parts accumulating between stations hide quality problems, create handling damage risk, and signal that flow production principles have not been applied."
      },
      {
        text: "A manufacturing plant uses a 'pull' production system. A downstream workstation signals it needs more parts. What happens in a pull system?",
        options: [
          "The production manager schedules the upstream station to produce parts based on the weekly forecast",
          "The upstream workstation produces only the quantity signaled by the downstream station's demand—nothing is produced until there is a pull signal from the next step in the process",
          "The warehouse ships parts from inventory to the downstream station regardless of current demand",
          "All workstations increase production simultaneously to build a buffer against future demand"
        ],
        correctIndex: 1,
        explanation: "Pull systems (the foundation of lean/JIT manufacturing) produce only what is needed, when it is needed, in the quantity needed. This eliminates overproduction—the most wasteful of the seven manufacturing wastes."
      },
      {
        text: "A new production technician is asked to document their workstation's standard work instructions. Why is standardizing work procedures important in manufacturing?",
        options: [
          "Standard work documentation is required by OSHA for all manufacturing jobs",
          "Standardized procedures ensure every operator performs the task the same way—producing consistent quality, enabling cross-training, establishing a baseline for improvement, and making deviations immediately visible",
          "Standard work prevents operators from suggesting process improvements since changes must be formally approved",
          "Documentation protects the company from liability when operators make mistakes"
        ],
        correctIndex: 1,
        explanation: "Standard work is the foundation of quality and continuous improvement. You cannot improve a process that is not standardized—variation in methods produces variation in output, and you cannot identify what to improve without a baseline."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-production-technician-cpt:mission:cpt-course-2",
    courseSlug: "cpt-course-2",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Blueprint Reading and Technical Drawing",
    missionName: "Design Thinker",
    missionTagline: "Prove you can read and interpret technical drawings accurately",
    primaryAxis: "Design",
    skillLabels: ["Blueprint reading", "GD&T basics", "Tolerances", "Technical drawing", "Attention to detail"],
    scenarioPrompt: "You are a production technician and receive a blueprint for a metal bracket with a drilled hole. The drawing shows the hole diameter as 25.00 ±0.05mm and specifies a perpendicularity tolerance of 0.1mm. Using your blueprint reading skills from this course, explain what these specifications mean and how you would verify the part meets them.",
    evidenceHint: "A strong response explains that ±0.05 means the hole must be between 24.95 and 25.05mm diameter, that perpendicularity 0.1 means the hole axis must fall within a 0.1mm cylindrical tolerance zone perpendicular to the reference datum, and describes using calipers for diameter and a CMM or gauge pin for perpendicularity.",
    quizQuestions: [
      {
        text: "A blueprint shows a shaft diameter of 50.00 +0.00/-0.05mm. What is the acceptable size range for this shaft?",
        options: [
          "Between 49.95mm and 50.05mm",
          "Between 49.95mm and 50.00mm exactly — the +0.00 means no material can be added above nominal; the shaft can only be at or below 50.00mm, down to 49.95mm",
          "Exactly 50.00mm with no tolerance allowed",
          "Between 50.00mm and 50.05mm only"
        ],
        correctIndex: 1,
        explanation: "+0.00/-0.05 is a unilateral tolerance. The nominal (50.00mm) is the maximum allowed size; the shaft can be as small as 49.95mm. This is common for shafts designed to fit into a bore without interference."
      },
      {
        text: "A drawing has three views: Front, Top, and Right Side. The front view shows a rectangular shape with a circular feature. The top view shows the same rectangle with a dashed circle. What does the dashed circle in the top view indicate?",
        options: [
          "A surface finish requirement applied to the circular area of the part",
          "A hidden line representing a feature (likely a hole or counterbore) that exists below the visible surface in the top view—dashed lines always represent features hidden from that viewing direction",
          "An optional feature that may be added based on customer requirements",
          "A centerline marking the axis of symmetry of the part"
        ],
        correctIndex: 1,
        explanation: "Dashed (hidden) lines in technical drawings represent features not visible from that view angle. In the top view, a dashed circle below a surface indicates a hole or cavity on the underside of the part."
      },
      {
        text: "A production technician measures a finished part and finds a hole diameter of 24.92mm. The blueprint specifies 25.00 ±0.05mm. What should the technician do?",
        options: [
          "Accept the part since 24.92mm is close enough to the specification for practical purposes",
          "Reject the part as nonconforming — 24.92mm is outside the acceptable range of 24.95mm to 25.05mm and must be quarantined per the nonconforming material procedure",
          "Rework the part by machining the hole slightly larger to bring it within specification",
          "Accept the part with a deviation note since the hole is smaller, which errs on the side of caution"
        ],
        correctIndex: 1,
        explanation: "A dimension outside tolerance is a nonconformance—period. The decision to rework, scrap, or use-as-is requires formal disposition through the quality system, not an individual technician's judgment. The first step is always quarantine and documentation."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-production-technician-cpt:mission:cpt-course-3",
    courseSlug: "cpt-course-3",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Machining and CNC Operations",
    missionName: "Systems Pro",
    missionTagline: "Prove you can set up and run CNC machining operations safely",
    primaryAxis: "Engineering",
    skillLabels: ["CNC operation", "G-code basics", "Machining processes", "Tool offset", "Problem-solving"],
    scenarioPrompt: "You are a CNC operator preparing to run a new part program for the first time. The setup sheet specifies tooling, speeds, and feeds. Before running at full speed, you do a dry run without material. Using your CNC operations knowledge from this course, describe the pre-run checks and the dry run process.",
    evidenceHint: "A strong response covers tool offset verification, feed rate override set to zero or single-block mode for the dry run, checking for collisions in air-cut mode, verifying workpiece datum/zero point, and confirming the correct program is loaded.",
    quizQuestions: [
      {
        text: "A CNC operator loads a new program and starts it at full feed rate without a dry run. The spindle crashes into the workholding fixture. Which pre-run check would have prevented this?",
        options: [
          "The operator should have read the program code line by line to look for errors",
          "A dry run in single-block mode with feed rate override at 0-10% would have revealed the incorrect tool path before any contact with the fixture, allowing the operator to stop and correct the program",
          "The machine's collision detection system should have stopped the spindle automatically",
          "The programmer is responsible for verifying the program in simulation software before giving it to the operator"
        ],
        correctIndex: 1,
        explanation: "Dry runs with feed rate override are standard practice for new programs. Running at reduced speed in single-block mode lets the operator verify each move before committing to full-speed production."
      },
      {
        text: "After a tool change, a CNC part is measuring 0.3mm too deep on all milled surfaces. What is the MOST likely cause?",
        options: [
          "The CNC program was edited with an incorrect depth value",
          "The tool length offset for the new tool was not updated—the machine is using the previous tool's length offset, causing all Z-axis positions to be 0.3mm off from the intended position",
          "The workpiece is not flat and is rocking in the fixture",
          "The material being cut is harder than specified and is deflecting the tool"
        ],
        correctIndex: 1,
        explanation: "Tool length offsets compensate for each tool's unique length. Using a different tool without updating the offset displaces all Z-axis moves by the length difference—a systematic error affecting every cut by the same amount."
      },
      {
        text: "A CNC operator notices a high-pitched squealing sound and sees blue smoke coming from the cutting area. What should they do IMMEDIATELY?",
        options: [
          "Continue running and monitor whether the smoke increases before stopping",
          "Stop the machine immediately using the emergency stop or feed hold, then investigate the cause—smoke and squealing indicate severe cutting conditions, possible tool failure, or incorrect speeds/feeds that can damage the part, tooling, and machine",
          "Increase the coolant flow to suppress the smoke and reduce heat",
          "Decrease the feed rate by 10% to reduce the cutting force"
        ],
        correctIndex: 1,
        explanation: "Smoke and abnormal noise indicate an immediate problem—a broken tool, missing coolant, or wrong speeds/feeds. Continuing without stopping risks workpiece damage, tooling loss, machine damage, and potential safety hazard."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-production-technician-cpt:mission:cpt-course-4",
    courseSlug: "cpt-course-4",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Welding Fundamentals",
    missionName: "Code Architect",
    missionTagline: "Prove you can identify welding processes and quality requirements",
    primaryAxis: "Engineering",
    skillLabels: ["Welding processes", "Weld symbols", "Quality inspection", "Safety", "Problem-solving"],
    scenarioPrompt: "You are a production technician inspecting welded assemblies before they ship to a customer. The blueprint specifies a 6mm fillet weld on all four sides of a bracket joint. You find one weld that is 4mm and shows porosity. Using your welding knowledge from this course, describe how you would handle this nonconformance.",
    evidenceHint: "A strong response identifies both defects (undersized weld = insufficient strength, porosity = internal voids from gas entrapment), quarantines the part, documents the nonconformance, determines root cause (welder error, contaminated material, wrong settings), and follows the NCR process.",
    quizQuestions: [
      {
        text: "A weld symbol on a blueprint shows a fillet weld with the number '8' below the horizontal line. What does this specify?",
        options: [
          "The weld must be completed in 8 passes",
          "The fillet weld size is 8mm — the number adjacent to the weld symbol on the arrow side specifies the leg size of the fillet weld",
          "The weld requires 8mm of overlap with the base metal",
          "The weld should be performed 8mm from the edge of the joint"
        ],
        correctIndex: 1,
        explanation: "Weld symbols use standardized notation where the number adjacent to the fillet weld symbol specifies the leg size. An 8mm fillet has legs of 8mm—a larger size indicates greater strength and penetration requirements."
      },
      {
        text: "A welder uses contaminated base metal with rust and oil on the surface before welding. What weld defect is MOST likely to result?",
        options: [
          "Undercutting — the base metal surface is melted away at the weld toe",
          "Porosity — gas from the contamination (oil vapor, rust) is trapped in the solidifying weld metal, creating voids that weaken the joint",
          "Cold cracking — the contamination causes hydrogen embrittlement after cooling",
          "Lack of fusion — the contamination prevents the weld pool from bonding to the base metal"
        ],
        correctIndex: 1,
        explanation: "Oil and rust release gas when exposed to welding heat. Gas trapped in the weld pool before solidification creates porosity—small voids that reduce the weld's cross-sectional area and strength."
      },
      {
        text: "A production inspector finds a crack in a structural weld on a safety-critical assembly. The weld looks acceptable by visual inspection but the crack is detected by dye penetrant testing. What is the CORRECT response?",
        options: [
          "Accept the part since the crack was not visible without special testing methods",
          "Reject and quarantine the part immediately — cracks in structural welds are a critical defect regardless of detection method; the part must follow the nonconforming material process and the root cause must be investigated before production continues",
          "Grind out the crack and re-weld the area without formal documentation since the repair is straightforward",
          "Accept the part with a deviation since the crack is below the visual detection threshold and may not affect performance"
        ],
        correctIndex: 1,
        explanation: "Cracks in structural welds are never acceptable regardless of size or detection method. They propagate under load and can lead to catastrophic failure. Immediate quarantine and root cause investigation are mandatory."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-production-technician-cpt:mission:cpt-course-5",
    courseSlug: "cpt-course-5",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Quality Control and Inspection",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can use quality tools to find and prevent defects",
    primaryAxis: "Analytics",
    skillLabels: ["SPC", "Control charts", "Measurement tools", "Root cause analysis", "Attention to detail"],
    scenarioPrompt: "Your quality team notices that a drilled hole diameter has been drifting toward the upper control limit on the control chart over the last 20 samples, even though no points have exceeded the limit yet. Using your quality control and SPC knowledge from this course, explain what this trend indicates and what action should be taken.",
    evidenceHint: "A strong response identifies this as a non-random trend (run of points in one direction) indicating the process is drifting out of control before a limit is exceeded, describes investigating the cause (tool wear, thermal expansion), and explains why acting before a limit breach prevents defects.",
    quizQuestions: [
      {
        text: "A control chart shows 8 consecutive data points above the centerline, all within the control limits. Should the operator take action?",
        options: [
          "No — all points are within control limits so the process is in statistical control",
          "Yes — eight consecutive points on one side of the centerline is a Western Electric run rule violation indicating a non-random shift in the process mean; action should be taken to investigate and correct the cause before a point exceeds the control limit",
          "No — action is only required when a point exceeds the upper or lower control limit",
          "Yes — but only if the next point also falls above the centerline, making it nine consecutive points"
        ],
        correctIndex: 1,
        explanation: "Control charts use run rules beyond just limit violations. Eight consecutive points above the centerline indicates a non-random pattern—statistically, this is very unlikely to occur by chance and signals a real process shift requiring investigation."
      },
      {
        text: "A measurement technician measures the same part five times with a micrometer and gets five different readings: 25.01, 24.99, 25.03, 24.98, 25.02mm. The specification is 25.00 ±0.05mm. What does this variation in repeated measurements indicate?",
        options: [
          "The part dimensions are inconsistent and the part should be rejected",
          "The measurement system has repeatability variation (gauge R&R issue) — the micrometer, technique, or the technician's reading consistency is contributing to measurement error that must be understood before trusting inspection results",
          "The part is at the center of the tolerance and all readings are acceptable",
          "Normal measurement variation; this level of spread is expected for all precision instruments"
        ],
        correctIndex: 1,
        explanation: "Variation in repeated measurements of the same stable part reflects measurement system error. A Gauge R&R study quantifies how much of observed variation is from the measurement system vs. the process—measurement error must be small relative to the tolerance."
      },
      {
        text: "A fishbone (Ishikawa) diagram is used during a quality investigation of increased scrap rates. Which categories does this tool systematically explore?",
        options: [
          "Cost, schedule, quality, and safety — the four dimensions of manufacturing performance",
          "Man, Machine, Material, Method, Measurement, and Environment — the 6M categories that represent the major potential causes of a quality problem",
          "Define, Measure, Analyze, Improve, and Control — the DMAIC problem-solving phases",
          "Customer, supplier, input, process, and output — the SIPOC supply chain model"
        ],
        correctIndex: 1,
        explanation: "The fishbone diagram organizes potential causes into the 6M categories. This structured brainstorming tool ensures no major cause category is overlooked during root cause analysis—each 'bone' represents one category with specific causes branching off."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-production-technician-cpt:mission:cpt-course-6",
    courseSlug: "cpt-course-6",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Safety and OSHA Compliance",
    missionName: "Client Champion",
    missionTagline: "Prove you can identify hazards and keep your team safe",
    primaryAxis: "Service",
    skillLabels: ["OSHA standards", "Hazard identification", "PPE requirements", "Lockout/Tagout", "Safety culture"],
    scenarioPrompt: "You are a production technician who notices that a machine guard has been removed from a press brake and is sitting on a nearby shelf. Your supervisor is not in the area and the operator is about to start the next production run. Using your OSHA and safety knowledge from this course, describe how you would handle this situation.",
    evidenceHint: "A strong response stops the operator from starting the machine, cites the OSHA machine guarding standard, replaces or reports the missing guard before production resumes, reports to the supervisor, and explains that production pressure never overrides safety requirements.",
    quizQuestions: [
      {
        text: "A production worker is about to perform maintenance on a conveyor while it is still energized because 'it will only take a second.' What OSHA standard applies and what must be done?",
        options: [
          "The worker can proceed if they are moving quickly and another worker watches for movement",
          "OSHA's Lockout/Tagout (LOTO) standard (29 CFR 1910.147) requires that all energy sources be isolated and locked out before any servicing or maintenance work begins — no exceptions for short-duration tasks",
          "The worker must wear additional PPE (heavy gloves) to compensate for the energized state during quick maintenance",
          "The LOTO standard only applies to electrical energy; pneumatic systems have a separate procedure"
        ],
        correctIndex: 1,
        explanation: "LOTO has no time exceptions. 'Just a second' tasks cause severe injuries and fatalities every year because unexpected machine energization takes less than a second. The standard requires complete energy isolation regardless of task duration."
      },
      {
        text: "A safety data sheet (SDS) for a cleaning solvent lists the flash point as 15°C (59°F). What does this indicate about storage and handling in a manufacturing environment?",
        options: [
          "The solvent needs to be stored above 15°C to prevent it from freezing",
          "The solvent is highly flammable — its flash point is below room temperature, meaning it can ignite at normal working conditions; it must be stored in flammable storage cabinets away from ignition sources and used with appropriate ventilation and PPE",
          "The flash point indicates the temperature at which the solvent evaporates, requiring specific ventilation above 15°C",
          "No special precautions are needed since industrial facilities are typically kept below the flash point"
        ],
        correctIndex: 1,
        explanation: "A flash point below ambient temperature means the solvent is constantly releasing flammable vapors in normal conditions. This requires flammable-rated storage, bonding and grounding during transfer, and fire suppression controls."
      },
      {
        text: "A production technician reports a near-miss incident where a part ejected from a lathe narrowly missed another worker. The supervisor says 'nobody got hurt so we don't need to report it.' What is the correct response?",
        options: [
          "Agree with the supervisor since OSHA only requires reporting actual injuries, not near-misses",
          "Disagree and document the near-miss — near-miss reporting is a leading indicator of serious incidents; investigating and correcting the cause prevents the next occurrence from becoming an injury or fatality",
          "Report the incident to OSHA directly since the supervisor is suppressing safety information",
          "Wait to see if the same near-miss occurs again before escalating, since a single occurrence may be an anomaly"
        ],
        correctIndex: 1,
        explanation: "Near-miss reporting is fundamental to safety culture. Near-misses reveal the same hazards as accidents without the injury—investigating them is the opportunity to fix the root cause before someone is hurt."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-production-technician-cpt:mission:cpt-course-7",
    courseSlug: "cpt-course-7",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Lean Manufacturing Principles",
    missionName: "Project Commander",
    missionTagline: "Prove you can identify waste and improve production flow",
    primaryAxis: "Strategy",
    skillLabels: ["Lean principles", "5S", "Waste elimination", "Value stream mapping", "Continuous improvement"],
    scenarioPrompt: "You walk through a production area and observe: tools not returned to designated locations, operators waiting 2 minutes between each cycle for the machine to reset, partially completed assemblies stacked between workstations, and operators walking 50 feet to retrieve raw materials. Using your lean manufacturing knowledge from this course, identify the wastes present and prioritize one improvement.",
    evidenceHint: "A strong response identifies the wastes by type (motion waste — walking 50 ft; waiting waste — 2-min machine reset; transportation/WIP inventory — stacked assemblies; disorganization — tools out of place), maps them to the 8 wastes of lean, and prioritizes reducing the machine reset wait as it directly impacts cycle time.",
    quizQuestions: [
      {
        text: "A production area has tools, materials, and equipment scattered without designated locations. Operators spend an average of 8 minutes per shift searching for items. Which lean tool directly addresses this waste?",
        options: [
          "Kanban — a visual signaling system for inventory replenishment",
          "5S (Sort, Set in order, Shine, Standardize, Sustain) — a workplace organization methodology that assigns specific locations to every item, making the standard condition visual and searchable time zero",
          "SMED (Single Minute Exchange of Die) — a methodology for reducing setup and changeover time",
          "Poka-yoke — error-proofing devices that prevent mistakes during production"
        ],
        correctIndex: 1,
        explanation: "5S creates visual order in the workplace. 'Set in order' assigns a designated place to every item with visual indicators; 'Standardize' maintains it. Eliminating search time is one of 5S's most immediate productivity benefits."
      },
      {
        text: "A value stream map shows that a part spends 3 hours in production but 21 hours waiting between processes. What does this reveal about the production system?",
        options: [
          "The production process is highly efficient since value-added time is concentrated in a short window",
          "Only 12.5% of the lead time is value-added (3÷24 hrs); 87.5% is non-value-added waiting — the biggest improvement opportunity is reducing the wait time between processes, not speeding up the production steps themselves",
          "The waiting time is acceptable since it allows batches to accumulate for efficient processing",
          "The value stream map is inaccurate; 21 hours of waiting is not possible in a lean facility"
        ],
        correctIndex: 1,
        explanation: "Value stream maps frequently reveal that value-added time is a small fraction of total lead time. The improvement opportunity is almost always in the waiting and non-value-added time—not in the value-added steps that are already lean."
      },
      {
        text: "A production team implements a kaizen event and reduces a changeover time from 90 minutes to 25 minutes. Which lean principle does this improvement support and what business benefit does it create?",
        options: [
          "5S — organizing the changeover tools reduces the time spent searching for items",
          "SMED (Single Minute Exchange of Die) — reducing changeover time increases the frequency at which the line can switch between products, enabling smaller batch sizes, reduced inventory, and faster response to customer demand changes",
          "Poka-yoke — the changeover now includes error-proofing steps that prevent incorrect setups",
          "TPM (Total Productive Maintenance) — the changeover improvement reduces unplanned downtime"
        ],
        correctIndex: 1,
        explanation: "SMED is the lean tool specifically for changeover reduction. Shorter changeovers enable smaller economical batch sizes, which reduces inventory, shortens lead times, and allows the production line to respond faster to changes in product mix."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-production-technician-cpt:mission:cpt-course-8",
    courseSlug: "cpt-course-8",
    programSlug: "certified-production-technician-cpt",
    programTitle: "Certified Production Technician (CPT)",
    courseTitle: "Production Technology Capstone",
    missionName: "Tech Builder",
    missionTagline: "Prove you are ready to perform as a certified production technician",
    primaryAxis: "Engineering",
    skillLabels: ["End-to-end production skills", "Quality", "Safety", "CNC operation", "Problem-solving"],
    scenarioPrompt: "You are presenting your CPT capstone to a manufacturing hiring panel. They ask you to describe a production problem you identified and solved during your training, walk through the tools you used, and explain what you would do differently. Using the full skill set from this program, structure your answer.",
    evidenceHint: "A strong response names a specific problem (e.g., dimensional drift, scrap rate increase), uses quality tools (SPC, fishbone), applies safety protocols, shows awareness of lean waste, and demonstrates a structured problem-solving approach with honest reflection.",
    quizQuestions: [
      {
        text: "During a capstone production run, a technician finds that 8 of 50 parts are out of tolerance on a drilled hole dimension. What is the FIRST action in a structured problem-solving response?",
        options: [
          "Adjust the machine settings to correct the dimension and continue production",
          "Quarantine the 8 nonconforming parts, stop production to prevent further defects, and begin root cause investigation—changing settings without understanding the cause may fix the symptom while the real cause continues",
          "Accept the parts since 84% pass rate exceeds most quality standards",
          "Notify the customer immediately about the potential quality issue"
        ],
        correctIndex: 1,
        explanation: "Containment (quarantine + production stop) is always the first response to a quality excursion. Acting on the cause before containment risks shipping defective parts or producing hundreds more while the investigation proceeds."
      },
      {
        text: "A panel member asks: 'What is the most important skill a production technician brings to a manufacturing team?' Which answer BEST demonstrates professional understanding of the role?",
        options: [
          "Physical strength and stamina for operating heavy machinery throughout a full shift",
          "Observational discipline — the ability to notice when something looks, sounds, or measures differently from standard, combined with the knowledge to take the right action; most production problems announce themselves before they become critical if someone is paying attention",
          "Speed — producing parts as fast as possible to meet daily output targets",
          "Technical knowledge of every machine on the production floor"
        ],
        correctIndex: 1,
        explanation: "Observational discipline is what separates an average technician from an excellent one. Speed without quality creates scrap; broad machine knowledge helps but is incomplete without the judgment to act on abnormal conditions before they escalate."
      },
      {
        text: "A new job posting requires 'CPT certification and knowledge of lean manufacturing, blueprint reading, and OSHA compliance.' A candidate with this certificate asks how to demonstrate competency in an interview. What is the STRONGEST approach?",
        options: [
          "List the course names from the certificate program and describe the topics covered",
          "Bring specific examples: describe a part you inspected using a blueprint spec, a waste you identified and the lean tool you applied, and a safety hazard you recognized and addressed—concrete examples from real or simulated production experience demonstrate applied competency",
          "Offer to take any skills test the employer provides since certification alone proves competency",
          "Emphasize the number of hours spent in training and the passing score achieved on certification exams"
        ],
        correctIndex: 1,
        explanation: "Employers hire competency, not credentials. Concrete examples using specific tools and real situations demonstrate that the candidate can apply knowledge in a production environment—certification shows the training happened; examples show it was absorbed."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 18: Certified Logistics Technician (CLT) ───

  {
    key: "certified-logistics-technician-clt:mission:clt-course-1",
    courseSlug: "clt-course-1",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "Introduction to Supply Chain Management",
    missionName: "Project Commander",
    missionTagline: "Prove you can map and manage a supply chain end to end",
    primaryAxis: "Strategy",
    skillLabels: ["Supply chain fundamentals", "Logistics planning", "Demand forecasting", "ERP basics", "Process mapping"],
    scenarioPrompt: "Your manager asks you to explain why a recent shipment of components arrived two weeks late, causing a production stoppage. Walk through the supply chain failure points you would investigate and how you would prevent it in the future.",
    evidenceHint: "Describe the supply chain stages you would audit, the data sources you would check, and the corrective process or tool you would recommend.",
    quizQuestions: [
      {
        text: "A manufacturer notices that it frequently runs out of a key component even though orders are placed on a fixed schedule. Which supply chain concept best addresses this problem?",
        options: [
          "Just-in-time manufacturing, which eliminates all safety stock to reduce holding costs",
          "Demand forecasting with safety stock—analyzing historical usage patterns and lead time variability to set reorder points that prevent stockouts while avoiding excess inventory",
          "Single-source procurement to reduce the number of vendors and simplify ordering",
          "Increasing the order frequency to daily to ensure components are always available"
        ],
        correctIndex: 1,
        explanation: "Demand forecasting combined with safety stock calculations addresses the root cause: variable demand and lead times. Fixed-schedule ordering without forecasting leads to either excess inventory or stockouts."
      },
      {
        text: "A logistics coordinator is asked to compare two suppliers: Supplier A has the lowest unit price but ships from overseas with a 6-week lead time; Supplier B costs 15% more but ships domestically in 3 days. Which factor most often drives the decision toward Supplier B despite the higher cost?",
        options: [
          "Domestic suppliers always have better quality control processes",
          "Total cost of ownership—when carrying costs, stockout risk, emergency freight, and production disruption costs are included, the lower unit price of Supplier A may result in a higher total cost",
          "International shipping is prohibited for most manufacturing components",
          "Supplier B's faster shipping time means the company can charge customers more"
        ],
        correctIndex: 1,
        explanation: "Total cost of ownership (TCO) includes unit price, freight, duties, inventory carrying costs, and risk costs. A higher unit price with faster, reliable delivery often yields lower TCO than a cheaper but risky distant supplier."
      },
      {
        text: "During a supply chain review, you discover that each department (sales, production, procurement) maintains its own separate spreadsheet for inventory data, leading to conflicting numbers. What is the standard solution to this problem?",
        options: [
          "Designate one person to manually reconcile all three spreadsheets weekly",
          "Implement an integrated ERP system with a single shared database so all departments view and update the same real-time inventory data, eliminating conflicting records",
          "Require each department to submit their spreadsheet to IT at the end of each day",
          "Reduce the number of departments that track inventory to minimize data conflicts"
        ],
        correctIndex: 1,
        explanation: "ERP systems solve the data siloing problem by providing a single source of truth. When sales, production, and procurement all operate from the same database, inventory decisions are based on accurate, real-time data."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-logistics-technician-clt:mission:clt-course-2",
    courseSlug: "clt-course-2",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "Inventory Management and Control",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can optimize inventory levels with data",
    primaryAxis: "Analytics",
    skillLabels: ["Inventory control", "ABC analysis", "Cycle counting", "Inventory metrics", "Excel/data tools"],
    scenarioPrompt: "A warehouse manager shows you that carrying costs are high and stockouts still occur on certain SKUs. You have access to transaction history for 2,000 SKUs. Describe your analytical approach to diagnosing and fixing the inventory problem.",
    evidenceHint: "Explain the analysis method you would use to prioritize SKUs, the metrics you would calculate, and the inventory control approach you would recommend.",
    quizQuestions: [
      {
        text: "A company has 500 SKUs. Analysis shows that 50 SKUs account for 80% of annual inventory value. Which inventory management approach should be applied to these top 50 SKUs?",
        options: [
          "Apply the same standard reorder point to all SKUs since treating items differently creates confusion",
          "Apply ABC analysis—classify the top 50 as 'A' items requiring tighter controls, more frequent cycle counting, and closer monitoring of reorder points and supplier performance",
          "Increase safety stock for all 500 SKUs equally to prevent any stockouts",
          "Automate reordering for the bottom 450 SKUs since they are low-value"
        ],
        correctIndex: 1,
        explanation: "ABC analysis prioritizes inventory management effort. 'A' items (high value, high impact) warrant tight control and frequent review. Applying equal effort to all SKUs wastes resources and misses the most critical items."
      },
      {
        text: "A cycle counting program shows that actual inventory for a fast-moving part is consistently 8-12 units lower than the system shows. What is the most likely root cause and first corrective step?",
        options: [
          "The ERP system has a bug that overcounts fast-moving items automatically",
          "Shrinkage or process breakdowns—unrecorded picks, receiving errors, or damage write-offs not entered in the system; investigate the paper trail from receiving through pick to identify where the discrepancy is created",
          "Fast-moving parts should always have a built-in 10% buffer added to the system count",
          "The cycle count process itself is inaccurate and should be replaced with an annual physical count"
        ],
        correctIndex: 1,
        explanation: "Systematic cycle count discrepancies indicate a process gap—missing transactions somewhere in the flow. Tracing the paper or electronic trail from receipt to shipment identifies where inventory is leaving without being recorded."
      },
      {
        text: "A buyer wants to reduce inventory costs and considers ordering smaller quantities more frequently. What tradeoff must be analyzed before implementing this change?",
        options: [
          "Smaller orders always reduce total inventory cost, so no tradeoff analysis is needed",
          "Ordering costs (each order incurs processing, freight, and receiving labor costs) versus carrying costs (holding excess inventory costs capital and space)—Economic Order Quantity (EOQ) balances these to find the optimal order size",
          "More frequent ordering increases supplier prices because suppliers prefer large orders",
          "Smaller order quantities always result in stockouts because safety stock cannot compensate"
        ],
        correctIndex: 1,
        explanation: "EOQ analysis reveals that total inventory cost is minimized at the intersection of ordering costs and carrying costs. Simply ordering more or less frequently without this analysis often increases total cost."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-logistics-technician-clt:mission:clt-course-3",
    courseSlug: "clt-course-3",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "Transportation and Distribution",
    missionName: "Operations Pro",
    missionTagline: "Prove you can select and manage transportation modes effectively",
    primaryAxis: "Strategy",
    skillLabels: ["Transportation modes", "Freight management", "Route optimization", "Distribution networks", "Carrier relations"],
    scenarioPrompt: "A company ships products to customers across the country using a single LTL carrier. Delivery times are inconsistent and costs are rising. You are asked to evaluate the distribution strategy and recommend improvements.",
    evidenceHint: "Identify the transportation factors you would analyze, the alternatives you would consider, and how you would measure success after changes.",
    quizQuestions: [
      {
        text: "A manufacturer ships products to 200 customers, most of whom order small quantities. The current approach is individual LTL shipments to each customer. A consultant proposes consolidating shipments through a regional distribution center. What is the primary benefit of this approach?",
        options: [
          "Regional distribution centers eliminate the need for carrier contracts",
          "Consolidation reduces the per-unit freight cost by combining many small shipments into full truckloads to the DC, then distributing locally—lowering total transportation cost and improving delivery predictability",
          "Customers prefer receiving shipments from regional centers because the product arrives fresher",
          "LTL carriers refuse to deliver to areas served by regional distribution centers"
        ],
        correctIndex: 1,
        explanation: "Freight consolidation through a DC trades the high per-unit cost of many small LTL shipments for the lower cost of full truckloads. Local last-mile distribution from the DC is typically faster and more predictable than long-haul LTL."
      },
      {
        text: "A logistics manager must choose between shipping a large industrial component by truck (5-day transit, moderate cost) or air freight (2-day transit, 4x the cost). Under what condition does air freight become the correct choice?",
        options: [
          "Air freight is always justified because faster delivery improves customer satisfaction scores",
          "When the cost of the 3-day delay exceeds the premium—such as a production line stoppage costing thousands per hour, a contract penalty, or a customer relationship risk that outweighs the additional freight cost",
          "Air freight should be used for all shipments over a certain weight threshold",
          "When the truck carrier's transit time guarantee is not in writing"
        ],
        correctIndex: 1,
        explanation: "Transportation mode selection requires comparing the full cost of each option, including delay costs. Air freight's premium is justified when the cost of waiting—in production losses, penalties, or customer impact—exceeds the freight cost difference."
      },
      {
        text: "A distribution center handles 1,000 outbound shipments per day. The transport manager notices that 30% of trucks leave less than half full. What metric and strategy should be applied to improve this situation?",
        options: [
          "Track on-time delivery percentage and add more carriers to fill the remaining space",
          "Track trailer utilization rate and implement load planning software that groups orders by destination and size to maximize truck fill rates before dispatch",
          "Reduce the number of daily shipments by requiring customers to place orders on specific days",
          "Switch entirely to parcel carriers who handle any shipment size without fill rate concerns"
        ],
        correctIndex: 1,
        explanation: "Low trailer utilization means paying for unused capacity. Load planning tools optimize how orders are combined and routed, maximizing truck fill and reducing cost per unit shipped."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-logistics-technician-clt:mission:clt-course-4",
    courseSlug: "clt-course-4",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "Warehouse Operations",
    missionName: "Code Architect",
    missionTagline: "Prove you can design and optimize warehouse workflows",
    primaryAxis: "Engineering",
    skillLabels: ["Warehouse layout", "Slotting optimization", "Pick processes", "WMS systems", "Safety compliance"],
    scenarioPrompt: "A warehouse processes 5,000 picks per day but pickers are constantly walking long distances to retrieve fast-moving items stored in random locations. Productivity is low and errors are increasing. Redesign the approach.",
    evidenceHint: "Describe the slotting strategy you would apply, the process changes you would make, and how you would measure improvement.",
    quizQuestions: [
      {
        text: "A warehouse stores 2,000 SKUs but pickers walk an average of 8 miles per shift because fast-moving items are scattered throughout the facility. What is the most effective layout solution?",
        options: [
          "Install moving walkways throughout the warehouse to reduce picker fatigue",
          "Implement velocity-based slotting—place the highest-velocity (fastest-moving) SKUs closest to the shipping dock and pick start zone, so pickers travel minimal distance for the majority of their picks",
          "Divide the warehouse into zones by product category so pickers learn one zone thoroughly",
          "Add more pickers to compensate for the excessive travel time"
        ],
        correctIndex: 1,
        explanation: "Velocity-based slotting is the fundamental warehouse layout strategy. Since 20% of SKUs typically account for 80% of picks, placing those items close to the starting point dramatically reduces total travel distance."
      },
      {
        text: "A warehouse management system (WMS) pick list directs a picker to Location A-03-B-12, but when the picker arrives, the location is empty. The WMS still shows 5 units in stock. What is the correct response?",
        options: [
          "Continue to the next pick and report the discrepancy at the end of the shift",
          "Immediately record a location discrepancy in the WMS, initiate an inventory adjustment, search for the item at alternate locations, and inform the supervisor so the order can be managed—accurate system data is more valuable than completing one pick without correction",
          "Assume the previous shift lost the items and write off the inventory immediately",
          "Pick from a nearby similar-looking item if the part numbers are close enough"
        ],
        correctIndex: 1,
        explanation: "Inventory accuracy is the foundation of warehouse operations. Skipping discrepancy reporting propagates bad data and creates future shortfalls. Immediate correction keeps the WMS reliable and allows supervisors to fulfill the order."
      },
      {
        text: "A warehouse implements a batch picking process where one picker collects items for 10 orders simultaneously. What is the primary benefit and the primary risk of this approach?",
        options: [
          "Benefit: eliminates the need for a WMS; Risk: pickers must memorize all 10 orders",
          "Benefit: reduces total travel time by completing multiple orders in a single pass through the warehouse; Risk: increased pick errors and sorting complexity—without a strong verification process, items can be assigned to the wrong order",
          "Benefit: allows each picker to specialize in one product category; Risk: orders with items in multiple categories must be split",
          "Benefit: eliminates the need for a conveyor system; Risk: pickers become fatigued faster because of the heavier cart"
        ],
        correctIndex: 1,
        explanation: "Batch picking increases productivity by reducing travel but introduces error risk at the sort and consolidation step. Strong verification processes (scan-to-cart, sort zones) are essential to capture the efficiency benefit without sacrificing accuracy."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-logistics-technician-clt:mission:clt-course-5",
    courseSlug: "clt-course-5",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "Procurement and Vendor Management",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can source, evaluate, and manage supplier relationships",
    primaryAxis: "Strategy",
    skillLabels: ["Procurement process", "Vendor evaluation", "Contract management", "Cost negotiation", "Supplier scorecards"],
    scenarioPrompt: "Your company relies on a single supplier for a critical component. That supplier just notified you of a 6-week production shutdown. You have 3 weeks of inventory on hand. Describe your immediate response and long-term strategy to prevent this situation.",
    evidenceHint: "Explain your emergency sourcing steps, how you would communicate internally, and what supplier diversification strategy you would recommend going forward.",
    quizQuestions: [
      {
        text: "A procurement manager is evaluating two suppliers for a critical assembly component. Supplier X has the lowest price but has delivered late on 4 of the last 12 orders. Supplier Y costs 8% more but has a 99.8% on-time delivery record. How should this decision be made?",
        options: [
          "Always choose the lowest price supplier and manage late deliveries through expediting",
          "Evaluate total cost of late delivery—production stoppages, expedited freight, and customer impact—and compare against the 8% price premium; Supplier Y likely costs less when delivery performance is fully valued",
          "Split the business equally between both suppliers regardless of the analysis",
          "Require Supplier X to sign a penalty clause for late deliveries before awarding the contract"
        ],
        correctIndex: 1,
        explanation: "Procurement decisions must account for total cost, not just unit price. Late deliveries generate hidden costs (expediting, downtime, customer penalties) that often exceed the price savings from a cheaper but unreliable supplier."
      },
      {
        text: "A buyer negotiating with a supplier hears: 'Our price is fixed—there's nothing to negotiate.' What is the most effective procurement response?",
        options: [
          "Accept the fixed price immediately to maintain a positive supplier relationship",
          "Expand the negotiation scope beyond unit price—explore payment terms (30 vs. 60 days net), order volume commitments for price breaks, packaging changes, delivery frequency, quality certifications, or value-added services that improve total value without changing the listed price",
          "Threaten to immediately switch to a competitor supplier even if no alternative exists",
          "Reduce the order quantity to force the supplier to lower their price"
        ],
        correctIndex: 1,
        explanation: "Skilled negotiators understand that price is one variable in a multi-dimensional agreement. When price is firm, negotiating terms, volume, service levels, and payment creates value even without a unit price concession."
      },
      {
        text: "A vendor scorecard shows that a long-term supplier has gradually declined from a 94% quality rating to 81% over six months. The procurement team has not addressed it because the relationship is 'comfortable.' What is the correct action?",
        options: [
          "Continue monitoring for another six months before taking action to allow time for improvement",
          "Schedule a formal supplier performance review, share the scorecard data, set a specific improvement target with timeline, and begin qualifying an alternate source in parallel—declining quality without intervention continues to deteriorate and creates supply risk",
          "Immediately terminate the supplier contract and switch to a new source",
          "Reduce the order quantity from the supplier until quality improves on its own"
        ],
        correctIndex: 1,
        explanation: "Supplier performance management requires proactive intervention before decline becomes critical. Formal review with data, clear targets, and parallel qualification protects supply while giving the supplier an opportunity to correct."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-logistics-technician-clt:mission:clt-course-6",
    courseSlug: "clt-course-6",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "Supply Chain Technology and SAP",
    missionName: "Systems Pro",
    missionTagline: "Prove you can use ERP and supply chain technology effectively",
    primaryAxis: "Engineering",
    skillLabels: ["SAP basics", "ERP navigation", "Supply chain software", "Data entry accuracy", "System reporting"],
    scenarioPrompt: "You are entering a purchase order into SAP and realize the vendor number you were given does not match the vendor name on the invoice. Describe how you would handle this discrepancy and why accurate data entry in ERP systems matters.",
    evidenceHint: "Explain the verification steps you would take, who you would involve, and what the downstream consequences of an incorrect entry would be.",
    quizQuestions: [
      {
        text: "A logistics technician enters a goods receipt in SAP and accidentally records 500 units received instead of 50. The error is discovered 3 days later. What is the likely cascade of problems this error caused?",
        options: [
          "No significant impact since ERP systems automatically correct data entry errors during nightly processing",
          "The inventory record now shows 450 phantom units, procurement may cancel a needed reorder because it appears overstocked, accounts payable may process an incorrect invoice amount, and production may plan against units that don't exist—all requiring manual correction",
          "The supplier will be notified automatically and will correct the order quantity",
          "Only the accounts payable record is affected since warehouse inventory is tracked separately"
        ],
        correctIndex: 1,
        explanation: "ERP systems integrate data across departments—one incorrect entry propagates to inventory, procurement, finance, and production planning simultaneously. Data accuracy at entry is critical because corrections require effort across multiple functions."
      },
      {
        text: "A supply chain analyst needs to identify which purchase orders are overdue for delivery. In an ERP system like SAP, what is the most efficient way to get this information?",
        options: [
          "Email each buyer individually and ask them to check their own orders",
          "Run a standard purchase order report filtered by delivery date less than today and status 'open'—ERP reporting allows cross-functional visibility into all open orders without requiring manual coordination",
          "Check each vendor's website to see if they have shipped the orders yet",
          "Wait until the receiving dock reports items as missing at end of month"
        ],
        correctIndex: 1,
        explanation: "ERP reporting is one of the primary productivity advantages over manual systems. Standard reports with filters provide instant cross-functional visibility that would require hours of manual coordination otherwise."
      },
      {
        text: "A company is implementing SAP for the first time and needs to migrate 10 years of vendor, inventory, and order history from spreadsheets. A project manager suggests skipping data cleansing to save time. Why is this a high-risk decision?",
        options: [
          "SAP requires data to be entered manually one record at a time, making migration irrelevant",
          "Dirty data migrated into the ERP becomes the foundation for all future transactions—duplicate vendors generate incorrect payments, wrong inventory balances create procurement errors, and bad historical data produces inaccurate forecasts; cleansing before migration is far cheaper than correcting after go-live",
          "Data cleansing is only important for customer records, not supply chain data",
          "SAP's built-in validation will catch and fix all data quality issues during migration"
        ],
        correctIndex: 1,
        explanation: "Data migration quality determines ERP success. Organizations that skip cleansing routinely face years of corrections, duplicate payments, and poor system adoption because users don't trust data they know is unreliable."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-logistics-technician-clt:mission:clt-course-7",
    courseSlug: "clt-course-7",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "Global Supply Chain and Trade",
    missionName: "Project Commander",
    missionTagline: "Prove you understand international logistics and compliance",
    primaryAxis: "Strategy",
    skillLabels: ["Import/export basics", "Trade compliance", "Customs documentation", "Incoterms", "Global logistics"],
    scenarioPrompt: "Your company is importing a container of electronics from a supplier in Asia for the first time. The shipment arrives at the port and customs holds it for 10 days, costing significant demurrage fees. Investigate what likely went wrong and how to prevent it.",
    evidenceHint: "Identify the documentation or compliance issues that commonly cause customs holds, and describe the process improvements you would implement for future shipments.",
    quizQuestions: [
      {
        text: "A first-time importer's container is held at customs because the commercial invoice lists product descriptions as 'electronic parts' without HTS (Harmonized Tariff Schedule) codes. Why does this cause a delay and what should have been done?",
        options: [
          "Customs holds shipments without HTS codes only for shipments from certain countries",
          "HTS codes are required for customs to determine the applicable tariff rate and verify compliance—without them, customs cannot process the entry; the exporter should have applied correct HTS codes to all products before the commercial invoice was issued",
          "HTS codes are optional documentation that speeds processing but is not required for entry",
          "The freight forwarder is required by law to add HTS codes after the shipment arrives"
        ],
        correctIndex: 1,
        explanation: "HTS codes are mandatory for import classification. They determine duty rates, restrictions, and compliance requirements. Shipments without correct codes cannot be processed and accumulate expensive port storage charges during the delay."
      },
      {
        text: "A supply chain manager is reviewing an import contract and sees the Incoterm 'FOB Shanghai.' What does this mean for the buyer's risk and cost responsibility?",
        options: [
          "The seller is responsible for all costs and risk until the goods arrive at the buyer's warehouse",
          "The buyer assumes risk and cost responsibility once the goods are loaded onto the vessel at Shanghai—from that point forward, the buyer is responsible for ocean freight, insurance, import duties, and domestic delivery",
          "FOB means the freight is free and the buyer pays only import duties",
          "The seller retains ownership of the goods until the buyer pays the final invoice"
        ],
        correctIndex: 1,
        explanation: "FOB (Free On Board) is one of the most common Incoterms in global trade. Understanding the risk transfer point is critical because it determines who bears the cost of loss or damage during transit and who arranges insurance."
      },
      {
        text: "A company importing goods from a new country discovers that the product requires an import license before it can enter the US. The license application takes 60 days. The first shipment has already left the origin port. What is the risk and what should have been done?",
        options: [
          "The shipment can be released to the buyer while the license application is pending",
          "The shipment will be refused entry or placed in a bonded warehouse at the importer's expense until the license is obtained—trade compliance research, including license requirements, should be completed before any purchase order is issued to a foreign supplier",
          "Import licenses are retroactively applied by customs once the application is submitted",
          "The buyer can pay a fee to expedite customs clearance without the license"
        ],
        correctIndex: 1,
        explanation: "Import license requirements must be researched before the supply relationship begins—not after goods are in transit. Reactive compliance creates costly delays, storage fees, and potential seizure of goods."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "certified-logistics-technician-clt:mission:clt-course-8",
    courseSlug: "clt-course-8",
    programSlug: "certified-logistics-technician-clt",
    programTitle: "Certified Logistics Technician (CLT)",
    courseTitle: "CLT Certification Preparation",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can apply CLT knowledge to real workplace scenarios",
    primaryAxis: "Strategy",
    skillLabels: ["CLT exam preparation", "Supply chain integration", "Problem solving", "Career readiness", "Professional communication"],
    scenarioPrompt: "You are in a CLT certification interview. The interviewer says: 'Describe a logistics problem you have solved or would solve using the skills from this program.' Prepare a complete, compelling response.",
    evidenceHint: "Structure your answer using a specific scenario, the tools or methods you applied, the outcome, and what you would do differently.",
    quizQuestions: [
      {
        text: "A logistics technician is asked to reduce the company's freight spend by 10% without changing service levels. Which approach demonstrates the strongest application of CLT-level competency?",
        options: [
          "Negotiate a blanket discount with the current carrier by threatening to switch providers",
          "Conduct a freight audit to identify billing errors, analyze shipment data to find consolidation opportunities, benchmark current rates against market, and implement a carrier scorecard to hold providers accountable—systematic analysis and continuous improvement rather than one-time negotiation",
          "Switch all shipments to the cheapest available carrier immediately",
          "Reduce shipment frequency to lower total freight invoices regardless of inventory impact"
        ],
        correctIndex: 1,
        explanation: "CLT-level competency means applying systematic analysis, not reactive tactics. A freight audit often recovers 1-3% in billing errors alone, and data-driven consolidation and benchmarking typically yield sustainable savings without service degradation."
      },
      {
        text: "During a job interview for a logistics coordinator role, a CLT-certified candidate is asked: 'What is the difference between a push and pull supply chain strategy?' What is the correct and complete answer?",
        options: [
          "Push means suppliers deliver frequently; pull means the company picks up from the supplier",
          "Push strategy produces and ships based on demand forecasts, building inventory ahead of customer orders; pull strategy produces and ships only in response to actual customer demand—pull reduces inventory risk but requires faster response capability; most companies use a hybrid approach",
          "Push is used for domestic shipments; pull is used for international shipments",
          "Push and pull refer to the physical handling method in the warehouse, not supply chain strategy"
        ],
        correctIndex: 1,
        explanation: "Push vs. pull is a fundamental supply chain strategy concept. Interviewers use it to test whether candidates understand not just the definition but the tradeoffs—inventory risk vs. responsiveness—and practical application in real supply chains."
      },
      {
        text: "A new CLT graduate is starting their first logistics role and wants to add value quickly. Which approach will have the most impact in the first 90 days?",
        options: [
          "Propose major system changes and process redesigns based on textbook best practices immediately",
          "Learn the current state deeply before suggesting changes—shadow experienced team members, document current processes, measure key metrics, ask why things are done a certain way, and identify one specific, scoped improvement with measurable ROI to pilot with supervisor approval",
          "Focus only on assigned tasks and avoid any process improvement until promoted",
          "Implement lean manufacturing principles immediately since they apply universally to all logistics operations"
        ],
        correctIndex: 1,
        explanation: "High-performing new hires earn credibility by understanding before changing. Learning the current state reveals why things are done a certain way, builds relationships, and ensures that proposed improvements are based on actual data rather than assumptions."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── PROGRAM 20: Core Construction Training Certificate ───

  {
    key: "core-construction-training-certificate:mission:construction-course-1",
    courseSlug: "construction-course-1",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Introduction to Construction Industry",
    missionName: "Project Commander",
    missionTagline: "Prove you understand how the construction industry works",
    primaryAxis: "Strategy",
    skillLabels: ["Construction industry overview", "Project roles", "Trades knowledge", "Professional standards", "Career pathways"],
    scenarioPrompt: "A general contractor hires you as a site helper on your first construction job. On day one, the site foreman asks you to explain the difference between the GC, the owner, and the subcontractors—and who you report to. Give a clear, accurate answer.",
    evidenceHint: "Explain the roles, the chain of authority on a construction site, and how different trades coordinate on a project.",
    quizQuestions: [
      {
        text: "On a commercial construction project, the owner, general contractor, and three subcontractors all have different roles. A subcontractor's electrician asks who gives him work orders. What is the correct answer?",
        options: [
          "Directly from the building owner since they are paying for the project",
          "From the electrical subcontractor's supervisor, who coordinates with the general contractor—subcontractors are hired by and take direction from the GC, not directly from the owner; the GC is responsible for coordinating all trades on site",
          "From whichever foreman is present on site regardless of trade",
          "Directly from the architect since the architect designed the electrical system"
        ],
        correctIndex: 1,
        explanation: "Construction contracts establish clear chains of authority. Subcontractors contract with and take direction from the GC. Understanding this hierarchy prevents work stoppages, scope conflicts, and safety issues caused by receiving conflicting instructions."
      },
      {
        text: "A construction crew is starting a new residential project. Before any physical work begins, which activity is most critical to complete?",
        options: [
          "Order all materials so they arrive on day one to avoid any waiting",
          "Obtain all required permits, complete a site safety assessment, and hold a pre-construction meeting with all trades to review the schedule, scope, and site rules—starting work without permits or a coordinated plan creates legal liability and costly rework",
          "Begin excavation immediately to stay ahead of schedule",
          "Install temporary fencing around the site perimeter before notifying the permitting office"
        ],
        correctIndex: 1,
        explanation: "Pre-construction planning and permitting prevents the most expensive construction problems—illegal work requiring demolition, uncoordinated trades creating conflicts, and safety incidents from an unprepared site."
      },
      {
        text: "A new worker observes that the concrete subcontractor and the plumbing subcontractor are arguing about which trade goes first in the foundation pour. How is this type of conflict typically resolved on a well-managed construction site?",
        options: [
          "The two subcontractors negotiate between themselves without involving the GC",
          "The general contractor is the authority on site coordination—the GC reviews the construction schedule, confirms the approved sequence (typically plumbing rough-in before concrete pour), and communicates the work order to both subs; sequencing conflicts are a GC coordination responsibility",
          "The trade that arrives first each morning has priority for that day",
          "The architect resolves all trade coordination disputes since they designed the building"
        ],
        correctIndex: 1,
        explanation: "Trade coordination is a primary GC responsibility. The construction schedule and RFI/submittal process define sequencing. Workers who understand this hierarchy can de-escalate conflicts by directing them to the appropriate authority rather than arguing on site."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "core-construction-training-certificate:mission:construction-course-2",
    courseSlug: "construction-course-2",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Blueprint Reading and Construction Math",
    missionName: "Design Thinker",
    missionTagline: "Prove you can read blueprints and apply construction math accurately",
    primaryAxis: "Design",
    skillLabels: ["Blueprint reading", "Scale interpretation", "Construction math", "Measurement accuracy", "Material estimation"],
    scenarioPrompt: "A foreman hands you a blueprint page and asks you to calculate the total linear feet of baseboard trim needed for a room based on the floor plan. The scale is 1/4 inch = 1 foot. Describe your process from start to finish.",
    evidenceHint: "Explain how you read the scale, measure on the drawing, calculate the actual dimension, account for door openings, and estimate material with waste factor.",
    quizQuestions: [
      {
        text: "A blueprint shows a room dimension of 3.5 inches at a scale of 1/4 inch = 1 foot. What is the actual room length?",
        options: [
          "3.5 feet",
          "14 feet — each 1/4 inch on the drawing represents 1 foot, so 3.5 inches ÷ 0.25 = 14 feet",
          "8.75 feet",
          "42 feet"
        ],
        correctIndex: 1,
        explanation: "Scale conversion is foundational to blueprint reading. At 1/4\" = 1', the scale factor is 4 — multiply the drawing measurement by 4 to get actual dimensions. An error in scale reading propagates into every material order and cut."
      },
      {
        text: "A worker is cutting lumber to frame a wall that must be exactly 8 feet 3 and 3/4 inches tall. The saw is set up and ready. What is the correct approach before making the cut?",
        options: [
          "Cut at 8 feet since fractions are difficult to measure accurately",
          "Measure twice and mark with a pencil before cutting—confirm the tape is reading in the correct direction, that the measurement accounts for the saw blade's kerf width, and that the cut is at the intended location; 'measure twice, cut once' prevents waste and rework",
          "Cut slightly long and trim down since it is easier to remove material than add it",
          "Ask a more experienced worker to make all fractional cuts"
        ],
        correctIndex: 1,
        explanation: "'Measure twice, cut once' is the core discipline of construction accuracy. The kerf width, measurement direction, and mark placement all affect the final dimension. Cutting long and trimming wastes time and material."
      },
      {
        text: "A contractor needs to order flooring for a room that measures 14 feet by 18 feet. Flooring is sold by the square foot and comes in boxes of 25 sq ft. A 10% waste factor is standard for cuts and pattern matching. How many boxes should be ordered?",
        options: [
          "11 boxes (252 sq ft ÷ 25 = 10.08, rounded up)",
          "12 boxes — room area = 252 sq ft; with 10% waste, order 277.2 sq ft; 277.2 ÷ 25 = 11.09, round up to 12 boxes",
          "10 boxes since waste factor is an estimate and may not apply",
          "14 boxes to ensure there is surplus material for future repairs"
        ],
        correctIndex: 1,
        explanation: "Material estimation must include waste factors. Ordering the exact calculated amount guarantees a shortage when cuts generate waste. Rounding box count up (never down) ensures project completion without costly reorders of potentially discontinued material."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "core-construction-training-certificate:mission:construction-course-3",
    courseSlug: "construction-course-3",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Construction Safety and OSHA-10",
    missionName: "Client Champion",
    missionTagline: "Prove you can identify hazards and apply OSHA safety standards",
    primaryAxis: "Service",
    skillLabels: ["OSHA regulations", "Hazard identification", "PPE requirements", "Fall protection", "Safety reporting"],
    scenarioPrompt: "You arrive on a job site and notice a coworker on a scaffold without fall protection equipment, and another worker using a grinder without eye protection. Describe exactly what you do.",
    evidenceHint: "Explain the immediate actions you take, who you notify, what OSHA standards apply, and why stopping work for safety is always the right call.",
    quizQuestions: [
      {
        text: "A construction worker is asked to work on a scaffold at 12 feet above the ground. The supervisor says fall protection equipment is 'in the truck' and to start work now—they'll bring the harness in a few minutes. What is the correct response?",
        options: [
          "Begin work and signal for the harness when the supervisor returns with it",
          "Decline to work at height without fall protection in place—OSHA requires fall protection at 6 feet and above in construction; starting work without it violates federal law and puts the worker at risk of a fatal fall; the harness must be on and anchored before ascending the scaffold",
          "Work carefully and hold onto the scaffold frame as a substitute for a harness",
          "Only use fall protection on the descent since ascending is lower risk"
        ],
        correctIndex: 1,
        explanation: "OSHA 1926.502 requires fall protection at 6 feet in construction with no exceptions. Workers have the right to refuse unsafe work. The few minutes saved by starting early are not worth the risk of a fatality or the OSHA citation."
      },
      {
        text: "A worker discovers an unmarked barrel of liquid in a construction storage area. There are no labels or safety data sheets present. What is the correct action?",
        options: [
          "Open the barrel to smell the contents and determine if it is hazardous",
          "Do not touch or open the barrel—treat it as potentially hazardous, alert the supervisor immediately, and ensure the area is secured until the substance is identified through proper channels; OSHA's Hazard Communication Standard requires all chemicals to be labeled and have accessible SDS documents",
          "Move the barrel outside so it is not a problem inside the work area",
          "Check the color of the liquid since color-coding indicates the type of chemical"
        ],
        correctIndex: 1,
        explanation: "Unknown chemicals must be treated as hazardous. OSHA's HazCom standard (1910.1200) requires labels and SDS for all chemicals. Attempting to identify an unknown substance by smell or appearance has caused numerous fatalities and serious injuries."
      },
      {
        text: "A crew member notices a coworker using a circular saw with the blade guard removed, claiming 'it's faster without it.' What is the correct response as a fellow worker?",
        options: [
          "Continue working and let the supervisor address it if they notice",
          "Speak up immediately—tell the coworker that saw guards are required by OSHA 1926.304 and exist to prevent blade contact injuries; if the coworker refuses, notify the supervisor; safety is a team responsibility and speaking up is not 'ratting out' a coworker—it may prevent a life-altering injury",
          "Remove your own saw guard to maintain equal productivity with the coworker",
          "Only intervene if the coworker is working immediately next to you"
        ],
        correctIndex: 1,
        explanation: "Construction site safety is a shared responsibility. OSHA 1926.304 requires circular saw guards. Workers have both the right and the responsibility to stop unsafe acts. A blade contact injury happens in a fraction of a second and can be permanent."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "core-construction-training-certificate:mission:construction-course-4",
    courseSlug: "construction-course-4",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Hand and Power Tools",
    missionName: "Code Architect",
    missionTagline: "Prove you can safely select and use construction tools",
    primaryAxis: "Engineering",
    skillLabels: ["Hand tools", "Power tools", "Tool safety", "Tool maintenance", "Proper technique"],
    scenarioPrompt: "Your foreman assigns you to cut and install door casings for 12 doorways. You need to select the right tools, set up your work area, and ensure each cut is accurate. Describe your tool selection and process.",
    evidenceHint: "Name the specific tools you would use, explain your setup process, describe the cut sequence, and identify the safety checks you would make before and during the work.",
    quizQuestions: [
      {
        text: "A worker is using a hammer drill to anchor bolts into a concrete wall. After the first hole, the bit is extremely hot and smoke is coming from the bit tip. What should the worker do?",
        options: [
          "Continue drilling to complete the job since heat is normal for concrete drilling",
          "Stop immediately—let the bit cool before continuing, use a lower RPM setting, apply steady moderate pressure without forcing, and use water cooling if the drill supports it; overheating damages the bit and can cause bit failure, kickback, or injury",
          "Pour water on the bit immediately while it is still spinning to cool it",
          "Increase drill pressure to get through the concrete faster and reduce overall heat exposure time"
        ],
        correctIndex: 1,
        explanation: "Overheating a drill bit damages the carbide tip and creates kickback risk. Proper concrete drilling uses consistent pressure, correct RPM, and rest intervals. Forcing a hot bit increases injury risk and destroys expensive tooling."
      },
      {
        text: "Before using a power tool on a job site, a worker notices the power cord has a 3-inch section where the insulation is worn away and bare copper is visible. What is the correct action?",
        options: [
          "Wrap the damaged section with electrical tape and proceed with the work",
          "Remove the tool from service immediately, tag it as damaged, and report it to the supervisor for repair or replacement; using a tool with damaged insulation creates an electrocution hazard—electrical tape is not a permanent repair and does not restore the cord to a safe condition",
          "Only use the tool if wearing rubber-soled boots since they provide insulation",
          "Continue using the tool if the damaged section can be held away from the body during operation"
        ],
        correctIndex: 1,
        explanation: "Damaged power cords are a leading cause of electrocution on construction sites. OSHA requires that damaged tools be taken out of service. Electrical tape is a temporary measure that does not meet code and masks the hazard."
      },
      {
        text: "A carpenter needs to make a 45-degree miter cut on a door casing. The miter saw is available, but the blade needs to be adjusted from 0 degrees to 45 degrees. What is the correct setup sequence?",
        options: [
          "Make the angle adjustment while the saw is running to save time",
          "Ensure the saw is unplugged before making any angle adjustments, set and lock the miter at 45 degrees, confirm the lock is secure, make a test cut on scrap material to verify the angle, then plug in and cut the workpiece—never adjust blade angle or guards on a running saw",
          "Ask a coworker to hold the angle adjustment while you make the cut",
          "Estimate the 45-degree angle by eye since miter saws are close enough without exact adjustment"
        ],
        correctIndex: 1,
        explanation: "Lockout/tagout principles apply to all power tool adjustments. Making angle adjustments on a powered saw is one of the leading causes of hand and finger injuries. Scrap test cuts verify accuracy before committing to finish material."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "core-construction-training-certificate:mission:construction-course-5",
    courseSlug: "construction-course-5",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Concrete and Masonry Fundamentals",
    missionName: "Tech Builder",
    missionTagline: "Prove you can work with concrete and masonry on a construction site",
    primaryAxis: "Engineering",
    skillLabels: ["Concrete mixing", "Masonry techniques", "Curing process", "Load bearing", "Material properties"],
    scenarioPrompt: "You are part of a crew pouring a concrete slab for a garage floor. During the pour, the concrete arrives noticeably thicker (stiffer) than the mix design spec. The truck driver offers to add water to loosen it. Describe what you do and why.",
    evidenceHint: "Explain why adding water is problematic, what the correct resolution is, and who has authority to approve a mix change on site.",
    quizQuestions: [
      {
        text: "Concrete is delivered to a job site and appears too stiff to work easily. The truck driver offers to add 20 gallons of water to the drum to improve workability. Why is this problematic?",
        options: [
          "Adding water to the drum is acceptable as long as it happens before the concrete is placed",
          "Adding water increases the water-to-cement ratio, which directly reduces compressive strength—concrete mixed to specification achieves a designed PSI; adding water can weaken the final product below the structural requirement, creating a liability and safety issue; only the project engineer can authorize a mix change",
          "Water addition is only problematic if the concrete has already been placed in the forms",
          "The issue is solely a cost concern since excess water requires more finishing time"
        ],
        correctIndex: 1,
        explanation: "Water-to-cement ratio is the primary determinant of concrete strength. Unauthorized water addition is one of the most common causes of concrete failures. Only a project engineer with authority over the mix design can approve modifications."
      },
      {
        text: "A newly poured concrete slab is covered with plastic sheeting immediately after finishing on a hot, windy day. Why?",
        options: [
          "To protect the surface from rain, which would damage the smooth finish",
          "To retain moisture for proper curing—concrete gains strength through a chemical hydration process that requires water; hot and windy conditions cause rapid evaporation that stops hydration prematurely, resulting in a weaker, cracked surface; curing methods retain moisture for the required cure period",
          "To prevent workers from walking on the surface before it hardens",
          "To protect the concrete from temperature changes that would cause it to expand"
        ],
        correctIndex: 1,
        explanation: "Curing is not drying—it is a chemical process that requires moisture. Premature drying causes surface cracking and reduces strength. Curing compounds, wet burlap, or plastic sheeting maintain moisture during the critical early strength gain period."
      },
      {
        text: "A masonry worker is laying concrete blocks for a foundation wall and notices that every third course has blocks that are slightly out of plumb by about 1/4 inch. After 10 courses, how significant is this error?",
        options: [
          "A 1/4 inch error per third course is within acceptable tolerance and requires no correction",
          "After 10 courses with this pattern, the wall is approximately 3/4 inch out of plumb—small consistent errors compound significantly over height; the correct approach is to check plumb every 2-3 courses and make small corrections early before the error becomes structurally significant or requires costly rework",
          "The error will self-correct as mortar cures and the weight of the blocks settles the wall",
          "Only the top course matters for plumb since the foundation is in the ground"
        ],
        correctIndex: 1,
        explanation: "Compounding errors are a key masonry concept. A small plumb error that is not corrected early becomes a large structural deviation over height. Frequent checking and small early corrections prevent expensive teardown and rebuild."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "core-construction-training-certificate:mission:construction-course-6",
    courseSlug: "construction-course-6",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Carpentry and Framing Basics",
    missionName: "Systems Pro",
    missionTagline: "Prove you can frame walls and structures to spec",
    primaryAxis: "Engineering",
    skillLabels: ["Wall framing", "Floor systems", "Roof framing basics", "Structural layout", "Fastening methods"],
    scenarioPrompt: "You are framing an exterior wall for a new residential addition. The wall is 20 feet long and the plans show standard 16-inch on-center stud spacing. Walk through your layout process from plate to finished frame.",
    evidenceHint: "Explain how you lay out the plates, mark stud locations, account for openings, and verify the wall is square before fastening.",
    quizQuestions: [
      {
        text: "A carpenter is laying out stud spacing on a wall plate. The standard is 16 inches on center (OC). Starting from the end of the plate, where is the center of the first stud?",
        options: [
          "16 inches from the end of the plate",
          "The first stud is typically at the end (corner), and the first field stud center mark is at 15.25 inches—this accounts for the 3/4-inch offset so that 4x8 sheathing sheets break on stud centers; subsequent marks are at 16-inch intervals from there",
          "8 inches from the end to center the spacing for the wall",
          "24 inches from the end since the first stud must leave room for insulation"
        ],
        correctIndex: 1,
        explanation: "The 15.25-inch first-mark rule is one of the most fundamental framing layout details. It ensures sheathing sheet edges land on stud centers, which is critical for structural integrity and reduces waste from unnecessary blocking."
      },
      {
        text: "After framing a wall and standing it up, a carpenter checks for square using the 3-4-5 method. Starting from one corner, they measure 3 feet along the bottom plate and 4 feet up the king stud. The diagonal should measure 5 feet if the corner is square. The actual measurement is 5 feet 1.5 inches. What does this mean?",
        options: [
          "The wall is square—small variations are expected in wood framing",
          "The corner is out of square by a meaningful amount; the wall needs to be racked (pushed laterally at the top) until the diagonal measures exactly 5 feet before it is braced and fastened; an out-of-square wall affects every subsequent finish trade",
          "The measurement error is in the tape—measure again from the opposite corner",
          "A 3-4-5 measurement is only accurate for walls under 10 feet; longer walls require different methods"
        ],
        correctIndex: 1,
        explanation: "The 3-4-5 method is a direct application of the Pythagorean theorem to verify square. Any deviation means the corner is not 90 degrees. Out-of-square framing cascades into difficult drywall, window, and door installation problems."
      },
      {
        text: "A framing crew is building a load-bearing wall and needs to create an opening for a door. The crew lead says a header is required above the opening. A new worker asks why. What is the correct explanation?",
        options: [
          "Headers are required by code for aesthetic reasons and do not serve a structural function",
          "Removing studs for a door opening interrupts the load path from the floor above—a header (sized beam) transfers the load around the opening to the jack studs and king studs on each side, which carry the load down to the foundation; header size depends on the span and load it must carry",
          "Headers are only required in commercial construction, not residential",
          "The header is required to provide a nailing surface for the door frame trim"
        ],
        correctIndex: 1,
        explanation: "Understanding load paths is a fundamental competency in framing. Headers are structural elements, not just blocking. The correct header size ensures the opening does not allow deflection or failure of the floor or roof structure above."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "core-construction-training-certificate:mission:construction-course-7",
    courseSlug: "construction-course-7",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Electrical and Plumbing Basics",
    missionName: "Code Architect",
    missionTagline: "Prove you understand rough-in trades and can assist safely",
    primaryAxis: "Engineering",
    skillLabels: ["Electrical basics", "Plumbing rough-in", "Code awareness", "Trade coordination", "Safety protocols"],
    scenarioPrompt: "You are assisting the electrical subcontractor rough-in a new home. The electrician asks you to help pull wire through wall cavities. Before you start, what do you need to know and check to work safely and correctly?",
    evidenceHint: "Describe the safety checks, the tools you need, the wire routing rules you must follow, and how you would coordinate with the framing inspection status.",
    quizQuestions: [
      {
        text: "An electrician asks a helper to drill holes through studs to run wire in a new construction wall. What size hole should be drilled and where should it be located relative to the stud face?",
        options: [
          "Any size hole in any location is acceptable since the wire is flexible",
          "Holes should be sized to the wire diameter (typically 7/8 inch for 12/2 cable) and centered in the stud so they are at least 1.25 inches from the stud face—if holes are closer than 1.25 inches, nail plates must be installed to protect the wire from drywall screws and nails",
          "Holes must be drilled as close to the bottom of the stud as possible to keep wire away from outlets",
          "Holes larger than 1 inch are not permitted in load-bearing studs under any circumstances"
        ],
        correctIndex: 1,
        explanation: "Hole sizing and placement rules exist to prevent accidental wire damage from future fasteners. The 1.25-inch rule is an NEC requirement. Nail plates are the required solution when clearance cannot be maintained."
      },
      {
        text: "A plumber is roughing in a drain line and needs to pass through a load-bearing stud. The required hole is 3 inches in diameter. What must happen before cutting?",
        options: [
          "The plumber can cut any size hole in any stud as long as the pipe fits",
          "Holes larger than 40% of the stud width (a 2x4 stud is 3.5 inches wide—40% = 1.4 inches) require engineering approval or structural reinforcement; the plumber should notify the GC and structural engineer before cutting since oversized holes compromise load-bearing capacity",
          "Load-bearing studs cannot be notched or drilled under any circumstances",
          "The hole is acceptable as long as the stud is doubled on each side of the opening"
        ],
        correctIndex: 1,
        explanation: "Structural stud integrity is critical to the building's load path. Oversized holes weaken studs beyond acceptable limits. This is a coordination point between the plumbing sub and the structural engineer—not a unilateral decision."
      },
      {
        text: "After rough-in electrical and plumbing work is complete, a new worker asks why the walls cannot be closed with drywall immediately. What is the correct answer?",
        options: [
          "Walls must stay open for 30 days to allow pipe sealants and caulking to fully cure",
          "Rough-in inspections are required—a building inspector must verify that electrical wiring, plumbing rough-in, and mechanical systems comply with code before walls are closed; closing walls before inspection requires opening them again at significant cost if violations are found",
          "Insulation must be installed before drywall regardless of inspection requirements",
          "The general contractor must photograph every wall cavity for their project records before closure"
        ],
        correctIndex: 1,
        explanation: "Inspection sequencing is a critical construction process concept. Rough-in inspections happen before wall close. Closing walls before inspection is one of the most expensive mistakes in construction—discovery of a code violation requires opening and repairing the wall."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "core-construction-training-certificate:mission:construction-course-8",
    courseSlug: "construction-course-8",
    programSlug: "core-construction-training-certificate",
    programTitle: "Core Construction Training Certificate",
    courseTitle: "Construction Readiness Capstone",
    missionName: "Help Desk Pro",
    missionTagline: "Prove you are construction-ready with integrated skills",
    primaryAxis: "Service",
    skillLabels: ["Construction readiness", "Trade coordination", "Safety integration", "Professional readiness", "Career preparation"],
    scenarioPrompt: "You are interviewing for your first construction job as a laborer with potential for advancement. The interviewer asks: 'What makes you ready to work on a construction site, and what do you bring to the crew?' Give a strong, specific answer.",
    evidenceHint: "Reference specific skills from the program, demonstrate safety awareness, and show you understand what a crew expects from a new team member.",
    quizQuestions: [
      {
        text: "On your first week on a construction site, a senior carpenter asks you to do a task you have never done before and says 'figure it out.' What is the best response for a new construction worker?",
        options: [
          "Attempt the task independently and only ask for help if something goes wrong",
          "Tell the carpenter that you are new to this specific task, ask for a quick demonstration or clear instructions, confirm you understand the expected outcome and safety requirements, then complete the task—asking for guidance on unfamiliar tasks is professional behavior, not weakness, and prevents costly mistakes",
          "Decline the task since you were not specifically trained in it during the program",
          "Ask a different coworker to do it since the carpenter did not explain it properly"
        ],
        correctIndex: 1,
        explanation: "Construction errors are expensive and sometimes dangerous. Experienced tradespeople respect new workers who ask the right questions and confirm understanding before acting. Attempting unfamiliar tasks without guidance creates safety risks and wasted materials."
      },
      {
        text: "At the end of a shift, a new construction worker notices that the crew has left tools scattered around the work area, scrap material blocking walkways, and a circular saw on the ground with the cord across a traffic path. What should the worker do?",
        options: [
          "Leave the site as found since cleanup is the responsibility of the site supervisor",
          "Take initiative to store tools in designated locations, stack and remove scrap from walkways, and coil and properly store the cord and saw—site cleanup is every crew member's responsibility; a safe, organized site prevents injuries, reduces tool loss, and demonstrates the professionalism that leads to advancement",
          "Only clean up the items in your immediate work area",
          "Photograph the hazards and submit a safety report but leave cleanup for morning"
        ],
        correctIndex: 1,
        explanation: "Site housekeeping is a professional standard and an OSHA requirement. Workers who take initiative on cleanup without being asked demonstrate the work ethic and situational awareness that foremen notice when choosing who to advance."
      },
      {
        text: "A construction worker with the Core Construction certificate is applying for jobs. An employer asks: 'You have a certificate but no field experience. Why should I hire you over someone who has worked construction before?' What is the strongest response?",
        options: [
          "The certificate guarantees I will perform better than uncertified workers with experience",
          "I bring a verified foundation: OSHA-10 safety training, blueprint reading, tool competency, and understanding of how trades coordinate—I know how to work safely on day one, I will not be a liability, and I am ready to learn from experienced crew members rather than starting from scratch on basics; I am asking for a chance to earn my way, not to skip the learning process",
          "My certificate proves I know more than workers who only learned on the job",
          "I am willing to work for a lower wage than experienced workers to compensate for the experience gap"
        ],
        correctIndex: 1,
        explanation: "The strongest job interview response combines honest acknowledgment of the experience gap with a clear articulation of the value the candidate brings. Employers of entry-level workers primarily need people who are safe, coachable, and ready to work—the certificate demonstrates all three."
      }
    ],
    estimatedMinutes: 15,
  },

  // ─── AI Practitioner Professional Certificate (AWS) ─────────────────────
  // One mission per course in shared/programSyllabi.ts for
  // ai-practitioner-professional-certificate-aws. Titles must match the
  // syllabus so curriculum resolution can attach them. The eight IBM
  // developer missions under ai-professional-developer-certificate-ibm stay
  // on that legacy key; do not retarget them here.

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-1",
    courseSlug: "ai-practitioner-course-1",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Introduction to Artificial Intelligence (AI)",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can explain AI fundamentals in plain language",
    primaryAxis: "Analytics",
    skillLabels: ["AI fundamentals", "Prompt engineering", "Automation", "Machine learning vs deep learning", "AI roles"],
    scenarioPrompt: "A nonprofit operations lead asks you to explain, without jargon, what artificial intelligence is and whether their team needs a prompt-writing practitioner or a model builder. Using Introduction to Artificial Intelligence (AI), cover prompt engineering, automation, the difference between machine learning and deep learning, and which AI role fits this team.",
    evidenceHint: "A strong response defines AI in everyday language, separates a rules-based automation from machine learning and deep learning, gives one prompt-engineering example, and names the role this non-technical team actually needs.",
    quizQuestions: [
      {
        text: "A clinic wants software that always routes appointment emails containing the word 'cancel' to the front desk. No examples are used to train it. Which description fits?",
        options: [
          "Deep learning, because email text is unstructured",
          "Rules-based automation: a fixed instruction handles a known case, and the system is not learning from examples",
          "Machine learning, because the word 'cancel' is data",
          "Prompt engineering, because someone wrote the routing rule in a sentence"
        ],
        correctIndex: 1,
        explanation: "A fixed rule that never learns from examples is automation. Machine learning and deep learning depend on learning from examples; prompt engineering is how a person instructs a generative model, not how this router works."
      },
      {
        text: "Which contrast matches the course distinction between machine learning and deep learning?",
        options: [
          "Machine learning learns patterns from examples; deep learning is a machine-learning approach that uses neural networks with many layers",
          "Machine learning only classifies images, and deep learning only writes text",
          "Deep learning is any software that follows a written rule, and machine learning is the same thing with a new name",
          "Machine learning requires a generative chatbot, and deep learning does not"
        ],
        correctIndex: 0,
        explanation: "Deep learning is a form of machine learning built on multi-layer neural networks. Both learn from examples. A written rule with no learning is automation, not either of these."
      },
      {
        text: "A team of career counselors wants help drafting outreach emails. They will review every draft before it is sent. Which AI role fits them best right now?",
        options: [
          "A research scientist who publishes new model architectures",
          "A data-center engineer who trains foundation models from scratch",
          "An AI practitioner who writes prompts, checks outputs, and applies the tool to the counselors' real work",
          "A hardware specialist who selects graphics processors for training"
        ],
        correctIndex: 2,
        explanation: "The course separates AI roles. This team is applying an existing tool to knowledge work and staying accountable for the message, which is practitioner work rather than model-building or infrastructure work."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-2",
    courseSlug: "ai-practitioner-course-2",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Artificial Intelligence: An Overview",
    missionName: "Research Analyst",
    missionTagline: "Prove you can describe how an AI system is designed and checked",
    primaryAxis: "Research",
    skillLabels: ["AI history", "Core AI techniques", "Neural networks", "System design", "Evaluation and deployment"],
    scenarioPrompt: "A city department director wants a short briefing on artificial intelligence before a vendor meeting. Using Artificial Intelligence: An Overview, explain the historical context in a sentence or two, name a core technique such as neural networks, and walk through how an AI system is designed, evaluated, and deployed.",
    evidenceHint: "A strong response places today's tools in a short historical context, names neural networks as a core technique, and separates design, evaluation, and deployment instead of treating purchase as the whole process.",
    quizQuestions: [
      {
        text: "A director says, 'AI started with ChatGPT, so history does not matter.' What does this overview course expect you to correct?",
        options: [
          "Today's generative tools sit on decades of work in core techniques, including neural networks; the history explains what the tools can and cannot do",
          "History only matters for academic researchers, not for people who buy tools",
          "Neural networks were invented after chatbots and replaced every earlier technique",
          "An overview course skips history and starts at deployment"
        ],
        correctIndex: 0,
        explanation: "The course covers historical context and core techniques, including neural networks. Treating a recent chatbot as the start of AI hides why evaluation and deployment still matter."
      },
      {
        text: "A vendor demo looks impressive. Where does evaluation sit in the lifecycle this course describes?",
        options: [
          "After deployment only, once staff have complained",
          "Instead of design, because a demo replaces a written goal",
          "Between design and deployment: the team checks whether the system meets the goal before it is put into daily use",
          "Only in the historical section, as a technique from early AI research"
        ],
        correctIndex: 2,
        explanation: "The course treats design, evaluation, and deployment as distinct. A demo is not an evaluation against the department's actual goal."
      },
      {
        text: "Which statement about neural networks matches an overview, not a builder's lab?",
        options: [
          "A neural network is a core AI technique that learns patterns; a practitioner needs to know what it is for, not how to derive its math",
          "A neural network is a filing cabinet for paper records",
          "Neural networks only run after a system is deployed and cannot be part of design",
          "Every AI system must be a neural network or it is not AI"
        ],
        correctIndex: 0,
        explanation: "Neural networks are one core technique in the overview. The course is about recognizing how they fit design, evaluation, and deployment, not about implementing the math."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-3",
    courseSlug: "ai-practitioner-course-3",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Introduction to Digital Transformation Part 1",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can name what an organization needs before an AI change",
    primaryAxis: "Strategy",
    skillLabels: ["Digital transformation strategy", "Customer experience", "Data readiness", "Organizational capabilities"],
    scenarioPrompt: "A workforce-center director wants to 'add AI' to intake next quarter. Using Introduction to Digital Transformation Part 1, brief them on the strategy, the customer experience, the data they would rely on, and the organizational capabilities required to lead the change.",
    evidenceHint: "A strong response treats AI as a change in strategy and customer experience, names the data the new experience depends on, and lists organizational capabilities such as staff skills and decision rights rather than a tool purchase alone.",
    quizQuestions: [
      {
        text: "A director's plan is a single sentence: 'Buy an AI chatbot for the website.' What is missing from a digital-transformation framing?",
        options: [
          "The brand of chatbot",
          "Strategy, the customer experience the chatbot would change, the data behind the answers, and whether the organization can lead the change",
          "A longer contract with the vendor",
          "A requirement that every staff member become a software engineer"
        ],
        correctIndex: 1,
        explanation: "The course frames transformation through strategy, customer experience, data, and organizational capabilities. A purchase order is not that plan."
      },
      {
        text: "Which organizational capability matters before an AI intake assistant goes live?",
        options: [
          "Staff who know who owns a wrong answer, how to correct it, and when a person must take over",
          "A rule that the vendor, not the center, owns every member outcome",
          "Replacing the intake team so no one has to learn the new workflow",
          "Waiting until customer experience is irrelevant because the tool is automated"
        ],
        correctIndex: 0,
        explanation: "Leading AI-driven change requires organizational capabilities: ownership, correction, and a human handoff. The course treats those as part of the transformation, not as leftovers."
      },
      {
        text: "Why does this course put data next to customer experience?",
        options: [
          "Data is only a technical topic and should stay out of the strategy conversation",
          "Customer experience can be redesigned without knowing what information the organization actually has",
          "An AI change to the member experience is only as sound as the data the experience relies on",
          "Data strategy replaces the need to talk to members"
        ],
        correctIndex: 2,
        explanation: "The Darden framing in this course ties strategy, customer experience, data, and organizational capability together. An experience promise that the data cannot support will fail in use."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-4",
    courseSlug: "ai-practitioner-course-4",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "AI For All",
    missionName: "Discovery Expert",
    missionTagline: "Prove you can tell a high-value AI use from a poor one",
    primaryAxis: "Strategy",
    skillLabels: ["Non-technical AI literacy", "AI limits", "Opportunity identification"],
    scenarioPrompt: "You support a non-technical office. A supervisor asks which everyday task is a high-value AI opportunity and which task AI should not own. Using AI For All, explain what AI can and cannot do in this office and name one opportunity worth a pilot.",
    evidenceHint: "A strong response is understandable to a non-technical colleague, states a concrete limit, and picks a high-value opportunity with a reason rather than a blanket 'use AI everywhere.'",
    quizQuestions: [
      {
        text: "Which task is the strongest high-value AI opportunity for a non-technical office team?",
        options: [
          "First drafts of routine internal summaries that a person still reviews",
          "Final decisions about who is hired, with no human review",
          "Inventing facts for a grant report when the source documents are missing",
          "Replacing the supervisor's judgment about a personnel complaint"
        ],
        correctIndex: 0,
        explanation: "AI For All asks non-technical staff to find high-value work AI can assist. Drafting for human review fits. Final employment decisions, invented facts, and unsupervised personnel judgment do not."
      },
      {
        text: "A coworker says, 'If AI wrote it, it must be true.' What limit should you name?",
        options: [
          "AI output can be fluent and still wrong; a person has to check it against a source",
          "AI is only wrong when the prompt is longer than one sentence",
          "AI cannot help with writing at all, so the course bans drafts",
          "The limit only applies to engineers, not to office staff"
        ],
        correctIndex: 0,
        explanation: "The course is for non-technical audiences and includes what AI cannot do. Fluency is not accuracy, so a person still checks the work."
      },
      {
        text: "Why does this course start from 'what AI is' before tool shopping?",
        options: [
          "So the team can reject every tool without looking at the work",
          "So people who will not train models can still recognize a useful opportunity and a poor one",
          "Because non-technical staff are not allowed to use AI at work",
          "Because opportunity identification is only a software-engineering skill"
        ],
        correctIndex: 1,
        explanation: "AI For All is an introduction for non-technical audiences: what AI is, what it can and cannot do, and how to spot high-value opportunities."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-5",
    courseSlug: "ai-practitioner-course-5",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "AI Concepts and Strategy",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can frame a build-or-buy AI decision",
    primaryAxis: "Strategy",
    skillLabels: ["AI strategy", "Build vs buy", "ROI framing", "AI initiative management"],
    scenarioPrompt: "Leadership asks whether the organization should build its own assistant for routine customer emails or buy one. Using AI Concepts and Strategy, frame the build-versus-buy choice, the return you would look for, and how you would manage the initiative after the decision.",
    evidenceHint: "A strong response compares build and buy against the team's skills and timeline, names a return that is more than 'it sounds modern,' and includes how the initiative will be managed after launch.",
    quizQuestions: [
      {
        text: "A five-person nonprofit has no engineers and needs email drafts next month. Which build-versus-buy framing fits?",
        options: [
          "Build a custom model, because owning the technology is always the higher return",
          "Buy or subscribe to an existing tool, because building would spend time and skills the team does not have for a routine drafting need",
          "Do neither until a research lab donates a new model",
          "Build and buy the same system at the same time so strategy is unnecessary"
        ],
        correctIndex: 1,
        explanation: "Build versus buy depends on capability, time, and the job to be done. A small team with a routine drafting need and no engineering bench is a buy case, not a custom-model case."
      },
      {
        text: "Which return is a usable ROI frame for an AI initiative?",
        options: [
          "Hours saved on a named weekly task, checked after launch against the cost of the tool and the staff time to run it",
          "The number of times the word 'AI' appears in the strategic plan",
          "A promise that the tool will eliminate the need to manage the work",
          "The vendor's slogan, copied into the budget as the return"
        ],
        correctIndex: 0,
        explanation: "The course treats ROI as a business frame: value against cost. A measurable time saving compared with the cost to run the tool is a frame; a slogan is not."
      },
      {
        text: "The purchase is approved. What does managing the initiative still require?",
        options: [
          "Nothing; a signed contract means the strategy work is finished",
          "An owner, a review point, and a way to stop or change the tool if the return does not show up",
          "A rule that no one may look at the outputs",
          "Replacing the business goal with the vendor's feature list"
        ],
        correctIndex: 1,
        explanation: "Managing an AI initiative continues after the build-or-buy decision. Someone owns the outcome and checks whether the framed return is real."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-6",
    courseSlug: "ai-practitioner-course-6",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "AI for Professional Communication",
    missionName: "Client Champion",
    missionTagline: "Prove you can use AI and still own the message",
    primaryAxis: "Service",
    skillLabels: ["Professional writing", "Presentations", "Meeting support", "Stakeholder communication"],
    scenarioPrompt: "You must update a partner on a delayed training cohort. Using AI for Professional Communication, describe how you would use an AI tool to help with the written update, a short slide, and the meeting agenda, while you remain responsible for what the partner hears.",
    evidenceHint: "A strong response uses AI for a draft, a slide outline, or a meeting agenda, and keeps a human review so the stakeholder message is accurate, toned for the partner, and owned by the sender.",
    quizQuestions: [
      {
        text: "An AI draft of a delay notice blames the partner for the slip. The facts say your team missed a handoff. What should you do?",
        options: [
          "Send the draft because the tool wrote it in a professional tone",
          "Rewrite the facts, keep a respectful tone, and send only the version you can stand behind",
          "Ask the tool to make the tone warmer and send it without reading",
          "Skip the partner update because AI drafts are never usable"
        ],
        correctIndex: 1,
        explanation: "The course is about using AI to improve communication, not about letting the tool own the facts. Stakeholder communication still requires a person to correct the record."
      },
      {
        text: "Where can an AI tool help a meeting without taking it over?",
        options: [
          "A proposed agenda and a list of decisions to confirm, which you edit before the meeting",
          "Deciding the partner's position for them",
          "Replacing the meeting with an unread generated transcript",
          "Inventing attendance so the notes look complete"
        ],
        correctIndex: 0,
        explanation: "Meeting support is in scope: agendas and decision lists are drafts. The meeting itself, and the partner's position, stay with the people in the room."
      },
      {
        text: "You used AI to outline three slides for a stakeholder review. What makes the presentation professionally yours?",
        options: [
          "Leaving the outline's placeholder numbers in the deck",
          "Adding decorative images the tool suggested, even when they contradict the update",
          "Checking every claim against your notes and saying only what you can explain if asked",
          "Putting the tool's name on the title slide as the author"
        ],
        correctIndex: 2,
        explanation: "AI can help shape a presentation. The presenter still has to verify the claims and be able to discuss them with the stakeholder."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-7",
    courseSlug: "ai-practitioner-course-7",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Understand and Apply Artificial Intelligence Fundamentals",
    missionName: "Analytics Pro",
    missionTagline: "Prove you can choose how a model should learn and be checked",
    primaryAxis: "Analytics",
    skillLabels: ["Supervised learning", "Unsupervised learning", "Model evaluation", "Deployment considerations"],
    scenarioPrompt: "A manager has two piles of data: past applications labeled 'funded' or 'not funded,' and a pile of unlabeled comments from orientation. Using Understand and Apply Artificial Intelligence Fundamentals, say which pile fits supervised learning, which fits unsupervised learning, how you would evaluate a model before anyone relies on it, and one deployment concern.",
    evidenceHint: "A strong response assigns labeled outcomes to supervised learning and unlabeled comments to unsupervised learning, names an evaluation check before deployment, and names a practical deployment concern such as who acts on a wrong prediction.",
    quizQuestions: [
      {
        text: "Which dataset is the supervised-learning case?",
        options: [
          "Past applications already labeled funded or not funded, where the model learns to predict that label",
          "A folder of comments with no categories, where the goal is to discover groupings",
          "A blank spreadsheet with only column headers",
          "A policy PDF that no one has turned into examples"
        ],
        correctIndex: 0,
        explanation: "Supervised learning uses examples with known outcomes. Unsupervised learning looks for structure when those outcome labels are absent."
      },
      {
        text: "The unlabeled orientation comments have no correct category yet. What approach fits?",
        options: [
          "Supervised learning, after you invent labels and pretend they were in the original data",
          "Unsupervised learning, to group similar comments so a person can name the themes",
          "Deployment first, then decide whether labels mattered",
          "Skipping evaluation because there is nothing to predict"
        ],
        correctIndex: 1,
        explanation: "Without outcome labels, unsupervised learning can surface groups. A person still has to interpret the groups; the course does not treat clustering as a finished decision."
      },
      {
        text: "A model looks promising in a test. What deployment consideration still belongs in the plan?",
        options: [
          "Who reviews a wrong or contested result before it changes a person's outcome",
          "Turning evaluation off so the launch date stays firm",
          "Assuming test performance is permanent and needs no watch after launch",
          "Hiding the fact that a model is involved"
        ],
        correctIndex: 0,
        explanation: "The course includes practical deployment considerations along with model evaluation. A test result does not remove the need for a human path when the output affects a person."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-8",
    courseSlug: "ai-practitioner-course-8",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "AI for Business: Generation & Prediction",
    missionName: "Insight Analyst",
    missionTagline: "Prove you can tell generation apart from prediction",
    primaryAxis: "Analytics",
    skillLabels: ["Generative AI", "Predictive AI", "Business workflows", "Text image and code generation", "Forecasts and classification"],
    scenarioPrompt: "A small employer wants two things from AI: a forecast of which job applicants are likely to finish training, and a first draft of the offer email. Using AI for Business: Generation & Prediction, assign each request to generation or prediction and say how it would sit in the workflow.",
    evidenceHint: "A strong response marks the completion forecast as prediction (a classification) and the offer email as generation (text), and says where a person still approves the output in the workflow.",
    quizQuestions: [
      {
        text: "Which request is prediction, not generation?",
        options: [
          "Estimate which enrolled members are likely to miss the next milestone",
          "Draft a welcome text message",
          "Produce a simple icon for a flyer",
          "Suggest starter code for a spreadsheet formula"
        ],
        correctIndex: 0,
        explanation: "Prediction covers forecasts and classifications. Drafting text, images, or code is generation. The course treats them as the two foundational capabilities."
      },
      {
        text: "A manager asks the generative tool to 'decide who graduates.' What should you correct?",
        options: [
          "Nothing; generation and prediction are the same capability",
          "A draft is not a classification. Predicting an outcome is a different capability and still needs a defined label, an evaluation, and a person accountable for the decision",
          "Generation cannot draft text, so the tool should be used only for icons",
          "Prediction is only for images"
        ],
        correctIndex: 1,
        explanation: "Generation produces content such as text, images, or code. Prediction classifies or forecasts. Using a draft as if it were a graduation decision mixes the two and skips accountability."
      },
      {
        text: "Where should a generated offer email sit in the business workflow?",
        options: [
          "Sent automatically to every applicant the moment the draft appears",
          "As a draft a staff member checks against the real offer terms before anyone receives it",
          "As a replacement for the hiring policy",
          "As the forecast of who will accept the job"
        ],
        correctIndex: 1,
        explanation: "Generation helps the workflow by producing a draft. The business decision and the facts of the offer stay with the person who sends it."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-9",
    courseSlug: "ai-practitioner-course-9",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Artificial Intelligence: Ethics & Societal Challenges",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can name bias, privacy, and accountability in a real decision",
    primaryAxis: "Service",
    skillLabels: ["AI ethics", "Bias and fairness", "Transparency", "Accountability", "Privacy"],
    scenarioPrompt: "An automated screener is denying training seats more often for applicants from one neighborhood, and staff cannot explain why. Using Artificial Intelligence: Ethics & Societal Challenges, walk through bias and fairness, transparency, accountability, and privacy, including the societal impact of leaving the screener in place.",
    evidenceHint: "A strong response names the uneven outcome as a fairness problem, says what transparency would require, names who is accountable, and treats applicant data as a privacy issue rather than only a technical glitch.",
    quizQuestions: [
      {
        text: "Denial rates are much higher for one neighborhood, and no one has checked why. Which ethics issue is this first?",
        options: [
          "A possible bias and fairness failure in an automated decision",
          "Proof that neighborhoods should be removed from every dataset without looking at the outcome",
          "A privacy success, because the reason is hidden",
          "An accountability success, because the model decided alone"
        ],
        correctIndex: 0,
        explanation: "Uneven harmful outcomes are a bias and fairness concern. Hiding the reason is a transparency problem, not a privacy success, and an unowned decision is an accountability gap."
      },
      {
        text: "Staff say, 'The model denied them, so it is not our decision.' What does accountability require?",
        options: [
          "The organization that deploys the screener still owns the outcome and must be able to review it",
          "Accountability transfers to the software as soon as a score appears",
          "Applicants must accept the score because a computer produced it",
          "Transparency means publishing each applicant's private records"
        ],
        correctIndex: 0,
        explanation: "Accountability stays with the people and organization using the system. Transparency does not mean exposing private applicant records; it means being able to explain the decision appropriately."
      },
      {
        text: "Which handling of applicant records matches the privacy concern in this course?",
        options: [
          "Paste full applications into a public chatbot so the team can brainstorm denials",
          "Use the minimum applicant data the decision needs, restrict who can see it, and do not send it to a tool that has no reason to hold it",
          "Post denial reasons on a public webpage with names attached",
          "Keep every field forever because more data is always fairer"
        ],
        correctIndex: 1,
        explanation: "Privacy is one of the course's societal challenges. Automated decisions still require limiting collection, access, and disclosure of personal data."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-10",
    courseSlug: "ai-practitioner-course-10",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "ChatGPT — Foundations",
    missionName: "Tech Builder",
    missionTagline: "Prove you can prompt ChatGPT and respect its limits",
    primaryAxis: "Research",
    skillLabels: ["ChatGPT capabilities", "ChatGPT limitations", "Prompting patterns", "Knowledge work"],
    scenarioPrompt: "A colleague wants ChatGPT to summarize this week's public workshop notes into a staff briefing. They also start to paste a participant's private case notes into the same chat. Using ChatGPT — Foundations, show a prompting pattern for the public summary and explain the capability limit that makes the private paste a mistake.",
    evidenceHint: "A strong response gives a concrete prompt pattern for a briefing (role, source, output shape) and names a limitation: ChatGPT can be wrong, and private case notes do not belong in the chat.",
    quizQuestions: [
      {
        text: "Which prompt pattern best fits a knowledge-work briefing?",
        options: [
          "Role, the source material you are allowed to use, the readers, and the output you want, such as five bullets a supervisor can scan",
          "'Write something professional' with no source and no reader",
          "A request to invent attendance numbers so the briefing looks complete",
          "The full private case file, followed by 'make this public'"
        ],
        correctIndex: 0,
        explanation: "Foundations covers prompting patterns for knowledge work: purpose, source, audience, and shape. A vague prompt or a request to invent facts does not use the tool well."
      },
      {
        text: "ChatGPT states a workshop date that is not in the notes. What limitation does that show?",
        options: [
          "A fluent answer can still be unsupported; you compare it to the notes before the briefing goes out",
          "ChatGPT can only be wrong about images, never about dates",
          "The tool is incapable of summaries, so the date error is expected and can be ignored",
          "Limitations apply only when the prompt is a single word"
        ],
        correctIndex: 0,
        explanation: "Capabilities and limitations are both in this course. Summaries are a real use, and unsupported details are a reason to check the output against the source."
      },
      {
        text: "Why should private participant case notes stay out of the chat?",
        options: [
          "Because ChatGPT cannot read text",
          "Because a public workshop summary does not require them, and pasting private case information into the tool exposes data the briefing does not need",
          "Because prompting patterns forbid naming the audience",
          "Because the tool only works on spreadsheets"
        ],
        correctIndex: 1,
        explanation: "Practical use across knowledge work includes knowing the limit: do not feed private case data to the tool for a task that should use the public notes."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-11",
    courseSlug: "ai-practitioner-course-11",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "ChatGPT for Beginners: Using AI for Market Research",
    missionName: "Research Analyst",
    missionTagline: "Prove you can turn ChatGPT research into a checked deliverable",
    primaryAxis: "Research",
    skillLabels: ["Market research questions", "Competitive intelligence", "Market analysis deliverables"],
    scenarioPrompt: "A local employer asks for a one-page look at two competitors before a hiring push. Using ChatGPT for Beginners: Using AI for Market Research, describe the research questions you would give ChatGPT, how you would synthesize competitive intelligence, and what you would verify before the page counts as a deliverable.",
    evidenceHint: "A strong response writes specific research questions, separates ChatGPT's synthesis from sources you checked, and names the deliverable (a one-page analysis) rather than an unsourced chat transcript.",
    quizQuestions: [
      {
        text: "Which research question is specific enough for this guided project?",
        options: [
          "What are the two competitors' stated entry-level roles, locations, and training requirements, and where is each claim from?",
          "Tell me everything about the industry",
          "Who will win the market next year, as a fact",
          "Write a slogan we can print without checking"
        ],
        correctIndex: 0,
        explanation: "The project is about designing research questions that can become competitive intelligence. A scoped question with a source need is usable; an unbounded or unsourced request is not."
      },
      {
        text: "ChatGPT blends the two competitors into one paragraph. What is the right next step before you deliver it?",
        options: [
          "Split the claims back apart and check each one against a source you can name",
          "Ship the blend, because synthesis means the reader should not see the difference",
          "Add adjectives until the page sounds decisive",
          "Delete the research questions so the page is shorter"
        ],
        correctIndex: 0,
        explanation: "Synthesizing competitive intelligence still has to keep the competitors distinct and tied to sources. The course deliverable is a market analysis, not an unchecked blend."
      },
      {
        text: "What counts as the market-analysis deliverable in this project?",
        options: [
          "The raw chat, including your retries",
          "A short analysis a manager can read, with the questions you asked and the claims you verified",
          "A promise that the model performed primary interviews",
          "A ranking of competitors by how often the model mentioned them"
        ],
        correctIndex: 1,
        explanation: "The course outcome is a market-analysis deliverable: research questions, synthesized intelligence, and work a person can stand behind."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-12",
    courseSlug: "ai-practitioner-course-12",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "AI Fundamentals with Claude",
    missionName: "Research Analyst",
    missionTagline: "Prove you can brief Claude on a long source and hold the line",
    primaryAxis: "Research",
    skillLabels: ["Claude prompting", "Long context", "Constitutional AI principles"],
    scenarioPrompt: "Staff keep asking the same questions about a long program handbook. Using AI Fundamentals with Claude, describe how you would prompt Claude, how you would use the long context instead of pasting a fragment, and how constitutional AI principles change what you will accept as an answer.",
    evidenceHint: "A strong response gives a prompt that points Claude at the handbook, explains why the long context matters, and says you will reject an answer that is helpful-sounding but conflicts with the handbook or with a clear principle such as not inventing policy.",
    quizQuestions: [
      {
        text: "The handbook is long. Why does this course treat long context as a skill?",
        options: [
          "So Claude can work from the handbook you provide instead of from a short excerpt that drops the rule staff are asking about",
          "So you can skip reading the handbook yourself",
          "Because a longer prompt is always more accurate, even with no source",
          "Because constitutional AI means the model already stores your private handbook"
        ],
        correctIndex: 0,
        explanation: "Long context is how you keep the relevant source in the conversation. It does not replace reading, and it does not mean the model already holds your private handbook."
      },
      {
        text: "Claude gives a confident answer that contradicts the handbook section you supplied. What should you do?",
        options: [
          "Prefer the confident answer, because confidence is a constitutional principle",
          "Keep the handbook's rule, tighten the prompt to quote that section, and do not pass on the contradiction",
          "Delete the handbook so the contradiction disappears",
          "Ask Claude to invent a new policy that splits the difference"
        ],
        correctIndex: 1,
        explanation: "Prompt engineering includes constraining the model to the source. A contradiction of the supplied handbook is a failed answer, not a new policy."
      },
      {
        text: "Which use of constitutional AI principles fits this course?",
        options: [
          "Treat them as a written bound on behavior, such as being helpful without inventing rules or ignoring the source you gave",
          "Treat them as permission to hide the handbook from staff",
          "Treat them as a requirement to agree with every user request, including requests to fabricate policy",
          "Treat them as a way to skip prompt writing"
        ],
        correctIndex: 0,
        explanation: "The course names constitutional AI principles alongside prompting and long context. The practical bound is that a helpful answer still has to respect the source and not invent policy."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-13",
    courseSlug: "ai-practitioner-course-13",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Sales with AI",
    missionName: "Analytics Pro",
    missionTagline: "Prove you can place AI on a sales pipeline",
    primaryAxis: "Analytics",
    skillLabels: ["Lead scoring", "Call analysis", "Sales forecasting", "Pipeline management"],
    scenarioPrompt: "A placement team's sales-style pipeline of employer partners is messy: some leads are cold, call notes are uneven, and the quarterly forecast is a guess. Using Sales with AI, explain how lead scoring, call analysis, forecasting, and pipeline management could help, and what a person still owns.",
    evidenceHint: "A strong response assigns each of the four course uses to a pipeline problem and keeps a human owner for the relationship and for any forecast that will be reported as a number.",
    quizQuestions: [
      {
        text: "Dozens of employer leads sit untouched, with no rank. Which course capability applies first?",
        options: [
          "Lead scoring, to rank which leads deserve the next human call",
          "Call analysis, even though those leads have no calls yet",
          "Replacing the pipeline with a single generated email",
          "A forecast that ignores which leads exist"
        ],
        correctIndex: 0,
        explanation: "Lead scoring ranks who to work next. Call analysis needs calls. Forecasting and pipeline management use the ranked pipeline; they do not replace it."
      },
      {
        text: "Call notes disagree about what the employer asked for. How does call analysis help?",
        options: [
          "It can surface themes and missed follow-ups from the calls so a person can correct the record",
          "It closes the deal without anyone listening",
          "It deletes notes that mention a concern",
          "It sets the contract price automatically"
        ],
        correctIndex: 0,
        explanation: "Call analysis is for understanding conversations: themes, gaps, and follow-ups. The relationship and the correction stay with the person."
      },
      {
        text: "The team wants to report a quarterly placement forecast to a funder. What is the responsible use of AI forecasting here?",
        options: [
          "Publish the model's number with no one checking the pipeline underneath it",
          "Use the forecast as a scenario, name the pipeline assumptions, and have a person own the figure that goes to the funder",
          "Skip pipeline management because the forecast makes stage updates unnecessary",
          "Score leads only after the quarter is over"
        ],
        correctIndex: 1,
        explanation: "Forecasting is one of the four sales uses, and it depends on a managed pipeline. A reported number still needs a human owner and visible assumptions."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-14",
    courseSlug: "ai-practitioner-course-14",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "AI for Marketing",
    missionName: "Strategy Lead",
    missionTagline: "Prove you can use AI across a marketing campaign",
    primaryAxis: "Strategy",
    skillLabels: ["Audience segmentation", "Content generation", "Campaign optimization"],
    scenarioPrompt: "A training program needs more applicants from career-changers, not from people already enrolled. Using AI for Marketing, describe how you would segment the audience, generate campaign content, and optimize the campaign after the first responses come in.",
    evidenceHint: "A strong response names a segment (career-changers) rather than 'everyone,' uses generation for drafts aimed at that segment, and says what result you would watch in order to change the campaign.",
    quizQuestions: [
      {
        text: "Which segmentation choice matches the campaign goal?",
        options: [
          "Career-changers who are not current members, with a message about starting a new line of work",
          "Every person in the contact list, with one generic slogan",
          "Only people who already completed the program",
          "A segment defined as 'whoever the tool mentions first'"
        ],
        correctIndex: 0,
        explanation: "Audience segmentation starts from the people you need to reach. Career-changers are the stated audience; current completers and an undefined 'everyone' miss the goal."
      },
      {
        text: "Content generation has produced three headlines. What is still your job?",
        options: [
          "Pick and edit the headline that speaks to career-changers and does not promise an outcome the program does not offer",
          "Publish all three at once so optimization is unnecessary",
          "Accept the longest headline because length means quality",
          "Remove the segment so the headline can address anyone"
        ],
        correctIndex: 0,
        explanation: "Content generation drafts options. The marketer still chooses a claim the program can keep and that fits the segment."
      },
      {
        text: "After the first week, career-changers open the email but do not click. What is campaign optimization?",
        options: [
          "Changing the call to action or the offer and comparing the next result, instead of repeating the same email unchanged",
          "Declaring success because the email was sent",
          "Deleting the segment and emailing only current members",
          "Generating more headlines and never looking at the clicks"
        ],
        correctIndex: 0,
        explanation: "Optimization uses the response to change the campaign. Opens without clicks are a signal to adjust the next step, not a reason to ignore the result."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-15",
    courseSlug: "ai-practitioner-course-15",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Salesforce Certified AI Associate Certification",
    missionName: "Systems Pro",
    missionTagline: "Prove you can tell predictive CRM AI from generative CRM AI",
    primaryAxis: "Strategy",
    skillLabels: ["Salesforce AI fundamentals", "Einstein AI", "Predictive CRM", "Generative CRM", "AI Associate exam objectives"],
    scenarioPrompt: "A CRM administrator asks when to use Einstein AI to predict which employer contacts are likely to reply, and when to use generative AI inside Salesforce to draft the reply. Using Salesforce Certified AI Associate Certification, answer in CRM terms and say how you would study the exam objectives without treating the tool as the decision-maker.",
    evidenceHint: "A strong response separates Einstein-style prediction on CRM records from generative drafting inside Salesforce, ties both to the AI Associate credential's objectives, and keeps a person responsible for the sent message and the prediction's use.",
    quizQuestions: [
      {
        text: "Which Salesforce use is predictive rather than generative?",
        options: [
          "Ranking which employer contacts are more likely to reply, based on CRM history",
          "Drafting the wording of the reply email",
          "Rewriting a campaign slogan in a friendlier tone",
          "Producing a paragraph of account-plan text from a short instruction"
        ],
        correctIndex: 0,
        explanation: "The certification track distinguishes predictive AI and generative AI in CRM. Ranking likely replies is prediction. Drafting the reply is generation."
      },
      {
        text: "Einstein AI suggests a contact is unlikely to reply. What should the associate do with that score?",
        options: [
          "Treat it as a CRM signal a person can use when choosing whom to call, not as a ban on contacting them",
          "Delete the contact because the score is the decision",
          "Paste the score into a public channel",
          "Ignore CRM records and rebuild the prediction outside Salesforce for the exam"
        ],
        correctIndex: 0,
        explanation: "Einstein AI in this course is AI applied inside Salesforce. A prediction informs the person working the CRM; it does not erase judgment or the record."
      },
      {
        text: "How should you use the exam objectives while you prepare?",
        options: [
          "As the checklist of what the credential expects you to know about AI in Salesforce, including predictive versus generative uses, practiced on realistic CRM situations",
          "As a script of answers to memorize with no CRM example",
          "As permission to skip Einstein AI because the exam is only about email tone",
          "As a requirement to let the model send customer messages during practice"
        ],
        correctIndex: 0,
        explanation: "The course is certification-track preparation against the Salesforce AI Associate exam objectives. Practice belongs on CRM situations, with a person still owning any real message."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-16",
    courseSlug: "ai-practitioner-course-16",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "AWS Artificial Intelligence Practitioner",
    missionName: "Tech Builder",
    missionTagline: "Prove you can explain SageMaker, Bedrock, and responsible AI",
    primaryAxis: "Engineering",
    skillLabels: ["AWS AI Practitioner", "SageMaker", "Amazon Bedrock", "Responsible AI", "Security and governance", "Prompt engineering"],
    scenarioPrompt: "A hiring manager for an AI practitioner role asks you to explain the AWS Certified AI Practitioner path in plain language. Using AWS Artificial Intelligence Practitioner, cover machine learning and generative AI, when the team would look at SageMaker versus Amazon Bedrock, and which responsible-AI, security, governance, and prompt-engineering checks belong in the plan.",
    evidenceHint: "A strong response names SageMaker for machine-learning model work and Bedrock for generative AI, and includes responsible AI plus security and governance rather than only naming the two services. Prompt engineering is included for the generative case.",
    quizQuestions: [
      {
        text: "A team wants to call a foundation model to draft member emails, with a person reviewing each draft. Which named AWS service matches that generative use?",
        options: [
          "Amazon Bedrock, the generative AI service named in this learning plan",
          "A filing cabinet, because generative AI means paper templates",
          "SageMaker used only as a mailbox",
          "Neither service, because the plan excludes generative AI"
        ],
        correctIndex: 0,
        explanation: "The learning plan names SageMaker and Bedrock as the AWS AI/ML services and includes generative AI. Bedrock is the generative path. A person still reviews member email."
      },
      {
        text: "The same team wants to train a model on its own historical completion records to flag who may need outreach. Which named service matches that machine-learning work?",
        options: [
          "Amazon SageMaker, for building and running the organization's own machine-learning model",
          "Amazon Bedrock, because every prediction must be a chat draft",
          "Prompt engineering alone, with no model and no data",
          "A public webpage with no access control"
        ],
        correctIndex: 0,
        explanation: "The plan separates machine-learning concepts from generative AI and names SageMaker among the AWS AI/ML services. Training on the organization's own outcome records is the SageMaker-shaped problem, not a chat draft."
      },
      {
        text: "Which set belongs in an AWS AI Practitioner plan alongside the service choice?",
        options: [
          "Responsible AI, security and governance, and prompt-engineering essentials for the generative path",
          "Only the service logo",
          "A decision to skip security because the exam name includes AI",
          "Prompt engineering for a paper form that never calls a model"
        ],
        correctIndex: 0,
        explanation: "The learning plan aligned to the AWS Certified AI Practitioner exam includes responsible AI, security and governance, and prompt-engineering essentials together with the services."
      }
    ],
    estimatedMinutes: 15,
  },

  {
    key: "ai-practitioner-professional-certificate-aws:mission:ai-practitioner-course-17",
    courseSlug: "ai-practitioner-course-17",
    programSlug: "ai-practitioner-professional-certificate-aws",
    programTitle: "AI Practitioner Professional Certificate (AWS)",
    courseTitle: "Lab, Project, and Test Preparation",
    missionName: "Project Commander",
    missionTagline: "Prove you can scope a project and a test-prep plan",
    primaryAxis: "Strategy",
    skillLabels: ["Applied labs", "Project scoping", "Test preparation", "Program competencies"],
    scenarioPrompt: "You are in Lab, Project, and Test Preparation. Propose one workplace project that uses a competency from this pathway, name the lab evidence you would keep, and outline how you would spend part of these hours preparing for the AWS AI Practitioner and Salesforce AI Associate material already in the program.",
    evidenceHint: "A strong response scopes a small project tied to a real competency (for example a checked draft, a prediction-versus-generation choice, or an ethics review), names a concrete lab artifact, and splits test preparation across the two certification-track courses already in the syllabus.",
    quizQuestions: [
      {
        text: "Which project scope fits this lab module?",
        options: [
          "A small workplace artifact that uses a program competency, such as a reviewed AI draft plus a note on who is accountable",
          "A new 16-course curriculum that replaces the syllabus",
          "A research paper on a model architecture this pathway does not teach",
          "A vendor contract signed during lab hours"
        ],
        correctIndex: 0,
        explanation: "The module is hands-on lab and project work supporting the program's competencies. The project should apply those competencies, not invent a different curriculum."
      },
      {
        text: "What is useful lab evidence?",
        options: [
          "The prompt or input you used, the output, and what you changed after checking it",
          "A screenshot with no note of what decision it supports",
          "A statement that the hours were completed, with no artifact",
          "Someone else's project with your name swapped in"
        ],
        correctIndex: 0,
        explanation: "Lab and project work is evidence of practice. The input, the output, and the correction show the competency; a bare claim of hours does not."
      },
      {
        text: "How should test preparation use these hours?",
        options: [
          "Practice the AWS Artificial Intelligence Practitioner and Salesforce Certified AI Associate material already in the pathway, on the objectives those courses name",
          "Study a cloud exam this program does not include, instead of the two certification tracks in the syllabus",
          "Skip both certification-track courses because lab hours replace them",
          "Memorize only the program title"
        ],
        correctIndex: 0,
        explanation: "Test preparation supports the program's competencies, including the AWS AI Practitioner and Salesforce AI Associate courses already on the syllabus."
      }
    ],
    estimatedMinutes: 15,
  },
];

export function getSkillMissionDefinitionsForProgram(programSlug: string): SkillMissionDefinition[] {
  return SKILL_MISSION_CATALOG.filter(m => m.programSlug === programSlug);
}

export function getSkillMissionDefinition(programSlug: string, courseSlug: string): SkillMissionDefinition | null {
  return SKILL_MISSION_CATALOG.find(m => m.programSlug === programSlug && m.courseSlug === courseSlug) ?? null;
}
