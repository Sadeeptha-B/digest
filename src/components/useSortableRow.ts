import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function useSortableRow(id: string) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    return {
        setNodeRef,
        style: { transform: CSS.Transform.toString(transform), transition },
        isDragging,
        handleProps: { ...attributes, ...listeners },
    }
}