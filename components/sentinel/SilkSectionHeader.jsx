export function SilkSectionHeader({ icon: Icon, title, description, iconClass }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[1.0625rem] font-extrabold tracking-tight text-[var(--silk-text-strong)] lg:text-lg">
          {title}
        </h3>
        {description ? (
          <p className="mt-1.5 text-sm font-bold leading-relaxed text-[var(--silk-text-muted)] lg:text-[0.9375rem]">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
