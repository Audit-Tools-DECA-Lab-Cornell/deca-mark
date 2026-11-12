"use client";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/contour/buttonClasses";
import { Icon, type IconName } from "@/components/contour/Icon";
import { cx } from "@/lib/cx";

/** Everything map setup can read: a QGIS project, a ZIP of one, and the data files a project points at. */
export const MAP_FILE_TYPES = ".qgz,.qgs,.zip,.gpkg,.shp,.shx,.dbf,.prj,.cpg,.geojson,.json";

/**
 * A file input dressed as a Contour button. The input stays in the page and keeps keyboard focus, so the
 * button works without a mouse; choosing the same file twice in a row still reports it.
 */
export function FilePick({
	id,
	label,
	variant = "outline",
	size = "md",
	icon,
	disabled = false,
	onFiles,
	children
}: {
	readonly id: string;
	/** The input's accessible name. */
	readonly label: string;
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
	readonly icon?: IconName;
	readonly disabled?: boolean;
	readonly onFiles: (files: File[]) => void;
	readonly children: string;
}) {
	return (
		<span className="inline-flex">
			<input
				id={id}
				type="file"
				multiple
				disabled={disabled}
				accept={MAP_FILE_TYPES}
				aria-label={label}
				className="peer sr-only"
				onChange={event => {
					const files = Array.from(event.target.files ?? []);
					event.target.value = "";
					if (files.length) onFiles(files);
				}}
			/>
			<label
				htmlFor={id}
				className={cx(
					buttonClasses({ variant, size }),
					"cursor-pointer",
					"peer-disabled:cursor-not-allowed peer-disabled:border-transparent peer-disabled:bg-well peer-disabled:text-ink-2",
					"peer-focus-visible:outline-(length:--ct-size-focus-ring) peer-focus-visible:outline-offset-(--ct-size-focus-gap) peer-focus-visible:outline-focus peer-focus-visible:outline-solid"
				)}>
				{icon && <Icon name={icon} size={size === "sm" ? 16 : 18} className="shrink-0" />}
				{children}
			</label>
		</span>
	);
}
