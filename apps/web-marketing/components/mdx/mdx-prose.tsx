import type { AnchorHTMLAttributes, HTMLAttributes } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Shared MDX renderer styles for long-form content (support articles, blog
// posts, legal pages). Passed to next-mdx-remote's `components` prop.
//
// Each mapping is typed with plain React HTMLAttributes so we don't take a
// dependency on `@mdx-js/react` or `mdx/types` — next-mdx-remote accepts any
// `Record<string, ComponentType>` shape.
//
// The goal is editorial readability: generous line height, narrow measure,
// display-font headings that echo the homepage, and the brand tick-rule as
// the horizontal divider.

const proseHeading = 'font-display text-foreground-strong font-medium tracking-tight'

type HProps = HTMLAttributes<HTMLHeadingElement>
type PProps = HTMLAttributes<HTMLParagraphElement>
type DivProps = HTMLAttributes<HTMLDivElement>
type ListProps = HTMLAttributes<HTMLUListElement>
type OListProps = HTMLAttributes<HTMLOListElement>
type LIProps = HTMLAttributes<HTMLLIElement>
type QuoteProps = HTMLAttributes<HTMLQuoteElement>
type CodeProps = HTMLAttributes<HTMLElement>
type PreProps = HTMLAttributes<HTMLPreElement>
type AProps = AnchorHTMLAttributes<HTMLAnchorElement>
type HRProps = HTMLAttributes<HTMLHRElement>
type StrongProps = HTMLAttributes<HTMLElement>

export const mdxComponents = {
  h1: ({ className, ...props }: HProps) => (
    <h1 className={cn(proseHeading, 'mt-0 mb-8 text-4xl leading-[1.1] md:text-5xl', className)} {...props} />
  ),
  h2: ({ className, ...props }: HProps) => (
    <h2 className={cn(proseHeading, 'mt-16 mb-6 text-2xl leading-tight md:text-3xl', className)} {...props} />
  ),
  h3: ({ className, ...props }: HProps) => (
    <h3 className={cn(proseHeading, 'mt-12 mb-4 text-xl leading-tight md:text-2xl', className)} {...props} />
  ),
  h4: ({ className, ...props }: HProps) => (
    <h4 className={cn('text-foreground-strong mt-8 mb-3 text-base font-medium', className)} {...props} />
  ),
  p: ({ className, ...props }: PProps) => (
    <p className={cn('text-foreground my-5 leading-[1.75]', className)} {...props} />
  ),
  a: ({ className, href, ...props }: AProps) => (
    <Link
      href={href ?? '#'}
      className={cn(
        'text-accent hover:text-accent-strong underline decoration-[color:var(--color-accent)]/40 decoration-1 underline-offset-4 transition-colors hover:decoration-[color:var(--color-accent-strong)]',
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }: ListProps) => (
    <ul className={cn('text-foreground my-5 ml-6 list-disc space-y-2', className)} {...props} />
  ),
  ol: ({ className, ...props }: OListProps) => (
    <ol className={cn('text-foreground my-5 ml-6 list-decimal space-y-2', className)} {...props} />
  ),
  li: ({ className, ...props }: LIProps) => <li className={cn('leading-[1.75]', className)} {...props} />,
  blockquote: ({ className, ...props }: QuoteProps) => (
    <blockquote
      className={cn('border-accent/40 text-foreground-strong my-8 border-l-2 pl-6 text-lg italic', className)}
      {...props}
    />
  ),
  code: ({ className, ...props }: CodeProps) => (
    <code
      className={cn('bg-accent/10 text-accent rounded px-1.5 py-0.5 font-mono text-[0.85em]', className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }: PreProps) => (
    <pre
      className={cn(
        'glass-tile-sm text-foreground my-8 overflow-x-auto p-5 font-mono text-sm leading-relaxed',
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }: HRProps) => (
    <hr className={cn('tick-rule my-12 border-0', className)} aria-hidden {...props} />
  ),
  strong: ({ className, ...props }: StrongProps) => (
    <strong className={cn('text-foreground-strong font-semibold', className)} {...props} />
  ),
}
