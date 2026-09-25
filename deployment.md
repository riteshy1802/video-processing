# Video Processing Platform --- Deployment Architecture and Infrastructure

## 1. Purpose of This Document

This document explains how the **Video Processing Platform** is
deployed, why each deployment component exists, and how the components
work together.

The focus is specifically on the infrastructure and deployment layer:

-   building and publishing the backend image;
-   provisioning Amazon EKS;
-   running application workloads on Kubernetes;
-   persisting Kafka data with Amazon EBS;
-   exposing the FastAPI backend publicly;
-   scaling transcoding workers with KEDA and the Kubernetes Cluster
    Autoscaler;
-   retaining durable application data outside the disposable compute
    layer;
-   supporting both local and AWS-based deployments;
-   destroying runtime infrastructure when it is not needed.

The video-processing algorithms themselves are outside the scope of this
document except where they affect deployment decisions.

------------------------------------------------------------------------

## 2. Deployment Goals

The deployment was designed around a few practical requirements.

### 2.1 Reproducible infrastructure

The application should not depend on manually configured servers. The
deployment is represented through:

-   Docker images;
-   Kubernetes manifests;
-   an `eks-cluster.yaml` cluster configuration;
-   AWS deployment scripts;
-   Kubernetes add-on installation scripts.

This makes it possible to destroy the runtime infrastructure and
recreate it later.

### 2.2 Separation of stable services and compute-heavy workers

The platform contains two different workload types:

-   **core/system workloads** that should remain available, such as
    FastAPI, Kafka, Redis, the planner and finalizers;
-   **transcoding workers**, which are CPU-intensive and should scale
    according to workload.

For this reason, the EKS cluster uses separate **system** and
**compute** managed node groups.

### 2.3 Workload-driven scaling

The number of transcoding workers should depend on Kafka backlog rather
than remain permanently provisioned.

The deployment therefore uses two scaling layers:

-   **KEDA** scales Kubernetes worker pods according to Kafka consumer
    lag.
-   **Kubernetes Cluster Autoscaler** changes the number of compute
    nodes when Kubernetes needs more or fewer machines to run those
    pods.

### 2.4 Durable state outside disposable compute

EKS nodes and worker containers are treated as replaceable
infrastructure.

Durable data is kept separately:

-   video objects and generated HLS output → Amazon S3;
-   application state → Supabase PostgreSQL;
-   Kafka broker data → Amazon EBS while the EKS deployment exists.

Redis is intentionally used for ephemeral runtime information such as
progress and cancellation signaling.

------------------------------------------------------------------------

# 3. High-Level Deployment Model

The deployed system consists of several layers.

## 3.1 Frontend

The Next.js frontend is deployed separately on **Vercel**.

The production frontend communicates with the backend through the API
CloudFront distribution.

The frontend is therefore not hosted inside the EKS cluster.

## 3.2 API entry path

The public backend path is:

`Browser → CloudFront (API) → AWS Application Load Balancer → Kubernetes Ingress → FastAPI`

The API CloudFront distribution provides a stable public endpoint even
though the underlying ALB can change when the EKS environment is
destroyed and recreated.

After a new ALB is created, the deployment automation updates the
CloudFront API distribution origin to point to the new ALB hostname.

## 3.3 EKS cluster

Amazon EKS provides the Kubernetes environment in which the backend
services run.

The cluster name is:

`video-processing`

The deployment uses Kubernetes 1.34 in `ap-southeast-2`.

The cluster contains two managed node groups:

-   **system** --- `m7i.xlarge`, fixed at one node;
-   **compute** --- `c7i.2xlarge`, minimum `0`, maximum `3`.

The compute group exists specifically for transcoding workers.

## 3.4 External durable services

The Kubernetes cluster communicates with services outside EKS:

-   **Amazon S3** --- video uploads and processed HLS objects;
-   **Supabase PostgreSQL** --- application/database state;
-   **CloudFront** --- API routing and media delivery.

These resources are deliberately not tied to the lifecycle of an
individual EKS cluster.

------------------------------------------------------------------------

# 4. Containerization and Amazon ECR

## 4.1 Why Docker is used

The backend services share the same application code but execute
different processes.

A common Docker image provides a consistent runtime containing:

-   Python;
-   the application dependencies;
-   FFmpeg;
-   the backend source code.

The container does not hard-code one process through a Docker `CMD`.
Kubernetes or Docker Compose chooses the appropriate process for each
service.

This allows the same backend image to be reused for:

-   FastAPI;
-   planner;
-   transcode worker;
-   rendition finalizer;
-   video finalizer;
-   outbox publisher;
-   reconciler.

## 4.2 Backend image build

The backend Dockerfile uses `python:3.13-slim`.

During the image build:

1.  FFmpeg is installed.
2.  `uv` is installed.
3.  `pyproject.toml` and `uv.lock` are copied.
4.  dependencies are installed with `uv sync --frozen --no-dev`;
5.  the backend source code is copied into the image.

## 4.3 Amazon ECR

AWS deployments use an ECR repository named:

`video-processing-backend`

The deployment workflow builds the backend image locally, tags it for
ECR, authenticates Docker with ECR, and pushes the image.

The helper script responsible for this is:

`scripts/aws/aws-build-upload.sh`

EKS workloads can then run the published backend image instead of
depending on a locally available image.

------------------------------------------------------------------------

# 5. EKS Cluster Provisioning

## 5.1 Cluster configuration

The EKS cluster configuration is stored in:

`eks-cluster.yaml`

This file defines the cluster and its managed node groups.

Using configuration-as-code makes the infrastructure repeatable and
documents the intended cluster shape.

## 5.2 System node group

The system node group uses:

-   instance type: `m7i.xlarge`;
-   minimum: `1`;
-   desired: `1`;
-   maximum: `1`;
-   label: `workload=system`.

It provides stable capacity for the services that should remain
available while the cluster is running.

These workloads include the application's core services and
infrastructure components.

## 5.3 Compute node group

The compute node group uses:

-   instance type: `c7i.2xlarge`;
-   minimum: `0`;
-   maximum: `3`;
-   label: `workload=transcode`.

It exists for CPU-intensive transcoding workers.

Keeping the minimum at zero allows the compute capacity to disappear
when there is no worker demand.

## 5.4 Why separate node groups are useful

Without this separation, compute-heavy FFmpeg workloads would compete
directly with Kafka, FastAPI and other system services for the same node
resources.

The split provides two independently managed capacity classes:

-   stable infrastructure/application capacity;
-   elastic transcoding capacity.

------------------------------------------------------------------------

# 6. Kubernetes Workloads

The backend is decomposed into multiple independently running Kubernetes
workloads.

## 6.1 FastAPI

FastAPI exposes the backend HTTP API.

It handles operations such as:

-   creating and retrieving video records;
-   generating upload information;
-   querying processing state;
-   exposing realtime progress through SSE;
-   coordinating application-level requests with the database and
    processing pipeline.

## 6.2 Planner

The planner determines the processing work that must be created for a
video and publishes work into Kafka.

## 6.3 Transcode workers

Transcode workers consume transcoding jobs from Kafka and execute
FFmpeg.

Multiple worker replicas can run concurrently.

They are the primary horizontally scalable workload in the deployment.

## 6.4 Rendition finalizer

The rendition finalizer performs the finalization required after chunks
for an individual rendition have completed.

## 6.5 Video finalizer

The video finalizer performs the final video-level completion work after
the required renditions are ready.

## 6.6 Outbox publisher

The outbox component supports reliable transfer of events from durable
database state to Kafka.

This prevents the application from depending on an unsafe sequence in
which database state is committed but the corresponding Kafka event is
silently lost.

## 6.7 Reconciler

The reconciler examines durable state and repairs stale or incomplete
processing state where required.

It complements retries, leases and idempotent processing.

## 6.8 Redis

Redis is deployed inside Kubernetes and is intentionally ephemeral.

It is used for runtime information such as:

-   progress publication;
-   cancellation signaling.

Durable processing truth remains in PostgreSQL rather than Redis.

------------------------------------------------------------------------

# 7. Kafka Deployment on EKS

## 7.1 Why Kafka runs as a StatefulSet

Kafka is stateful.

Unlike a stateless API pod, the broker needs stable storage for its log
data.

The EKS deployment therefore runs Kafka as a **Kubernetes StatefulSet**
rather than as an ordinary stateless Deployment.

The current deployment uses a single Kafka broker.

## 7.2 Internal Kafka access

Kafka is exposed internally through Kubernetes networking.

Applications inside the cluster use:

`kafka.default.svc.cluster.local:9092`

This hostname is resolved by Kubernetes DNS.

Kafka is not exposed as a public internet service.

## 7.3 Kafka topics

The deployed processing pipeline uses the following main topics:

-   `planner.jobs`
-   `transcode.jobs`
-   `finalize.jobs`
-   `finalize.video.jobs`

Corresponding dead-letter topics are also created.

The primary consumer groups are:

-   `video-planners`
-   `video-transcoders`
-   `video-rendition-finalizers`
-   `video-finalizers`

## 7.4 Consumer implementation

The Python Kafka clients use `confluent-kafka`.

Consumers use the newer consumer group protocol and continue polling
Kafka while long-running processing work is active.

Partitions containing active work can be paused while the consumer
continues polling, reducing the risk that a long FFmpeg operation causes
unnecessary group disruption.

------------------------------------------------------------------------

# 8. Persistent Kafka Storage with Amazon EBS

## 8.1 Why Kafka needs persistent storage

Kafka messages should not disappear simply because the Kafka pod is
restarted or rescheduled.

The broker therefore stores its data on an EBS-backed Kubernetes volume.

## 8.2 StorageClass

A `gp3` Kubernetes StorageClass is used.

Important characteristics include:

-   provisioner: `ebs.csi.aws.com`;
-   volume type: gp3;
-   `WaitForFirstConsumer`;
-   volume expansion enabled.

## 8.3 PVC and PV flow

The storage relationship is:

`Kafka StatefulSet → PersistentVolumeClaim → PersistentVolume → Amazon EBS volume`

The Kafka volume is 5 GiB.

Kafka writes its broker data under its configured data directory on the
mounted persistent volume.

## 8.4 EBS CSI Driver

The **AWS EBS CSI Driver** allows Kubernetes to dynamically manage EBS
volumes.

It is responsible for operations such as:

-   provisioning the volume;
-   attaching it to the required node;
-   exposing it to the Kafka pod;
-   detaching/deleting it according to the storage lifecycle.

## 8.5 Pod Identity

The EBS CSI integration uses EKS Pod Identity rather than embedding AWS
credentials in the pod.

The deployment installs the EKS Pod Identity Agent and associates the
required Kubernetes service account with the AWS IAM role used by the
EBS CSI controller.

This gives the controller the AWS permissions required to manage EBS
resources.

## 8.6 Cleanup behavior

The StorageClass uses a `Delete` reclaim policy.

During testing, one Kafka EBS volume remained in the AWS `available`
state after the EKS cluster had been destroyed.

The destroy workflow was therefore hardened so that it can identify the
Kafka EBS volume before destroying Kubernetes and remove that exact
volume afterward if it survives cluster deletion.

The cleanup is deliberately targeted; the script does not delete
arbitrary available EBS volumes.

------------------------------------------------------------------------

# 9. Kafka Consumer Groups and Kubernetes Workers

Kafka and Kubernetes solve different parts of the scaling problem.

Kafka distributes records among consumers in a consumer group.

Kubernetes controls how many worker pods are running.

For transcoding:

-   topic: `transcode.jobs`;
-   consumer group: `video-transcoders`.

All transcode worker replicas belong to the same consumer group.

Kafka therefore distributes topic partitions among the active worker
consumers.

Adding worker pods can increase processing concurrency up to the
concurrency permitted by the topic partitions and available work.

------------------------------------------------------------------------

# 10. KEDA --- Pod-Level Autoscaling

## 10.1 Purpose

KEDA connects an external event source to Kubernetes autoscaling.

For this project, the event source is **Kafka consumer lag**.

## 10.2 What KEDA observes

KEDA monitors the backlog for the configured Kafka topic and consumer
group.

For the transcode worker, the relevant processing stream is
`transcode.jobs` with the `video-transcoders` consumer group.

## 10.3 What KEDA changes

KEDA changes the desired number of worker **pods**.

Conceptually:

`Kafka backlog increases → KEDA requests more worker pods`

and:

`Kafka backlog falls → KEDA reduces worker pods`

KEDA does not create EC2 instances itself.

That distinction is important.

------------------------------------------------------------------------

# 11. Kubernetes Cluster Autoscaler --- Node-Level Autoscaling

## 11.1 Why a second autoscaler is required

KEDA can request additional pods, but those pods still require CPU and
memory on a Kubernetes node.

If the existing compute nodes do not have sufficient capacity, newly
requested worker pods remain `Pending`.

The Cluster Autoscaler handles this infrastructure-level problem.

## 11.2 Scale-out sequence

The complete two-level scale-out process is:

1.  Transcoding jobs accumulate in Kafka.
2.  Kafka consumer lag increases.
3.  KEDA increases the transcode worker replica count.
4.  Kubernetes attempts to schedule the new worker pods.
5.  If there is insufficient node capacity, some pods remain `Pending`.
6.  Cluster Autoscaler detects that additional capacity is required.
7.  The EKS compute managed node group increases.
8.  AWS creates another `c7i.2xlarge` node.
9.  The node joins the EKS cluster.
10. Kubernetes schedules the pending worker pods.
11. The new workers begin consuming Kafka jobs.

This behavior was tested with a workload containing 48 transcoding jobs,
where worker demand caused additional compute capacity to be created.

## 11.3 Scale-down

When demand decreases:

-   KEDA reduces unnecessary worker pod replicas;
-   compute nodes can become underutilized;
-   Cluster Autoscaler can reduce the compute node group;
-   the compute group can return to zero nodes when it is no longer
    required.

## 11.4 Responsibility split

The two scaling systems should be understood separately:

**KEDA**

`Kafka demand → number of worker pods`

**Cluster Autoscaler**

`unschedulable pod demand → number of compute nodes`

Together they provide workload-driven application and infrastructure
scaling.

------------------------------------------------------------------------

# 12. AWS Load Balancer Controller and Ingress

## 12.1 Kubernetes Ingress

The FastAPI service needs an internet-facing entry point.

A Kubernetes Ingress resource describes how the API should be exposed.

## 12.2 AWS Load Balancer Controller

The AWS Load Balancer Controller watches the Kubernetes ingress
configuration and creates/manages the corresponding AWS Application Load
Balancer.

The resulting ALB is internet-facing and forwards traffic toward the
Kubernetes API service.

## 12.3 API request path

The production API request path is:

`Vercel frontend → API CloudFront → ALB → Kubernetes Ingress → FastAPI`

The ALB is a runtime resource and is deleted when the EKS deployment is
destroyed.

------------------------------------------------------------------------

# 13. CloudFront

Two project-specific CloudFront purposes are used.

## 13.1 API CloudFront distribution

The API distribution provides a stable public endpoint in front of the
runtime ALB.

The production frontend uses:

`https://d2zao1jnjo0hf8.cloudfront.net`

When the EKS environment is recreated, the new ALB hostname can differ.

The deployment workflow therefore updates the API CloudFront
distribution origin to the newly created ALB.

## 13.2 Media CloudFront distribution

A separate CloudFront distribution is used for processed media delivery.

Processed HLS files are stored in S3 and delivered through CloudFront to
the browser.

This keeps media delivery separate from the FastAPI request path.

------------------------------------------------------------------------

# 14. Amazon S3

The project bucket is:

`transcode-video-processing`

S3 is used for durable video-related objects, including:

-   original uploads;
-   processing/intermediate objects where applicable;
-   processed rendition output;
-   HLS playlists and segments.

The browser uses presigned upload URLs so large video uploads can go
directly to S3 instead of passing through the FastAPI server.

S3 is deliberately retained when EKS is destroyed.

------------------------------------------------------------------------

# 15. Supabase PostgreSQL

PostgreSQL stores the durable application state.

The database includes entities such as:

-   videos;
-   renditions;
-   chunks;
-   jobs;
-   metrics;
-   processing/event state.

The database is external to EKS.

Destroying the AWS runtime therefore does not delete the application's
PostgreSQL state.

This separation is important because Kubernetes compute is disposable
while processing metadata must survive infrastructure recreation.

------------------------------------------------------------------------

# 16. Networking Model

## 16.1 Region

The AWS deployment runs in:

`ap-southeast-2`

## 16.2 VPC and cluster networking

The EKS cluster is created through `eksctl`, which provisions the AWS
networking required by the cluster.

The cluster configuration disables the NAT Gateway.

The EKS cluster has public and private cluster endpoints enabled.

## 16.3 Kubernetes service discovery

Services inside the cluster communicate through Kubernetes networking
and DNS rather than public endpoints.

Examples include:

-   Kafka → `kafka.default.svc.cluster.local:9092`;
-   Redis → `redis:6379`.

This means internal infrastructure does not need to be exposed publicly
just so application pods can communicate.

## 16.4 Elastic IPs and NAT

The final deployment does not depend on a project NAT Gateway or
persistent project Elastic IP allocation.

These are therefore not part of the intended application architecture.

------------------------------------------------------------------------

# 17. IAM and EKS Pod Identity

AWS-managed operations require permissions, but application
infrastructure should not depend on credentials embedded into Kubernetes
manifests.

IAM roles/policies are retained and reused across cluster recreations.

Pod Identity is used where Kubernetes workloads/add-ons require AWS
permissions, including the EBS CSI integration and infrastructure
controllers configured during deployment.

IAM resources are treated differently from runtime compute:

-   they are configuration/permission resources;
-   they are retained across runtime destruction;
-   they can be reused when the EKS environment is recreated.

------------------------------------------------------------------------

# 18. Deployment Automation

AWS-related automation is organized under:

`scripts/aws/`

The deployment was intentionally broken into smaller scripts rather than
one opaque command.

## 18.1 `aws-build-upload.sh`

Responsibilities:

-   ensure the backend ECR repository exists;
-   authenticate Docker to ECR;
-   build the backend image;
-   tag the image;
-   push the image to ECR.

## 18.2 `aws-start.sh`

This is the orchestration script for recreating the AWS runtime.

Its responsibilities include:

-   creating the EKS cluster from `eks-cluster.yaml` when required;
-   updating the local kubeconfig;
-   installing required EKS/Kubernetes add-ons;
-   deploying Kafka and Redis;
-   applying application manifests;
-   installing KEDA;
-   installing/configuring Cluster Autoscaler;
-   installing/configuring AWS Load Balancer Controller;
-   creating the API ingress;
-   obtaining the ALB endpoint;
-   updating the API CloudFront origin.

The supporting installation logic is separated into scripts under
`scripts/aws/lib/`.

## 18.3 Supporting scripts

The deployment helpers include responsibilities for:

-   Kubernetes secret creation;
-   EBS CSI setup;
-   Kafka installation/topic creation;
-   KEDA installation;
-   Cluster Autoscaler installation;
-   AWS Load Balancer Controller installation;
-   API CloudFront origin update.

This keeps `aws-start.sh` focused on orchestration.

## 18.4 `check-running-instances.sh`

This script is a read-only infrastructure audit.

It checks relevant resources such as:

-   EKS;
-   EC2;
-   EBS;
-   load balancers;
-   NAT Gateways;
-   Elastic IPs;
-   ECR.

It also reports the retained project S3 and CloudFront resources.

The script is useful both before and after destruction because it
provides a final check of what is still running.

------------------------------------------------------------------------

# 19. Runtime Destruction

## 19.1 Why destruction is part of the deployment design

The AWS environment was created for development/demo workloads and
should not continuously consume compute resources when unused.

The project therefore treats destruction as a normal infrastructure
lifecycle operation rather than an emergency cleanup step.

## 19.2 `aws-destroy.sh`

The destroy script removes the runtime infrastructure associated with
the project.

Its responsibilities include:

-   deleting the API Ingress so the ALB can be cleaned up;
-   deleting the EKS cluster;
-   deleting managed node groups and their EC2 instances through cluster
    teardown;
-   removing Kubernetes workloads;
-   handling the Kafka EBS volume cleanup;
-   deleting the backend ECR repository/images;
-   running the resource audit afterward.

## 19.3 Resources intentionally destroyed

Runtime resources include:

-   EKS cluster;
-   system node group;
-   compute node group;
-   EC2 worker nodes;
-   Kubernetes workloads;
-   API ALB;
-   Kafka EBS runtime storage;
-   backend ECR repository/images.

## 19.4 Resources intentionally retained

The following remain:

-   S3 project bucket;
-   project CloudFront distributions;
-   IAM roles/policies;
-   AWS Budget;
-   Supabase PostgreSQL;
-   Vercel frontend.

This allows the expensive/runtime portion of the AWS deployment to
disappear while durable application data and reusable configuration
remain.

------------------------------------------------------------------------

# 20. Local Development vs AWS Deployment

The same application code supports local development and AWS deployment
without requiring separate code branches.

## 20.1 Local configuration

The local backend configuration uses:

-   Kafka → `localhost:9092`;
-   Redis → `redis://localhost:6380/0`;
-   frontend origin → `http://localhost:3000`.

The local frontend points to:

`http://localhost:7500`

## 20.2 Docker Compose

When the backend runs through Docker Compose, container networking
overrides the host addresses.

The Docker services use:

-   Kafka → `kafka:29092`;
-   Redis → `redis://redis:6379/0`.

This allows containers to communicate using Docker's internal service
names.

## 20.3 Kubernetes configuration

Inside Kubernetes, the application uses Kubernetes service discovery
instead:

-   Kafka → `kafka.default.svc.cluster.local:9092`;
-   Redis → `redis://redis:6379/0`.

The environment-specific addresses are supplied by deployment
configuration rather than hard-coded into application logic.

## 20.4 Minikube

Minikube provides a local Kubernetes environment for testing Kubernetes
manifests and behavior without using AWS.

`kubectl` communicates with whichever Kubernetes context is currently
selected.

For local Kubernetes:

``` bash
kubectl config use-context minikube
```

For EKS, `aws eks update-kubeconfig` adds/selects the EKS context.

The important distinction is that `kubectl` itself is not inherently
local or AWS-specific; the selected kubeconfig context determines which
cluster receives the command.

------------------------------------------------------------------------

# 21. Configuration Strategy

A key deployment principle is that application code should not need to
be rewritten when the execution environment changes.

The code reads settings such as:

-   Kafka bootstrap servers;
-   Redis URL;
-   database URL;
-   AWS configuration;
-   frontend origin;
-   processing configuration.

Each deployment environment supplies the appropriate values.

Therefore:

-   host execution can use localhost;
-   Docker Compose can use Docker service names;
-   Kubernetes can use Kubernetes DNS names.

This avoids a fragile workflow in which AWS-specific code changes must
be stashed before running locally.

------------------------------------------------------------------------

# 22. Reliability Considerations in the Deployment

The infrastructure is designed around the assumption that containers and
nodes can fail.

Important mechanisms include:

-   Kafka consumer redelivery;
-   bounded retries and dead-letter topics;
-   durable PostgreSQL processing state;
-   worker leases;
-   idempotent processing/recovery;
-   transactional outbox;
-   reconciler;
-   graceful worker shutdown;
-   durable cancellation state with Redis used as a fast signal.

This is important in Kubernetes because pods may restart, move between
nodes, or disappear during scaling.

The deployment therefore does not treat the lifetime of an individual
worker container as the lifetime of a processing job.

------------------------------------------------------------------------

# 23. What Is Persistent and What Is Disposable?

A useful way to understand the architecture is to classify resources by
lifecycle.

## Persistent application resources

### Amazon S3

Stores the actual video/media objects.

### Supabase PostgreSQL

Stores durable application and processing state.

### CloudFront

Provides stable API/media distribution endpoints and is reused across
AWS runtime recreations.

### IAM roles and policies

Provide reusable AWS authorization configuration.

## Runtime/recreatable resources

### EKS

Recreated from configuration.

### EC2 nodes

Created through EKS managed node groups.

### Kubernetes pods

Created from manifests and controllers.

### Redis

Ephemeral runtime coordination.

### Kafka runtime

Recreated through Kubernetes manifests and installation automation.

### Kafka EBS storage

Persists broker data while the runtime deployment exists but is removed
as part of full runtime destruction.

### ALB

Created from Kubernetes Ingress and removed during runtime destruction.

### ECR backend repository

Recreated and repopulated from the local Docker build when required.

------------------------------------------------------------------------

# 24. End-to-End Deployment Sequence

A complete deployment can be understood as the following sequence:

1.  Backend source code is prepared locally.
2.  Docker builds the backend runtime image.
3.  The image is pushed to Amazon ECR.
4.  `eksctl` creates the EKS cluster and managed node groups from
    `eks-cluster.yaml`.
5.  Required AWS/Kubernetes add-ons are installed.
6.  EBS CSI integration is configured.
7.  Kafka is deployed as a StatefulSet with EBS-backed persistent
    storage.
8.  Kafka topics are created.
9.  Redis is deployed.
10. Application workloads are deployed.
11. KEDA is installed/configured for Kafka-based pod scaling.
12. Cluster Autoscaler is configured for compute-node scaling.
13. AWS Load Balancer Controller is installed.
14. Kubernetes Ingress creates the public ALB.
15. The ALB hostname is obtained.
16. The API CloudFront distribution is updated to use that ALB as its
    origin.
17. The Vercel frontend communicates with the stable CloudFront API
    endpoint.
18. Transcoding workloads can scale worker pods and compute nodes
    according to Kafka demand.
19. When the AWS runtime is no longer required, `aws-destroy.sh` removes
    the disposable runtime infrastructure.
20. The resource-check script verifies that expensive runtime resources
    are gone while the intentionally retained resources remain.

------------------------------------------------------------------------

# 25. Key Deployment Takeaways

The deployment demonstrates several infrastructure concepts working
together:

-   **Docker** packages one consistent backend runtime.
-   **ECR** stores the deployable AWS image.
-   **EKS** orchestrates the backend services.
-   **Managed node groups** separate stable system workloads from
    elastic transcoding compute.
-   **Kafka StatefulSet + EBS** provides persistent broker storage while
    the runtime exists.
-   **KEDA** converts Kafka consumer lag into worker pod scaling.
-   **Cluster Autoscaler** converts unschedulable pod demand into EC2
    node scaling.
-   **AWS Load Balancer Controller + Ingress** exposes FastAPI through
    an ALB.
-   **CloudFront** provides stable API routing and media delivery.
-   **S3** stores durable video/HLS objects.
-   **Supabase PostgreSQL** stores durable application state.
-   **Redis** handles ephemeral progress and cancellation communication.
-   **Pod Identity/IAM** gives infrastructure components AWS permissions
    without treating application containers as manually configured
    servers.
-   **Deployment scripts** make build, provisioning, configuration and
    destruction repeatable.
-   **Local/Docker/Minikube and AWS deployments** use the same
    application code with environment-specific configuration.
-   **Runtime destruction** is an intentional part of the architecture,
    allowing compute resources to be removed without deleting the
    project's durable application data.

The overall design treats infrastructure as reproducible and compute as
disposable, while keeping the data required to resume the application
outside the lifecycle of individual pods, nodes, and EKS clusters.
