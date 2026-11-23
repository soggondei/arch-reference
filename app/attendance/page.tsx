import type { Metadata } from 'next';
import AttendanceWorkspace from '@/components/AttendanceWorkspace';

export const metadata: Metadata = { title: '직원·근태 관리 | LV LAB', robots: { index: false } };

export default function AttendancePage() {
  return <AttendanceWorkspace />;
}
