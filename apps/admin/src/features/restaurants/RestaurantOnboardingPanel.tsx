import type {
  GroupCapabilitiesResponse,
  GroupSettingsResponse,
  GroupSummary,
  PoiCandidate,
  PoiSearchCenter,
  PoiSearchResponse,
  RestaurantSummary,
  RestaurantImportRow,
  RestaurantImportRowResult
} from "@lunch/shared";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AdminApiError } from "../../api";
import {
  geocodePoi,
  getOnboardingCapabilities,
  getOnboardingSettings,
  importRestaurants,
  patchSearchCenter,
  searchPoi
} from "../../clients/onboarding";
import type { AdminGroupContext } from "../../clients/today";
import { isMembershipInvalid } from "../auth/authModel";
import {
  availableOnboardingModes,
  bulkImportAction,
  classifyPasteDraftRow,
  createImportController,
  createNearbySearchController,
  createPasteDraft,
  manualRowsFromDraft,
  nearbyCapabilityView,
  validateManualDraft,
  type ImportControllerState,
  type BulkImportAction,
  type NearbySearchState,
  type PasteDraftRow
} from "./onboardingModel";
import type { RestaurantRouteMode } from "../../app/router";

interface RestaurantOnboardingPanelProps {
  context: AdminGroupContext;
  group: GroupSummary;
  restaurants: RestaurantSummary[];
  initialMode?: RestaurantRouteMode | undefined;
  onMembershipInvalid: (error: unknown) => void | Promise<void>;
  onImported: () => void;
  onOpenToday: () => void;
}

const emptySearchState: NearbySearchState = {
  configuration: null,
  pages: {},
  selectedPlaceIds: []
};

export function RestaurantOnboardingPanel(props: RestaurantOnboardingPanelProps) {
  const [capabilities, setCapabilities] = useState<GroupCapabilitiesResponse>();
  const [settings, setSettings] = useState<GroupSettingsResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [mode, setMode] = useState<RestaurantRouteMode>(props.initialMode ?? "bulk");
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<ReturnType<typeof createPasteDraft>>({ rows: [], error: null });
  const [bulkImportState, setBulkImportState] = useState<ImportControllerState>({ kind: "idle" });
  const [poiImportState, setPoiImportState] = useState<ImportControllerState>({ kind: "idle" });
  const [poiPreview, setPoiPreview] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [centers, setCenters] = useState<PoiSearchCenter[]>([]);
  const [chosenCenter, setChosenCenter] = useState<PoiSearchCenter | null>(null);
  const [geocodeAttribution, setGeocodeAttribution] = useState<string>();
  const [geocodePending, setGeocodePending] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string>();
  const [centerSaving, setCenterSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [radius, setRadius] = useState(3000);
  const [visiblePage, setVisiblePage] = useState(1);
  const [searchState, setSearchState] = useState<NearbySearchState>(emptySearchState);
  const [imported, setImported] = useState(false);
  const geocodeFlight = useRef<{ generation: number; abort: AbortController } | null>(null);
  const geocodeGeneration = useRef(0);
  const alive = useRef(true);

  const handleError = async (error: unknown) => {
    if (alive.current && isMembershipInvalid(error)) {
      await props.onMembershipInvalid(error);
      return;
    }
  };

  const bulkController = useMemo(() => createImportController({
    submit: async (request) => {
      try {
        return await importRestaurants(props.context, request);
      } catch (error) {
        await handleError(error);
        throw error;
      }
    },
    onState: (state) => { if (alive.current) setBulkImportState(state); }
  }), [props.context.groupId]);
  const poiController = useMemo(() => createImportController({
    submit: async (request) => {
      try {
        return await importRestaurants(props.context, request);
      } catch (error) {
        await handleError(error);
        throw error;
      }
    },
    onState: (state) => { if (alive.current) setPoiImportState(state); }
  }), [props.context.groupId]);
  const nearbyController = useMemo(() => createNearbySearchController({
    search: async ({ groupId: _groupId, signal, ...input }) => {
      try {
        return await searchPoi({ ...props.context, signal }, input);
      } catch (error) {
        await handleError(error);
        throw error;
      }
    },
    onState: (state) => { if (alive.current) setSearchState(state); }
  }), [props.context.groupId]);

  useEffect(() => {
    alive.current = true;
    let active = true;
    const abort = new AbortController();
    setLoadError(undefined);
    void Promise.all([
      getOnboardingCapabilities({ ...props.context, signal: abort.signal }),
      getOnboardingSettings({ ...props.context, signal: abort.signal })
    ]).then(([nextCapabilities, nextSettings]) => {
      if (!active) return;
      setCapabilities(nextCapabilities);
      setSettings(nextSettings);
      if (nextSettings.searchCenter) setChosenCenter(nextSettings.searchCenter);
      const available = availableOnboardingModes(nextCapabilities.features);
      if (mode === "bulk" && !available.bulk && available.nearbySearch) setMode("nearby");
      if (mode === "nearby" && !available.nearbySearch && !available.nearbySave && available.bulk) setMode("bulk");
    }).catch(async (error: unknown) => {
      if (!active) return;
      await handleError(error);
      if (active && !isMembershipInvalid(error)) setLoadError(onboardingErrorMessage(error));
    });
    return () => {
      active = false;
      alive.current = false;
      abort.abort();
      geocodeGeneration.current += 1;
      geocodeFlight.current?.abort.abort();
      nearbyController.cancel();
    };
  }, [props.context.groupId, props.context.token]);

  useEffect(() => {
    if (props.initialMode) setMode(props.initialMode);
  }, [props.initialMode]);

  useEffect(() => {
    if (!chosenCenter) {
      nearbyController.cancel();
      setSearchState(emptySearchState);
      return;
    }
    nearbyController.configure({
      groupId: props.context.groupId,
      center: chosenCenter,
      keyword: keyword.trim(),
      radius
    });
    setPoiPreview(false);
    setVisiblePage(1);
  }, [props.context.groupId, chosenCenter?.label, chosenCenter?.latitude, chosenCenter?.longitude, keyword, radius]);

  const features = capabilities?.features;
  const available = availableOnboardingModes(features ?? {});
  const currentSearchConfiguration = searchConfigurationIsCurrent(
    searchState.configuration,
    props.context.groupId,
    chosenCenter,
    keyword,
    radius
  );
  const bulkAction = bulkImportAction(bulkImportState);
  const nearbyView = nearbyCapabilityView(
    features ?? {},
    Boolean(currentSearchConfiguration && searchState.pages[visiblePage])
      || searchState.selectedPlaceIds.length > 0
      || poiPreview,
    poiImportState.kind !== "idle"
  );

  async function resolveAddress(event: FormEvent) {
    event.preventDefault();
    const inputAddress = address.trim();
    if (!inputAddress) {
      setGeocodeError("请输入要定位的地址。");
      return;
    }
    geocodeGeneration.current += 1;
    geocodeFlight.current?.abort.abort();
    const ownGeneration = geocodeGeneration.current;
    const abort = new AbortController();
    geocodeFlight.current = { generation: ownGeneration, abort };
    setGeocodePending(true);
    setGeocodeError(undefined);
    setCenters([]);
    setChosenCenter(null);
    try {
      const response = await geocodePoi(
        { ...props.context, signal: abort.signal },
        { address: inputAddress, ...(city.trim() ? { city: city.trim() } : {}) }
      );
      if (geocodeGeneration.current !== ownGeneration || abort.signal.aborted) return;
      setCenters(response.centers);
      setGeocodeAttribution(response.attribution);
      if (response.centers.length === 0) setGeocodeError("没有找到可确认的位置，请补充更具体的地址。");
    } catch (error) {
      if (geocodeGeneration.current !== ownGeneration || abort.signal.aborted) return;
      await handleError(error);
      if (!isMembershipInvalid(error)) setGeocodeError(onboardingErrorMessage(error));
    } finally {
      if (geocodeGeneration.current === ownGeneration) setGeocodePending(false);
    }
  }

  async function saveGroupCenter() {
    if (!chosenCenter || props.group.role !== "admin") return;
    setCenterSaving(true);
    setGeocodeError(undefined);
    try {
      const response = await patchSearchCenter(props.context, chosenCenter);
      setSettings(response);
    } catch (error) {
      await handleError(error);
      if (!isMembershipInvalid(error)) setGeocodeError(onboardingErrorMessage(error));
    } finally {
      setCenterSaving(false);
    }
  }

  async function finishImport(
    state: ImportControllerState,
    previousRequestId: string | undefined
  ) {
    if (alive.current && state.kind === "complete"
      && state.request.requestId !== previousRequestId
      && state.response.results.some((result) => result.status === "created")) {
      setImported(true);
      props.onImported();
    }
  }

  async function submitManualRows(action: BulkImportAction) {
    const rows = manualRowsFromDraft(draft.rows);
    if (draft.error || rows.length === 0 || rows.length > 60) return;
    const next = action === "new-import"
      ? await bulkController.submit({ requestId: crypto.randomUUID(), rows })
      : action === "correct-rejected"
        ? await bulkController.correctRejected(Object.fromEntries(rows.map((row) => [row.rowId, row])))
        : bulkController.getState();
    await finishImport(next, bulkImportState.kind === "complete" ? bulkImportState.request.requestId : undefined);
  }

  function startNewBulkImport() {
    if (bulkController.resetResolved().kind !== "idle") return;
    setPaste("");
    setDraft({ rows: [], error: null });
  }

  function startNewPoiImport() {
    if (poiController.resetResolved().kind !== "idle") return;
    nearbyController.clearSelection();
    setPoiPreview(false);
  }

  async function savePoiSelection() {
    if (!searchConfigurationIsCurrent(
      searchState.configuration,
      props.context.groupId,
      chosenCenter,
      keyword,
      radius
    )) return;
    const selected = nearbyController.getSelected();
    if (!available.nearbySave || selected.length === 0) return;
    const rows: RestaurantImportRow[] = selected.map((candidate, index) => ({
      rowId: `poi-${index + 1}`,
      kind: "poi",
      ticket: candidate.ticket
    }));
    const next = await poiController.submit({ requestId: crypto.randomUUID(), rows });
    await finishImport(next, poiImportState.kind === "complete" ? poiImportState.request.requestId : undefined);
  }

  return (
    <section className="onboarding-panel panel" aria-labelledby="onboarding-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">快速建库</span>
          <h2 id="onboarding-heading">一次加入多家餐厅</h2>
        </div>
        {imported ? (
          <button className="button primary compact" type="button" onClick={props.onOpenToday}>
            去今日推荐手动生成 / 更新
          </button>
        ) : null}
      </div>
      {loadError ? <p className="inline-error" role="alert">{loadError}</p> : null}
      {!capabilities && !loadError ? <p className="muted-note">正在确认当前小组可用的建库方式…</p> : null}
      {features ? (
        <>
          <OnboardingModePicker features={features} mode={mode} onMode={setMode} />
          {mode === "bulk" && available.bulk ? (
            <div className="onboarding-flow">
              <label className="field">
                <span>粘贴餐厅名单</span>
                <textarea rows={6} value={paste} placeholder={'每行一家，例如：\n巷口面馆\t中山路 1 号\n老王饺子馆'} onChange={(event) => setPaste(event.target.value)} />
              </label>
              <div className="flow-actions">
                <button className="button secondary" type="button" onClick={() => setDraft(createPasteDraft(paste, props.restaurants))}>生成预览</button>
                <small>支持“名称”或“名称 + Tab + 地址”，最多 60 个非空行。</small>
              </div>
              {draft.rows.length > 0 ? (
                <BulkImportEditor
                  rows={draft.rows}
                  overflow={draft.error === "too_many_rows"}
                  pending={bulkImportState.kind === "submitting"}
                  action={bulkAction}
                  existingRestaurants={props.restaurants}
                  onChange={(rows) => setDraft({ ...draft, rows })}
                  onSubmit={submitManualRows}
                />
              ) : null}
              <ImportFeedback
                key={bulkImportState.kind === "idle" ? "bulk-idle" : bulkImportState.requestIds[0]}
                state={bulkImportState}
                onRetry={async () => { await finishImport(await bulkController.retry(), undefined); }}
                onCorrect={async (confirmedRows) => {
                  const rows = Object.fromEntries(manualRowsFromDraft(draft.rows).map((row) => [
                    row.rowId,
                    confirmedRows[row.rowId]?.confirmSeparateBranch
                      ? { ...row, confirmSeparateBranch: true }
                      : row
                  ]));
                  await finishImport(await bulkController.correctRejected(rows), undefined);
                }}
                onStartNew={startNewBulkImport}
              />
            </div>
          ) : mode === "nearby" ? (
            <div className="onboarding-flow">
              {nearbyView.showSearchControls ? (
                <>
                  {settings?.searchCenter ? (
                    <div className="saved-center">
                      <div><strong>小组搜索中心</strong><small>{settings.searchCenter.label}</small></div>
                      <button className="button ghost compact" type="button" onClick={() => setChosenCenter(settings.searchCenter ?? null)}>使用这个中心</button>
                    </div>
                  ) : null}
                  <form className="center-form" onSubmit={resolveAddress}>
                    <label className="field"><span>搜索中心地址</span><input value={address} maxLength={500} onChange={(event) => setAddress(event.target.value)} placeholder="输入办公楼或附近地址" /></label>
                    <label className="field"><span>城市（可选）</span><input value={city} maxLength={100} onChange={(event) => setCity(event.target.value)} /></label>
                    <button className="button secondary" type="submit" disabled={geocodePending}>{geocodePending ? "正在解析…" : "解析地址"}</button>
                  </form>
                  {geocodeError ? <p className="inline-error" role="alert">{geocodeError}</p> : null}
                  {centers.length > 0 ? (
                    <fieldset className="center-choices">
                      <legend>确认搜索中心</legend>
                      {centers.map((center) => (
                        <label key={`${center.latitude}:${center.longitude}`}>
                          <input type="radio" name="poi-center" checked={sameCenter(chosenCenter, center)} onChange={() => setChosenCenter(center)} />
                          <span>{center.label}</span>
                        </label>
                      ))}
                      {geocodeAttribution ? <small>{geocodeAttribution}</small> : null}
                    </fieldset>
                  ) : null}
                  {chosenCenter && props.group.role === "admin" && !sameCenter(settings?.searchCenter ?? null, chosenCenter) ? (
                    <button className="button ghost compact" type="button" disabled={centerSaving} onClick={saveGroupCenter}>{centerSaving ? "正在保存…" : "保存为小组搜索中心"}</button>
                  ) : null}
                  {chosenCenter ? (
                    <div className="nearby-search-controls">
                      <label className="field"><span>关键词（可选）</span><input value={keyword} maxLength={100} onChange={(event) => setKeyword(event.target.value)} placeholder="例如：面、粤菜" /></label>
                      <label className="field"><span>半径（米）</span><input type="number" min={500} max={5000} step={100} value={radius} onChange={(event) => setRadius(clampRadius(event.target.valueAsNumber))} /></label>
                      {searchState.pendingPage !== undefined ? (
                        <button className="button ghost" type="button" onClick={() => nearbyController.cancel()}>取消搜索</button>
                      ) : (
                        <button className="button primary" type="button" onClick={() => { setVisiblePage(1); void nearbyController.searchPage(1); }}>搜索附近餐厅</button>
                      )}
                    </div>
                  ) : <p className="muted-note">请先选择并确认一个地址解析结果。</p>}
                  {searchState.error ? <p className="inline-error" role="alert">{onboardingErrorMessage(searchState.error)}</p> : null}
                </>
              ) : (
                <p className="muted-note">当前不能发起新的附近搜索。已有的有效结果仍由服务器按保存能力校验。</p>
              )}
              {nearbyView.showRetainedWork ? (
                <>
                  {currentSearchConfiguration && searchState.pages[visiblePage] ? (
                    <NearbyResults
                      response={searchState.pages[visiblePage]!}
                      selectedPlaceIds={searchState.selectedPlaceIds}
                      pending={searchState.pendingPage !== undefined || poiImportState.kind === "submitting"}
                      canSave={available.nearbySave}
                      canPaginate={available.nearbySearch}
                      saveLocked={poiImportState.kind !== "idle"}
                      onToggle={(placeId, selected) => nearbyController.toggle(placeId, selected)}
                      onPage={(page) => { setVisiblePage(page); void nearbyController.searchPage(page); }}
                      onSave={() => setPoiPreview(true)}
                    />
                  ) : null}
                  {poiPreview ? (
                    <PoiSavePreview
                      candidates={nearbyController.getSelected()}
                      pending={poiImportState.kind === "submitting"}
                      onCancel={() => setPoiPreview(false)}
                      onSave={savePoiSelection}
                    />
                  ) : null}
                  <ImportFeedback
                    key={poiImportState.kind === "idle" ? "poi-idle" : poiImportState.requestIds[0]}
                    state={poiImportState}
                    onRetry={async () => { await finishImport(await poiController.retry(), undefined); }}
                    onCorrect={async (confirmedRows) => { await finishImport(await poiController.correctRejected(confirmedRows), undefined); }}
                    onStartNew={startNewPoiImport}
                  />
                </>
              ) : null}
            </div>
          ) : (
            <p className="muted-note">当前小组暂未开启批量粘贴。</p>
          )}
        </>
      ) : null}
    </section>
  );
}

export function OnboardingModePicker(props: {
  features: GroupCapabilitiesResponse["features"];
  mode: RestaurantRouteMode;
  onMode: (mode: RestaurantRouteMode) => void;
}) {
  const available = availableOnboardingModes(props.features);
  return (
    <div>
      <div className="segment onboarding-modes" aria-label="快速建库方式">
        {available.bulk ? <button type="button" aria-pressed={props.mode === "bulk"} onClick={() => props.onMode("bulk")}>粘贴名单</button> : null}
        {(available.nearbySearch || available.nearbySave) ? <button type="button" aria-pressed={props.mode === "nearby"} onClick={() => props.onMode("nearby")}>附近搜索</button> : null}
      </div>
      {props.mode === "nearby" && !available.nearbySearch ? <p className="muted-note">当前不能发起新的附近搜索。</p> : null}
    </div>
  );
}

export function BulkImportEditor(props: {
  rows: PasteDraftRow[];
  overflow: boolean;
  pending: boolean;
  action: BulkImportAction;
  existingRestaurants?: Array<{ name: string; address?: string | undefined }>;
  onChange: (rows: PasteDraftRow[]) => void;
  onSubmit: (action: BulkImportAction) => void | Promise<void>;
}) {
  const selectedCount = manualRowsFromDraft(props.rows).length;
  const locked = props.action === "disabled" || props.action === "start-new-required";
  const actionLabel = props.pending ? "正在保存…"
    : props.action === "correct-rejected" ? `重试已修正的失败行（${selectedCount} 行）`
      : props.action === "start-new-required" ? "请先开始新一批"
        : `保存所选 ${selectedCount} 行`;
  const update = (rowId: string, patch: Partial<PasteDraftRow>) => props.onChange(props.rows.map((row) => {
    if (row.rowId !== rowId) return row;
    const next = {
      ...row,
      ...patch,
      ...(patch.confirmSeparateBranch === true ? { selected: true } : {})
    };
    const error = validateManualDraft(next);
    const withoutOldHint = { ...next, error };
    delete withoutOldHint.hint;
    const classified = classifyPasteDraftRow(withoutOldHint, props.existingRestaurants ?? []);
    const wasBlocked = pasteDraftRowIsBlocked(row);
    const isBlocked = pasteDraftRowIsBlocked(classified);
    return wasBlocked && !isBlocked ? { ...classified, selected: true } : classified;
  }));
  return (
    <div className="import-preview">
      {props.overflow ? <p className="inline-error" role="alert">名单超过 60 个非空行，请删减后重新预览。</p> : null}
      <div className="import-row import-row-heading" aria-hidden="true"><span>选择</span><span>名称</span><span>地址</span><span>分店确认</span></div>
      {props.rows.map((row) => (
        <div className="import-row" key={row.rowId}>
          <label className="row-selector"><span className="sr-only">选择 {row.rowId}</span><input type="checkbox" checked={row.selected} disabled={Boolean(row.error || row.hint === "duplicate" || (row.hint === "ambiguous_branch" && !row.confirmSeparateBranch))} onChange={(event) => update(row.rowId, { selected: event.target.checked })} /></label>
          <label><span className="sr-only">餐厅名称</span><input value={row.name} maxLength={200} onChange={(event) => update(row.rowId, { name: event.target.value })} /></label>
          <label><span className="sr-only">餐厅地址</span><input value={row.address} maxLength={500} onChange={(event) => update(row.rowId, { address: event.target.value })} /></label>
          <label className="branch-check"><input type="checkbox" checked={row.confirmSeparateBranch} disabled={row.hint === "duplicate"} onChange={(event) => update(row.rowId, { confirmSeparateBranch: event.target.checked })} /><span>确认是独立分店</span></label>
          {row.error ? <small className="row-error">{pasteErrorMessage(row.error)}</small> : null}
          {row.hint ? <small className={`row-hint ${row.hint}`}>{pasteHintMessage(row.hint)}</small> : null}
        </div>
      ))}
      <div className="flow-actions"><button className="button primary" type="button" disabled={props.pending || locked || props.overflow || selectedCount === 0} onClick={() => props.onSubmit(props.action)}>{actionLabel}</button></div>
    </div>
  );
}

export function NearbyResults(props: {
  response: PoiSearchResponse;
  selectedPlaceIds: string[];
  pending: boolean;
  canSave: boolean;
  canPaginate?: boolean | undefined;
  saveLocked?: boolean | undefined;
  onToggle: (placeId: string, selected: boolean) => void;
  onPage: (page: number) => void;
  onSave: () => void | Promise<void>;
}) {
  return (
    <div className="nearby-results">
      <p className="provider-attribution">{props.response.attribution}</p>
      <div className="poi-list">
        {props.response.candidates.map((candidate) => (
          <label className="poi-row" key={candidate.placeId}>
            <input type="checkbox" checked={props.selectedPlaceIds.includes(candidate.placeId)} onChange={(event) => props.onToggle(candidate.placeId, event.target.checked)} />
            <span><strong>{candidate.name}</strong><small>{candidate.address || "地址未提供"}</small><small>{candidate.category || "分类未提供"}{candidate.distanceMeters === null ? " · 直线距离未知" : ` · 直线距离 ${Math.round(candidate.distanceMeters)} 米`}</small></span>
          </label>
        ))}
      </div>
      <div className="pagination" aria-label="附近搜索分页">
        <button className="button ghost compact" type="button" disabled={props.pending || props.canPaginate === false || props.response.page <= 1} onClick={() => props.onPage(props.response.page - 1)}>上一页</button>
        <span>第 {props.response.page} / 3 页</span>
        <button className="button ghost compact" type="button" disabled={props.pending || props.canPaginate === false || !props.response.hasMore || props.response.page >= 3} onClick={() => props.onPage(props.response.page + 1)}>下一页</button>
      </div>
      <div className="flow-actions">
        <span>已选 {props.selectedPlaceIds.length} 家</span>
        {props.canSave ? <button className="button primary" type="button" disabled={props.pending || props.saveLocked || props.selectedPlaceIds.length === 0} onClick={props.onSave}>{props.saveLocked ? "请先处理当前保存结果" : "预览并保存所选餐厅"}</button> : <small>当前仅可搜索，不能保存结果。</small>}
      </div>
    </div>
  );
}

function PoiSavePreview(props: {
  candidates: PoiCandidate[];
  pending: boolean;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
}) {
  return (
    <div className="poi-save-preview">
      <strong>确认保存 {props.candidates.length} 家餐厅</strong>
      <p>只保存名称、地址和来源信息；不会推断价格、步行时间、推荐菜或同事体验。</p>
      <ul>{props.candidates.map((candidate) => <li key={candidate.placeId}><strong>{candidate.name}</strong><span>{candidate.address || "地址未提供"}</span></li>)}</ul>
      <div className="flow-actions">
        <button className="button ghost compact" type="button" disabled={props.pending} onClick={props.onCancel}>返回选择</button>
        <button className="button primary compact" type="button" disabled={props.pending || props.candidates.length === 0} onClick={props.onSave}>{props.pending ? "正在保存…" : "确认保存"}</button>
      </div>
    </div>
  );
}

export function ImportFeedback(props: {
  state: ImportControllerState;
  onRetry: () => void | Promise<void>;
  onCorrect: (rows: Record<string, RestaurantImportRow>) => void | Promise<void>;
  onStartNew: () => void;
}) {
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  if (props.state.kind === "idle") return null;
  const rejected = props.state.results.filter((result) => result.status === "rejected");
  const requestRows = new Map(Object.entries(props.state.rowsById));
  const corrections = props.state.kind === "complete" ? Object.fromEntries(rejected.flatMap((result) => {
    const row = requestRows.get(result.rowId);
    if (!row) return [];
    if (row.kind === "poi" && (result.code !== "ambiguous_branch" || !confirmed[result.rowId])) {
      return [];
    }
    return [[result.rowId, {
      ...row,
      ...(confirmed[result.rowId] ? { confirmSeparateBranch: true } : {})
    }]];
  })) : {};
  const title = props.state.kind === "recovery" ? "保存结果尚未确认"
    : props.state.kind === "submitting" ? "正在保存"
      : "保存结果";
  return (
    <div className={`import-feedback${props.state.kind === "recovery" ? " recovery" : ""}`} aria-live="polite" {...(props.state.kind === "recovery" ? { role: "alert" } : {})}>
      <strong>{title}</strong>
      <p>请求记录：{props.state.requestIds.join("、")}</p>
      {props.state.results.length > 0 ? <ul>{props.state.results.map((result) => <ImportResult key={result.rowId} result={result} />)}</ul> : null}
      {props.state.kind === "recovery" ? (
        <>
          <p>{onboardingErrorMessage(props.state.error)} 当前请求和此前已知结果都已保留。</p>
          <button className="button secondary compact" type="button" onClick={props.onRetry}>用同一请求安全重试</button>
        </>
      ) : null}
      {props.state.kind === "complete" ? rejected.map((result) => result.code === "ambiguous_branch" ? (
        <label className="branch-check" key={result.rowId}><input type="checkbox" checked={confirmed[result.rowId] ?? false} onChange={(event) => setConfirmed({ ...confirmed, [result.rowId]: event.target.checked })} /><span>{result.rowId}：确认是独立分店</span></label>
      ) : null) : null}
      {Object.keys(corrections).length > 0 ? <button className="button secondary compact" type="button" onClick={() => props.onCorrect(corrections)}>用新请求重试已修正的失败行</button> : null}
      {props.state.kind === "complete" ? <button className="button ghost compact" type="button" onClick={props.onStartNew}>开始新一批</button> : null}
    </div>
  );
}

function ImportResult({ result }: { result: RestaurantImportRowResult }) {
  const label = result.status === "created" ? "已创建" : result.status === "existing" ? "已存在，已跳过" : "未保存";
  return <li className={result.status}><strong>{result.rowId} · {label}</strong><span>{result.message}</span></li>;
}

function sameCenter(left: PoiSearchCenter | null, right: PoiSearchCenter | null): boolean {
  return Boolean(left && right && left.label === right.label && left.latitude === right.latitude && left.longitude === right.longitude && left.coordinateSystem === right.coordinateSystem);
}

function searchConfigurationIsCurrent(
  configuration: NearbySearchState["configuration"],
  groupId: string,
  center: PoiSearchCenter | null,
  keyword: string,
  radius: number
): boolean {
  return Boolean(configuration && center
    && configuration.groupId === groupId
    && sameCenter(configuration.center, center)
    && configuration.keyword === keyword.trim()
    && configuration.radius === radius);
}

function clampRadius(value: number): number {
  if (!Number.isFinite(value)) return 3000;
  return Math.max(500, Math.min(5000, Math.round(value)));
}

function pasteErrorMessage(code: string): string {
  if (code === "name_required") return "名称不能为空";
  if (code === "too_many_columns") return "只能使用名称和地址两列";
  if (code === "field_too_long") return "名称或地址过长";
  return "请修正这一行";
}

function pasteHintMessage(code: "duplicate" | "ambiguous_branch"): string {
  return code === "duplicate"
    ? "餐厅库已有同名同址记录，默认跳过"
    : "餐厅库已有同名记录：补充不同地址，或确认是独立分店后再选择";
}

function pasteDraftRowIsBlocked(row: PasteDraftRow): boolean {
  return Boolean(row.error || row.hint === "duplicate"
    || (row.hint === "ambiguous_branch" && !row.confirmSeparateBranch));
}

function onboardingErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.code === "restaurant_bulk_import_disabled") return "当前小组未开启批量粘贴。";
    if (error.code === "poi_search_disabled") return "当前小组未开启附近搜索。";
    if (error.code === "poi_save_disabled") return "当前小组未开启搜索结果保存。";
    if (error.code === "poi_provider_unavailable") return "位置服务暂时不可用，请稍后重试。";
    if (error.code === "import_request_conflict") return "请求编号与原始内容不一致，请使用新的修正请求。";
    if (error.status === 429) return "操作较频繁，请稍后再试。";
  }
  return "操作结果尚未确认，请保留当前内容后重试。";
}
