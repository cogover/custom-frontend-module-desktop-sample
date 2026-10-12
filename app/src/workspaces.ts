// The Workspaces this module runs on (CONTRIBUTING.md "Data rules"): Object and field IDs differ from one Workspace
// to the other, so the page picks the set of its own host. Nothing here is a secret.

export interface WorkspaceIds {
  workspaceId: string;
  /** Object `task` and the fields the app addresses by ID. */
  task: string;
  /** `task._attachments`: pictures pasted into the description. */
  taskImages: string;
  taskDescription: string;
  taskStatus: string;
  /** Object `activity` (timeline of a task) and its fields addressed by ID. */
  activity: string;
  activityImages: string;
  activityContent: string;
  notes: { folder: string; note: string; tag: string; pin: string };
  /** Object `user_settings` (Cài đặt). */
  settings: string;
}

/**
 * Example Workspace with placeholder IDs. The local mock and the tests use this set, so keep it and add a set of
 * your own (objects/README.md lists what each ID is).
 */
export const ACME: WorkspaceIds = {
  workspaceId: 'WSDEMO0000001',
  task: 'OTDEMOTASK001',
  taskImages: 'OFDEMOTASKIMG',
  taskDescription: 'OFDEMOTASKDSC',
  taskStatus: 'OFDEMOTASKSTA',
  activity: 'OTDEMOACTIV01',
  activityImages: 'OFDEMOACTIMG1',
  activityContent: 'OFDEMOACTCONT',
  notes: { folder: 'OTDEMONOTECAT', note: 'OTDEMONOTECON', tag: 'OTDEMONOTETAG', pin: 'OTDEMONOTEPIN' },
  settings: 'OTDEMOSETTING',
};

/** A second example Workspace: the same build serves several Workspaces (CONTRACT.md §11). */
export const GLOBEX: WorkspaceIds = {
  workspaceId: 'WSDEMO0000002',
  task: 'OTDEMO2TASK01',
  taskImages: 'OFDEMO2TASIMG',
  taskDescription: 'OFDEMO2TASDSC',
  taskStatus: 'OFDEMO2TASSTA',
  activity: 'OTDEMO2ACTIV1',
  activityImages: 'OFDEMO2ACTIMG',
  activityContent: 'OFDEMO2ACTCON',
  notes: { folder: 'OTDEMO2NOTCAT', note: 'OTDEMO2NOTCON', tag: 'OTDEMO2NOTTAG', pin: 'OTDEMO2NOTPIN' },
  settings: 'OTDEMO2SETTIN',
};

const BY_HOST: Record<string, WorkspaceIds> = {
  'acme.cogover.example': ACME,
  'globex.cogover.example': GLOBEX,
};

/** The IDs of the Workspace serving the page (localhost and unknown hosts: the reference Workspace, like the mock). */
export const workspaceFor = (host: string): WorkspaceIds => BY_HOST[host.toLowerCase()] ?? ACME;

export const WS: WorkspaceIds = workspaceFor(typeof window === 'undefined' ? '' : window.location.hostname);
