import type { Metadata } from 'next';
import AttendanceWorkspace from '@/components/AttendanceWorkspace';

export const metadata: Metadata = { title: '내 근태 | LV LAB', robots: { index: false } };

export default function AttendancePage() {
  return <AttendanceWorkspace />;
}
