import { describe, expect, it } from 'vitest';
import { canEmployeeAccessTaskAssignment } from '@/lib/auth/task-assignment';

describe('direct task assignment access', () => {
  it('allows every member to work an unassigned team task', () => {
    expect(canEmployeeAccessTaskAssignment({
      employeeId: 'employee-a',
      assignedEmployeeId: null,
      isTeamMember: true,
      isTeamLeader: false,
    })).toBe(true);
  });

  it('restricts a direct assignment to its employee', () => {
    expect(canEmployeeAccessTaskAssignment({
      employeeId: 'employee-b',
      assignedEmployeeId: 'employee-a',
      isTeamMember: true,
      isTeamLeader: false,
    })).toBe(false);
    expect(canEmployeeAccessTaskAssignment({
      employeeId: 'employee-a',
      assignedEmployeeId: 'employee-a',
      isTeamMember: true,
      isTeamLeader: false,
    })).toBe(true);
  });

  it('preserves the deliberate leader override without granting non-members access', () => {
    expect(canEmployeeAccessTaskAssignment({
      employeeId: 'team-leader',
      assignedEmployeeId: 'employee-a',
      isTeamMember: true,
      isTeamLeader: true,
    })).toBe(true);
    expect(canEmployeeAccessTaskAssignment({
      employeeId: 'outsider',
      assignedEmployeeId: null,
      isTeamMember: false,
      isTeamLeader: true,
    })).toBe(false);
  });
});
