export default {
  id: 'data-science-professional-certificate-ibm',
  title: 'Data Detective',
  tagline: 'Short practice breaks for turning raw data into answers.',
  role: 'You are a junior data scientist at Ridgeway Analytics, turning raw data into answers for each client.',
  program: 'Database Administrator (DBA) Professional Certificate (IBM)',
  theme: {world: 'server-room', accent: '#b7791f', mood: 'day'},
  levels: [
    {
      id: 'question-sorter', order: 1,
      courseSlug: 'data-science-course-1', courseTitle: 'What is Data Science?',
      title: 'Question Sorter',
      skill: 'Telling reports, predictions and recommendations apart',
      mechanic: 'sort', prop: 'folder',
      scene: 'On your first day, teams send in questions and you tag each one before it goes to the data team.',
      takeaway: 'Reports look back at what happened. Predictions guess what will happen. Recommendations say what to do next.',
      prompt: 'Is this question a report, a prediction or a recommendation?',
      bins: [{id: 'past', label: 'Report'}, {id: 'predict', label: 'Prediction'}, {id: 'advise', label: 'Recommendation'}],
      items: [
        {label: 'Total sales last month by store', answer: 'past', why: 'Last month is already over. Adding up what was sold is a report on the past.'},
        {label: 'Which customers may cancel soon', answer: 'predict', why: 'Nobody has cancelled yet. Guessing who might cancel uses past data to forecast the future.'},
        {label: 'How many orders came in yesterday', answer: 'past', why: 'Yesterday has happened, so counting its orders describes the past.'},
        {label: 'How many umbrellas sell next week', answer: 'predict', why: 'Next week has not happened. A sales number for it is a forecast, which is a prediction.'},
        {label: 'Which discount to offer each buyer', answer: 'advise', why: 'This asks for an action to take. Choosing the best action is a recommendation.'},
        {label: 'Average call wait last quarter', answer: 'past', why: 'An average of calls that already happened is a summary of the past.'},
        {label: 'Chance a new loan is paid late', answer: 'predict', why: 'The loan is new, so the outcome is unknown. Estimating a chance is a prediction.'},
        {label: 'Which route each truck should take', answer: 'advise', why: 'This asks what each driver should do. Picking the best choice is a recommendation.'},
        {label: 'Which product to show each visitor', answer: 'advise', why: 'The answer is an action for the website to take, so it is a recommendation.'}
      ]
    },
    {
      id: 'tool-run', order: 2,
      courseSlug: 'data-science-course-2', courseTitle: 'Tools for Data Science',
      title: 'Tool Run',
      skill: 'Picking the right tool for each part of data work',
      mechanic: 'lane', prop: 'toolbox',
      scene: 'A new analyst asks which tool to grab for each job, so you walk them through the toolkit.',
      takeaway: 'SQL pulls data from the database, notebooks mix code with notes, and Git keeps a history of every change.',
      questions: [
        {prompt: 'You want code, its output and your notes together in one file you can share.', options: ['Jupyter Notebook', 'Text editor', 'Spreadsheet'], answer: 0, why: 'A Jupyter Notebook runs code, shows the result right below it, and holds notes in the same file.'},
        {prompt: 'You need to join and filter rows inside a large database.', options: ['Matplotlib', 'SQL', 'Git'], answer: 1, why: 'SQL is the language databases understand. Filtering in the database sends back only the rows you need.'},
        {prompt: 'You want a saved history of every change made to your code.', options: ['NumPy', 'R', 'Git'], answer: 2, why: 'Git is version control. It records each change, so you can see who changed what and go back.'},
        {prompt: 'You want a language that was built mainly for statistics.', options: ['R', 'SQL', 'Git'], answer: 0, why: 'R was made by statisticians for statistics and charts. SQL queries databases and Git tracks changes.'},
        {prompt: 'Teammates need to see and review your project online.', options: ['Excel', 'GitHub', 'NumPy'], answer: 1, why: 'GitHub hosts Git projects online, so a team can share code and review changes in one place.'},
        {prompt: 'In a notebook, you want to explain your steps with headings and plain text.', options: ['Code cell', 'SQL query', 'Markdown cell'], answer: 2, why: 'A Markdown cell holds formatted text like headings and lists. Code cells are for code that runs.'},
        {prompt: 'In a notebook, you want to run a few lines of Python and see the result.', options: ['Code cell', 'Markdown cell', 'Git commit'], answer: 0, why: 'A code cell runs its code and shows the output right below it.'}
      ]
    },
    {
      id: 'method-map', order: 3,
      courseSlug: 'data-science-course-3', courseTitle: 'Data Science Methodology',
      title: 'Method Map',
      skill: 'Putting the steps of a data science project in order',
      mechanic: 'order', prop: 'clipboard',
      scene: 'A client project is starting, and the team asks you to pin the plan on the wall in the right order.',
      takeaway: 'Start with the business question, then get to know and prepare the data, then model, test, deploy and keep watching.',
      rounds: [
        {prompt: 'Put the first five CRISP-DM phases in order.', steps: ['Business understanding', 'Data understanding', 'Data preparation', 'Modeling', 'Evaluation'], why: 'First learn what the business needs. Then explore the data, clean it, build a model, and check the model against the goal.'},
        {prompt: 'The shop asks why returns went up. Put the first steps in order.', steps: ['Ask what the shop needs to know', 'List the data that could answer it', 'Collect that data', 'Explore it for gaps and odd values', 'Clean and shape it for modeling'], why: 'You cannot pick data before you know the question, explore data before you collect it, or fix problems before you find them.'},
        {prompt: 'The model is built. Put the next steps in order.', steps: ['Test it on data it has not seen', 'Deploy it for the team to use', 'Monitor its results over time', 'Retrain it when results slip'], why: 'Test before anyone relies on it. Once it is in use, watch it, because data changes and a model can drift and need retraining.'}
      ]
    },
    {
      id: 'python-pairs', order: 4,
      courseSlug: 'data-science-course-4', courseTitle: 'Python for Data Science, AI & Development',
      title: 'Python Pairs',
      skill: 'Connecting Python building blocks to what they do',
      mechanic: 'match', prop: 'code-block',
      scene: 'Before you write your first Python script, a teammate leaves you a set of cards to learn the basics.',
      takeaway: 'Pick the right container for your data, know the keywords that control your code, and lean on libraries for the heavy work.',
      rounds: [
        {prompt: 'Match each Python container to what it holds.', pairs: [['list', 'Ordered items you can change'], ['tuple', 'Ordered items you cannot change'], ['dictionary', 'Values you look up by a key'], ['set', 'Unordered items with no repeats']], why: 'Lists and tuples both keep order, but only lists can change. Dictionaries pair keys with values. Sets drop duplicates.'},
        {prompt: 'Match each Python keyword to its job.', pairs: [['def', 'Starts a new function'], ['for', 'Repeats code for each item'], ['if', 'Runs code only when a test is true'], ['import', 'Loads a library into your code'], ['return', 'Sends a value back from a function']], why: 'These keywords shape every script: build functions, loop over data, make choices, bring in tools and hand back results.'},
        {prompt: 'Match each Python library to what it is used for.', pairs: [['pandas', 'Tables of rows and columns'], ['NumPy', 'Fast math on arrays of numbers'], ['Matplotlib', 'Drawing charts and plots'], ['Requests', 'Getting data from web APIs']], why: 'Each library does one kind of job well, so you do not have to write that code yourself.'}
      ]
    },
    {
      id: 'chart-check', order: 5,
      courseSlug: 'data-science-course-5', courseTitle: 'Python Project for Data Science',
      title: 'Chart Check',
      skill: 'Deciding if pulled data is ready for a chart',
      mechanic: 'gate', prop: 'chart-folder',
      scene: 'A finance client wants a stock price chart, so each dataset you pull stops at your desk before it is plotted.',
      takeaway: 'Fix wrong data types first. If a value looks strange but the type is right, check the source before you change or plot it.',
      prompt: 'What is the next step for this data?',
      actions: [{id: 'fix', label: 'Fix the type'}, {id: 'verify', label: 'Check source'}, {id: 'plot', label: 'Plot it'}],
      items: [
        {title: 'Dates come out of order', facts: ['Date column holds text like "03/14/2025"', 'The chart jumps between months'], answer: 'fix', why: 'Text sorts letter by letter, not by time. Convert the column to real dates, then sort by date.'},
        {title: 'Average price gives an error', facts: ['Prices are stored as text like "$1,200"', 'Math on the column fails'], answer: 'fix', why: 'Numbers stored as text cannot be averaged. Remove the $ and commas and convert the column to numbers.'},
        {title: 'Trading volume will not plot', facts: ['Volume holds text like "1.2M" and "850K"', 'The chart shows no bars'], answer: 'fix', why: 'Letters like M and K turn numbers into text. Convert them to plain numbers so the chart can use them.'},
        {title: 'One day is 10 times higher', facts: ['Price column is numeric', 'Dates are sorted', 'Days around it look normal'], answer: 'verify', why: 'The types are fine, so the value itself is in question. Compare with another source before you keep or drop it.'},
        {title: 'Scraped table is too short', facts: ['The web page shows 50 rows', 'Your table has only 20'], answer: 'verify', why: 'Rows went missing while pulling the page. Check the page and your scraper before you trust the table.'},
        {title: 'Daily prices, all checked', facts: ['Dates converted and sorted', 'No missing values', 'Spot check matches the source'], answer: 'plot', why: 'The types are right and the values match the source, so the data is ready to chart.'},
        {title: 'Two companies, lined up', facts: ['Both tables joined on the date', 'Dates are real dates, sorted', 'Prices stored as numbers'], answer: 'plot', why: 'Both tables share sorted dates and numeric prices, so the two lines sit on the same time axis and can be plotted.'}
      ]
    },
    {
      id: 'sql-sorter', order: 6,
      courseSlug: 'data-science-course-6', courseTitle: 'Databases and SQL for Data Science with Python',
      title: 'SQL Sorter',
      skill: 'Telling which SQL statements build, change or read data',
      mechanic: 'sort', prop: 'database-cylinder',
      scene: 'Client SQL scripts are queued to run, so you sort each one by what it will do before you let it through.',
      takeaway: 'Create, alter and drop change the table itself. Insert, update and delete change rows. Select only reads.',
      prompt: 'What does this SQL statement do?',
      bins: [{id: 'structure', label: 'Table itself'}, {id: 'change', label: 'Change rows'}, {id: 'read', label: 'Read rows'}],
      items: [
        {label: 'create table customers (...)', answer: 'structure', why: 'A create table statement makes a new, empty table and sets its columns. No rows are added yet.'},
        {label: 'alter table customers ...', note: 'Adds an email column', answer: 'structure', why: 'Alter table changes the shape of a table, such as adding a column. It does not edit the rows.'},
        {label: 'drop table old_logs', answer: 'structure', why: 'Drop table removes the whole table, columns and all. That is why it needs extra care.'},
        {label: 'insert into customers ...', note: 'Adds one new customer', answer: 'change', why: 'Insert adds new rows to a table that already exists.'},
        {label: 'update customers set ...', note: 'Fixes one customer\'s city', answer: 'change', why: 'Update edits values in rows that are already there. Use a where clause so only the right rows change.'},
        {label: 'delete from orders where id = 12', answer: 'change', why: 'Delete removes rows but keeps the table. Drop table would remove the table itself.'},
        {label: 'select name from customers', answer: 'read', why: 'Select reads data and returns it. Nothing in the table is changed.'},
        {label: 'select count(*) from orders', answer: 'read', why: 'Count works inside a select, so it reports how many rows there are without changing any.'},
        {label: 'insert into archive select ...', note: 'Copies old orders into an archive', answer: 'change', why: 'The statement starts with insert, so it adds rows to the archive table. The select inside only picks which rows to copy.'}
      ]
    },
    {
      id: 'explore-run', order: 7,
      courseSlug: 'data-science-course-7', courseTitle: 'Data Analysis with Python',
      title: 'Explore Run',
      skill: 'Choosing pandas tools and reading what the results mean',
      mechanic: 'lane', prop: 'database-cylinder',
      scene: 'A car dealer client wants to know what drives used car prices, so you open the sales table.',
      takeaway: 'Summarize first, then look for links. A strong link between two columns does not prove one causes the other.',
      questions: [
        {prompt: 'You want the count, mean, min and max of every number column.', options: ['describe()', 'groupby()', 'dropna()'], answer: 0, why: 'describe() gives a quick summary of each number column, including count, mean, min and max.'},
        {prompt: 'You want the average price for each car make.', options: ['corr()', 'groupby()', 'head()'], answer: 1, why: 'groupby() splits rows into groups, such as by make, so you can take the average of each group.'},
        {prompt: 'You want to see how strongly mileage and price move together.', options: ['value_counts()', 'sort_values()', 'corr()'], answer: 2, why: 'corr() measures how closely two number columns rise or fall together, from -1 to 1.'},
        {prompt: 'You want to count how many cars are in each condition.', options: ['value_counts()', 'mean()', 'corr()'], answer: 0, why: 'value_counts() counts how often each value appears, such as Good, Fair or Poor.'},
        {prompt: 'You want to find which cells in the table are empty.', options: ['head()', 'isnull()', 'mean()'], answer: 1, why: 'isnull() marks each empty cell as True, so you can find and count missing values.'},
        {prompt: 'Mileage and price have a correlation of -0.78. What does that mean?', options: ['No link', 'Both go up', 'One up, one down'], answer: 2, why: 'A negative value means one goes down as the other goes up. At -0.78 the link is strong: more miles, lower price.'},
        {prompt: 'Cars in Excellent condition sell for more. Is condition proven to cause it?', options: ['Linked, not proven', 'Yes, it is proven', 'No link at all'], answer: 0, why: 'A link is not proof of cause. Newer cars tend to be in better shape, so age could explain part of it.'},
        {prompt: 'Cars should date from 1990 on, but describe() shows a car from 1900.', options: ['A real vintage car', 'Likely entry error', 'Normal, ignore it'], answer: 1, why: 'The data should hold no car that old, so 1900 is likely a default or typo. Check it and fix or remove it.'}
      ]
    },
    {
      id: 'chart-match', order: 8,
      courseSlug: 'data-science-course-8', courseTitle: 'Data Visualization with Python',
      title: 'Chart Match',
      skill: 'Matching charts and chart parts to the story they tell',
      mechanic: 'match', prop: 'chart-folder',
      scene: 'Leaders meet tomorrow and want the sales story in pictures. You help the team pick the right charts.',
      takeaway: 'Pick the chart that fits the question, then label it so it makes sense without anyone explaining it.',
      rounds: [
        {prompt: 'Match each chart to the job it does best.', pairs: [['Line chart', 'Change over time'], ['Bar chart', 'Compare totals between groups'], ['Scatter plot', 'How two number columns relate'], ['Histogram', 'How one number column is spread'], ['Pie chart', 'Parts that add up to 100%']], why: 'The question picks the chart: time calls for a line, groups for bars, two numbers for dots, one spread for a histogram, parts of a whole for a pie.'},
        {prompt: 'Match each chart part to what it does.', pairs: [['Title', 'Says what the chart is about'], ['Axis label', 'Names the measure and its unit'], ['Legend', 'Explains each color or line'], ['Annotation', 'Points out one key spot']], why: 'Clear labels let a busy reader understand the chart alone. Placeholder text like "x" or "Series1" leaves them guessing.'},
        {prompt: 'Match each Python tool to what it is best at.', pairs: [['Matplotlib', 'Full control of any chart'], ['Seaborn', 'Styled statistical charts'], ['Folium', 'Interactive maps with markers'], ['DataFrame .plot()', 'Quick chart from a pandas table']], why: 'Matplotlib is the base and lets you tune every detail. Seaborn adds styled statistical charts, Folium draws maps, and pandas plots fast.'}
      ]
    },
    {
      id: 'model-sorter', order: 9,
      courseSlug: 'data-science-course-9', courseTitle: 'Machine Learning with Python',
      title: 'Model Sorter',
      skill: 'Telling classification, regression and clustering apart',
      mechanic: 'sort', prop: 'robot-head',
      scene: 'The team wants to train models, and you tag each request by the kind of model it needs.',
      takeaway: 'Classification picks a label, regression predicts a number, and clustering finds groups when there are no labels.',
      prompt: 'Which kind of machine learning fits this task?',
      bins: [{id: 'classify', label: 'Classification'}, {id: 'regress', label: 'Regression'}, {id: 'cluster', label: 'Clustering'}],
      items: [
        {label: 'Is this email spam or not?', answer: 'classify', why: 'The answer is one of two labels, spam or not spam. Picking a label is classification.'},
        {label: 'Will a loan be repaid? Yes or no', answer: 'classify', why: 'Yes or no is a label learned from past loans with known results, so this is classification.'},
        {label: 'Tag a photo as cat, dog or bird', answer: 'classify', why: 'Each photo gets one label from a fixed list. That makes it classification.'},
        {label: 'Predict next month\'s power bill', note: 'Answer is an amount in dollars', answer: 'regress', why: 'The answer is a number that can take many values. Predicting a number is regression.'},
        {label: 'Predict a home\'s sale price', answer: 'regress', why: 'A sale price is a number, not a label, so this is regression.'},
        {label: 'Estimate minutes until delivery', answer: 'regress', why: 'Minutes are a number on a scale. Predicting how many is regression.'},
        {label: 'Group shoppers by buying habits', note: 'No groups are named in advance', answer: 'cluster', why: 'There are no labels to learn from. The model finds groups of similar shoppers on its own, which is clustering.'},
        {label: 'Find groups among news stories', note: 'No topics are given', answer: 'cluster', why: 'With no topics given, the model groups stories by how alike they are. That is clustering.'},
        {label: 'Split stores into similar groups', note: 'Let the data decide the groups', answer: 'cluster', why: 'When the data decides the groups and nothing is labeled, the task is clustering.'}
      ]
    },
    {
      id: 'capstone-review', order: 10,
      courseSlug: 'data-science-course-10', courseTitle: 'Applied Data Science Capstone',
      title: 'Capstone Review',
      skill: 'Spotting what needs fixing before a project is shared',
      mechanic: 'gate', prop: 'clipboard',
      scene: 'Before the big project goes to leaders, each review finding lands on your desk for a call.',
      takeaway: 'Clean data, a model that fits the question and is judged fairly, and charts that explain themselves make a project you can trust.',
      prompt: 'Where is the problem: the data, the model or the chart?',
      actions: [{id: 'data', label: 'Fix the data'}, {id: 'model', label: 'Rework model'}, {id: 'chart', label: 'Fix the chart'}],
      items: [
        {title: 'Same city, three spellings', facts: ['"Lakeview", "Lake View" and "lakeview"', 'Counts split across three groups'], answer: 'data', why: 'One place spelled three ways splits its totals. Standardize the values in the data before you count.'},
        {title: 'Ages of -1 and 999', facts: ['Found in the patient age column', 'Data guide says they mean "unknown"'], answer: 'data', why: 'These are codes for missing values, not real ages. Mark them as missing before any math.'},
        {title: 'Same order listed twice', facts: ['Order 4471 appears in two rows', 'Sales total is too high'], answer: 'data', why: 'Duplicate rows count the same sale twice and inflate totals. Remove the repeats in the data before you add anything up.'},
        {title: '97% accurate, finds no fraud', facts: ['Only 3 in 100 cases are fraud', 'Model says "not fraud" every time', 'Team only looked at accuracy'], answer: 'model', why: 'Always guessing the common answer scores high but catches no fraud. Judge the model on how many fraud cases it finds, not on accuracy alone.'},
        {title: 'Great in training, poor on new data', facts: ['Training accuracy: 99%', 'Accuracy on unseen data: 70%'], answer: 'model', why: 'A big drop on new data means the model memorized the training rows. Simplify it or give it more data.'},
        {title: 'Price task, wrong model type', facts: ['Goal: predict a sale price in dollars', 'Team trained a classifier'], answer: 'model', why: 'A price is a number, so the task needs a regression model, not one that picks labels.'},
        {title: 'Axes say "x" and "y"', facts: ['Title reads "Figure 1"', 'Legend says "Series1"'], answer: 'chart', why: 'Placeholder labels tell the reader nothing. Add a real title, axis names with units and a clear legend.'},
        {title: 'Pie chart with 15 slices', facts: ['Most slices are thin slivers', 'Readers cannot compare them'], answer: 'chart', why: 'Thin slices are hard to compare. A sorted bar chart shows the same numbers much more clearly.'}
      ]
    }
  ]
};
