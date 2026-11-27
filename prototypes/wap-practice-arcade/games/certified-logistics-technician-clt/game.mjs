export default {
  id: 'certified-logistics-technician-clt',
  title: 'Dock Boss',
  tagline: 'Short practice breaks for logistics techs on a busy dock.',
  role: 'You are a logistics technician at Harbor Point Distribution, keeping goods moving safely across the dock.',
  program: 'Certified Logistics Technician (CLT)',
  theme: {world: 'warehouse', accent: '#c8641b', mood: 'day'},
  levels: [
    {
      id: 'dock-to-door', order: 1,
      courseSlug: 'clt-course-1', courseTitle: 'Introduction to Supply Chain Management',
      title: 'Dock to Door',
      skill: 'Following goods through the steps of a distribution center',
      mechanic: 'sort', prop: 'crate',
      scene: 'A truck backs in at Harbor Point, and you tell the crew which warehouse step each job belongs to, door to road.',
      takeaway: 'Inside a warehouse, goods are received, stored, picked for an order, then shipped. Each step is one link in the bigger supply chain.',
      prompt: 'Which warehouse step is this task?',
      bins: [
        {id: 'receiving', label: 'Receiving'},
        {id: 'storage', label: 'Storage'},
        {id: 'picking', label: 'Picking'},
        {id: 'shipping', label: 'Shipping'}
      ],
      items: [
        {label: 'Load the outbound truck', answer: 'shipping', why: 'Loading goods onto a truck that leaves the building is the shipping stage.'},
        {label: 'Match delivery to the packing list', answer: 'receiving', why: 'Checking what arrived against the paperwork happens at receiving, before the goods are accepted.'},
        {label: 'Collect items for a customer order', answer: 'picking', why: 'Picking means gathering the items on one customer order from their storage spots.'},
        {label: 'Put a pallet in its rack slot', answer: 'storage', why: 'Placing goods in a planned spot until they are needed is storage.'},
        {label: 'Wrap an order, add ship label', answer: 'shipping', why: 'Wrapping and labeling a finished customer order gets it ready to leave. That is the shipping stage.'},
        {label: 'Unload and inspect for damage', answer: 'receiving', why: 'Damage must be spotted and noted when goods arrive, so this is receiving.'},
        {label: 'Scan each item as you pick it', answer: 'picking', why: 'Scanning during the pick confirms the right item went into the right order.'},
        {label: 'Keep heavy pallets on low shelves', answer: 'storage', why: 'Where and how goods are kept is a storage choice. Heavy pallets sit low so they are safe to reach.'}
      ]
    },
    {
      id: 'count-what-counts', order: 2,
      courseSlug: 'clt-course-2', courseTitle: 'Inventory Management and Control',
      title: 'Count What Counts',
      skill: 'Sorting stock items into ABC classes by yearly value',
      mechanic: 'gate', prop: 'barcode-box',
      scene: 'The inventory lead hands you a list of parts and asks how closely each one needs to be watched.',
      takeaway: 'Use ABC analysis. A few A items carry most of the value, so count and watch them closely. Many C items carry little value and need light control.',
      prompt: 'ABC class: A = most yearly value, C = least. Which one?',
      actions: [
        {id: 'a', label: 'A: count often'},
        {id: 'b', label: 'B: count some'},
        {id: 'c', label: 'C: count rarely'}
      ],
      items: [
        {title: 'Packing tape rolls', facts: ['Costs very little each', 'Tiny share of yearly stock value'], answer: 'c', why: 'Low value items are C items. A simple reorder rule and rare counts are enough.'},
        {title: 'Conveyor drive units', facts: ['Ranks 2nd of 400 items by yearly value', 'Few units, but each costs a lot'], answer: 'a', why: 'A few items that carry the most value are A items. Count them often and watch their reorder points.'},
        {title: 'Standard bearings', facts: ['Mid-range cost per unit', 'In the middle of the list by yearly value'], answer: 'b', why: 'Items between the top group and the long tail are B items. They get a moderate level of control.'},
        {title: 'Work gloves', facts: ['Cheap, bought by the case', 'Near the bottom by yearly value'], answer: 'c', why: 'Cheap items near the bottom of the list are C items. Too much effort here wastes time better spent on A items.'},
        {title: 'Hydraulic pumps', facts: ['Sits in the top group by yearly value', 'Each pump costs a lot, sells steadily'], answer: 'a', why: 'Items in the small group that makes most of the value are A items, so they earn the closest control.'},
        {title: 'Fastener kits', facts: ['Moderate yearly value', 'Neither a top item nor a bottom item'], answer: 'b', why: 'Moderate value, neither top nor bottom, makes this a B item with moderate counting and review.'},
        {title: 'Pallet wrap film', facts: ['Bought by the case, used everywhere', 'One of hundreds of items near the bottom'], answer: 'c', why: 'Items near the bottom of the value list are C items. Count them least often.'}
      ]
    },
    {
      id: 'pick-your-ride', order: 3,
      courseSlug: 'clt-course-3', courseTitle: 'Transportation and Distribution',
      title: 'Pick Your Ride',
      skill: 'Matching a shipment to the right transport mode',
      mechanic: 'lane', prop: 'pallet',
      scene: 'The shipping desk needs a ride for each load, and a way to check how full the trucks are.',
      takeaway: 'Each mode has a job. Ocean and rail are slow but cheap for heavy loads, air is fast, and trucks reach the door. Fit the mode to the load and the deadline.',
      questions: [
        {prompt: 'Heavy machines go overseas. Cost matters more than speed.', options: ['Ocean freight', 'Air freight', 'Local courier'], answer: 0, why: 'Ocean freight is slow but costs the least for heavy loads going overseas.'},
        {prompt: 'A small, urgent part must cross an ocean in two days.', options: ['Ocean freight', 'Truck', 'Air freight'], answer: 2, why: 'Air freight is the fast choice for small, urgent loads, even though it costs more.'},
        {prompt: 'One customer gets a load that fills a whole trailer. (LTL = shares a trailer.)', options: ['LTL', 'Full truckload', 'Parcel carrier'], answer: 1, why: 'When freight fills the whole trailer, a full truckload is the simple choice.'},
        {prompt: 'A few pallets share a trailer with other shippers\' freight.', options: ['Full truckload', 'Parcel carrier', 'LTL'], answer: 2, why: 'LTL means less than truckload. Several shippers share one trailer and split the cost.'},
        {prompt: 'Bulk grain goes far inland. It is heavy and not urgent.', options: ['Rail', 'Air freight', 'Parcel carrier'], answer: 0, why: 'Rail moves heavy bulk loads over long distances at a low cost per ton.'},
        {prompt: 'One small box goes to a customer\'s home.', options: ['Ocean freight', 'Parcel carrier', 'Rail'], answer: 1, why: 'Parcel carriers are built for small boxes delivered to many different addresses.'},
        {prompt: 'Trucks leave half empty. Which measure shows this?', options: ['On-time rate', 'Damage rate', 'Trailer fill rate'], answer: 2, why: 'Trailer fill rate is the share of space actually used. A low rate means you pay for empty space.'}
      ]
    },
    {
      id: 'safe-moves-in-order', order: 4,
      courseSlug: 'clt-course-4', courseTitle: 'Warehouse Operations',
      title: 'Safe Moves in Order',
      skill: 'Putting picking, forklift and put-away steps in order',
      mechanic: 'order', prop: 'clipboard',
      scene: 'It is mid-shift on the floor. Three jobs need doing, and each one has to be done in the right order.',
      takeaway: 'Warehouse work runs on routines. Scan to confirm, check equipment before you use it, and keep loads low when you drive.',
      rounds: [
        {prompt: 'Put the steps of a scanner-guided pick in order.', steps: ['Load the pick list on your scanner', 'Walk to the first pick location', 'Scan the location label', 'Take the item and scan it', 'Place it in the cart and confirm'], why: 'The list tells you where to go. Scanning the location and then the item proves the right item was picked before you confirm.'},
        {prompt: 'You are a trained forklift driver. Put the pickup steps in order.', steps: ['Inspect the forklift before the shift', 'Buckle the seat belt', 'Slide the forks fully under the load', 'Lift slightly, then tilt the mast back', 'Drive with the load kept low'], why: 'Check the truck, buckle up, get the forks under, lift just clear, tilt back, drive low. Only drive a forklift if trained and authorized.'},
        {prompt: 'Put away a pallet that just arrived. Put the steps in order.', steps: ['Check the pallet against the paperwork', 'Scan the pallet to get its location', 'Drive it to that location', 'Set it in the slot and scan to confirm'], why: 'Confirm what the pallet is first, then let the system assign a spot. The put-away is only finished when the pallet is in the slot and the scan confirms it.'}
      ]
    },
    {
      id: 'buyer-basics', order: 5,
      courseSlug: 'clt-course-5', courseTitle: 'Procurement and Vendor Management',
      title: 'Buyer Basics',
      skill: 'Connecting buying terms to what they mean',
      mechanic: 'match', prop: 'folder',
      scene: 'The buyer is out sick. You cover the desk and need to understand every term on the supplier paperwork.',
      takeaway: 'Good buying looks past the lowest price. Track supplier results, keep a backup source, and count the full cost of a late or poor delivery.',
      rounds: [
        {prompt: 'Match each buying term to its meaning.', pairs: [['Purchase order', 'Buyer\'s order naming items and quantity'], ['Quote', 'Supplier\'s price offer before an order'], ['Lead time', 'Time from placing an order to delivery'], ['Vendor scorecard', 'Report card on a supplier\'s results'], ['Single source', 'Relying on only one supplier']], why: 'A quote comes first, then a purchase order. Lead time and the scorecard measure the supplier, and relying on a single source is a risk to manage with a backup.'},
        {prompt: 'Match each supplier term to its meaning.', pairs: [['Second source', 'A backup supplier for the same part'], ['On-time rate', 'Share of orders that arrive on time'], ['Quality rating', 'Share of goods that pass inspection'], ['Total cost', 'Price plus freight, delays and risk'], ['Net 30', 'Pay the bill within 30 days']], why: 'Scorecards track on-time and quality results. Total cost shows the real price, and a second source protects you if one supplier fails.'}
      ]
    },
    {
      id: 'check-before-you-post', order: 6,
      courseSlug: 'clt-course-6', courseTitle: 'Supply Chain Technology and SAP',
      title: 'Check Before You Save',
      skill: 'Deciding what to do when entering data in an ERP system',
      mechanic: 'gate', prop: 'clipboard',
      scene: 'You are at the receiving desk entering deliveries into SAP. Every record you save feeds inventory, buying and finance.',
      takeaway: 'SAP shares each record with many teams. If something does not match, check before you save. If it is already saved, report it.',
      prompt: 'What is the right next step for this record?',
      actions: [
        {id: 'post', label: 'Save it'},
        {id: 'check', label: 'Check first'},
        {id: 'report', label: 'Report it'}
      ],
      items: [
        {title: 'Delivery of bolts', facts: ['Packing list says 50 boxes', 'You counted 50 and typed 50', 'The purchase order also says 50'], answer: 'post', why: 'The count, the paperwork and the entry all agree, so the record is safe to save.'},
        {title: 'Vendor number is off', facts: ['Invoice shows Northbay Metals', 'Your vendor number belongs to a different name'], answer: 'check', why: 'A number and name that do not match could send the order or payment to the wrong supplier. Stop and confirm which is right before saving.'},
        {title: 'Two records, one supplier', facts: ['Same company appears under two vendor numbers', 'Both are already saved in the system', 'You do not manage vendor records'], answer: 'report', why: 'Duplicate vendors can cause double payments. The vendor data team owns those records, so tell them rather than deleting one yourself.'},
        {title: 'Typo on the screen', facts: ['You typed 500 units', 'The boxes you counted total 50', 'You have not saved yet'], answer: 'check', why: 'Re-read your count and fix the entry before saving. A saved wrong quantity would show units that do not exist.'},
        {title: 'Late delivery, all correct', facts: ['Truck came two days after the due date', 'Count, paperwork and entry all match'], answer: 'post', why: 'Being late does not make the record wrong. Save what you really received. The buyer can follow up on the late truck.'},
        {title: 'Same delivery posted twice', facts: ['Delivery note 7731 appears two times', 'The earlier shift saved both entries'], answer: 'report', why: 'A double receipt makes stock look higher than it is. Tell your supervisor so it can be reversed the proper way.'},
        {title: 'Part number not on the order', facts: ['Box label shows P-4410', 'The purchase order lists P-4401', 'You have not saved yet'], answer: 'check', why: 'One digit may be a typo, or the supplier may have sent the wrong part. Check the box and the order before you save.'}
      ]
    },
    {
      id: 'customs-ready', order: 7,
      courseSlug: 'clt-course-7', courseTitle: 'Global Supply Chain and Trade',
      title: 'Customs Ready',
      skill: 'Knowing the basic papers and terms of importing',
      mechanic: 'lane', prop: 'envelope',
      scene: 'A first container from overseas is due at the port. You get the paperwork ready so customs does not hold it.',
      takeaway: 'Customs delays often start with work left too late. Classify the product, know who carries the risk, and check license needs before you order.',
      questions: [
        {prompt: 'Customs needs a code that classifies each product for duty.', options: ['HTS code', 'Lot number', 'PO number'], answer: 0, why: 'A Harmonized Tariff Schedule code classifies the product, and that sets the duty rate and rules.'},
        {prompt: 'Under FOB, goods are loaded on the ship. Who now carries the risk?', options: ['Seller', 'Buyer', 'Port'], answer: 1, why: 'With FOB, risk passes to the buyer once the goods are on board the ship.'},
        {prompt: 'A container sits at the port past its free days. What fee grows?', options: ['Duty', 'Insurance', 'Demurrage'], answer: 2, why: 'Demurrage is the charge for leaving a container at the port too long. Quick clearance avoids it.'},
        {prompt: 'Which paper shows the sale value of the goods for customs?', options: ['Packing list', 'Commercial invoice', 'Dock schedule'], answer: 1, why: 'The commercial invoice states what was sold and for how much. Customs uses it to work out duty.'},
        {prompt: 'When should you check if a product needs an import license?', options: ['After it ships', 'At the port', 'Before you order'], answer: 2, why: 'Licenses can take weeks, so check before the order. Finding out later can leave goods stuck at the port.'},
        {prompt: 'Which paper is the carrier\'s signed receipt for the goods?', options: ['Bill of lading', 'Purchase order', 'Count sheet'], answer: 0, why: 'The carrier signs a bill of lading to show it took the goods. It also works as the contract to carry them.'},
        {prompt: 'Who files customs entries on an importer\'s behalf?', options: ['Truck driver', 'Customs broker', 'Insurance agent'], answer: 1, why: 'A customs broker is a licensed expert who prepares and files the entry for the importer.'}
      ]
    },
    {
      id: 'dock-boss-review', order: 8,
      courseSlug: 'clt-course-8', courseTitle: 'CLT Certification Preparation',
      title: 'Dock Boss Review',
      skill: 'Reviewing key ideas from the whole logistics program',
      mechanic: 'match', prop: 'toolbox',
      scene: 'Your shift lead wants a quick walk-through of the big ideas before you take on more of the dock.',
      takeaway: 'Logistics ties together: forecast the demand, count what matters, move goods at the lowest full cost, and keep paperwork and records accurate.',
      rounds: [
        {prompt: 'Match each inventory and warehouse term to its meaning.', pairs: [['Safety stock', 'Extra stock kept for surprises'], ['Cycle count', 'Counting a few items on a rotation'], ['Slotting', 'Choosing where each item is stored'], ['Demand forecast', 'An estimate of what customers will buy'], ['ERP', 'One shared system for all teams\' data']], why: 'These ideas keep stock right: forecast demand, hold a buffer, store items sensibly, count often, and share one set of records.'},
        {prompt: 'Match each import term to its meaning.', pairs: [['HTS code', 'Code that classifies a product for duty'], ['FOB', 'Buyer holds risk once goods are on ship'], ['Demurrage', 'Fee for a container left too long'], ['Commercial invoice', 'Paper listing goods sold and their value'], ['Import license', 'Government OK needed before some imports']], why: 'Importing runs on classification, clear risk transfer, the right papers and any license. Fees pile up when something is missing.'},
        {prompt: 'Match each supply chain idea to its meaning.', pairs: [['Push strategy', 'Build stock from forecasts before orders'], ['Pull strategy', 'Make and ship once customers order'], ['Freight audit', 'Checking freight bills for errors'], ['Trailer fill rate', 'Share of trailer space actually used'], ['Consolidation', 'Combining small shipments into big ones']], why: 'Push relies on forecasts and pull on real orders. Total cost and fill rate show the true price of moving goods, and consolidation lowers it.'}
      ]
    }
  ]
};
