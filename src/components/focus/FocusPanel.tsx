import { BreathingPacer } from './BreathingPacer'
import { AmbientBlob } from './AmbientBlob'
import { BrainDumpPad } from './BrainDumpPad'

// Low-stimulation tools for when attention wanders: regulate (breathe), rest the eyes (ambient
// blob), and offload intrusive thoughts (brain dump). Lives under the video as a horizontal row
// so it stays accessible while the transcript occupies the side panel. Stacks on small screens.
export function FocusPanel() {
  return (
    <div className="mt-3 flex shrink-0 flex-col gap-3 sm:h-44 sm:flex-row">
      <BreathingPacer />
      <AmbientBlob />
      <BrainDumpPad />
    </div>
  )
}
