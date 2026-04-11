export function PageHeader({
  title,
  breadcrumb,
  actions,
}: {
  title: string
  breadcrumb?: { label: string; href: string }
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        {breadcrumb && (
          <a href={breadcrumb.href} className="text-sm text-muted-foreground hover:text-foreground">
            ← {breadcrumb.label}
          </a>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
