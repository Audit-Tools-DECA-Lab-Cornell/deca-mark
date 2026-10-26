/**
 * Contour web primitives (DESIGN.md §5), from one place: `import { Button, Island } from "@/components/contour"`.
 * Server components may import from here too: client primitives arrive as client references, and the
 * shared class strings and code helpers live in plain modules so they arrive as values.
 */

export { AnswerTile, type AnswerTileProps } from "./AnswerTile";
export { Avatar, type AvatarProps } from "./Avatar";
export { Breadcrumbs, type BreadcrumbsProps, type Crumb } from "./Breadcrumbs";
export {
	Button,
	ButtonLink,
	type ButtonLinkProps,
	type ButtonLook,
	type ButtonProps,
	type ButtonSize,
	type ButtonVariant
} from "./Button";
export { buttonClasses } from "./buttonClasses";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { CONTROL_TRANSITION, controlFrame, MENU_SURFACE, OVERLAY_MOTION } from "./classes";
export { cleanCode, codeCounter, type CodeKind } from "./code";
export { CodeCounter } from "./CodeCounter";
export { CodeInput, type CodeInputProps } from "./CodeInput";
export { CoverageDots, type CoverageDotsProps, coverageSummary } from "./CoverageDots";
export { Dialog, DialogClose, type DialogProps } from "./Dialog";
export { type Fact, FactsList, type FactsListProps } from "./FactsList";
export { Field, type FieldProps, useFieldControl, useFieldCounter, useFieldIds } from "./Field";
export { Icon, ICON_NAMES, type IconName, isIconName } from "./Icon";
export { IconButton, type IconButtonProps, type IconButtonVariant } from "./IconButton";
export { type InkTab, InkTabs, type InkTabsProps } from "./InkTabs";
export { InnerPanel, type InnerPanelProps } from "./InnerPanel";
export { Island, type IslandProps, IslandSection, type IslandSectionProps } from "./Island";
export { Kbd, type KbdProps, ShortcutHint, type ShortcutHintProps } from "./Kbd";
export {
	Menu,
	MenuCheckboxItem,
	type MenuCheckboxItemProps,
	MenuContent,
	MenuItem,
	type MenuItemProps,
	MenuLabel,
	MenuRadioGroup,
	MenuRadioItem,
	type MenuRadioItemProps,
	MenuSeparator,
	MenuTrigger
} from "./Menu";
export { ModeStrip, type ModeStripIndex, type ModeStripProps } from "./ModeStrip";
export { Mono, type MonoProps, type MonoVariant } from "./Mono";
export { Note, NOTE_ICON, type NoteProps, type NoteTone } from "./Note";
export { NumberStepper, type NumberStepperProps } from "./NumberStepper";
export { PAGE_TITLE_ID, PageHeader, type PageHeaderProps } from "./PageHeader";
export { PasswordInput, type PasswordInputProps } from "./PasswordInput";
export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger } from "./Popover";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar";
export { type RadioRowOption, RadioRows, type RadioRowsProps } from "./RadioRows";
export { RoleLabel, type RoleLabelProps } from "./RoleLabel";
export { ScreenState, type ScreenStateKind, type ScreenStateProps } from "./ScreenState";
export { Segmented, type SegmentedOption, type SegmentedProps } from "./Segmented";
export { Select, type SelectProps } from "./Select";
export { Skeleton, type SkeletonProps } from "./Skeleton";
export { StateBadge, type StateBadgeProps } from "./StateBadge";
export { StepBar, type StepBarProps, type StepBarStep } from "./StepBar";
export { Switch, type SwitchProps } from "./Switch";
export { Table, type TableProps, TBody, Td, type TdProps, Th, THead, type ThProps, Tr, type TrProps } from "./Table";
export { Textarea, type TextareaProps } from "./Textarea";
export { TextInput, type TextInputProps } from "./TextInput";
export { TextLink, type TextLinkProps } from "./TextLink";
export { Timeline, type TimelineItem, type TimelineProps } from "./Timeline";
export {
	type ToastActionOptions,
	type ToastApi,
	type ToastOptions,
	ToastProvider,
	type ToastTone,
	useToast
} from "./Toast";
export { type Tone, TONE_BORDER, TONE_SOFT, TONE_TEXT } from "./tone";
export { Tooltip, type TooltipProps, TooltipProvider } from "./Tooltip";
export { type TypeBarRow, TypeBars, type TypeBarsProps } from "./TypeBars";
export { useHydrated } from "./useHydrated";
export { type RovingRowProps, type RovingRowsOptions, useRovingRows } from "./useRovingRows";
