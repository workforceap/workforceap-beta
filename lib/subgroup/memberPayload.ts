/** Placement outcome fields a subgroup leader may receive. */
export type SubgroupPlacement = {
  employerName: string;
  jobTitle: string;
  placedAt: Date;
};

/** Build an explicit response shape so additional record fields stay private. */
export function subgroupPlacementSummary(placement: SubgroupPlacement | null) {
  if (!placement) return null;
  return {
    employerName: placement.employerName,
    jobTitle: placement.jobTitle,
    placedAt: placement.placedAt,
  };
}
