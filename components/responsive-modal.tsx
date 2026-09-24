"use client"

import { useIsDesktop } from "@/hooks/use-media-query"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** On desktop, render as a centred dialog or as a side sheet. Mobile always gets a bottom drawer. */
  desktop?: "dialog" | "sheet"
  /** Desktop sheet only: keep the map interactive behind the panel. Mobile drawers are always modal. */
  modal?: boolean
  className?: string
  children: React.ReactNode
}

export function ResponsiveModal({ open, onOpenChange, title, description, desktop = "dialog", modal = true, className, children }: Props) {
  const isDesktop = useIsDesktop()

  if (!isDesktop) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn("max-h-[88dvh]", className)}>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  if (desktop === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
        <SheetContent side="right" className={cn("w-[400px] sm:max-w-[400px] gap-0", className)} onInteractOutside={modal ? undefined : (e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto sm:max-w-lg", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
