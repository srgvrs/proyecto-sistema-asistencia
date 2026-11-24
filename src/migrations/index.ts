import * as migration_20261114_060133 from './20261114_060133';
import * as migration_20261124_010157_add_visitor_guard_fields from './20261124_010157_add_visitor_guard_fields';

export const migrations = [
  {
    up: migration_20261114_060133.up,
    down: migration_20261114_060133.down,
    name: '20261114_060133',
  },
  {
    up: migration_20261124_010157_add_visitor_guard_fields.up,
    down: migration_20261124_010157_add_visitor_guard_fields.down,
    name: '20261124_010157_add_visitor_guard_fields'
  },
];
