import { render, type RenderResult } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { Api } from '../api/endpoints';
import type { CurrentActor } from '../api/types';

/**
 * The shared harness for page tests.
 *
 * Every page reads its data through `useAuth().api`, so the whole app can be
 * exercised by replacing that one object. The stub is built from `Api`'s own
 * prototype rather than hand-listed: a method added to the client and used by a
 * page would otherwise be `undefined` here, and the page would fail with
 * "api.newThing is not a function" — a stub that silently lags the real client
 * catches nothing.
 */

/** Pagination envelope for the endpoints that carry one. */
export function paged<T>(data: T[]) {
  return {
    data,
    meta: { page: 1, limit: 25, total: data.length, totalPages: 1, hasNextPage: false },
  };
}

/**
 * Default responses, by method name.
 *
 * Deliberately *empty* collections and nulled optionals. A page that renders
 * against a comfortable fixture is not known to survive the first morning of a
 * new branch, which is exactly when every list is empty and every optional is
 * missing — and an empty state is the one a real user is most likely to meet.
 */
const DEFAULTS: Record<string, unknown> = {
  branches: [],
  availableDrivers: [],
  listCategories: [],
  listProducts: [],
  listAvailability: [],
  listModifierGroups: [],
  listCharges: [],
  listBanners: [],
  listHomepageSections: [],
  listFeatureFlags: [],
  // The shape the API actually returns — both halves, and both empty, which is
  // every branch that has never had a schedule set. That emptiness is what the
  // hours editor has to survive: see `pages/branch-settings.test.tsx`.
  getOpeningHours: { hours: [], overrides: [] },
  orderEdits: [],
};

/** Collections that come back inside `{ data, meta }`. */
const PAGED = [
  'listAllDrivers',
  'listOrders',
  'listPayments',
  'listUsers',
  'listCoupons',
  'listDrivers',
  'listSettlements',
  'listCustomers',
  'listAudit',
  'customerLedger',
  'cashCollections',
];

/** Collections that come back inside a bare `{ data }`. */
const DATA_ONLY = ['kitchenQueue', 'awaitingAcceptanceQueue', 'deliveries'];

export type MockApi = Record<string, ReturnType<typeof vi.fn>>;

/**
 * Builds a stub carrying every method the real `Api` declares.
 *
 * Anything without an explicit default resolves to `null`, which is what an
 * endpoint that has nothing to say returns — and is the value most likely to
 * throw in a page that assumes an object.
 */
export function makeApi(overrides: Record<string, unknown> = {}): MockApi {
  const api: MockApi = {};

  for (const name of Object.getOwnPropertyNames(Api.prototype)) {
    if (name === 'constructor') {
      continue;
    }
    let value: unknown = null;
    if (name in DEFAULTS) {
      value = DEFAULTS[name];
    } else if (PAGED.includes(name)) {
      value = paged([]);
    } else if (DATA_ONLY.includes(name)) {
      value = { data: [] };
    }
    api[name] = vi.fn().mockResolvedValue(value);
  }

  for (const [name, value] of Object.entries(overrides)) {
    api[name] = typeof value === 'function' ? (value as ReturnType<typeof vi.fn>) : vi.fn().mockResolvedValue(value);
  }

  return api;
}

export const OWNER_ACTOR: CurrentActor = {
  id: 'u1',
  kind: 'STAFF',
  email: 'owner@example.test',
  fullName: 'Owner',
  roles: ['OWNER'],
  permissions: ['*'],
  branchScope: { allBranches: true, branchIds: [] },
} as unknown as CurrentActor;

export const BRANCH_ACTOR: CurrentActor = {
  id: 'u2',
  kind: 'STAFF',
  email: 'branch@example.test',
  fullName: 'Branch Admin',
  roles: ['BRANCH_ADMIN'],
  permissions: ['orders:read'],
  branchScope: { allBranches: false, branchIds: ['b1'] },
} as unknown as CurrentActor;

export interface RenderPageOptions {
  api?: MockApi;
  actor?: CurrentActor;
  route?: string;
  path?: string;
}

/**
 * Mounts one page with a stubbed auth context and a router.
 *
 * `AuthProvider` is mocked rather than wrapped: the real one reads
 * localStorage, constructs an `ApiClient` against a live base URL and calls
 * `/auth/me` on mount, none of which belongs in a page test.
 */
export function renderPage(
  ui: React.ReactElement,
  { api = makeApi(), actor = OWNER_ACTOR, route = '/' }: RenderPageOptions = {},
): RenderResult & { api: MockApi } {
  authState.api = api;
  authState.actor = actor;

  const result = render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
  return Object.assign(result, { api });
}

/**
 * Mutable state the mocked `useAuth` reads.
 *
 * A module mock is hoisted above every import, so it cannot close over values
 * a test sets later — it has to read them through an object like this one.
 */
export const authState: { api: MockApi; actor: CurrentActor } = {
  api: makeApi(),
  actor: OWNER_ACTOR,
};
