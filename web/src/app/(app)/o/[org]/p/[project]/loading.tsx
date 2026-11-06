import { Island } from "@/components/contour/Island";
import { ScreenState } from "@/components/contour/ScreenState";

/** A project page on its way: still rows after the skeleton delay, so a fast load shows nothing. */
export default function ProjectLoading() {
	return (
		<Island flush divided={false}>
			<ScreenState kind="loading" loadingLabel="Loading the project…" rows={5} />
		</Island>
	);
}
