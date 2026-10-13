import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/contour/PageHeader";

import type { SpecimenLayers } from "./specimens";
import { ZoneEditorSpecimen } from "./ZoneEditorSpecimen";

export const metadata: Metadata = {
	title: "Zone editor specimen",
	robots: { index: false, follow: false }
};

/** Like the Contour gallery: development, and preview builds made with NEXT_PUBLIC_PREVIEW_TOOLS=1. */
const PREVIEW_TOOLS = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_PREVIEW_TOOLS === "1";

/** The Fall Creek upload layers from the repository, when this checkout has them; the set is left out otherwise. */
function fallCreekLayers(): SpecimenLayers | null {
	try {
		const folder = path.join(process.cwd(), "..", "qgis", "fall-creek", "upload-sample");
		const read = (name: string) => JSON.parse(readFileSync(path.join(folder, name), "utf8"));
		return { ground: read("ground.geojson"), zones: read("zones.geojson"), trees: read("trees.geojson") };
	} catch {
		return null;
	}
}

export default async function ZoneEditorSpecimenPage({
	searchParams
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	if (!PREVIEW_TOOLS) notFound();
	const { shapes } = await searchParams;
	return (
		<main id="main" className="mx-auto flex w-full max-w-page flex-col gap-8 bg-ground px-4 py-10 sm:px-gutter">
			<PageHeader
				breadcrumbs={[{ label: "Dev tools" }, { label: "Zone editor" }]}
				title="Zone editor"
				lead="The zone editor on specimen shapes from the contract's geometry cases, its size limits and the Fall Creek layers. Every coordinate stays as written unless you move it."
			/>
			<ZoneEditorSpecimen fallCreek={fallCreekLayers()} initial={typeof shapes === "string" ? shapes : ""} />
		</main>
	);
}
