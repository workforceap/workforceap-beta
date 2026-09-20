import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldOfferTour } from './offer';
import { TOUR_REGISTRY } from './registry';

const tour = TOUR_REGISTRY['counselor.home'];

test('a person with no tour state is offered the tour', () => {
  assert.equal(shouldOfferTour(tour, null), true);
  assert.equal(shouldOfferTour(tour, undefined), true);
});

test('COMPLETED or DISMISSED at the current version is never offered again', () => {
  assert.equal(shouldOfferTour(tour, { version: tour.version, status: 'COMPLETED', lastStep: 6 }), false);
  assert.equal(shouldOfferTour(tour, { version: tour.version, status: 'DISMISSED', lastStep: 0 }), false);
  assert.equal(shouldOfferTour(tour, { version: tour.version + 3, status: 'DISMISSED' }), false, 'newer rows never re-offer');
});

test('STARTED without a decision keeps offering', () => {
  assert.equal(shouldOfferTour(tour, { version: tour.version, status: 'STARTED', lastStep: 2 }), true);
});

test('a row from an older tour version re-offers regardless of status', () => {
  assert.equal(shouldOfferTour(tour, { version: tour.version - 1, status: 'COMPLETED' }), true);
  assert.equal(shouldOfferTour(tour, { version: 0, status: 'DISMISSED' }), true);
});
