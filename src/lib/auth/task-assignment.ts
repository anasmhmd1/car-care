/**
 * Determines whether an employee may act on a task that has been assigned to
 * a specific person. Team work remains possible until a manager makes a
 * direct assignment; a designated team leader deliberately retains team-wide
 * access.
 */
export function canEmployeeAccessTaskAssignment({
  employeeId,
  assignedEmployeeId,
  isTeamMember,
  isTeamLeader,
}: {
  employeeId: string;
  assignedEmployeeId: string | null | undefined;
  isTeamMember: boolean;
  isTeamLeader: boolean;
}): boolean {
  return isTeamMember && (
    !assignedEmployeeId ||
    assignedEmployeeId === employeeId ||
    isTeamLeader
  );
}
