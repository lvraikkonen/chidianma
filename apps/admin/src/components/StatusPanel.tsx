import type { ReactNode } from "react";

export function StatusPanel(props: {
  title: string;
  message: string;
  tone?: "neutral" | "error" | "success" | undefined;
  action?: ReactNode;
}) {
  return (
    <section className={`status-panel ${props.tone ?? "neutral"}`} role="status">
      <div>
        <h2>{props.title}</h2>
        <p>{props.message}</p>
      </div>
      {props.action}
    </section>
  );
}
