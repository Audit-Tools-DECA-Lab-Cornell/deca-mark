import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import riverside from "../../../../contracts/fixtures/sites/riverside.json";
import { mapPalettes } from "../../maps/palette";
import { Icon, Mono, type Theme, usePreferences, useStyles, useTheme } from "../../ui";
import { type PlanPoint, RIVERSIDE_PLAN } from "../auth/plan";

/**
 * A still drawing of a site's plan for the Project and Site screens (Mobile 11 and 13): the thumbnail in
 * a site row, and the frame above a ready package with its scale and version chip. It is the shared
 * Riverside fixture (`contracts/fixtures/sites/riverside.json`) in the map palette the observer chose (never the screen theme).
 * The field map itself is MapLibre on the collect screen.
 */

type View4 = { x: number; y: number; width: number; height: number };

/** The thumbnail's square: the zones and the paths between them. */
const THUMB_VIEW: View4 = { x: 170, y: 80, width: 300, height: 300 };
/** The frame's wide crop, as Mobile 13 shows it: North meadow and the paths below it. */
const FRAME_VIEW: View4 = { x: 120, y: 70, width: 400, height: 150 };

const STROKE = { site: 1.25, surface: 0.75, built: 1, tree: 0.75, pathEdge: 1.5 } as const;
const ZONE = { width: 1.5, dash: [5, 3.5] } as const;

/** Metres on the ground per plan unit, from the fixture's own frame. */
const METRES_PER_UNIT = riverside.frame.metresPerUnit;
/** Round distances the scale bar may show, smallest first. */
const SCALE_STEPS = [5, 10, 20, 25, 50, 100, 200] as const;
/** The longest bar the chip holds, in points. */
const SCALE_MAX = 72;

/** The longest round distance whose bar fits the chip, and that bar's length in points. */
export function scaleBar(pointsPerUnit: number): { metres: number; points: number } {
  const perMetre = pointsPerUnit / METRES_PER_UNIT;
  let chosen: number = SCALE_STEPS[0];
  for (const metres of SCALE_STEPS) if (metres * perMetre <= SCALE_MAX) chosen = metres;
  return { metres: chosen, points: chosen * perMetre };
}

function ringPath(points: readonly PlanPoint[]): string {
  return `${linePath(points)} Z`;
}

function linePath(points: readonly PlanPoint[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

function planStyles(t: Theme) {
  return StyleSheet.create({
    fill: { flex: 1, alignSelf: "stretch" },
    frame: {
      aspectRatio: FRAME_VIEW.width / FRAME_VIEW.height,
      borderRadius: t.radius.island,
      borderWidth: t.size.border,
      borderColor: t.c.line,
      overflow: "hidden",
      backgroundColor: t.c.well,
    },
    chip: {
      position: "absolute",
      left: t.space.s3,
      bottom: t.space.s3,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: t.space.s4,
      rowGap: t.space.s1,
      maxWidth: "90%",
      paddingHorizontal: t.space.s4,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.pill,
      borderWidth: t.size.border,
      borderColor: t.c.line,
      backgroundColor: t.c.island,
    },
    scale: { gap: t.space.s1 },
    bar: { height: 3, backgroundColor: t.c.ink, borderRadius: t.radius.pill },
  });
}

/** The plan drawn into a view box, at the size its parent gives it. */
function PlanDrawing({ view, width }: { view: View4; width: number }) {
  const { mapPalette } = usePreferences();
  const palette = mapPalettes[mapPalette];
  const plan = RIVERSIDE_PLAN;
  // Plan units per point on screen, so strokes and dashes can be set in points.
  const unit = view.width / Math.max(width, 1);
  const px = (points: number) => points * unit;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <Rect x={0} y={0} width={plan.width} height={plan.height} fill={palette.background} />
      {plan.site.map((shape) => (
        <Path
          key={shape.id}
          d={ringPath(shape.points)}
          fill={palette.site.fill}
          stroke={palette.site.edge}
          strokeWidth={px(STROKE.site)}
        />
      ))}
      {plan.surfaces.map((shape) => {
        const swatch =
          palette.surfaces[shape.kind as keyof typeof palette.surfaces] ?? palette.surfaces.grass;
        return (
          <Path
            key={shape.id}
            d={ringPath(shape.points)}
            fill={swatch.fill}
            stroke={swatch.edge}
            strokeWidth={px(STROKE.surface)}
          />
        );
      })}
      {plan.paths.map((shape) => (
        <Path
          key={`${shape.id}-edge`}
          d={linePath(shape.points)}
          fill="none"
          stroke={palette.path.line}
          strokeWidth={(shape.width ?? 0) + px(STROKE.pathEdge) * 2}
        />
      ))}
      {plan.paths.map((shape) => (
        <Path
          key={shape.id}
          d={linePath(shape.points)}
          fill="none"
          stroke={palette.surfaces.path.fill}
          strokeWidth={shape.width ?? 0}
        />
      ))}
      {[...plan.structures, ...plan.equipment].map((shape) => {
        const look = shape.kind === "structure" ? palette.structure : palette.equipment;
        return (
          <Path
            key={shape.id}
            d={ringPath(shape.points)}
            fill={look.fill}
            stroke={look.edge}
            strokeWidth={px(STROKE.built)}
          />
        );
      })}
      <G opacity={palette.tree.opacity}>
        {plan.trees.map((tree) => (
          <Circle
            key={tree.id}
            cx={tree.center[0]}
            cy={tree.center[1]}
            r={tree.radius}
            fill={palette.tree.fill}
            stroke={palette.tree.edge}
            strokeWidth={px(STROKE.tree)}
          />
        ))}
      </G>
      {plan.zones.map((zone) => (
        <Path
          key={zone.id}
          d={ringPath(zone.points)}
          fill={palette.zone.fill}
          fillOpacity={palette.zone.fillOpacity}
          stroke={palette.zone.edge}
          strokeWidth={px(ZONE.width)}
          strokeDasharray={ZONE.dash.map(px)}
        />
      ))}
    </Svg>
  );
}

/** Measures its own width, so strokes and the scale bar are set in points on screen. */
function useWidth(initial: number) {
  const [width, setWidth] = useState(initial);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };
  return { width, onLayout };
}

/** The site row's thumbnail: decorative, since the row already names the site and its state. */
export function SitePlanThumb() {
  const s = useStyles(planStyles);
  const { width, onLayout } = useWidth(76);
  return (
    <View
      style={s.fill}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PlanDrawing view={THUMB_VIEW} width={width} />
    </View>
  );
}

/**
 * The plan above a ready package (Mobile 13), with the chip "0–25 m · Map v3 · north ↑". The scale is
 * measured from the drawing, so the bar is as long as the distance it names.
 */
export function SitePlanFrame({ siteName, version }: { siteName: string; version: string }) {
  const s = useStyles(planStyles);
  const { width, onLayout } = useWidth(360);
  const scale = scaleBar(width / FRAME_VIEW.width);
  const caption = `Map ${version} · north ↑`;
  return (
    <View
      style={s.frame}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${siteName} plan, map ${version}. North is up; the bar shows ${scale.metres} metres.`}
    >
      <PlanDrawing view={FRAME_VIEW} width={width} />
      <View style={s.chip}>
        <View style={s.scale}>
          <Mono>{`0–${scale.metres} m`}</Mono>
          <View style={[s.bar, { width: scale.points }]} />
        </View>
        <Mono>{caption}</Mono>
      </View>
    </View>
  );
}

/**
 * A ready site whose plan is not drawn here yet: a still map glyph on the well, without the dashed edge
 * that means "not on this device".
 */
export function SiteGlyphThumb() {
  const t = useTheme();
  return (
    <View
      style={{ flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon name="map-pinned" size={24} color={t.c.ink} />
    </View>
  );
}
