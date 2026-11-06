import { ViewLifetimeExamples } from "./view-lifetime-examples.tsx";
import { GeneratedViewExamples, TableInteractionExample } from "./generated-view-examples.tsx";
import { useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { FileText, FolderOpen, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { ChoiceGroup } from "../components/ui/choice-group.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Popover, PopoverContent } from "../components/ui/popover.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu.tsx";
import { ContextMenu } from "../components/ui/context-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.tsx";
import { DangerConfirmation } from "../components/ui/danger-confirmation.tsx";
import { NotificationCenter } from "../components/ui/notification-center.tsx";
import { applyTheme, currentTheme } from "../theme.ts";
import { FieldError } from "../ui/primitives.tsx";
import "./ui-gallery.css";

type ExampleState = "default" | "interaction" | "disabled" | "error";

// These examples import production controls. Their local state never writes documents or settings.
export function ChoiceGroupExamples({ state }: { state: ExampleState }) {
  const [value, setValue] = useState("automatic");
  return <section className="ui-gallery-section" aria-labelledby="gallery-choices">
    <h2 id="gallery-choices">ChoiceGroup</h2>
    <p>One required choice; Tab visits each button, Enter or Space selects. Selecting again keeps the value.</p>
    <ChoiceGroup aria-label="Example numbering" value={value} onValueChange={setValue} disabled={state === "disabled"}
      options={[{ value: "automatic", label: "Automatic" }, { value: "fixed", label: "Fixed" }]} />
  </section>;
}

export function ControlExamples({ state }: { state: ExampleState }) {
  const disabled = state === "disabled", invalid = state === "error";
  return <section className="ui-gallery-section" aria-labelledby="gallery-controls">
    <h2 id="gallery-controls">Button · Input · icons</h2>
    <p>Standard and compact actions; icons keep a visible label or accessible name.</p>
    <div className="ui-gallery-row">
      <Button disabled={disabled}>Primary</Button>
      <Button variant="secondary" disabled={disabled}>Secondary</Button>
      <Button variant="outline" disabled={disabled}>Outline</Button>
      <Button variant="ghost" disabled={disabled}>Ghost</Button>
      <Button variant="destructive" disabled={disabled}><Trash2 aria-hidden="true" />Delete</Button>
    </div>
    <div className="ui-gallery-row">
      <Button size="sm" variant="secondary" disabled={disabled}><Plus aria-hidden="true" />Add item</Button>
      <Button size="icon-sm" variant="ghost" aria-label="Edit item" disabled={disabled}><Pencil aria-hidden="true" /></Button>
      <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="outline" aria-label="Settings" disabled={disabled} />}><Settings aria-hidden="true" /></TooltipTrigger><TooltipContent>Settings</TooltipContent></Tooltip>
      <span className="ui-gallery-icons" aria-label="Document, folder and more action icons"><FileText aria-hidden="true" /><FolderOpen aria-hidden="true" /><MoreHorizontal aria-hidden="true" /></span>
    </div>
    <div className="ui-gallery-field">
      <label htmlFor="gallery-name">Name</label>
      <Input id="gallery-name" placeholder="Document name" disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={invalid ? "gallery-name-error" : "gallery-name-help"} />
      {invalid ? <FieldError id="gallery-name-error">Enter a name before continuing. Your input is kept.</FieldError>
        : <p id="gallery-name-help">Error feedback stays beside the field; it is not replaced by a notification.</p>}
    </div>
  </section>;
}

export function SurfaceExamples({ state }: { state: ExampleState }) {
  const [dialog, setDialog] = useState(false), [danger, setDanger] = useState(false);
  const dialogTrigger = useRef<HTMLButtonElement>(null), dangerTrigger = useRef<HTMLButtonElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const disabled = state === "disabled";
  return <section className="ui-gallery-section" aria-labelledby="gallery-surfaces">
    <h2 id="gallery-surfaces">Dialog · Popover · DangerConfirmation</h2>
    <p>Try opening a surface, Tab navigation and Escape. Confirmations begin on Cancel.</p>
    <div className="ui-gallery-row">
      <Button ref={dialogTrigger} variant="secondary" disabled={disabled} onClick={() => setDialog(true)}>Open dialog</Button>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent initialFocus={name} finalFocus={dialogTrigger}>
          <DialogHeader><DialogTitle>Example dialog</DialogTitle><DialogDescription>A local example; no document is changed.</DialogDescription></DialogHeader>
          <label htmlFor="gallery-dialog-name">Name</label><Input ref={name} id="gallery-dialog-name" defaultValue="Example" />
          <DialogFooter><Button variant="secondary" onClick={() => setDialog(false)}>Cancel</Button><Button onClick={() => setDialog(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Popover>
        <PopoverPrimitive.Trigger render={<Button variant="outline" disabled={disabled} />}>Open popover</PopoverPrimitive.Trigger>
        <PopoverContent><label htmlFor="gallery-popover-name">Label</label><Input id="gallery-popover-name" defaultValue="figure-example" /><p>Small contextual surface. The owning feature supplies draft/apply behavior.</p></PopoverContent>
      </Popover>
      <Button ref={dangerTrigger} variant="destructive" disabled={disabled} onClick={() => setDanger(true)}>Delete example…</Button>
      {danger ? <DangerConfirmation title="Delete example?" description="This demonstration does not delete any file." action="Delete example" pending={false}
        error={state === "error" ? "Example failure. The dialog remains open for another attempt." : ""}
        returnFocus={dangerTrigger} onConfirm={() => setDanger(false)} onClose={() => setDanger(false)} /> : null}
    </div>
  </section>;
}

export function MenuExamples({ state }: { state: ExampleState }) {
  const [action, setAction] = useState("No action yet");
  const disabled = state === "disabled";
  return <section className="ui-gallery-section" aria-labelledby="gallery-menus">
    <h2 id="gallery-menus">DropdownMenu · ContextMenu · Tooltip</h2>
    <p>Use an explicit menu trigger or a target's context menu. Context menu also opens with Shift+F10.</p>
    <div className="ui-gallery-row">
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" disabled={disabled} />}><MoreHorizontal aria-hidden="true" />Actions</DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem onClick={() => setAction("Open selected")}><FolderOpen aria-hidden="true" />Open</DropdownMenuItem>
          <DropdownMenuItem disabled>Unavailable action</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setAction("Rename selected")}><Pencil aria-hidden="true" />Rename</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
      <ContextMenu disabled={disabled} trigger={<Button variant="secondary" disabled={disabled}>Right-click this target</Button>}
        actions={[{ id: "open", label: "Open", icon: <FolderOpen aria-hidden="true" />, run: () => setAction("Context Open selected") },
          { id: "unavailable", label: "Unavailable action", icon: <Pencil aria-hidden="true" />, disabled: true, run: () => {} }]} />
      <Tooltip><TooltipTrigger render={<Button variant="ghost" disabled={disabled} />}>Hover or focus me</TooltipTrigger><TooltipContent>Help on pointer hover or keyboard focus</TooltipContent></Tooltip>
    </div>
    <p role="status">{action}</p>
  </section>;
}

export function NotificationExample({ state }: { state: ExampleState }) {
  return <section className="ui-gallery-section" aria-labelledby="gallery-notifications">
    <h2 id="gallery-notifications">NotificationCenter</h2>
    <p>The real floating center is at the window corner. Production features register notifications with the App provider; they do not mount another center.</p>
    <NotificationCenter key={state} items={state === "error" ? [{ id: "gallery-error", severity: "error", message: "Example operation failed. No file was changed.", context: "Gallery" }]
      : [{ id: "gallery-info", severity: "info", message: "Example information; this is local gallery state.", context: "Gallery" }]} />
  </section>;
}

export function UiGallery() {
  const [category, setCategory] = useState("All"), [state, setState] = useState<ExampleState>("default");
  const [theme, setTheme] = useState<"light" | "dark">(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const originalTheme = useRef(currentTheme());
  const visible = (name: string) => category === "All" || category === name;
  return <main className="ui-gallery" data-testid="ui-gallery">
    <header><h1>Litzio UI gallery</h1><p>Production components · development only · no document or preference writes</p>
      <a href="/" onClick={() => { void applyTheme(originalTheme.current); }}>Back to editor</a></header>
    <nav className="ui-gallery-section" aria-label="Gallery controls">
      <div className="ui-gallery-row"><ChoiceGroup aria-label="Category" value={category} onValueChange={setCategory}
        options={["All", "Controls", "Surfaces", "Menus", "Notifications", "Generated views"].map(value => ({ value, label: value }))} /></div>
      <div className="ui-gallery-row"><ChoiceGroup aria-label="Theme" value={theme}
        options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
        onValueChange={value => { setTheme(value); void applyTheme(value); }} /></div>
      <div className="ui-gallery-row"><ChoiceGroup<ExampleState> aria-label="Example state" value={state} onValueChange={setState}
        options={[{ value: "default", label: "Default" }, { value: "interaction", label: "Hover / focus" },
          { value: "disabled", label: "Disabled" }, { value: "error", label: "Error" }]} /></div>
      <p>{state === "interaction" ? "Move the pointer over examples or press Tab to inspect real hover and keyboard focus. These states are not painted simulations."
        : "State applies where supported: disabled controls; invalid input, confirmation error and error notification. Navigation remains available."}</p>
    </nav>
    {visible("Controls") ? <><ControlExamples state={state} /><ChoiceGroupExamples state={state} /></> : null}
    {visible("Surfaces") ? <SurfaceExamples state={state} /> : null}
    {visible("Menus") ? <MenuExamples state={state} /> : null}
    {visible("Notifications") ? <NotificationExample state={state} /> : null}
    {visible("Generated views") ? <><GeneratedViewExamples state={state} /><TableInteractionExample /><ViewLifetimeExamples /></> : null}
    <footer>Examples show current implementation, not unimplemented UI pattern targets. Review large layout changes in their actual screen.</footer>
  </main>;
}
