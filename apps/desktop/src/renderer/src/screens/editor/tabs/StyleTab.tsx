import React, { useRef, useState } from 'react'
import type { OverlayType } from './OverlayPickerModal'
import { OverlayPickerModal } from './OverlayPickerModal'

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  )
}

interface ColourRowProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

function ColourRow({ label, value, onChange }: ColourRowProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value
    setDraft(hex)
    onChange(hex)
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDraft(raw)
    if (isValidHex(raw)) onChange(raw)
  }

  function handleHexBlur() {
    if (!isValidHex(draft)) setDraft(value)
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="color"
          value={isValidHex(value) ? value : '#000000'}
          onChange={handleNativeChange}
          className="sr-only"
          tabIndex={-1}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="h-5 w-5 rounded border border-border"
          style={{ backgroundColor: isValidHex(value) ? value : '#000000' }}
          aria-label={`Pick colour for ${label}`}
        />
        <input
          type="text"
          value={draft}
          onChange={handleHexInput}
          onBlur={handleHexBlur}
          maxLength={7}
          className="w-20 rounded border border-border bg-accent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}

const OVERLAY_NAMES: Record<OverlayType, string> = {
  banner: 'Banner',
  'geometric-banner': 'Geometric Banner',
  esports: 'Esports',
  minimal: 'Minimal',
  modern: 'Modern',
}

export function StyleTab(): React.ReactElement {
  const [overlayType, setOverlayType] = useState<OverlayType>('banner')
  const [showOverlayPicker, setShowOverlayPicker] = useState(false)
  const [accentColour, setAccentColour] = useState('#3b82f6')
  const [bannerTimerText, setBannerTimerText] = useState('#ffffff')
  const [bannerTimerBg, setBannerTimerBg] = useState('#111111')
  const [bannerBannerBg, setBannerBannerBg] = useState('#1c1c1c')
  const [esportsOurRow, setEsportsOurRow] = useState('#3b82f6')
  const [esportsText, setEsportsText] = useState('#ffffff')

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* OVERLAY TYPE */}
      <section>
        <SectionLabel>Overlay Type</SectionLabel>
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-6 rounded-sm bg-primary opacity-80" />
            <span className="text-sm text-foreground">{OVERLAY_NAMES[overlayType]}</span>
          </div>
          <button onClick={() => setShowOverlayPicker(true)} className="text-xs text-primary hover:underline">
            Change
          </button>
        </div>
      </section>

      {/* ACCENT COLOUR */}
      <section>
        <SectionLabel>Accent Colour</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <ColourRow label="Accent" value={accentColour} onChange={setAccentColour} />
        </div>
      </section>

      {/* STYLE-SPECIFIC */}
      {overlayType === 'banner' && (
        <section>
          <SectionLabel>Banner</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Timer text" value={bannerTimerText} onChange={setBannerTimerText} />
            <div className="border-t border-border" />
            <ColourRow label="Timer background" value={bannerTimerBg} onChange={setBannerTimerBg} />
            <div className="border-t border-border" />
            <ColourRow label="Banner background" value={bannerBannerBg} onChange={setBannerBannerBg} />
          </div>
        </section>
      )}

      {overlayType === 'esports' && (
        <section>
          <SectionLabel>Leaderboard</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Our row" value={esportsOurRow} onChange={setEsportsOurRow} />
            <div className="border-t border-border" />
            <ColourRow label="Text" value={esportsText} onChange={setEsportsText} />
          </div>
        </section>
      )}

      {showOverlayPicker && (
        <OverlayPickerModal
          current={overlayType}
          onClose={() => setShowOverlayPicker(false)}
          onApply={(overlay) => { setOverlayType(overlay); setShowOverlayPicker(false) }}
        />
      )}
    </div>
  )
}
