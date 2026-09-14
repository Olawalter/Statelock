import type { ComponentProps, ReactNode } from "react";

export function Field({
  label,
  hint,
  htmlFor,
  counter,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor: string;
  counter?: { value: number; max: number };
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {counter ? (
          <span className={`font-mono text-[11px] ${counter.value > counter.max ? "text-no" : "text-dim"}`}>
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-dim">{hint}</p> : null}
    </div>
  );
}

const control =
  "w-full border border-line bg-ink px-3 py-2.5 text-sm text-text placeholder:text-dim/60 transition-colors hover:border-dim focus:border-signal focus:outline-none";

export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function TextArea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${control} min-h-24 resize-y leading-relaxed ${props.className ?? ""}`} />;
}

export function SelectInput(props: ComponentProps<"select">) {
  return <select {...props} className={`${control} appearance-none bg-ink ${props.className ?? ""}`} />;
}
