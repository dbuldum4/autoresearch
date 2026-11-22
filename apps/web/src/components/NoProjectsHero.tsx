import { workspaceAreaProps } from "../lib/workspaceFocus";
import { T, useGT } from "gt-react";
import { MessageSquareDashedIcon, PlusIcon } from "lucide-react";

import { openCommandPalette } from "../commandPaletteBus";
import { isElectron } from "../env";
import { useScratchProject } from "../hooks/useScratchProject";
import { usePrimaryEnvironmentId } from "../state/environments";
import { AutoresearchMark } from "./AutoresearchMark";
import { SingularityAttractor } from "./SingularityAttractor";
import { Button } from "./ui/button";
import { Empty, EmptyHeader } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

export function NoProjectsHero() {
  const gt = useGT();
  const contentArea = workspaceAreaProps("home", 1, gt("Home"));
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const scratchTargetEnvironmentId = scratchEnvironmentId(primaryEnvironmentId);

  return (
    <SidebarInset
      {...contentArea}
      role="main"
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none"
    >
      <div className="eh-ambient-horizon relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Original generative strange attractor field — pauses when hidden or reduced-motion */}
        <SingularityAttractor
          variant="hero"
          className="absolute inset-0 z-0 h-full w-full opacity-90"
        />
        <div
          aria-hidden="true"
          className="eh-horizon-vignette pointer-events-none absolute inset-0 z-0"
        />

        {/* The desktop window only moves where CSS opts in, so keep a titlebar strip. */}
        {isElectron ? <WorkspacePageHeader electron className="relative z-10" /> : null}

        <Empty size="hero" className="relative z-10 flex-1">
          <div className="w-full max-w-xl px-8 py-12">
            <EmptyHeader className="max-w-none items-center text-center">
              <div className="eh-specular-pill mb-6 inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-2xs font-medium tracking-widest text-info-foreground uppercase">
                <AutoresearchMark className="size-4 text-info" />
                {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
                <span className="font-mono">{"AUTORESEARCH // 01"}</span>
              </div>

              <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                <T>What should we work on?</T>
              </h1>

              <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                {scratchTargetEnvironmentId === null
                  ? gt("Add a project to start your first thread.")
                  : gt("Add a project, or start without one.")}
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={() => openCommandPalette({ open: "add-project" })}>
                  <PlusIcon className="size-4" />
                  <T>Add project</T>
                </Button>
                {scratchTargetEnvironmentId === null ? null : (
                  <Button
                    size="lg"
                    variant="glass"
                    onClick={() => void startScratchThread(scratchTargetEnvironmentId)}
                  >
                    <MessageSquareDashedIcon className="size-4 text-info" />
                    <T>Start without a project</T>
                  </Button>
                )}
              </div>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
