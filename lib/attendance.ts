export interface AttendanceEmployee {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  active: boolean;
  email_editable: boolean;
}

export interface AttendanceShift {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
}

export interface AttendanceDashboard {
  employee: AttendanceEmployee;
  employees: AttendanceEmployee[];
  shifts: AttendanceShift[];
  open_shift: AttendanceShift | null;
}

const kstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const kstTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function attendanceDate(timestamp: string | Date): string {
  return kstDate.format(new Date(timestamp));
}

export function attendanceTime(timestamp: string): string {
  return kstTime.format(new Date(timestamp));
}

export function shiftMilliseconds(shift: AttendanceShift): number {
  return shift.clock_out ? Math.max(0, Date.parse(shift.clock_out) - Date.parse(shift.clock_in)) : 0;
}

export function durationLabel(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return [hours && hours + '시간', minutes && minutes + '분', seconds % 60 && seconds % 60 + '초'].filter(Boolean).join(' ') || '0초';
}
