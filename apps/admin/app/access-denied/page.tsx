export default function AccessDeniedPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to view the admin dashboard.</p>
      </div>
    </div>
  )
}
