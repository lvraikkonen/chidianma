import type {
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  GroupSummary,
  PatchRecommendationRequest,
  PatchRestaurantRequest,
  RecommendationSummary,
  RestaurantStatus,
  RestaurantSummary,
  WeatherTag,
  WeekdayTag
} from "@lunch/shared";
import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "../components/Modal";
import {
  filterRestaurants,
  recommendationPermissions,
  restaurantPermissions,
  type CreateRestaurantEntryInput,
  type RestaurantEntryState
} from "../features/restaurants/restaurantModel";

type ModalState =
  | { kind: "create" }
  | { kind: "edit-restaurant"; restaurant: RestaurantSummary }
  | { kind: "create-recommendation"; restaurant: RestaurantSummary }
  | {
      kind: "edit-recommendation";
      restaurant: RestaurantSummary;
      recommendation: RecommendationSummary;
    }
  | null;

interface RestaurantsPageProps {
  group: GroupSummary;
  restaurants: RestaurantSummary[];
  loading: boolean;
  loadError?: string | undefined;
  operationError?: string | undefined;
  entryState: RestaurantEntryState;
  onRetryLoad: () => void | Promise<void>;
  onCreateEntry: (
    input: CreateRestaurantEntryInput
  ) => RestaurantEntryState | Promise<RestaurantEntryState>;
  onRetryEntry: () => RestaurantEntryState | Promise<RestaurantEntryState>;
  onRecheckEntry: () => RestaurantEntryState | Promise<RestaurantEntryState>;
  onPatchRestaurant: (
    restaurantId: string,
    input: PatchRestaurantRequest
  ) => boolean | Promise<boolean>;
  onCreateRecommendation: (
    input: CreateRecommendationRequest
  ) => boolean | Promise<boolean>;
  onPatchRecommendation: (
    recommendationId: string,
    input: PatchRecommendationRequest
  ) => boolean | Promise<boolean>;
}

const statuses: Array<{ value: "all" | RestaurantStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "active", label: "正常" },
  { value: "paused", label: "暂停" },
  { value: "blocked", label: "避雷" }
];

const weatherTags: Array<{ value: WeatherTag; label: string }> = [
  { value: "rainy", label: "下雨" },
  { value: "hot", label: "炎热" },
  { value: "cold", label: "寒冷" },
  { value: "clear", label: "晴朗" },
  { value: "windy", label: "大风" }
];

const weekdayTags: Array<{ value: WeekdayTag; label: string }> = [
  { value: "monday", label: "周一" },
  { value: "tuesday", label: "周二" },
  { value: "wednesday", label: "周三" },
  { value: "thursday", label: "周四" },
  { value: "friday", label: "周五" }
];

export function RestaurantsPage(props: RestaurantsPageProps) {
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [status, setStatus] = useState<"all" | RestaurantStatus>("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState(false);
  const cuisines = useMemo(() => Array.from(new Set(
    props.restaurants.map((restaurant) => restaurant.cuisine).filter(Boolean)
  )).sort() as string[], [props.restaurants]);
  const visible = filterRestaurants(props.restaurants, { query, cuisine, status });
  const partialState = props.entryState.kind === "recovery"
    ? props.entryState
    : null;

  async function runRecoveryAction(action: "retry" | "recheck") {
    setPending(true);
    const next = action === "retry"
      ? await props.onRetryEntry()
      : await props.onRecheckEntry();
    setPending(false);
    if (next.kind === "complete") setModal(null);
  }

  return (
    <section className="restaurants-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{props.group.name} · 团队知识库</span>
          <h1>餐厅库</h1>
          <p className="lead">保存团队常吃的餐厅和具体推荐，让每天的选择更贴近真实经验。</p>
        </div>
        <button className="button primary" type="button" onClick={() => setModal({ kind: "create" })}>
          新增餐厅
        </button>
      </header>

      {props.loadError ? (
        <div className="inline-error" role="alert">
          {props.loadError}{" "}
          <button className="text-button" type="button" onClick={props.onRetryLoad}>重新加载</button>
        </div>
      ) : null}
      {props.operationError ? <p className="inline-error" role="alert">{props.operationError}</p> : null}
      {partialState ? (
        <div className="partial-success" aria-live="polite">
          <div>
            <strong>{recoveryTitle(partialState)}</strong>
            <p>{partialState.message}</p>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={pending}
            onClick={() => runRecoveryAction(
              partialState.verdict === "confirmed-missing" ? "retry" : "recheck"
            )}
          >
            {pending
              ? "正在核对…"
              : partialState.verdict === "confirmed-missing"
                ? "安全重试"
                : "重新核对"}
          </button>
        </div>
      ) : null}

      <div className="toolbar" aria-label="筛选餐厅">
        <label className="search-field">
          <span>搜索</span>
          <input
            type="search"
            placeholder="餐厅、区域、菜系或推荐菜"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>菜系</span>
          <select value={cuisine} onChange={(event) => setCuisine(event.target.value)}>
            <option value="">全部菜系</option>
            {cuisines.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="segment" aria-label="餐厅状态">
          {statuses.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="result-count" aria-live="polite">
        {props.loading ? "正在读取餐厅…" : `显示 ${visible.length} / ${props.restaurants.length} 家餐厅`}
      </p>

      {!props.loading && props.restaurants.length === 0 ? (
        <div className="empty-state">
          <h2>先添加 5–10 家常去餐厅</h2>
          <p>从团队真正熟悉的选择开始，推荐会更可靠。</p>
          <button className="button primary" type="button" onClick={() => setModal({ kind: "create" })}>
            新增餐厅
          </button>
        </div>
      ) : !props.loading && visible.length === 0 ? (
        <div className="empty-state">
          <h2>没有符合筛选的餐厅</h2>
          <p>换个关键词或状态试试。</p>
        </div>
      ) : visible.length > 0 ? (
        <RestaurantTable
          group={props.group}
          restaurants={visible}
          pending={pending}
          onOpenModal={setModal}
          onPatchRestaurant={async (restaurantId, input) => {
            setPending(true);
            await props.onPatchRestaurant(restaurantId, input);
            setPending(false);
          }}
        />
      ) : null}

      <Modal
        open={modal !== null}
        title={modalTitle(modal)}
        pending={pending}
        onClose={() => setModal(null)}
      >
        {modal?.kind === "create" ? (
          <CreateRestaurantForm
            restaurants={props.restaurants}
            entryState={props.entryState}
            pending={pending}
            onSubmit={async (input) => {
              setPending(true);
              const next = await props.onCreateEntry(input);
              setPending(false);
              if (next.kind === "complete") setModal(null);
            }}
            onRetry={() => runRecoveryAction("retry")}
            onRecheck={() => runRecoveryAction("recheck")}
            onCancel={() => setModal(null)}
          />
        ) : null}
        {modal?.kind === "edit-restaurant" ? (
          <RestaurantForm
            restaurant={modal.restaurant}
            pending={pending}
            onSubmit={async (input) => {
              setPending(true);
              const saved = await props.onPatchRestaurant(modal.restaurant.id, input);
              setPending(false);
              if (saved) setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        ) : null}
        {modal?.kind === "create-recommendation" ? (
          <RecommendationForm
            restaurant={modal.restaurant}
            pending={pending}
            onSubmit={async (input) => {
              setPending(true);
              const saved = await props.onCreateRecommendation(input as CreateRecommendationRequest);
              setPending(false);
              if (saved) setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        ) : null}
        {modal?.kind === "edit-recommendation" ? (
          <RecommendationForm
            restaurant={modal.restaurant}
            recommendation={modal.recommendation}
            pending={pending}
            onSubmit={async (input) => {
              const { restaurantId: _restaurantId, ...patch } = input;
              setPending(true);
              const saved = await props.onPatchRecommendation(modal.recommendation.id, patch);
              setPending(false);
              if (saved) setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        ) : null}
      </Modal>
    </section>
  );
}

function RestaurantTable(props: {
  group: GroupSummary;
  restaurants: RestaurantSummary[];
  pending: boolean;
  onOpenModal: (modal: Exclude<ModalState, null>) => void;
  onPatchRestaurant: (restaurantId: string, input: PatchRestaurantRequest) => Promise<void>;
}) {
  return (
    <div className="table-wrap">
      <table className="restaurant-table">
        <thead>
          <tr>
            <th>餐厅</th><th>区域 / 菜系</th><th>价格 / 距离</th><th>团队推荐</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {props.restaurants.map((restaurant) => {
            const permissions = restaurantPermissions(props.group, restaurant);
            return (
              <tr key={restaurant.id}>
                <td data-label="餐厅">
                  <strong>{restaurant.name}</strong>
                  {restaurant.address ? <small>{restaurant.address}</small> : null}
                  {restaurant.tags.length > 0 ? (
                    <div className="chip-row">{restaurant.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div>
                  ) : null}
                </td>
                <td data-label="区域 / 菜系">
                  <span>{restaurant.area || "未填写区域"}</span>
                  <small>{restaurant.cuisine || "未填写菜系"}</small>
                </td>
                <td data-label="价格 / 距离">
                  <span>{formatPrice(restaurant)}</span>
                  <small>{restaurant.distanceMinutes === undefined ? "距离未知" : `${restaurant.distanceMinutes} 分钟`}</small>
                </td>
                <td data-label="团队推荐">
                  <div className="recommendation-list">
                    {restaurant.recommendations.length === 0 ? <small>还没有具体推荐</small> : null}
                    {restaurant.recommendations.map((recommendation) => (
                      <div className="recommendation-row" key={recommendation.id}>
                        <div>
                          <strong>{recommendation.dish || "到店再选"}</strong>
                          <small>{recommendation.reason}</small>
                        </div>
                        {recommendationPermissions(props.group, recommendation).canEdit ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => props.onOpenModal({
                              kind: "edit-recommendation",
                              restaurant,
                              recommendation
                            })}
                          >
                            编辑推荐
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => props.onOpenModal({ kind: "create-recommendation", restaurant })}
                    >
                      添加推荐
                    </button>
                  </div>
                </td>
                <td data-label="状态"><StatusBadge status={restaurant.status} /></td>
                <td data-label="操作">
                  <div className="row-actions">
                    {permissions.canEdit ? (
                      <button className="text-button" type="button" onClick={() => props.onOpenModal({ kind: "edit-restaurant", restaurant })}>
                        编辑餐厅
                      </button>
                    ) : null}
                    {permissions.canManageStatus ? (
                      <StatusActions
                        restaurant={restaurant}
                        pending={props.pending}
                        onPatch={props.onPatchRestaurant}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: RestaurantStatus }) {
  const label = status === "active" ? "正常" : status === "paused" ? "暂停" : "避雷";
  return <span className={`status-badge ${status}`}>{label}</span>;
}

function StatusActions(props: {
  restaurant: RestaurantSummary;
  pending: boolean;
  onPatch: (restaurantId: string, input: PatchRestaurantRequest) => Promise<void>;
}) {
  const { restaurant } = props;
  return (
    <>
      {restaurant.status === "active" ? (
        <button className="text-button" type="button" disabled={props.pending} onClick={() => props.onPatch(restaurant.id, { status: "paused" })}>
          暂停餐厅
        </button>
      ) : (
        <button className="text-button" type="button" disabled={props.pending} onClick={() => props.onPatch(restaurant.id, { status: "active" })}>
          恢复餐厅
        </button>
      )}
      {restaurant.status !== "blocked" ? (
        <button className="text-button danger" type="button" disabled={props.pending} onClick={() => props.onPatch(restaurant.id, { status: "blocked" })}>
          设为避雷
        </button>
      ) : null}
    </>
  );
}

function RestaurantForm(props: {
  restaurant: RestaurantSummary;
  pending: boolean;
  onSubmit: (input: PatchRestaurantRequest) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => restaurantValues(props.restaurant));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onSubmit(restaurantPatch(values));
  }
  return (
    <form onSubmit={submit}>
      <div className="modal-body"><RestaurantFields values={values} onChange={setValues} /></div>
      <div className="modal-footer">
        <button className="button ghost" type="button" disabled={props.pending} onClick={props.onCancel}>取消</button>
        <button className="button primary" type="submit" disabled={props.pending}>{props.pending ? "正在保存…" : "保存餐厅"}</button>
      </div>
    </form>
  );
}

function CreateRestaurantForm(props: {
  restaurants: RestaurantSummary[];
  entryState: RestaurantEntryState;
  pending: boolean;
  onSubmit: (input: CreateRestaurantEntryInput) => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onRecheck: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => restaurantValues());
  const [dish, setDish] = useState("");
  const [reason, setReason] = useState("");
  const [weather, setWeather] = useState<WeatherTag[]>([]);
  const [weekdays, setWeekdays] = useState<WeekdayTag[]>([]);
  const [moods, setMoods] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onSubmit({
      restaurant: restaurantCreate(values),
      dish: dish.trim(),
      reason: reason.trim(),
      weatherTags: weather,
      weekdayTags: weekdays,
      moodTags: commaValues(moods)
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <RestaurantFields values={values} onChange={setValues} autofocus />
        <div className="form-section-heading">
          <span className="eyebrow">首条团队经验</span>
          <h3>同时保存一条具体推荐</h3>
        </div>
        <RecommendationFields
          dish={dish}
          reason={reason}
          weather={weather}
          weekdays={weekdays}
          moods={moods}
          onDish={setDish}
          onReason={setReason}
          onWeather={setWeather}
          onWeekdays={setWeekdays}
          onMoods={setMoods}
        />
        {props.entryState.kind === "recovery" ? (
          <div className="partial-success" aria-live="polite">
            <div>
              <strong>{recoveryTitle(props.entryState)}</strong>
              <p>{props.entryState.message}</p>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={props.pending}
              onClick={
                props.entryState.verdict === "confirmed-missing"
                  ? props.onRetry
                  : props.onRecheck
              }
            >
              {props.entryState.verdict === "confirmed-missing"
                ? "安全重试"
                : "重新核对"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="modal-footer">
        <button className="button ghost" type="button" disabled={props.pending} onClick={props.onCancel}>取消</button>
        <button className="button primary" type="submit" disabled={props.pending || props.entryState.kind === "recovery" || props.entryState.kind === "checking"}>
          {props.pending ? "正在保存…" : "保存餐厅和推荐"}
        </button>
      </div>
    </form>
  );
}

function RecommendationForm(props: {
  restaurant: RestaurantSummary;
  recommendation?: RecommendationSummary | undefined;
  pending: boolean;
  onSubmit: (input: CreateRecommendationRequest) => void | Promise<void>;
  onCancel: () => void;
}) {
  const current = props.recommendation;
  const [dish, setDish] = useState(current?.dish ?? "");
  const [reason, setReason] = useState(current?.reason ?? "");
  const [weather, setWeather] = useState<WeatherTag[]>(
    (current?.weatherTags ?? []).filter(isWeatherTag)
  );
  const [weekdays, setWeekdays] = useState<WeekdayTag[]>(
    (current?.weekdayTags ?? []).filter(isWeekdayTag)
  );
  const [moods, setMoods] = useState((current?.moodTags ?? []).join("、"));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onSubmit({
      restaurantId: props.restaurant.id,
      ...(dish.trim() ? { dish: dish.trim() } : {}),
      reason: reason.trim(),
      weatherTags: weather,
      weekdayTags: weekdays,
      moodTags: commaValues(moods)
    });
  }
  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <p className="form-context">为「{props.restaurant.name}」{current ? "编辑推荐" : "添加推荐"}</p>
        <RecommendationFields
          dish={dish}
          reason={reason}
          weather={weather}
          weekdays={weekdays}
          moods={moods}
          onDish={setDish}
          onReason={setReason}
          onWeather={setWeather}
          onWeekdays={setWeekdays}
          onMoods={setMoods}
        />
      </div>
      <div className="modal-footer">
        <button className="button ghost" type="button" disabled={props.pending} onClick={props.onCancel}>取消</button>
        <button className="button primary" type="submit" disabled={props.pending}>{props.pending ? "正在保存…" : "保存推荐"}</button>
      </div>
    </form>
  );
}

interface RestaurantValues {
  name: string;
  area: string;
  address: string;
  distanceMinutes: string;
  cuisine: string;
  priceBand: string;
  averagePrice: string;
  supportsDineIn: boolean;
  supportsTakeout: boolean;
  tags: string;
}

function RestaurantFields(props: {
  values: RestaurantValues;
  onChange: (values: RestaurantValues) => void;
  autofocus?: boolean | undefined;
}) {
  const update = <K extends keyof RestaurantValues>(key: K, value: RestaurantValues[K]) => {
    props.onChange({ ...props.values, [key]: value });
  };
  return (
    <div className="form-grid">
      <label><span>餐厅名称 *</span><input data-autofocus={props.autofocus || undefined} required value={props.values.name} onChange={(event) => update("name", event.target.value)} /></label>
      <label><span>区域</span><input value={props.values.area} onChange={(event) => update("area", event.target.value)} /></label>
      <label className="wide"><span>详细地址</span><input value={props.values.address} onChange={(event) => update("address", event.target.value)} /></label>
      <label><span>菜系</span><input value={props.values.cuisine} onChange={(event) => update("cuisine", event.target.value)} /></label>
      <label><span>步行分钟</span><input min="0" type="number" value={props.values.distanceMinutes} onChange={(event) => update("distanceMinutes", event.target.value)} /></label>
      <label><span>价格带</span><input placeholder="例如 ¥ / ¥¥" value={props.values.priceBand} onChange={(event) => update("priceBand", event.target.value)} /></label>
      <label><span>人均（元）</span><input min="0" step="0.01" type="number" value={props.values.averagePrice} onChange={(event) => update("averagePrice", event.target.value)} /></label>
      <label className="wide"><span>标签（逗号分隔）</span><input value={props.values.tags} onChange={(event) => update("tags", event.target.value)} /></label>
      <div className="tag-picker wide" aria-label="就餐方式">
        <label><input type="checkbox" checked={props.values.supportsDineIn} onChange={(event) => update("supportsDineIn", event.target.checked)} />堂食</label>
        <label><input type="checkbox" checked={props.values.supportsTakeout} onChange={(event) => update("supportsTakeout", event.target.checked)} />外带</label>
      </div>
    </div>
  );
}

function RecommendationFields(props: {
  dish: string;
  reason: string;
  weather: WeatherTag[];
  weekdays: WeekdayTag[];
  moods: string;
  onDish: (value: string) => void;
  onReason: (value: string) => void;
  onWeather: (value: WeatherTag[]) => void;
  onWeekdays: (value: WeekdayTag[]) => void;
  onMoods: (value: string) => void;
}) {
  return (
    <div className="form-grid">
      <label><span>推荐菜 *</span><input required value={props.dish} onChange={(event) => props.onDish(event.target.value)} /></label>
      <label className="wide"><span>推荐理由 *</span><textarea required rows={3} value={props.reason} onChange={(event) => props.onReason(event.target.value)} /></label>
      <fieldset className="wide"><legend>适合天气</legend><TagOptions options={weatherTags} selected={props.weather} onChange={props.onWeather} /></fieldset>
      <fieldset className="wide"><legend>适合工作日</legend><TagOptions options={weekdayTags} selected={props.weekdays} onChange={props.onWeekdays} /></fieldset>
      <label className="wide"><span>适合心情（逗号分隔）</span><input value={props.moods} onChange={(event) => props.onMoods(event.target.value)} /></label>
    </div>
  );
}

function TagOptions<T extends string>(props: {
  options: Array<{ value: T; label: string }>;
  selected: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <div className="tag-picker">
      {props.options.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={props.selected.includes(option.value)}
            onChange={(event) => props.onChange(event.target.checked
              ? [...props.selected, option.value]
              : props.selected.filter((value) => value !== option.value))}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function restaurantValues(restaurant?: RestaurantSummary): RestaurantValues {
  return {
    name: restaurant?.name ?? "",
    area: restaurant?.area ?? "",
    address: restaurant?.address ?? "",
    distanceMinutes: restaurant?.distanceMinutes?.toString() ?? "",
    cuisine: restaurant?.cuisine ?? "",
    priceBand: restaurant?.priceBand ?? "",
    averagePrice: restaurant?.averagePriceCents === undefined
      ? ""
      : (restaurant.averagePriceCents / 100).toString(),
    supportsDineIn: restaurant?.supportsDineIn ?? true,
    supportsTakeout: restaurant?.supportsTakeout ?? true,
    tags: restaurant?.tags.join("、") ?? ""
  };
}

function restaurantCreate(values: RestaurantValues): CreateRestaurantRequest {
  return {
    name: values.name.trim(),
    ...optionalCreateFields(values),
    supportsDineIn: values.supportsDineIn,
    supportsTakeout: values.supportsTakeout,
    tags: commaValues(values.tags)
  };
}

function restaurantPatch(values: RestaurantValues): PatchRestaurantRequest {
  return {
    name: values.name.trim(),
    area: nullableText(values.area),
    address: nullableText(values.address),
    distanceMinutes: nullableNumber(values.distanceMinutes),
    cuisine: nullableText(values.cuisine),
    priceBand: nullableText(values.priceBand),
    averagePriceCents: nullableCents(values.averagePrice),
    supportsDineIn: values.supportsDineIn,
    supportsTakeout: values.supportsTakeout,
    tags: commaValues(values.tags)
  };
}

function optionalCreateFields(values: RestaurantValues) {
  const distanceMinutes = optionalNumber(values.distanceMinutes);
  const averagePriceCents = optionalCents(values.averagePrice);
  return {
    ...(values.area.trim() ? { area: values.area.trim() } : {}),
    ...(values.address.trim() ? { address: values.address.trim() } : {}),
    ...(distanceMinutes === undefined ? {} : { distanceMinutes }),
    ...(values.cuisine.trim() ? { cuisine: values.cuisine.trim() } : {}),
    ...(values.priceBand.trim() ? { priceBand: values.priceBand.trim() } : {}),
    ...(averagePriceCents === undefined ? {} : { averagePriceCents })
  };
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalCents(value: string): number | undefined {
  const number = optionalNumber(value);
  return number === undefined ? undefined : Math.round(number * 100);
}

function nullableText(value: string): string | null {
  return value.trim() || null;
}

function nullableNumber(value: string): number | null {
  return optionalNumber(value) ?? null;
}

function nullableCents(value: string): number | null {
  return optionalCents(value) ?? null;
}

function commaValues(value: string): string[] {
  return value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean);
}

function isWeatherTag(value: string): value is WeatherTag {
  return weatherTags.some((option) => option.value === value);
}

function isWeekdayTag(value: string): value is WeekdayTag {
  return weekdayTags.some((option) => option.value === value);
}

function formatPrice(restaurant: RestaurantSummary): string {
  if (restaurant.averagePriceCents !== undefined) {
    return `人均 ¥${(restaurant.averagePriceCents / 100).toFixed(0)}`;
  }
  return restaurant.priceBand || "价格未知";
}

function modalTitle(modal: ModalState): string {
  if (!modal) return "餐厅";
  if (modal.kind === "create") return "新增餐厅和首条推荐";
  if (modal.kind === "edit-restaurant") return "编辑餐厅";
  if (modal.kind === "create-recommendation") return "添加推荐";
  return "编辑推荐";
}

function recoveryTitle(
  state: Extract<RestaurantEntryState, { kind: "recovery" }>
): string {
  if (state.verdict === "uncertain") return "写入结果尚未确认";
  return state.target === "restaurant"
    ? "餐厅尚未保存"
    : "餐厅已保存，推荐尚未保存";
}
