"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

interface ResizablePanelGroupProps {
  direction: "horizontal" | "vertical";
  children: React.ReactNode;
  className?: string;
  onLayoutChange?: (sizes: number[]) => void;
}

const ResizablePanelGroup = ({ direction, children, className, onLayoutChange }: ResizablePanelGroupProps) => {
  return (
    <div
      className={cn(
        "flex",
        direction === "horizontal" ? "flex-row" : "flex-col",
        className
      )}
      data-direction={direction}
    >
      {children}
    </div>
  );
};

interface ResizablePanelProps {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  children: React.ReactNode;
  className?: string;
}

const ResizablePanel = ({ defaultSize, minSize, maxSize, children, className }: ResizablePanelProps) => {
  return (
    <div
      className={cn(
        "flex-1 overflow-hidden",
        className
      )}
      style={{
        flexBasis: defaultSize ? `${defaultSize}%` : undefined,
        minWidth: direction === "horizontal" && minSize ? `${minSize}px` : undefined,
        maxWidth: direction === "horizontal" && maxSize ? `${maxSize}px` : undefined,
        minHeight: direction === "vertical" && minSize ? `${minSize}px` : undefined,
        maxHeight: direction === "vertical" && maxSize ? `${maxSize}px` : undefined,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
};

const direction = "horizontal";

interface ResizableHandleProps {
  className?: string;
  hitAreaMargins?: number;
}

const ResizableHandle = ({ className, hitAreaMargins = 0 }: ResizableHandleProps) => {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center bg-border transition-colors hover:bg-primary/50",
        direction === "horizontal" ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
        className
      )}
      style={{
        marginLeft: direction === "horizontal" ? `-${hitAreaMargins}px` : 0,
        marginRight: direction === "horizontal" ? `-${hitAreaMargins}px` : 0,
        marginTop: direction === "vertical" ? `-${hitAreaMargins}px` : 0,
        marginBottom: direction === "vertical" ? `-${hitAreaMargins}px` : 0,
      }}
    >
      <div className={cn(
        "rounded-full bg-muted-foreground/50",
        direction === "horizontal" ? "w-1 h-6" : "w-6 h-1"
      )} />
    </div>
  );
};

ResizablePanelGroup.Panel = ResizablePanel;
ResizablePanelGroup.Handle = ResizableHandle;

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };