export function MetricCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border p-4 bg-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">
        {value}
        {suffix && <span className="text-base font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  )
}
