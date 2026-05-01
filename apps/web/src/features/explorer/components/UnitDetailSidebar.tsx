import type { Unit, ArmyBook } from '@opr-api/shared';
import { Card } from '../../../components/ui/Card';

interface UnitDetailSidebarProps {
  selectedUnit: Unit | null;
  army: ArmyBook;
}

export function UnitDetailSidebar({ selectedUnit, army }: UnitDetailSidebarProps) {
  if (!selectedUnit) {
    return (
      <div className="sidebar flex flex-col items-center justify-center p-8 text-center text-gray-400">
        Select a unit to view its armory and powers
      </div>
    );
  }

  return (
    <div className="sidebar flex flex-col">
      <div className="sidebar-header border-b border-white/10 p-6">
        <h2 className="text-2xl font-bold text-sky-400">{selectedUnit.name}</h2>
        <div className="mt-1 text-sm text-gray-400">
          {selectedUnit.genericName || 'Unit Armory'}
        </div>
      </div>

      <div className="sidebar-content flex-1 overflow-y-auto p-6 space-y-8">
        {/* Base Profile */}
        <section>
          <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-sky-400">Base Profile</span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="bg-white/5 p-3">
              <div className="text-[10px] text-gray-400">SIZE</div>
              <div className="text-lg font-extrabold">{selectedUnit.size}</div>
            </Card>
            <Card className="bg-white/5 p-3">
              <div className="text-[10px] text-gray-400">QUALITY</div>
              <div className="text-lg font-extrabold">{selectedUnit.quality}+</div>
            </Card>
            <Card className="bg-white/5 p-3">
              <div className="text-[10px] text-gray-400">DEFENSE</div>
              <div className="text-lg font-extrabold">{selectedUnit.defense}+</div>
            </Card>
          </div>
        </section>

        {/* Weapons */}
        <section>
          <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-sky-400">Weapons</span>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 font-semibold text-gray-400">WEAPON</th>
                  <th className="pb-2 font-semibold text-gray-400">RNG</th>
                  <th className="pb-2 font-semibold text-gray-400">A</th>
                  <th className="pb-2 font-semibold text-gray-400">SPECIAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {selectedUnit.weapons.map((w) => (
                  <tr key={w.id}>
                    <td className="py-2 font-semibold">
                      {w.name} {w.count > 1 ? `x${w.count}` : ''}
                    </td>
                    <td className="py-2">{w.range > 0 ? `${w.range}"` : 'M'}</td>
                    <td className="py-2">{w.attacks}</td>
                    <td className="py-2 text-xs text-gray-400">
                      {w.specialRules.map((sr: any) => sr.label).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Special Rules */}
        <section>
          <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-sky-400">Special Rules</span>
          <div className="flex flex-wrap gap-1.5">
            {selectedUnit.rules.map((r) => (
              <span
                key={r.id}
                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300"
              >
                {r.label}
              </span>
            ))}
          </div>
        </section>

        {/* Upgrades */}
        <section>
          <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-sky-400">Upgrades</span>
          <div className="space-y-6">
            {selectedUnit.upgrades.map((pkgUid) => {
              const pkg = army.upgradePackages.find((p) => p.uid === pkgUid);
              if (!pkg) return null;
              return (
                <div key={pkg.uid} className="space-y-4">
                  {pkg.sections.map((section) => (
                    <div key={section.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 text-[10px] font-bold uppercase text-gray-500">
                        {section.label}
                      </div>
                      <div className="space-y-2">
                        {section.options.map((option) => (
                          <div key={option.id} className="flex items-start justify-between rounded bg-white/5 p-2">
                            <div className="flex-1">
                              <div className="text-sm font-semibold">{option.label}</div>
                              <div className="text-xs text-gray-400">
                                {option.gains.map((g: any) => g.label || g.name).join(', ')}
                              </div>
                            </div>
                            <div className="text-sm font-extrabold text-sky-400">+{option.cost}p</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-sky-500/5 px-6 py-4">
        <span className="text-sm text-gray-400">Base Points</span>
        <span className="text-xl font-extrabold text-sky-400">{selectedUnit.cost}pts</span>
      </div>
    </div>
  );
}
