export function PageHeader({ title, description, action }) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div>
        <span className="mb-1.5 block h-[3px] w-9 bg-gold" />
        <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-[28px]" data-testid="page-header-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
