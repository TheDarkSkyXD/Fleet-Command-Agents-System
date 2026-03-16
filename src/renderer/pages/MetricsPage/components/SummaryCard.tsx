import type React from 'react';
import { Card, CardContent } from '../../../components/ui/card';

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  testId?: string;
}

export function SummaryCard({ icon, label, value, testId }: SummaryCardProps) {
  return (
    <Card className="border-slate-700 bg-slate-800" data-testid={testId}>
      <CardContent className="p-4 pt-4">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold text-slate-50">{value}</div>
      </CardContent>
    </Card>
  );
}
