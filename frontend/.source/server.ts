// @ts-nocheck
import * as __fd_glob_32 from "../content/docs/reliability/worker-failures.mdx?collection=docs"
import * as __fd_glob_31 from "../content/docs/reliability/transient-failures.mdx?collection=docs"
import * as __fd_glob_30 from "../content/docs/reliability/safe-file-writes.mdx?collection=docs"
import * as __fd_glob_29 from "../content/docs/reliability/permanent-failures.mdx?collection=docs"
import * as __fd_glob_28 from "../content/docs/reliability/index.mdx?collection=docs"
import * as __fd_glob_27 from "../content/docs/reliability/idempotency.mdx?collection=docs"
import * as __fd_glob_26 from "../content/docs/reference/workers.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/reference/processing-states.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/reference/kafka-topics.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/reference/index.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/how-it-works/upload.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/how-it-works/processing-pipeline.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/how-it-works/index.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/how-it-works/adaptive-streaming.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/getting-started/local-development.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/getting-started/index.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/cancellation-recovery/resume-processing.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/cancellation-recovery/pipeline-reconciliation.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/cancellation-recovery/index.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/cancellation-recovery/cancellation.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/architecture/storage-delivery.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/architecture/realtime-progress.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/architecture/kafka-workers.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/architecture/index.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/architecture/database-state.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_6 } from "../content/docs/reference/meta.json?collection=docs"
import { default as __fd_glob_5 } from "../content/docs/reliability/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/how-it-works/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/cancellation-recovery/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/architecture/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "architecture/meta.json": __fd_glob_1, "cancellation-recovery/meta.json": __fd_glob_2, "getting-started/meta.json": __fd_glob_3, "how-it-works/meta.json": __fd_glob_4, "reliability/meta.json": __fd_glob_5, "reference/meta.json": __fd_glob_6, }, {"index.mdx": __fd_glob_7, "architecture/database-state.mdx": __fd_glob_8, "architecture/index.mdx": __fd_glob_9, "architecture/kafka-workers.mdx": __fd_glob_10, "architecture/realtime-progress.mdx": __fd_glob_11, "architecture/storage-delivery.mdx": __fd_glob_12, "cancellation-recovery/cancellation.mdx": __fd_glob_13, "cancellation-recovery/index.mdx": __fd_glob_14, "cancellation-recovery/pipeline-reconciliation.mdx": __fd_glob_15, "cancellation-recovery/resume-processing.mdx": __fd_glob_16, "getting-started/index.mdx": __fd_glob_17, "getting-started/local-development.mdx": __fd_glob_18, "how-it-works/adaptive-streaming.mdx": __fd_glob_19, "how-it-works/index.mdx": __fd_glob_20, "how-it-works/processing-pipeline.mdx": __fd_glob_21, "how-it-works/upload.mdx": __fd_glob_22, "reference/index.mdx": __fd_glob_23, "reference/kafka-topics.mdx": __fd_glob_24, "reference/processing-states.mdx": __fd_glob_25, "reference/workers.mdx": __fd_glob_26, "reliability/idempotency.mdx": __fd_glob_27, "reliability/index.mdx": __fd_glob_28, "reliability/permanent-failures.mdx": __fd_glob_29, "reliability/safe-file-writes.mdx": __fd_glob_30, "reliability/transient-failures.mdx": __fd_glob_31, "reliability/worker-failures.mdx": __fd_glob_32, });