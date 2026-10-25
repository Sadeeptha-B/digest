import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

/** Renders the current location so tests can assert navigation. */
function LocationProbe() {
    const { pathname, search } = useLocation()
    return <output data-testid="location">{pathname + search}</output>
}

/**
 * Render a screen inside a router at `route`. `path` is the route pattern the screen is mounted
 * on (so useParams works); any other location renders only the probe.
 */
export function renderAt(ui: ReactElement, { route = '/', path = '*' }: { route?: string; path?: string } = {}) {
    const user = userEvent.setup()
    const utils = render(
        <MemoryRouter initialEntries={[route]}>
            <Routes>
                <Route
                    path={path}
                    element={
                        <>
                            {ui}
                            <LocationProbe />
                        </>
                    }
                />
                <Route path="*" element={<LocationProbe />} />
            </Routes>
        </MemoryRouter>,
    )
    return { user, ...utils }
}
