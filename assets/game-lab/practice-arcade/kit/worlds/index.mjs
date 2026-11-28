// Static registry of worlds (no dynamic imports, so a static file server and offline play always work).
// Each world file default-exports {id, label, build(ctx)}; replacing a stub file never requires touching this index.
// Every world is wrapped with withReactions() (react.mjs): the built world gains event(ev), so its accent strips, rims
// and glows flash green on a right answer, red on a wrong one, and glow brighter as the streak grows.
import office from './office.mjs';
import serverRoom from './server-room.mjs';
import warehouse from './warehouse.mjs';
import clinic from './clinic.mjs';
import factory from './factory.mjs';
import site from './site.mjs';
import studio from './studio.mjs';
import cloud from './cloud.mjs';
import lab from './lab.mjs';
import {withReactions} from './react.mjs';

const RAW = {
  office,
  'server-room': serverRoom,
  warehouse,
  clinic,
  factory,
  site,
  studio,
  cloud,
  lab
};
const WORLDS = Object.fromEntries(Object.entries(RAW).map(([id, W]) => [id, withReactions(W)]));
export const WORLD_IDS = Object.keys(WORLDS);
export default WORLDS;
