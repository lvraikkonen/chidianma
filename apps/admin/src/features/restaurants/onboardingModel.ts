import {
  normalizeRestaurantText,
  parseRestaurantPaste,
  type PoiCandidate,
  type PoiSearchCenter,
  type PoiSearchResponse,
  type RestaurantImportRequest,
  type RestaurantImportResponse,
  type RestaurantImportRow
} from "@lunch/shared";
import type { GroupCapabilitiesResponse } from "@lunch/shared";

export function availableOnboardingModes(
  features: Partial<GroupCapabilitiesResponse["features"]>
) {
  return {
    bulk: features.restaurantBulkImport === true,
    nearbySearch: features.poiReferenceSearch === true,
    nearbySave: features.poiReferenceDraft === true
  };
}

export function nearbyCapabilityView(
  features: Partial<GroupCapabilitiesResponse["features"]>,
  hasRetainedResults: boolean,
  hasImportWork: boolean
) {
  return {
    showSearchControls: features.poiReferenceSearch === true,
    showRetainedWork: hasImportWork || hasRetainedResults
  };
}

export interface PasteDraftRow {
  rowId: string;
  name: string;
  address: string;
  selected: boolean;
  confirmSeparateBranch: boolean;
  error?: string | undefined;
  hint?: "duplicate" | "ambiguous_branch" | undefined;
}

type ExistingRestaurantIdentity = { name: string; address?: string | undefined };

export function createPasteDraft(
  text: string,
  existingRestaurants: ExistingRestaurantIdentity[] = []
) {
  const parsed = parseRestaurantPaste(text);
  return {
    error: parsed.error,
    rows: parsed.rows.map((row): PasteDraftRow => classifyPasteDraftRow({
      ...row,
      selected: row.error === undefined,
      confirmSeparateBranch: false
    }, existingRestaurants))
  };
}

export function classifyPasteDraftRow(
  row: PasteDraftRow,
  existingRestaurants: ExistingRestaurantIdentity[]
): PasteDraftRow {
  const name = normalizeRestaurantText(row.name);
  const address = normalizeRestaurantText(row.address);
  const sameName = existingRestaurants.filter((restaurant) => (
    normalizeRestaurantText(restaurant.name) === name
  ));
  const hint = sameName.some((restaurant) => (
    normalizeRestaurantText(restaurant.address ?? "") === address
  )) ? "duplicate" as const
    : sameName.some((restaurant) => !address || !normalizeRestaurantText(restaurant.address ?? ""))
      ? "ambiguous_branch" as const
      : undefined;
  return {
    ...row,
    ...(hint ? { hint } : {}),
    selected: row.error || hint === "duplicate"
      || (hint === "ambiguous_branch" && !row.confirmSeparateBranch)
      ? false
      : row.selected
  };
}

export function validateManualDraft(row: PasteDraftRow): string | undefined {
  if (!row.name.trim()) return "name_required";
  if (row.name.trim().length > 200 || row.address.trim().length > 500) return "field_too_long";
  return undefined;
}

export function manualRowsFromDraft(rows: PasteDraftRow[]): RestaurantImportRow[] {
  return rows.filter((row) => row.selected
    && !validateManualDraft(row)
    && row.hint !== "duplicate"
    && (row.hint !== "ambiguous_branch" || row.confirmSeparateBranch)
  ).map((row) => ({
    rowId: row.rowId,
    kind: "manual" as const,
    name: row.name.trim(),
    ...(row.address.trim() ? { address: row.address.trim() } : {}),
    ...(row.confirmSeparateBranch ? { confirmSeparateBranch: true } : {})
  }));
}

export interface ImportRowLabel { name: string; address?: string | undefined }

export type ImportControllerState =
  | { kind: "idle" }
  | {
      kind: "submitting";
      request: RestaurantImportRequest;
      requestIds: string[];
      results: RestaurantImportResponse["results"];
      rowsById: Record<string, RestaurantImportRow>;
      labelsById?: Record<string, ImportRowLabel>;
      resultLabelsById?: Record<string, ImportRowLabel>;
    }
  | {
      kind: "recovery";
      request: RestaurantImportRequest;
      error: unknown;
      requestIds: string[];
      results: RestaurantImportResponse["results"];
      rowsById: Record<string, RestaurantImportRow>;
      labelsById?: Record<string, ImportRowLabel>;
      resultLabelsById?: Record<string, ImportRowLabel>;
    }
  | {
      kind: "complete";
      request: RestaurantImportRequest;
      response: RestaurantImportResponse;
      requestIds: string[];
      results: RestaurantImportResponse["results"];
      rowsById: Record<string, RestaurantImportRow>;
      labelsById?: Record<string, ImportRowLabel>;
      resultLabelsById?: Record<string, ImportRowLabel>;
    };

export type BulkImportAction =
  | "new-import"
  | "correct-rejected"
  | "start-new-required"
  | "disabled";

export function bulkImportAction(state: ImportControllerState): BulkImportAction {
  if (state.kind === "idle") return "new-import";
  if (state.kind === "submitting" || state.kind === "recovery") return "disabled";
  return state.results.some((result) => result.status === "rejected")
    ? "correct-rejected"
    : "start-new-required";
}

export function rejectedImportRows(
  rows: RestaurantImportRow[],
  results: RestaurantImportResponse["results"]
): RestaurantImportRow[] {
  const rejected = new Set(results.filter((result) => result.status === "rejected").map((result) => result.rowId));
  return rows.filter((row) => rejected.has(row.rowId));
}

export function createImportController(dependencies: {
  submit: (request: RestaurantImportRequest) => Promise<RestaurantImportResponse>;
  createRequestId?: (() => string) | undefined;
  onState?: ((state: ImportControllerState) => void) | undefined;
}) {
  let state: ImportControllerState = { kind: "idle" };
  let accumulatedResults: RestaurantImportResponse["results"] = [];
  let knownRows = new Map<string, RestaurantImportRow>();
  let requestIds: string[] = [];
  let labelsById: Record<string, ImportRowLabel> = {};
  let resultLabelsById: Record<string, ImportRowLabel> = {};
  const correctionRequestIds = new Set<string>();
  const commit = (next: ImportControllerState) => {
    state = next;
    dependencies.onState?.(next);
  };
  const send = async (request: RestaurantImportRequest) => {
    const progress = () => ({
      requestIds: [...requestIds],
      results: [...accumulatedResults],
      rowsById: Object.fromEntries(knownRows),
      labelsById: { ...labelsById },
      resultLabelsById: { ...resultLabelsById }
    });
    commit({ kind: "submitting", request, ...progress() });
    try {
      const response = await dependencies.submit(request);
      for (const result of response.results) {
        const label = labelsById[result.rowId];
        if (label) resultLabelsById[result.rowId] = { ...label };
      }
      accumulatedResults = correctionRequestIds.has(request.requestId)
        ? mergeImportResults(accumulatedResults, response.results)
        : response.results;
      commit({
        kind: "complete",
        request,
        response: { ...response, results: accumulatedResults },
        ...progress()
      });
    } catch (error) {
      commit({ kind: "recovery", request, error, ...progress() });
    }
    return state;
  };
  return {
    getState: () => state,
    submit: (request: RestaurantImportRequest, poiLabels: Record<string, ImportRowLabel> = {}) => {
      if (state.kind !== "idle") return Promise.resolve(state);
      accumulatedResults = [];
      resultLabelsById = {};
      knownRows = new Map(request.rows.map((row) => [row.rowId, row]));
      labelsById = Object.fromEntries(request.rows.flatMap((row) => {
        const label = row.kind === "manual" ? row : poiLabels[row.rowId];
        return label ? [[row.rowId, { name: label.name, address: label.address }]] : [];
      }));
      requestIds = [request.requestId];
      correctionRequestIds.clear();
      return send(request);
    },
    retry: () => state.kind === "recovery" ? send(state.request) : Promise.resolve(state),
    correctRejected: (correctionsById: Record<string, RestaurantImportRow>) => {
      if (state.kind !== "complete") return Promise.resolve(state);
      const rows = rejectedImportRows(Object.values(correctionsById), state.response.results);
      if (rows.length === 0) return Promise.resolve(state);
      const request = {
        requestId: dependencies.createRequestId?.() ?? crypto.randomUUID(),
        rows
      };
      for (const row of rows) {
        knownRows.set(row.rowId, row);
        if (row.kind === "manual") labelsById[row.rowId] = { name: row.name, address: row.address };
      }
      requestIds.push(request.requestId);
      correctionRequestIds.add(request.requestId);
      return send(request);
    },
    resetResolved() {
      if (state.kind !== "complete") return state;
      accumulatedResults = [];
      resultLabelsById = {};
      knownRows = new Map();
      requestIds = [];
      labelsById = {};
      correctionRequestIds.clear();
      commit({ kind: "idle" });
      return state;
    }
  };
}

function mergeImportResults(
  previous: RestaurantImportResponse["results"],
  next: RestaurantImportResponse["results"]
) {
  const replacements = new Map(next.map((result) => [result.rowId, result]));
  const previousIds = new Set(previous.map((result) => result.rowId));
  return [
    ...previous.map((result) => replacements.get(result.rowId) ?? result),
    ...next.filter((result) => !previousIds.has(result.rowId))
  ];
}

interface NearbyConfiguration {
  groupId: string;
  center: PoiSearchCenter;
  keyword: string;
  radius: number;
}

export interface NearbySearchState {
  configuration: NearbyConfiguration | null;
  pages: Partial<Record<number, PoiSearchResponse>>;
  selectedPlaceIds: string[];
  pendingPage?: number | undefined;
  error?: unknown;
}

function configurationKey(configuration: NearbyConfiguration): string {
  return JSON.stringify(configuration);
}

export function createNearbySearchController(dependencies: {
  search: (input: NearbyConfiguration & { page: number; signal: AbortSignal }) => Promise<PoiSearchResponse>;
  onState?: ((state: NearbySearchState) => void) | undefined;
}) {
  let generation = 0;
  let activeAbort: AbortController | null = null;
  let state: NearbySearchState = { configuration: null, pages: {}, selectedPlaceIds: [] };
  const commit = (next: NearbySearchState) => {
    state = next;
    dependencies.onState?.(next);
  };
  return {
    getState: () => state,
    configure(configuration: NearbyConfiguration) {
      const changed = !state.configuration
        || configurationKey(state.configuration) !== configurationKey(configuration);
      if (!changed) return;
      generation += 1;
      activeAbort?.abort();
      activeAbort = null;
      commit({ configuration, pages: {}, selectedPlaceIds: [] });
    },
    cancel() {
      generation += 1;
      activeAbort?.abort();
      activeAbort = null;
      commit({ ...state, pendingPage: undefined });
    },
    async searchPage(page: number) {
      if (!state.configuration || page < 1 || page > 3) return state;
      const ownGeneration = generation;
      activeAbort?.abort();
      const abort = new AbortController();
      activeAbort = abort;
      const configuration = state.configuration;
      commit({ ...state, pendingPage: page, error: undefined });
      try {
        const result = await dependencies.search({ ...configuration, page, signal: abort.signal });
        if (generation !== ownGeneration || abort.signal.aborted) return state;
        commit({
          ...state,
          pages: { ...state.pages, [page]: result },
          pendingPage: undefined,
          error: undefined
        });
      } catch (error) {
        if (generation === ownGeneration && !abort.signal.aborted) {
          commit({ ...state, pendingPage: undefined, error });
        }
      } finally {
        if (activeAbort === abort) activeAbort = null;
      }
      return state;
    },
    toggle(placeId: string, selected: boolean) {
      const candidates = Object.values(state.pages).flatMap((page) => page?.candidates ?? []);
      if (!candidates.some((candidate) => candidate.placeId === placeId)) return;
      const ids = new Set(state.selectedPlaceIds);
      if (selected) ids.add(placeId); else ids.delete(placeId);
      commit({ ...state, selectedPlaceIds: [...ids] });
    },
    clearSelection() {
      commit({ ...state, selectedPlaceIds: [] });
    },
    getSelected(): PoiCandidate[] {
      const candidates = Object.values(state.pages).flatMap((page) => page?.candidates ?? []);
      const byId = new Map(candidates.map((candidate) => [candidate.placeId, candidate]));
      return state.selectedPlaceIds.flatMap((placeId) => {
        const item = byId.get(placeId);
        return item ? [item] : [];
      });
    }
  };
}
