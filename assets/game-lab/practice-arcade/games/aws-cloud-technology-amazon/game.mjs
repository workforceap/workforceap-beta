export default {
  id: 'aws-cloud-technology-amazon',
  title: 'Cloud Crew',
  tagline: 'Quick practice breaks for new cloud support associates.',
  role: 'You are a cloud support associate helping Skyline Goods, a small online shop, move to the cloud.',
  program: 'AWS Cloud Technology Professional Certificate (AWS)',
  theme: {world: 'cloud', accent: '#c76a12', mood: 'day'},
  levels: [
    {
      id: 'why-cloud', order: 1,
      courseSlug: 'aws-course-1', courseTitle: 'Introduction to Information Technology and AWS Cloud',
      title: 'Why Move to Cloud?',
      skill: 'Matching a business problem to a cloud benefit',
      mechanic: 'gate', prop: 'cloud-node',
      scene: 'Skyline Goods is nervous about the cloud. Explain the benefit that fits each worry.',
      takeaway: 'Cloud helps in three ways: pay only for what you use, survive a failure in one place, and add or remove capacity quickly.',
      prompt: 'Which cloud benefit answers this worry?',
      actions: [{id: 'pay', label: 'Pay for use'}, {id: 'reliable', label: 'Survive failure'}, {id: 'scale', label: 'Scale quickly'}],
      items: [
        {title: 'One-day flash sale', facts: ['Shop needs ten times the usual capacity', 'Needed within hours, not weeks'], answer: 'scale', why: 'Cloud capacity can be added in minutes and removed after the sale, so nobody buys hardware for one day.'},
        {title: 'Flood in the server closet', facts: ['All files lived on one local server', 'No copy was kept in another place'], answer: 'reliable', why: 'Copies kept in a separate location survive a disaster in one place. Cloud makes that easy to set up.'},
        {title: 'New startup, tight budget', facts: ['Cannot afford to buy servers upfront', 'Usage will be small for the first year'], answer: 'pay', why: 'Cloud is billed by use, so a small team can start small without a large purchase.'},
        {title: 'Power cut at one data center', facts: ['The website must keep working anyway', 'A second location is ready to take over'], answer: 'reliable', why: 'Spreading work across locations means one outage does not stop the service.'},
        {title: 'Storage is running out', facts: ['Need much more space next week', 'No time to order and install disks'], answer: 'scale', why: 'Cloud storage grows on demand. You ask for more space and it is there, with no hardware to install.'},
        {title: 'Boss hates paying for idle servers', facts: ['Servers sit unused most nights', 'Wants to stop paying for idle time'], answer: 'pay', why: 'Pay-as-you-go means you are billed for the resources you used, not for capacity sitting idle.'},
        {title: 'Store broke twice this year', facts: ['One server failed both times', 'Customers could not order for hours'], answer: 'reliable', why: 'A single server is a single point of failure. Running more than one in separate locations keeps the store open.'}
      ]
    },
    {
      id: 'support-checks', order: 2,
      courseSlug: 'aws-course-2', courseTitle: 'Providing Technical Support for AWS Workloads',
      title: 'Support Call Steps',
      skill: 'Working through a cloud problem in a sensible order',
      mechanic: 'order', prop: 'ticket',
      scene: 'A Skyline Goods employee calls you. Their server looks healthy, but something is wrong.',
      takeaway: 'Get the facts first, check the simple things, change one thing at a time, then confirm the fix with the customer.',
      rounds: [
        {prompt: 'A web app on a running server will not load. Put the checks in order.', steps: ['Ask users what error they see', 'Check firewall rules for web traffic', 'Add only the missing web rule', 'Reload the page to test it', 'Tell the customer it is fixed'], why: 'Learn what users see first, then check the likely cause. Change only what is missing, test it yourself, and close the loop with the customer.'},
        {prompt: 'An app gets Access Denied when saving files to storage. Order the steps.', steps: ['Read the exact error message', 'Find the server\'s permission role', 'Check what that role is allowed to do', 'Add only the missing permission', 'Run the upload again'], why: 'The message tells you what to look for. Find the role, spot the gap, add the least access needed, then retest.'},
        {prompt: 'A CPU alarm fired and the app is slow. Order the steps.', steps: ['Look at the alarm and the CPU graph', 'Find which process uses the CPU', 'Pick a fix: tune the app or add power', 'Apply the fix', 'Watch the graph to see it drop'], why: 'Find the cause before acting. A fix chosen without a diagnosis may do nothing or cause new problems.'}
      ]
    },
    {
      id: 'pick-the-service', order: 3,
      courseSlug: 'aws-course-3', courseTitle: 'Developing Applications in Python on AWS',
      title: 'Pick the Service',
      skill: 'Choosing the AWS service that fits a Python app task',
      mechanic: 'lane', prop: 'code-block',
      scene: 'Skyline wants a Python app that reacts when a file is uploaded. Pick each building block.',
      takeaway: 'Each service has one job: Lambda runs code, S3 stores files, SNS and SQS pass messages, and roles give permission without secrets in code.',
      questions: [
        {prompt: 'Run a bit of Python when a file arrives, with no server to manage.', options: ['Amazon EC2', 'AWS Lambda', 'Amazon VPC'], answer: 1, why: 'Lambda runs your code only when something triggers it, and AWS manages the servers for you.'},
        {prompt: 'Which Python library lets your code call AWS services?', options: ['Boto3', 'NumPy', 'Flask'], answer: 0, why: 'Boto3 is the AWS software kit for Python. Your code uses it to talk to services such as S3.'},
        {prompt: 'Store uploaded files as objects in a bucket.', options: ['Amazon SQS', 'Amazon DynamoDB', 'Amazon S3'], answer: 2, why: 'S3 is object storage. Files go into buckets and are found by their key, which is like a path.'},
        {prompt: 'Send one message to many subscribers, such as emails and texts.', options: ['Amazon SQS', 'Amazon SNS', 'Amazon S3'], answer: 1, why: 'SNS publishes a message to every subscriber at once. SQS is a waiting line, not a broadcaster.'},
        {prompt: 'Hold tasks in a waiting line until workers are ready for them.', options: ['Amazon SNS', 'Amazon S3', 'Amazon SQS'], answer: 2, why: 'SQS is a queue. Messages wait there safely until a worker picks them up.'},
        {prompt: 'Give a web app an HTTPS front door that calls your function.', options: ['Amazon API Gateway', 'Amazon SQS', 'Amazon RDS'], answer: 0, why: 'API Gateway receives web requests and passes them to a service such as a Lambda function.'},
        {prompt: 'How should a Lambda function get permission to read a bucket?', options: ['Hardcode keys', 'An IAM role', 'A public bucket'], answer: 1, why: 'An IAM role gives the function access with no secret kept in code. Keys in code leak through shared files.'}
      ]
    },
    {
      id: 'trim-the-bill', order: 4,
      courseSlug: 'aws-course-4', courseTitle: 'Skills for Working as an AWS Cloud Consultant',
      title: 'Trim the Bill',
      skill: 'Choosing a sensible way to cut a cloud bill',
      mechanic: 'sort', prop: 'chart-folder',
      scene: 'Skyline\'s cloud bill keeps growing. Pick a fix for each finding. A commitment plan is a lower price for promising steady use.',
      takeaway: 'Match the fix to the usage pattern: stop what is idle, shrink what is oversized, and commit to what you will always need.',
      prompt: 'What is the best first recommendation?',
      bins: [{id: 'stop', label: 'Stop or delete'}, {id: 'resize', label: 'Resize'}, {id: 'commit', label: 'Commit to plan'}],
      items: [
        {label: 'Test servers run all night', note: 'Used on workdays, 9 to 5 only', answer: 'stop', why: 'You pay for every hour a server runs. Stopping it when nobody needs it removes that cost.'},
        {label: 'Database busy all day, every day', note: 'Needed at this size for years', answer: 'commit', why: 'Steady, predictable use fits a commitment plan, which costs less than pay-as-you-go in return for a promise.'},
        {label: 'Server only 3% busy at peak', note: 'Biggest size picked just in case', answer: 'resize', why: 'A server far bigger than its load wastes money. Move to a smaller size that still fits.'},
        {label: 'Disk left from a finished project', note: 'No server uses it anymore', answer: 'stop', why: 'Unused storage still costs money every month. After checking nobody needs it, delete it.'},
        {label: 'Store site with a 3-year contract', note: 'Same two servers needed until it ends', answer: 'commit', why: 'A known end date and a fixed need make a plan safe. You get a lower price for promising the usage.'},
        {label: 'Database with lots of free memory', note: 'Size is far above what the load needs', answer: 'resize', why: 'Most of the memory is never touched. A smaller database size would serve the same users for less.'},
        {label: 'Demo copy of the app', note: 'Nobody has opened it since last year', answer: 'stop', why: 'Nobody uses the demo, so it is pure cost. Shut it down and delete it.'},
        {label: 'Server built for a 10-person team', note: 'Only 3 people use it now', answer: 'resize', why: 'The team shrank, so the server can too. A smaller size serves the same people for less.'},
        {label: 'Order system with fixed daily load', note: 'Same size is planned for 3 years', answer: 'commit', why: 'A known, steady need is the best case for a commitment plan, which beats paying standard rates.'}
      ]
    },
    {
      id: 'devops-words', order: 5,
      courseSlug: 'aws-course-5', courseTitle: 'DevOps on AWS and Project Management',
      title: 'DevOps Word Match',
      skill: 'Connecting DevOps and project terms to their meanings',
      mechanic: 'match', prop: 'gear',
      scene: 'Skyline\'s team deploys by hand and breaks things. You explain the words that fix it.',
      takeaway: 'DevOps swaps risky manual steps for an automated pipeline, and project methods decide how the team plans and shares work.',
      rounds: [
        {prompt: 'Match each DevOps term to its meaning.', pairs: [['Version control', 'Tracks every change to the code'], ['Build', 'Turns code into a runnable package'], ['Pipeline', 'Automated path from code to release'], ['Rollback', 'Return to the last working version'], ['Infra as code', 'Servers described in template files']], why: 'A pipeline builds and releases code that version control tracks. A rollback is the way back, and templates make servers repeatable.'},
        {prompt: 'Match each project method to how it works.', pairs: [['Waterfall', 'Finish one phase before the next'], ['Agile', 'Values change over a fixed plan'], ['Scrum', 'Short work cycles called sprints'], ['Kanban', 'Task board that limits work in progress']], why: 'Waterfall runs in strict phases. Agile favors change, Scrum organizes work in sprints, and Kanban limits work in progress on a board.'}
      ]
    },
    {
      id: 'automate-it', order: 6,
      courseSlug: 'aws-course-6', courseTitle: 'Automation in the AWS Cloud',
      title: 'Automate It',
      skill: 'Picking the right tool to automate an operations job',
      mechanic: 'gate', prop: 'clipboard',
      scene: 'Skyline\'s ops team loses three hours every Monday to repeat chores. Choose a tool for each.',
      takeaway: 'Use a schedule for jobs that run on a clock, Run Command to act on many servers at once, and an alarm to tell people when something is wrong.',
      prompt: 'Which automation tool fits this job?',
      actions: [{id: 'timer', label: 'Scheduled rule'}, {id: 'runcmd', label: 'Run Command'}, {id: 'alarm', label: 'Alarm'}],
      items: [
        {title: 'Start dev servers each weekday', facts: ['They must be up by 8 each morning', 'Nobody should have to click anything'], answer: 'timer', why: 'A scheduled rule fires at a set time and can start a function that starts the servers.'},
        {title: 'Patch 25 servers', facts: ['The same script must run on every one', 'Do not open remote login ports'], answer: 'runcmd', why: 'Systems Manager Run Command sends one script to many servers without remote login.'},
        {title: 'Nightly job fails silently', facts: ['Team learns of failures next morning', 'They want a message the moment it errors'], answer: 'alarm', why: 'An alarm watches a measure, such as error count, and sends a notice as soon as it crosses the limit you set.'},
        {title: 'Weekly backup script', facts: ['Runs every Monday at 2 in the morning', 'Same time, every week'], answer: 'timer', why: 'Anything that must run on a calendar belongs on a scheduled rule, not on a person\'s to-do list.'},
        {title: 'Disk nearly full', facts: ['Warn staff before the disk fills up', 'Disk use is measured over time'], answer: 'alarm', why: 'A monitoring alarm on disk use warns people before the disk fills and the app stops.'},
        {title: 'Restart a stuck service', facts: ['The same service hung on many servers', 'Staff want a record of who ran it'], answer: 'runcmd', why: 'Run Command acts on a group of servers at once and keeps a record of who ran what.'},
        {title: 'Monthly cost report', facts: ['Must be built on the first of the month', 'Nobody should have to remember it'], answer: 'timer', why: 'A report due on a date is a clock job. A scheduled rule can start it with no one remembering.'},
        {title: 'CPU stays high for an hour', facts: ['Alert the team if the limit is crossed', 'They need a message, not an automatic fix'], answer: 'alarm', why: 'An alarm on CPU sends a notice when the measure stays over its limit, so people can step in.'}
      ]
    },
    {
      id: 'data-tools', order: 7,
      courseSlug: 'aws-course-7', courseTitle: 'Data Analytics and Databases on AWS',
      title: 'Data Tool Dash',
      skill: 'Choosing the AWS data service for a job',
      mechanic: 'lane', prop: 'database-cylinder',
      scene: 'Skyline\'s sales team has piles of data and questions. Pick the right data tool for each.',
      takeaway: 'Match the tool to the data: S3 holds files, RDS holds tables, DynamoDB looks up by key, Athena queries files, QuickSight draws charts.',
      questions: [
        {prompt: 'Run SQL on CSV files sitting in S3, without loading them first.', options: ['Amazon Athena', 'Amazon EC2', 'Auto Scaling'], answer: 0, why: 'Athena runs SQL straight on files in S3, with no database to set up.'},
        {prompt: 'A managed database with tables, rows and SQL.', options: ['Amazon S3', 'Amazon RDS', 'Amazon SNS'], answer: 1, why: 'RDS runs relational databases for you. Data lives in tables, and you query it with SQL.'},
        {prompt: 'A fast database that finds each item by its key, not by SQL tables.', options: ['Amazon RDS', 'Amazon S3', 'DynamoDB'], answer: 2, why: 'DynamoDB is a NoSQL key-value database. You fetch each item by its key, with no joins between tables.'},
        {prompt: 'Turn sales data into dashboards and charts.', options: ['AWS Lambda', 'Amazon QuickSight', 'Amazon SQS'], answer: 1, why: 'QuickSight is a business intelligence tool. It draws charts and dashboards from your data.'},
        {prompt: 'Keep raw files of any type together in one data lake.', options: ['Amazon RDS', 'DynamoDB', 'Amazon S3'], answer: 2, why: 'S3 holds files of any type, so it is the usual home for a data lake.'},
        {prompt: 'A sales table with fixed columns for date, item and amount.', options: ['Structured data', 'Unstructured data', 'Metadata'], answer: 0, why: 'Data in a fixed layout of rows and columns is structured, so SQL queries work well on it.'},
        {prompt: 'Facts about a file, like its size and who made it.', options: ['Structured data', 'Metadata', 'Unstructured data'], answer: 1, why: 'Metadata is data about data. It describes a file without being the file\'s content.'}
      ]
    },
    {
      id: 'pillar-review', order: 8,
      courseSlug: 'aws-course-8', courseTitle: 'Capstone: Following the AWS Well-Architected Framework',
      title: 'Pillar Review',
      skill: 'Spotting which Well-Architected pillar a gap belongs to',
      mechanic: 'sort', prop: 'blueprint',
      scene: 'You are reviewing Skyline\'s new store in the cloud. Sort each gap by the pillar it hurts most.',
      takeaway: 'Four of the six pillars: Security protects data, Reliability plans for failure, Ops Excellence watches and automates, Cost avoids waste.',
      prompt: 'Which pillar does this gap hurt most?',
      bins: [{id: 'security', label: 'Security'}, {id: 'reliability', label: 'Reliability'}, {id: 'ops', label: 'Ops Excellence'}, {id: 'cost', label: 'Cost'}],
      items: [
        {label: 'Password stored in plain text', note: 'Sits in a setting on the server', answer: 'security', why: 'Secrets kept in plain view can be read by anyone with access. Keep them in an encrypted secrets service.'},
        {label: 'Only one server, no spare', note: 'If it fails, the store is down', answer: 'reliability', why: 'A single point of failure breaks Reliability. Run more than one copy in separate locations.'},
        {label: 'No alarms or monitoring', note: 'Customers report outages first', answer: 'ops', why: 'Operational Excellence means seeing problems yourself, early. Alarms tell the team before customers do.'},
        {label: 'Servers left running, unused', note: 'Nobody has opened them in months', answer: 'cost', why: 'Paying for idle resources wastes money. Cost Optimization means paying only for what you need.'},
        {label: 'Everyone shares one admin login', answer: 'security', why: 'Shared admin access breaks least privilege. Give each person only the access their job needs.'},
        {label: 'No backups of the database', note: 'A bad delete cannot be undone', answer: 'reliability', why: 'Reliability includes recovery. Backups let you restore data after a mistake or a failure.'},
        {label: 'Updates done by hand each time', note: 'Every server ends up different', answer: 'ops', why: 'Automating changes makes them repeatable and less error-prone, a core idea of Operational Excellence.'},
        {label: 'Paying for peak size all year', note: 'Busy only a few days a year', answer: 'cost', why: 'Capacity sized for the rare peak wastes money the rest of the year. Match size to real demand.'},
        {label: 'Customer data stored unencrypted', answer: 'security', why: 'Encryption protects data if someone gets at the storage. Protecting data is a Security pillar task.'}
      ]
    }
  ]
};
