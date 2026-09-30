# Stage 1 data model

```mermaid
erDiagram
  OUTLETS ||--o{ USERS : "assigned store managers"
  USERS ||--o{ SESSIONS : "opens"
  OUTLETS { text id PK
    text brand
    text district
    depot depot
    text parking_constraint
    text window_open_time
    text window_close_time }
  VEHICLES { text id PK
    depot depot
    text type
    text temp
    numeric weight_cap_kg
    numeric volume_cap_m3 }
  USERS { uuid id PK
    text email UK
    text password_hash
    user_role role
    depot depot
    text outlet_id FK }
  SESSIONS { uuid id PK
    uuid user_id FK
    timestamp expires_at
    timestamp revoked_at }
```

`outlets` and `vehicles` preserve supplied IDs such as `OUT001` and `VEH053`. `users.email` is unique without case sensitivity. A store manager's outlet is a foreign key. Vehicle assignment is not a user attribute: later stages will associate drivers, vehicles, and trips with a dated plan. Session rows give logout immediate revocation.

Future order records must retain scenario/date and source order reference together; future trip uniqueness must include plan/date, vehicle, and trip number. This avoids blocking use of the same fleet on subsequent operating days.
