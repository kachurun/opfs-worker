import { expose } from 'comlink';

import { OPFSWorker } from './OPFSWorker';

/** Worker entry — bundled via `?worker&inline`, not a public package entry. */
expose(new OPFSWorker());
