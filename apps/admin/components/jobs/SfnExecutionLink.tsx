export function SfnExecutionLink({ url }: { url: string | null }) {
  if (!url) return null

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
      View in AWS Console ↗
    </a>
  )
}
