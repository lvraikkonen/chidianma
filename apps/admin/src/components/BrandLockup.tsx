export function BrandLockup(props: {
  subtitle: string;
  compact?: boolean | undefined;
}) {
  return (
    <span className={props.compact ? "brand-lockup compact" : "brand-lockup"}>
      <img className="brand-mark" src="/brand-mark.svg" alt="" />
      <span>
        <strong>中午吃点啥</strong>
        <small>{props.subtitle}</small>
      </span>
    </span>
  );
}
