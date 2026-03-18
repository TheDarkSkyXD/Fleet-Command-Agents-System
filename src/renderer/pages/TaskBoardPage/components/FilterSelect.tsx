import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

const ALL_VALUE = '__all__';

export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  testId,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  testId?: string;
}) {
  return (
    <Select
      value={value || ALL_VALUE}
      onValueChange={(val) => onChange(val === ALL_VALUE ? '' : val)}
    >
      <SelectTrigger
        className="h-8 w-auto min-w-[120px] rounded-md border-slate-700 bg-slate-800 px-3 text-xs text-slate-300 focus:ring-blue-500"
        aria-label={placeholder}
        data-testid={testId}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value || ALL_VALUE} value={opt.value || ALL_VALUE}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
