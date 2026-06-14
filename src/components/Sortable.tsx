import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable'
import { GripIcon } from './Icons'

/**
 * A vertical drag-to-reorder list. Owns the dnd-kit sensors and the index math so callers
 * only supply the current id order and a reorder callback. Render the rows (each via
 * {@link useSortableRow}) as `children`.
 */
export function SortableList({
    ids,
    onReorder,
    children,
}: {
    ids: string[]
    onReorder: (orderedIds: string[]) => void
    children: ReactNode
}) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    function onDragEnd(e: DragEndEvent) {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const from = ids.indexOf(String(active.id))
        const to = ids.indexOf(String(over.id))
        if (from < 0 || to < 0) return
        onReorder(arrayMove(ids, from, to))
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {children}
            </SortableContext>
        </DndContext>
    )
}

/** The grab handle for a sortable row. Pass `handleProps` from {@link useSortableRow}. */
export function DragHandle({
    iconClassName = 'h-4 w-4',
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { iconClassName?: string }) {
    return (
        <button
            type="button"
            aria-label="Drag to reorder"
            className={`cursor-grab touch-none text-zinc-600 hover:text-zinc-400 ${className}`}
            {...props}
        >
            <GripIcon className={iconClassName} />
        </button>
    )
}
