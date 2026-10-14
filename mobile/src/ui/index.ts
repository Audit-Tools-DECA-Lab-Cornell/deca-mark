/**
 * Contour on the collector: every primitive, hook and type in one import.
 *
 *   import { Button, Island, Screen, useTheme } from "../src/ui";
 *
 * Screens compose these and never restyle them. Colours, sizes and words come from
 * `contracts/contour.json` through `tokens.ts`; nothing here holds a hex value.
 */

export { AnswerGrid, type AnswerGridProps, AnswerTile, type AnswerTileProps } from "./AnswerTile";
export { Avatar, type AvatarProps, initialsOf } from "./Avatar";
export {
  Button,
  type ButtonLinkTone,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  PRESSED_OPACITY,
} from "./Button";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { CodeInput, type CodeInputProps, type CodeKind, cleanCode } from "./CodeInput";
export { type Fact, FactsList, type FactsListProps } from "./FactsList";
export {
  Field,
  type FieldContextValue,
  type FieldCounter,
  FieldFooter,
  type FieldFooterProps,
  type FieldProps,
  useField,
  useFieldCounter,
} from "./Field";
export { contourFonts, fontFamily } from "./fonts";
export { type HapticTaps, useHaptics } from "./haptics";
export { Icon, type IconName, type IconProps, isIconName } from "./Icon";
export { IconButton, type IconButtonProps, type IconButtonVariant } from "./IconButton";
export { InnerPanel, type InnerPanelProps } from "./InnerPanel";
export { Island, type IslandProps, type IslandTone } from "./Island";
export { ListRow, type ListRowProps, type ThumbnailPlaceholder } from "./ListRow";
export { Logo, type LogoProps } from "./Logo";
export { type ModeStep, ModeStrip, type ModeStripProps } from "./ModeStrip";
export { Mono, type MonoProps, type MonoVariant } from "./Mono";
export { NOTE_ICON, Note, type NoteProps, type NoteTone } from "./Note";
export { NumberStepper, type NumberStepperProps } from "./NumberStepper";
export { OnlineIndicator, type OnlineIndicatorProps, useOnline } from "./OnlineIndicator";
export { PasswordInput, type PasswordInputProps } from "./PasswordInput";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar";
export { ProposalNote, type ProposalNoteProps } from "./ProposalNote";
export {
  DEFAULT_PREFERENCES,
  type Preferences,
  PreferencesProvider,
  type PreferencesValue,
  usePreferences,
} from "./preferences";
export { type RadioOption, RadioRows, type RadioRowsProps } from "./RadioRows";
export { Screen, type ScreenProps } from "./Screen";
export { ScreenHeader, type ScreenHeaderProps } from "./ScreenHeader";
export { ScreenState, type ScreenStateKind, type ScreenStateProps } from "./ScreenState";
export { Segmented, type SegmentedOption, type SegmentedProps } from "./Segmented";
export { Skeleton, SkeletonBar, type SkeletonBarProps, type SkeletonProps } from "./Skeleton";
export { StateBadge, type StateBadgeProps, type StateBadgeSize } from "./StateBadge";
export { announce, StatusLine, type StatusLineProps } from "./StatusLine";
export { StepBars, type StepBarsProps } from "./StepBars";
export { Switch, type SwitchProps } from "./Switch";
export { dockClearance, TabDock, tabKey } from "./TabDock";
export { Text, type TextProps, type TextTone } from "./Text";
export { Textarea, type TextareaProps } from "./Textarea";
export { TextInput, type TextInputProps } from "./TextInput";
export { TextLink, type TextLinkProps } from "./TextLink";
export { type Theme, ThemeProvider, useStyles, useTheme } from "./theme";
export {
  type ColorName,
  type Colors,
  colorsFor,
  DEFAULT_SCHEME,
  LAYOUT,
  MOTION,
  RADIUS,
  SCHEMES,
  type Scheme,
  SIZE,
  SPACE,
  STATE_KINDS,
  STATES,
  type StateDefinition,
  type StateKey,
  type StateKind,
  type StateTone,
  stateOf,
  TYPE,
  type TypeRole,
  type TypeSpec,
  toneColor,
  toneSoft,
} from "./tokens";
