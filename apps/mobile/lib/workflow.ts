import type { Workflow } from "@magpie/shared/api";

/**
 * What each status means, in the words the app uses everywhere. The API values stay as they are (D24);
 * only the labels changed: "inbox" is "To sort" because it is the status of items you have not sorted yet.
 */
export const WORKFLOW_META: Record<Workflow, { label: string; hint: string }> = {
  inbox: { label: "To sort", hint: "Not sorted yet" },
  to_try: { label: "To try", hint: "Something you want to do or make" },
  reference: { label: "Keep", hint: "Just keep it to look up later" },
  done: { label: "Done", hint: "Tried it, finished with it" },
};

export const WORKFLOW_ORDER: readonly Workflow[] = ["inbox", "to_try", "reference", "done"];
