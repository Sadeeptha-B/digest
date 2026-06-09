import { createContext, useContext, useEffect } from 'react'

// Lets a page publish a heading into the shared Layout header (centered). Layout owns the state and
// renders it; pages call usePageTitle(...) to set it for their lifetime. Strings (not nodes) keep
// the effect deps stable so frequent page re-renders don't thrash the header.
export interface PageHeading {
  title: string
  subtitle?: string
}

export const PageTitleContext = createContext<(heading: PageHeading | null) => void>(() => {})

export function usePageTitle(title: string | null, subtitle?: string) {
  const set = useContext(PageTitleContext)
  useEffect(() => {
    set(title ? { title, subtitle } : null)
    return () => set(null)
  }, [title, subtitle, set])
}
