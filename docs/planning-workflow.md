# Dispatcher planning workflow

The baseline is the four submitted planning screens in `exports/`: Clustering, Staging, Trip Assigning, and Load Assigning.

The overview groups orders by depot, district, and brand. It separates unresolved and resolved clusters and reports partial progress. Cluster display IDs are deterministic aliases derived from context, depot, district, and brand; database plan and order IDs remain the authoritative identifiers.

Inside a new cluster, Load Assigning stays collapsed until staging is confirmed. Dispatchers select orders to stage or defer. The deferral dialog lists the selected orders, offers predefined reasons and a custom explanation, and requires a later operating day. Protected outlets retain the separate explicit override gate before release.

`POST /planning/plans/:id/stage` accepts the current plan version, selected order IDs, and explicit deferrals. It saves incrementally under the existing plan transaction and optimistic lock. Previous allocations and unchanged deferral acknowledgments are preserved. Orders that cannot be allocated remain `UNASSIGNED` with a feasibility explanation; they are not silently deferred. No extra staging table is needed because persisted plan decisions already represent this workflow.

The allocator prioritizes protected outlets, chilled demand, elapsed service days, and closing windows. It tries existing trips and available vehicle/driver combinations through the server scheduler. Allocation is greedy and feasible, not a guarantee of global fleet optimality.

The seven hard rules remain: one brand/district per trip; chilled orders require reefers; van-only access requires vans; home depots must match; whole orders cannot be duplicated across trips; weight and volume must fit; and vehicle daily trip/time limits must hold. Availability, outlet/mall windows, driver chronology, and weekly fuel quotas are also checked.

Continue shows the cluster's loads. Release is available only after all clusters have decisions and protected deferrals are acknowledged. Release revalidates the plan and creates persisted loading manifests. Loaded/processing/assigned states come from those manifests; dispatch requires completed loading and a recorded inspection, with final readiness enforced by the departure endpoint. Current loader handling uses the depot pool and records the signer when loading completes.

Previously planned orders remain discoverable after release even when their status or eligibility date changes. Regression coverage verifies incremental staging, infeasible demand, release blocking, explicit deferral, and discovery of resolved orders.
