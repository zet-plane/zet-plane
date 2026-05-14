export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      This project doesn't have any work nodes yet.
    </div>
  );
}

export function LoadingState({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
        Failed to load graph: {error.message}
      </div>
    </div>
  );
}
