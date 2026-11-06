import { Island } from "@/components/contour/Island";
import { ScreenState } from "@/components/contour/ScreenState";

/** An organization page on its way: still rows after the skeleton delay, so a fast load shows nothing. */
export default function OrgLoading() {
	return (
		<Island flush divided={false}>
			<ScreenState kind="loading" loadingLabel="Loading the organization…" rows={4} />
		</Island>
	);
}
