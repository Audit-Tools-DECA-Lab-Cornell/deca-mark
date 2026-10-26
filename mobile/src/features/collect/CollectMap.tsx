import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  type MapRef,
  Marker,
  Map as NativeMap,
} from "@maplibre/maplibre-react-native";
import type { Feature, FeatureCollection, Point } from "geojson";
import {
  type ReactElement,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";
import type { Coordinate } from "../../domain/observation";
import { clusterPoints, type MapPoint, metresPerPixel, nudge } from "../../maps/clustering";
import {
  coveringZones,
  scaleBar,
  zoneBounds,
  zoneFeature,
  zoneSpotlight,
} from "../../maps/geometry";
import {
  accuracyCircle,
  accuracyLabel,
  distanceLabel,
  distanceMetres,
  type Fix,
} from "../../maps/my-location";
import {
  hexWithAlpha,
  type MapBase,
  mapPalettes,
  setMapBase,
  useMapBase,
} from "../../maps/palette";
import type { SiteZone } from "../../maps/sample-site";
import {
  openLocationSettings,
  turnLocationOff,
  turnLocationOn,
  useMyLocation,
} from "../../maps/use-my-location";
import type { LayerPaint, PackageLayer, SitePackage } from "../../packages/site-package";
import {
  announce,
  Icon,
  IconButton,
  Mono,
  Segmented,
  Switch,
  Text,
  type Theme,
  useHaptics,
  useStyles,
  useTheme,
} from "../../ui";
import { type AimStore, useAim } from "./aim-store";
import { controlColumns, LAYERS_MENU_WIDTH, layersMenuBox, MAP_CONTROL } from "./map-controls";
import { AimReticle, markColours, PLACED_BOX, PlacedMark } from "./pin";
import { nearEdgeHint, type PlacementState, placementState, zoneTap } from "./placement";

/** A prior observation as the map shows it. */
export type MapRecord = MapPoint & {
  readonly label: string;
  readonly time: string;
  readonly summary: string;
  readonly round: string;
};

/**
 * aim: the cross sits at the centre and the map moves under it (placing or adjusting a point).
 * placed: the observation's point is shown where it was placed. zones: a tap chooses a zone (the
 * Inventory round). view: nothing to place, the map is for looking.
 */
export type CollectMapMode = "aim" | "placed" | "zones" | "view";

export type ObservationFilter = "all" | "session" | "none";

export type CollectMapHandle = {
  /** The coordinate under the cross as last reported by a camera event. */
  centre: () => Coordinate;
  /** The coordinate under the cross, read from the map itself: what "Place point here" stores. */
  exactCentre: () => Promise<Coordinate>;
  /** Moves the map so a coordinate sits under the cross. */
  moveTo: (centre: Coordinate, zoom?: number) => void;
  /** Moves the map a short distance, carrying the cross with it: the accessible fine-tune. */
  nudge: (direction: "north" | "south" | "east" | "west", metres: number) => void;
  /** Frames the session's zone. */
  fitZone: () => void;
};

type Props = {
  readonly sitePackage: SitePackage;
  readonly zone: SiteZone;
  readonly mode: CollectMapMode;
  readonly placed: Coordinate | null;
  readonly records: readonly MapRecord[];
  /** Observations saved in this session, drawn at full strength; older ones are lighter. */
  readonly sessionIds: ReadonlySet<string>;
  /** Zones whose inventory is done this session: their label carries a check. */
  readonly doneZones: ReadonlySet<string>;
  readonly aim: AimStore;
  readonly onAimSettled: (centre: Coordinate, zoom: number) => void;
  readonly onZonePress?: ((zone: SiteZone) => void) | undefined;
  /** A tap on an edge between zones while choosing one: the words to show instead of choosing. */
  readonly onZoneNote?: ((note: string) => void) | undefined;
  /** The overlay label: the zone, then the round and the plan. */
  readonly title: string;
  readonly detail: string;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly ref?: Ref<CollectMapHandle>;
};

const DEFAULT_ZOOM = 18;
const MIN_ZOOM = 15.5;
const MAX_ZOOM = 22;
const INDIVIDUAL_ZOOM = 18;

const BASES: readonly { value: MapBase; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
  { value: "aerial", label: "Aerial" },
];

const FILTERS: readonly { value: ObservationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "session", label: "This session" },
  { value: "none", label: "Hide" },
];

/** A package layer as MapLibre layers. Returned as an array so the source can hand each its id. */
function packageLayers(paint: LayerPaint, visible: boolean, id: string): readonly ReactElement[] {
  const layout = { visibility: visible ? ("visible" as const) : ("none" as const) };
  if (paint.type === "line")
    return [
      <Layer
        key={`${id}-line`}
        id={`${id}-line`}
        type="line"
        layout={{ ...layout, "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": paint.color, "line-width": paint.width }}
      />,
    ];
  if (paint.type === "circle")
    return [
      <Layer
        key={`${id}-circle`}
        id={`${id}-circle`}
        type="circle"
        layout={layout}
        paint={{ "circle-color": paint.color, "circle-radius": paint.radius }}
      />,
    ];
  return [
    <Layer
      key={`${id}-fill`}
      id={`${id}-fill`}
      type="fill"
      layout={layout}
      paint={{ "fill-color": paint.color }}
    />,
    <Layer
      key={`${id}-outline`}
      id={`${id}-outline`}
      type="line"
      layout={layout}
      paint={{
        "line-color": paint.outline,
        "line-width": 1.5,
        ...(paint.dashed ? { "line-dasharray": [3, 2] } : {}),
      }}
    />,
  ];
}

/** Whether a fix falls inside the site's extent, the only part of the world this map can show. */
function insideSite(fix: Fix, bounds: SitePackage["bounds"]): boolean {
  const [x, y] = fix.coordinate;
  const [west, south, east, north] = bounds;
  return x >= west && x <= east && y >= south && y <= north;
}

/** What the map's label says about the observer's own position, or nothing while it is off. */
function locationLine(
  status: ReturnType<typeof useMyLocation>["status"],
  fix: Fix | null,
  sitePackage: SitePackage,
): string | null {
  switch (status) {
    case "off":
      return null;
    case "searching":
      return "Finding your location…";
    case "on":
      if (!fix) return "Finding your location…";
      return insideSite(fix, sitePackage.bounds)
        ? `You are here · ${accuracyLabel(fix)}`
        : `You are ${distanceLabel(distanceMetres(fix.coordinate, sitePackage.centre))}`;
    case "denied":
      return "Location is off for DECA Mark. Tap the location button to open Settings.";
    case "services-off":
      return "Location services are off on this device.";
    case "unavailable":
      return "This build cannot show your location. Rebuild the app.";
  }
}

function mapStyles(t: Theme) {
  return StyleSheet.create({
    frame: { flex: 1, borderRadius: t.radius.island, overflow: "hidden" },
    armed: { borderWidth: 3, borderColor: t.c.accent },
    rest: { borderWidth: t.size.border, borderColor: t.c.line },
    label: {
      position: "absolute",
      top: t.space.s3,
      left: t.space.s3,
      maxWidth: "62%",
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.thumb,
      backgroundColor: t.c.island,
      borderWidth: t.size.border,
      borderColor: t.c.line,
    },
    labelArmed: { borderColor: t.c.accent, borderWidth: 2 },
    meDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 3,
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
    controls: {
      position: "absolute",
      top: t.space.s3,
      right: t.space.s3,
      gap: t.space.s2,
      alignItems: "flex-end",
    },
    // In a short frame the controls take two columns: zoom and framing at the edge, the rest beside it.
    controlsPair: { flexDirection: "row-reverse", alignItems: "flex-start" },
    controlColumn: { gap: t.space.s2, alignItems: "flex-end" },
    menu: {
      position: "absolute",
      top: t.space.s3,
      right: MAP_CONTROL + t.space.s3 + t.space.s3,
      width: LAYERS_MENU_WIDTH,
      maxHeight: 340,
      borderRadius: t.radius.panel,
      backgroundColor: t.c.island,
      borderWidth: t.size.border,
      borderColor: t.c.line,
    },
    menuBody: { padding: t.space.s3, gap: t.space.s3 },
    swatchRow: { flexDirection: "row", alignItems: "center", gap: t.space.s2 },
    swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
    scale: {
      position: "absolute",
      left: t.space.s3,
      bottom: t.space.s3,
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s1 + 2,
      borderRadius: t.radius.pill,
      backgroundColor: t.c.island,
      borderWidth: t.size.border,
      borderColor: t.c.line,
      gap: 3,
    },
    scaleBar: { height: 2, backgroundColor: t.c.ink },
    callout: {
      position: "absolute",
      left: t.space.s3,
      right: t.space.s3,
      bottom: t.space.s3 + 40,
      maxWidth: 360,
      padding: t.space.s3,
      borderRadius: t.radius.panel,
      backgroundColor: t.c.island,
      borderWidth: t.size.border,
      borderColor: t.c.line,
      gap: t.space.s1,
    },
    calloutHead: { flexDirection: "row", justifyContent: "space-between", gap: t.space.s3 },
    cluster: {
      minWidth: 36,
      height: 36,
      paddingHorizontal: t.space.s2,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
    },
    zonePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: t.space.s2,
      paddingVertical: 3,
      borderRadius: t.radius.pill,
    },
  });
}

/**
 * The collect map. MapLibre stays mounted across every step of collecting (DESIGN §8), so the
 * camera, layers and selection survive placing, answering, review and saving.
 *
 * Placing works as iPhone Maps does when asked for a point: the cross is fixed at the centre and the
 * map moves under it, with the pin floating above the cross so the spot is never covered. A tap moves
 * the map so the tapped spot comes under the cross, and the nudge buttons in the panel do the same in
 * half-metre steps for anyone who cannot drag precisely. Nothing is placed until the observer says so.
 */
export function CollectMap({
  sitePackage,
  zone,
  mode,
  placed,
  records,
  sessionIds,
  doneZones,
  aim,
  onAimSettled,
  onZonePress,
  onZoneNote,
  title,
  detail,
  expanded,
  onToggleExpanded,
  ref,
}: Props) {
  const t = useTheme();
  const s = useStyles(mapStyles);
  const haptics = useHaptics();
  const camera = useRef<CameraRef>(null);
  const native = useRef<MapRef>(null);
  const chosen = useMapBase();
  // A package without imagery (every hosted one) offers Day and Night only; Aerial reads as Day there.
  const aerialAvailable = sitePackage.aerialAvailable !== false;
  const base: MapBase = chosen === "aerial" && !aerialAvailable ? "day" : chosen;
  const bases = aerialAvailable ? BASES : BASES.filter((option) => option.value !== "aerial");
  const palette = mapPalettes[base === "night" ? "night" : "day"];
  const colours = useMemo(() => markColours(base), [base]);
  const home = zone.zoom ?? DEFAULT_ZOOM;
  const [zoom, setZoom] = useState(home);
  const [menuOpen, setMenuOpen] = useState(false);
  const [frameHeight, setFrameHeight] = useState(0);
  const [frameWidth, setFrameWidth] = useState(0);
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [filter, setFilter] = useState<ObservationFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const lifted = useSharedValue(0);
  const latitude = zone.centre[1];

  const motion = t.motion.duration;

  // The observer's own position, shown only while they have it on; never stored with a record.
  const me = useMyLocation();
  const mePaint = palette.me;
  const meFix = me.status === "on" ? me.fix : null;
  const meLine = locationLine(me.status, me.fix, sitePackage);
  const centreOnMe = useRef(false);
  const goToMe = useCallback(
    (fix: Fix) => {
      if (!insideSite(fix, sitePackage.bounds)) {
        announce(`You are ${distanceLabel(distanceMetres(fix.coordinate, sitePackage.centre))}.`);
        return;
      }
      haptics.light();
      camera.current?.easeTo({ center: fix.coordinate, zoom: 19, duration: motion.camera });
    },
    [haptics, motion.camera, sitePackage],
  );
  // The first fix after the observer asks for their location brings the map to them.
  useEffect(() => {
    if (!centreOnMe.current || !meFix) return;
    centreOnMe.current = false;
    goToMe(meFix);
  }, [goToMe, meFix]);
  function locate() {
    if (me.status === "denied" || me.status === "services-off") {
      openLocationSettings();
      return;
    }
    if (meFix) {
      goToMe(meFix);
      return;
    }
    centreOnMe.current = true;
    if (me.status === "off" || me.status === "unavailable") {
      turnLocationOn();
      announce("Finding your location.");
    }
  }
  const moveTo = useCallback(
    (centre: Coordinate, next?: number) => {
      camera.current?.easeTo({
        center: centre,
        ...(next === undefined ? {} : { zoom: next }),
        duration: motion.camera,
      });
    },
    [motion.camera],
  );

  const fitZone = useCallback(() => {
    camera.current?.fitBounds(zoneBounds(zone), {
      padding: { top: 56, right: 56, bottom: 56, left: 56 },
      duration: motion.camera,
    });
  }, [motion.camera, zone]);

  useImperativeHandle(
    ref,
    () => ({
      centre: () => aim.get().centre,
      exactCentre: async () => {
        try {
          const centre = await native.current?.getCenter();
          return centre ? [centre[0], centre[1]] : aim.get().centre;
        } catch {
          return aim.get().centre;
        }
      },
      moveTo,
      nudge: (direction, metres) => moveTo(nudge(aim.get().centre, direction, metres)),
      fitZone,
    }),
    [aim, fitZone, moveTo],
  );

  // The package's own zone layer is replaced by the focus drawing below.
  const overlays = useMemo(
    () => sitePackage.layers.filter((layer) => layer.id !== "zones"),
    [sitePackage.layers],
  );
  const visible = (layer: PackageLayer) => !hidden.includes(layer.id);

  const zoneShapes: FeatureCollection = useMemo(
    () => ({ type: "FeatureCollection", features: sitePackage.zones.map(zoneFeature) }),
    [sitePackage.zones],
  );
  const focusShape = useMemo(() => zoneFeature(zone), [zone]);
  const spotlight = useMemo(
    () => zoneSpotlight(zone, sitePackage.bounds),
    [zone, sitePackage.bounds],
  );

  const shown = useMemo(
    () =>
      filter === "none"
        ? []
        : filter === "session"
          ? records.filter((record) => sessionIds.has(record.id))
          : records,
    [filter, records, sessionIds],
  );
  const clusters = useMemo(
    () => clusterPoints(shown, zoom, { individualZoom: INDIVIDUAL_ZOOM }),
    [shown, zoom],
  );
  const singles: FeatureCollection<Point> = useMemo(
    () => ({
      type: "FeatureCollection",
      features: clusters
        .filter((cluster) => cluster.kind === "single")
        .map(
          (cluster): Feature<Point> => ({
            type: "Feature",
            id: cluster.id,
            properties: {
              id: cluster.id,
              session: sessionIds.has(cluster.id),
              selected: cluster.id === selected,
            },
            geometry: { type: "Point", coordinates: [...cluster.coordinates] },
          }),
        ),
    }),
    [clusters, selected, sessionIds],
  );
  const selectedRecord = selected
    ? (records.find((record) => record.id === selected) ?? null)
    : null;
  const bar = scaleBar(zoom, latitude);

  const aiming = mode === "aim";
  const controls = [
    <IconButton
      key="zoom-in"
      variant="map"
      icon="plus"
      label={zoom >= MAX_ZOOM ? "Zoom in, closest zoom reached" : "Zoom in"}
      disabled={zoom >= MAX_ZOOM - 0.01}
      onPress={() =>
        camera.current?.zoomTo(Math.min(zoom + 1, MAX_ZOOM), { duration: motion.camera })
      }
    />,
    <IconButton
      key="zoom-out"
      variant="map"
      icon="minus"
      label={zoom <= MIN_ZOOM ? "Zoom out, widest zoom reached" : "Zoom out"}
      disabled={zoom <= MIN_ZOOM + 0.01}
      onPress={() =>
        camera.current?.zoomTo(Math.max(zoom - 1, MIN_ZOOM), { duration: motion.camera })
      }
    />,
    <IconButton
      key="frame-zone"
      variant="map"
      icon="locate-fixed"
      label="Frame this zone"
      onPress={fitZone}
    />,
    <IconButton
      key="locate"
      variant="map"
      icon="navigation"
      label={
        me.status === "denied" || me.status === "services-off"
          ? "Location is off. Open Settings"
          : me.status === "off" || me.status === "unavailable"
            ? "Show my location"
            : aiming
              ? "Move the cross to my location"
              : "Centre on my location"
      }
      selected={me.status === "on" || me.status === "searching"}
      onPress={locate}
    />,
    <IconButton
      key="layers"
      variant="map"
      icon="layers"
      label="Map layers"
      selected={menuOpen}
      onPress={() => setMenuOpen(!menuOpen)}
    />,
    <IconButton
      key="larger"
      variant="map"
      icon={expanded ? "minimize" : "maximize"}
      label={expanded ? "Show the panel" : "Make the map larger"}
      onPress={onToggleExpanded}
    />,
  ];
  const columns = controlColumns(frameHeight);

  return (
    <View
      style={[s.frame, aiming ? s.armed : s.rest, { backgroundColor: palette.background }]}
      onLayout={(event) => {
        setFrameHeight(event.nativeEvent.layout.height);
        setFrameWidth(event.nativeEvent.layout.width);
      }}
    >
      <NativeMap
        ref={native}
        mapStyle={sitePackage.bases[base]}
        style={StyleSheet.absoluteFill}
        dragPan
        touchRotate={false}
        touchPitch={false}
        attribution={false}
        logo={false}
        compass={false}
        accessibilityLabel={`Map of ${sitePackage.name}. ${aiming ? "The cross marks the point that will be placed." : ""}`}
        onPress={(event) => {
          setMenuOpen(false);
          const tapped = event.nativeEvent.lngLat;
          if (aiming) {
            // A tap brings the tapped spot under the cross; it never places a point by itself.
            moveTo([tapped[0], tapped[1]]);
            return;
          }
          if (mode === "zones" && onZonePress) {
            // One covering zone is chosen; on an edge the list decides, never the package's order.
            const tap = zoneTap([tapped[0], tapped[1]], sitePackage.zones);
            if (tap && "zone" in tap) {
              haptics.selection();
              onZonePress(tap.zone);
            } else if (tap) onZoneNote?.(tap.note);
            return;
          }
          setSelected(null);
        }}
        onRegionWillChange={() => {
          if (aiming) lifted.value = withTiming(1, { duration: motion.quick });
        }}
        onRegionIsChanging={(event) => {
          const { center, zoom: next } = event.nativeEvent;
          aim.set({ centre: [center[0], center[1]], zoom: next, moving: true });
        }}
        onRegionDidChange={(event) => {
          const { center, zoom: next, userInteraction } = event.nativeEvent;
          const centre: Coordinate = [center[0], center[1]];
          aim.set({ centre, zoom: next, moving: false });
          setZoom(next);
          if (aiming) {
            lifted.value = withTiming(0, { duration: motion.base });
            // The pin landing is felt as well as seen, but only when a finger moved the map.
            if (userInteraction) haptics.light();
          }
          onAimSettled(centre, next);
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{ center: placed ?? zone.centre, zoom: home }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          maxBounds={sitePackage.bounds}
        />
        {overlays.map((layer) => (
          <GeoJSONSource key={layer.id} id={`package-${layer.id}`} data={layer.data}>
            {packageLayers(layer[base], visible(layer), layer.id)}
          </GeoJSONSource>
        ))}

        {/* Every zone: a dashed edge over a faint fill. */}
        <GeoJSONSource id="collect-zones" data={zoneShapes}>
          <Layer
            id="collect-zones-fill"
            type="fill"
            paint={{ "fill-color": hexWithAlpha(palette.zone.fill, palette.zone.fillOpacity) }}
          />
          <Layer
            id="collect-zones-edge"
            type="line"
            paint={{
              "line-color": palette.zone.edge,
              "line-width": 1.5,
              "line-dasharray": [3, 2],
            }}
          />
        </GeoJSONSource>

        {/* The observer's own position: how sure the fix is, as a circle on the ground. */}
        {meFix && meFix.accuracy !== null && meFix.accuracy > 0 ? (
          <GeoJSONSource id="me-accuracy" data={accuracyCircle(meFix.coordinate, meFix.accuracy)}>
            <Layer
              id="me-accuracy-fill"
              type="fill"
              paint={{ "fill-color": hexWithAlpha(mePaint.accuracy, mePaint.accuracyOpacity) }}
            />
            <Layer
              id="me-accuracy-edge"
              type="line"
              paint={{ "line-color": hexWithAlpha(mePaint.accuracy, 0.55), "line-width": 1 }}
            />
          </GeoJSONSource>
        ) : null}

        {/* The rest of the site dims, so the eye goes to the zone being collected. */}
        <GeoJSONSource id="collect-spotlight" data={spotlight}>
          <Layer
            id="collect-spotlight-fill"
            type="fill"
            paint={{
              "fill-color": base === "aerial" ? mapPalettes.night.background : palette.background,
              "fill-opacity": base === "aerial" ? 0.32 : 0.5,
            }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="collect-focus" data={focusShape}>
          <Layer
            id="collect-focus-edge-halo"
            type="line"
            paint={{ "line-color": palette.zoneLabel.fill, "line-width": 5, "line-opacity": 0.8 }}
          />
          <Layer
            id="collect-focus-edge"
            type="line"
            paint={{ "line-color": palette.zone.edge, "line-width": 2.5 }}
          />
        </GeoJSONSource>
        {aiming ? (
          <CandidateEdges
            aim={aim}
            zones={sitePackage.zones}
            zone={zone}
            edge={palette.zone.edge}
          />
        ) : null}

        {/* Prior observations, drawn on the GPU: a ring and a dot; this session's at full strength. */}
        <GeoJSONSource
          id="collect-observations"
          data={singles}
          onPress={(event) => {
            if (aiming || mode === "zones") return;
            const feature = event.nativeEvent.features[0];
            const id = feature?.properties?.["id"];
            if (typeof id === "string") {
              event.stopPropagation();
              setSelected(id);
            }
          }}
        >
          <Layer
            id="collect-observations-ring"
            type="circle"
            paint={{
              "circle-color": palette.observation.ring,
              "circle-radius": ["case", ["get", "selected"], 11, 8],
              "circle-opacity": ["case", ["get", "session"], 1, 0.6],
            }}
          />
          <Layer
            id="collect-observations-dot"
            type="circle"
            paint={{
              "circle-color": [
                "case",
                ["get", "selected"],
                palette.observation.selected,
                palette.observation.fill,
              ],
              "circle-radius": ["case", ["get", "selected"], 7.5, 5.5],
              "circle-opacity": ["case", ["get", "session"], 1, 0.6],
            }}
          />
        </GeoJSONSource>

        {clusters
          .filter((cluster) => cluster.kind === "cluster")
          .map((cluster) =>
            cluster.kind === "cluster" ? (
              <Marker key={cluster.id} id={cluster.id} lngLat={cluster.coordinates}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${cluster.count} observations here. Zoom in to separate them.`}
                  onPress={() => {
                    if (aiming) return;
                    moveTo(cluster.coordinates, Math.min(zoom + 1.6, MAX_ZOOM));
                  }}
                  style={[
                    s.cluster,
                    {
                      backgroundColor: palette.observation.fill,
                      borderColor: palette.observation.ring,
                    },
                  ]}
                >
                  <Text variant="monoData" style={{ color: palette.observation.ring }}>
                    {cluster.count}
                  </Text>
                </Pressable>
              </Marker>
            ) : null,
          )}

        {/* Zone names in pills, with a check once a zone's inventory is saved in this session. */}
        {sitePackage.zones.map((entry) => {
          const done = doneZones.has(entry.id);
          const name = entry.label.split(" · ")[0] ?? entry.label;
          return (
            <Marker key={`zone-${entry.id}`} id={`zone-${entry.id}`} lngLat={entry.displayAnchor}>
              <View
                pointerEvents="none"
                style={[
                  s.zonePill,
                  {
                    backgroundColor: palette.zoneLabel.fill,
                    borderWidth: entry.id === zone.id ? 2 : 0,
                    borderColor: palette.zone.edge,
                  },
                ]}
              >
                {done ? <Icon name="check" size={14} color={palette.zoneLabel.text} /> : null}
                <Text variant="smallStrong" style={{ color: palette.zoneLabel.text }}>
                  {name}
                </Text>
              </View>
            </Marker>
          );
        })}

        {meFix ? (
          <Marker id="me" lngLat={meFix.coordinate} anchor="center">
            <View
              pointerEvents="none"
              style={[s.meDot, { backgroundColor: mePaint.fill, borderColor: mePaint.ring }]}
            />
          </Marker>
        ) : null}

        {/* Only a hand-placed point is drawn: a zone inventory belongs to the whole zone. */}
        {placed && mode === "placed" ? (
          <Marker id="placed-observation" lngLat={placed} anchor="center">
            <View style={PLACED_BOX}>
              <PlacedMark colours={colours} />
            </View>
          </Marker>
        ) : null}
      </NativeMap>

      {aiming ? <AimReticle colours={colours} lifted={lifted} /> : null}

      {/* The overlay label: where this is, and which plan is showing. */}
      <View
        pointerEvents="none"
        style={[s.label, aiming ? s.labelArmed : null]}
        accessible
        accessibilityLabel={`${title}. ${detail}${meLine ? `. ${meLine}` : ""}`}
      >
        <Text variant="smallStrong" tone={aiming ? "accent" : "ink"}>
          {title}
        </Text>
        <Text variant="small" tone="ink2">
          {detail}
        </Text>
        {meLine ? (
          <Text variant="small" tone="ink2">
            {meLine}
          </Text>
        ) : null}
      </View>

      <View pointerEvents="box-none" style={[s.controls, columns === 2 ? s.controlsPair : null]}>
        {columns === 2 ? (
          <>
            <View pointerEvents="box-none" style={s.controlColumn}>
              {controls.slice(0, 3)}
            </View>
            <View pointerEvents="box-none" style={s.controlColumn}>
              {controls.slice(3)}
            </View>
          </>
        ) : (
          controls
        )}
      </View>

      {menuOpen ? (
        <View
          style={[
            s.menu,
            {
              // Beside the controls, whatever the number of columns, and no wider or taller than the frame.
              ...layersMenuBox(columns, frameWidth, t.space.s2, t.space.s3),
              ...(frameHeight > 0
                ? { maxHeight: Math.min(340, frameHeight - t.space.s3 * 2) }
                : {}),
            },
          ]}
          accessibilityViewIsModal={false}
        >
          <ScrollView contentContainerStyle={s.menuBody}>
            <Text variant="smallStrong">Plan</Text>
            <Segmented
              label="Map plan"
              options={bases}
              value={base}
              onValueChange={(value) => setMapBase(value)}
            />
            <Text variant="smallStrong">Observations</Text>
            <Segmented
              label="Observations on the map"
              options={FILTERS}
              value={filter}
              onValueChange={(value) => {
                setFilter(value);
                setSelected(null);
              }}
            />
            <Switch
              label="Show my location"
              description="Shown on this map only. Never saved with a record."
              checked={me.status !== "off"}
              onCheckedChange={(on) => {
                if (on) turnLocationOn();
                else turnLocationOff();
              }}
            />
            <Text variant="smallStrong">Layers</Text>
            {overlays.map((layer) => {
              const paint = layer[base];
              const swatch = paint.type === "line" ? paint.color : paint.color;
              const edge = paint.type === "fill" ? paint.outline : paint.color;
              return (
                <View key={layer.id} style={s.swatchRow}>
                  <View style={[s.swatch, { backgroundColor: swatch, borderColor: edge }]} />
                  <Switch
                    label={layer.name}
                    checked={visible(layer)}
                    onCheckedChange={(on) =>
                      setHidden(
                        on ? hidden.filter((entry) => entry !== layer.id) : [...hidden, layer.id],
                      )
                    }
                    style={{ flex: 1 }}
                  />
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Scale: an honest bar and its distance, with north always up. */}
      <View
        pointerEvents="none"
        style={s.scale}
        accessible
        accessibilityLabel={`Scale bar, ${bar.label.replace("–", " to ")}. North is up.`}
      >
        <Mono variant="data" tone="ink">{`${bar.label} · north ↑`}</Mono>
        <View style={[s.scaleBar, { width: bar.pixels }]} />
      </View>

      {selectedRecord && !aiming ? (
        <View style={s.callout} accessibilityLiveRegion="polite">
          <View style={s.calloutHead}>
            <Mono variant="data" strong>
              {selectedRecord.label}
            </Mono>
            <Mono variant="data" tone="ink2">
              {selectedRecord.time}
            </Mono>
          </View>
          <Text variant="small" tone="ink2">
            {selectedRecord.round}
          </Text>
          <Text variant="small">{selectedRecord.summary}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(null)}
            hitSlop={8}
            style={{ alignSelf: "flex-start", minHeight: 32, justifyContent: "center" }}
          >
            <Text variant="smallStrong" tone="accent">
              Close
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The readout under the cross while aiming: kept apart so only it re-renders as the map moves. The
 * placement state comes from the zones covering the cross (MUI-3); the hint only suggests zooming in.
 */
export function useAimZone(
  aim: AimStore,
  zones: readonly SiteZone[],
  zone: SiteZone,
  bound: boolean,
  version: number | string,
): {
  centre: Coordinate;
  zoom: number;
  moving: boolean;
  placement: PlacementState;
  hint: string | null;
} {
  const { centre, zoom, moving } = useAim(aim);
  const placement = placementState(centre, zone, zones, bound, version);
  const hint = nearEdgeHint(centre, placement, zones, metresPerPixel(zoom, centre[1]));
  return { centre, zoom, moving, placement, hint };
}

/**
 * While aiming, the other zones that cover the cross are outlined in heavier dashes, so an edge
 * choice can be seen on the plan (MUI 4.4). Palette means only: no UI state colour on the map. Kept
 * apart, like the readout, so only it re-renders as the map moves.
 */
function CandidateEdges({
  aim,
  zones,
  zone,
  edge,
}: {
  readonly aim: AimStore;
  readonly zones: readonly SiteZone[];
  readonly zone: SiteZone;
  readonly edge: string;
}) {
  const { centre } = useAim(aim);
  const others = coveringZones(centre, zones).filter((candidate) => candidate.id !== zone.id);
  const key = others.map((candidate) => candidate.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the shapes change only with the set of zones.
  const shapes: FeatureCollection = useMemo(
    () => ({ type: "FeatureCollection", features: others.map(zoneFeature) }),
    [key],
  );
  if (others.length === 0) return null;
  return (
    <GeoJSONSource id="collect-candidates" data={shapes}>
      <Layer
        id="collect-candidates-edge"
        type="line"
        paint={{ "line-color": edge, "line-width": 3.5, "line-dasharray": [2, 1.5] }}
      />
    </GeoJSONSource>
  );
}
