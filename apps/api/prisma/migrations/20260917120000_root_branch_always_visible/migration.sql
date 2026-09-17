-- The main starter branch has no visibility property — only sub-branches do.
--
-- Hiding a branch removes it from everyone on the same layer and below, and cascades to
-- the whole subtree. Applied to the ROOT role — the branch an organization starts from,
-- the one every member arrives at — that means hiding the organization from its own
-- people, which is not a thing anyone should be able to do. The rest of the platform
-- already read it that way: the hidden-cascade skips the root (`parentId IS NOT NULL`
-- everywhere it is computed) and a Visibility request on the root is refused with "the
-- root role is always visible". Only Group configuration's checkbox and the PATCH route
-- behind it still let a root be flagged hidden — a half-applied flag that showed the
-- branch as "hidden" while its children stayed public.
--
-- The switch is gone now (policy action `set_visibility` refuses the root, the route
-- answers 409, the UI shows the rule instead of a checkbox). This clears the flag where
-- an owner managed to set it before.

UPDATE "RoleNode" SET "isPublic" = true WHERE "parentId" IS NULL AND "isPublic" = false;
