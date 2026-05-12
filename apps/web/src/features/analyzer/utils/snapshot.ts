import type { ArmyAnalysis } from './aggregate';
import type { SavedListSnapshot } from '../hooks/useSavedLists';

export function snapshotFromAnalysis(analysis: ArmyAnalysis): SavedListSnapshot {
  return {
    listName: analysis.listName,
    totalPoints: analysis.totalPoints,
    overallTier: analysis.overallTier,
    outputTier: analysis.outputTier,
    durabilityTier: analysis.durabilityTier,
    coverageTier: analysis.coverageTier,
    perProfile: analysis.perProfile.map((p) => ({
      profileId: p.profileId,
      killPercent: p.killPercent,
      tier: p.tier,
    })),
  };
}
