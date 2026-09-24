"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useTheme } from "next-themes"
import { BarChart3Icon, BellOffIcon, BellRingIcon, FlameIcon, InfoIcon, LocateFixedIcon, MapPinnedIcon, MenuIcon, MoonIcon, NavigationIcon, PlusIcon, ShieldIcon, SkullIcon, SunIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmergencyButton } from "@/components/emergency-button"
import { DEFAULT_FILTERS, FiltersPopover, applyFilters, type Filters } from "@/components/filters"
import { FlagForm } from "@/components/flag-form"
import { PlaceSearch } from "@/components/place-search"
import { ReportForm } from "@/components/report-form"
import { ResponsiveModal } from "@/components/responsive-modal"
import { RoutePlanner } from "@/components/route-planner"
import { SpotDetails } from "@/components/spot-details"
import { StatsPanel } from "@/components/stats-panel"
import { useIsDesktop } from "@/hooks/use-media-query"
import { CATEGORIES, type Spot } from "@/lib/categories"
import { formatDistance, haversine, inUganda, type LatLng } from "@/lib/geo"
import type { FlyTarget, RouteResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const DangerMap = dynamic(() => import("@/components/map/danger-map"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
})

/** Waze-style heads-up distance for nearby danger spots. */
const ALERT_RADIUS_M = 300

function MapButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-lg"
          variant={active ? "default" : "secondary"}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn("size-11 rounded-full shadow-lg", !active && "bg-background hover:bg-muted")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

export function DeathspotApp() {
  const isDesktop = useIsDesktop()
  const { resolvedTheme, setTheme } = useTheme()

  const [spots, setSpots] = useState<Spot[]>([])
  const [loaded, setLoaded] = useState(false)
  const [myVotes, setMyVotes] = useState<Record<number, number>>({})
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)
  const [showHeat, setShowHeat] = useState(false)
  const [me, setMe] = useState<LatLng | null>(null)
  const [alerts, setAlerts] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [routeOpen, setRouteOpen] = useState(false)
  const [routes, setRoutes] = useState<RouteResult[]>([])
  const [activeRoute, setActiveRoute] = useState(0)
  const [statsOpen, setStatsOpen] = useState(false)
  const [statsKey, setStatsKey] = useState(0)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const [requireApproval, setRequireApproval] = useState(false)
  const [flagging, setFlagging] = useState<Spot | null>(null)
  const alerted = useRef(new Set<number>())

  const visible = useMemo(() => applyFilters(spots, filters), [spots, filters])
  const selected = spots.find((s) => s.id === selectedId) ?? null

  const fly = useCallback((p: LatLng, zoom?: number) => setFlyTo({ ...p, zoom, key: Date.now() }), [])

  const select = useCallback(
    (spot: Spot | null, center = false) => {
      setSelectedId(spot?.id ?? null)
      const url = new URL(window.location.href)
      if (spot) url.searchParams.set("spot", String(spot.id))
      else url.searchParams.delete("spot")
      window.history.replaceState(null, "", url)
      if (spot && center) fly(spot, 16)
    },
    [fly],
  )

  // Initial load, plus the ?spot= deep link used by shared links.
  useEffect(() => {
    Promise.all([fetch("/api/spots").then((r) => r.json()), fetch("/api/me").then((r) => r.json())])
      .then(([s, m]) => {
        setSpots(s.spots)
        setMyVotes(m.votes)
        setRequireApproval(m.requireApproval)
        const id = Number(new URLSearchParams(window.location.search).get("spot"))
        const deep = (s.spots as Spot[]).find((x) => x.id === id)
        if (deep) {
          setSelectedId(deep.id)
          setFlyTo({ lat: deep.lat, lng: deep.lng, zoom: 16, key: Date.now() })
        }
      })
      .catch(() => toast.error("Could not load danger spots. Check your connection."))
      .finally(() => setLoaded(true))
  }, [])

  // Keep the map fresh: new reports and moderator decisions appear without a reload.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      fetch("/api/spots")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setSpots(d.spots))
        .catch(() => {})
    }
    const id = setInterval(refresh, 120_000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])

  const requestLocation = useCallback(
    () =>
      new Promise<LatLng | null>((resolve) => {
        if (!navigator.geolocation) {
          toast.error("Location is not available on this device")
          return resolve(null)
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            setMe(p)
            resolve(p)
          },
          () => {
            toast.error("Allow location access to use this")
            resolve(null)
          },
          { enableHighAccuracy: true, timeout: 10000 },
        )
      }),
    [],
  )

  // Proximity alerts: watch position and warn once per spot when within ALERT_RADIUS_M.
  useEffect(() => {
    if (!alerts || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        toast.error("Allow location access to get danger alerts")
        setAlerts(false)
      },
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [alerts])

  useEffect(() => {
    if (!alerts || !me) return
    for (const s of spots) {
      if (s.status === "disputed" || alerted.current.has(s.id)) continue
      const d = haversine(me, s)
      if (d <= ALERT_RADIUS_M) {
        alerted.current.add(s.id)
        navigator.vibrate?.([200, 100, 200])
        toast.warning(`${CATEGORIES[s.category].emoji} Danger spot ${formatDistance(d)} ahead`, {
          description: `${s.title}. Stay alert or take another way.`,
          duration: 10000,
          action: { label: "View", onClick: () => select(s, true) },
        })
      }
    }
  }, [alerts, me, spots, select])

  const locate = async () => {
    const p = await requestLocation()
    if (p) fly(p, 16)
  }

  const startReport = () => {
    select(null)
    setRouteOpen(false)
    setPicking(true)
    setPickedPoint(null)
    toast.dismiss()
  }

  const placePin = (p: LatLng) => {
    if (!inUganda(p)) {
      toast.error("Deathspot UG only covers Uganda")
      return
    }
    setPickedPoint(p)
    setPicking(false)
    // Leaflet fires "click" on pointerup; the browser's own click follows. Opening the drawer
    // immediately would let that trailing click land on whatever button is now under the finger.
    setTimeout(() => setReportOpen(true), 350)
  }

  const usePosForReport = async () => {
    const p = await requestLocation()
    if (p) {
      fly(p, 17)
      placePin(p)
    }
  }

  const upsert = (spot: Spot) => setSpots((all) => (all.some((s) => s.id === spot.id) ? all.map((s) => (s.id === spot.id ? spot : s)) : [spot, ...all]))

  const vote = async (value: 1 | -1) => {
    if (!selected) return
    setVoting(true)
    try {
      const res = await fetch(`/api/spots/${selected.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      upsert(data.spot)
      setMyVotes((v) => ({ ...v, [selected.id]: value }))
      setStatsKey((k) => k + 1)
      toast.success(value === 1 ? "Thanks for confirming. This helps keep others safe." : "Thanks. Your update has been recorded.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vote failed")
    } finally {
      setVoting(false)
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* `isolate` keeps Leaflet's high z-index panes below our overlays and portals. */}
      <div className="absolute inset-0 isolate">
        <DangerMap
          spots={visible}
          selectedId={selectedId}
          onSelect={(s) => select(s)}
          showHeat={showHeat}
          me={me}
          picking={picking}
          pickedPoint={reportOpen || picking ? pickedPoint : null}
          onPick={placePin}
          routes={routes}
          activeRoute={activeRoute}
          onRouteSelect={setActiveRoute}
          flyTo={flyTo}
        />
      </div>

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto relative flex w-full max-w-xl items-center gap-1 rounded-2xl border bg-background/95 p-1.5 shadow-lg backdrop-blur">
          <Link href="/about" className="flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 hover:bg-muted" aria-label="About Deathspot UG">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <SkullIcon className="size-4" />
            </span>
            <span className="hidden text-sm leading-tight font-bold sm:block">
              Deathspot<span className="text-primary">UG</span>
            </span>
          </Link>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground" aria-label="What is Deathspot UG?">
                <InfoIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[1100] w-[min(92vw,20rem)] text-sm">
              <p>
                <strong>Deathspot UG</strong> is a community map of places in Uganda where people have been attacked or killed, so you can check your route and stay away from danger.
              </p>
              <Link href="/about" className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
                Learn more
              </Link>
            </PopoverContent>
          </Popover>
          <PlaceSearch
            className="static min-w-0 flex-1"
            inputClassName="h-10 border-0 bg-muted/60 shadow-none"
            onSelect={(r) => {
              const spot = r.kind === "spot" ? spots.find((s) => s.id === r.id) : undefined
              if (spot) select(spot, true)
              else fly(r, 16)
            }}
          />
          <FiltersPopover value={filters} onChange={setFilters} />
          <Button size="icon-lg" variant="ghost" aria-label="Statistics" onClick={() => setStatsOpen(true)}>
            <BarChart3Icon />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-lg" variant="ghost" aria-label="Menu">
                <MenuIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[1100] w-52">
              <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                <SunIcon className="hidden dark:block" />
                <MoonIcon className="dark:hidden" />
                <span className="dark:hidden">Dark map</span>
                <span className="hidden dark:inline">Light map</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/about">
                  <InfoIcon /> About & safety rules
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <ShieldIcon /> Moderator login
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {picking && (
          <div className="pointer-events-auto mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background shadow-xl">
            <MapPinnedIcon className="size-4" />
            <span className="font-medium">Tap the map where the danger is</span>
            <Button size="sm" variant="secondary" onClick={usePosForReport}>
              Use my location
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-background hover:bg-background/20 hover:text-background" aria-label="Cancel report" onClick={() => setPicking(false)}>
              <XIcon />
            </Button>
          </div>
        )}

        {routes.length > 0 && !routeOpen && !picking && (
          <div className="pointer-events-auto mx-auto mt-3 flex w-fit items-center gap-1 rounded-full bg-background/95 py-1 pr-1 pl-3 text-sm shadow-lg">
            <NavigationIcon className="size-4 text-blue-600" />
            <button type="button" className="font-medium" onClick={() => setRouteOpen(true)}>
              {routes[activeRoute]?.dangers.length
                ? `${routes[activeRoute].dangers.length} danger spot${routes[activeRoute].dangers.length > 1 ? "s" : ""} on route`
                : "No reported spots on route"}
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="rounded-full"
              aria-label="Clear route"
              onClick={() => {
                setRoutes([])
                setActiveRoute(0)
              }}
            >
              <XIcon />
            </Button>
          </div>
        )}

        {loaded && visible.length === 0 && !picking && (
          <div className="pointer-events-auto mx-auto mt-3 w-fit rounded-xl bg-background/95 px-4 py-2 text-sm shadow">No spots match your filters</div>
        )}
      </header>

      {/* Right-side map controls */}
      <div className="absolute right-3 bottom-28 z-10 flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
        <MapButton label="Check a route for danger spots" active={routeOpen || routes.length > 0} onClick={() => setRouteOpen(true)}>
          <NavigationIcon />
        </MapButton>
        <MapButton label={showHeat ? "Show pins" : "Show heatmap"} active={showHeat} onClick={() => setShowHeat((h) => !h)}>
          <FlameIcon />
        </MapButton>
        <MapButton
          label={alerts ? "Nearby alerts on" : "Alert me near danger spots"}
          active={alerts}
          onClick={() => {
            setAlerts((a) => !a)
            if (!alerts) toast.info(`You'll be warned within ${ALERT_RADIUS_M} m of a reported danger spot. Keep this page open.`)
          }}
        >
          {alerts ? <BellRingIcon /> : <BellOffIcon />}
        </MapButton>
        <MapButton label="My location" onClick={locate}>
          <LocateFixedIcon />
        </MapButton>
      </div>

      {/* Bottom actions */}
      <div className="absolute inset-x-3 bottom-3 z-10 flex items-end justify-between pb-[env(safe-area-inset-bottom)]">
        <EmergencyButton />
        <Button onClick={startReport} disabled={picking} className="h-16 rounded-full px-6 text-base font-semibold shadow-xl shadow-primary/30" aria-label="Report a danger spot">
          <PlusIcon className="size-6" />
          <span>Report</span>
        </Button>
      </div>

      {/* Spot details */}
      <ResponsiveModal
        open={!!selected}
        onOpenChange={(o) => !o && select(null)}
        desktop="sheet"
        modal={!isDesktop}
        title={selected?.title}
        description={selected ? `${CATEGORIES[selected.category].emoji} ${selected.area || "Uganda"}` : undefined}
      >
        {selected && (
          <SpotDetails
            spot={selected}
            myVote={myVotes[selected.id]}
            me={me}
            voting={voting}
            onVote={vote}
            onCheckRoute={() => {
              select(null)
              setRouteOpen(true)
            }}
            onFlag={() => {
              setFlagging(selected)
              select(null)
            }}
          />
        )}
      </ResponsiveModal>

      {/* Report */}
      <ResponsiveModal
        open={reportOpen}
        onOpenChange={(o) => {
          setReportOpen(o)
          if (!o) setPickedPoint(null)
        }}
        title="Report a danger spot"
        description="Warn others about a place where people have been attacked or killed."
      >
        {pickedPoint && (
          <ReportForm
            point={pickedPoint}
            requireApproval={requireApproval}
            onRepick={() => {
              setReportOpen(false)
              setPicking(true)
            }}
            onCreated={(spot, pending) => {
              setReportOpen(false)
              setPickedPoint(null)
              if (pending) return
              upsert(spot)
              setMyVotes((v) => ({ ...v, [spot.id]: 1 }))
              setStatsKey((k) => k + 1)
              select(spot, true)
            }}
          />
        )}
      </ResponsiveModal>

      {/* Route planner */}
      <ResponsiveModal
        open={routeOpen}
        onOpenChange={setRouteOpen}
        desktop="sheet"
        modal={!isDesktop}
        title="Check a route"
        description="See reported danger spots along the way and compare routes."
      >
        <RoutePlanner
          me={me}
          requestLocation={requestLocation}
          routes={routes}
          activeRoute={activeRoute}
          onRoutes={setRoutes}
          onActiveRoute={setActiveRoute}
          onFocusSpot={(s) => {
            if (!isDesktop) setRouteOpen(false)
            fly(s, 17)
          }}
          onShowMap={() => setRouteOpen(false)}
        />
      </ResponsiveModal>

      {/* Flag */}
      <ResponsiveModal
        open={!!flagging}
        onOpenChange={(o) => !o && setFlagging(null)}
        title="Report a problem"
        description={flagging ? `What's wrong with “${flagging.title}”?` : undefined}
      >
        {flagging && (
          <FlagForm
            spotId={flagging.id}
            onDone={(hidden) => {
              if (hidden) setSpots((all) => all.filter((s) => s.id !== flagging.id))
              setFlagging(null)
            }}
          />
        )}
      </ResponsiveModal>

      {/* Stats */}
      <ResponsiveModal open={statsOpen} onOpenChange={setStatsOpen} desktop="sheet" title="Danger insights" description="What the community has mapped so far.">
        <StatsPanel refreshKey={statsKey} />
      </ResponsiveModal>
    </div>
  )
}
