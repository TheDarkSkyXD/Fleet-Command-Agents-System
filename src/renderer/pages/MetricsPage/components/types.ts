/** Shared formatter function types used across MetricsPage components */

export type FormatTokenCount = (n: number | null | undefined) => string;
export type FormatDuration = (ms: number | null | undefined) => string;
export type FormatCost = (cost: number | null | undefined) => string;
export type ModelColorFn = (model: string | null | undefined) => string;
export type ModelBgColorFn = (model: string | null | undefined) => string;
