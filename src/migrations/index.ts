import * as migration_20261114_060133 from './20261114_060133';
import * as migration_20261124_232827_add_student_status from './20261124_232827_add_student_status';

export const migrations = [
  {
    up: migration_20261114_060133.up,
    down: migration_20261114_060133.down,
    name: '20261114_060133',
  },
  {
    up: migration_20261124_232827_add_student_status.up,
    down: migration_20261124_232827_add_student_status.down,
    name: '20261124_232827_add_student_status'
  },
];
