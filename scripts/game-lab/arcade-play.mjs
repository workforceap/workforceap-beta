import assert from 'node:assert/strict';
import { exactCoverage } from './inventory.mjs';

export async function notice(frame) {
  const banner = frame.locator('[data-game-lab-prerelease]');
  await banner.waitFor({ state: 'visible' });
  assert.match(await banner.innerText(), /Pre-release\. Not teaching-reviewed\. Progress stays in this browser only\. Not course credit\./);
}

// Automated playability, not an independent content review: match the *rendered*
// randomized prompt to authored level data. All navigation and answers go through
// ordinary visible links/buttons. Never invoke the game's hint/state/choice hooks.
export async function arcadeLevelWin(frame, id) {
  const card = frame.locator(`#games article[data-id="${id}"]`);
  const title = await card.getByRole('heading').innerText();
  const destination = new URL(`play.html?game=${id}`, frame.url()).href;
  await Promise.all([
    frame.waitForURL(destination, { waitUntil: 'domcontentloaded' }),
    card.getByRole('link', { name: /^Start / }).click(),
  ]);
  await notice(frame);
  assert.equal(await frame.locator('#mapTitle').innerText(), title);
  const game = (await import(`../../assets/game-lab/practice-arcade/games/${id}/game.mjs`)).default;
  assert.equal(game.id, id);
  const level = game.levels[0];
  const choices = level.actions ?? level.bins;
  assert.ok(['gate', 'sort'].includes(level.mechanic), `no first-level input driver for ${id}: ${level.mechanic}`);
  const answers = new Map(level.items.map((item) => [item.title ?? item.label, choices.find((c) => c.id === item.answer).label]));
  await frame.locator(`#map .level-card[data-level="${level.id}"]`).click();
  await frame.getByRole('button', { name: 'Start', exact: true }).click();
  const prompts = [];
  while (prompts.length < level.items.length) {
    const prompt = await frame.locator('#cardTitle').innerText();
    const answer = answers.get(prompt);
    assert.ok(answer && !prompts.includes(prompt), `${id}: unexpected or repeated prompt: ${prompt}`);
    await frame.getByRole('button', { name: answer, exact: true }).click();
    prompts.push(prompt);
  }
  exactCoverage(`${id}: level prompts`, [...answers.keys()], prompts);
  await frame.locator('#results').waitFor({ state: 'visible' });
  const outcome = await frame.locator('#res-t').innerText();
  assert.match(outcome, /^Level complete/);
  const stars = await frame.locator('#results .res-stars').getAttribute('aria-label');
  assert.match(stars, /^[1-3] of 3 stars$/);
  await frame.locator('#results [data-action="map"]').click();
  await frame.getByRole('link', { name: 'All games', exact: true }).click();
  await frame.locator('#games[aria-busy="false"]').waitFor();
  return { level: level.id, prompts: prompts.length, outcome, stars };
}
