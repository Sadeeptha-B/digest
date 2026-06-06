import { CheckIcon } from './Icons'

export function VideoThumbnail({
    thumbnailUrl,
    watched = false,
    className,
    checkClassName = 'h-5 w-5',
}: {
    thumbnailUrl?: string
    watched?: boolean
    className: string
    checkClassName?: string
}) {
    return (
        <div className={className}>
            {thumbnailUrl ? <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" /> : null}
            {watched && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-accent-400">
                    <CheckIcon className={checkClassName} />
                </span>
            )}
        </div>
    )
}