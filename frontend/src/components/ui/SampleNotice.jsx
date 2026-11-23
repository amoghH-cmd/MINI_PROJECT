import { Info } from 'lucide-react';
export default function SampleNotice({ children }) {
  return (
    <div role="note" className="flex gap-2 items-start text-[12px] border border-[#C9D6E2] bg-[#EEF3F8] text-navy px-3 py-2 rounded">
      <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
