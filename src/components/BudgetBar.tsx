export default function BudgetBar({
  used, budget, compact = false,
}: { used: number; budget: number; compact?: boolean }) {
  const pct = budget > 0 ? (used / budget) * 100 : used > 0 ? 100 : 0;
  const over = budget > 0 && used > budget;
  const near = !over && pct >= 90;

  const color = over ? "bg-rose-500" : near ? "bg-amber-500" : "bg-emerald-500";
  const remain = Math.round((budget - used) * 100) / 100;

  return (
    <div className={compact ? "" : "space-y-1"}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${color}`}
             style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {!compact && (
        <div className="flex justify-between text-xs num">
          <span className="text-slate-500">
            {used.toFixed(1)}h / {budget > 0 ? `${budget.toFixed(1)}h` : "chưa set"}
          </span>
          <span className={over ? "font-medium text-rose-600" : near ? "font-medium text-amber-600" : "text-slate-500"}>
            {budget > 0 ? (over ? `vượt ${Math.abs(remain).toFixed(1)}h` : `còn ${remain.toFixed(1)}h`) : "—"}
          </span>
        </div>
      )}
    </div>
  );
}
