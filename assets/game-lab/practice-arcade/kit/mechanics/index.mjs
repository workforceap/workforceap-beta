// Static registry of mechanics. Each file default-exports {id, label, howTo, rules, createView}.
// Replacing a stub file never requires touching this index.
import gate from './gate.mjs';
import sort from './sort.mjs';
import order from './order.mjs';
import lane from './lane.mjs';
import match from './match.mjs';

const MECHANICS = {gate, sort, order, lane, match};
export const MECHANIC_IDS = Object.keys(MECHANICS);
export default MECHANICS;
