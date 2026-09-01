export default function NotFoundPage() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-center" data-testid="not-found-page">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-muted-foreground">This page doesn't exist.</p>
    </div>
  );
}
