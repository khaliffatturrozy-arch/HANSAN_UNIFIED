# HANSAN UNIFIED
## Product Requirements Document (PRD)

**Document Version:** 1.0  
**Document Status:** FINAL PRODUCT BASELINE  
**Product Category:** F&B Management & POS SaaS Platform  
**Consolidation Sources:** HANSAN V1, HANSAN V2, HANSAN V3  
**Development Workflow:** Cline + OpenCode  
**Product Strategy:** Hybrid Consolidation  
**Release Strategy:** Complete Integrated Platform  
**Implementation Status:** Not Started

---

# 1. PRODUCT OVERVIEW

## 1.1 Product Vision

HANSAN Unified is an integrated Food & Beverage business operating platform designed to manage the complete lifecycle of restaurant and cafe operations.

The platform combines point-of-sale transactions, business management, kitchen operations, inventory, procurement, finance, workforce management, customer engagement, reservations, and online ordering within one connected ecosystem.

HANSAN must support businesses ranging from independent cafes and small restaurants to enterprise-level multi-outlet operations.

The product must be commercially viable, customizable, secure, reliable, and capable of operating under different infrastructure requirements.

## 1.2 Product Mission

Build a reliable and scalable F&B operating platform that enables business owners to manage their entire operation through one integrated system.

## 1.3 Product Positioning

An integrated, offline-capable, multi-tenant, multi-outlet F&B operating platform with cloud and self-hosted deployment options.

HANSAN is not merely a cashier application. It is a complete business operations platform.

## 1.4 Core Product Principles

1. Business-first architecture.
2. Offline-capable transaction operations.
3. Cloud and self-hosted deployment compatibility.
4. Multi-tenant and multi-outlet support.
5. Strong data isolation and transaction integrity.
6. Modular application architecture.
7. Consistent cross-application design system.
8. Integrated business workflows.
9. Verifiable functionality rather than UI-only completion.
10. Commercial customization and extensibility.

---

# 2. PRODUCT DECISIONS — LOCKED

The following decisions are approved and constitute mandatory product requirements.

| Decision | Approved Requirement |
|---|---|
| Target Market | Both SMB and Enterprise |
| Offline POS | Offline-capable |
| Deployment | Cloud SaaS and Self-hosted |
| First Release | All defined product modules |
| Website | Integrated into HANSAN ecosystem |
| Consolidation | Hybrid V1, V2, V3 |
| Development Workflow | Cline and OpenCode |
| Audit Strategy | Audit before implementation consolidation |

These decisions must not be silently changed by development agents.

Any proposed change must be documented as an Architecture Decision Record (ADR) or Product Change Request and approved by the product owner.

---

# 3. TARGET MARKET

## 3.1 Primary Market

### Small and Medium F&B Businesses
- Independent cafes.
- Coffee shops.
- Restaurants.
- Bakeries.
- Food stalls and food businesses.
- Small restaurant chains.

Requirements:
- Affordable implementation.
- Easy onboarding.
- Simple cashier workflows.
- Basic business reporting.
- Inventory and ingredient tracking.
- Reliable offline transactions.
- Minimal operational complexity.

### Enterprise and Multi-outlet Businesses
- Restaurant groups.
- Multi-brand F&B companies.
- Franchise operators.
- Centralized restaurant organizations.
- Large cafe chains.

Requirements:
- Multi-organization management.
- Multi-outlet control.
- Centralized menus.
- Advanced permission management.
- Consolidated financial reporting.
- Cross-outlet analytics.
- Audit trails.
- Configurable workflows.
- Centralized policy management.

## 3.2 Product Scalability

The system must support progressive business growth without requiring customers to migrate to an entirely different product.

A single-outlet business must be able to expand into a multi-outlet organization using the same platform.

---

# 4. USER TYPES AND ACCESS CONTROL

## 4.1 Platform-Level Users

- Platform Administrator.
- Platform Developer.
- Platform Support Operator.

## 4.2 Organization-Level Users

- Business Owner.
- Organization Administrator.
- Finance Administrator.
- Custom Organization Roles.

## 4.3 Outlet-Level Users

- Outlet Manager.
- Cashier.
- Kitchen Staff.
- Bar Staff.
- Inventory Staff.
- HR / Supervisor.
- Custom Outlet Roles.

## 4.4 Customer Users

- Website Visitor.
- Registered Customer.
- Loyalty Member.
- Online Ordering Customer.

## 4.5 RBAC Requirements

The system must implement server-enforced Role-Based Access Control.

Requirements:

1. Role definitions must be configurable.
2. Permissions must be independently assignable.
3. Organization and outlet scopes must be enforced.
4. UI visibility must reflect authorization.
5. API authorization must not rely on frontend checks.
6. Sensitive operations require appropriate permissions.
7. Permission changes must be auditable.
8. Users must not access resources belonging to another tenant.
9. Platform-level access must be isolated from customer organization access.
10. Development preview roles must never be treated as production authentication.

---

# 5. APPLICATION ECOSYSTEM

HANSAN Unified consists of four primary applications supported by a shared platform.

## 5.1 HEADQUARTERS (HQ)

Central business management application.

Responsibilities:
- Organization management.
- Outlet management.
- User management.
- Role and permission management.
- Business analytics.
- Menu management.
- Inventory overview.
- Finance overview.
- Subscription management.
- Platform configuration.

## 5.2 POS

Point-of-sale application for daily outlet transactions.

Responsibilities:
- Menu browsing.
- Order creation.
- Table management.
- Checkout.
- Payments.
- Discounts.
- Receipts.
- Shift management.
- Offline transaction operations.
- Transaction synchronization.

## 5.3 STAFF

Operational application for employees.

Responsibilities:
- Kitchen Display System.
- Bar Display System.
- Employee workspace.
- Attendance.
- Shift information.
- Operational notifications.
- Order preparation workflows.

## 5.4 WEBSITE

Public customer-facing application.

Responsibilities:
- Business landing pages.
- Digital menus.
- Online ordering.
- QR table ordering.
- Reservations.
- Promotions.
- Customer accounts.
- Loyalty experiences.
- Order tracking.

## 5.5 SHARED PLATFORM

Shared packages and services must provide:

- Authentication.
- Authorization.
- Database access.
- Business logic.
- API contracts.
- Event contracts.
- Design tokens.
- Shared UI components.
- Logging.
- Audit infrastructure.
- Synchronization mechanisms.
- Integration adapters.

The application boundaries must not create duplicated business logic.

---

# 6. FUNCTIONAL REQUIREMENTS

Priority definitions:

- P0: Mandatory for the complete first release.
- P1: Required functionality within the first release.
- P2: Advanced capability included in the first-release product scope where applicable, with implementation acceptance criteria defined before release.

All modules in this section are part of the first-release product scope. Priority describes implementation sequencing, not permission to silently remove modules from the release.

## 6.1 HEADQUARTERS

### Organization Management
- Create and configure organizations.
- Organization profile management.
- Business settings.
- Organization status.
- Organization-level configuration.
- Tenant provisioning.

### Outlet Management
- Create and configure outlets.
- Outlet-specific business settings.
- Outlet operational status.
- Outlet-specific menus and pricing.
- Outlet assignment and access control.
- Outlet performance reporting.

### User Management
- Create and manage users.
- Invite users.
- Assign users to organizations and outlets.
- Assign roles and permissions.
- Suspend and deactivate users.
- Maintain access history.

### Centralized Management
- Consolidated sales dashboard.
- Outlet comparison.
- Menu management.
- Inventory overview.
- Financial overview.
- Employee overview.
- Audit log.
- Subscription and entitlement management.

Acceptance criteria:
- Organization and outlet boundaries are enforced.
- Owner access is limited to authorized organizations.
- Changes are traceable.
- Centralized changes respect outlet-specific configuration rules.

## 6.2 POINT OF SALE

### Menu and Catalog
- Categories.
- Products.
- Variants.
- Modifiers.
- Add-ons.
- Product availability.
- Outlet-specific pricing.
- Product images and descriptions.

### Order Management
- Dine-in.
- Takeaway.
- Delivery workflow.
- Table assignment.
- Order notes.
- Item modifiers.
- Order splitting.
- Order merging where supported.
- Order cancellation.
- Order history.

### Checkout and Payment
- Cash.
- QRIS.
- EDC workflow.
- Other supported payment methods.
- Split payment.
- Partial payment.
- Discounts.
- Tax.
- Service charges.
- Refund.
- Void.
- Receipt generation.

### Cashier Operations
- Cashier sessions.
- Cash drawer opening and closing.
- Shift handover.
- Cash reconciliation.
- Cashier performance reports.

### POS Acceptance Criteria
1. A cashier can create and complete an order.
2. Order and payment state are independently traceable.
3. Payment retries cannot create duplicate successful payments.
4. Refund and void operations require authorization.
5. Transactions remain available during supported offline conditions.
6. Offline transactions synchronize safely after connectivity returns.
7. Receipts can be generated through supported printer integrations.
8. Transactions retain their original business and outlet context.

## 6.3 OFFLINE POS AND SYNCHRONIZATION

Offline-capable POS is a mandatory architectural requirement.

The system must not assume permanent internet connectivity.

### Offline Capabilities

The POS must support a defined offline operational profile, including:

- Access to previously synchronized menus.
- Access to authorized outlet configuration.
- Order creation.
- Local transaction persistence.
- Cash payments.
- Receipt generation using locally available printer connectivity.
- Local order state management.
- Synchronization after connectivity restoration.

Other payment methods, such as QRIS and EDC, must explicitly report whether they are available in the current connectivity state. The system must never falsely mark an unconfirmed external payment as successful.

### Local Persistence

- Transactions must be stored durably on the device.
- Local transaction identifiers must be globally unique.
- Sync operations must be idempotent.
- Pending transactions must survive application restarts.
- Failed synchronization must be retryable.
- Local and server transaction states must be distinguishable.

### Synchronization

The synchronization engine must support:

- Outbound transaction synchronization.
- Inbound catalog and configuration updates.
- Retry and backoff.
- Idempotency keys.
- Conflict detection.
- Conflict resolution policies.
- Synchronization status monitoring.
- Failed synchronization recovery.
- Audit records.

### Conflict Resolution

Conflict policies must be defined by data type.

Examples:
- Completed financial transactions must not be silently overwritten.
- Historical transaction details must remain immutable except through authorized correction records.
- Menu configuration conflicts must follow a documented versioning policy.
- Inventory updates must preserve stock movement history.
- Duplicate submissions must not create duplicate business operations.

### Offline Acceptance Criteria

1. A POS device can complete supported transactions without internet.
2. Pending transactions remain available after restart.
3. Synchronization resumes after network restoration.
4. Repeated synchronization does not duplicate transactions.
5. Conflicts are detectable and traceable.
6. Unsupported offline payment operations are clearly blocked or marked pending.
7. Offline status is visible to authorized operators.
8. A device cannot silently discard unsynchronized transactions.

The exact local storage technology, synchronization protocol, and supported offline duration must be defined in the technical architecture and validated through failure testing.

## 6.4 KITCHEN DISPLAY SYSTEM

### Kitchen and Bar Stations
- Station configuration.
- Station-specific order routing.
- Kitchen queue.
- Bar queue.
- Order acceptance.
- Preparation workflow.
- Ready status.
- Completion status.
- Order recall.
- Preparation timers.
- Priority handling.
- Order notes and modifiers.

### KDS Acceptance Criteria
- Kitchen and bar receive only eligible orders.
- Station isolation is enforced.
- Order updates are reliable.
- Duplicate events do not create duplicate preparation tasks.
- Reconnection restores the current operational state.
- Order status transitions are validated server-side.

## 6.5 INVENTORY AND PROCUREMENT

### Ingredient Inventory
- Raw material catalog.
- Units of measurement.
- Unit conversions.
- Recipes.
- Bill of Materials.
- Ingredient consumption.
- Stock movements.
- Stock adjustment.
- Stock opname.
- Waste tracking.
- Expiry management.
- Minimum stock alerts.

### Procurement
- Supplier management.
- Purchase requisitions.
- Purchase orders.
- Goods receiving.
- Supplier pricing.
- Purchase history.

### Cost Management
- Ingredient cost.
- Recipe cost.
- Product cost.
- Cost history.
- Cost variance.
- Estimated production capacity.

### Acceptance Criteria
- Every stock movement is traceable.
- Recipe consumption is transactionally consistent.
- Unit conversion is validated.
- Historical transactions retain the correct recipe and cost context.
- Stock corrections require authorization.
- Purchase receiving updates stock through an auditable operation.

## 6.6 RESERVATION MANAGEMENT

- Reservation creation.
- Guest information.
- Table allocation.
- Availability checking.
- Reservation calendar.
- Confirmation.
- Cancellation.
- Check-in.
- Completion.
- No-show tracking.
- Reservation history.
- Website reservation integration.

Acceptance criteria:
- Conflicting reservations are prevented according to table and time rules.
- Reservation status transitions are validated.
- Reservation history is preserved.
- Reservations are tenant- and outlet-scoped.
- Website and staff operations use the same business rules.

## 6.7 FINANCE MANAGEMENT

- Sales summary.
- Payment reconciliation.
- Cash flow.
- Expenses.
- Cashier shift reports.
- Outlet financial reports.
- Tax reporting.
- Service charge reporting.
- Refund reporting.
- Void reporting.
- Financial exports.
- Multi-outlet consolidation.

Acceptance criteria:
- Gross sales, net sales, payments, tax, service charges, refunds, and expenses are separately represented.
- Financial totals can be reconciled with source transactions.
- Corrections are auditable.
- Cross-outlet reporting respects organization authorization.

## 6.8 STAFF AND HR

- Employee profiles.
- Employee assignments.
- Attendance.
- Shift scheduling.
- Leave management.
- Attendance corrections.
- Employee history.
- Payroll exports.
- Staff performance reports.
- Biometric attendance option.
- Barcode fallback.

Attendance requirements:
- Configurable attendance rules.
- Initial 30-minute grace-period requirement.
- Attendance audit trail.
- Authorized corrections.
- Device and identity verification policies.

Biometric attendance requires separate privacy, consent, security, and retention requirements before production activation.

## 6.9 CRM AND LOYALTY

- Customer profiles.
- Customer purchase history.
- Loyalty points.
- Voucher management.
- Promotions.
- Customer segmentation.
- Leaderboards.
- Reward redemption.
- Customer communication preferences.

Acceptance criteria:
- Points are awarded according to configurable rules.
- Refunds and cancellations correctly affect loyalty balances.
- Voucher limits and validity are enforced.
- Customer information is protected by tenant-level access controls.

## 6.10 WEBSITE AND ONLINE ORDERING

The website is an integrated HANSAN module, not a disconnected external product.

Requirements:
- Public business website.
- Business branding.
- Digital menu.
- Outlet-specific menu.
- QR table ordering.
- Online ordering.
- Reservation.
- Customer account.
- Order tracking.
- Promotions.
- Loyalty integration.
- Configurable business information.

The website must use shared product, availability, pricing, reservation, and ordering rules.

Acceptance criteria:
- Website orders enter the same order lifecycle as POS orders.
- Website availability reflects outlet configuration.
- Customers receive clear order status.
- Customer data remains isolated.
- Website functionality is responsive across supported devices.

## 6.11 PAYMENT AND HARDWARE INTEGRATION

Payment integrations:
- Cash.
- QRIS.
- EDC.
- Additional payment providers through integration adapters.

Hardware integrations:
- Thermal printers.
- Barcode scanners.
- Customer displays.
- Supported cash drawers.
- Other approved peripheral devices.

Integration requirements:
- Provider-specific logic must be isolated behind adapters.
- Payment state must be independently verified.
- Hardware compatibility must be tested against actual devices.
- Printer errors must be recoverable and observable.
- Payment and hardware failures must not corrupt transaction records.

---

# 7. DEPLOYMENT STRATEGY

HANSAN must support two deployment models.

## 7.1 Cloud SaaS

The default managed deployment model.

Requirements:
- Centralized platform management.
- Managed application services.
- Managed database operations.
- Tenant provisioning.
- Subscription and entitlement management.
- Centralized monitoring.
- Backup and disaster recovery.
- Secure upgrades.

## 7.2 Self-hosted

Customers must be able to deploy HANSAN in infrastructure they control.

Requirements:
- Documented deployment process.
- Environment-based configuration.
- Database migration management.
- Backup and restore procedures.
- Secure secret management.
- Upgrade and rollback strategy.
- Health checks.
- Monitoring integration.
- License and entitlement validation.
- Deployment compatibility documentation.

## 7.3 Deployment Parity

Both deployment models must share the same product functionality and business rules.

Differences may exist in:
- Infrastructure configuration.
- Operational responsibility.
- Backup ownership.
- Monitoring providers.
- Scaling mechanisms.
- Support and licensing.

A feature must not be considered complete if it only works in one deployment model when it is part of the shared product scope.

---

# 8. TECHNICAL ARCHITECTURE REQUIREMENTS

The final technology stack is not locked by this PRD.

The technical architecture must satisfy the following requirements.

## 8.1 Architecture Style

Recommended initial direction:
- Modular monolith.
- Clearly separated domain modules.
- Shared contracts.
- Explicit service boundaries.
- Independent deployment configuration.
- Integration adapters.
- Event-driven internal workflows where justified.

Microservices are not mandatory. Service decomposition must be justified by measurable operational or scaling requirements.

## 8.2 Database

Requirements:
- Relational data model.
- Referential integrity.
- Transactional operations.
- Migration management.
- Tenant isolation.
- Outlet isolation.
- Auditability.
- Backup and recovery.
- Deployment compatibility.

PostgreSQL is the preferred candidate for evaluation.

## 8.3 Authentication and Authorization

Requirements:
- Secure authentication.
- Session lifecycle management.
- Server-side authorization.
- Role and permission management.
- Organization and outlet scopes.
- Account recovery.
- Session revocation.
- Audit logging.
- Secure secrets.

Authentication provider selection remains an architecture decision.

## 8.4 API and Contracts

Requirements:
- Consistent request and response contracts.
- Input validation.
- Authorization enforcement.
- Versioning strategy.
- Idempotency for critical operations.
- Error classification.
- Documentation.
- Integration test coverage.

## 8.5 Realtime and Event Processing

Requirements:
- Reliable order updates.
- KDS event delivery.
- Synchronization events.
- Transactional event publication.
- Duplicate event protection.
- Reconnection recovery.
- Event observability.

A transactional outbox is a candidate architecture for critical events.

## 8.6 Security

Mandatory controls:
- Tenant isolation.
- Authorization on every protected operation.
- Input validation.
- Secure session handling.
- Rate limiting where appropriate.
- Secret management.
- Audit logs.
- Secure HTTP configuration.
- Backup protection.
- Dependency security review.
- Security testing.

---

# 9. DESIGN SYSTEM AND UX REQUIREMENTS

## 9.1 Design Direction

HANSAN uses a flat-first operational interface informed by the previously selected ORBIT direction.

Requirements:
- No decorative gradients as a primary visual language.
- No global neumorphism.
- Consistent spacing and typography.
- Responsive desktop, tablet, and mobile composition.
- Clear visual hierarchy.
- Operationally efficient interactions.
- Accessible controls.
- Consistent loading, empty, error, and success states.

## 9.2 Brand Tokens

Primary palette:
- Orange: #FF7A00
- Blue: #0029FF
- Cream: #FFF5D5

Additional design references:
- Glacial Indifference, self-hosted.
- 2px ink borders.
- 14px radius reference.
- Pill treatment reserved for badges and steps.
- Raised shadows reserved for dialogs, drawers, login panels, and POS cart.
- PageHeader and Breadcrumb navigation patterns.
- Hard-offset press-collapse for selected interactions.

All tokens must be centrally managed and consumed consistently across applications.

## 9.3 UX Acceptance Criteria

A feature is not UI-complete unless:
- Primary workflows are implemented.
- Interactive elements have real actions.
- Responsive behavior is verified.
- Loading and failure states are present.
- Accessibility is considered.
- Permissions affect visible actions.
- Design tokens are respected.
- Demo data is clearly identified.
- Production views do not present fabricated business data.

---

# 10. NON-FUNCTIONAL REQUIREMENTS

Initial targets for architecture and verification:

| Category | Target |
|---|---|
| Availability | 99.9% cloud service target |
| API latency | p95 < 500 ms for ordinary operational endpoints |
| Transaction integrity | No duplicate operations caused by retries |
| Tenant isolation | No unauthorized cross-tenant access |
| Offline operation | Supported POS transactions survive connectivity loss |
| Recovery | Tested backup and restore |
| Observability | Critical errors and events traceable |
| Accessibility | Keyboard and accessible interaction support |
| Scalability | Multi-outlet and concurrent cashier support |
| Deployment | Cloud and self-hosted compatibility |

These are target requirements, not claims of achieved performance.

Performance and capacity targets must be validated through load testing and adjusted using measured evidence.

---

# 11. COMMERCIAL REQUIREMENTS

HANSAN must support:

## 11.1 SaaS Subscription
- Configurable plans.
- Subscription lifecycle.
- Trial management.
- Feature entitlements.
- Outlet limits.
- User limits.
- Billing integration.
- Subscription status.

## 11.2 Direct Implementation
- Customer onboarding.
- Custom branding.
- Configuration.
- Self-hosted deployment.
- Integration services.
- Maintenance and support.

## 11.3 Customization

The platform must allow configurable:
- Branding.
- Business settings.
- Outlet settings.
- Menu and pricing.
- Roles and permissions.
- Operational workflows.
- Enabled modules.
- Payment integrations.

Customization must not require unsafe modifications to the shared core.

Pricing and packaging remain separate commercial decisions.

---

# 12. RELEASE SCOPE AND DELIVERY STRATEGY

## 12.1 First Release — Complete Integrated Platform

The first commercial release includes all product modules defined in this PRD:

1. Headquarters.
2. POS.
3. Offline POS and synchronization.
4. Kitchen Display System.
5. Bar Display System.
6. Inventory.
7. Procurement.
8. Reservation Management.
9. Finance.
10. Staff and HR.
11. CRM and Loyalty.
12. Website.
13. QR Ordering.
14. Online Ordering.
15. Payment Integrations.
16. Hardware Integrations.
17. Cloud Deployment.
18. Self-hosted Deployment.
19. Tenant and Outlet Management.
20. Authentication and Authorization.

No major module may be silently removed from the first-release scope.

## 12.2 Implementation Sequencing

The complete product will be delivered through controlled engineering phases:

### Phase 0 — Product and Source Audit
- Audit V1.
- Audit V2.
- Audit V3.
- Repository reconciliation.
- Identify reusable implementations.
- Record technical risks.

### Phase 1 — Architecture and Platform Foundation
- System architecture.
- Domain boundaries.
- Database design.
- Authentication.
- RBAC.
- Tenant and outlet isolation.
- Design system.
- API contracts.
- Deployment foundation.

### Phase 2 — Core Operational Engine
- Menu.
- Orders.
- Payments.
- POS.
- Offline persistence.
- Synchronization.
- KDS.
- Hardware integration.

### Phase 3 — Business Management
- HQ.
- Inventory.
- Procurement.
- Finance.
- Reservations.
- Staff and HR.

### Phase 4 — Customer Ecosystem
- Website.
- QR ordering.
- Online ordering.
- CRM.
- Loyalty.
- Promotions.

### Phase 5 — Deployment and Commercialization
- Cloud deployment.
- Self-hosted deployment.
- Subscription and entitlements.
- Onboarding.
- Monitoring.
- Backup and recovery.

### Phase 6 — Production Validation
- Full regression testing.
- E2E workflows.
- Security testing.
- Offline failure testing.
- Load testing.
- Hardware compatibility.
- Disaster recovery.
- Pilot deployment.

These are implementation phases, not separate product releases. The first commercial release must satisfy the approved complete scope.

---

# 13. QUALITY GATES AND DEFINITION OF DONE

Every feature must pass five verification levels.

## L1 — UI Complete
- Design implementation.
- Responsive behavior.
- Accessibility.
- UI state coverage.

## L2 — Logic Complete
- Business rules.
- Input validation.
- Authorization behavior.
- Error handling.

## L3 — Persistence Complete
- Database persistence.
- Data integrity.
- Transaction safety.
- Migration verification.

## L4 — Integration Complete
- Cross-module workflows.
- Event handling.
- API contracts.
- External integrations.

## L5 — Verified
- Unit tests.
- Integration tests.
- E2E tests where applicable.
- Security tests.
- Performance tests.
- Operational acceptance.

A feature must not be marked complete based on a rendered screen or a successful development-server startup alone.

---

# 14. CONSOLIDATION POLICY — V1, V2, V3

HANSAN Unified will use a hybrid consolidation strategy.

The three existing versions are sources of implementation evidence, not automatic architectural authorities.

Every candidate implementation must be classified as:

- KEEP: Proven implementation suitable for reuse.
- IMPROVE: Valuable foundation requiring targeted refinement.
- REBUILD: Implementation unsuitable for the required product architecture.
- REPLACE: Better implementation exists elsewhere.
- DEFER: Valid functionality not required for the current engineering phase.
- DROP: Functionality that provides insufficient value or conflicts with product direction.

Selection criteria:
1. Correctness.
2. Security.
3. Maintainability.
4. Testability.
5. Data integrity.
6. Scalability.
7. UX quality.
8. Deployment compatibility.
9. Offline compatibility.
10. Long-term commercial value.

No source code should be consolidated before the corresponding audit and compatibility assessment.

---

# 15. RISK REGISTER

The following risks require explicit engineering treatment.

| Risk | Required Mitigation |
|---|---|
| Offline data conflicts | Versioning and conflict policies |
| Duplicate transactions | Idempotency and transaction controls |
| Tenant data leakage | Server-side isolation and security tests |
| Payment uncertainty | Explicit payment states and reconciliation |
| Self-hosted drift | Deployment parity and upgrade tests |
| Realtime event loss | Durable event delivery and recovery |
| Inventory inconsistency | Atomic stock movement operations |
| Printer incompatibility | Hardware certification matrix |
| Excessive first-release scope | Phased implementation with complete release gate |
| Legacy implementation defects | Audit and selective consolidation |
| Biometric privacy | Consent, protection, retention, and access controls |
| Cross-module inconsistency | Shared domain rules and integration tests |

---

# 16. PRODUCT SUCCESS METRICS

Product success must be measured through operational and commercial metrics.

Initial metrics:
- Transaction completion success rate.
- Duplicate transaction rate.
- Offline synchronization success rate.
- Payment reconciliation accuracy.
- Inventory accuracy.
- KDS order delivery reliability.
- System availability.
- Critical error rate.
- Average transaction processing time.
- Outlet onboarding time.
- Customer retention.
- Subscription growth.
- Support incident rate.

Numerical targets must be established after baseline measurements and pilot testing.

---

# 17. OPEN ARCHITECTURE DECISIONS

The following decisions remain outside the locked product requirements and must be resolved in architecture design.

1. Final frontend and backend technology stack.
2. ORM and database access strategy.
3. Authentication provider.
4. Local offline database technology.
5. Synchronization protocol.
6. Conflict resolution implementation.
7. Realtime transport.
8. Cloud infrastructure provider.
9. Self-hosted packaging strategy.
10. Payment provider integrations.
11. Printer and peripheral compatibility.
12. Observability stack.
13. Backup and disaster recovery implementation.
14. Mobile application strategy.
15. Data retention and privacy policies.

These decisions must be documented in Architecture Decision Records (ADRs).

---

# 18. GOVERNANCE AND CHANGE CONTROL

This PRD is the product-level source of truth.

Development agents must:
- Follow approved requirements.
- Preserve the defined product scope.
- Report discrepancies.
- Avoid inventing completed functionality.
- Avoid silently removing features.
- Document architectural changes.
- Maintain traceability between requirements, implementation, and tests.

Cline and OpenCode may independently evaluate and recommend implementation approaches.

Neither agent may change approved product requirements without explicit product owner approval.

Git operations, deployment, production database operations, and other destructive actions remain subject to explicit authorization.

---

# 19. FINAL PRODUCT ACCEPTANCE

HANSAN Unified is eligible for its first commercial release only when:

1. All approved product modules are implemented.
2. Core business workflows operate end-to-end.
3. Offline POS operations are validated.
4. Synchronization and recovery are validated.
5. Cloud deployment is verified.
6. Self-hosted deployment is verified.
7. Multi-tenant and multi-outlet isolation passes security tests.
8. Payment and financial reconciliation is verified.
9. Inventory and procurement consistency is verified.
10. Website and POS share consistent business rules.
11. KDS and operational workflows are reliable.
12. Required hardware integrations pass compatibility tests.
13. Backup and restore are tested.
14. Regression and E2E suites pass.
15. Production monitoring and incident handling are available.
16. Documentation and customer onboarding are complete.

---

# 20. FINAL PRODUCT STATEMENT

HANSAN Unified is a complete F&B operating platform for businesses of different sizes.

It combines:
- Centralized business management.
- Point-of-sale operations.
- Offline-capable transactions.
- Kitchen and bar operations.
- Inventory and procurement.
- Finance management.
- Staff and HR.
- Reservations.
- Customer relationship management.
- Loyalty and promotions.
- Integrated website and online ordering.
- Cloud and self-hosted deployment.

The product will consolidate the strongest proven capabilities of HANSAN V1, V2, and V3 while rebuilding or improving components that do not meet the required quality standards.

The PRD defines what HANSAN Unified must become.

The architecture documents will define how it is built.

The test evidence will determine whether it is ready to sell.

**END OF PRD — VERSION 1.0**