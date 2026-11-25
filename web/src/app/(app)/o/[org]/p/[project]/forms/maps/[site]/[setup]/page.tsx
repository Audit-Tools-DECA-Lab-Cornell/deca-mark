import { SetupPage } from "@/features/map-setup/SetupPage";

export const metadata = { title: "Assign a form to a map" };

export default function AssignMapFormPage({
	params
}: {
	readonly params: Promise<{ org: string; project: string; site: string; setup: string }>;
}) {
	return <SetupPage params={params} assignForm />;
}
