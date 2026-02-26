export function PersonaChip({ role }: { role: string }) {
  return (
    <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
      {role}
    </span>
  )
}
