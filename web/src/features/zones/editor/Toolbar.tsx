"use client";

import { type ReactNode, useId } from "react";

import { buttonClasses } from "@/components/contour/buttonClasses";
import { Icon, type IconName } from "@/components/contour/Icon";
import { Switch } from "@/components/contour/Switch";
import { cx } from "@/lib/cx";

/**
 * The editor's toolbar (UI plan 5.3): the tools, then Undo, Redo, Fit zone and Remove point, then the two
 * switches. A button that cannot act stays focusable (`aria-disabled`) and its reason is the line under the
 * toolbar, which it names in `aria-describedby` (DESIGN §5: a disabled control always carries its reason).
 */

export type ToolAction = {
	label: string;
	icon?: IconName;
	onPress: () => void;
	/** Why the action cannot run now, shown under the toolbar; null when it can. */
	unavailable: string | null;
	/** The key that does the same, for the title. */
	keys?: string;
};

/**
 * An outline button that stays focusable when it cannot act. The Button primitive disables natively, which
 * would drop it from the tab order, so this draws the same look on a plain button with `aria-disabled`.
 */
function ToolButton({ action, reasonId }: { action: ToolAction; reasonId: string }) {
	const off = action.unavailable !== null;
	return (
		<button
			type="button"
			data-variant="outline"
			aria-disabled={off || undefined}
			aria-describedby={off ? reasonId : undefined}
			aria-keyshortcuts={action.keys}
			title={action.keys ? `${action.label} (${action.keys})` : undefined}
			// The disabled look of the primitive, keyed on aria-disabled so it outranks the outline classes.
			className={cx(
				buttonClasses({ variant: "outline", size: "sm" }),
				"aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-well aria-disabled:text-ink-2"
			)}
			onClick={() => {
				if (!off) action.onPress();
			}}>
			{action.icon && <Icon name={action.icon} size={16} className="shrink-0" />}
			{action.label}
		</button>
	);
}

export type ToolbarProps = {
	/** The tool picker, when the editor offers drawing tools. */
	tools?: ReactNode;
	actions: ToolAction[];
	snap: boolean;
	onSnapChange: (on: boolean) => void;
	moveShared: boolean;
	onMoveSharedChange: (on: boolean) => void;
};

export function Toolbar({ tools, actions, snap, onSnapChange, moveShared, onMoveSharedChange }: ToolbarProps) {
	const id = useId();
	const reasonId = `${id}-reasons`;
	const reasons = actions.flatMap(action => (action.unavailable ? [action.unavailable] : []));
	return (
		<div className="flex flex-col gap-3">
			{tools}
			<div role="toolbar" aria-label="Edit" className="flex flex-wrap items-center gap-2">
				{actions.map(action => (
					<ToolButton key={action.label} action={action} reasonId={reasonId} />
				))}
			</div>
			<p id={reasonId} className="type-small text-ink-2">
				{reasons.join(" ")}
			</p>
			<div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
				<Switch
					id={`${id}-snap`}
					checked={snap}
					onCheckedChange={onSnapChange}
					label="Snap to points"
					description="A dragged point lands exactly on a nearby point of another zone or the site edge. Hold Alt to place it freely."
				/>
				<Switch
					id={`${id}-shared`}
					checked={moveShared}
					onCheckedChange={onMoveSharedChange}
					label="Move shared points together"
					description="Points that other zones share move with the one you move, so shared edges stay shared."
				/>
			</div>
		</div>
	);
}
