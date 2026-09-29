---
name: curator-google-auth
description: >-
  Configure and implement Google OAuth 2.0 authentication and JWT authorization across Curator
  modules and MiniApps, with role and console gating, Curator database user integration, and
  unrestricted public domain access.
---

# Curator Google Authentication & Authorization Skill

This skill provides step-by-step guidance, recipes, and conventions for configuring **Google OAuth 2.0 Authentication** across the Curator ecosystem (Curator core `server` + `frontend` as well as standalone **Curator MiniApps** like `keeris`).

---

## 1. Architecture Overview

Curator uses a secure, decoupled authentication architecture designed for single-page applications (SPAs) and GraphQL backends:

```text
[ Browser / Vue 3 App ]
       │
       │ 1. Click "Sign in with Google"
       ▼
[ Node Express Server ]  ──(Redirect + state)──►  [ Google OAuth 2.0 ]
       │                                                 │
       │ 2. Callback with auth code                       │ 3. User consents
       ◄─────────────────────────────────────────────────┘
       │
       ├─► 4. Upsert User in Curator DB (Prisma User model)
       ├─► 5. Issue signed JWT ({ sub: user.id, email, name }, 7-day expiry)
       └─► 6. Redirect back to frontend (?token=<jwt>)
       
[ Browser / Vue 3 App ]
       │
       ├─► 7. useAuth.ts captures ?token=, saves to localStorage, cleans URL
       ├─► 8. Client adapter injects 'Authorization: Bearer <token>' on API requests
       └─► 9. UI unlocks privileged features (e.g. Curator Dev Console)
```

### Core Tenets
1. **Public by Default**: Domain data (search, tracks, episodes, playlists) is **always public** and requires no credentials.
2. **Curator Database as Source of Truth**: User accounts and credentials reside in the **Curator Orchestration Database** (`curatorRuntime.prisma.user`), so agent requests, scripts, and logs link cleanly to a valid `User.id`.
3. **No Auth in WASM Mode**: When running pure browser-native WASM with OPFS, authentication is bypassed since execution is local and offline.
4. **Stateless JWTs with Optional Session Tracking**: The JWT contains essential claims (`sub`, `email`, `name`) verified with a shared `JWT_SECRET`.

---

## 2. Google Cloud Console Setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services** > **OAuth consent screen**:
   - User Type: **External** (or Internal for Google Workspace domains).
   - Scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
3. Navigate to **APIs & Services** > **Credentials**:
   - Click **Create Credentials** > **OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins**:
     - Local dev: `http://localhost:3000`, `http://localhost:3001`, `http://localhost:4000`, `http://localhost:4001`
     - Production: `https://yourdomain.com`
   - **Authorized redirect URIs**:
     - Local dev: `http://localhost:4001/auth/google/callback` (or `http://localhost:4000/auth/google/callback`)
     - Production: `https://yourdomain.com/auth/google/callback`
4. Copy the generated **Client ID** and **Client Secret**.

---

## 3. Environment Variables

Add the following to `.env` (and `.env.production`):

```bash
# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:4001/auth/google/callback"

# JWT Secret & Target Frontend
JWT_SECRET="generate-a-secure-random-string-at-least-32-chars"
FRONTEND_URL="http://localhost:3001"
VITE_SERVER_URL="http://localhost:4001"
VITE_API_URL="http://localhost:4001/graphql"
```

---

## 4. Server-Side Implementation Recipe

### 4.1 Canonical Curator Database RBAC Schema
Curator defines a canonical, relational RBAC model in PostgreSQL (`server/prisma/schema/actor.prisma`), mirrored in MariaDB and SQLite:

```prisma
model User {
  id        String      @id @default(cuid())
  email     String      @unique
  name      String?
  googleId  String?     @unique
  roles     UserRole[]
  agents    Agent[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  requests  Request[]
}

model Role {
  id          String            @id @default(cuid())
  name        String            @unique
  description String?           @db.Text
  users       UserRole[]
  parentRoles RoleInheritance[] @relation("SubRole")
  subRoles    RoleInheritance[] @relation("ParentRole")
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
}

model RoleInheritance {
  parentId  String
  parent    Role   @relation("ParentRole", fields: [parentId], references: [id], onDelete: Cascade)
  subRoleId String
  subRole   Role   @relation("SubRole", fields: [subRoleId], references: [id], onDelete: Cascade)

  @@id([parentId, subRoleId])
}

model UserRole {
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  roleId    String
  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  deletedAt DateTime?
  @@id([userId, roleId])
}
```

### 4.2 Centralized Curator Core Authorization Plugin (`@curator/plugin-auth`)
Rather than reinventing passport routes and role queries inside each MiniApp, use the official Curator Core package `@curator/plugin-auth`:

```typescript
import type { Express } from 'express';
import {
  curatorAuthPlugin,
  AuthorizationEngine,
  CURATOR_ROLES,
  wrapResolversWithAuth,
  type CuratorAuthUser,
} from '@curator/plugin-auth';

// 1. Initialize plugin
export const authPlugin = curatorAuthPlugin({
  jwtSecret: process.env.JWT_SECRET,
  defaultManagers: ['joel.arula@gmail.com'],
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
  frontendUrl: process.env.FRONTEND_URL,
});

export const authEngine = authPlugin.engine;

// 2. Mount auth routes on Express (/auth/google, /auth/google/callback, /auth/me, /auth/logout)
export function setupAuth(app: Express, getPrisma: () => any): void {
  const plugin = curatorAuthPlugin({ ..., getPrisma });
  plugin.setupAuth(app);
}

// 3. Resolve user and roles from incoming Bearer token
export async function getUserFromToken(token: string, prisma?: any): Promise<CuratorAuthUser | null> {
  return authPlugin.getUserFromToken(token, prisma);
}
```

### 4.3 GraphQL Schema-Level Guard Directives
Declare authorization requirements directly on queries and mutations using directive annotations:

```graphql
# Directive declarations (provided in @curator/plugin-auth AUTH_DIRECTIVES_SDL)
directive @auth(role: String, roles: [String!]) on FIELD_DEFINITION
directive @requireRole(role: String!) on FIELD_DEFINITION

type Query {
  # Public queries
  programs: [Program!]!
  tracks(search: String): [Track!]!
  episodes(search: String): [Episode!]!

  # Gated to curator_manager
  curatorDatabaseHealth: CuratorDatabaseHealth! @requireRole(role: "curator_manager")
  curatorAgents: [CuratorAgent!]! @requireRole(role: "curator_manager")
  curatorRequests(limit: Int): [CuratorRequest!]! @requireRole(role: "curator_manager")
}

type Mutation {
  # Gated mutations
  triggerCuratorAgent(name: String!): CuratorResponse! @requireRole(role: "curator_manager")
  toggleCuratorAgent(id: ID!, isActive: Boolean!): CuratorAgent! @requireRole(role: "curator_manager")
}
```

### 4.4 Automated GraphQL Execution Protection
Use `wrapResolversWithAuth` from `@curator/plugin-auth` to automatically enforce directive guards:

```typescript
import { wrapResolversWithAuth } from '@curator/plugin-auth';

export async function executeGraphql(db, source, variables = {}, { curatorRuntime, user } = {}) {
  const rawResolvers = resolvers(db, { curatorRuntime, user });
  // wrapResolversWithAuth inspects schema AST directives and checks user roles automatically
  const rootValue = wrapResolversWithAuth(schema, rawResolvers, user, authEngine);

  return graphql({
    schema,
    source,
    rootValue,
    variableValues: variables,
  });
}
```
```

---

## 5. Frontend Implementation Recipe

### 5.1 Auth Composable (`src/composables/useAuth.ts`)
```typescript
import { ref, computed } from 'vue';
import { getServerBaseUrl } from '@wasm/graphql-client';

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
}

export const user = ref<UserProfile | null>(null);
export const token = ref<string>('');
export const isAuthenticated = computed(() => !!user.value);

export function useAuth() {
  async function initAuth() {
    const url = new URL(window.location.href);
    const queryToken = url.searchParams.get('token');

    if (queryToken) {
      localStorage.setItem('keeris_token', queryToken);
      token.value = queryToken;
      url.searchParams.delete('token');
      window.history.replaceState({}, document.title, url.pathname + url.search);
    } else {
      token.value = localStorage.getItem('keeris_token') || '';
    }

    if (token.value) {
      await fetchUser();
    }
  }

  async function fetchUser(): Promise<UserProfile | null> {
    if (!token.value) {
      user.value = null;
      return null;
    }
    try {
      const res = await fetch(`${getServerBaseUrl()}/auth/me`, {
        headers: { Authorization: `Bearer ${token.value}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          user.value = data.user;
          return data.user;
        }
      }
      logout();
      return null;
    } catch (_) {
      return null;
    }
  }

  function loginWithGoogle() {
    const callback = encodeURIComponent(window.location.origin);
    window.location.href = `${getServerBaseUrl()}/auth/google?callback=${callback}`;
  }

  function logout() {
    localStorage.removeItem('keeris_token');
    token.value = '';
    user.value = null;
  }

  return { user, token, isAuthenticated, initAuth, fetchUser, loginWithGoogle, logout };
}
```

### 5.2 Client Adapter Header Injection (`ServerClientAdapter`)
Ensure all outbound requests include the bearer token:
```typescript
const headers: Record<string, string> = {
  'content-type': 'application/json',
  'accept': 'application/json',
};
if (typeof localStorage !== 'undefined') {
  const token = localStorage.getItem('keeris_token');
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
}
```

### 5.3 UI & Dev Console Gating (`App.vue`)
1. **Curator Console component and pills**:
   ```vue
   <!-- Nav Pill -->
   <button
     v-if="appMode === 'wasm' || isAuthenticated"
     class="console-nav-pill"
     @click="drawerOpen = !drawerOpen"
   >
     {{ $t('app.devConsole') }}
   </button>

   <!-- Component -->
   <CuratorConsole
     v-if="appMode === 'wasm' || isAuthenticated"
     v-model="drawerOpen"
     :adapter="adapter"
   />
   ```

2. **Keyboard shortcut (`Ctrl + \``)**:
   ```typescript
   function handleKeyDown(e: KeyboardEvent) {
     if ((e.ctrlKey || e.metaKey) && e.key === '`') {
       e.preventDefault();
       if (appMode.value === 'wasm' || isAuthenticated.value) {
         drawerOpen.value = !drawerOpen.value;
       }
     }
   }
   ```

3. **Sign In & User Avatar Controls**:
   ```vue
   <template v-if="appMode === 'server'">
     <button v-if="!isAuthenticated" @click="loginWithGoogle" class="auth-sign-in-btn">
       <v-icon start>mdi-google</v-icon> Sign In
     </button>
     <div v-else class="auth-user-badge">
       <span>{{ user?.name || user?.email }}</span>
       <button @click="logout" title="Logout"><v-icon size="small">mdi-logout</v-icon></button>
     </div>
   </template>
   ```

---

## 6. Verification Checklist

- [ ] Unauthenticated visitor can search, filter, and view playlists without prompts.
- [ ] Curator Console nav button and `Ctrl + \`` shortcut are hidden/disabled when logged out in server mode.
- [ ] In WASM mode, console remains accessible without requiring external Google OAuth.
- [ ] Clicking "Sign In with Google" redirects to Google consent with correct origin callback.
- [ ] Returning from Google sets the JWT in `localStorage` and smoothly cleans `?token=` from the browser URL.
- [ ] Curator Console becomes accessible and displays live agent execution upon login.
- [ ] Clicking Logout clears tokens and immediately hides the Dev Console.
