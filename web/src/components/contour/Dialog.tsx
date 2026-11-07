"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export type DialogProps = {
	/** Controlled open state. Leave both out to let `trigger` open the dialog by itself. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title: ReactNode;
	/** One or two sentences under the title, read with it when the dialog opens. */
	description?: ReactNode;
	children?: ReactNode;
	/** The actions, right-aligned: an outline Cancel before the one primary or danger-solid button. */
	footer?: ReactNode;
	/** sm 448, md 560 (the designed limit), lg 768 px wide at most. */
	size?: "sm" | "md" | "lg";
	/** An element that opens the dialog, usually a Button. Focus returns to it on close. */
	trigger?: ReactNode;
	className?: string;
	/** Where focus goes when the dialog has closed, for a dialog without a `trigger`. Call `preventDefault()` to take over. */
	onCloseAutoFocus?: (event: Event) => void;
};

const WIDTH = {
	sm: "max-w-md",
	md: "max-w-140",
	lg: "max-w-3xl"
} as const;

/** Closes the dialog it sits in. Wrap the Cancel button: `<DialogClose asChild><Button …/></DialogClose>`. */
export const DialogClose = DialogPrimitive.Close;

/**
 * A modal island over the scrim (DESIGN §5). Focus moves in and is trapped, Esc and a press on the scrim
 * close it, and focus returns to what opened it. It enters with the pop motion and leaves faster.
 */
export function Dialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	footer,
	size = "md",
	trigger,
	className,
	onCloseAutoFocus
}: DialogProps) {
	// Without a description the dialog is named by its title alone; say so, rather than point at nothing.
	const describedBy = description == null ? { "aria-describedby": undefined } : {};

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			{trigger != null && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
				<DialogPrimitive.Content
					{...describedBy}
					onCloseAutoFocus={onCloseAutoFocus}
					className={cx(
						"fixed inset-0 z-50 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto",
						"rounded-island border border-line bg-island p-6 text-ink shadow-ledge",
						"data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
						WIDTH[size],
						className
					)}>
					<DialogPrimitive.Title className="type-section">{title}</DialogPrimitive.Title>
					{description != null && (
						<DialogPrimitive.Description className="mt-2 type-body text-ink-2">
							{description}
						</DialogPrimitive.Description>
					)}
					{children != null && <div className="mt-5">{children}</div>}
					{footer != null && (
						<div className="mt-6 flex flex-wrap items-center justify-end gap-3">{footer}</div>
					)}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
