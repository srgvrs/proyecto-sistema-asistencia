import * as migration_20261114_060133 from './20261114_060133';
import * as migration_20261124_232827_add_student_status from './20261124_232827_add_student_status';
import * as migration_20261126_001243_add_user_active from './20261126_001243_add_user_active';

export const migrations = [
  {
    up: migration_20261114_060133.up,
    down: migration_20261114_060133.down,
    name: '20261114_060133',
  },
  {
    up: migration_20261124_232827_add_student_status.up,
    down: migration_20261124_232827_add_student_status.down,
    name: '20261124_232827_add_student_status',
  },
  {
    up: migration_20261126_001243_add_user_active.up,
    down: migration_20261126_001243_add_user_active.down,
    name: '20261126_001243_add_user_active'
  },
];
