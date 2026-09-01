export const SCORE_TYPES = ["lower_is_better", "higher_is_better"] as const;
export type ScoreType = (typeof SCORE_TYPES)[number];
