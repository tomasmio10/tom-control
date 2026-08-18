export function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><span>⌕</span><p>{message}</p></div>
}
