/**
 * The offline field guide (MOB-27 step 5): what an observer needs in the field, readable with no
 * signal. Each section is plain sentences, kept short enough to read between observations. The words
 * follow the screens: "Place point here", "Saved on this device", "Held", "Needs attention".
 */
export type GuideSection = {
  readonly id: string;
  readonly title: string;
  /** Paragraphs, in order. */
  readonly body: readonly string[];
};

export const GUIDE: readonly GuideSection[] = [
  {
    id: "placing",
    title: "Placing a point",
    body: [
      "On the Place step a cross (×) sits in the middle of the map, with the pin floating above it. Move the map, not the pin: drag until the cross is exactly where the play is happening. The pin lifts while the map moves so the spot itself is never covered, and drops back when you let go.",
      "Tap anywhere on the map to bring that spot under the cross, then fine-tune by dragging. The arrow buttons under Fine-tune move the cross half a metre at a time if dragging is awkward.",
      "Nothing is placed until you press Place point here. Zoom in for a finer point: the line under the coordinates says how much ground one point of the screen covers.",
      "To move a point you have already placed, choose Adjust point while answering. Your answers stay.",
    ],
  },
  {
    id: "rounds",
    title: "The three rounds",
    body: [
      "Standard round: map play events in your zone. Each observation is a point you place, then answer.",
      "Reliability round: code the same zone at the same time as another observer, independently. Agree the zone and start time first. Your records are marked as a reliability round so the two codings can be compared.",
      "Inventory round: record the weather, wind, shade and the loose parts available, once for each zone. No points are placed; each record belongs to its whole zone. Choose a zone, answer, save, then move to the next zone. The map marks the zones done.",
      "First round of this observation period: switch it on in the session brief when you start a new period, so nothing is carried over from an earlier round.",
    ],
  },
  {
    id: "zones",
    title: "Zones",
    body: [
      "The session's zone is outlined and the rest of the site is dimmed, so it is easy to see where you are collecting.",
      "If the cross is outside your zone, the Place step says so and names the zone it is in. Switch zones there if the play really is in the other zone. On a map from DECA Mark, a point can only be placed in the zone it is recorded in.",
      "During an Inventory round, tap a zone on the map or choose it from the list to record it. A tap on the edge between two zones selects neither: choose one in the list.",
    ],
  },
  {
    id: "map-versions",
    title: "Map versions",
    body: [
      "Each site's map has a version: map v1, then v2 when a coordinator changes a boundary or a name. The version shows on the site, in the session brief, in the collect header and on every saved observation.",
      "A session keeps the map it started with, from Start collection until you leave the collect screen. A newer map never replaces it while you are collecting, and an unfinished observation keeps its own map even after a restart.",
      "When a newer map is published, the site says so. Download it when you have a connection: your next session uses it. Observations you already saved keep the map they were recorded on, and still upload.",
      "An older map stays on this device while an unfinished observation or a record that has not uploaded uses it. Remove says what still uses a map, and waits until nothing does.",
    ],
  },
  {
    id: "zone-edges",
    title: "Zone edges",
    body: [
      'Zones can share an edge. When the cross is exactly on one, the Place step says "On the edge of" both zones and asks which one the play belongs to. Your session\'s zone stays chosen unless you pick the other.',
      "Close to an edge, the Place step suggests zooming in to check. Zoom in until it is clear which side the play is on; the hint never changes your zone by itself.",
    ],
  },
  {
    id: "outside-zones",
    title: "Outside every zone",
    body: [
      'Some ground belongs to no zone: a gap between zones, a hole such as a sandpit left out, or beyond the site. The Place step says "Outside every zone", and the point cannot be placed there on a map from DECA Mark.',
      "Move the cross into a zone. Nothing you have answered is lost: while you move the point or change zone, the unfinished observation stays on this device.",
    ],
  },
  {
    id: "answering",
    title: "Answering questions",
    body: [
      "One question at a time. A single choice moves on by itself; several choices, text and numbers wait for Continue.",
      "You can skip a question for now. Review names every required answer that is still empty, and the record cannot be saved until they are answered.",
      "Changing an earlier answer can hide questions that no longer apply. Their answers are removed, and the screen says how many.",
    ],
  },
  {
    id: "saving",
    title: "Saving and uploading",
    body: [
      "Every tap is kept on this device as you go. If the app closes, the unfinished observation is offered back on the Projects screen.",
      "Save on this device stores the record locally first. It uploads by itself whenever the app is open and online. There is no upload button to remember.",
      "On device: stored here, not sent yet. Uploaded: the server has it. Held: the project has not published this form version yet, so the record waits safely here. Needs attention: the server turned it away; the record shows why.",
    ],
  },
  {
    id: "offline",
    title: "Working offline",
    body: [
      "Collecting works with no signal: the site's map and form are on this device.",
      "Joining a project, downloading a site and uploading records need a connection. Records simply wait until you have one.",
    ],
  },
  {
    id: "map",
    title: "Map controls",
    body: [
      "Plus and minus zoom; the target button frames your zone again; the expand button gives the map the whole screen.",
      "Layers switches between the Day plan, the Night plan and the aerial photo, turns the site's layers on and off, and shows all observations, only this session's, or none.",
      "The scale bar at the bottom left shows a real distance. North is always up.",
    ],
  },
  {
    id: "trouble",
    title: "If something goes wrong",
    body: [
      "Signing out keeps every unsent record on this device for the same account. Sign back in to upload them.",
      "If a screen fails to load, your draft and records are still on this device. Try again, or return to Projects.",
    ],
  },
];

/** Sections whose title or text contains every word typed, in guide order. */
export function searchGuide(
  query: string,
  sections: readonly GuideSection[] = GUIDE,
): readonly GuideSection[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== "");
  if (words.length === 0) return sections;
  return sections.filter((section) => {
    const text = `${section.title} ${section.body.join(" ")}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
