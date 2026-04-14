import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IS_MAC_PLATFORM } from "@/hooks/use-keyboard-shortcuts";

const MOD = IS_MAC_PLATFORM ? "⌘" : "Ctrl";
const SHIFT = IS_MAC_PLATFORM ? "⇧" : "Shift";

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded border border-border bg-secondary text-[0.7rem] font-semibold text-foreground shadow-e1 leading-none font-mono">
      {children}
    </kbd>
  );
}

function Row({ keys, label }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            <Kbd>{k}</Kbd>
            {i < keys.length - 1 ? <span className="text-muted-foreground text-xs">+</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ShortcutsHelp({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Speed up comparisons without leaving the keyboard.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <section>
            <h3 className="text-[0.7rem] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Compare &amp; navigate</h3>
            <Row keys={[MOD, "Enter"]} label="Compare specs" />
            <Row keys={[MOD, "K"]} label="Focus original spec" />
            <Row keys={[MOD, SHIFT, "K"]} label="Focus updated spec" />
          </section>

          <section>
            <h3 className="text-[0.7rem] uppercase tracking-wider text-muted-foreground font-semibold mb-1">General</h3>
            <Row keys={["Esc"]} label="Dismiss error / close dialog" />
            <Row keys={["?"]} label="Show this help" />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
