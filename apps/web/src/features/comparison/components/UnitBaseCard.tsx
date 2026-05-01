import type { Unit, ArmyData } from '../types';
import { RuleList } from './RuleText';
import { formatBases, getUpgradeDetails } from '../utils/diffHelpers';
import { UpgradeSectionTable } from './UpgradeSectionTable';

interface UnitBaseCardProps {
  unit: Unit | null | undefined;
  data: ArmyData | null;
  version: string;
  rulesDict: Record<string, string>;
}

export function UnitBaseCard({ unit, data, version, rulesDict }: UnitBaseCardProps) {
  if (!unit || !data)
    return (
      <div className="glass-card flex h-full items-center justify-center p-6 opacity-50">
        <span className="italic text-slate-400">Not present in {version}</span>
      </div>
    );

  const upgradeDetails = getUpgradeDetails(unit, data);

  return (
    <div className="glass-card relative h-full p-2">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h4 className="m-0 text-xl font-bold text-white">
            {unit.name}{' '}
            {unit.genericName ? (
              <span className="text-sm font-normal text-slate-400">[{unit.genericName}]</span>
            ) : (
              ''
            )}
          </h4>
          {(unit.size || unit.bases) && (
            <div className="mt-1 flex gap-3 text-xs text-slate-500">
              {unit.size && <span>Size: {unit.size}</span>}
              {unit.bases && <span>Base: {formatBases(unit.bases)}</span>}
            </div>
          )}
        </div>
        <span className="unit-cost font-bold text-sky-400">{unit.cost}pts</span>
      </div>

      <div className="mb-4 flex gap-4">
        <div className="rounded-lg bg-white/5 px-3 py-1">
          <span className="block text-xs uppercase tracking-wider text-slate-400">Quality</span>
          <div className="text-lg font-bold text-white">{unit.quality}+</div>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-1">
          <span className="block text-xs uppercase tracking-wider text-slate-400">Defense</span>
          <div className="text-lg font-bold text-white">{unit.defense}+</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="unit-detail-label mb-2 text-xs font-semibold uppercase text-slate-500">
          Equipment
        </div>
        {unit.weapons.map((w, idx) => (
          <div key={idx} className="mb-1 text-sm">
            <span className="font-medium text-slate-100">
              {w.count > 1 ? `${w.count}x ` : ''}
              {w.name}
            </span>
            <span className="text-slate-400">
              {' '}
              ({w.range ? `${w.range}"` : 'Melee'}, A{w.attacks}
              {w.specialRules?.length > 0 && ', '}
              <RuleList rules={w.specialRules} specialRulesDict={rulesDict} />)
            </span>
          </div>
        ))}
        {unit.items?.map((item, idx) => (
          <div key={`item-${idx}`} className="mb-1 text-sm">
            <span className="font-medium">
              {item.count > 1 ? `${item.count}x ` : ''}
              {item.name}
            </span>
            <span className="text-slate-400">
              {' '}
              (
              {item.content?.length > 0 && (
                <RuleList rules={item.content} specialRulesDict={rulesDict} />
              )}
              )
            </span>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <div className="unit-detail-label mb-2 text-xs font-semibold uppercase text-slate-500">
          Rules
        </div>
        <div className="text-sm leading-relaxed text-slate-400">
          <RuleList rules={unit.rules} specialRulesDict={rulesDict} />
        </div>
      </div>

      {upgradeDetails.length > 0 && (
        <div className="mb-4">
          <div className="unit-detail-label mb-2 text-xs font-semibold uppercase text-slate-500">
            Upgrades
          </div>
          <div className="flex flex-col gap-3">
            {upgradeDetails.map((pkg: any) => (
              <div key={pkg.uid} className="rounded-lg border border-white/5 bg-white/5 p-2">
                <div className="mb-1 border-b border-white/10 pb-1 text-sm font-bold text-sky-400">
                  {pkg.hint}
                </div>
                {pkg.sections.map((section: any) => (
                  <UpgradeSectionTable key={section.id} sectionB={section} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {unit.product?.storeLinksPhysical?.length || unit.product?.storeLinksDigital?.length ? (
        <div className="group absolute bottom-2 right-2">
          <button className="rounded p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-sky-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
          <div className="absolute bottom-full right-0 z-20 mb-1 hidden w-48 overflow-hidden rounded border border-slate-700 bg-slate-900 shadow-xl group-hover:block">
            {unit.product.storeLinksPhysical?.length ? (
              <>
                <div className="bg-slate-800 px-3 py-1 text-[10px] font-bold uppercase text-slate-400">
                  Physical Models
                </div>
                {unit.product.storeLinksPhysical.map((link, i) => (
                  <a
                    key={i}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate px-3 py-2 text-xs text-sky-400 hover:bg-slate-800 hover:text-sky-300"
                  >
                    Store Link {i + 1}
                  </a>
                ))}
              </>
            ) : null}
            {unit.product.storeLinksDigital?.length ? (
              <>
                <div className="bg-slate-800 px-3 py-1 text-[10px] font-bold uppercase text-slate-400">
                  Digital / STL
                </div>
                {unit.product.storeLinksDigital.map((link, i) => (
                  <a
                    key={i}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate px-3 py-2 text-xs text-lime-400 hover:bg-slate-800 hover:text-lime-300"
                  >
                    STL Link {i + 1}
                  </a>
                ))}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
