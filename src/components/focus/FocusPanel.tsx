import { BreathingPacer } from './BreathingPacer'
import { AmbientBlob } from './AmbientBlob'
import { BrainDumpPad } from './BrainDumpPad'

// "Calm" tab — low-stimulation tools for when attention starts to wander: regulate (breathe),
// rest the eyes (ambient blob), and offload intrusive thoughts (brain dump). Deliberately
// passive and goalless so the tab itself never competes with the video for attention.
export function FocusPanel() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto scrollbar-slim pr-0.5">
      <BreathingPacer />
      <AmbientBlob />
      <BrainDumpPad />
    </div>
  )
}
