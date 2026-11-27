export default {
  id: 'data-analytics-professional-certificate-google',
  title: 'Insight Lab',
  tagline: 'Quick practice breaks for new data analysts.',
  role: 'You are a junior analyst at Maple & Main Goods, a regional retailer, turning questions into answers.',
  program: 'Management Analyst & Business Intelligence Professional Certificate',
  theme: {world: 'lab', accent: '#1f7a7a', mood: 'day'},
  levels: [
    {
      id: 'spot-the-step', order: 1,
      courseSlug: 'data-analytics-course-1', courseTitle: 'Foundations: Data, Data, Everywhere',
      title: 'Spot the Step',
      skill: 'Telling the steps of the data analysis process apart',
      mechanic: 'sort', prop: 'folder',
      scene: 'Your first week at Maple & Main. Your lead hands you a pile of small tasks to file by step.',
      takeaway: 'Analysis runs in phases: ask, prepare, process (clean), analyze, share and act. Knowing the phase keeps each task in its place.',
      prompt: 'Which step of the analysis is this task?',
      bins: [{id: 'ask', label: 'Ask'}, {id: 'clean', label: 'Process'}, {id: 'analyze', label: 'Analyze'}, {id: 'share', label: 'Share'}],
      items: [
        {label: 'A manager asks why sales dipped', answer: 'ask', why: 'Turning a worry into a clear question is where every project starts. You have not touched the data yet.'},
        {label: 'Remove repeated rows from a file', answer: 'clean', why: 'Repeated rows would count the same sale twice. Fixing that is cleaning, and it comes before any math.'},
        {label: 'Compare revenue month by month', answer: 'analyze', why: 'Comparing numbers to look for patterns is the analysis itself.'},
        {label: 'Present findings to the leaders', answer: 'share', why: 'Showing results to the people who will use them is the share step.'},
        {label: 'Agree on what the team must decide', answer: 'ask', why: 'Knowing the decision up front keeps the work focused. That belongs to the ask step.'},
        {label: 'Fix a date that was typed wrong', answer: 'clean', why: 'A wrong date throws off sorting and totals. Correcting errors like this is cleaning.'},
        {label: 'Find which product sells best', answer: 'analyze', why: 'Totaling and ranking products to find the top seller is analysis work.'},
        {label: 'Chart finished results for a talk', answer: 'share', why: 'A chart for an audience is how findings get shared. The numbers are already done.'}
      ]
    },
    {
      id: 'clear-the-ask', order: 2,
      courseSlug: 'data-analytics-course-2', courseTitle: 'Ask Questions to Make Data-Driven Decisions',
      title: 'Clear the Ask',
      skill: 'Checking whether a request is clear enough to start',
      mechanic: 'gate', prop: 'sticky-note',
      scene: 'Coworkers drop requests on your desk all day. Decide which are ready and which need a quick chat.',
      takeaway: 'A good question names what to measure, which time period, and what decision it helps. If one is missing, ask before you pull data.',
      prompt: 'Is this request ready to start?',
      actions: [{id: 'clarify', label: 'Ask more'}, {id: 'start', label: 'Start the work'}],
      items: [
        {title: 'Tell me about our customers', facts: ['Asked by a marketing director in passing', 'No goal or decision is mentioned'], answer: 'clarify', why: 'Without a goal you cannot tell which facts about customers matter. Ask what the answer will be used for.'},
        {title: 'Open rate for March emails vs February', facts: ['Measure: share of emails that were opened', 'Periods: March and February', 'Decision: keep or change subject lines'], answer: 'start', why: 'It names the measure, the time period and the decision. You have what you need to begin.'},
        {title: 'Why are emails not working?', facts: ['No campaign or month is named', 'No measure of "working" is given'], answer: 'clarify', why: '"Working" could mean opens, clicks or sales. Ask which measure counts before you look at data.'},
        {title: 'Weekly orders before vs after launch', facts: ['Period: eight weeks before and after launch', 'Decision: keep or end the loyalty program'], answer: 'start', why: 'The period, the measure and the decision are all clear. Compare the before and after weeks.'},
        {title: 'Pull all the sales data', facts: ['Sales director gave no time period', 'No product line or region is named'], answer: 'clarify', why: 'All sales data is too broad to be useful. Ask which period and products matter so the report fits the need.'},
        {title: 'See how the stores are doing', facts: ['Regional manager oversees five stores', 'No decision or key measure is named'], answer: 'clarify', why: 'Ask what decisions the manager needs to make. That tells you which measures to show.'},
        {title: 'Q1 returns by product line', facts: ['Measure: number of returns', 'Period: January to March', 'Used to pick which line to review first'], answer: 'start', why: 'The measure, period and purpose are all stated, so the question is ready to answer.'}
      ]
    },
    {
      id: 'know-your-data', order: 3,
      courseSlug: 'data-analytics-course-3', courseTitle: 'Prepare Data for Exploration',
      title: 'Know Your Data',
      skill: 'Connecting data prep terms and habits to their meaning',
      mechanic: 'match', prop: 'database-cylinder',
      scene: 'Three Maple & Main stores send you staff lists in three formats. Learn the terms before you combine them.',
      takeaway: 'Before you use data, know what each column means, make formats match, and learn where the data came from.',
      rounds: [
        {prompt: 'Match each data term to its meaning.', pairs: [['Data dictionary', 'A guide that explains each column'], ['Primary key', 'A column that tells rows apart'], ['Data type', 'Tells if a value is date, number or text'], ['Sample', 'A small group taken from the whole'], ['Bias', 'Data that unfairly favors one side']], why: 'A dictionary explains columns, a key identifies rows, a type sets what you can do with a value, a sample stands in for a whole group, and bias skews results.'},
        {prompt: 'Match each data problem to the best first move.', pairs: [['Units are unclear', 'Confirm the unit, then note it'], ['Mixed date styles', 'Write every date the same way'], ['Unknown data source', 'Find out where it came from'], ['Different ID styles', 'Make IDs match before joining']], why: 'Fix the cause first. Confirm what a column means, make formats the same, check where data came from, and line up keys before you merge tables.'}
      ]
    },
    {
      id: 'clean-sweep', order: 4,
      courseSlug: 'data-analytics-course-4', courseTitle: 'Process Data from Dirty to Clean',
      title: 'Clean Sweep',
      skill: 'Putting data cleaning steps in a safe order',
      mechanic: 'order', prop: 'clipboard',
      scene: 'A 12,000-row customer file is full of repeats and blanks. You have to clean it before a campaign.',
      takeaway: 'Keep a copy of the raw data, find the problems, understand them, fix them, and then check your work.',
      rounds: [
        {prompt: 'Clean a new customer file. Put the steps in order.', steps: ['Save a copy of the raw file', 'Scan for blanks and odd values', 'Fix or standardize the problems', 'Check that the fixes worked', 'Hand the clean file to the team'], why: 'Keep the raw copy safe first, find problems before fixing them, check the fixes, and only then pass the file on.'},
        {prompt: 'You find repeated rows. Put the steps in order.', steps: ['Spot the repeated rows', 'Find out why they repeat', 'Decide which row to keep', 'Remove the extra rows', 'Check that no repeats remain'], why: 'Learn the cause before you delete anything, because some repeats are real. Then remove the extras and confirm it worked.'},
        {prompt: 'State names are written many ways. Put the steps in order.', steps: ['List every spelling in the column', 'Write a replace rule for each one', 'Run the replacements', 'Count again to confirm'], why: 'You can only write a replace rule for a spelling you have found. After replacing, count again to prove no spelling was missed.'}
      ]
    },
    {
      id: 'query-lane', order: 5,
      courseSlug: 'data-analytics-course-5', courseTitle: 'Analyze Data to Answer Questions',
      title: 'Query Lane',
      skill: 'Choosing the right SQL piece for a common question',
      mechanic: 'lane', prop: 'code-block',
      scene: 'The sales table has one row per sale. Pick the right SQL piece to answer each question fast.',
      takeaway: 'Use "where" to filter rows, "group by" to make groups, "having" to filter the groups, and "order by" to sort.',
      questions: [
        {prompt: 'Which SQL keyword names the table to read from?', options: ['select', 'from', 'where'], answer: 1, why: 'from tells SQL which table holds the data. select picks the columns to show.'},
        {prompt: 'Keep only the rows where region is West.', options: ['where', 'group by', 'limit'], answer: 0, why: 'where filters individual rows by a rule, so only West rows stay.'},
        {prompt: 'Sort by revenue, highest first.', options: ['where revenue', 'group by revenue', 'order by ... desc'], answer: 2, why: 'order by sorts the rows, and desc puts the largest values first.'},
        {prompt: 'Show only the top 5 rows of the result.', options: ['sum', 'limit 5', 'count'], answer: 1, why: 'limit caps how many rows come back. sum and count are math functions, not row limits.'},
        {prompt: 'Add up revenue separately for each category.', options: ['count with where', 'sum with limit', 'sum with group by'], answer: 2, why: 'sum adds the revenue, and group by does it once for each category.'},
        {prompt: 'Find the average order value.', options: ['avg(order_value)', 'max(order_value)', 'count(order_value)'], answer: 0, why: 'avg gives the average. max gives the largest value and count only counts rows.'},
        {prompt: 'After counting orders per customer, keep counts above 3.', options: ['where', 'order by', 'having'], answer: 2, why: 'having filters groups after they are counted. where works earlier, on single rows.'}
      ]
    },
    {
      id: 'pick-the-chart', order: 6,
      courseSlug: 'data-analytics-course-6', courseTitle: 'Share Data Through the Art of Visualization',
      title: 'Pick the Chart',
      skill: 'Choosing a chart that fits the question',
      mechanic: 'gate', prop: 'chart-folder',
      scene: 'The leadership team needs a slide. For each finding, pick the chart that makes the point clearly.',
      takeaway: 'Match the chart to the question. Lines show change over time, bars compare groups, and scatter plots show how two numbers relate.',
      prompt: 'Which chart fits this question best?',
      actions: [{id: 'line', label: 'Line chart'}, {id: 'bar', label: 'Bar chart'}, {id: 'scatter', label: 'Scatter plot'}],
      items: [
        {title: 'Website visits each week for a year', facts: ['One measure tracked over 52 weeks', 'Goal: show how it rises and falls'], answer: 'line', why: 'A line connects points in time order, so the rise and fall over the year is easy to follow.'},
        {title: 'Sales for five stores in May', facts: ['Five separate stores to compare', 'One month only, so no time trend'], answer: 'bar', why: 'Bars of different heights make it easy to compare separate groups side by side.'},
        {title: 'Ad spend and sales for 30 stores', facts: ['Two numbers for each store', 'Question: do they rise together?'], answer: 'scatter', why: 'A scatter plot puts one dot per store, so you can see whether more spending goes with more sales.'},
        {title: 'Returns each month for two years', facts: ['A count for each of 24 months in a row', 'Goal: spot a rising or falling trend'], answer: 'line', why: 'Months in a row are a trend over time, which a line chart shows best.'},
        {title: 'Survey answers: yes, no or unsure', facts: ['Three answer groups', 'Goal: compare how many chose each'], answer: 'bar', why: 'The answers are separate groups. A bar for each makes the counts easy to compare.'},
        {title: 'Daily high temp and ice cream sales', facts: ['Two numbers for each day', 'Question: do hot days mean more sales?'], answer: 'scatter', why: 'Two numbers per day, and the question is how they relate. A scatter plot shows that pattern.'}
      ]
    },
    {
      id: 'r-toolbox', order: 7,
      courseSlug: 'data-analytics-course-7', courseTitle: 'Data Analysis with R Programming',
      title: 'R Toolbox',
      skill: 'Matching common R and tidyverse functions to their jobs',
      mechanic: 'match', prop: 'code-block',
      scene: 'Head office sends a CSV of sales by county. Reach for the right R tool at each step.',
      takeaway: 'In R, each function does one small job. Chain them with the pipe to load, filter, summarize and plot your data.',
      rounds: [
        {prompt: 'Match each function to what it does to a data frame.', pairs: [['read_csv()', 'Load a CSV file into R'], ['filter()', 'Keep rows that meet a rule'], ['select()', 'Keep only chosen columns'], ['mutate()', 'Create or change a column'], ['arrange()', 'Sort rows by a column']], why: 'filter works on rows and select works on columns. mutate adds or changes a column, arrange sorts, and read_csv brings the file in.'},
        {prompt: 'Match each ggplot2 piece to its job.', pairs: [['ggplot()', 'Starts a plot with your data'], ['aes()', 'Maps columns to x and y'], ['geom_col()', 'Draws bars from values'], ['labs()', 'Adds a title and axis names'], ['theme()', 'Changes fonts, colors and text angle']], why: 'A plot starts with ggplot, aes links columns to the axes, geom_col draws the bars, labs adds words, and theme changes the look.'},
        {prompt: 'Match each tidyverse helper to its job.', pairs: [['%>%', 'Passes a result to the next step'], ['group_by()', 'Splits rows into groups'], ['summarize()', 'Turns each group into one summary row'], ['glimpse()', 'Lists each column and its type']], why: 'The pipe chains steps. group_by and summarize work as a pair, and glimpse gives a quick look at what columns you have.'}
      ]
    },
    {
      id: 'final-review', order: 8,
      courseSlug: 'data-analytics-course-8', courseTitle: 'Google Data Analytics Capstone',
      title: 'Final Review',
      skill: 'Reviewing the whole analysis process from question to story',
      mechanic: 'lane', prop: 'blueprint',
      scene: 'You are presenting your first full case study to the team. Quick questions come from every stage.',
      takeaway: 'A strong case study shows the whole path: a clear question, clean data, careful analysis, honest limits and a fitting chart.',
      questions: [
        {prompt: 'A manager says "sales look odd." What do you do first?', options: ['Draw a chart', 'Run a query', 'Clarify first'], answer: 2, why: 'A vague worry has to become a clear question first. Otherwise you may answer the wrong thing.'},
        {prompt: 'Two files write dates in different styles. What do you do before merging?', options: ['Match the dates', 'Drop the dates', 'Merge and hope'], answer: 0, why: 'Matching formats lets you sort, filter and join dates correctly.'},
        {prompt: 'Some rows show a customer age of 999. What do you do first?', options: ['Look into why', 'Delete them all', 'Average them in'], answer: 0, why: 'Find the cause first. It may be a placeholder for missing data, not a real age, and that decides the fix.'},
        {prompt: 'Weekly visits for a year. Which chart shows the ups and downs?', options: ['Pie chart', 'Scatter plot', 'Line chart'], answer: 2, why: 'A line chart links points in time order, so the trend is easy to see.'},
        {prompt: 'You skipped one segment of the data. What do you tell the team?', options: ['Name it as a limit', 'Leave it out', 'Redo everything'], answer: 0, why: 'Naming a limit builds trust. Suggest the segment as a next step and share the findings you have.'},
        {prompt: 'Count orders per customer, then keep only customers with many orders. Which clause?', options: ['where', 'order by', 'having'], answer: 2, why: 'Counts only exist after grouping, so you filter them with having. where only sees single rows.'},
        {prompt: 'You finished cleaning. What is the next step?', options: ['Share findings', 'Analyze the data', 'Ask the question'], answer: 1, why: 'Once the data is clean you can analyze it. Sharing waits until you have results.'},
        {prompt: 'Why should a bar chart axis start at zero?', options: ['Looks tidier', 'Keeps bars honest', 'Saves space'], answer: 1, why: 'Bar length stands for the value. Cutting the axis makes small differences look large and can mislead people.'}
      ]
    }
  ]
};
