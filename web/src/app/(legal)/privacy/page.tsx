import type { Metadata } from "next";
import Link from "next/link";

import styles from "../legal.module.css";
import { policy } from "../policy";
import { Contact, DraftNotice, Missing } from "../policy-parts";

export const metadata: Metadata = {
	title: `${policy.appName} privacy policy`,
	description: `What the ${policy.appName} field collector app collects, why, who can see it, and how to delete it.`
};

/*
 * Every statement here was checked against the code in mobile/, backend/, database/ and supabase/.
 * When the app starts collecting something new — for example when a study form that records
 * observations about children is published for upload — update this page before that release.
 * Write apostrophes and quotes as ’ “ ”, not &apos; or &quot;: the compiler drops the space after
 * an expression such as {policy.appName} in a text run that contains an HTML entity.
 */
export default function PrivacyPage() {
	const operator = policy.operator ?? <Missing>operator name</Missing>;

	return (
		<article>
			<h1>Privacy policy</h1>
			<p className={styles.meta}>
				{policy.appName} · Effective {policy.effectiveDate}
			</p>
			<DraftNotice />

			<p className={styles.lead}>
				{policy.appName} is an app research teams use to record observations at a study site: an observer marks
				a point on a site map and answers the study’s questions, often without a signal. This policy explains
				what the app collects, why, who can see it and what you can do about it. It covers the {policy.appName}{" "}
				app for Android and iOS, the {policy.appName} website where accounts and studies are managed, and the
				server they both use.
			</p>

			<section className={styles.summary} aria-labelledby="summary">
				<h2 id="summary">In short</h2>
				<ul>
					<li>
						We collect the email address you sign up with, the profile you enter, and the observations you
						record.
					</li>
					<li>
						The app does not read your contacts, photos, camera or microphone. It reads your device’s
						location only if you turn on “Show my location”, and only to draw where you are on the map.
					</li>
					<li>There are no ads, analytics or tracking, and we never sell data.</li>
					<li>
						What you upload is seen by your research project team and the people who run {policy.appName}.
						Our hosting provider stores it for us.
					</li>
					<li>
						You can delete your account yourself on the website, or{" "}
						<Link href="/privacy/delete-data">ask us to delete your account and data</Link>.
					</li>
				</ul>
			</section>

			<h2 id="who-we-are">Who we are</h2>
			<p>
				{policy.appName} is run by the {operator}, led by <a href={policy.lead.url}>{policy.lead.name}</a>,
				which is responsible for the data described here (“we”, “us”). The app is built and maintained by{" "}
				<a href={policy.developer.url}>{policy.developer.name}</a>. Each study is run by a research project
				team. The project team decides what its study records and uses the observations for its research.
			</p>

			<h2 id="what-we-collect">What we collect</h2>
			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th scope="col">Data</th>
							<th scope="col">What it is</th>
							<th scope="col">Why</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Account details</td>
							<td>
								Anyone can create an account, on the website or in the app, with an email address and a
								password of 8 to 128 characters, then sign in with it on either. We email a six-digit code
								to confirm the address, and another if you reset your password. The app and the website send your password only to our sign-in provider
								and never store it; if you use a password manager, your device may offer to save it
								there. An account uploads to a research project only after it joins that project with an
								invitation or a join code from the project’s team.
							</td>
							<td>To sign you in and confirm the address is yours.</td>
						</tr>
						<tr>
							<td>Profile</td>
							<td>
								The name and observer initials you enter, and your language setting. Your initials
								become the observer code on each observation you record. We also keep which
								organizations and projects you belong to, and your role in each.
							</td>
							<td>To label your observations and decide what you can see and do.</td>
						</tr>
						<tr>
							<td>Account ID</td>
							<td>
								A random identifier our sign-in provider gives your account. It is stored with each
								record on your device and each observation you upload.
							</td>
							<td>
								To keep each person’s records separate on a shared device, to record who uploaded each
								observation, and to control access.
							</td>
						</tr>
						<tr>
							<td>Observations</td>
							<td>
								The point you place on the site map, the time, your initials, and your answers to the
								study’s questions, such as a count of the people present and your notes. The server also
								records when each upload arrives.
							</td>
							<td>This is the research data the app exists to collect.</td>
						</tr>
						<tr>
							<td>Study details</td>
							<td>The study site, zone and round you choose before observing.</td>
							<td>To file each observation under the right part of the study.</td>
						</tr>
						<tr>
							<td>Connection and sign-in information</td>
							<td>
								Your IP address, the address of each request, and basic details your device sends with
								it, such as the app and operating system version. Our sign-in provider also records the
								time, IP address and device details of each sign-in against your account.
							</td>
							<td>To run the service securely and fix problems.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h3>The Training project</h3>
			<p>
				Every new account joins a shared Training project, so you can practise before joining a study. Only you
				can see the practice observations you upload there; other people in Training cannot. Practice
				observations are deleted {policy.trainingRetention ?? <Missing>Training retention period</Missing>}.
			</p>

			<h3>On the website</h3>
			<p>
				The website keeps you signed in with cookies, and remembers the project you opened last. While you
				confirm your email address or reset your password, it keeps the address in a cookie only the website can
				read, for up to 30 minutes, and removes it when you finish. Your screen theme, map colours and recent
				searches are kept in your browser.
			</p>

			<h3>The map point is not your GPS location</h3>
			<p>
				You place each point yourself on the site map. A point still shows where on the study site something was
				observed. Because you record it while you are on site, it also shows roughly where you were at the time.
			</p>
			<p>
				The app asks for location permission only if you turn on “Show my location”. It then reads your device’s
				location while the map is open, only to draw your position on it. Your location is never saved with an
				observation, uploaded, or kept after the map closes, and the app never reads it in the background. You
				can turn it off on the map or in your device’s settings at any time.
			</p>

			<h3>Observations about other people, including children</h3>
			<p>
				Studies often record what an observer sees people doing, and some studies observe children at play.{" "}
				{policy.appName} does not ask for the names, photos or other identifying details of the people you
				observe; it asks only for your own initials as the observer. Some study forms record general details
				such as a child’s age range and the kind of play. Please do not write names or other identifying details
				in free-text answers. Answers from study forms that are still being finalised stay on your device and
				are not uploaded. We will update this policy before any new kind of observation is uploaded.
			</p>

			<h2 id="on-your-device">What stays on your device</h2>
			<ul>
				<li>
					Every observation is saved on your device first, so you can keep working without a signal. If you
					are signed in and the study’s form is accepted for upload, it uploads when you are online and the
					app is open. Uploaded observations also stay on the device.
				</li>
				<li>
					Unfinished observations are saved as you answer, so they survive the app closing. They stay until
					you save or discard them.
				</li>
				<li>
					The app has no way to delete a saved record. Records stay on the device until you uninstall the app
					or, on Android, clear its storage in Settings.
				</li>
				<li>
					When you sign out with records or an unfinished observation still on the device, the app keeps your
					email address and how many there are, so its first screen can say they are waiting for you. It
					removes that note when you sign in again.
				</li>
				<li>
					Records are kept in the app’s private storage, labelled with your account ID and project. Other apps
					cannot read it, but the app does not add encryption of its own on top of your device’s, so use a
					screen lock.
				</li>
				<li>
					Your sign-in session, which includes your email address and account ID, is kept in secure storage.
					On Android it is encrypted with a key held in the Android Keystore and is not backed up. On iPhone
					and iPad it is kept in the iOS Keychain, which is included in encrypted device backups and is not
					removed when you delete the app.
				</li>
				<li>
					On Android, records are not included in cloud backups. On iPhone and iPad they are part of your
					device backups, like other app data.
				</li>
			</ul>

			<h2 id="how-we-use-it">How we use it</h2>
			<ul>
				<li>To sign you in and keep each account’s records separate on a shared device.</li>
				<li>To store your uploaded observations in the {policy.appName} database, filed under your project.</li>
				<li>
					So your project team can analyse the observations, for example on maps and in GIS tools such as
					QGIS.
				</li>
				<li>To keep the service secure and working.</li>
			</ul>
			<p>
				We do not use your data for advertising or profiling, and we do not sell it or share it for anyone
				else’s marketing.
			</p>

			<h2 id="who-can-see-it">Who can see it</h2>
			<ul>
				<li>
					<strong>Your research project team.</strong> The team can see the observations uploaded to its
					project, including your initials, the points you placed and your answers, using read-only GIS tools
					such as QGIS. The app does not show one member’s observations to other members, and other members
					and GIS analysts do not see your email address.
				</li>
				<li>
					<strong>The people who run {policy.appName}.</strong> Our administrators manage the database, so
					they can see all accounts and observations, including which account uploaded each observation.
				</li>
				<li>
					<strong>Our service providers.</strong> Supabase runs our sign-in service and hosts the database, on
					Amazon Web Services servers in the United States (US East, Northern Virginia). Our upload server is
					hosted by {policy.serverHost ?? <Missing>server host</Missing>}. Sign-in codes and invitations are
					emailed through {policy.emailProvider ?? <Missing>email delivery provider</Missing>}. They process
					the data on our behalf to provide those services.
				</li>
				<li>
					<strong>A connectivity check on iOS.</strong> While an account is on the device and the app is open,
					the iOS app checks whether the device is online by sending an empty request to a Google
					connectivity-check address, about once a minute and more often while offline. Google receives your
					IP address and standard technical details, such as the app and iOS version, but no account or
					observation data.
				</li>
				<li>
					<strong>When the law requires it.</strong> We may disclose data if we are legally required to, or to
					protect the safety of people or the service.
				</li>
			</ul>

			<h2 id="security">How we protect it</h2>
			<ul>
				<li>The app connects to our sign-in service and server only over encrypted connections (HTTPS).</li>
				<li>
					Every upload must carry a valid sign-in token, and the database accepts an upload only from an
					account that has joined that project as an observer or manager.
				</li>
				<li>Your password is never sent to our own server; it goes only to the sign-in provider.</li>
			</ul>
			<p>No system is perfectly secure, but we work to protect your data and fix problems quickly.</p>

			<h2 id="retention">How long we keep it</h2>
			<ul>
				<li>
					Records stay on your device until you uninstall the app. On iPhone and iPad, copies may remain in
					earlier device backups, and your sign-in may remain in the iOS Keychain unless you sign out first.
				</li>
				<li>
					Accounts and uploaded observations are kept{" "}
					{policy.retention ?? <Missing>retention period</Missing>}. You can delete your account at any time;
					we also delete it when you ask. Practice observations in the Training project are deleted{" "}
					{policy.trainingRetention ?? <Missing>Training retention period</Missing>}.
				</li>
				<li>
					Server request logs and our sign-in provider’s record of sign-ins are kept{" "}
					{policy.logRetention ?? <Missing>log retention period</Missing>}.
				</li>
				<li>
					Deleted data can remain in our provider’s backups for a limited time, until they are overwritten.
				</li>
			</ul>

			<h2 id="your-choices">Your choices and rights</h2>
			<ul>
				<li>
					Delete your account yourself: sign in on the website, open <Link href="/account">Account</Link> and
					choose <strong>Delete account</strong>. The app cannot delete accounts yet. Your profile and
					memberships are removed; observations already uploaded stay with their study, as{" "}
					<Link href="/privacy/delete-data#what-may-be-kept">described here</Link>.
				</li>
				<li>
					Sign out in <strong>Account and synchronisation</strong>. If you have been offline for a while, you
					may need a connection before the <strong>Sign out</strong> button appears. Signing out removes your
					sign-in from the device but deletes nothing you recorded.
				</li>
				<li>
					Uninstall the app to delete your records from the device. On iPhone and iPad, sign out first: iOS
					can keep your sign-in in the Keychain after the app is deleted.
				</li>
				<li>
					Ask us for a copy of your data, or to correct or delete it:{" "}
					<Link href="/privacy/delete-data">how to delete your account and data</Link>.
				</li>
			</ul>
			<p>
				Depending on where you live, you may have other rights over your personal data, such as the right to
				object or to complain to a data protection authority. Contact us to use them.
			</p>

			<h2 id="children">Children</h2>
			<p>
				{policy.appName} is a tool for adult researchers and is not directed at children. Accounts are for adult
				members of research teams. We do not knowingly collect personal information from children who use the
				app. If you think a child has an account, contact us and we will delete it.
			</p>

			<h2 id="changes">Changes to this policy</h2>
			<p>
				If we change what the app collects or how we use it, we will update this page and its effective date. We
				will tell project teams before a significant change takes effect.
			</p>

			<h2 id="contact">Contact us</h2>
			<ul>
				<li>
					<strong>Privacy questions and requests, including deletion:</strong> {policy.lead.name}, {operator},{" "}
					<Contact email={policy.contactEmail} />.
				</li>
				<li>
					<strong>Technical questions about the app:</strong> {policy.developer.name}, its developer,{" "}
					<a href={`mailto:${policy.developer.email}`}>{policy.developer.email}</a>.
				</li>
			</ul>
		</article>
	);
}
