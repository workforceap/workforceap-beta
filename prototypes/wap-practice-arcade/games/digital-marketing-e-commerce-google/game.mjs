export default {
  id: 'digital-marketing-e-commerce-google',
  title: 'Shop Launch',
  tagline: 'Quick practice breaks for new digital marketing and online shop teams.',
  role: 'You are the marketing assistant at Willow & Pine Goods, a small online shop for home and outdoor gear.',
  program: 'Digital Marketing & E-Commerce Professional Certificate (Google)',
  theme: {world: 'studio', accent: '#d1552f', mood: 'day'},
  levels: [
    {
      id: 'where-is-the-shopper', order: 1,
      courseSlug: 'marketing-course-1', courseTitle: 'Foundations of Digital Marketing and E-commerce',
      title: 'Where Is the Shopper?',
      skill: 'Spotting which stage of the marketing funnel a shopper is in',
      mechanic: 'gate', prop: 'shopping-bag',
      scene: 'Willow & Pine is new online. You map where each shopper is on the way to a sale.',
      takeaway: 'Shoppers move from hearing about you, to comparing choices, to buying. Match your message to the stage they are in.',
      prompt: 'Which funnel stage (hearing about the shop to buying) is this shopper in?',
      actions: [{id: 'aware', label: 'Awareness'}, {id: 'consider', label: 'Consideration'}, {id: 'buy', label: 'Purchase'}],
      items: [
        {title: 'Maya sees a video from the shop', facts: ['She has never heard of the shop', 'She was not looking to buy anything'], answer: 'aware', why: 'She is just meeting the brand. Awareness is the first stage, when people learn you exist.'},
        {title: 'Leo reads reviews for two lamps', facts: ['He is comparing two different shops', 'He is checking prices and return rules'], answer: 'consider', why: 'He knows what he wants and is weighing his options. That is consideration, so clear details and reviews help most.'},
        {title: 'Ana is on the payment page', facts: ['A blue mug is in her cart', 'She is typing in her card details'], answer: 'buy', why: 'She has decided and is finishing the order. The goal now is a smooth, simple checkout.'},
        {title: 'Kim hears about the shop from a friend', facts: ['It is the first time she hears the name', 'She has not visited the site yet'], answer: 'aware', why: 'She has only just learned the shop exists. She has not started comparing anything yet.'},
        {title: 'Jo reads the size guide for a jacket', facts: ['She wants a rain jacket from this shop', 'She is checking sizes and delivery times'], answer: 'consider', why: 'She likes the product but needs a few answers first. Giving them is how you move a shopper from consideration to purchase.'},
        {title: 'Lee taps Buy now on a tent', facts: ['Size and color are already chosen', 'He has seen the price and shipping cost'], answer: 'buy', why: 'Every choice is made and he is acting on it. This is the purchase stage.'},
        {title: 'Sam saves a tent to his wish list', facts: ['He is not ready to buy yet', 'He wants to compare it with one more tent'], answer: 'consider', why: 'Saving an item to look at later shows interest, but he is still weighing options. That is consideration.'}
      ]
    },
    {
      id: 'get-found', order: 2,
      courseSlug: 'marketing-course-2', courseTitle: 'Attract and Engage Customers with Digital Marketing',
      title: 'Get Found',
      skill: 'Connecting search and content words to what they mean',
      mechanic: 'match', prop: 'wireframe-card',
      scene: 'The shop blog is live but few people find it. You learn the words behind getting found.',
      takeaway: 'People find you through the words they search for. Good titles, helpful pages and a steady brand voice bring the right visitors.',
      rounds: [
        {prompt: 'Match each search term to its meaning.', pairs: [['Keyword', 'Words people type into a search'], ['Page title', 'Title shown on the search results page'], ['Backlink', 'A link to your shop from another site'], ['Bounce', 'A visit that leaves after one page'], ['Landing page', 'The first page a visitor opens']], why: 'Keywords and page titles help searchers find you. Backlinks show trust, the landing page is the first stop, and a bounce means the visitor left right away.'},
        {prompt: 'Match each content term to its meaning.', pairs: [['Brand voice', 'How your writing sounds every time'], ['Call to action', 'A prompt telling readers what to do next'], ['SEO', 'Making pages easier to find in search'], ['Organic result', 'A result you did not pay to place'], ['Search ad', 'A result a business pays to show']], why: 'SEO earns organic results without paying per click, while a search ad is paid placement. Brand voice keeps you consistent; a call to action points to the next step.'}
      ]
    },
    {
      id: 'comment-desk', order: 3,
      courseSlug: 'marketing-course-3', courseTitle: 'From Likes to Leads: Interact with Customers Online',
      title: 'Comment Desk',
      skill: 'Choosing how to respond to public social media comments',
      mechanic: 'gate', prop: 'megaphone',
      scene: 'Comments are piling up on the shop page. You decide what to do with each one.',
      takeaway: 'Answer simple questions in public. Say sorry in public, then move private details to DMs. Report spam.',
      prompt: 'How should you handle this comment?',
      actions: [{id: 'here', label: 'Answer here'}, {id: 'dm', label: 'Move to DM'}, {id: 'spam', label: 'Report spam'}],
      items: [
        {title: '"Do you ship to Canada?"', facts: ['Other shoppers may wonder the same', 'No personal details in the comment'], answer: 'here', why: 'A public answer helps everyone who has the same question. Nothing private is needed to reply.'},
        {title: '"My parcel arrived crushed"', facts: ['The customer sounds upset', 'To fix it you need their order number'], answer: 'dm', why: 'A short public sorry shows you care. Order details are private, so move the rest to a direct message.'},
        {title: '"Win a free phone! Click here"', facts: ['The link goes to an unknown site', 'The same text was posted on many pages'], answer: 'spam', why: 'This is a scam post that has nothing to do with your shop. Report and remove it rather than replying.'},
        {title: '"Is the green scarf wool?"', facts: ['A simple question about a product', 'The answer is on your product page'], answer: 'here', why: 'It is a quick question anyone can see the answer to. Reply in public and point to the product page.'},
        {title: '"Can I change my delivery address?"', facts: ['Calm question, no complaint', 'You need their order number and new address'], answer: 'dm', why: 'Addresses and order numbers are private. Reply briefly in public, then finish the change in a direct message.'},
        {title: '"Love my new bottle!"', facts: ['A happy customer left praise', 'No question and no problem to solve'], answer: 'here', why: 'A friendly public thank you builds community and takes seconds. No private step is needed.'},
        {title: '"Cheap followers, 1000 for $5"', facts: ['Posted by an account with no profile photo', 'It asks people to message them'], answer: 'spam', why: 'It is an advert for a service, not a real comment from a customer. Report it so it does not mislead others.'}
      ]
    },
    {
      id: 'inbox-levers', order: 4,
      courseSlug: 'marketing-course-4', courseTitle: 'Think Outside the Inbox: Email Marketing',
      title: 'Inbox Levers',
      skill: 'Telling what email changes affect: opens, clicks or audience',
      mechanic: 'sort', prop: 'envelope',
      scene: 'The spring sale email goes out Friday. You decide which part of the email each change works on.',
      takeaway: 'Subject lines and sender names decide who opens. Buttons and links decide who clicks. Segments decide who gets which message.',
      prompt: 'What does this change work on?',
      bins: [{id: 'open', label: 'Opening'}, {id: 'click', label: 'Clicking'}, {id: 'who', label: 'Who gets it'}],
      items: [
        {label: 'Rewrite the subject line', answer: 'open', why: 'The subject line is what people read in the inbox before deciding to open the email.'},
        {label: 'Send only to tea buyers', note: 'A tea offer goes to past tea customers', answer: 'who', why: 'Picking the group that receives the message is segmenting. People who already like tea find the offer more relevant.'},
        {label: 'Button says "Get my code"', answer: 'click', why: 'Button words only matter after the email is open, where they decide whether people tap.'},
        {label: 'Add short preview text', note: 'The short line shown after the subject', answer: 'open', why: 'Preview text shows beside the subject in the inbox, so it adds a reason to open.'},
        {label: 'Make the product photo tappable', answer: 'click', why: 'A photo that links to the product page gives readers one more easy way to click through.'},
        {label: 'Use a real person as sender name', answer: 'open', why: 'The sender name shows in the inbox beside the subject, so it helps people decide to open.'},
        {label: 'Welcome email to new sign-ups', note: 'Older subscribers do not get it', answer: 'who', why: 'New sign-ups are a different group from long-time customers. Sending each their own message is segmenting.'},
        {label: 'Show one clear link to the sale', answer: 'click', why: 'One obvious link makes the next step easy, so more readers tap instead of getting lost.'}
      ]
    },
    {
      id: 'test-and-track', order: 5,
      courseSlug: 'marketing-course-5', courseTitle: 'Assess for Success: Marketing Analytics and Measurement',
      title: 'Test and Track',
      skill: 'Putting a fair test and a campaign check in the right order',
      mechanic: 'order', prop: 'chart-folder',
      scene: 'The owner asks which headline and which ad really sell more. You plan a fair way to find out.',
      takeaway: 'Test one change at a time, give it enough visitors, and judge results by what they cost per order, not just clicks.',
      rounds: [
        {prompt: 'Run an A/B test on a shop page. Put the steps in order.', steps: ['Pick one change, like a headline', 'Build version A and version B', 'Split visitors evenly between A and B', 'Wait until enough people see both', 'Compare and keep the better one'], why: 'Change only one thing so you know what caused the difference. Wait for enough visitors, because a small early lead can be luck.'},
        {prompt: 'Measure a new ad campaign. Put the steps in order.', steps: ['Write the ad and choose its link', 'Add tracking tags to that link', 'Launch the campaign', 'Compare cost per order by channel', 'Move budget to the best channel'], why: 'You can only tag a link once it exists, and you must tag it before launch or the clicks cannot be traced. Compare costs once results arrive, then shift your budget.'}
      ]
    },
    {
      id: 'cart-rescue', order: 6,
      courseSlug: 'marketing-course-6', courseTitle: 'Make the Sale: Build, Launch, and Manage E-commerce Stores',
      title: 'Cart Rescue',
      skill: 'Picking simple fixes that help shoppers finish an order',
      mechanic: 'lane', prop: 'barcode-box',
      scene: 'Shoppers fill their carts but many leave without buying. You steer toward the fix that helps.',
      takeaway: 'Make buying easy: ask only for what you need, show clear photos and prices, and remind shoppers who left items behind.',
      questions: [
        {prompt: 'Shoppers quit a checkout with ten form boxes. What helps?', options: ['Add more boxes', 'Ask for less info', 'Add a pop-up'], answer: 1, why: 'Every extra box adds effort. Ask only for what you need to ship and take payment.'},
        {prompt: 'A shopper left items in the cart. What can bring them back?', options: ['Reminder email', 'Bigger banner ad', 'New logo color'], answer: 0, why: 'These shoppers already chose items. A friendly reminder email is a direct way to bring them back to finish.'},
        {prompt: 'What helps a shopper judge a sweater they cannot touch?', options: ['Company history', 'Sale banner', 'Clear photos'], answer: 2, why: 'Online, photos stand in for holding the item. Clear pictures from several sides build confidence to buy.'},
        {prompt: 'A tote bag gets many views but few sales. What do you check first?', options: ['Double the ad spend', 'Delete the listing', 'Price and photos'], answer: 2, why: 'People are interested but something stops them. Check the page details first, before spending more or giving up.'},
        {prompt: 'You want to know which products sell best. Where do you look?', options: ['Store sales report', 'Email draft', 'Theme settings'], answer: 0, why: 'The store sales report counts orders for each product. It shows what sells without guessing.'},
        {prompt: 'A shopper wants to buy but has no account. What do you offer?', options: ['Require sign-up', 'Guest checkout', 'Remove the cart'], answer: 1, why: 'Guest checkout lets people buy without signing up first. Forcing an account adds a step that can make shoppers give up.'},
        {prompt: 'Shoppers ask if a mug is in stock. What do you check?', options: ['Inventory count', 'Order emails', 'Shipping rates'], answer: 0, why: 'The inventory count tracks how many items are in stock. Keeping it right stops orders for things you cannot ship.'}
      ]
    },
    {
      id: 'fans-or-critics', order: 7,
      courseSlug: 'marketing-course-7', courseTitle: 'Satisfaction Guaranteed: Develop Customer Loyalty Online',
      title: 'Fans or Critics',
      skill: 'Reading customer survey scores to keep buyers coming back',
      mechanic: 'sort', prop: 'sticky-note',
      scene: 'Buyers just answered how likely they are to recommend Willow & Pine. You group the scores.',
      takeaway: 'Scores of 9-10 are promoters, 7-8 passives, and 0-6 detractors. Thank promoters, ask them to refer friends, and fix what upset the others.',
      prompt: 'Scores run 0 to 10. Promoter, passive or detractor?',
      bins: [{id: 'promoter', label: 'Promoter'}, {id: 'passive', label: 'Passive'}, {id: 'detractor', label: 'Detractor'}],
      items: [
        {label: 'Score 10: told two friends', answer: 'promoter', why: 'A 10 is a promoter. These happy customers spread the word, so ask them for a review or a referral.'},
        {label: 'Score 8: fine, nothing special', answer: 'passive', why: 'A 7 or 8 is a passive. They are satisfied but not excited, and a rival could win them over.'},
        {label: 'Score 3: item broke in a week', answer: 'detractor', why: 'Any score from 0 to 6 is a detractor. Reach out, solve the problem and learn what went wrong.'},
        {label: 'Score 9: will order again', answer: 'promoter', why: 'A 9 counts as a promoter, just like a 10. Keep happy repeat buyers engaged and invite them to refer friends.'},
        {label: 'Score 6: package came late', answer: 'detractor', why: 'A 6 is the top of the detractor range. Even a mild score signals a problem worth fixing.'},
        {label: 'Score 7: okay, but slow delivery', answer: 'passive', why: 'A 7 is passive. They would not complain loudly, but faster delivery could turn them into fans.'},
        {label: 'Score 0: never buying again', answer: 'detractor', why: 'A 0 is the lowest score and a clear detractor. A prompt, caring reply may still keep the relationship.'},
        {label: 'Score 9: sent a friend a link', answer: 'promoter', why: 'A 9 is a promoter. A shared link is word of mouth, so thank them and ask for a review.'}
      ]
    }
  ]
};
