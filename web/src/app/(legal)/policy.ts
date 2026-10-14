/**
 * Facts the privacy pages need that the code cannot supply. Every `null` renders as a visible
 * "to be confirmed" marker and is listed in the draft notice at the top of each page, so an
 * incomplete policy can never pass for a finished one.
 *
 * The operator and developer details were supplied by the developer. The values marked "Assumed"
 * were chosen on September 22, 2026 as typical for a university research app, at the developer's
 * request; confirm them with the lab and keep the systems consistent with them.
 */
export const policy = {
	appName: "DECA Mark",
	/** The organisation responsible for the app and its data. */
	operator: "DECA Lab at Cornell University" as string | null,
	/** The researcher who leads the operator. */
	lead: { name: "Professor Janet Loebach", url: "https://human.cornell.edu/people/janet-loebach" },
	/** Where privacy questions and deletion requests go. */
	contactEmail: "j.loebach@cornell.edu" as string | null,
	/** Who builds and maintains the app; the contact for technical questions. */
	developer: {
		name: "Pratyush Sudhakar",
		url: "https://pratyushsudhakar.com",
		email: "pratyushsudhakar03@gmail.com"
	},
	/** Assumed. Who hosts the server that receives uploads. */
	serverHost: "a cloud hosting provider in the United States" as string | null,
	/** Assumed. How long uploaded observations and accounts are kept; completes a sentence. */
	retention:
		"while the study runs, and afterwards for as long as the study’s approved research protocol and Cornell University policy require, usually three years after the study ends" as
			| string
			| null,
	/**
	 * Assumed. How long server request logs and sign-in records are kept; completes a sentence.
	 * Keeping this true needs the sign-in provider's database audit log cleared on the same cycle.
	 */
	logRetention: "for up to 90 days" as string | null,
	/** Assumed. How many days a deletion request may take. */
	deletionDays: 30 as number | null,
	/**
	 * How long practice observations in the Training project are kept; completes a sentence. The database
	 * deletes them 30 days after they arrive (the daily `fieldmaps_training_purge` job). Q2 (IRB constraints)
	 * may change the window; keep this and the job in step.
	 */
	trainingRetention: "30 days after they arrive" as string | null,
	/** Who delivers the sign-in codes and invitation emails. Not yet confirmed for the hosted service. */
	emailProvider: null as string | null,
	/** The date this version of the policy takes effect. */
	effectiveDate: "October 14, 2026"
};

export const missingFacts: readonly string[] = [
	policy.operator === null ? "who operates the app (organisation name)" : null,
	policy.contactEmail === null ? "a contact email for privacy questions and deletion requests" : null,
	policy.serverHost === null ? "who hosts the upload server" : null,
	policy.retention === null ? "how long accounts and uploaded observations are kept" : null,
	policy.logRetention === null ? "how long server logs and sign-in records are kept" : null,
	policy.deletionDays === null ? "how many days a deletion request may take" : null,
	policy.trainingRetention === null ? "how long practice observations in the Training project are kept" : null,
	policy.emailProvider === null ? "who delivers sign-in codes and invitation emails" : null
].filter((fact): fact is string => fact !== null);
