// Route table: [pattern, module]. `:name` segments become context.params.name.
// Each module exports onRequestGet / onRequestPost / onRequestPatch /
// onRequestDelete (or a catch-all onRequest). Match is exact on segment count
// plus literal segments, so order doesn't matter.

import * as authRequestLink from './api/auth/request-link.js';
import * as authCallback from './api/auth/callback.js';
import * as authLogout from './api/auth/logout.js';
import * as authMe from './api/auth/me.js';
import * as projects from './api/projects/index.js';
import * as project from './api/projects/id.js';
import * as steps from './api/projects/id/steps.js';
import * as step from './api/projects/id/steps/stepId.js';
import * as supplies from './api/projects/id/supplies.js';
import * as supply from './api/projects/id/supplies/supplyId.js';
import * as journal from './api/projects/id/journal.js';
import * as collaborators from './api/projects/id/collaborators.js';
import * as transfer from './api/projects/id/transfer.js';
import * as review from './api/review.js';
import * as search from './api/search.js';
import * as categories from './api/categories/index.js';
import * as category from './api/categories/categoryId.js';
import * as inbox from './api/inbox/index.js';
import * as inboxItem from './api/inbox/itemId.js';
import * as usersSearch from './api/users/search.js';
import * as patterns from './api/patterns/index.js';
import * as pattern from './api/patterns/patternId.js';
import * as gateEvents from './api/gate/events.js';
import * as gateEvent from './api/gate/events/eventId.js';
import * as gateEntries from './api/gate/events/eventId/entries.js';
import * as gateEntry from './api/gate/events/eventId/entries/entryId.js';
import * as gateCollaborators from './api/gate/events/eventId/collaborators.js';

export const routes = [
  ['/api/auth/request-link', authRequestLink],
  ['/api/auth/callback', authCallback],
  ['/api/auth/logout', authLogout],
  ['/api/auth/me', authMe],

  ['/api/projects', projects],
  ['/api/projects/:id', project],
  ['/api/projects/:id/steps', steps],
  ['/api/projects/:id/steps/:stepId', step],
  ['/api/projects/:id/supplies', supplies],
  ['/api/projects/:id/supplies/:supplyId', supply],
  ['/api/projects/:id/journal', journal],
  ['/api/projects/:id/collaborators', collaborators],
  ['/api/projects/:id/transfer', transfer],

  ['/api/review', review],
  ['/api/search', search],
  ['/api/categories', categories],
  ['/api/categories/:categoryId', category],
  ['/api/inbox', inbox],
  ['/api/inbox/:itemId', inboxItem],
  ['/api/users/search', usersSearch],
  ['/api/patterns', patterns],
  ['/api/patterns/:patternId', pattern],

  ['/api/gate/events', gateEvents],
  ['/api/gate/events/:eventId', gateEvent],
  ['/api/gate/events/:eventId/entries', gateEntries],
  ['/api/gate/events/:eventId/entries/:entryId', gateEntry],
  ['/api/gate/events/:eventId/collaborators', gateCollaborators],
];
