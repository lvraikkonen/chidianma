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

export type ImportControllerState =
  | { kind: "idle" }
  | { kind: "submitting"; request: RestaurantImportRequest }
  | { kind: "recovery"; request: RestaurantImportRequest; error: unknown }
  | {
      kind: "complete";
      request: RestaurantImportRequest;
      response: RestaurantImportResponse;
      rowsById: Record<string, RestaurantImportRow>;
    };

export function createImportController(dependencies: {
  submit: (request: RestaurantImportRequest) => Promise<RestaurantImportResponse>;
  createRequestId?: (() => string) | undefined;
  onState?: ((state: ImportControllerState) => void) | undefined;
}) {
  let state: ImportControllerState = { kind: "idle" };
  let accumulatedResults: RestaurantImportResponse["results"] = [];
  let knownRows = new Map<string, RestaurantImportRow>();
  const correctionRequestIds = new Set<string>();
  const commit = (next: ImportControllerState) => {
    state = next;
    dependencies.onState?.(next);
  };
  const send = async (request: RestaurantImportRequest) => {
    commit({ kind: "submitting", request });
    try {
      const response = await dependencies.submit(request);
      accumulatedResults = correctionRequestIds.has(request.requestId)
        ? mergeImportResults(accumulatedResults, response.results)
        : response.results;
      commit({
        kind: "complete",
        request,
        response: { ...response, results: accumulatedResults },
        rowsById: Object.fromEntries(knownRows)
      });
    } catch (error) {
      commit({ kind: "recovery", request, error });
    }
    return state;
  };
  return {
    getState: () => state,
    submit: (request: RestaurantImportRequest) => {
      accumulatedResults = [];
      knownRows = new Map(request.rows.map((row) => [row.rowId, row]));
      correctionRequestIds.clear();
      return send(request);
    },
    retry: () => state.kind === "recovery" ? send(state.request) : Promise.resolve(state),
    correctRejected: (rowsById: Record<string, RestaurantImportRow>) => {
      if (state.kind !== "complete") return Promise.resolve(state);
      const rejected = new Set(state.response.results
        .filter((result) => result.status === "rejected")
        .map((result) => result.rowId));
      const rows = Object.values(rowsById).filter((row) => rejected.has(row.rowId));
      if (rows.length === 0) return Promise.resolve(state);
      const request = {
        requestId: dependencies.createRequestId?.() ?? crypto.randomUUID(),
        rows
      };
      for (const row of rows) knownRows.set(row.rowId, row);
      correctionRequestIds.add(request.requestId);
      return send(request);
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
