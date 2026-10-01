"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

const Tabs = ({ value, onValueChange, children, className }: TabsProps) => {
  return (
    <div className={cn(className)} data-value={value}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, { value, onValueChange } as any);
      })}
    </div>
  );
};

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const TabsList = ({ children, className, ...props }: TabsListProps) => {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, children, className, disabled, onClick, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    const selected = context?.value === value;
    const onValueChange = context?.onValueChange;

    return (
      <button
        ref={ref}
        role="tab"
        aria-selected={selected}
        aria-controls={`tabs-${value}-panel`}
        id={`tabs-${value}-trigger`}
        data-state={selected ? "active" : "inactive"}
        data-disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
          className
        )}
        onClick={() => {
          onValueChange?.(value);
          onClick?.();
        }}
        disabled={disabled}
        {...props}
      />
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const TabsContent = ({ value, children, className, ...props }: TabsContentProps) => {
  const context = React.useContext(TabsContext);
  const selected = context?.value === value;

  if (!selected) return null;

  return (
    <div
      role="tabpanel"
      id={`tabs-${value}-panel`}
      aria-labelledby={`tabs-${value}-trigger`}
      className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      {...props}
    >
      {children}
    </div>
  );
};

const TabsContext = React.createContext<{ value: string; onValueChange: (value: string) => void } | null>(null);

export { Tabs, TabsList, TabsTrigger, TabsContent };