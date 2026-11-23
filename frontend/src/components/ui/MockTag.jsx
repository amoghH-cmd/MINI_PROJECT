// Must accompany every simulated registry result (GST / PAN / Udyam).
export default function MockTag() {
  return (
    <span title="Simulated result from a local mock dataset. Not a live government verification."
      className="inline-block px-1.5 py-px text-[11px] font-semibold border border-dashed border-warn text-warn rounded-sm">
      Mock verification
    </span>
  );
}
