import type { Metadata } from "next";
import Link from "next/link";

import styles from "../../legal.module.css";
import { policy } from "../../policy";
import { Contact, DraftNotice, Missing } from "../../policy-parts";

export const metadata: Metadata = {
	title: `Delete your ${policy.appName} account and data`,
	description: `How to delete your ${policy.appName} account and the observations linked to it.`
};

/* Write apostrophes and quotes as ’ “ ”, not HTML entities; see the note in ../page.tsx. */
export default function DeleteDataPage() {
	return (
		<article>
			<h1>Delete your account and data</h1>
			<p className={styles.meta}>
				{policy.appName} · Effective {policy.effectiveDate}
			</p>
			<DraftNotice />

			<p className={styles.lead}>
				You can delete your {policy.appName} account yourself on the website, without the app, and remove data
				from your device. To delete the observations uploaded under your account, or if you cannot sign in, send
				a request to the team that runs {policy.appName}.
			</p>

			<h2 id="yourself">Delete your account yourself</h2>
			<ol>
				<li>
					On the website, open <Link href="/account">Account</Link>. If you are not signed in, it asks you to
					sign in first and then opens.
				</li>
				<li>
					Under <strong>Delete account</strong>, choose <strong>Review account deletion</strong>. The page
					lists what is removed. Type DELETE and choose <strong>Request account deletion</strong>.
				</li>
				<li>
					Your profile and your memberships of organizations and projects are removed, and you are signed out.
					If removing your sign-in takes longer, the page says so, and we finish it.
				</li>
			</ol>
			<p>
				If you are the only owner of an organization, or the only manager of a project, that has other members,
				the page names it: hand it over first. The app cannot delete accounts yet.
			</p>

			<h2 id="on-device">Remove data from your device</h2>
			<ol>
				<li>
					Open <strong>Account and synchronisation</strong> and choose{" "}
					<strong>Sign out on this device</strong>. This removes your sign-in from the device. If you have
					been offline for a while, you may need a connection before the button appears. Signing out does not
					delete your records: everything you recorded, uploaded or not, stays on the device.
				</li>
				<li>
					Uninstall the app.
					<ul>
						<li>
							On Android, this deletes everything the app stored on the device. Records that were not
							uploaded cannot be recovered afterwards. Clearing the app’s storage in Settings has the same
							effect.
						</li>
						<li>
							On iPhone and iPad, deleting the app (not “Offload App”) removes your records from the
							device, but copies stay in any iCloud or computer backup made earlier. Your sign-in can
							remain in the iOS Keychain after the app is deleted, which is why you should sign out first.
						</li>
					</ul>
				</li>
			</ol>

			<h2 id="request">Ask us to delete your account and uploaded data</h2>
			<ol>
				<li>
					Email <Contact email={policy.contactEmail} /> from the email address you use to sign in, with the
					subject <strong>Delete my {policy.appName} account</strong>.
				</li>
				<li>Say whether you want your account deleted, your uploaded observations deleted, or both.</li>
				<li>
					We confirm the request with you before deleting anything, and complete it within{" "}
					{policy.deletionDays === null ? <Missing>number of days</Missing> : `${policy.deletionDays} days`}.
					We email you when it is done.
				</li>
			</ol>

			<h2 id="what-is-deleted">What is deleted</h2>
			<ul>
				<li>
					<strong>Your account:</strong> your sign-in email address, your password, your sign-in sessions and
					your membership of research projects.
				</li>
				<li>
					<strong>Observations you uploaded:</strong> the map positions, times, initials and answers recorded
					under your account.
				</li>
			</ul>

			<h2 id="what-may-be-kept">What may be kept</h2>
			<ul>
				<li>
					Observations are research data that belong to a study. If a study’s approved protocol or the law
					requires records to be kept, we may keep your observations instead of deleting them, and we will
					tell you when we reply. We will remove the link to your account where we can, but your initials and
					the time and place of each observation stay with the record, so people on your team may still be
					able to tell who recorded it.
				</li>
				<li>
					Our sign-in provider keeps a log of sign-ins and account changes, including your email address and
					IP address. It is kept {policy.logRetention ?? <Missing>log retention period</Missing>}.
				</li>
				<li>
					Deleted data can remain in our provider’s backups for a limited time, until they are overwritten.
				</li>
				<li>Copies already included in published or shared research results cannot be recalled.</li>
			</ul>

			<h2 id="more">More information</h2>
			<p>
				The <Link href="/privacy">privacy policy</Link> explains what {policy.appName} collects, why, and who
				can see it.
			</p>
		</article>
	);
}
