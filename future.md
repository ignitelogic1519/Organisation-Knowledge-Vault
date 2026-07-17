# Future Features Register

> Features explicitly deferred out of v1. Each entry notes what was decided so the v1 design
> keeps the door open without building it yet.

## 1. Granular capability-based permissions
v1 gives every role owner a **fixed capability bundle**. Later, each user made an owner of a
branch gets **individual capability switches**, provisioned separately per person, e.g.:
- can-upload-content
- can-assign-mandatory
- can-view-reports
- can-manage-members
- can-create-sub-roles (exists in v1 as the single delegation flag — will fold into this system)

Design note: v1 permission checks should go through one central policy function so swapping the
fixed bundle for per-capability checks later does not touch call sites.

## 2. Advanced completion tracking
v1 uses manual "mark as complete". Later:
- Video/audio: watch/listen percentage thresholds.
- Documents: open + explicit acknowledgment ("I have read and understood").
- Per-content-type completion rules configured by the uploader.

## 3. Org chart graph tab ("3D tree" view)
- Every user gets a graph tab showing their own position(s) with layers above and below.
- Nodes are **roles, not users** (keeps the graph small); clicking a role opens its people list
  with a search box.
- Must handle one profile occupying multiple positions at different heights.

## 4. Incident templates for restructuring
Managed workflows for deleting/restructuring branches (approvals, handover of orphaned subtrees,
audit trail), replacing the v1 rule of "top layer may delete/restructure the branch".

## 5. Content authoring suite
v1 is upload-only. Later:
- Template-based documentation authoring.
- AI conversion of uploaded documents into standardized documentation.
- Video / audio / audiobook upload pipelines (processing, previews).
- In-platform exam builder.

## 6. Additional storage adapters
v1 ships the storage adapter interface with **Google Drive** as the first backend. Later adapters
chosen per organization's capability: NAS, S3-compatible object storage, other clouds.

## 7. Mobile application
API-first backend (Render) is kept separate from the web frontend from day 1 specifically so a
mobile app can consume the same API.

## 8. Notification channel expansion
Beyond v1 channels: richer email digests, push notifications (mobile), escalation chains.
