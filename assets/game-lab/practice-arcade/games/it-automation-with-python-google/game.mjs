export default {
  id: 'it-automation-with-python-google',
  title: 'Script Shift',
  tagline: 'Short practice breaks for IT pros who automate with Python.',
  role: 'You are an IT specialist at Cedar Ridge Systems, turning boring chores into small Python scripts.',
  program: 'IT Automation with Python',
  theme: {world: 'cloud', accent: '#3572a5', mood: 'dusk'},
  levels: [
    {
      id: 'name-check', order: 1,
      courseSlug: 'it-auto-course-1', courseTitle: 'Crash Course on Python',
      title: 'Name Check',
      skill: 'Checking usernames against a simple rule',
      mechanic: 'gate', prop: 'code-block',
      scene: 'Your script reads a list of new usernames. Decide which ones pass the naming rule.',
      takeaway: 'A script checks one rule at a time: length with len(), letters only with isalpha(), lowercase with islower(). A name must pass every rule.',
      prompt: 'Rule: 6 to 12 lowercase letters only. Does it pass?',
      actions: [{id: 'pass', label: 'Passes'}, {id: 'fail', label: 'Fails'}],
      items: [
        {title: 'mkeller', facts: ['len(name) is 7', 'All lowercase letters'], answer: 'pass', why: 'Seven lowercase letters is inside 6 to 12 and has no other characters, so every part of the rule is met.'},
        {title: 'dana_ortiz', facts: ['len(name) is 10', 'Contains an underscore'], answer: 'fail', why: 'Only letters are allowed. An underscore makes name.isalpha() return False, so the name fails.'},
        {title: 'samuelrivera', facts: ['len(name) is 12', 'All lowercase letters'], answer: 'pass', why: 'Twelve is the top of the allowed range, so it is still fine.'},
        {title: 'priya', facts: ['len(name) is 5', 'All lowercase letters'], answer: 'fail', why: 'The rule needs at least 6 characters. Five is too short, even though the letters are fine.'},
        {title: 'bellaross', facts: ['len(name) is 9', 'All lowercase letters'], answer: 'pass', why: 'Nine lowercase letters fits the length range and uses letters only.'},
        {title: 'Lenakim', facts: ['len(name) is 7', 'The first letter is a capital'], answer: 'fail', why: 'The rule asks for lowercase only. name.islower() returns False if even one letter is a capital.'},
        {title: 'nadiaoconnell', facts: ['len(name) is 13', 'All lowercase letters'], answer: 'fail', why: 'Thirteen is one more than the limit of 12. A name that is too long fails, even when the letters are fine.'},
        {title: 'omarhassan', facts: ['len(name) is 10', 'All lowercase letters'], answer: 'pass', why: 'Ten lowercase letters passes the length check, the letters check and the lowercase check.'}
      ]
    },
    {
      id: 'pick-the-call', order: 2,
      courseSlug: 'it-auto-course-2', courseTitle: 'Using Python to Interact with the Operating System',
      title: 'Pick the Call',
      skill: 'Matching a file or system chore to the right Python call',
      mechanic: 'lane', prop: 'gear',
      scene: 'You are writing a backup script for the log folder. Pick the right call for each chore.',
      takeaway: 'The os module works with files and folders. subprocess.run() runs other commands and can capture what they print.',
      questions: [
        {prompt: 'Join a folder and a file name with the right separator.', options: ['folder + file', 'os.path.join()', 'os.getcwd()'], answer: 1, why: 'os.path.join() puts the right separator between the parts for whatever system runs the script, so you never have to hard-code one.'},
        {prompt: 'Run the command df -h and capture what it prints.', options: ['os.listdir()', 'os.mkdir()', 'subprocess.run()'], answer: 2, why: 'subprocess.run() starts another program. With capture_output=True and text=True, the printed words come back in result.stdout.'},
        {prompt: 'Get the names of the files inside a folder.', options: ['os.listdir()', 'os.remove()', 'os.getcwd()'], answer: 0, why: 'os.listdir() returns a list of the names inside a folder. The other two delete a file or show the current folder.'},
        {prompt: 'Check that the backup folder exists before using it.', options: ['os.rename()', 'os.path.exists()', 'os.remove()'], answer: 1, why: 'os.path.exists() returns True or False. Asking first avoids a crash on a missing folder.'},
        {prompt: 'Find out which folder the script is running in.', options: ['os.path.join()', 'os.mkdir()', 'os.getcwd()'], answer: 2, why: 'getcwd means get current working directory. It returns the folder your script is working in right now.'},
        {prompt: 'Delete one old log file.', options: ['os.remove()', 'os.rmdir()', 'os.mkdir()'], answer: 0, why: 'os.remove() deletes a single file. os.rmdir() only removes empty folders, and os.mkdir() makes new ones.'},
        {prompt: 'Make a new folder for tonight\'s backup.', options: ['os.rmdir()', 'os.mkdir()', 'os.remove()'], answer: 1, why: 'os.mkdir() creates a folder. The other two take things away instead.'}
      ]
    },
    {
      id: 'branch-and-share', order: 3,
      courseSlug: 'it-auto-course-3', courseTitle: 'Introduction to Git and GitHub',
      title: 'Branch and Share',
      skill: 'Putting a safe Git workflow in order',
      mechanic: 'order', prop: 'clipboard',
      scene: 'Five teammates edit the same scripts. You need a routine that keeps changes from colliding.',
      takeaway: 'Work on your own branch, commit small steps, pull before you push, and let a teammate review through a pull request before the merge.',
      rounds: [
        {prompt: 'You are on your own branch. Share a script change in order.', steps: ['Edit the script and save it', 'Stage the change with git add', 'Save a snapshot with git commit', 'Push the branch to GitHub'], why: 'Git only commits what you staged, and only pushes what you committed. Each step needs the one before it.'},
        {prompt: 'Your push is rejected. A teammate changed the same lines you did.', steps: ['Pull the new commits from GitHub', 'Open the file Git marked as a clash', 'Choose which lines to keep', 'Stage and commit the fixed file', 'Push your branch again'], why: 'You must pull to see the clash, fix it, and commit the fix before a push can go through.'},
        {prompt: 'Get a teammate to check your work before it joins main.', steps: ['Push your branch to GitHub', 'Open a pull request', 'A teammate reviews the changes', 'Fix what the reviewer points out', 'Merge the pull request'], why: 'A pull request needs a pushed branch. Review comes before fixes, and the merge comes last, once the reviewer is happy.'}
      ]
    },
    {
      id: 'first-move', order: 4,
      courseSlug: 'it-auto-course-4', courseTitle: 'Troubleshooting and Debugging Techniques',
      title: 'First Move',
      skill: 'Choosing the best next step when a script misbehaves',
      mechanic: 'gate', prop: 'ticket',
      scene: 'Your nightly script broke and the on-call phone is ringing. Pick your next move for each case.',
      takeaway: 'If nothing in the code changed, suspect the input. If a failure leaves no clues, add logging. If it is slow, profile it before guessing.',
      prompt: 'Best next move? (Profile = measure where time goes)',
      actions: [{id: 'input', label: 'Check the input'}, {id: 'log', label: 'Add logging'}, {id: 'profile', label: 'Profile it'}],
      items: [
        {title: 'KeyError on customer_id', facts: ['Worked for three months', 'Code and Python did not change'], answer: 'input', why: 'When the code is the same, the data is the likely cause. A missing key often means the file now has different columns.'},
        {title: 'Fails once a week at random', facts: ['You cannot make it fail on demand', 'The log only says "failed"'], answer: 'log', why: 'A rare failure needs more clues. Log the inputs and key values at each step so the next failure explains itself.'},
        {title: 'Cleanup job takes four hours', facts: ['The results are correct', 'You need to find the slowest function'], answer: 'profile', why: 'A profiler such as cProfile measures where the time goes. That beats guessing which part to speed up.'},
        {title: 'IndexError: list index out of range', facts: ['Script reads a CSV export', 'The vendor changed the export today'], answer: 'input', why: 'The export changed, so a row may now have fewer fields than the script expects. Look at the new file first.'},
        {title: 'Crash only on the server', facts: ['Same input file runs fine on your laptop', 'Server message says only "Error"'], answer: 'log', why: 'The input is the same, so the cause is hidden in the server run. Log each step there to see how it differs from your laptop.'},
        {title: 'Script stops halfway, no error', facts: ['Nothing prints after step two', 'No traceback in the output'], answer: 'log', why: 'With no error message you have no clue where it stopped. Log messages at each step will show the last one reached.'},
        {title: 'New version is twice as slow', facts: ['Only one function was rewritten', 'You want proof of where time goes'], answer: 'profile', why: 'Profile both versions and compare. The report shows whether the rewritten function is really where the extra time went.'}
      ]
    },
    {
      id: 'same-every-time', order: 5,
      courseSlug: 'it-auto-course-5', courseTitle: 'Configuration Management and the Cloud',
      title: 'Same Every Time',
      skill: 'Connecting configuration management terms to their meaning',
      mechanic: 'match', prop: 'cloud-node',
      scene: 'Fifty new servers need the same setup. A config tool can do it, if you know its words.',
      takeaway: 'You describe how servers should look. The tool makes them match, fixes drift, and is safe to run again and again.',
      rounds: [
        {prompt: 'Match each idea to what it means.', pairs: [['Idempotent', 'Running twice gives the same result'], ['Desired state', 'How the server should look'], ['Drift', 'When a server stops matching the plan'], ['Playbook', 'An Ansible file listing tasks to run']], why: 'The tool compares each server to the desired state. Drift gets corrected, and an idempotent run changes nothing that is already right.'},
        {prompt: 'Match each term to its meaning.', pairs: [['Config management', 'Keeps servers matching over time'], ['Cloud instance', 'A virtual server rented from a provider'], ['Provisioning', 'Creating a new server to use'], ['Package', 'A bundle of software to install'], ['Inventory', 'The list of servers to manage']], why: 'You rent cloud instances, provision them, list them in an inventory, and install packages. Config management keeps them all set up alike.'}
      ]
    },
    {
      id: 'keep-it-safe', order: 6,
      courseSlug: 'it-auto-course-6', courseTitle: 'Automating Real-World Tasks with Python',
      title: 'Keep It Safe',
      skill: 'Deciding where each piece of a monitoring script belongs',
      mechanic: 'sort', prop: 'envelope',
      scene: 'Your site-monitor script checks the website every five minutes and emails you when it is down.',
      takeaway: 'Keep secrets out of your code in environment variables, put the logic in code, and write each check result to a log with a time.',
      prompt: 'Where does this piece belong?',
      bins: [{id: 'code', label: 'In the code'}, {id: 'env', label: 'Env variable'}, {id: 'log', label: 'CSV log file'}],
      items: [
        {label: 'Key for the alert service API', answer: 'env', why: 'A key typed into the script travels with every copy of it. Keep it in an environment variable, a setting outside your code, read with os.environ.'},
        {label: 'Function that sends the email', answer: 'code', why: 'This is the script\'s logic. It belongs in the code, where it can be reviewed and shared safely.'},
        {label: 'Status code at 09:05', note: 'One line per check', answer: 'log', why: 'Each check result is data the script produces. Write it to the CSV with a time so you can look back later.'},
        {label: 'Password for the email account', answer: 'env', why: 'Passwords never go in source files, since the file may be shared or committed. Read it from the environment.'},
        {label: 'The loop that waits five minutes', answer: 'code', why: 'Repeating a check on a schedule is logic, so it lives in the code.'},
        {label: 'How long the page took to load', note: 'Measured on each check', answer: 'log', why: 'A load time is a result from a check. Record it in the CSV so you can spot slow days.'},
        {label: 'Address of the mail server', note: 'Changes between test and live', answer: 'env', why: 'A setting that differs between test and live belongs outside the code, so the same script runs in both places without edits.'},
        {label: 'Rule: one alert per outage', answer: 'code', why: 'Deciding when to email is logic. Tracking whether the site is already down keeps you from sending the same alert again.'},
        {label: 'Whether the site was up at 09:10', note: 'Result of one check', answer: 'log', why: 'Up or down is a result of one check. It belongs in the log, next to the time it was checked.'}
      ]
    }
  ]
};
